import { describe, it, expect } from 'vitest';
import { resolveFight } from '../../src/engine/combat.ts';
import { reduce } from '../../src/engine/reduce.ts';
import { DEFAULT_CONFIG } from '../../src/config.ts';
import type { CombatEvent } from '../../src/engine/types.ts';
import { baseState, placeFighter } from './helpers.ts';

// 战斗动画事件流(§UX):UI 逐拍回放靠 state.combatEvents。
// 引擎逻辑不读它,只追加;这里锁定关键事件的形状与顺序。
const kinds = (evs: CombatEvent[]) => evs.map((e) => e.kind);

describe('resolveFight emits structured combat events', () => {
  it('mutual trade: laneStart → both hits → both destroys', () => {
    const s = baseState({ phase: 'ZOMBIE_TRICKS' });
    const z = placeFighter(s, 0, 'zombie', 'z_imp'); // 1/1
    const p = placeFighter(s, 0, 'plant', 'p_peashooter'); // 1/1
    resolveFight(s, DEFAULT_CONFIG);
    const evs = s.combatEvents!;
    expect(kinds(evs)).toEqual(['laneStart', 'hit', 'hit', 'destroy', 'destroy']);

    const [lane, zHit, pHit, d1, d2] = evs;
    expect(lane).toMatchObject({ kind: 'laneStart', lane: 0 });
    // 僵尸先攻 → 命中植物,植物濒死仍反击命中僵尸
    expect(zHit).toMatchObject({ kind: 'hit', attacker: 'zombie', target: 'fighter', instanceId: p.instanceId, amount: 1, hpAfter: 0 });
    expect(pHit).toMatchObject({ kind: 'hit', attacker: 'plant', target: 'fighter', instanceId: z.instanceId, amount: 1, hpAfter: 0 });
    // 死亡结算:植物先、僵尸后(resolveLane STEP3 顺序)
    expect(d1).toMatchObject({ kind: 'destroy', side: 'plant', instanceId: p.instanceId });
    expect(d2).toMatchObject({ kind: 'destroy', side: 'zombie', instanceId: z.instanceId });
  });

  it('empty lane hero hit carries hpAfter for the HP tick', () => {
    const s = baseState({ phase: 'ZOMBIE_TRICKS' });
    placeFighter(s, 2, 'zombie', 'z_imp'); // 1/1, 无植物阻挡 → 打脸
    resolveFight(s, DEFAULT_CONFIG);
    const hit = s.combatEvents!.find((e) => e.kind === 'hit');
    expect(hit).toMatchObject({ kind: 'hit', target: 'hero', heroSide: 'plant', amount: 1, hpAfter: 19 });
  });

  it('gravestone reveal emits a reveal event at end of plant phase (not at fight)', () => {
    // 出土时机改为植物出牌结束(PLANT_PLAY→ZOMBIE_TRICKS),不再在战斗开始翻面。
    const s = baseState({ phase: 'PLANT_PLAY' });
    const z = placeFighter(s, 0, 'zombie', 'z_smelly'); // gravestone
    z.gravestone = true;
    const s2 = reduce(s, { type: 'ADVANCE_PHASE', side: 'plant' });
    expect(s2.phase).toBe('ZOMBIE_TRICKS');
    expect(s2.combatEvents![0]).toMatchObject({ kind: 'reveal', lane: 0, instanceId: z.instanceId });
    expect(s2.lanes[0].zombie?.gravestone).toBe(false);
  });
});
