import { describe, expect, test } from 'vitest';
import { reduce } from '../../src/engine/reduce.ts';
import { applyHeroDamage } from '../../src/engine/combat.ts';
import { DEFAULT_CONFIG } from '../../src/config.ts';
import { baseState, giveCard } from './helpers.ts';
import type { Side } from '../../src/engine/types.ts';

const adv = (side: Side) => ({ type: 'ADVANCE_PHASE' as const, side });

describe('hand size limit (§draw)', () => {
  test('full hand (>=handSizeMax) skips the start-of-turn draw', () => {
    let s = baseState();
    for (let i = 0; i < DEFAULT_CONFIG.handSizeMax; i++) giveCard(s, 'zombie', 'z_imp'); // 满手
    giveCard(s, 'plant', 'p_peashooter');
    giveCard(s, 'plant', 'p_peashooter');
    giveCard(s, 'plant', 'p_peashooter'); // plant 3 张,不满
    const zDeck = s.zombie.deck.length;
    const pDeck = s.plant.deck.length;

    // 走完 turn 1(无 fighter → 空 fight),进入 turn 2 start。
    s = reduce(s, adv('zombie')); // ZOMBIE_PLAY -> PLANT_PLAY
    s = reduce(s, adv('plant')); // PLANT_PLAY -> ZOMBIE_TRICKS
    s = reduce(s, adv('zombie')); // ZOMBIE_TRICKS -> fight -> turn 2

    expect(s.turn).toBe(2);
    expect(s.zombie.hand.length).toBe(DEFAULT_CONFIG.handSizeMax); // 满手 → 没抽
    expect(s.zombie.deck.length).toBe(zDeck); // 牌库没动
    expect(s.plant.hand.length).toBe(4); // 3 -> 抽 1
    expect(s.plant.deck.length).toBe(pDeck - 1);
  });
});

describe('hand size limit (§super-block)', () => {
  test('full hand → hero hits do NOT charge the block meter (treated as bullseye)', () => {
    const s = baseState();
    for (let i = 0; i < DEFAULT_CONFIG.handSizeMax; i++) giveCard(s, 'plant', 'p_peashooter');
    s.plant.hero.blockMeter = 7; // 一击即满 —— 但满手应视同 bullseye

    applyHeroDamage(s, 'plant', 3, { isFighterHit: true });

    expect(s.plant.hero.blockMeter).toBe(7); // 未充能
    expect(s.plant.hero.readySuperpower).toBeNull(); // 未授予 SP
    expect(s.plant.hero.hp).toBe(17); // 伤害照常穿透
  });

  test('non-full hand → same hit charges & blocks as before', () => {
    const s = baseState();
    for (let i = 0; i < 5; i++) giveCard(s, 'plant', 'p_peashooter'); // 未满
    s.plant.hero.blockMeter = 7;

    applyHeroDamage(s, 'plant', 3, { isFighterHit: true });

    expect(s.plant.hero.blockMeter).toBe(0); // 充满 → 清零
    expect(s.plant.hero.readySuperpower).not.toBeNull(); // 授予 SP
    expect(s.plant.hero.hp).toBe(20); // 完全格挡
  });
});
