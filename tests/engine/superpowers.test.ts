import { describe, it, expect } from 'vitest';
import { reduce } from '../../src/engine/reduce.ts';
import { hasKeyword } from '../../src/engine/deck.ts';
import { baseState, placeFighter } from './helpers.ts';

// 便捷:给 hero 装上待用超能力
function withSP(phase: 'PLANT_PLAY' | 'ZOMBIE_PLAY' | 'ZOMBIE_TRICKS', side: 'plant' | 'zombie', spId: string) {
  const s = baseState({ phase });
  s[side].hero.readySuperpower = spId;
  return s;
}

describe('Green Shadow superpowers', () => {
  it('Precision Blast hits mid lane (index 2) zombie for 5', () => {
    const s = withSP('PLANT_PLAY', 'plant', 'gs_precision_blast');
    placeFighter(s, 2, 'zombie', 'z_spacecowboy'); // 3/5, armored 无(strikethrough) → 5 dmg 致死
    const ns = reduce(s, { type: 'PLAY_SUPERPOWER', side: 'plant' });
    expect(ns.lanes[2].zombie).toBeNull();
    expect(ns.plant.hero.readySuperpower).toBeNull(); // 用掉
  });

  it('Precision Blast hits zombie hero for 5 when mid lane empty', () => {
    const s = withSP('PLANT_PLAY', 'plant', 'gs_precision_blast');
    const ns = reduce(s, { type: 'PLAY_SUPERPOWER', side: 'plant' });
    expect(ns.zombie.hero.hp).toBe(15);
  });

  it('Whirlwind bounces the (only) zombie back to its hand', () => {
    const s = withSP('PLANT_PLAY', 'plant', 'gs_whirlwind');
    placeFighter(s, 0, 'zombie', 'z_imp');
    const ns = reduce(s, { type: 'PLAY_SUPERPOWER', side: 'plant' });
    expect(ns.lanes[0].zombie).toBeNull();
    expect(ns.zombie.hand.some((c) => c.cardId === 'z_imp')).toBe(true);
  });

  it('Big Chill freezes target zombie and draws 1', () => {
    const s = withSP('PLANT_PLAY', 'plant', 'gs_big_chill');
    placeFighter(s, 0, 'zombie', 'z_imp');
    const before = s.plant.hand.length;
    const ns = reduce(s, { type: 'PLAY_SUPERPOWER', side: 'plant', target: { lane: 0, side: 'zombie' } });
    expect(ns.lanes[0].zombie?.frozen).toBe(true);
    expect(ns.plant.hand.length).toBe(before + 1);
  });

  it('Embiggen gives a friendly plant +2/+2', () => {
    const s = withSP('PLANT_PLAY', 'plant', 'gs_embiggen');
    placeFighter(s, 0, 'plant', 'p_peashooter'); // 1/1
    const ns = reduce(s, { type: 'PLAY_SUPERPOWER', side: 'plant', target: { lane: 0, side: 'plant' } });
    expect(ns.lanes[0].plant?.attack).toBe(3);
    expect(ns.lanes[0].plant?.health).toBe(3);
  });

  it('Embiggen cannot target an enemy fighter', () => {
    const s = withSP('PLANT_PLAY', 'plant', 'gs_embiggen');
    placeFighter(s, 0, 'zombie', 'z_imp');
    expect(() =>
      reduce(s, { type: 'PLAY_SUPERPOWER', side: 'plant', target: { lane: 0, side: 'zombie' } }),
    ).toThrow(/friendly/);
  });
});

describe('Super Brainz superpowers', () => {
  it('Carried Away moves a zombie, +1/+1, bonus-attacks the hero of the new lane', () => {
    const s = withSP('ZOMBIE_TRICKS', 'zombie', 'sb_carried_away');
    placeFighter(s, 0, 'zombie', 'z_imp'); // 1/1
    const ns = reduce(s, {
      type: 'PLAY_SUPERPOWER',
      side: 'zombie',
      target: { lane: 0, side: 'zombie' },
      toLane: 1,
    });
    expect(ns.lanes[0].zombie).toBeNull();
    expect(ns.lanes[1].zombie?.attack).toBe(2);
    expect(ns.lanes[1].zombie?.health).toBe(2);
    expect(ns.plant.hero.hp).toBe(18); // 2 attack 直击 plantHero
  });

  it('Carried Away bonus attack hits a plant blocking the destination lane', () => {
    const s = withSP('ZOMBIE_TRICKS', 'zombie', 'sb_carried_away');
    placeFighter(s, 0, 'zombie', 'z_imp'); // 1/1 → 2/2
    placeFighter(s, 1, 'plant', 'p_peashooter'); // 1/1,占 plant 侧 lane1
    const ns = reduce(s, {
      type: 'PLAY_SUPERPOWER',
      side: 'zombie',
      target: { lane: 0, side: 'zombie' },
      toLane: 1,
    });
    expect(ns.lanes[1].plant).toBeNull(); // 2 dmg → peashooter 死
    expect(ns.lanes[1].zombie?.health).toBe(2); // 单向攻击,不吃反击
    expect(ns.plant.hero.hp).toBe(20);
  });

  it('Telepathy draws 2', () => {
    const s = withSP('ZOMBIE_TRICKS', 'zombie', 'sb_telepathy');
    const before = s.zombie.hand.length;
    const ns = reduce(s, { type: 'PLAY_SUPERPOWER', side: 'zombie' });
    expect(ns.zombie.hand.length).toBe(before + 2);
  });

  it('Cut Down destroys a plant with attack ≥ 5', () => {
    const s = withSP('ZOMBIE_TRICKS', 'zombie', 'sb_cut_down');
    const f = placeFighter(s, 0, 'plant', 'p_snapdragon');
    f.attack = 5;
    const ns = reduce(s, { type: 'PLAY_SUPERPOWER', side: 'zombie', target: { lane: 0, side: 'plant' } });
    expect(ns.lanes[0].plant).toBeNull();
  });

  it('Cut Down cannot target an untrickable plant (even at attack ≥ 5)', () => {
    const s = withSP('ZOMBIE_TRICKS', 'zombie', 'sb_cut_down');
    const f = placeFighter(s, 0, 'plant', 'p_snapdragon');
    f.attack = 5;
    f.keywords.push('untrickable');
    expect(() =>
      reduce(s, { type: 'PLAY_SUPERPOWER', side: 'zombie', target: { lane: 0, side: 'plant' } }),
    ).toThrow(/untrickable/);
  });

  it('Cut Down rejects a plant with attack < 5', () => {
    const s = withSP('ZOMBIE_TRICKS', 'zombie', 'sb_cut_down');
    placeFighter(s, 0, 'plant', 'p_snapdragon'); // attack 3
    expect(() =>
      reduce(s, { type: 'PLAY_SUPERPOWER', side: 'zombie', target: { lane: 0, side: 'plant' } }),
    ).toThrow(/attack must be/);
  });

  it('Super Stench gives every zombie deadly and draws 1', () => {
    const s = withSP('ZOMBIE_TRICKS', 'zombie', 'sb_super_stench');
    placeFighter(s, 0, 'zombie', 'z_imp');
    placeFighter(s, 1, 'zombie', 'z_conehead');
    const before = s.zombie.hand.length;
    const ns = reduce(s, { type: 'PLAY_SUPERPOWER', side: 'zombie' });
    expect(hasKeyword(ns.lanes[0].zombie!.keywords, 'deadly')).toBe(true);
    expect(hasKeyword(ns.lanes[1].zombie!.keywords, 'deadly')).toBe(true);
    expect(ns.zombie.hand.length).toBe(before + 1);
  });
});

describe('superpower gating', () => {
  it('cannot play a superpower outside own play phase', () => {
    const s = baseState({ phase: 'ZOMBIE_PLAY' });
    s.plant.hero.readySuperpower = 'gs_embiggen';
    placeFighter(s, 0, 'plant', 'p_peashooter');
    expect(() =>
      reduce(s, { type: 'PLAY_SUPERPOWER', side: 'plant', target: { lane: 0, side: 'plant' } }),
    ).toThrow(/cannot play superpower/);
  });

  it('cannot play when no superpower is ready', () => {
    const s = baseState({ phase: 'PLANT_PLAY' });
    expect(() => reduce(s, { type: 'PLAY_SUPERPOWER', side: 'plant' })).toThrow(/no superpower ready/);
  });

  // 僵尸超能力视同 trick:不能在 ZOMBIE_PLAY 打,只能在 ZOMBIE_TRICKS(或战斗中断)打。
  it('zombie cannot play a superpower during ZOMBIE_PLAY', () => {
    const s = withSP('ZOMBIE_PLAY', 'zombie', 'sb_telepathy');
    expect(() => reduce(s, { type: 'PLAY_SUPERPOWER', side: 'zombie' })).toThrow(/cannot play superpower/);
  });

  it('zombie can play a superpower during ZOMBIE_TRICKS', () => {
    const s = withSP('ZOMBIE_TRICKS', 'zombie', 'sb_telepathy');
    const ns = reduce(s, { type: 'PLAY_SUPERPOWER', side: 'zombie' });
    expect(ns.zombie.hero.readySuperpower).toBeNull(); // 打出后清空
  });
});
