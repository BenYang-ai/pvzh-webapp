// §8 超能力执行。校验在 reduce.ts(IllegalActionError 所在),这里只负责应用已校验的动作。
import type { GameAction, GameState, Side, Superpower } from './types.ts';
import { superpowersFor } from './cardpool.ts';
import { applyEffects, applyNonCombatDamage, otherSide, player } from './effects.ts';
import { applyHeroDamage, bonusAttackAt, checkGameOver } from './combat.ts';
import { nextInt } from './rng.ts';

// Super-Block 充满 / off 模式定期:授予超能力。
// faithful → 从本方 4 个里随机抽一个进 readySuperpower;pick/off → 提供 4 选 1(等玩家 PICK)。
export function grantSuperpower(state: GameState, side: Side): void {
  const cfg = state.config;
  const hero = player(state, side).hero;
  const sps = superpowersFor(side);
  if (cfg.superblock.mode === 'faithful') {
    const [rng, idx] = nextInt(state.rng, 0, sps.length - 1);
    state.rng = rng;
    hero.readySuperpowers.push(sps[idx].id); // 叠入列表,不覆盖已有(可持有多张)
    state.log.push(`${side} superpower ready: ${sps[idx].name}`);
  } else {
    hero.superpowerOfferedIds = sps.map((s) => s.id);
    state.log.push(`${side} may pick a superpower`);
  }
}

type PlaySuperpower = Extract<GameAction, { type: 'PLAY_SUPERPOWER' }>;

// 应用一个超能力(reduce 已校验相位/目标)。多数走通用 effects;两个招牌 SP 由 id 特判。
export function applySuperpower(state: GameState, side: Side, sp: Superpower, action: PlaySuperpower): void {
  switch (sp.id) {
    case 'gs_precision_blast':
      precisionBlast(state, side);
      return;
    case 'sb_carried_away':
      carriedAway(state, action);
      return;
    default:
      applyEffects(state, sp.effects ?? [], { caster: side, chosen: action.target });
  }
}

// Precision Blast:中路 lane(index 2)5 伤害;有敌方 fighter 打 fighter,否则打敌方 hero。
function precisionBlast(state: GameState, side: Side): void {
  const enemy = otherSide(side);
  const lane = 2;
  const f = state.lanes[lane][enemy];
  if (f) {
    applyNonCombatDamage(state, lane, enemy, 5);
  } else {
    applyHeroDamage(state, enemy, 5, { isFighterHit: false }); // 非 fighter 命中 → 不充能
    checkGameOver(state);
  }
}

// Carried Away:把指定友方僵尸移到空 lane,+1/+1,然后立即做一次 bonus attack。
function carriedAway(state: GameState, action: PlaySuperpower): void {
  const target = action.target;
  const toLane = action.toLane;
  if (!target || toLane === undefined) return;
  const f = state.lanes[target.lane][target.side];
  if (!f) return;
  if (state.lanes[toLane][target.side]) return; // 目标格占用(reduce 已校验)
  state.lanes[target.lane][target.side] = null;
  state.lanes[toLane][target.side] = f;
  f.attack += 1;
  f.health += 1;
  bonusAttackAt(state, target.side, toLane);
}
