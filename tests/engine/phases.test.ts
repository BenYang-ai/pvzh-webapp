import { describe, it, expect } from 'vitest';
import { reduce, IllegalActionError } from '../../src/engine/reduce.ts';
import { baseState, giveCard } from './helpers.ts';

describe('phase machine (§5)', () => {
  it('cycles ZOMBIE_PLAY → PLANT_PLAY → ZOMBIE_TRICKS → FIGHT → next turn', () => {
    let s = baseState();
    expect(s.phase).toBe('ZOMBIE_PLAY');
    s = reduce(s, { type: 'ADVANCE_PHASE', side: 'zombie' });
    expect(s.phase).toBe('PLANT_PLAY');
    s = reduce(s, { type: 'ADVANCE_PHASE', side: 'plant' });
    expect(s.phase).toBe('ZOMBIE_TRICKS');
    s = reduce(s, { type: 'ADVANCE_PHASE', side: 'zombie' });
    expect(s.phase).toBe('FIGHT');
    s = reduce(s, { type: 'ADVANCE_PHASE', side: 'zombie' });
    expect(s.phase).toBe('ZOMBIE_PLAY');
    expect(s.turn).toBe(2);
  });

  it('resources refresh to turn number each turn', () => {
    let s = baseState();
    expect(s.zombie.resource).toBe(0); // baseState 不跑 startTurn
    // 手动推进一整回合 → startTurn 设资源 = turn
    s = reduce(s, { type: 'ADVANCE_PHASE', side: 'zombie' });
    s = reduce(s, { type: 'ADVANCE_PHASE', side: 'plant' });
    s = reduce(s, { type: 'ADVANCE_PHASE', side: 'zombie' });
    s = reduce(s, { type: 'ADVANCE_PHASE', side: 'zombie' });
    expect(s.turn).toBe(2);
    expect(s.plant.resource).toBe(2);
    expect(s.zombie.resource).toBe(2);
  });

  it('rejects advancing another side phase', () => {
    const s = baseState(); // ZOMBIE_PLAY owned by zombie
    expect(() => reduce(s, { type: 'ADVANCE_PHASE', side: 'plant' })).toThrow(IllegalActionError);
  });

  it('zombie cannot play fighter in ZOMBIE_TRICKS', () => {
    const s = baseState({ phase: 'ZOMBIE_TRICKS' });
    s.zombie.resource = 9;
    const id = giveCard(s, 'zombie', 'z_imp');
    expect(() => reduce(s, { type: 'PLAY_FIGHTER', side: 'zombie', instanceId: id, lane: 0 })).toThrow(
      /cannot play fighter/,
    );
  });

  it('zombie CAN play trick in ZOMBIE_TRICKS', () => {
    const s = baseState({ phase: 'ZOMBIE_TRICKS' });
    s.zombie.resource = 9;
    const id = giveCard(s, 'zombie', 'z_ironcurtain');
    // 需要一个友方 fighter 作 shield 目标
    const f = { instanceId: 'x', cardId: 'z_basic', owner: 'zombie' as const, attack: 3, health: 2, keywords: [], frozen: false, cantBeHurt: false, gravestone: false };
    s.lanes[0].zombie = f;
    const ns = reduce(s, { type: 'PLAY_TRICK', side: 'zombie', instanceId: id, target: { lane: 0, side: 'zombie' } });
    expect(ns.lanes[0].zombie?.cantBeHurt).toBe(true);
  });
});
