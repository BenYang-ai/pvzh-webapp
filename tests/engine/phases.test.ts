import { describe, it, expect } from 'vitest';
import { reduce, IllegalActionError } from '../../src/engine/reduce.ts';
import { baseState, giveCard, placeFighter } from './helpers.ts';

describe('phase machine (§5)', () => {
  it('cycles ZOMBIE_PLAY → PLANT_PLAY → ZOMBIE_TRICKS → (auto fight) → next turn', () => {
    let s = baseState();
    expect(s.phase).toBe('ZOMBIE_PLAY');
    s = reduce(s, { type: 'ADVANCE_PHASE', side: 'zombie' });
    expect(s.phase).toBe('PLANT_PLAY');
    s = reduce(s, { type: 'ADVANCE_PHASE', side: 'plant' });
    expect(s.phase).toBe('ZOMBIE_TRICKS');
    // 结束 tricks → 自动结算战斗 → 直接进入下一回合(bug#3 fix)
    s = reduce(s, { type: 'ADVANCE_PHASE', side: 'zombie' });
    expect(s.phase).toBe('ZOMBIE_PLAY');
    expect(s.turn).toBe(2);
  });

  it('resources refresh to turn number each turn', () => {
    let s = baseState();
    expect(s.zombie.resource).toBe(0); // baseState 不跑 startTurn
    // 推进一整回合(3 次 advance,第 3 次自动结算战斗+进下一回合)
    s = reduce(s, { type: 'ADVANCE_PHASE', side: 'zombie' });
    s = reduce(s, { type: 'ADVANCE_PHASE', side: 'plant' });
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
    placeFighter(s, 0, 'plant', 'p_snapdragon'); // 3/3 目标
    const id = giveCard(s, 'zombie', 'z_nibble'); // -1/-1
    const ns = reduce(s, { type: 'PLAY_TRICK', side: 'zombie', instanceId: id, target: { lane: 0, side: 'plant' } });
    expect(ns.lanes[0].plant?.attack).toBe(2);
    expect(ns.lanes[0].plant?.health).toBe(2);
  });

  it('zombie cannot play trick in ZOMBIE_PLAY (only in ZOMBIE_TRICKS)', () => {
    const s = baseState({ phase: 'ZOMBIE_PLAY' });
    s.zombie.resource = 9;
    placeFighter(s, 0, 'plant', 'p_snapdragon');
    const id = giveCard(s, 'zombie', 'z_nibble');
    expect(() =>
      reduce(s, { type: 'PLAY_TRICK', side: 'zombie', instanceId: id, target: { lane: 0, side: 'plant' } }),
    ).toThrow(/cannot play trick/);
  });
});
