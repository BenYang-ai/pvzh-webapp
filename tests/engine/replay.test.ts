import { describe, it, expect } from 'vitest';
import type { GameAction } from '../../src/engine/types.ts';
import { createInitialState, reduce } from '../../src/engine/reduce.ts';
import { replay, replaySteps, type GameLog } from '../../src/engine/replay.ts';

// 用真实对局产出 action 序列,验证 replay 精确复现(确定性)。
function recordSomeGame(seed: string): { log: GameLog; finalPhase: string } {
  let s = createInitialState({ seed });
  const actions: GameAction[] = [];
  const drive = (a: GameAction) => {
    s = reduce(s, a);
    actions.push(a);
  };
  // 走一整回合:zombie play → plant play → zombie tricks →(自动战斗)→ 下回合
  drive({ type: 'ADVANCE_PHASE', side: 'zombie' });
  drive({ type: 'ADVANCE_PHASE', side: 'plant' });
  drive({ type: 'ADVANCE_PHASE', side: 'zombie' });
  return { log: { seed, actions, config: s.config }, finalPhase: s.phase };
}

describe('replay (debug log)', () => {
  it('reproduces the exact final state from seed + actions', () => {
    const { log } = recordSomeGame('replay-seed');
    const direct = replay(log);
    // 与手动重跑逐字节一致
    let s = createInitialState({ seed: log.seed, config: log.config });
    for (const a of log.actions) s = reduce(s, a);
    expect(JSON.parse(JSON.stringify(direct))).toEqual(JSON.parse(JSON.stringify(s)));
  });

  it('replaySteps returns one state per step plus the initial', () => {
    const { log } = recordSomeGame('steps-seed');
    const steps = replaySteps(log);
    expect(steps).toHaveLength(log.actions.length + 1);
    expect(steps[0].turn).toBe(1);
  });

  it('round-trips through JSON (as pasted from the clipboard)', () => {
    const { log } = recordSomeGame('json-seed');
    const pasted = JSON.parse(JSON.stringify(log)) as GameLog;
    expect(replay(pasted).turn).toBe(replay(log).turn);
  });
});
