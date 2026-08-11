import { describe, it, expect } from 'vitest';
import { reduce } from '../../src/engine/reduce.ts';
import { baseState } from './helpers.ts';

describe('draw + empty deck (fatigue removed → tie)', () => {
  it('forced draw from empty deck ends game in a tie', () => {
    const s = baseState({ phase: 'FIGHT' });
    // 双方牌库空;推进出 FIGHT → endTurn → startTurn draw → 抽空 = 和局
    s.plant.deck = [];
    s.zombie.deck = [];
    const ns = reduce(s, { type: 'ADVANCE_PHASE', side: 'zombie' });
    expect(ns.phase).toBe('GAME_OVER');
    expect(ns.winner).toBe('draw');
  });

  it('start-of-turn draw pulls one card per side', () => {
    const s = baseState({ phase: 'FIGHT' });
    s.plant.deck = [{ instanceId: 'p1', cardId: 'p_peashooter' }];
    s.zombie.deck = [{ instanceId: 'z1', cardId: 'z_imp' }];
    const ns = reduce(s, { type: 'ADVANCE_PHASE', side: 'zombie' });
    expect(ns.turn).toBe(2);
    expect(ns.plant.hand.some((c) => c.cardId === 'p_peashooter')).toBe(true);
    expect(ns.zombie.hand.some((c) => c.cardId === 'z_imp')).toBe(true);
  });
});
