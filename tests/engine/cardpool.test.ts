// 卡池 schema 校验守卫:真实卡池必须零问题;并证明校验器能咬住各类非法数据(否则它形同虚设)。
import { describe, it, expect } from 'vitest';
import { validateCardpool } from '../../src/engine/cardpool-validate.ts';
import { CARDPOOL } from '../../src/engine/cardpool.ts';
import type { Cardpool } from '../../src/engine/types.ts';

// 深克隆真实卡池,供各负例安全变异。
function clonePool(): Cardpool {
  return structuredClone(CARDPOOL);
}
const firstCardId = Object.keys(CARDPOOL.cards)[0];

describe('validateCardpool', () => {
  it('the shipped cardpool has zero schema problems', () => {
    expect(validateCardpool(CARDPOOL)).toEqual([]);
  });

  it('catches an unknown keyword', () => {
    const p = clonePool();
    p.cards[firstCardId].keywords.push('splashh'); // 拼错
    expect(validateCardpool(p).some((m) => /unknown keyword/.test(m))).toBe(true);
  });

  it('catches a value on a non-valued keyword', () => {
    const p = clonePool();
    p.cards[firstCardId].keywords.push('deadly:2'); // deadly 不带值
    expect(validateCardpool(p).some((m) => /takes no value/.test(m))).toBe(true);
  });

  it('catches an unknown effect kind', () => {
    const p = clonePool();
    // @ts-expect-error 故意注入非法 kind
    p.cards[firstCardId].onPlay = [{ kind: 'teleport', target: 'self' }];
    expect(validateCardpool(p).some((m) => /unknown effect kind/.test(m))).toBe(true);
  });

  it('catches a decklist referencing a missing card', () => {
    const p = clonePool();
    p.decklists.plant.push({ id: 'p_does_not_exist', copies: 1 });
    expect(validateCardpool(p).some((m) => /unknown card/.test(m))).toBe(true);
  });

  it('catches a superpower with a bad targeting spec', () => {
    const p = clonePool();
    // @ts-expect-error 故意注入非法 targeting
    p.superpowers.plant[0].targeting = 'wat';
    expect(validateCardpool(p).some((m) => /bad targeting/.test(m))).toBe(true);
  });

  it('catches a bad target ref inside an effect', () => {
    const p = clonePool();
    // @ts-expect-error 故意注入非法 target ref
    p.cards[firstCardId].onPlay = [{ kind: 'damage', amount: 1, target: 'nowhere' }];
    expect(validateCardpool(p).some((m) => /unknown target ref/.test(m))).toBe(true);
  });
});
