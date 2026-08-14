import type { GameConfig } from '../config.ts';
import type { Fighter, GameState, Side } from './types.ts';
import { getCard } from './cardpool.ts';
import { hasKeyword, keywordValue } from './deck.ts';
import { applyEffects, otherSide, player, removeFighter } from './effects.ts';
import { nextInt } from './rng.ts';
import { grantSuperpower } from './superpowers.ts';

// 对 hero 造成伤害。isFighterHit=true 时给【本方】Super-Block Meter 充能(§8.1)。
// 充满 → 完全格挡本次攻击(伤害归零)+ 清零 + 获得一个超能力。
export function applyHeroDamage(
  state: GameState,
  heroSide: Side,
  amount: number,
  opts: { isFighterHit: boolean },
): void {
  const cfg = state.config;
  const hero = player(state, heroSide).hero;

  // Super-Block:仅 fighter 命中 hero 且造成正伤害时充能(Bullseye/trick/superpower 不充能);off 模式不充能。
  // 手牌已满(≥handSizeMax)→ 视同 bullseye:不充能、不格挡,伤害照常(满手拿不到超能力奖励)。
  const handFull = player(state, heroSide).hand.length >= cfg.handSizeMax;
  // 达触发上限(默认 3 次充满)后 → 该 hero 再无 block meter,伤害照常。
  const cappedOut = hero.blockTriggers >= cfg.blockMeterMaxTriggers;
  if (opts.isFighterHit && amount > 0 && cfg.superblock.mode !== 'off' && !handFull && !cappedOut) {
    const [rng, charge] = nextInt(state.rng, cfg.blockChargeMin, cfg.blockChargeMax);
    state.rng = rng;
    hero.blockMeter += charge;
    if (hero.blockMeter >= cfg.blockMeterMax) {
      hero.blockMeter = 0;
      hero.blockTriggers += 1; // 记一次充满(计入 3 次上限)
      const granted = grantSuperpower(state, heroSide);
      state.log.push(`${heroSide} Super-Block! attack fully blocked${granted ? ', superpower charged' : ''}`);
      // 战斗中获得 → 入队,由 resolveFight 在本 lane 结算完后暂停,给该方即时打出的机会。
      if (granted) (state.interrupts ??= []).push(heroSide);
      return; // 完全格挡:不扣血
    }
  }
  hero.hp -= amount;
}

// 命中后立即判定 hero 死亡(§6:某方 hero ≤0 立即结束,后续攻击不再结算)。
export function checkGameOver(state: GameState): boolean {
  const pDead = state.plant.hero.hp <= 0;
  const zDead = state.zombie.hero.hp <= 0;
  if (!pDead && !zDead) return false;
  state.phase = 'GAME_OVER';
  // 逐次结算 → 先到 0 的先判;植物 hero 死 → 僵尸胜,反之亦然。
  state.winner = pDead ? 'zombie' : 'plant';
  return true;
}

// 对 defender 施加一次 combat 伤害(armored 减免、cantBeHurt 免伤、deadly 致死)。
// 不移除 defender(死亡在 lane 编排里统一结算,好让濒死者仍能反击)。
// 返回 defender 是否应被摧毁(health≤0 或 deadly 命中)。
function dealCombatDamage(defender: Fighter, rawAttack: number, attackerDeadly: boolean): boolean {
  if (defender.cantBeHurt) return false; // 免伤 → 0 伤害 → deadly 也不触发
  const armored = keywordValue(defender.keywords, 'armored') ?? 0;
  const dmg = Math.max(0, rawAttack - armored);
  if (dmg > 0) defender.health -= dmg;
  return defender.health <= 0 || (attackerDeadly && dmg > 0);
}

// §6 单 fighter 攻击子程序(不移除任何 fighter)。可被 frenzy bonus / Carried Away(M3)复用。
// 返回 { destroyedDefender } —— 该 lane 对方 fighter 是否应被摧毁。
export function performAttack(
  state: GameState,
  side: Side,
  lane: number,
  _config: GameConfig,
): { destroyedDefender: boolean } {
  const attacker = state.lanes[lane][side];
  if (!attacker) return { destroyedDefender: false };
  const enemy = otherSide(side);
  const atk = attacker.attack; // 攻击瞬间取当前值(§6)
  const deadly = hasKeyword(attacker.keywords, 'deadly');
  const me = getCard(attacker.cardId).name;
  const defName = (f: Fighter) => getCard(f.cardId).name;

  // Strikethrough:同时命中对方 fighter 与 hero(§7)
  if (hasKeyword(attacker.keywords, 'strikethrough')) {
    let destroyed = false;
    const def = state.lanes[lane][enemy];
    state.log.push(
      `${me} (L${lane}) strikethrough → ${def ? defName(def) : '—'} + ${enemy} hero for ${atk}`,
    );
    if (def) destroyed = dealCombatDamage(def, atk, deadly);
    applyHeroDamage(state, enemy, atk, { isFighterHit: true });
    return { destroyedDefender: destroyed };
  }

  // 普通:有对方 fighter 打 fighter,否则打 hero
  const def = state.lanes[lane][enemy];
  if (def) {
    state.log.push(`${me} (L${lane}) hits ${defName(def)} for ${atk}${deadly ? ' (deadly)' : ''}`);
    return { destroyedDefender: dealCombatDamage(def, atk, deadly) };
  }
  // Bullseye:命中 hero 时无视 Super-Block Meter(不充能、不格挡);普通攻击照常充能。
  const bullseye = hasKeyword(attacker.keywords, 'bullseye');
  state.log.push(
    `${me} (L${lane}) hits ${enemy} hero for ${atk}${bullseye ? ' (bullseye, no block)' : ''}`,
  );
  applyHeroDamage(state, enemy, atk, { isFighterHit: !bullseye });
  return { destroyedDefender: false };
}

// 独立一次 bonus attack(Frenzy / Carried Away / bonusAttack effect 复用)。
// 与逐 lane 结算不同:立即移除被摧毁的对方 fighter 并判定 game over。
export function bonusAttackAt(state: GameState, side: Side, lane: number): void {
  const attacker = state.lanes[lane][side];
  if (!attacker) return;
  const enemy = otherSide(side);
  const { destroyedDefender } = performAttack(state, side, lane, state.config);
  const def = state.lanes[lane][enemy];
  if (def && (def.health <= 0 || destroyedDefender)) removeFighter(state, lane, enemy);
  checkGameOver(state);
}

// frozen:跳过这次攻击并清除标记(§8)。返回该 fighter 本次是否行动。
function consumeFrozen(f: Fighter | null): boolean {
  if (!f) return false;
  if (f.frozen) {
    f.frozen = false;
    return false;
  }
  return true;
}

// §5:FIGHT 开始翻开所有 gravestone,触发 onReveal。
function revealGravestones(state: GameState): void {
  state.lanes.forEach((lane, i) => {
    const z = lane.zombie;
    if (z && z.gravestone) {
      z.gravestone = false;
      const card = getCard(z.cardId);
      state.log.push(`Gravestone revealed: ${card.name} (L${i})`);
      if (card.onReveal) applyEffects(state, card.onReveal, { caster: 'zombie', self: z });
    }
  });
}

// §6 逐 lane 结算:僵尸先攻 → 植物攻(濒死也反击)→ 结算死亡 → frenzy。
// 每次命中 hero 后立即判定结束。返回是否已 game over(用于中断后续 lane)。
function resolveLane(state: GameState, lane: number, config: GameConfig): boolean {
  const Z = state.lanes[lane].zombie;
  const P = state.lanes[lane].plant;
  const zActs = consumeFrozen(Z);
  const pActs = consumeFrozen(P);

  // STEP 1 — 僵尸攻击(伤害已落,但先不移除,好让濒死植物仍能反击)
  let plantDestroyed = false;
  if (zActs && Z) {
    plantDestroyed = performAttack(state, 'zombie', lane, config).destroyedDefender;
    if (checkGameOver(state)) return true;
  }

  // STEP 2 — 植物攻击(即便 STEP1 已致其死亡,仍造成伤害)
  let zombieDestroyed = false;
  if (pActs && P) {
    zombieDestroyed = performAttack(state, 'plant', lane, config).destroyedDefender;
    if (checkGameOver(state)) return true;
  }

  // STEP 3 — 统一结算死亡
  if (P && (P.health <= 0 || plantDestroyed)) {
    state.log.push(`${getCard(P.cardId).name} destroyed (L${lane})`);
    removeFighter(state, lane, 'plant');
  }
  if (Z && (Z.health <= 0 || zombieDestroyed)) {
    state.log.push(`${getCard(Z.cardId).name} destroyed (L${lane})`);
    removeFighter(state, lane, 'zombie');
  }

  // STEP 4 — Frenzy(僵尸专属):存活 + 本 lane 摧毁了植物 → bonus attack 打脸
  const zNow = state.lanes[lane].zombie;
  if (zNow && hasKeyword(zNow.keywords, 'frenzy') && plantDestroyed && zActs) {
    state.log.push(`${getCard(zNow.cardId).name} frenzy → bonus attack (L${lane})`);
    performAttack(state, 'zombie', lane, config); // lane 已清空 → 直击 plantHero
    if (checkGameOver(state)) return true;
  }
  return false;
}

// 可续算:fightResume 有值 → 从 nextLane 续算(SUPERPOWER_INTERRUPT 之后);无值 → 全新一场。
// 本 lane 内触发 Super-Block 授予(state.interrupts 非空)→ 暂停,置 SUPERPOWER_INTERRUPT 并返回。
export function resolveFight(state: GameState, config: GameConfig): void {
  if (state.winner) return;
  const resume = state.fightResume;
  let start = 0;
  if (resume) {
    start = resume.nextLane;
  } else {
    state.log.push(`— fight (turn ${state.turn}) —`);
    revealGravestones(state);
  }
  for (let l = start; l < state.lanes.length; l++) {
    if (resolveLane(state, l, config)) {
      state.fightResume = null; // 某方 hero 死亡 → 立即停止
      state.interrupts = undefined;
      return;
    }
    if (state.interrupts && state.interrupts.length > 0) {
      state.fightResume = { nextLane: l + 1 }; // 暂停:等玩家处理超能力
      state.phase = 'SUPERPOWER_INTERRUPT';
      return;
    }
  }
  state.fightResume = null; // 全部 lane 结算完毕
}
