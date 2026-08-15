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
      return state.interrupts?.[0]?.side ?? null; // 中断窗口:队首一方行动
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
// 持有超能力(≥1),且在可打出的窗口(中断队首 / 本方 trick 窗口)→ 可打出。
export function canPlaySuperpowerNow(state: GameState, side: Side): boolean {
  return castableSuperpowers(state, side).length > 0;
}

// 本方当前持有的所有待用超能力(可叠多张)。
export function readySuperpowers(state: GameState, side: Side): Superpower[] {
  return state[side].hero.readySuperpowers.map(getSuperpower);
}

// 中断窗口内“本回合刚授予、可免费即时打出”的那张 SP id(pick 未选定 → null);非中断窗口返回 null。
export function interruptSuperpowerId(state: GameState, side: Side): string | null {
  if (state.phase !== 'SUPERPOWER_INTERRUPT') return null;
  const head = state.interrupts?.[0];
  return head?.side === side ? head.spId ?? null : null;
}

// 此刻实际可即时打出的 SP:中断窗口仅限本回合刚授予那张(免费);trick 窗口=全部持有(1 费);其余=空。
// 旧超能力在战斗中断中不可打(留到本方 trick 窗口)。与 reduce.playSuperpower 校验一致。
export function castableSuperpowers(state: GameState, side: Side): Superpower[] {
  if (state.phase === 'SUPERPOWER_INTERRUPT') {
    const freeId = interruptSuperpowerId(state, side);
    return freeId ? [getSuperpower(freeId)] : [];
  }
  const inTrickWindow =
    (side === 'plant' && state.phase === 'PLANT_PLAY') || (side === 'zombie' && state.phase === 'ZOMBIE_TRICKS');
  return inTrickWindow ? readySuperpowers(state, side) : [];
}

// 打出一张超能力的花费:中断窗口内免费,否则当作 trick 花 superpowerHandCost(默认 1)。
export function superpowerCost(state: GameState, side: Side): number {
  if (state.phase === 'SUPERPOWER_INTERRUPT' && state.interrupts?.[0]?.side === side) return 0;
  return state.config.superpowerHandCost ?? 1;
}

// 单张超能力的花费:中断窗口内只有“本回合刚授予”那张免费,其余(旧超能力)仍是 1 费。
// SP 作为手牌逐张显示时用此(每张 cost 角标可不同)。
export function superpowerCostFor(state: GameState, side: Side, spId: string): number {
  if (interruptSuperpowerId(state, side) === spId) return 0;
  return state.config.superpowerHandCost ?? 1;
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
