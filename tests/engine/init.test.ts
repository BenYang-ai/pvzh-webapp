import { describe, it, expect } from 'vitest';
import { createInitialState } from '../../src/engine/reduce.ts';
import { DEFAULT_CONFIG } from '../../src/config.ts';

describe('createInitialState', () => {
  it('deals opening hands, sets turn 1 zombie-first, resources = 1', () => {
    const s = createInitialState({ seed: 'test-seed' });
    // 起手 4 + 回合1 抽 1 = 5
    expect(s.plant.hand.length).toBe(DEFAULT_CONFIG.openingDraw + DEFAULT_CONFIG.drawPerTurn);
    expect(s.zombie.hand.length).toBe(DEFAULT_CONFIG.openingDraw + DEFAULT_CONFIG.drawPerTurn);
    // 30 - 5 = 25
    expect(s.plant.deck.length).toBe(25);
    expect(s.zombie.deck.length).toBe(25);
    expect(s.turn).toBe(1);
    expect(s.phase).toBe('ZOMBIE_PLAY');
    expect(s.plant.resource).toBe(1);
    expect(s.zombie.resource).toBe(1);
    expect(s.plant.hero.hp).toBe(20);
    expect(s.zombie.hero.hp).toBe(20);
    expect(s.winner).toBeNull();
  });

  it('is deterministic: same seed → identical state', () => {
    const a = createInitialState({ seed: 'abc' });
    const b = createInitialState({ seed: 'abc' });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('different seed → different shuffle', () => {
    const a = createInitialState({ seed: 'abc' });
    const b = createInitialState({ seed: 'xyz' });
    expect(a.plant.deck.map((c) => c.cardId)).not.toEqual(b.plant.deck.map((c) => c.cardId));
  });

  it('builds 30-card decks', () => {
    const s = createInitialState({ seed: 'q' });
    expect(s.plant.deck.length + s.plant.hand.length).toBe(30);
    expect(s.zombie.deck.length + s.zombie.hand.length).toBe(30);
  });
});
