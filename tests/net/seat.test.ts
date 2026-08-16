import { describe, it, expect } from 'vitest';
import { mySeat, openSeats, isFull, nameBlocked, type Claims } from '../../src/net/seat.ts';
import type { PlayerNames } from '../../src/net/room.ts';

const ME = 'tok-me';
const OTHER = 'tok-other';

describe('mySeat — which side this device holds', () => {
  it('returns the side whose token matches mine', () => {
    expect(mySeat({ plant: ME, zombie: OTHER }, ME)).toBe('plant');
    expect(mySeat({ plant: OTHER, zombie: ME }, ME)).toBe('zombie');
  });
  it('null when I hold neither seat', () => {
    expect(mySeat({ plant: OTHER }, ME)).toBeNull();
    expect(mySeat({}, ME)).toBeNull();
  });
  it('empty/undefined tokens never match (no "myself twice")', () => {
    expect(mySeat({ plant: null, zombie: undefined }, ME)).toBeNull();
  });
});

describe('openSeats', () => {
  it('lists sides with no token', () => {
    expect(openSeats({ plant: OTHER })).toEqual(['zombie']);
    expect(openSeats({})).toEqual(['plant', 'zombie']);
    expect(openSeats({ plant: ME, zombie: OTHER })).toEqual([]);
  });
});

describe('isFull — both taken and neither is mine', () => {
  it('true only when both seats held by others', () => {
    expect(isFull({ plant: OTHER, zombie: 'tok-3' }, ME)).toBe(true);
  });
  it('false when I already hold a seat (reconnect, not takeover)', () => {
    expect(isFull({ plant: ME, zombie: OTHER }, ME)).toBe(false);
  });
  it('false when a seat is open', () => {
    expect(isFull({ plant: OTHER }, ME)).toBe(false);
    expect(isFull({}, ME)).toBe(false);
  });
});

describe('nameBlocked — dup-identity guard', () => {
  const names: PlayerNames = { plant: 'Miles', zombie: undefined };
  const claims: Claims = { plant: OTHER, zombie: undefined };

  it("blocks a name the other occupied seat already uses", () => {
    expect(nameBlocked(claims, names, ME, 'Miles')).toBe(true);
  });
  it('allows a free name', () => {
    expect(nameBlocked(claims, names, ME, 'Ben')).toBe(false);
  });
  it('does not block my own seat name (reconnect keeps name)', () => {
    expect(nameBlocked({ plant: ME }, { plant: 'Ben' }, ME, 'Ben')).toBe(false);
  });
  it('name on an empty (no-token) seat does not block', () => {
    expect(nameBlocked({ plant: undefined }, { plant: 'Ben' }, ME, 'Ben')).toBe(false);
  });
});
