import type { Effect, Fighter, GameState, Side, TargetRef } from './types.ts';
import { getCard } from './cardpool.ts';
import { hasKeyword } from './deck.ts';
import { nextInt } from './rng.ts';

// —— 场上查找 / 移除 ——
export function fighterAt(state: GameState, lane: number, side: Side): Fighter | null {
  return state.lanes[lane][side];
}

export function otherSide(side: Side): Side {
  return side === 'plant' ? 'zombie' : 'plant';
}

export function player(state: GameState, side: Side) {
  return side === 'plant' ? state.plant : state.zombie;
}

// 从场上移除 fighter,触发 onDeath(v1 卡池暂无,预留 hook)。
export function removeFighter(state: GameState, lane: number, side: Side): void {
  const f = state.lanes[lane][side];
  if (!f) return;
  state.lanes[lane][side] = null;
  const card = getCard(f.cardId);
  if (card.onDeath) applyEffects(state, card.onDeath, { caster: side, self: f });
}

// 直接摧毁(destroy ≠ damage:无视 cantBeHurt)。
export function destroyFighter(state: GameState, lane: number, side: Side): void {
  removeFighter(state, lane, side);
}

// 非战斗伤害(trick/superpower)。cantBeHurt → 0;armored 不减免非战斗伤害(§6)。
export function applyNonCombatDamage(state: GameState, lane: number, side: Side, amount: number): void {
  const f = state.lanes[lane][side];
  if (!f) return;
  if (f.cantBeHurt) return;
  f.health -= amount;
  if (f.health <= 0) removeFighter(state, lane, side);
}

// —— 抽牌 ——(牌库空则和局,fatigue 已移除)
export function drawCards(state: GameState, side: Side, count: number): void {
  const p = player(state, side);
  for (let i = 0; i < count; i++) {
    const card = p.deck.shift();
    if (!card) {
      state.phase = 'GAME_OVER';
      state.winner = 'draw';
      state.log.push(`${side} deck empty on forced draw → tie`);
      return;
    }
    p.hand.push(card);
  }
}

// —— 目标解析 —— ctx.chosen = 玩家选中的 {lane,side}
interface EffectCtx {
  caster: Side;
  chosen?: { lane: number; side: Side };
  self?: Fighter;
}

function findFighterPosition(state: GameState, fighter: Fighter): { lane: number; side: Side } | null {
  for (let l = 0; l < state.lanes.length; l++) {
    if (state.lanes[l].plant === fighter) return { lane: l, side: 'plant' };
    if (state.lanes[l].zombie === fighter) return { lane: l, side: 'zombie' };
  }
  return null;
}

function resolveTarget(
  state: GameState,
  ref: TargetRef,
  ctx: EffectCtx,
): { lane: number; side: Side } | null {
  if (ref === 'chosen') return ctx.chosen ?? null;
  if (ref === 'fixedLane2') return { lane: 2, side: otherSide(ctx.caster) };
  if (ref === 'self') return ctx.self ? findFighterPosition(state, ctx.self) : null; // 打出者自身(ETB)
  if (ref === 'random') {
    const targets: Array<{ lane: number; side: Side }> = [];
    const enemy = otherSide(ctx.caster);
    state.lanes.forEach((ln, i) => {
      const f = ln[enemy];
      if (f && !f.gravestone) targets.push({ lane: i, side: enemy }); // gravestone 未翻面不可指向(§7)
    });
    if (targets.length === 0) return null;
    const [rng, idx] = nextInt(state.rng, 0, targets.length - 1);
    state.rng = rng;
    return targets[idx];
  }
  return ref; // 字面 {lane, side}
}

// —— effect 执行 ——
export function applyEffect(state: GameState, e: Effect, ctx: EffectCtx): void {
  switch (e.kind) {
    case 'damage': {
      const t = resolveTarget(state, e.target, ctx);
      if (t) applyNonCombatDamage(state, t.lane, t.side, e.amount);
      return;
    }
    case 'buff': {
      const t = resolveTarget(state, e.target, ctx);
      if (!t) return;
      const f = state.lanes[t.lane][t.side];
      if (!f) return;
      f.attack = Math.max(0, f.attack + e.attack);
      f.health += e.health;
      return;
    }
    case 'draw': {
      drawCards(state, ctx.caster, e.count);
      return;
    }
    case 'rampResource': {
      player(state, ctx.caster).bonusResourceNextTurn += e.amount;
      return;
    }
    case 'destroyIf': {
      const t = resolveTarget(state, e.target, ctx);
      if (!t) return;
      const f = state.lanes[t.lane][t.side];
      if (!f) return;
      const stat = e.stat === 'attack' ? f.attack : f.health;
      const ok = e.op === '>=' ? stat >= e.value : stat <= e.value;
      if (ok) destroyFighter(state, t.lane, t.side);
      return;
    }
    case 'bounce': {
      const t = resolveTarget(state, e.target, ctx);
      if (!t) return;
      const f = state.lanes[t.lane][t.side];
      if (!f) return;
      state.lanes[t.lane][t.side] = null;
      // 回手牌:清临时 buff/标记,恢复印刷值(§8 bounce 机制)
      player(state, f.owner).hand.push({ instanceId: f.instanceId, cardId: f.cardId });
      return;
    }
    case 'freeze': {
      const t = resolveTarget(state, e.target, ctx);
      if (!t) return;
      const f = state.lanes[t.lane][t.side];
      if (f) f.frozen = true;
      return;
    }
    case 'shield': {
      const t = resolveTarget(state, e.target, ctx);
      if (!t) return;
      const f = state.lanes[t.lane][t.side];
      if (f) f.cantBeHurt = true;
      return;
    }
    case 'giveKeywordAll': {
      const targetSide = e.side === 'friendly' ? ctx.caster : otherSide(ctx.caster);
      state.lanes.forEach((ln) => {
        const f = ln[targetSide];
        if (f && !hasKeyword(f.keywords, e.keyword)) f.keywords.push(e.keyword);
      });
      return;
    }
    case 'move': {
      const t = resolveTarget(state, e.target, ctx);
      if (!t) return;
      const f = state.lanes[t.lane][t.side];
      if (!f) return;
      if (state.lanes[e.toLane][t.side]) return; // 目标格已占用,忽略(UI 应先校验)
      state.lanes[t.lane][t.side] = null;
      state.lanes[e.toLane][t.side] = f;
      return;
    }
    case 'bonusAttack': {
      // 需要 §6 performAttack 子程序,M2 combat 实装。
      throw new Error('bonusAttack requires combat (M2)');
    }
  }
}

export function applyEffects(state: GameState, effects: Effect[], ctx: EffectCtx): void {
  for (const e of effects) applyEffect(state, e, ctx);
}

export type { EffectCtx };
