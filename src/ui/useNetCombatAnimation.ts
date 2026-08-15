import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../engine/types.ts';
import {
  EMPTY_FX,
  LANE_MS,
  REVEAL_MS,
  captionFor,
  fxAt,
  frameAt,
  groupSteps,
  type CombatFx,
  type Step,
} from './useCombatAnimation.ts';

// 联网版战斗回放。本地版拦截 apply→next;联网两端的 state 都是「被采用」的(乐观本地 / 远端实时),
// 没有 apply 可拦。故改为「监听 state 变化」:任一新 state 带 combatEvents 就从上一帧回放到它。
// 用队列保序:一场战斗被 Super-Block 切成多段(每段一次推送/采用),按到达顺序逐段回放,pre 各自正确。
type Pending = { pre: GameState; steps: Step[]; next: GameState };

export function useNetCombatAnimation(realState: GameState | null) {
  const [settled, setSettled] = useState<GameState | null>(realState);
  const [pending, setPending] = useState<Pending | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [pump, setPump] = useState(0); // 触发队列处理

  const settledRef = useRef<GameState | null>(realState); // 同步读「已落地帧」= 下段回放的 pre
  const queueRef = useRef<GameState[]>([]);
  const lastSeenRef = useRef<GameState | null>(realState);

  const commit = (s: GameState) => {
    settledRef.current = s;
    setSettled(s);
  };

  // 入队:realState 每次变化(新对象)入队;首个非空直接落地不回放。
  useEffect(() => {
    if (!realState || realState === lastSeenRef.current) return;
    lastSeenRef.current = realState;
    if (settledRef.current == null) {
      commit(realState);
      return;
    }
    queueRef.current.push(realState);
    setPump((p) => p + 1);
  }, [realState]);

  // 处理队列:连续无战斗事件的 state 直接落地;遇到带事件的就起一段回放并暂停。
  useEffect(() => {
    if (pending) return;
    let advanced = false;
    while (queueRef.current.length > 0) {
      const next = queueRef.current.shift()!;
      const evs = next.combatEvents ?? [];
      if (evs.length > 0) {
        setPending({ pre: settledRef.current!, steps: groupSteps(evs), next });
        setStepIdx(0);
        return;
      }
      commit(next);
      advanced = true;
    }
    void advanced;
  }, [pump, pending]);

  // 逐拍推进;到末拍落地到该段终局(next),清 pending → 继续处理队列。
  useEffect(() => {
    if (!pending) return;
    if (stepIdx >= pending.steps.length) {
      commit(pending.next);
      setPending(null);
      setStepIdx(0);
      setPump((p) => p + 1);
      return;
    }
    const dur = pending.steps[stepIdx].kind === 'reveal' ? REVEAL_MS : LANE_MS;
    const t = setTimeout(() => setStepIdx((i) => i + 1), dur);
    return () => clearTimeout(t);
  }, [pending, stepIdx]);

  // 跳过:丢弃队列与当前回放,直接跳到最新真实 state。
  function skip() {
    if (!pending && queueRef.current.length === 0) return;
    queueRef.current = [];
    if (realState) commit(realState);
    setPending(null);
    setStepIdx(0);
  }

  const animating = pending != null;
  let displayState = settled ?? realState;
  let fx: CombatFx = EMPTY_FX;
  let caption = '';
  if (pending) {
    const frame = frameAt(pending.pre, pending.steps, stepIdx);
    displayState = frame.state;
    fx = fxAt(pending.steps, stepIdx, frame.dying);
    caption = captionFor(frame.state, pending.steps[stepIdx]);
  }

  return { displayState, fx, animating, caption, skip };
}
