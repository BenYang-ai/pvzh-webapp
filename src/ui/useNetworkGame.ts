import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameAction, GameState } from '../engine/types.ts';
import { reduce } from '../engine/reduce.ts';
import { fetchRev, fetchRoom, pushState, subscribeRoom } from '../net/room.ts';

// 对账轮询间隔:实时事件尽力而为、可能丢包,漏掉的一步靠此在 1s 内补回(见 NETWORKING 时序修复)。
const RECONCILE_MS = 1000;

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

    // 对账:只有服务端 rev 比本地新才拉整局 state 并采用(rev 没涨 → 近零流量)。
    const reconcile = async () => {
      try {
        const rev = await fetchRev(code);
        if (!alive || rev == null || rev <= revRef.current) return;
        const snap = await fetchRoom(code);
        if (alive && snap && snap.rev > revRef.current) {
          adopt(snap.state, snap.rev);
          setError(null);
        }
      } catch {
        /* 轮询失败无害,下次再试 */
      }
    };

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

    const unsub = subscribeRoom(
      code,
      (snap) => {
        if (alive && snap.rev > revRef.current) {
          adopt(snap.state, snap.rev);
          setError(null);
        }
      },
      reconcile, // (重)订阅成功 → 立即对账,补回断线期间漏掉的步
    );

    // 定时对账(实时丢包兜底)+ 回到前台/唤醒时立即对账(iPad 睡眠、切标签是主要丢包窗口)。
    const timer = setInterval(reconcile, RECONCILE_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') reconcile();
    };
    document.addEventListener('visibilitychange', onVisible);

    setConnected(true);
    return () => {
      alive = false;
      setConnected(false);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
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
