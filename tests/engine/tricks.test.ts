import { describe, it, expect } from 'vitest';
import { reduce } from '../../src/engine/reduce.ts';
import { baseState, giveCard, placeFighter } from './helpers.ts';

describe('trick effects (non-combat effect interpreter)', () => {
  it('Cherry Bomb deals 4 → destroys a 2hp zombie', () => {
    const s = baseState({ phase: 'PLANT_PLAY' });
    s.plant.resource = 3;
    placeFighter(s, 0, 'zombie', 'z_basic'); // 3/2
    const id = giveCard(s, 'plant', 'p_cherrybomb');
    const ns = reduce(s, { type: 'PLAY_TRICK', side: 'plant', instanceId: id, target: { lane: 0, side: 'zombie' } });
    expect(ns.lanes[0].zombie).toBeNull();
    expect(ns.plant.resource).toBe(0);
  });

  it('Fertilize buffs friendly +1/+1', () => {
    const s = baseState({ phase: 'PLANT_PLAY' });
    s.plant.resource = 1;
    placeFighter(s, 0, 'plant', 'p_peashooter'); // 2/2
    const id = giveCard(s, 'plant', 'p_fertilize');
    const ns = reduce(s, { type: 'PLAY_TRICK', side: 'plant', instanceId: id, target: { lane: 0, side: 'plant' } });
    expect(ns.lanes[0].plant?.attack).toBe(3);
    expect(ns.lanes[0].plant?.health).toBe(3);
  });

  it('Backyard Bounce returns a plant to hand, clearing the lane', () => {
    const s = baseState({ phase: 'ZOMBIE_PLAY' });
    s.zombie.resource = 3;
    placeFighter(s, 1, 'plant', 'p_peashooter');
    const id = giveCard(s, 'zombie', 'z_bounce');
    const ns = reduce(s, { type: 'PLAY_TRICK', side: 'zombie', instanceId: id, target: { lane: 1, side: 'plant' } });
    expect(ns.lanes[1].plant).toBeNull();
    expect(ns.plant.hand.some((c) => c.cardId === 'p_peashooter')).toBe(true);
  });

  it('cantBeHurt (shield) zeros trick damage', () => {
    const s = baseState({ phase: 'ZOMBIE_TRICKS' });
    s.zombie.resource = 2;
    const f = placeFighter(s, 0, 'plant', 'p_peashooter'); // 2/2
    f.cantBeHurt = true;
    const id = giveCard(s, 'zombie', 'z_nibble'); // dmg 3
    const ns = reduce(s, { type: 'PLAY_TRICK', side: 'zombie', instanceId: id, target: { lane: 0, side: 'plant' } });
    expect(ns.lanes[0].plant?.health).toBe(2); // unchanged
  });

  it('untrickable fighter cannot be targeted by a trick', () => {
    const s = baseState({ phase: 'PLANT_PLAY' });
    s.plant.resource = 3;
    const f = placeFighter(s, 0, 'zombie', 'z_basic');
    f.keywords.push('untrickable');
    const id = giveCard(s, 'plant', 'p_cherrybomb');
    expect(() =>
      reduce(s, { type: 'PLAY_TRICK', side: 'plant', instanceId: id, target: { lane: 0, side: 'zombie' } }),
    ).toThrow(/untrickable/);
  });

  it('hidden gravestone cannot be targeted by a trick', () => {
    const s = baseState({ phase: 'PLANT_PLAY' });
    s.plant.resource = 3;
    placeFighter(s, 0, 'zombie', 'z_sneaky'); // gravestone
    const id = giveCard(s, 'plant', 'p_cherrybomb');
    expect(() =>
      reduce(s, { type: 'PLAY_TRICK', side: 'plant', instanceId: id, target: { lane: 0, side: 'zombie' } }),
    ).toThrow(/gravestone/);
  });
});
