import { describe, it, expect } from 'vitest';
import { reduce, createInitialState } from '../../src/engine/reduce.ts';
import { applyHeroDamage } from '../../src/engine/combat.ts';
import { DEFAULT_CONFIG, type SuperblockMode } from '../../src/config.ts';
import { superpowersFor } from '../../src/engine/cardpool.ts';
import { grantSuperpower } from '../../src/engine/superpowers.ts';
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

describe('Super-Block trigger cap (max 3 per side)', () => {
  it('stops charging after 3 full triggers — further hits deal full damage', () => {
    const s = stateWithMode('faithful');
    for (let i = 0; i < 3; i++) {
      s.plant.hero.blockMeter = 7; // 下一击必充满
      applyHeroDamage(s, 'plant', 5, { isFighterHit: true });
    }
    expect(s.plant.hero.blockTriggers).toBe(3);
    expect(s.plant.hero.hp).toBe(20); // 三次全格挡

    // 第 4 次:再无 meter,伤害照常,不充能
    s.plant.hero.blockMeter = 7;
    applyHeroDamage(s, 'plant', 5, { isFighterHit: true });
    expect(s.plant.hero.hp).toBe(15);
    expect(s.plant.hero.blockMeter).toBe(7); // 未充能
    expect(s.plant.hero.blockTriggers).toBe(3);
  });

  it('cap is per-side (zombie unaffected by plant reaching cap)', () => {
    const s = stateWithMode('faithful');
    s.plant.hero.blockTriggers = 3;
    s.zombie.hero.blockMeter = 7;
    applyHeroDamage(s, 'zombie', 5, { isFighterHit: true });
    expect(s.zombie.hero.hp).toBe(20); // 僵尸仍能格挡
    expect(s.zombie.hero.blockTriggers).toBe(1);
  });
});

describe('Superpowers are unique cards (drawn once)', () => {
  it('faithful: a drawn superpower is never granted again', () => {
    const s = stateWithMode('faithful');
    const all = superpowersFor('plant').map((sp) => sp.id);
    s.plant.hero.usedSuperpowerIds = all.slice(0, 3); // 只剩最后一个
    const granted = grantSuperpower(s, 'plant');
    expect(granted).toEqual({ interrupt: true, spId: all[3] });
    expect(s.plant.hero.readySuperpowers).toEqual([all[3]]);
    expect(s.plant.hero.usedSuperpowerIds).toContain(all[3]);
  });

  it('two Super-Block grants yield two DIFFERENT superpowers', () => {
    const s = stateWithMode('faithful');
    s.plant.hero.blockMeter = 7;
    applyHeroDamage(s, 'plant', 5, { isFighterHit: true });
    s.plant.hero.blockMeter = 7;
    applyHeroDamage(s, 'plant', 5, { isFighterHit: true });
    const ready = s.plant.hero.readySuperpowers;
    expect(ready).toHaveLength(2);
    expect(new Set(ready).size).toBe(2); // 无重复
  });

  it('grantSuperpower reports no interrupt once all superpowers are drawn', () => {
    const s = stateWithMode('faithful');
    s.zombie.hero.usedSuperpowerIds = superpowersFor('zombie').map((sp) => sp.id);
    const granted = grantSuperpower(s, 'zombie');
    expect(granted.interrupt).toBe(false);
    expect(s.zombie.hero.readySuperpowers).toHaveLength(0);
  });

  it('pick mode offers only superpowers not yet drawn', () => {
    const s = stateWithMode('pick');
    const all = superpowersFor('zombie').map((sp) => sp.id);
    s.zombie.hero.usedSuperpowerIds = [all[0]];
    grantSuperpower(s, 'zombie');
    expect(s.zombie.hero.superpowerOfferedIds).toEqual(all.slice(1));
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
