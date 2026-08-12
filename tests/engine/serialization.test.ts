import { describe, it, expect } from 'vitest';
import { createInitialState, reduce } from '../../src/engine/reduce.ts';

// M5 联网:整局 GameState 走 Supabase jsonb。确保 JSON 往返后 reduce 行为不变(无 Map/Set/undefined 陷阱)。
describe('GameState is jsonb-safe (M5 sync)', () => {
  it('survives JSON round-trip and reduces identically', () => {
    const s0 = createInitialState({ seed: 'sync-test' });
    const round = JSON.parse(JSON.stringify(s0)) as typeof s0;
    expect(round).toEqual(s0);

    // 从原始与往返各推进一步,结果一致
    const a = reduce(s0, { type: 'ADVANCE_PHASE', side: 'zombie' });
    const b = reduce(round, { type: 'ADVANCE_PHASE', side: 'zombie' });
    expect(JSON.parse(JSON.stringify(b))).toEqual(JSON.parse(JSON.stringify(a)));
  });

  it('carries config through the round-trip (superblock mode preserved)', () => {
    const s0 = createInitialState({ seed: 'cfg' });
    const round = JSON.parse(JSON.stringify(s0)) as typeof s0;
    expect(round.config.superblock.mode).toBe('faithful');
  });
});
