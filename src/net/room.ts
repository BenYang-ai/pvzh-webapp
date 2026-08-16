// 房间传输层(§M5)。同步策略:整局 GameState 作权威单行 jsonb,回合制 → 只有行动方推送。
// rev 单调递增,客户端忽略 rev ≤ 本地 已应用 的更新(去回声)。引擎确定性,无需重放。
import type { GameState, Side } from '../engine/types.ts';
import { getClient } from './supabase.ts';

const TABLE = 'games';

// 每方玩家显示名(Ben/Miles/Leo)。引擎不认,仅 UI 显示。
export type PlayerNames = { plant?: string; zombie?: string };

export interface RoomSnapshot {
  rev: number;
  state: GameState;
  names: PlayerNames;
}

function asNames(v: unknown): PlayerNames {
  const o = (v ?? {}) as PlayerNames;
  return { plant: o.plant, zombie: o.zombie };
}

// 每方座位占用令牌(null=空位)。座位权威在 DB(见 seat.ts)。
export type Claims = { plant?: string | null; zombie?: string | null };

export interface RoomMeta {
  exists: boolean;
  hostSide: Side | null;
  names: PlayerNames;
  claims: Claims; // 座位占用(设备 token)
  turn: number; // 当前回合数(0/未开局 → 0)
  winner: Side | 'draw' | null; // 已分胜负 → 非 null
  rev: number; // 当前 rev(大厅重开一局须写 rev+1)
}

// 大厅用:房间是否已存在 + 建房方执方 + 双方名字 + 座位占用 + 进度(turn/winner)。
// 大厅开局是一次性拉取,顺带取整局 state 读 turn/winner 可接受(非热路径)。房间不存在 → exists:false。
export async function fetchRoomMeta(code: string): Promise<RoomMeta> {
  const { data, error } = await getClient()
    .from(TABLE)
    .select('rev, host_side, names, plant_token, zombie_token, state')
    .eq('id', code)
    .maybeSingle();
  if (error) throw new Error(`fetch room meta failed: ${error.message}`);
  if (!data) return { exists: false, hostSide: null, names: {}, claims: {}, turn: 0, winner: null, rev: 0 };
  const row = data as {
    rev: number | string;
    host_side: string | null;
    names: unknown;
    plant_token: string | null;
    zombie_token: string | null;
    state: GameState | null;
  };
  return {
    exists: true,
    hostSide: row.host_side === 'plant' || row.host_side === 'zombie' ? row.host_side : null,
    names: asNames(row.names),
    claims: { plant: row.plant_token, zombie: row.zombie_token },
    turn: row.state?.turn ?? 0,
    winner: row.state?.winner ?? null,
    rev: Number(row.rev),
  };
}

const tokenCol = (side: Side): 'plant_token' | 'zombie_token' => (side === 'plant' ? 'plant_token' : 'zombie_token');

// 认领座位(原子条件更新:仅当该座为空或已是本 token 时才写入)。单条 update → Postgres 行锁,
// 两人抢同一空位只有一人成功。返回是否认领成功(空结果=已被别人占)。顺带 merge 写名字。
export async function claimSeat(code: string, side: Side, token: string, name: string): Promise<boolean> {
  const client = getClient();
  const { data: cur } = await client.from(TABLE).select('names').eq('id', code).maybeSingle();
  const names = asNames((cur as { names?: unknown } | null)?.names);
  names[side] = name;
  const col = tokenCol(side);
  const { data, error } = await client
    .from(TABLE)
    .update({ [col]: token, names })
    .eq('id', code)
    .or(`${col}.is.null,${col}.eq.${token}`)
    .select('id');
  if (error) throw new Error(`claim seat failed: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

// 抢座(无条件覆盖令牌+名字)。仅在用户显式确认后调用(把原占座人挤下线)。
export async function takeoverSeat(code: string, side: Side, token: string, name: string): Promise<void> {
  const client = getClient();
  const { data: cur } = await client.from(TABLE).select('names').eq('id', code).maybeSingle();
  const names = asNames((cur as { names?: unknown } | null)?.names);
  names[side] = name;
  const { error } = await client
    .from(TABLE)
    .update({ [tokenCol(side)]: token, names })
    .eq('id', code);
  if (error) throw new Error(`takeover seat failed: ${error.message}`);
}

// 重开一局的座位重置(改边开新局用):清空两方,只把本设备占到 mySide,名字只留本方。
// 与 createRoom(写 state/rev)配对:先 createRoom(fresh, mySide, rev+1) 再 resetSeats。
// 对端旧令牌被清 → 其大厅显示未入座,重开后自行加入另一方(避免改边后「一人占两座」)。
export async function resetSeats(code: string, mySide: Side, token: string, name: string): Promise<void> {
  const cols =
    mySide === 'plant' ? { plant_token: token, zombie_token: null } : { plant_token: null, zombie_token: token };
  const names: PlayerNames = { [mySide]: name };
  const { error } = await getClient()
    .from(TABLE)
    .update({ ...cols, names })
    .eq('id', code);
  if (error) throw new Error(`reset seats failed: ${error.message}`);
}

// 释放座位(离开时清本设备令牌,仅当该座确是本 token)。让位空出供他人加入。
export async function releaseSeat(code: string, side: Side, token: string): Promise<void> {
  const col = tokenCol(side);
  const { error } = await getClient()
    .from(TABLE)
    .update({ [col]: null })
    .eq('id', code)
    .eq(col, token);
  if (error) throw new Error(`release seat failed: ${error.message}`);
}

// 认领本方名字(merge 写入 names jsonb)。fetch→merge→update:家庭场景并发极低,够用。
export async function setPlayerName(code: string, side: Side, name: string): Promise<void> {
  const client = getClient();
  const { data } = await client.from(TABLE).select('names').eq('id', code).maybeSingle();
  const names = asNames((data as { names?: unknown } | null)?.names);
  names[side] = name;
  const { error } = await client.from(TABLE).update({ names }).eq('id', code);
  if (error) throw new Error(`set name failed: ${error.message}`);
}

// 建房 / 重开:写入初始 state + 建房方执方。code 已存在则覆盖(保留席位与名字)。
// rev 默认 0(全新房间);在已有房间上重开一局须传 currentRev+1,否则对端 rev>local 守卫会忽略这次重置。
// 注意:names / *_token 不在 payload 里 —— PostgREST merge-upsert 不动缺省列 → 保留旧值(重开保名字/座位)。
export async function createRoom(code: string, state: GameState, hostSide: Side, rev = 0): Promise<void> {
  const { error } = await getClient().from(TABLE).upsert({ id: code, rev, state, host_side: hostSide });
  if (error) throw new Error(`create room failed: ${error.message}`);
}

// 轻量:只取 rev(8 字节),用于 poll 对账——rev 没涨就不拉整局 state,近零流量。
export async function fetchRev(code: string): Promise<number | null> {
  const { data, error } = await getClient().from(TABLE).select('rev').eq('id', code).maybeSingle();
  if (error) throw new Error(`fetch rev failed: ${error.message}`);
  if (!data) return null;
  return Number(data.rev);
}

// 拉取当前快照。房间不存在 → null。
export async function fetchRoom(code: string): Promise<RoomSnapshot | null> {
  const { data, error } = await getClient().from(TABLE).select('rev, state, names').eq('id', code).maybeSingle();
  if (error) throw new Error(`fetch room failed: ${error.message}`);
  if (!data) return null;
  return { rev: Number(data.rev), state: data.state as GameState, names: asNames((data as { names: unknown }).names) };
}

// 推送新状态(乐观并发:仅当服务端 rev < newRev 时写入,避免慢包覆盖新局面)。
export async function pushState(code: string, newRev: number, state: GameState): Promise<void> {
  const { error } = await getClient()
    .from(TABLE)
    .update({ rev: newRev, state, updated_at: new Date().toISOString() })
    .eq('id', code)
    .lt('rev', newRev);
  if (error) throw new Error(`push failed: ${error.message}`);
}

// 订阅房间行更新。onChange=收到实时 UPDATE;onSubscribed=(重)订阅成功时触发,
// 供调用方在重连后主动对账(实时是尽力而为、无补发,断线期间漏掉的事件靠对账补回)。返回退订函数。
export function subscribeRoom(
  code: string,
  onChange: (snap: RoomSnapshot) => void,
  onSubscribed?: () => void,
): () => void {
  const channel = getClient()
    .channel(`room:${code}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: TABLE, filter: `id=eq.${code}` },
      (payload) => {
        const row = payload.new as { rev: number | string; state: GameState; names?: unknown };
        onChange({ rev: Number(row.rev), state: row.state, names: asNames(row.names) });
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onSubscribed?.();
    });
  return () => {
    getClient().removeChannel(channel);
  };
}
