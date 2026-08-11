import { useState } from 'react';
import type { GameAction, GameState } from '../engine/types.ts';
import { createInitialState, reduce } from '../engine/reduce.ts';

// UI 与引擎的薄绑定:本地跑 reduce,非法 action 捕获为 error 提示(§12.3)。
// M5 联网时,apply 之后再把 action/state 广播即可,引擎一行不改。
export function useGame(initialSeed: string) {
  const [state, setState] = useState<GameState>(() => createInitialState({ seed: initialSeed }));
  const [error, setError] = useState<string | null>(null);

  function apply(action: GameAction): void {
    try {
      const next = reduce(state, action);
      setError(null);
      setState(next);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function reset(seed: string): void {
    setState(createInitialState({ seed }));
    setError(null);
  }

  return { state, apply, error, reset };
}
