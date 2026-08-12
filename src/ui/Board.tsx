import { useState } from 'react';
import type { GameAction, GameState, Phase, Side, Superpower } from '../engine/types.ts';
import { getCard } from '../engine/cardpool.ts';
import {
  activeSide,
  canAfford,
  canPlayCardNow,
  canPlayFighterNow,
  canPlaySuperpowerNow,
  canPlayTrickNow,
  emptyLanes,
  offeredSuperpowers,
  readySuperpower,
  superpowerTargets,
  trickTargets,
} from '../engine/selectors.ts';
import { CardFace } from './CardFace.tsx';

type Selection = { side: Side; instanceId: string } | null;
// 超能力施放中:sp 需目标时进入;friendlyFighterThenLane(Carried Away)先选 fighter(target)再选 lane。
type SPSelection = { side: Side; sp: Superpower; target?: { lane: number; side: Side } } | null;

export interface BoardProps {
  state: GameState;
  apply: (action: GameAction) => void;
  error: string | null;
  viewSide?: Side; // 未设 = 本地 god-view(双方可操作、全可见)。设 = 单侧视角。
  onNewGame?: () => void; // 本地模式
  onLeave?: () => void; // 联网模式
  banner?: string | null; // 联网状态提示(连接中/对手回合)
  getLog?: () => string; // 提供 → 显示 "Copy log" 按钮(可重放日志)
  onImportLog?: (json: string) => string | null; // 提供 → 显示 "Load log";返回错误字符串或 null
}

const PHASE_LABEL: Record<Phase, string> = {
  ZOMBIE_PLAY: 'Zombie plays',
  PLANT_PLAY: 'Plant plays',
  ZOMBIE_TRICKS: 'Zombie tricks',
  FIGHT: 'Fight!',
  GAME_OVER: 'Game over',
};

function advanceLabel(phase: Phase): string {
  switch (phase) {
    case 'ZOMBIE_PLAY':
      return 'End zombie play ▶';
    case 'PLANT_PLAY':
      return 'End plant play ▶';
    case 'ZOMBIE_TRICKS':
      return 'End tricks & fight ⚔️';
    case 'FIGHT':
      return 'Resolve fight ⚔️';
    default:
      return '';
  }
}

export function Board({ state, apply, error, viewSide, onNewGame, onLeave, banner, getLog, onImportLog }: BoardProps) {
  const [sel, setSel] = useState<Selection>(null);
  const [spSel, setSpSel] = useState<SPSelection>(null);

  const active = activeSide(state);
  // 该 side 是否归本视角操作(god-view 全部可操作)。
  const mine = (side: Side) => viewSide == null || side === viewSide;
  const selRef = sel ? state[sel.side].hand.find((r) => r.instanceId === sel.instanceId) : undefined;
  const selCard = selRef ? getCard(selRef.cardId) : null;

  // 高亮集合。超能力施放优先于手牌选择。
  const highlightLanes = new Set<string>(); // `${side}:${lane}`
  if (spSel) {
    if (spSel.sp.targeting === 'friendlyFighterThenLane' && spSel.target) {
      emptyLanes(state, spSel.side).forEach((l) => highlightLanes.add(`${spSel.side}:${l}`));
    } else {
      superpowerTargets(state, spSel.side, spSel.sp).forEach((t) => highlightLanes.add(`${t.side}:${t.lane}`));
    }
  } else if (sel && selCard) {
    if (selCard.type === 'fighter' && canPlayFighterNow(state, sel.side)) {
      emptyLanes(state, sel.side).forEach((l) => highlightLanes.add(`${sel.side}:${l}`));
    } else if (selCard.type === 'trick') {
      trickTargets(state, sel.side, selCard).forEach((t) => highlightLanes.add(`${t.side}:${t.lane}`));
    }
  }

  function selectHandCard(side: Side, instanceId: string) {
    if (state.phase === 'GAME_OVER' || !mine(side)) return;
    setSpSel(null);
    const ref = state[side].hand.find((r) => r.instanceId === instanceId)!;
    const card = getCard(ref.cardId);
    if (sel && sel.instanceId === instanceId) {
      setSel(null);
      return;
    }
    if (card.type === 'fighter') {
      if (!canPlayFighterNow(state, side)) return;
      setSel({ side, instanceId });
    } else {
      if (!canPlayTrickNow(state, side)) return;
      if ((card.targeting ?? 'none') === 'none') {
        apply({ type: 'PLAY_TRICK', side, instanceId });
        setSel(null);
      } else {
        setSel({ side, instanceId });
      }
    }
  }

  function clickLane(side: Side, lane: number) {
    const key = `${side}:${lane}`;
    if (!highlightLanes.has(key)) return;

    if (spSel) {
      const sp = spSel.sp;
      if (sp.targeting === 'friendlyFighterThenLane') {
        if (!spSel.target) {
          setSpSel({ ...spSel, target: { lane, side } });
          return;
        }
        apply({ type: 'PLAY_SUPERPOWER', side: spSel.side, target: spSel.target, toLane: lane });
      } else {
        apply({ type: 'PLAY_SUPERPOWER', side: spSel.side, target: { lane, side } });
      }
      setSpSel(null);
      return;
    }

    if (!sel || !selCard) return;
    if (selCard.type === 'fighter') {
      apply({ type: 'PLAY_FIGHTER', side: sel.side, instanceId: sel.instanceId, lane });
    } else {
      apply({ type: 'PLAY_TRICK', side: sel.side, instanceId: sel.instanceId, target: { lane, side } });
    }
    setSel(null);
  }

  function startSuperpower(side: Side) {
    if (!mine(side)) return;
    const sp = readySuperpower(state, side);
    if (!sp) return;
    setSel(null);
    if (sp.targeting === 'none') {
      apply({ type: 'PLAY_SUPERPOWER', side });
      return;
    }
    setSpSel({ side, sp });
  }

  function pickSuperpower(side: Side, superpowerId: string) {
    if (!mine(side)) return;
    apply({ type: 'PICK_SUPERPOWER', side, superpowerId });
  }

  function advance() {
    const owner: Side = state.phase === 'PLANT_PLAY' ? 'plant' : 'zombie';
    apply({ type: 'ADVANCE_PHASE', side: owner });
    setSel(null);
    setSpSel(null);
  }

  const advanceOwner: Side = state.phase === 'PLANT_PLAY' ? 'plant' : 'zombie';
  const canAdvance = state.phase !== 'GAME_OVER' && mine(advanceOwner);

  return (
    <div className="flex aspect-[4/3] max-h-full w-full max-w-[1100px] flex-col gap-1.5 rounded-xl bg-[#16241a] p-3 text-[#e8f0e8] shadow-lg">
      <HeroBar state={state} side="zombie" active={active === 'zombie'} youAre={viewSide} />
      <HandRow state={state} side="zombie" sel={sel} viewSide={viewSide} onSelect={selectHandCard} />

      <div className="flex flex-1 flex-col justify-center gap-1.5">
        <LaneRow state={state} side="zombie" viewSide={viewSide} highlight={highlightLanes} onClick={clickLane} />
        <LaneRow state={state} side="plant" viewSide={viewSide} highlight={highlightLanes} onClick={clickLane} />
      </div>

      <HandRow state={state} side="plant" sel={sel} viewSide={viewSide} onSelect={selectHandCard} />
      <HeroBar state={state} side="plant" active={active === 'plant'} youAre={viewSide} />

      <SuperpowerControls
        state={state}
        active={active}
        viewSide={viewSide}
        spSel={spSel}
        onPlay={startSuperpower}
        onPick={pickSuperpower}
        onCancel={() => setSpSel(null)}
      />

      <div className="flex items-center gap-3 rounded-lg bg-[#0f1a12] px-3 py-2 text-sm">
        <span className="font-semibold">
          Turn {state.turn} · {PHASE_LABEL[state.phase]}
        </span>
        {banner && <span className="text-sky-300">{banner}</span>}
        {error && <span className="text-red-300">⚠ {error}</span>}
        <span className="ml-auto flex gap-2">
          {canAdvance && (
            <button onClick={advance} className="rounded-md bg-[#2e5a38] px-3 py-1 hover:bg-[#3a6d45]">
              {advanceLabel(state.phase)}
            </button>
          )}
          {onNewGame && (
            <button onClick={onNewGame} className="rounded-md bg-[#3a3a4a] px-3 py-1 hover:bg-[#4a4a5a]">
              New game
            </button>
          )}
          {onLeave && (
            <button onClick={onLeave} className="rounded-md bg-[#3a3a4a] px-3 py-1 hover:bg-[#4a4a5a]">
              Leave
            </button>
          )}
          {getLog && <CopyLogButton getLog={getLog} />}
          {onImportLog && <LoadLogButton onImportLog={onImportLog} />}
        </span>
      </div>

      {state.phase === 'GAME_OVER' && (
        <div className="rounded-lg bg-black/60 px-3 py-2 text-center text-lg font-bold">
          {state.winner === 'draw' ? 'Draw!' : `${state.winner === 'plant' ? 'Plants' : 'Zombies'} win!`}
        </div>
      )}
    </div>
  );
}

// 超能力控制条:待用 SP 施放按钮、施放中提示、pick 模式候选。单侧视角只显示本方。
function SuperpowerControls({
  state,
  active,
  viewSide,
  spSel,
  onPlay,
  onPick,
  onCancel,
}: {
  state: GameState;
  active: Side | null;
  viewSide?: Side;
  spSel: SPSelection;
  onPlay: (side: Side) => void;
  onPick: (side: Side, spId: string) => void;
  onCancel: () => void;
}) {
  const visibleSides = (['plant', 'zombie'] as Side[]).filter((s) => viewSide == null || s === viewSide);
  const offers = visibleSides
    .map((side) => ({ side, list: offeredSuperpowers(state, side) }))
    .filter((o) => o.list.length > 0);

  const canCast = active && (viewSide == null || active === viewSide) && canPlaySuperpowerNow(state, active);
  const castable = canCast ? readySuperpower(state, active!) : null;

  // 已充能但当前不可施放的 SP(非本方 play phase)→ 显示只读“charged”提示。
  const charged = visibleSides
    .map((side) => ({ side, sp: readySuperpower(state, side) }))
    .filter((c) => c.sp && !(castable && active === c.side));

  if (!spSel && !castable && offers.length === 0 && charged.length === 0) return null;

  const sideLabel = (s: Side) => (s === 'plant' ? 'Plants' : 'Zombies');

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[#141d2a] px-3 py-1.5 text-sm">
      {spSel ? (
        <>
          <span className="text-sky-200">
            ⚡ {spSel.sp.name}:{' '}
            {spSel.sp.targeting === 'friendlyFighterThenLane' && !spSel.target
              ? 'pick a zombie to carry'
              : spSel.sp.targeting === 'friendlyFighterThenLane'
                ? 'pick an empty lane'
                : 'pick a target'}
          </span>
          <button onClick={onCancel} className="rounded bg-[#3a3a4a] px-2 py-0.5 hover:bg-[#4a4a5a]">
            Cancel
          </button>
        </>
      ) : (
        castable && (
          <button
            onClick={() => onPlay(active!)}
            className="rounded-md bg-sky-700 px-3 py-1 font-semibold hover:bg-sky-600"
          >
            ⚡ {sideLabel(active!)}: {castable.name}
          </button>
        )
      )}

      {charged.map(({ side, sp }) => (
        <span
          key={`charged-${side}`}
          className="flex items-center gap-1 rounded bg-[#1c2733] px-2 py-0.5 text-xs text-[#8fae95]"
          title="Charged — playable on this side's play phase"
        >
          ⚡ {sideLabel(side)}: {sp!.name} <span className="text-[#5f7566]">(charged)</span>
        </span>
      ))}

      {offers.map(({ side, list }) => (
        <span key={side} className="flex items-center gap-1">
          <span className="text-xs text-[#8fae95]">{sideLabel(side)} pick:</span>
          {list.map((sp) => (
            <button
              key={sp.id}
              onClick={() => onPick(side, sp.id)}
              className="rounded bg-[#2e4a5a] px-2 py-0.5 text-xs hover:bg-[#3a5a6d]"
            >
              {sp.name}
            </button>
          ))}
        </span>
      ))}
    </div>
  );
}

// 复制可重放日志。clipboard API 需安全上下文(https/localhost);
// iPad 走 LAN http 时不可用 → 回退到只读 textarea 弹层供手动全选复制。
function CopyLogButton({ getLog }: { getLog: () => string }) {
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState<string | null>(null);

  async function copy() {
    const text = getLog();
    try {
      if (!navigator.clipboard) throw new Error('no clipboard');
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setManual(text); // 不安全上下文 → 手动复制弹层
    }
  }

  return (
    <>
      <button onClick={copy} className="rounded-md bg-[#3a2a4a] px-3 py-1 hover:bg-[#4a3a5a]">
        {copied ? 'Copied ✓' : '🐞 Copy log'}
      </button>
      {manual !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="flex w-full max-w-lg flex-col gap-2 rounded-lg bg-[#16241a] p-4">
            <p className="text-sm">Select all &amp; copy, then paste to share:</p>
            <textarea
              readOnly
              value={manual}
              onFocus={(e) => e.currentTarget.select()}
              className="h-64 w-full rounded bg-[#0f1a12] p-2 font-mono text-xs"
            />
            <button
              onClick={() => setManual(null)}
              className="self-end rounded-md bg-[#3a3a4a] px-3 py-1 hover:bg-[#4a4a5a]"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// 导入日志:粘贴 JSON → 重放到该局面并从此继续。返回错误则展示,否则关闭。
function LoadLogButton({ onImportLog }: { onImportLog: (json: string) => string | null }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);

  function load() {
    const e = onImportLog(text);
    if (e) {
      setErr(e);
      return;
    }
    setOpen(false);
    setText('');
    setErr(null);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-[#2a3a4a] px-3 py-1 hover:bg-[#3a4a5a]"
      >
        📥 Load log
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="flex w-full max-w-lg flex-col gap-2 rounded-lg bg-[#16241a] p-4">
            <p className="text-sm">Paste a game log to resume from that position:</p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="{ &quot;seed&quot;: …, &quot;actions&quot;: [ … ] }"
              className="h-64 w-full rounded bg-[#0f1a12] p-2 font-mono text-xs outline-none ring-1 ring-[#2a3d30] focus:ring-[#4a8f5a]"
            />
            {err && <p className="text-sm text-red-300">⚠ {err}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setOpen(false);
                  setErr(null);
                }}
                className="rounded-md bg-[#3a3a4a] px-3 py-1 hover:bg-[#4a4a5a]"
              >
                Cancel
              </button>
              <button onClick={load} className="rounded-md bg-sky-700 px-3 py-1 font-semibold hover:bg-sky-600">
                Load &amp; resume
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function HeroBar({
  state,
  side,
  active,
  youAre,
}: {
  state: GameState;
  side: Side;
  active: boolean;
  youAre?: Side;
}) {
  const p = state[side];
  const label = side === 'zombie' ? 'Zombies' : 'Plants';
  const resIcon = side === 'zombie' ? '🧠' : '☀';
  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-3 py-1.5 ${
        active ? 'bg-[#1e3326] ring-1 ring-[#4a8f5a]' : 'bg-[#0f1a12]'
      }`}
    >
      <span className="font-semibold">{label}</span>
      {youAre === side && <span className="rounded bg-[#2e5a38] px-1.5 text-[10px]">YOU</span>}
      <span className="rounded bg-[#3a1f1f] px-2 py-0.5 text-sm">HP {p.hero.hp}</span>
      <BlockMeter value={p.hero.blockMeter} />
      <span className="ml-auto text-sm">
        {resIcon} {p.resource}
      </span>
    </div>
  );
}

function BlockMeter({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5" title={`Super-Block ${value}/8`}>
      {Array.from({ length: 8 }, (_, i) => (
        <span key={i} className={`h-3 w-1.5 rounded-sm ${i < value ? 'bg-sky-400' : 'bg-[#26382b]'}`} />
      ))}
    </span>
  );
}

function CardBack() {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-md bg-[#243a4a] text-sm text-[#5a7a8a] shadow-sm">
      🂠
    </div>
  );
}

function HandRow({
  state,
  side,
  sel,
  viewSide,
  onSelect,
}: {
  state: GameState;
  side: Side;
  sel: Selection;
  viewSide?: Side;
  onSelect: (side: Side, instanceId: string) => void;
}) {
  const hand = state[side].hand;
  const hidden = viewSide != null && side !== viewSide; // 对手手牌不可见

  return (
    <div className="flex min-h-[64px] items-center gap-1 overflow-x-auto rounded-lg bg-[#0f1a12] px-2 py-1">
      {hand.length === 0 && <span className="text-xs text-[#3f5a47]">— empty hand —</span>}
      {hidden
        ? hand.map((ref) => (
            <div key={ref.instanceId} className="h-14 w-11 shrink-0">
              <CardBack />
            </div>
          ))
        : hand.map((ref) => {
            const card = getCard(ref.cardId);
            // 可点亮 = 本相位这张牌型可打 且 付得起(fighter/trick 各自的相位)
            const playable = canPlayCardNow(state, side, card) && canAfford(state, side, card);
            const selected = sel?.instanceId === ref.instanceId;
            return (
              <button
                key={ref.instanceId}
                onClick={() => onSelect(side, ref.instanceId)}
                className={`h-14 w-11 shrink-0 rounded-md transition ${
                  selected ? 'ring-2 ring-yellow-300' : ''
                } ${playable ? 'opacity-100' : 'opacity-45'}`}
              >
                <CardFace card={card} compact />
              </button>
            );
          })}
    </div>
  );
}

function LaneRow({
  state,
  side,
  viewSide,
  highlight,
  onClick,
}: {
  state: GameState;
  side: Side;
  viewSide?: Side;
  highlight: Set<string>;
  onClick: (side: Side, lane: number) => void;
}) {
  return (
    <div className="flex items-stretch gap-1.5">
      <span className="flex w-12 shrink-0 items-center text-xs text-[#8fae95]">
        {side === 'zombie' ? '🧟' : '🌱'}
      </span>
      {state.lanes.map((ln, l) => {
        const f = ln[side];
        const hot = highlight.has(`${side}:${l}`);
        // 对手的未翻面 gravestone → 面朝下(己方 gravestone 自己可见)
        const maskGravestone = f && viewSide != null && f.owner !== viewSide && f.gravestone;
        return (
          <button
            key={l}
            onClick={() => onClick(side, l)}
            className={`flex aspect-[3/4] flex-1 items-center justify-center rounded-lg border p-0.5 ${
              hot ? 'border-yellow-300 bg-[#1e3326] ring-1 ring-yellow-300' : 'border-[#2a3d30] bg-[#111e16]'
            }`}
          >
            {f ? (
              maskGravestone ? (
                <CardBack />
              ) : (
                <CardFace card={getCard(f.cardId)} fighter={f} />
              )
            ) : (
              <span className="text-[10px] text-[#3f5a47]">L{l}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
