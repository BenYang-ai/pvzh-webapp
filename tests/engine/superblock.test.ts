import { describe, it, expect } from 'vitest';
import { reduce, createInitialState } from '../../src/engine/reduce.ts';
import { applyHeroDamage } from '../../src/engine/combat.ts';
import { DEFAULT_CONFIG, type SuperblockMode } from '../../src/config.ts';
import { superpowersFor } from '../../src/engine/cardpool.ts';
import { baseState } from './helpers.ts';

function stateWithMode(mode: SuperblockMode) {
  return baseState({ config: { ...DEFAULT_CONFIG, superblock: { mode } } });
}

describe('Super-Block Meter charge', () => {
  it('a fighter hit on the hero charges the meter 1–3 and still deals damage', () => {
    const s = stateWithMode('faithful');
    applyHeroDamage(s, 'plant', 3, { isFighterHit: true });
    expect(s.plant.hero.blockMeter).toBeGreaterThanOrEqual(1);
    expect(s.plant.hero.blockMeter).toBeLessThanOrEqual(3);
    expect(s.plant.hero.hp).toBe(17);
  });

  it('a non-fighter hit (bullseye/trick/superpower) does NOT charge', () => {
    const s = stateWithMode('faithful');
    applyHeroDamage(s, 'plant', 3, { isFighterHit: false });
    expect(s.plant.hero.blockMeter).toBe(0);
    expect(s.plant.hero.hp).toBe(17);
  });

  it('off mode never charges', () => {
    const s = stateWithMode('off');
    applyHeroDamage(s, 'plant', 3, { isFighterHit: true });
    expect(s.plant.hero.blockMeter).toBe(0);
    expect(s.plant.hero.hp).toBe(17);
  });
});

describe('Super-Block full → block + grant', () => {
  it('faithful: reaching ≥8 blocks the hit, clears meter, grants a random superpower', () => {
    const s = stateWithMode('faithful');
    s.plant.hero.blockMeter = 7; // 下次充能必 ≥8
    applyHeroDamage(s, 'plant', 5, { isFighterHit: true });
    expect(s.plant.hero.hp).toBe(20); // 完全格挡,无伤
    expect(s.plant.hero.blockMeter).toBe(0);
    const ids = superpowersFor('plant').map((sp) => sp.id);
    expect(ids).toContain(s.plant.hero.readySuperpowers[0]);
  });

  it('pick: reaching ≥8 blocks the hit and offers all 4 (no auto-grant)', () => {
    const s = stateWithMode('pick');
    s.zombie.hero.blockMeter = 7;
    applyHeroDamage(s, 'zombie', 5, { isFighterHit: true });
    expect(s.zombie.hero.hp).toBe(20);
    expect(s.zombie.hero.readySuperpowers).toHaveLength(0);
    expect(s.zombie.hero.superpowerOfferedIds).toHaveLength(4);

    // 玩家自选其一 → 进 readySuperpower
    const chosen = s.zombie.hero.superpowerOfferedIds![2];
    const ns = reduce(s, { type: 'PICK_SUPERPOWER', side: 'zombie', superpowerId: chosen });
    expect(ns.zombie.hero.readySuperpowers).toContain(chosen);
    expect(ns.zombie.hero.superpowerOfferedIds).toBeUndefined();
  });

  it('PICK_SUPERPOWER rejects an id that was not offered', () => {
    const s = stateWithMode('pick');
    s.zombie.hero.superpowerOfferedIds = ['sb_telepathy'];
    expect(() => reduce(s, { type: 'PICK_SUPERPOWER', side: 'zombie', superpowerId: 'sb_cut_down' })).toThrow(
      /not offered/,
    );
  });
});

describe('off mode periodic grant', () => {
  it('offers each side a superpower every N turns', () => {
    let s = createInitialState({ seed: 'off-grant', config: { ...DEFAULT_CONFIG, superblock: { mode: 'off' } } });
    expect(s.turn).toBe(1);
    // 每回合 3 次 ADVANCE(zombie→plant→zombie),推进到 turn 3(= N)
    const ownersPerTurn: Array<'plant' | 'zombie'> = ['zombie', 'plant', 'zombie'];
    for (let t = 0; t < 2; t++) {
      for (const side of ownersPerTurn) s = reduce(s, { type: 'ADVANCE_PHASE', side });
    }
    expect(s.turn).toBe(3);
    expect(s.plant.hero.superpowerOfferedIds).toHaveLength(4);
    expect(s.zombie.hero.superpowerOfferedIds).toHaveLength(4);
  });
});
