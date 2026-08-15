import { describe, it, expect } from 'vitest';
import { normalizeSecret, checkSecret, roomIdFromSecret } from '../src/net/access.ts';

describe('access gate secret', () => {
  it('normalizes case, trims, collapses whitespace', () => {
    expect(normalizeSecret('  Summit   Close ')).toBe('summit close');
    expect(normalizeSecret('SUMMIT CLOSE')).toBe('summit close');
  });

  it('accepts the family word regardless of case/spacing', () => {
    expect(checkSecret('summit close')).toBe(true);
    expect(checkSecret('  Summit  Close  ')).toBe(true);
    expect(checkSecret('SUMMIT CLOSE')).toBe(true);
  });

  it('rejects wrong words', () => {
    expect(checkSecret('open sesame')).toBe(false);
    expect(checkSecret('summitclose')).toBe(false); // 少了空格 → 不同
    expect(checkSecret('')).toBe(false);
  });

  it('slugs the secret into a stable room id', () => {
    expect(roomIdFromSecret('summit close')).toBe('summit-close');
    expect(roomIdFromSecret('  Summit  Close ')).toBe('summit-close');
    expect(roomIdFromSecret('!!!')).toBe('room'); // 全非法字符 → 兜底
  });
});
