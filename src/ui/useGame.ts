import { useRef, useState } from 'react';
import type { GameAction, GameState } from '../engine/types.ts';
import { createInitialState, reduce } from '../engine/reduce.ts';
import { replay, type GameLog } from '../engine/replay.ts';

// UI 与引擎的薄绑定:本地跑 reduce,非法 action 捕获为 error 提示(§12.3)。
// 记录 seed + 成功应用的 actions → exportLog() 产出可重放日志(调试)。
export function useGame(initialSeed: string) {
  const [seed, setSeed] = useState(initialSeed);
  const [state, setState] = useState<GameState>(() => createInitialState({ seed: initialSeed }));
  const [error, setError] = useState<string | null>(null);
  const actionsRef = useRef<GameAction[]>([]);

  function apply(action: GameAction): void {
    try {
      const next = reduce(state, action);
      actionsRef.current.push(action); // 仅记录成功的 action(reduce 抛错不入日志)
      setError(null);
      setState(next);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function reset(newSeed: string): void {
    setSeed(newSeed);
    actionsRef.current = [];
    setState(createInitialState({ seed: newSeed }));
    setError(null);
  }

  // 可重放日志(JSON 字符串)。见 engine/replay.ts。
  function exportLog(): string {
    const log: GameLog = { seed, config: state.config, actions: actionsRef.current, engineLog: state.log };
    return JSON.stringify(log, null, 2);
  }

  // 导入日志:重放到该局面并从此继续(后续 action 追加,exportLog 仍是完整可重放链)。
  // 成功返回 null;失败(JSON 坏 / action 非法)返回错误字符串。
  function importLog(json: string): string | null {
    try {
      const log = JSON.parse(json) as GameLog;
      if (!log || typeof log.seed !== 'string' || !Array.isArray(log.actions)) {
        return 'not a valid game log (need { seed, actions })';
      }
      const resumed = replay(log); // action 非法会在此抛出
      setSeed(log.seed);
      actionsRef.current = [...log.actions];
      setState(resumed);
      setError(null);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }

  return { state, apply, error, reset, exportLog, importLog };
}
