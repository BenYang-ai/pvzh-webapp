import { describe, it, expect } from 'vitest';
import { getCard } from '../../src/engine/cardpool.ts';
import { canPlayCardNow } from '../../src/engine/selectors.ts';
import { baseState } from './helpers.ts';

const zombieFighter = getCard('z_imp'); // fighter
const zombieTrick = getCard('z_nibble'); // trick
const plantFighter = getCard('p_peashooter');
const plantTrick = getCard('p_cherrybomb');

describe('canPlayCardNow (hand highlight = actual phase playability)', () => {
  it('ZOMBIE_PLAY: zombie fighters playable, zombie tricks NOT (bug: tricks were highlighted)', () => {
    const s = baseState({ phase: 'ZOMBIE_PLAY' });
    expect(canPlayCardNow(s, 'zombie', zombieFighter)).toBe(true);
    expect(canPlayCardNow(s, 'zombie', zombieTrick)).toBe(false);
  });

  it('ZOMBIE_TRICKS: zombie tricks playable, zombie fighters NOT', () => {
    const s = baseState({ phase: 'ZOMBIE_TRICKS' });
    expect(canPlayCardNow(s, 'zombie', zombieTrick)).toBe(true);
    expect(canPlayCardNow(s, 'zombie', zombieFighter)).toBe(false);
  });

  it('PLANT_PLAY: plant fighters AND tricks both playable', () => {
    const s = baseState({ phase: 'PLANT_PLAY' });
    expect(canPlayCardNow(s, 'plant', plantFighter)).toBe(true);
    expect(canPlayCardNow(s, 'plant', plantTrick)).toBe(true);
  });
});
