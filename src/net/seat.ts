// 座位归属的纯逻辑(确定性、可单测)。UI 只渲染这些结果,不自己推断。
// 座位权威在 DB:games 行的 plant_token / zombie_token。null=空位;=本设备 token=本设备占。
import type { Side } from '../engine/types.ts';
import type { PlayerNames, Claims } from './room.ts';

const SIDES: Side[] = ['plant', 'zombie'];

export type { Claims };

// 本设备(token)占了哪一方?都没占 → null。
export function mySeat(claims: Claims, token: string): Side | null {
  for (const s of SIDES) if (claims[s] && claims[s] === token) return s;
  return null;
}

// 空位列表(令牌为空的方)。
export function openSeats(claims: Claims): Side[] {
  return SIDES.filter((s) => !claims[s]);
}

// 满员:两方都被占,且都不是本设备 → 只能「抢座」进入。
export function isFull(claims: Claims, token: string): boolean {
  return mySeat(claims, token) == null && SIDES.every((s) => Boolean(claims[s]));
}

// 重名守卫:某个「别人占的座位」已经用了这个名字 → 本设备不许再选,避免「两个 Ben」。
// 与我将坐哪一方无关(在选边之前也能判);我自己占的座位不算冲突(重连保留原名)。
export function nameBlocked(claims: Claims, names: PlayerNames, token: string, name: string): boolean {
  return SIDES.some((s) => Boolean(claims[s]) && claims[s] !== token && names[s] === name);
}
