// 派生只读查询:UI 用来高亮合法落子/目标。规则与 reduce.ts 校验保持一致。
import type { Card, GameState, Side, Superpower } from './types.ts';
import { getCard, getSuperpower } from './cardpool.ts';
import { hasKeyword } from './deck.ts';
import { otherSide } from './effects.ts';

// 当前可行动方(phase 归属)。FIGHT / GAME_OVER 返回 null。
export function activeSide(state: GameState): Side | null {
  switch (state.phase) {
    case 'ZOMBIE_PLAY':
    case 'ZOMBIE_TRICKS':
      return 'zombie';
    case 'PLANT_PLAY':
      return 'plant';
    case 'SUPERPOWER_INTERRUPT':
      return state.interrupts?.[0] ?? null; // 中断窗口:队首一方行动
    default:
      return null;
  }
}

export function canPlayFighterNow(state: GameState, side: Side): boolean {
  return (
    (side === 'zombie' && state.phase === 'ZOMBIE_PLAY') ||
    (side === 'plant' && state.phase === 'PLANT_PLAY')
  );
}

export function canPlayTrickNow(state: GameState, side: Side): boolean {
  if (side === 'plant') return state.phase === 'PLANT_PLAY';
  return state.phase === 'ZOMBIE_TRICKS';
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

// trick 合法目标(与 validateTrickTarget 同规则)。'none' 返回 []。
export function trickTargets(state: GameState, side: Side, card: Card): Array<{ lane: number; side: Side }> {
  const spec = card.targeting ?? 'none';
  if (spec === 'none') return [];
  const out: Array<{ lane: number; side: Side }> = [];
  const consider = (targetSide: Side) => {
    state.lanes.forEach((ln, i) => {
      const f = ln[targetSide];
      if (!f) return;
      if (f.gravestone) return; // 隐藏,不可指向
      if (hasKeyword(f.keywords, 'untrickable')) return;
      out.push({ lane: i, side: targetSide });
    });
  };
  if (spec === 'friendlyFighter') consider(side);
  else if (spec === 'enemyFighter') consider(otherSide(side));
  else if (spec === 'anyFighter') {
    consider(side);
    consider(otherSide(side));
  }
  return out;
}

export function cardOf(cardId: string): Card {
  return getCard(cardId);
}

// —— 超能力(§8)——
// 本方 play phase 且槽内有 readySuperpower → 可打出。
export function canPlaySuperpowerNow(state: GameState, side: Side): boolean {
  if (!state[side].hero.readySuperpower) return false;
  // 战斗中断窗口:仅队首一方可即时打出。
  if (state.phase === 'SUPERPOWER_INTERRUPT') return state.interrupts?.[0] === side;
  // 僵尸超能力视同 trick:ZOMBIE_TRICKS 打(与 reduce.playSuperpower 一致);植物在 PLANT_PLAY 打。
  return (side === 'plant' && state.phase === 'PLANT_PLAY') || (side === 'zombie' && state.phase === 'ZOMBIE_TRICKS');
}

export function readySuperpower(state: GameState, side: Side): Superpower | null {
  const id = state[side].hero.readySuperpower;
  return id ? getSuperpower(id) : null;
}

export function offeredSuperpowers(state: GameState, side: Side): Superpower[] {
  return (state[side].hero.superpowerOfferedIds ?? []).map(getSuperpower);
}

// 超能力的合法目标(与 validateSuperpowerTarget 同规则)。none/random 返回 []。
export function superpowerTargets(state: GameState, side: Side, sp: Superpower): Array<{ lane: number; side: Side }> {
  const out: Array<{ lane: number; side: Side }> = [];
  const pushFrom = (targetSide: Side, opts?: { minAttack?: number; blockUntrickable?: boolean }) => {
    state.lanes.forEach((ln, i) => {
      const f = ln[targetSide];
      if (!f || f.gravestone) return;
      if (opts?.blockUntrickable && hasKeyword(f.keywords, 'untrickable')) return;
      if (opts?.minAttack !== undefined && f.attack < opts.minAttack) return;
      out.push({ lane: i, side: targetSide });
    });
  };
  switch (sp.targeting) {
    case 'friendlyFighter':
    case 'friendlyFighterThenLane':
      pushFrom(side); // 友方增益不受 untrickable 限制
      break;
    case 'enemyFighter':
      pushFrom(otherSide(side), { minAttack: sp.minAttack, blockUntrickable: true });
      break;
    default:
      break; // none:无目标
  }
  return out;
}
