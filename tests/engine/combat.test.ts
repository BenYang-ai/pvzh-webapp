import { describe, it, expect } from 'vitest';
import { resolveFight } from '../../src/engine/combat.ts';
import { reduce } from '../../src/engine/reduce.ts';
import { DEFAULT_CONFIG } from '../../src/config.ts';
import { baseState, placeFighter } from './helpers.ts';

const cfg = DEFAULT_CONFIG;

describe('FIGHT — basic combat (§6: zombie first, plant retaliates even when dying)', () => {
  it('even trade destroys both (dying plant still deals its damage)', () => {
    const s = baseState({ phase: 'FIGHT' });
    placeFighter(s, 0, 'zombie', 'z_imp'); // 1/1
    placeFighter(s, 0, 'plant', 'p_peashooter'); // 1/1
    resolveFight(s, cfg);
    expect(s.lanes[0].zombie).toBeNull();
    expect(s.lanes[0].plant).toBeNull();
  });

  it('survivor keeps its remaining hp', () => {
    const s = baseState({ phase: 'FIGHT' });
    placeFighter(s, 0, 'zombie', 'z_imp'); // 1/1
    placeFighter(s, 0, 'plant', 'p_snapdragon'); // 3/3
    resolveFight(s, cfg);
    expect(s.lanes[0].zombie).toBeNull(); // imp dies
    expect(s.lanes[0].plant?.health).toBe(2); // snapdragon 3 - 1
  });

  it('unblocked fighters hit the enemy hero', () => {
    const s = baseState({ phase: 'FIGHT' });
    placeFighter(s, 1, 'zombie', 'z_imp'); // 1
    placeFighter(s, 2, 'plant', 'p_bonkchoy'); // 2
    resolveFight(s, cfg);
    expect(s.plant.hero.hp).toBe(19);
    expect(s.zombie.hero.hp).toBe(18);
  });
});

describe('FIGHT — armored (§6/§7)', () => {
  it('armored reduces combat damage by N; dying attacker still retaliates', () => {
    const s = baseState({ phase: 'FIGHT' });
    placeFighter(s, 0, 'zombie', 'z_conehead'); // 2/2 armored:1
    placeFighter(s, 0, 'plant', 'p_bonkchoy'); // 2/1
    resolveFight(s, cfg);
    // conehead 2 → bonkchoy (1hp) dies. bonkchoy 2 → armored → 1 dmg → conehead 2→1
    expect(s.lanes[0].plant).toBeNull();
    expect(s.lanes[0].zombie?.health).toBe(1);
  });
});

describe('FIGHT — deadly (§6, ans #5)', () => {
  it('deadly destroys a higher-hp fighter on any >0 damage', () => {
    const s = baseState({ phase: 'FIGHT' });
    placeFighter(s, 0, 'zombie', 'z_smelly'); // 2/4 deadly (+gravestone)
    placeFighter(s, 0, 'plant', 'p_snapdragon'); // 3/3
    resolveFight(s, cfg);
    expect(s.lanes[0].plant).toBeNull(); // deadly kills the 3hp snapdragon
    expect(s.lanes[0].zombie?.health).toBe(1); // snap dealt 3 → smelly 4→1
  });
});

describe('FIGHT — bullseye (§7)', () => {
  it('bullseye attacks the fighter in front normally (no hero-seeking)', () => {
    const s = baseState({ phase: 'FIGHT' });
    placeFighter(s, 0, 'zombie', 'z_smelly'); // 2/4 deadly
    placeFighter(s, 0, 'plant', 'p_cactus'); // 2/5 bullseye
    resolveFight(s, cfg);
    // smelly 2 → cactus 5→3, deadly → cactus destroyed. cactus 2 → smelly 4→2 (in front, not hero).
    expect(s.lanes[0].plant).toBeNull(); // cactus dies to deadly
    expect(s.lanes[0].zombie?.health).toBe(2); // smelly took the 2, survives
    expect(s.zombie.hero.hp).toBe(20); // hero untouched — bullseye hit the fighter
  });

  it('when it reaches the hero (empty lane), bullseye bypasses the Super-Block Meter', () => {
    const s = baseState({ phase: 'FIGHT' });
    placeFighter(s, 0, 'plant', 'p_cactus'); // 2/5 bullseye, no zombie in front
    resolveFight(s, cfg);
    // cactus 2 → zombie hero, but bullseye ⇒ no block charge.
    expect(s.zombie.hero.hp).toBe(18);
    expect(s.zombie.hero.blockMeter).toBe(0);
  });
});

describe('FIGHT — strikethrough (§7)', () => {
  it('hits both the lane fighter and the hero', () => {
    const s = baseState({ phase: 'FIGHT' });
    placeFighter(s, 0, 'zombie', 'z_spacecowboy'); // 3/5 strikethrough
    placeFighter(s, 0, 'plant', 'p_peashooter'); // 1/1
    resolveFight(s, cfg);
    // spacecowboy first: 3 → peashooter dies + 3 → plantHero. peashooter 1 → cowboy 5→4.
    expect(s.lanes[0].plant).toBeNull();
    expect(s.plant.hero.hp).toBe(17);
    expect(s.lanes[0].zombie?.health).toBe(4);
  });
});

describe('FIGHT — frenzy (§6 STEP4, zombie only)', () => {
  it('kills blocker then bonus-attacks the hero (survives retaliation)', () => {
    const s = baseState({ phase: 'FIGHT' });
    placeFighter(s, 0, 'zombie', 'z_vimpire'); // 2/3 frenzy
    placeFighter(s, 0, 'plant', 'p_peashooter'); // 1/1 → dies, deals only 1
    resolveFight(s, cfg);
    expect(s.lanes[0].plant).toBeNull();
    expect(s.lanes[0].zombie?.health).toBe(2); // 3 - 1, survived
    expect(s.plant.hero.hp).toBe(18); // bonus 2 to hero
  });

  it('no bonus when it fails to destroy the blocker', () => {
    const s = baseState({ phase: 'FIGHT' });
    placeFighter(s, 0, 'zombie', 'z_vimpire'); // 2/3 frenzy
    placeFighter(s, 0, 'plant', 'p_snapdragon'); // 3/3 → survives (3→1), kills vimpire
    resolveFight(s, cfg);
    expect(s.lanes[0].plant?.health).toBe(1);
    expect(s.lanes[0].zombie).toBeNull(); // vimpire died → no frenzy
    expect(s.plant.hero.hp).toBe(20);
  });
});

describe('FIGHT — gravestone reveal (§5/§7)', () => {
  it('flips at end of plant phase (not fight start), then fights normally', () => {
    const s = baseState({ phase: 'PLANT_PLAY' });
    const z = placeFighter(s, 3, 'zombie', 'z_smelly'); // 2/4 gravestone
    expect(z.gravestone).toBe(true);
    // 植物出牌结束 → 出土(翻面),此时尚未战斗。
    const s2 = reduce(s, { type: 'ADVANCE_PHASE', side: 'plant' });
    expect(s2.phase).toBe('ZOMBIE_TRICKS');
    expect(s2.lanes[3].zombie?.gravestone).toBe(false);
    expect(s2.plant.hero.hp).toBe(20); // 还没打
    // 结束僵尸 trick → 战斗:2 点打脸。
    const s3 = reduce(s2, { type: 'ADVANCE_PHASE', side: 'zombie' });
    expect(s3.plant.hero.hp).toBe(18);
  });
});

describe('FIGHT — freeze + cantBeHurt', () => {
  it('frozen fighter skips its attack (flag clears), still takes damage', () => {
    const s = baseState({ phase: 'FIGHT' });
    placeFighter(s, 0, 'zombie', 'z_imp'); // 1/1
    const snap = placeFighter(s, 0, 'plant', 'p_snapdragon'); // 3/3
    snap.frozen = true;
    resolveFight(s, cfg);
    // imp 1 → snap 3→2 (survives). snap frozen → skips attack. imp lives.
    expect(s.lanes[0].plant?.health).toBe(2);
    expect(s.lanes[0].plant?.frozen).toBe(false);
    expect(s.lanes[0].zombie?.health).toBe(1); // imp not struck back
  });

  it('cantBeHurt zeros combat damage (and blocks deadly)', () => {
    const s = baseState({ phase: 'FIGHT' });
    placeFighter(s, 0, 'zombie', 'z_smelly'); // 2/4 deadly
    const p = placeFighter(s, 0, 'plant', 'p_peashooter'); // 1/1
    p.cantBeHurt = true;
    resolveFight(s, cfg);
    expect(s.lanes[0].plant?.health).toBe(1); // shield → 0 dmg → no deadly
    expect(s.lanes[0].zombie?.health).toBe(3); // peashooter struck back for 1
  });
});

describe('FIGHT — immediate hero lethal (§6 ordering)', () => {
  it('zombie kills plant hero first; plant never retaliates', () => {
    const s = baseState({ phase: 'FIGHT' });
    s.plant.hero.hp = 1;
    s.zombie.hero.hp = 1;
    placeFighter(s, 0, 'zombie', 'z_imp'); // lane 0, 1 atk → lethal to plant hero
    placeFighter(s, 1, 'plant', 'p_bonkchoy'); // lane 1, 2 atk → would kill zombie hero
    resolveFight(s, cfg);
    expect(s.winner).toBe('zombie');
    expect(s.zombie.hero.hp).toBe(1); // plant lane 1 never got to attack
  });
});
