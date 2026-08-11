import { describe, it, expect } from 'vitest';
import { reduce, IllegalActionError } from '../../src/engine/reduce.ts';
import { baseState, giveCard, placeFighter } from './helpers.ts';

describe('PLAY_FIGHTER (§5 gating, resources)', () => {
  it('places fighter, deducts resource, removes from hand', () => {
    const s = baseState();
    s.zombie.resource = 3;
    const id = giveCard(s, 'zombie', 'z_basic'); // cost 2, 3/2
    const ns = reduce(s, { type: 'PLAY_FIGHTER', side: 'zombie', instanceId: id, lane: 1 });
    expect(ns.lanes[1].zombie?.cardId).toBe('z_basic');
    expect(ns.lanes[1].zombie?.attack).toBe(3);
    expect(ns.zombie.resource).toBe(1);
    expect(ns.zombie.hand.length).toBe(0);
  });

  it('rejects when not enough resource', () => {
    const s = baseState();
    s.zombie.resource = 1;
    const id = giveCard(s, 'zombie', 'z_basic'); // cost 2
    expect(() => reduce(s, { type: 'PLAY_FIGHTER', side: 'zombie', instanceId: id, lane: 0 })).toThrow(
      /not enough resource/,
    );
  });

  it('rejects occupied lane', () => {
    const s = baseState();
    s.zombie.resource = 5;
    placeFighter(s, 0, 'zombie', 'z_imp');
    const id = giveCard(s, 'zombie', 'z_basic');
    expect(() => reduce(s, { type: 'PLAY_FIGHTER', side: 'zombie', instanceId: id, lane: 0 })).toThrow(/occupied/);
  });

  it('plant cannot play fighter during ZOMBIE_PLAY', () => {
    const s = baseState(); // phase ZOMBIE_PLAY
    s.plant.resource = 5;
    const id = giveCard(s, 'plant', 'p_peashooter');
    expect(() => reduce(s, { type: 'PLAY_FIGHTER', side: 'plant', instanceId: id, lane: 0 })).toThrow(
      IllegalActionError,
    );
  });

  it('Sunflower onPlay ramps next-turn resource', () => {
    const s = baseState({ phase: 'PLANT_PLAY' });
    s.plant.resource = 2;
    const id = giveCard(s, 'plant', 'p_sunflower');
    const ns = reduce(s, { type: 'PLAY_FIGHTER', side: 'plant', instanceId: id, lane: 2 });
    expect(ns.plant.bonusResourceNextTurn).toBe(1);
  });
});
