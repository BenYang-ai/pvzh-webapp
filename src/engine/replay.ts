// 全量重放:引擎确定性(seeded RNG)→ seed + config + 有序 actions 可精确复现整局。
// 调试用:Ben 复制 log 贴给我,replay(log) 复现 bug 局面,或转成回归测试。
import type { GameConfig } from '../config.ts';
import type { GameAction, GameState } from './types.ts';
import { createInitialState, reduce } from './reduce.ts';

export interface GameLog {
  seed: string;
  config?: GameConfig; // 缺省 = DEFAULT_CONFIG
  actions: GameAction[];
  engineLog?: string[]; // 人类可读事件快照(仅参考,不参与重放)
}

// 重放到最终局面。
export function replay(log: GameLog): GameState {
  let s = createInitialState({ seed: log.seed, config: log.config });
  for (const a of log.actions) s = reduce(s, a);
  return s;
}

// 逐步重放:返回每步后的 state(含初始态,长度 = actions.length + 1)。定位是哪一步出错。
export function replaySteps(log: GameLog): GameState[] {
  let s = createInitialState({ seed: log.seed, config: log.config });
  const out: GameState[] = [s];
  for (const a of log.actions) {
    s = reduce(s, a);
    out.push(s);
  }
  return out;
}
