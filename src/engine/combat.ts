import type { GameConfig } from '../config.ts';
import type { Fighter, GameState, Side } from './types.ts';
import { getCard } from './cardpool.ts';
import { hasKeyword, keywordValue } from './deck.ts';
import { applyEffects, otherSide, removeFighter } from './effects.ts';

// 对 hero 造成伤害。isFighterHit 决定是否给对方 Super-Block Meter 充能(§8.1)。
// M2:仅扣血。M3 在此插入 meter 充能/格挡逻辑。
export function applyHeroDamage(
  state: GameState,
  heroSide: Side,
  amount: number,
  _opts: { isFighterHit: boolean },
): void {
  const hero = heroSide === 'plant' ? state.plant.hero : state.zombie.hero;
  hero.hp -= amount;
  // TODO(M3): if (_opts.isFighterHit) chargeBlockMeter(...);
}

// 对 defender 施加一次 combat 伤害(armored 减免、cantBeHurt 免伤、deadly 致死)。
// 返回 defender 是否被摧毁。
function dealCombatDamage(
  state: GameState,
  defenderLane: number,
  defenderSide: Side,
  rawAttack: number,
  attacker: Fighter,
): boolean {
  const d = state.lanes[defenderLane][defenderSide];
  if (!d) return false;

  let dmg: number;
  if (d.cantBeHurt) {
    dmg = 0; // 免伤:combat 伤害归零(§7 讨论)
  } else {
    const armored = keywordValue(d.keywords, 'armored') ?? 0;
    dmg = Math.max(0, rawAttack - armored);
  }
  if (dmg > 0) d.health -= dmg;

  // deadly:任何 >0 combat 伤害即致死(§6)。cantBeHurt → dmg=0 → 不触发。
  const deadlyKill = hasKeyword(attacker.keywords, 'deadly') && dmg > 0;
  const destroyed = d.health <= 0 || deadlyKill;
  if (destroyed) removeFighter(state, defenderLane, defenderSide);
  return destroyed;
}

// §6 单 fighter 攻击子程序。可被 frenzy bonus / Carried Away(M3)复用。
// 返回是否摧毁了该 lane 对方 fighter。
export function performAttack(state: GameState, side: Side, lane: number, _config: GameConfig): boolean {
  const attacker = state.lanes[lane][side];
  if (!attacker) return false;
  const enemy = otherSide(side);
  const atk = attacker.attack; // 攻击瞬间取当前值(§6)

  // Bullseye:直击对方 hero,无视 lane,不触发对方 Block 充能(§7)
  if (hasKeyword(attacker.keywords, 'bullseye')) {
    applyHeroDamage(state, enemy, atk, { isFighterHit: false });
    return false;
  }

  // Strikethrough:同时命中对方 fighter 与 hero(§7)
  if (hasKeyword(attacker.keywords, 'strikethrough')) {
    let destroyed = false;
    if (state.lanes[lane][enemy]) destroyed = dealCombatDamage(state, lane, enemy, atk, attacker);
    applyHeroDamage(state, enemy, atk, { isFighterHit: true }); // 穿透 hero,充能
    return destroyed;
  }

  // 普通:有对方 fighter 打 fighter,否则打 hero
  if (state.lanes[lane][enemy]) {
    return dealCombatDamage(state, lane, enemy, atk, attacker);
  }
  applyHeroDamage(state, enemy, atk, { isFighterHit: true });
  return false;
}

// 一次攻击尝试:处理 frozen(跳过并清除),否则执行 performAttack。
function tryAttack(
  state: GameState,
  side: Side,
  lane: number,
  config: GameConfig,
): { attacked: boolean; destroyedDefender: boolean } {
  const f = state.lanes[lane][side];
  if (!f) return { attacked: false, destroyedDefender: false };
  if (f.frozen) {
    f.frozen = false; // 跳过这次攻击后清除(§8 freeze)
    return { attacked: false, destroyedDefender: false };
  }
  const destroyedDefender = performAttack(state, side, lane, config);
  return { attacked: true, destroyedDefender };
}

// §5:FIGHT 开始翻开所有 gravestone,触发 onReveal。
function revealGravestones(state: GameState): void {
  for (const lane of state.lanes) {
    const z = lane.zombie;
    if (z && z.gravestone) {
      z.gravestone = false;
      const card = getCard(z.cardId);
      if (card.onReveal) applyEffects(state, card.onReveal, { caster: 'zombie', self: z });
    }
  }
}

// §6 逐 lane 结算:僵尸先攻(平局僵尸胜)→ 植物攻 → frenzy。
function resolveLane(state: GameState, lane: number, config: GameConfig): void {
  // STEP 1 — 僵尸先攻
  const zStart = state.lanes[lane].zombie;
  let destroyedPlant = false;
  if (zStart) {
    const r = tryAttack(state, 'zombie', lane, config);
    destroyedPlant = r.destroyedDefender;
  }

  // STEP 2 — 植物攻(若 STEP1 后仍在场且未被跳过)
  if (state.lanes[lane].plant) {
    tryAttack(state, 'plant', lane, config);
  }

  // STEP 4 — Frenzy(僵尸专属):存活 + 本 lane 摧毁了植物 → bonus attack 打脸
  const z = state.lanes[lane].zombie;
  if (z && hasKeyword(z.keywords, 'frenzy') && destroyedPlant) {
    performAttack(state, 'zombie', lane, config); // lane 已清空 → 直击 plantHero
  }
}

export function resolveFight(state: GameState, config: GameConfig): void {
  revealGravestones(state);
  for (let l = 0; l < state.lanes.length; l++) {
    resolveLane(state, l, config);
  }
}
