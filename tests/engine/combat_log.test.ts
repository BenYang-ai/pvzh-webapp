import { describe, it, expect } from 'vitest';
import { resolveFight } from '../../src/engine/combat.ts';
import { DEFAULT_CONFIG } from '../../src/config.ts';
import { baseState, placeFighter } from './helpers.ts';

// 战斗日志:exportLog 里的 engineLog 靠这些行自解释(定位 bug 用)。
describe('combat writes a readable event log', () => {
  it('logs the fight header and each hit', () => {
    const s = baseState({ phase: 'ZOMBIE_TRICKS' });
    placeFighter(s, 0, 'zombie', 'z_imp'); // 1/1
    placeFighter(s, 0, 'plant', 'p_peashooter'); // 1/1
    resolveFight(s, DEFAULT_CONFIG);
    const text = s.log.join('\n');
    expect(text).toMatch(/fight \(turn 1\)/);
    expect(text).toMatch(/Imp .* hits Peashooter/);
    expect(text).toMatch(/destroyed/);
  });

  it('logs bullseye going to the hero (the confusing case)', () => {
    const s = baseState({ phase: 'ZOMBIE_TRICKS' });
    placeFighter(s, 0, 'zombie', 'z_smelly'); // gravestone+deadly 2/4
    placeFighter(s, 0, 'plant', 'p_cactus'); // 2/5 bullseye
    resolveFight(s, DEFAULT_CONFIG);
    expect(s.log.join('\n')).toMatch(/Cactus .* bullseye → zombie hero/);
  });
});
