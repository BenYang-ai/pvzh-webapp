// 家庭访问门(gate)。公开链接需先输入口令才能进入。
// 说明:这是「遮挡」而非真正的安全——口令会打进前端 bundle,任何读代码的人都能拿到。
// 对家庭小游戏足够:挡住偶然点进来的陌生人即可。真正的鉴权需服务端(见 Supabase RLS)。
import type { Side } from '../engine/types.ts';

// 归一化:去首尾空格、折叠中间空白、转小写。让「Summit  Close」「 summit close 」都算通过。
export function normalizeSecret(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

// 口令:默认 "summit close",可用 VITE_ROOM_SECRET 覆盖(仍是公开值)。
export const ROOM_SECRET = normalizeSecret(import.meta.env.VITE_ROOM_SECRET || 'summit close');

// 口令是否正确。
export function checkSecret(input: string): boolean {
  return normalizeSecret(input) === ROOM_SECRET;
}

// 口令 slug 化后作为 Supabase 房间 id(单一固定房间:知道口令的人进同一局)。
export function roomIdFromSecret(secret: string): string {
  return normalizeSecret(secret).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'room';
}

// 家庭房间 id:口令唯一 → 房间唯一,无需房号。
export const FAMILY_ROOM = roomIdFromSecret(ROOM_SECRET);

// —— 记住本设备在某房间选的执方(刷新后不被翻面:host 刷新仍是 host)——
function seatKey(room: string): string {
  return `pvzh.seat.${room}`;
}

export function savedSeat(room: string): Side | null {
  try {
    const v = localStorage.getItem(seatKey(room));
    return v === 'plant' || v === 'zombie' ? v : null;
  } catch {
    return null;
  }
}

export function saveSeat(room: string, side: Side): void {
  try {
    localStorage.setItem(seatKey(room), side);
  } catch {
    /* ignore */
  }
}

// —— 玩家名字(显示用,引擎不认)——
export const PLAYER_NAMES = ['Ben', 'Miles', 'Leo'] as const;

function nameKey(room: string): string {
  return `pvzh.name.${room}`;
}

export function savedName(room: string): string | null {
  try {
    return localStorage.getItem(nameKey(room));
  } catch {
    return null;
  }
}

export function saveName(room: string, name: string): void {
  try {
    localStorage.setItem(nameKey(room), name);
  } catch {
    /* ignore */
  }
}

// —— 通过状态记住(localStorage),同一设备只需输入一次 ——
const KEY = 'pvzh.access';

export function hasAccess(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false; // SSR / 隐私模式无 localStorage → 视作未通过
  }
}

export function grantAccess(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* 存不了也无妨,本次会话内 state 仍记住 */
  }
}

export function clearAccess(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

// 便捷:名字 → 选边,给未来大厅用(名字仅显示,side 才是引擎认的)。
export interface Seat {
  name: string;
  side: Side;
}
