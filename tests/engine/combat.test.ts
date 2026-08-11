import { describe, it, expect } from 'vitest';
import { resolveFight } from '../../src/engine/combat.ts';
import { DEFAULT_CONFIG } from '../../src/config.ts';
import { baseState, placeFighter } from './helpers.ts';

const cfg = DEFAULT_CONFIG;

describe('FIGHT — basic combat (§6: zombie first, plant retaliates even when dying)', () => {
  it('even trade destroys both (dying plant still deals its damage)', () => {
    const s = baseState({ phase: 'FIGHT' });
    placeFighter(s, 0, 'zombie', 'z_basic'); // 3/2
    placeFighter(s, 0, 'plant', 'p_cabbagepult'); // 3/2
    resolveFight(s, cfg);
    expect(s.lanes[0].zombie).toBeNull();
    expect(s.lanes[0].plant).toBeNull();
  });

  it('survivor keeps its remaining hp', () => {
    const s = baseState({ phase: 'FIGHT' });
    placeFighter(s, 0, 'zombie', 'z_capecod'); // 5/3
    placeFighter(s, 0, 'plant', 'p_peashooter'); // 2/2 → dies, deals 2 back
    resolveFight(s, cfg);
    expect(s.lanes[0].plant).toBeNull();
    expect(s.lanes[0].zombie?.health).toBe(1); // 3 - 2
  });

  it('unblocked fighters hit the enemy hero', () => {
    const s = baseState({ phase: 'FIGHT' });
    placeFighter(s, 1, 'zombie', 'z_basic'); // 3
    placeFighter(s, 2, 'plant', 'p_bonkchoy'); // 4
    resolveFight(s, cfg);
    expect(s.plant.hero.hp).toBe(17);
    expect(s.zombie.hero.hp).toBe(16);
  });
});

describe('FIGHT — armored (§6/§7)', () => {
  it('armored reduces combat damage by N', () => {
    const s = baseState({ phase: 'FIGHT' });
    placeFighter(s, 0, 'zombie', 'z_basic'); // 3 atk
    placeFighter(s, 0, 'plant', 'p_wallnut'); // 0/6 armored:1
    resolveFight(s, cfg);
    expect(s.lanes[0].plant?.health).toBe(4); // 6 - (3-1)
    expect(s.lanes[0].zombie?.health).toBe(2); // wallnut 0 atk
  });
});

describe('FIGHT — deadly (§6, ans #5)', () => {
  it('deadly destroys a high-hp fighter; the victim still retaliates as it dies', () => {
    const s = baseState({ phase: 'FIGHT' });
    placeFighter(s, 0, 'zombie', 'z_toxicimp'); // 2/2 deadly
    placeFighter(s, 0, 'plant', 'p_snapdragon'); // 4/5
    resolveFight(s, cfg);
    expect(s.lanes[0].plant).toBeNull(); // 5hp snap killed by deadly
    expect(s.lanes[0].zombie).toBeNull(); // snap dealt 4 → toxic (2hp) dies too
  });

  it('armor does NOT save from deadly when residual dmg > 0', () => {
    const s = baseState({ phase: 'FIGHT' });
    placeFighter(s, 0, 'zombie', 'z_toxicimp'); // 2 atk deadly
    placeFighter(s, 0, 'plant', 'p_wallnut'); // armored:1 → dmg 1 > 0 → deadly kills
    resolveFight(s, cfg);
    expect(s.lanes[0].plant).toBeNull();
    expect(s.lanes[0].zombie?.health).toBe(2); // wallnut 0 atk → toxic survives
  });
});

describe('FIGHT — bullseye (§7)', () => {
  it('bullseye ignores blocker, hits hero; blocker survives and strikes back', () => {
    const s = baseState({ phase: 'FIGHT' });
    placeFighter(s, 0, 'zombie', 'z_wizardgarg'); // 6/6 bullseye
    placeFighter(s, 0, 'plant', 'p_peashooter'); // 2/2
    resolveFight(s, cfg);
    expect(s.plant.hero.hp).toBe(14); // 20 - 6 to hero
    expect(s.lanes[0].plant?.health).toBe(2); // peashooter untouched by bullseye
    expect(s.lanes[0].zombie?.health).toBe(4); // peashooter hit garg for 2
  });
});

describe('FIGHT — strikethrough (§7)', () => {
  it('hits both the lane fighter and the hero', () => {
    const s = baseState({ phase: 'FIGHT' });
    placeFighter(s, 0, 'plant', 'p_threepeater'); // 3/4 strikethrough
    placeFighter(s, 0, 'zombie', 'z_basic'); // 3/2
    resolveFight(s, cfg);
    // zombie first: 3 → threepeater 4→1. plant strikethrough: 3 → z_basic dies + 3 → zombieHero
    expect(s.lanes[0].zombie).toBeNull();
    expect(s.zombie.hero.hp).toBe(17);
    expect(s.lanes[0].plant?.health).toBe(1);
  });
});

describe('FIGHT — frenzy (§6 STEP4, zombie only)', () => {
  it('kills blocker then bonus-attacks the hero (only if it survives)', () => {
    const s = baseState({ phase: 'FIGHT' });
    placeFighter(s, 0, 'zombie', 'z_ninja'); // 4/2 frenzy
    placeFighter(s, 0, 'plant', 'p_sunflower'); // 1/2 → dies, deals only 1 back
    resolveFight(s, cfg);
    expect(s.lanes[0].plant).toBeNull();
    expect(s.lanes[0].zombie?.health).toBe(1); // 2 - 1, survived
    expect(s.plant.hero.hp).toBe(16); // bonus 4 to hero
  });

  it('no bonus and no survival when the blocker trades evenly', () => {
    const s = baseState({ phase: 'FIGHT' });
    placeFighter(s, 0, 'zombie', 'z_ninja'); // 4/2 frenzy
    placeFighter(s, 0, 'plant', 'p_peashooter'); // 2/2 → deals 2, kills ninja
    resolveFight(s, cfg);
    expect(s.lanes[0].plant).toBeNull();
    expect(s.lanes[0].zombie).toBeNull(); // ninja died → no frenzy
    expect(s.plant.hero.hp).toBe(20);
  });

  it('no bonus attack when blocker survives', () => {
    const s = baseState({ phase: 'FIGHT' });
    placeFighter(s, 0, 'zombie', 'z_ninja'); // 4 atk
    placeFighter(s, 0, 'plant', 'p_wallnut'); // 0/6 armored:1 → 6-3=3, survives
    resolveFight(s, cfg);
    expect(s.lanes[0].plant?.health).toBe(3);
    expect(s.plant.hero.hp).toBe(20);
  });
});

describe('FIGHT — gravestone reveal (§5/§7)', () => {
  it('flips at FIGHT start then fights normally', () => {
    const s = baseState({ phase: 'FIGHT' });
    const z = placeFighter(s, 3, 'zombie', 'z_sneaky'); // 4/2 gravestone
    expect(z.gravestone).toBe(true);
    resolveFight(s, cfg);
    expect(s.lanes[3].zombie?.gravestone).toBe(false);
    expect(s.plant.hero.hp).toBe(16); // revealed, hits hero for 4
  });
});

describe('FIGHT — freeze + cantBeHurt', () => {
  it('frozen fighter skips its attack (flag clears), still takes damage', () => {
    const s = baseState({ phase: 'FIGHT' });
    placeFighter(s, 0, 'zombie', 'z_imp'); // 2/1
    const bonk = placeFighter(s, 0, 'plant', 'p_bonkchoy'); // 4/3
    bonk.frozen = true;
    resolveFight(s, cfg);
    // zombie 2 → bonk 3→1 (survives). bonk frozen → skips attack. imp lives.
    expect(s.lanes[0].plant?.health).toBe(1);
    expect(s.lanes[0].plant?.frozen).toBe(false);
    expect(s.lanes[0].zombie?.health).toBe(1); // imp not struck back
  });

  it('cantBeHurt zeros combat damage (and blocks deadly)', () => {
    const s = baseState({ phase: 'FIGHT' });
    placeFighter(s, 0, 'zombie', 'z_toxicimp'); // 2 deadly
    const p = placeFighter(s, 0, 'plant', 'p_peashooter'); // 2/2
    p.cantBeHurt = true;
    resolveFight(s, cfg);
    expect(s.lanes[0].plant?.health).toBe(2); // shield → 0 dmg → no deadly
    expect(s.lanes[0].zombie).toBeNull(); // peashooter struck back for 2, imp (2hp) dies
  });
});

describe('FIGHT — immediate hero lethal (§6 ordering)', () => {
  it('zombie kills plant hero first; plant never retaliates', () => {
    const s = baseState({ phase: 'FIGHT' });
    s.plant.hero.hp = 3;
    s.zombie.hero.hp = 3;
    placeFighter(s, 0, 'zombie', 'z_basic'); // lane 0, 3 atk → lethal to plant hero
    placeFighter(s, 1, 'plant', 'p_bonkchoy'); // lane 1, 4 atk → would kill zombie hero
    resolveFight(s, cfg);
    expect(s.winner).toBe('zombie');
    expect(s.zombie.hero.hp).toBe(3); // plant lane 1 never got to attack
  });
});
