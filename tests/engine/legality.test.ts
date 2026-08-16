// legality.ts 是 reduce 校验与 selectors UI 查询的唯一事实源。
// 核心不变式:enumerateTargets(高亮)与 validateTarget(校验)对同一张 fighter 判定必须一致 —— 二者永不漂移。
import { describe, it, expect } from 'vitest';
import { baseState, placeFighter } from './helpers.ts';
import type { GameState, Side, TargetSpec } from '../../src/engine/types.ts';
import type { SuperpowerTargeting } from '../../src/engine/types.ts';
import { enumerateTargets, validateTarget } from '../../src/engine/legality.ts';

type AnySpec = TargetSpec | SuperpowerTargeting;
// 'none' 不参与「枚举 ⟺ 校验」不变式(无目标 spec:传入目标被忽略而非拒绝),单列在下方测试。
const SPECS: AnySpec[] = ['friendlyFighter', 'enemyFighter', 'anyFighter', 'friendlyFighterThenLane'];

// 铺一个双方各若干 fighter 的棋盘,覆盖 gravestone / untrickable / 各种 attack。
function boardWithFighters(): GameState {
  const s = baseState({ phase: 'PLANT_PLAY' });
  placeFighter(s, 0, 'plant', 'p_peashooter'); // 1/1 普通
  placeFighter(s, 1, 'plant', 'p_snapdragon'); // 4/3
  const grave = placeFighter(s, 2, 'zombie', 'z_smelly'); // gravestone
  grave.gravestone = true;
  const untrick = placeFighter(s, 3, 'zombie', 'z_imp');
  untrick.keywords.push('untrickable');
  placeFighter(s, 4, 'zombie', 'z_spacecowboy'); // 4/5 普通
  return s;
}

describe('legality target agreement (enumerate ⟺ validate)', () => {
  for (const spec of SPECS) {
    for (const side of ['plant', 'zombie'] as Side[]) {
      it(`${spec} / ${side}: every enumerated target validates, and nothing else does`, () => {
        const s = boardWithFighters();
        // minAttack 只对 enemyFighter 有意义;这里取一个能真正过滤掉部分目标的值。
        const opts = spec === 'enemyFighter' ? { minAttack: 5 } : undefined;
        const allowed = new Set(
          enumerateTargets(s, side, spec, opts).map((t) => `${t.side}:${t.lane}`),
        );

        // 遍历棋盘上每个坐标,断言 validate 结果与 enumerate 是否包含它完全一致。
        for (let lane = 0; lane < s.lanes.length; lane++) {
          for (const tSide of ['plant', 'zombie'] as Side[]) {
            if (!s.lanes[lane][tSide]) continue;
            const key = `${tSide}:${lane}`;
            const reason = validateTarget(s, side, spec, { lane, side: tSide }, opts);
            if (allowed.has(key)) {
              expect(reason, `${key} enumerated → must validate`).toBeNull();
            } else {
              expect(reason, `${key} not enumerated → must reject`).not.toBeNull();
            }
          }
        }
      });
    }
  }

  it('none never enumerates and never requires a target', () => {
    const s = boardWithFighters();
    expect(enumerateTargets(s, 'plant', 'none')).toEqual([]);
    expect(validateTarget(s, 'plant', 'none', undefined)).toBeNull();
  });

  it('untrickable enemy is rejected but same fighter is a legal friendly target', () => {
    const s = baseState({ phase: 'PLANT_PLAY' });
    const f = placeFighter(s, 0, 'zombie', 'z_imp');
    f.keywords.push('untrickable');
    // 敌方(plant 打 zombie)→ 挡
    expect(validateTarget(s, 'plant', 'enemyFighter', { lane: 0, side: 'zombie' })).toMatch(/untrickable/);
    // 友方(zombie 打自己)→ 不受 untrickable 限制
    expect(validateTarget(s, 'zombie', 'friendlyFighter', { lane: 0, side: 'zombie' })).toBeNull();
  });

  it('hidden gravestone is never a legal target for either side', () => {
    const s = baseState({ phase: 'PLANT_PLAY' });
    const g = placeFighter(s, 0, 'zombie', 'z_smelly');
    g.gravestone = true;
    expect(validateTarget(s, 'plant', 'enemyFighter', { lane: 0, side: 'zombie' })).toMatch(/gravestone/);
    expect(validateTarget(s, 'zombie', 'friendlyFighter', { lane: 0, side: 'zombie' })).toMatch(/gravestone/);
    expect(enumerateTargets(s, 'plant', 'enemyFighter').some((t) => t.lane === 0)).toBe(false);
  });
});
