import { describe, expect, test } from 'vitest';
import { reduce } from '../../src/engine/reduce.ts';
import { castableSuperpowers } from '../../src/engine/selectors.ts';
import { baseState, placeFighter } from './helpers.ts';
import type { GameState } from '../../src/engine/types.ts';

// 战斗中途 Super-Block 授予超能力 → 暂停战斗,给该方即时打出/跳过的机会。
// 场景:僵尸 turn 结束进入 fight;plant 槽差 1 格满(7),lane0 imp 直击 plant hero 触发。
function fightWith(zLanes: number[], plantMeter = 7): GameState {
  const s = baseState({ phase: 'ZOMBIE_TRICKS', turn: 5 });
  zLanes.forEach((l) => placeFighter(s, l, 'zombie', 'z_imp'));
  s.plant.hero.blockMeter = plantMeter;
  return reduce(s, { type: 'ADVANCE_PHASE', side: 'zombie' }); // → fight
}

describe('Super-Block mid-fight interrupt', () => {
  test('meter filling during fight pauses the fight and offers the superpower', () => {
    const s = fightWith([0, 1]);
    expect(s.phase).toBe('SUPERPOWER_INTERRUPT');
    expect(s.interrupts?.map((i) => i.side)).toEqual(['plant']);
    expect(s.plant.hero.readySuperpowers.length).toBeGreaterThan(0);
    expect(s.plant.hero.hp).toBe(20); // lane0 hit fully blocked
    expect(s.fightResume).toEqual({ nextLane: 1 }); // lane1 still pending
  });

  test('skipping keeps the superpower and resumes the rest of the fight', () => {
    const s0 = fightWith([0, 1]);
    const s = reduce(s0, { type: 'ADVANCE_PHASE', side: 'plant' }); // skip
    expect(s.turn).toBe(6); // fight finished, next turn started
    expect(s.phase).toBe('ZOMBIE_PLAY');
    expect(s.plant.hero.readySuperpowers.length).toBeGreaterThan(0); // kept for later
    expect(s.plant.hero.hp).toBe(19); // lane1 imp resolved after resume (meter reset → 1 dmg)
    expect(s.interrupts).toBeUndefined();
    expect(s.fightResume).toBeNull();
  });

  test('playing the superpower during the interrupt consumes it, then resumes', () => {
    const s0 = fightWith([0]);
    s0.plant.hero.readySuperpowers = ['gs_whirlwind']; // 定点为无目标 SP(bounce random),便于确定性
    s0.interrupts = [{ side: 'plant', spId: 'gs_whirlwind' }]; // 中断“刚授予”那张=whirlwind(与 tray 对齐)
    const s = reduce(s0, { type: 'PLAY_SUPERPOWER', side: 'plant' });
    expect(s.plant.hero.readySuperpowers).toHaveLength(0); // consumed
    expect(s.turn).toBe(6); // only lane0 → resume completes → next turn
    expect(s.phase).toBe('ZOMBIE_PLAY');
    expect(s.interrupts).toBeUndefined();
  });

  // 回归:只有“本回合刚授予”那张 SP 在中断窗口免费;上一轮留下的旧 SP 不可在战斗中打(须留到本方 trick 窗口花 1 费)。
  test('an OLD held superpower cannot be played (nor is free) during a later interrupt', () => {
    const s0 = fightWith([0]);
    placeFighter(s0, 2, 'plant', 'p_peashooter'); // embiggen 的友方目标
    // 场景:plant 上一轮已持有 whirlwind,本次中断刚授予 embiggen。
    s0.plant.hero.readySuperpowers = ['gs_whirlwind', 'gs_embiggen'];
    s0.interrupts = [{ side: 'plant', spId: 'gs_embiggen' }];

    // 试图打旧的 whirlwind → 非法(战斗中不可打旧超能力)。
    expect(() => reduce(s0, { type: 'PLAY_SUPERPOWER', side: 'plant', superpowerId: 'gs_whirlwind' })).toThrow();

    // UI 侧:中断窗口只把刚授予的 embiggen 列为可即时施放,旧的 whirlwind 不在其中。
    const castable = castableSuperpowers(s0, 'plant').map((sp) => sp.id);
    expect(castable).toEqual(['gs_embiggen']);

    // 打刚授予的 embiggen(友方 +2/+2,需目标本方 fighter)→ 免费消耗,续算战斗;whirlwind 保留待后打。
    const s = reduce(s0, {
      type: 'PLAY_SUPERPOWER',
      side: 'plant',
      superpowerId: 'gs_embiggen',
      target: { lane: 2, side: 'plant' },
    });
    expect(s.plant.hero.readySuperpowers).toEqual(['gs_whirlwind']); // 旧的仍在(战斗中不可打,留到本方 trick 窗口)
  });

  test('the interrupt side cannot advance for the other side', () => {
    const s = fightWith([0]);
    expect(() => reduce(s, { type: 'ADVANCE_PHASE', side: 'zombie' })).toThrow();
  });

  test('both sides charging in one fight are offered one after another', () => {
    // lane0: zombie 直击 plant hero(charge plant);lane1: plant 直击 zombie hero(charge zombie)。
    const s = baseState({ phase: 'ZOMBIE_TRICKS', turn: 5 });
    placeFighter(s, 0, 'zombie', 'z_imp');
    placeFighter(s, 1, 'plant', 'p_peashooter');
    s.plant.hero.blockMeter = 7;
    s.zombie.hero.blockMeter = 7;

    const s1 = reduce(s, { type: 'ADVANCE_PHASE', side: 'zombie' }); // → fight, pause after lane0
    expect(s1.phase).toBe('SUPERPOWER_INTERRUPT');
    expect(s1.interrupts?.map((i) => i.side)).toEqual(['plant']);

    const s2 = reduce(s1, { type: 'ADVANCE_PHASE', side: 'plant' }); // plant skips → resume → lane1 pauses
    expect(s2.phase).toBe('SUPERPOWER_INTERRUPT');
    expect(s2.interrupts?.map((i) => i.side)).toEqual(['zombie']);
    expect(s2.zombie.hero.readySuperpowers.length).toBeGreaterThan(0);

    const s3 = reduce(s2, { type: 'ADVANCE_PHASE', side: 'zombie' }); // zombie skips → fight done
    expect(s3.phase).toBe('ZOMBIE_PLAY');
    expect(s3.turn).toBe(6);
    expect(s3.interrupts).toBeUndefined();
  });

  test('no interrupt when the meter does not fill during the fight', () => {
    const s = fightWith([0], 0); // meter starts at 0 → imp adds <8 → no grant
    expect(s.phase).toBe('ZOMBIE_PLAY'); // fight ran through, next turn
    expect(s.plant.hero.readySuperpowers).toHaveLength(0);
    expect(s.interrupts).toBeUndefined();
  });
});
