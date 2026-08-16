// 派生只读查询:UI 用来高亮合法落子/目标。
// 规则本体在 legality.ts(reduce 校验也从那里取)——本文件只做面向 UI 的薄封装,不再各写一份镜像。
import type { Card, GameState, Side, Superpower } from './types.ts';
import { getCard, getSuperpower } from './cardpool.ts';
import {
  canPlayFighter,
  canPlayTrick,
  castableSuperpowerIds,
  enumerateTargets,
  phaseOwner,
  superpowerCostFor as spCostFor,
  superpowerWindow,
  type Target,
} from './legality.ts';

// 当前可行动方(phase 归属)。FIGHT / GAME_OVER 返回 null;中断窗口 = 队首一方。
export function activeSide(state: GameState): Side | null {
  if (state.phase === 'SUPERPOWER_INTERRUPT') return state.interrupts?.[0]?.side ?? null;
  return phaseOwner(state.phase);
}

export function canPlayFighterNow(state: GameState, side: Side): boolean {
  return canPlayFighter(state, side);
}

export function canPlayTrickNow(state: GameState, side: Side): boolean {
  return canPlayTrick(state, side);
}

// 某张手牌此刻能否打出(按牌型分派)。UI 高亮/可点用,与 reduce 校验一致。
export function canPlayCardNow(state: GameState, side: Side, card: Card): boolean {
  return card.type === 'fighter' ? canPlayFighterNow(state, side) : canPlayTrickNow(state, side);
}

export function emptyLanes(state: GameState, side: Side): number[] {
  const out: number[] = [];
  state.lanes.forEach((ln, i) => {
    if (!ln[side]) out.push(i);
  });
  return out;
}

export function canAfford(state: GameState, side: Side, card: Card): boolean {
  return card.cost <= state[side].resource;
}

// trick 合法目标(与 reduce validateTarget 同源)。'none' 返回 []。
export function trickTargets(state: GameState, side: Side, card: Card): Target[] {
  return enumerateTargets(state, side, card.targeting ?? 'none');
}

// —— 超能力(§8)——
// 持有超能力,且在可打出的窗口(中断队首 / 本方 trick 窗口)→ 可打出。
export function canPlaySuperpowerNow(state: GameState, side: Side): boolean {
  return castableSuperpowerIds(state, side).length > 0;
}

// 本方当前持有的所有待用超能力(可叠多张)。
export function readySuperpowers(state: GameState, side: Side): Superpower[] {
  return state[side].hero.readySuperpowers.map(getSuperpower);
}

// 中断窗口内“本回合刚授予、可免费即时打出”的那张 SP id(pick 未选定 / 非中断窗口 → null)。
export function interruptSuperpowerId(state: GameState, side: Side): string | null {
  const w = superpowerWindow(state, side);
  return w.kind === 'interrupt' ? w.freeId ?? null : null;
}

// 此刻实际可即时打出的 SP:中断窗口仅限本回合刚授予那张(免费);trick 窗口=全部持有(1 费);其余=空。
export function castableSuperpowers(state: GameState, side: Side): Superpower[] {
  return castableSuperpowerIds(state, side).map(getSuperpower);
}

// 打出一张超能力的花费:中断窗口内免费,否则当作 trick 花 superpowerHandCost(默认 1)。
export function superpowerCost(state: GameState, side: Side): number {
  return superpowerWindow(state, side).kind === 'interrupt' ? 0 : state.config.superpowerHandCost ?? 1;
}

// 单张超能力的花费:中断窗口内只有“本回合刚授予”那张免费,其余(旧超能力)仍是 1 费。
export function superpowerCostFor(state: GameState, side: Side, spId: string): number {
  return spCostFor(state, side, spId);
}

export function offeredSuperpowers(state: GameState, side: Side): Superpower[] {
  return (state[side].hero.superpowerOfferedIds ?? []).map(getSuperpower);
}

// 超能力的合法目标(与 reduce validateTarget 同源)。none 返回 []。
export function superpowerTargets(state: GameState, side: Side, sp: Superpower): Target[] {
  return enumerateTargets(state, side, sp.targeting, { minAttack: sp.minAttack });
}

export function cardOf(cardId: string): Card {
  return getCard(cardId);
}
