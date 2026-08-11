import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config.ts';

// M0 冒烟测试:确认 test pipeline + config 常量到位。引擎测试从 M1 起。
describe('scaffold smoke', () => {
  it('config has spec-mandated defaults', () => {
    expect(DEFAULT_CONFIG.heroStartHp).toBe(20);
    expect(DEFAULT_CONFIG.laneCount).toBe(5);
    expect(DEFAULT_CONFIG.blockMeterMax).toBe(8);
    expect(DEFAULT_CONFIG.deckSize).toBe(40);
    expect(DEFAULT_CONFIG.superblock.mode).toBe('faithful');
  });
});
