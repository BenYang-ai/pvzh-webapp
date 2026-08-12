import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameAction, GameState } from '../engine/types.ts';
import { reduce } from '../engine/reduce.ts';
import { fetchRoom, pushState, subscribeRoom } from '../net/room.ts';

// 联网对局:权威 state 存 Supabase 单行。本地乐观 reduce + 推送;订阅远端更新(去回声靠 rev)。
export function useNetworkGame(code: string) {
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const revRef = useRef(-1);
  const stateRef = useRef<GameState | null>(null);

  const adopt = useCallback((s: GameState, rev: number) => {
    stateRef.current = s;
    revRef.current = rev;
    setState(s);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchRoom(code)
      .then((snap) => {
        if (!alive) return;
        if (!snap) {
          setError(`room "${code}" not found — create it on the other device first`);
          return;
        }
        adopt(snap.state, snap.rev);
      })
      .catch((e) => alive && setError((e as Error).message));

    const unsub = subscribeRoom(code, (snap) => {
      if (alive && snap.rev > revRef.current) {
        adopt(snap.state, snap.rev);
        setError(null);
      }
    });
    setConnected(true);
    return () => {
      alive = false;
      setConnected(false);
      unsub();
    };
  }, [code, adopt]);

  const apply = useCallback(
    (action: GameAction) => {
      const cur = stateRef.current;
      if (!cur) return;
      let next: GameState;
      try {
        next = reduce(cur, action);
      } catch (e) {
        setError((e as Error).message);
        return;
      }
      setError(null);
      const newRev = revRef.current + 1;
      adopt(next, newRev); // 乐观本地应用
      pushState(code, newRev, next).catch((e) => setError(`sync: ${(e as Error).message}`));
    },
    [code, adopt],
  );

  return { state, apply, error, connected };
}
