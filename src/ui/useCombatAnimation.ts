import { useEffect, useRef, useState } from 'react';
import type { CombatEvent, Fighter, GameAction, GameState, Side } from '../engine/types.ts';
import { getCard } from '../engine/cardpool.ts';

// 战斗动画层(本地 god-view 专用,§UX)。
// 引擎一次 apply 原子结算整场战斗,UI 会瞬间跳到终局 → 无“打”的感觉。
// 这里拦截 apply:若产出 combatEvents,则先按 lane 逐拍回放(闪 lane / 飘 -N / 掉血 / 淡出),
// 再落到真实终局 state。中断会把整场切成多段 reduce → 每段各自回放,天然“打到中断处暂停”。

const LANE_MS = 750; // 每条 lane 结算耗时(Ben 调慢,原 450 太快)
const REVEAL_MS = 500; // gravestone 翻面预演

// 当前拍要展示的叠加特效(Board/HeroBar/LaneRow 消费)。
export interface CombatFx {
  flashLane: number | null; // 正在结算的 lane(双方高亮)
  dying: Set<string>; // 本拍被摧毁、正在淡出的 fighter instanceId
  blockedHeroes: Set<Side>; // 本拍 Super-Block 完全格挡的一方(hero bar 闪)
  floats: FloatFx[]; // 本拍飘的伤害数字
}
export interface FloatFx {
  key: string;
  amount: number;
  instanceId?: string; // 命中 fighter → 该 fighter 位置
  heroSide?: Side; // 命中 hero → 该 hero bar
}
const EMPTY_FX: CombatFx = { flashLane: null, dying: new Set(), blockedHeroes: new Set(), floats: [] };

type Step = { kind: 'reveal' | 'combat'; lane: number | null; events: CombatEvent[] };

// 把线性事件流按 lane 切成拍:连续 reveal 合成一拍;每个 laneStart 起一拍。
function groupSteps(events: CombatEvent[]): Step[] {
  const steps: Step[] = [];
  let cur: Step | null = null;
  for (const e of events) {
    if (e.kind === 'reveal') {
      if (!cur || cur.kind !== 'reveal') {
        cur = { kind: 'reveal', lane: null, events: [] };
        steps.push(cur);
      }
      cur.events.push(e);
    } else if (e.kind === 'laneStart') {
      cur = { kind: 'combat', lane: e.lane, events: [e] };
      steps.push(cur);
    } else {
      if (!cur) {
        cur = { kind: 'combat', lane: 'lane' in e ? e.lane : null, events: [] };
        steps.push(cur);
      }
      cur.events.push(e);
    }
  }
  return steps;
}

function findFighter(s: GameState, instanceId: string): Fighter | null {
  for (const lane of s.lanes) {
    if (lane.plant?.instanceId === instanceId) return lane.plant;
    if (lane.zombie?.instanceId === instanceId) return lane.zombie;
  }
  return null;
}

const cardName = (f: Fighter | null | undefined) => (f ? getCard(f.cardId).name : null);

// 为当前拍合成一条中间区显示的说明(跟着 lane 逐拍走)。frame = 已应用本拍命中的中间帧,
// 死者本拍仅标记未移除 → 名字仍可查。
function captionFor(frame: GameState, step: Step | undefined): string {
  if (!step) return '';
  if (step.kind === 'reveal') return 'Revealing gravestones…';
  const L = step.lane != null ? `L${step.lane + 1}` : '';
  const parts: string[] = [];
  for (const e of step.events) {
    if (e.kind === 'hit') {
      const atk = cardName(frame.lanes[e.lane]?.[e.attacker]) ?? e.attacker;
      const tgt =
        e.target === 'hero'
          ? `${e.heroSide} hero`
          : (cardName(e.instanceId ? findFighter(frame, e.instanceId) : null) ?? 'fighter');
      parts.push(`${atk} → ${tgt} -${e.amount}`);
    } else if (e.kind === 'blocked') {
      parts.push(`${e.heroSide} Super-Block!`);
    } else if (e.kind === 'destroy') {
      parts.push(`${cardName(findFighter(frame, e.instanceId)) ?? 'fighter'} destroyed`);
    } else if (e.kind === 'frenzy') {
      parts.push(`${cardName(findFighter(frame, e.instanceId)) ?? 'zombie'} frenzy`);
    }
  }
  return parts.length ? `${L}: ${parts.join(' · ')}` : L;
}

// 累积回放到第 idx 拍:此前拍全落实(掉血 + 移除死者 + 翻面),本拍死者只标 dying(下拍才移除)。
function frameAt(pre: GameState, steps: Step[], idx: number): { state: GameState; dying: Set<string> } {
  const s = structuredClone(pre);
  const dying = new Set<string>();
  for (let i = 0; i <= idx && i < steps.length; i++) {
    const current = i === idx;
    for (const e of steps[i].events) {
      if (e.kind === 'reveal') {
        const f = findFighter(s, e.instanceId);
        if (f) f.gravestone = false;
      } else if (e.kind === 'hit') {
        if (e.target === 'hero' && e.heroSide) s[e.heroSide].hero.hp = e.hpAfter;
        else if (e.instanceId) {
          const f = findFighter(s, e.instanceId);
          if (f) f.health = e.hpAfter;
        }
      } else if (e.kind === 'destroy') {
        if (current) dying.add(e.instanceId); // 本拍淡出,保留卡面
        else s.lanes[e.lane][e.side] = null; // 更早的死者已移除
      }
    }
  }
  return { state: s, dying };
}

function fxAt(steps: Step[], idx: number, dying: Set<string>): CombatFx {
  const step = steps[idx];
  if (!step) return EMPTY_FX;
  const floats: FloatFx[] = [];
  const blockedHeroes = new Set<Side>();
  for (const e of step.events) {
    if (e.kind === 'hit' && e.amount > 0) {
      floats.push({
        key: `${idx}-${e.target}-${e.instanceId ?? e.heroSide}`,
        amount: e.amount,
        instanceId: e.target === 'fighter' ? e.instanceId : undefined,
        heroSide: e.target === 'hero' ? e.heroSide : undefined,
      });
    } else if (e.kind === 'blocked') {
      blockedHeroes.add(e.heroSide);
    }
  }
  return { flashLane: step.lane, dying, blockedHeroes, floats };
}

// 包裹 useGame 的 state/apply,增加战斗回放。displayState = 回放中的中间帧,否则真实 state。
export function useCombatAnimation(realState: GameState, rawApply: (a: GameAction) => GameState | null) {
  const [pending, setPending] = useState<{ pre: GameState; steps: Step[] } | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const preRef = useRef<GameState>(realState); // 上一帧真实 state = 下次战斗的“战前局面”

  // 拦截 apply:先记战前局面,再应用;若有 combatEvents 则进入回放。
  function apply(action: GameAction): void {
    if (pending) return; // 回放中不接受新操作(点击会触发 skip)
    const pre = preRef.current;
    const next = rawApply(action);
    if (next) {
      preRef.current = next;
      const evs = next.combatEvents ?? [];
      if (evs.length > 0) {
        setPending({ pre, steps: groupSteps(evs) });
        setStepIdx(0);
      }
    }
  }

  // 逐拍推进。到末拍后落到真实终局(清 pending)。
  useEffect(() => {
    if (!pending) return;
    if (stepIdx >= pending.steps.length) {
      setPending(null);
      setStepIdx(0);
      return;
    }
    const dur = pending.steps[stepIdx].kind === 'reveal' ? REVEAL_MS : LANE_MS;
    const t = setTimeout(() => setStepIdx((i) => i + 1), dur);
    return () => clearTimeout(t);
  }, [pending, stepIdx]);

  // pending 期间不同步 preRef(它已在 apply 里设为 next);非回放时跟随真实 state。
  useEffect(() => {
    if (!pending) preRef.current = realState;
  }, [realState, pending]);

  function skip() {
    if (pending) {
      setPending(null);
      setStepIdx(0);
    }
  }

  const animating = pending != null;
  let displayState = realState;
  let fx = EMPTY_FX;
  let caption = ''; // 回放中:当前拍说明;非回放留空(UI 回落到真实日志末行)
  if (pending) {
    const frame = frameAt(pending.pre, pending.steps, stepIdx);
    displayState = frame.state;
    fx = fxAt(pending.steps, stepIdx, frame.dying);
    caption = captionFor(frame.state, pending.steps[stepIdx]);
  }

  return { displayState, fx, animating, caption, apply, skip };
}
