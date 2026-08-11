import { describe, it, expect } from 'vitest';
import { reduce } from '../../src/engine/reduce.ts';
import { baseState, placeFighter } from './helpers.ts';

// FIGHT 通过 reduce(ADVANCE_PHASE) 触发 → resolveFight + endTurn 判胜负。
describe('game over via FIGHT resolution', () => {
  it('lethal hero damage ends the game', () => {
    const s = baseState({ phase: 'FIGHT' });
    s.plant.hero.hp = 3;
    placeFighter(s, 0, 'zombie', 'z_basic'); // 3 atk unblocked → lethal
    const ns = reduce(s, { type: 'ADVANCE_PHASE', side: 'zombie' });
    expect(ns.plant.hero.hp).toBeLessThanOrEqual(0);
    expect(ns.phase).toBe('GAME_OVER');
    expect(ns.winner).toBe('zombie');
  });

  it('survivable damage advances to next turn', () => {
    const s = baseState({ phase: 'FIGHT' });
    s.plant.hero.hp = 10;
    placeFighter(s, 0, 'zombie', 'z_basic'); // 3
    const ns = reduce(s, { type: 'ADVANCE_PHASE', side: 'zombie' });
    expect(ns.plant.hero.hp).toBe(7);
    expect(ns.phase).toBe('ZOMBIE_PLAY');
    expect(ns.turn).toBe(2);
  });
});
