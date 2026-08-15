// 房间传输层(§M5)。同步策略:整局 GameState 作权威单行 jsonb,回合制 → 只有行动方推送。
// rev 单调递增,客户端忽略 rev ≤ 本地 已应用 的更新(去回声)。引擎确定性,无需重放。
import type { GameState } from '../engine/types.ts';
import { getClient } from './supabase.ts';

const TABLE = 'games';

export interface RoomSnapshot {
  rev: number;
  state: GameState;
}

// 建房:写入初始 state(rev 0)。code 已存在则覆盖(重开同码)。
export async function createRoom(code: string, state: GameState): Promise<void> {
  const { error } = await getClient().from(TABLE).upsert({ id: code, rev: 0, state });
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
  const { data, error } = await getClient().from(TABLE).select('rev, state').eq('id', code).maybeSingle();
  if (error) throw new Error(`fetch room failed: ${error.message}`);
  if (!data) return null;
  return { rev: Number(data.rev), state: data.state as GameState };
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
        const row = payload.new as { rev: number | string; state: GameState };
        onChange({ rev: Number(row.rev), state: row.state });
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onSubscribed?.();
    });
  return () => {
    getClient().removeChannel(channel);
  };
}
