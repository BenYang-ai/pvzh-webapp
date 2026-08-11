import { useState } from 'react';
import type { GameState, Phase, Side } from '../engine/types.ts';
import { getCard } from '../engine/cardpool.ts';
import {
  activeSide,
  canAfford,
  canPlayFighterNow,
  canPlayTrickNow,
  emptyLanes,
  trickTargets,
} from '../engine/selectors.ts';
import { CardFace } from './CardFace.tsx';
import { useGame } from './useGame.ts';

type Selection = { side: Side; instanceId: string } | null;

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

export function Board() {
  const { state, apply, error, reset } = useGame('game-1');
  const [sel, setSel] = useState<Selection>(null);
  const [seedN, setSeedN] = useState(1);

  const active = activeSide(state);
  const selRef = sel ? state[sel.side].hand.find((r) => r.instanceId === sel.instanceId) : undefined;
  const selCard = selRef ? getCard(selRef.cardId) : null;

  // 高亮集合
  const highlightLanes = new Set<string>(); // `${side}:${lane}`
  if (sel && selCard) {
    if (selCard.type === 'fighter' && canPlayFighterNow(state, sel.side)) {
      emptyLanes(state, sel.side).forEach((l) => highlightLanes.add(`${sel.side}:${l}`));
    } else if (selCard.type === 'trick') {
      trickTargets(state, sel.side, selCard).forEach((t) => highlightLanes.add(`${t.side}:${t.lane}`));
    }
  }

  function selectHandCard(side: Side, instanceId: string) {
    if (state.phase === 'GAME_OVER') return;
    const ref = state[side].hand.find((r) => r.instanceId === instanceId)!;
    const card = getCard(ref.cardId);
    // 取消重复选择
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
    if (!sel || !selCard) return;
    const key = `${side}:${lane}`;
    if (!highlightLanes.has(key)) return;
    if (selCard.type === 'fighter') {
      apply({ type: 'PLAY_FIGHTER', side: sel.side, instanceId: sel.instanceId, lane });
    } else {
      apply({ type: 'PLAY_TRICK', side: sel.side, instanceId: sel.instanceId, target: { lane, side } });
    }
    setSel(null);
  }

  function advance() {
    const owner: Side = state.phase === 'PLANT_PLAY' ? 'plant' : 'zombie';
    apply({ type: 'ADVANCE_PHASE', side: owner });
    setSel(null);
  }

  function newGame() {
    reset(`game-${seedN + 1}`);
    setSeedN((n) => n + 1);
    setSel(null);
  }

  return (
    <div className="flex aspect-[4/3] max-h-full w-full max-w-[1100px] flex-col gap-1.5 rounded-xl bg-[#16241a] p-3 text-[#e8f0e8] shadow-lg">
      <HeroBar state={state} side="zombie" active={active === 'zombie'} />
      <HandRow state={state} side="zombie" sel={sel} active={active} onSelect={selectHandCard} />

      <div className="flex flex-1 flex-col justify-center gap-1.5">
        <LaneRow state={state} side="zombie" highlight={highlightLanes} onClick={clickLane} />
        <LaneRow state={state} side="plant" highlight={highlightLanes} onClick={clickLane} />
      </div>

      <HandRow state={state} side="plant" sel={sel} active={active} onSelect={selectHandCard} />
      <HeroBar state={state} side="plant" active={active === 'plant'} />

      <div className="flex items-center gap-3 rounded-lg bg-[#0f1a12] px-3 py-2 text-sm">
        <span className="font-semibold">
          Turn {state.turn} · {PHASE_LABEL[state.phase]}
        </span>
        {error && <span className="text-red-300">⚠ {error}</span>}
        <span className="ml-auto flex gap-2">
          {state.phase !== 'GAME_OVER' && (
            <button onClick={advance} className="rounded-md bg-[#2e5a38] px-3 py-1 hover:bg-[#3a6d45]">
              {advanceLabel(state.phase)}
            </button>
          )}
          <button onClick={newGame} className="rounded-md bg-[#3a3a4a] px-3 py-1 hover:bg-[#4a4a5a]">
            New game
          </button>
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

function HeroBar({ state, side, active }: { state: GameState; side: Side; active: boolean }) {
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

function HandRow({
  state,
  side,
  sel,
  active,
  onSelect,
}: {
  state: GameState;
  side: Side;
  sel: Selection;
  active: Side | null;
  onSelect: (side: Side, instanceId: string) => void;
}) {
  const hand = state[side].hand;
  return (
    <div className="flex min-h-[64px] items-center gap-1 overflow-x-auto rounded-lg bg-[#0f1a12] px-2 py-1">
      {hand.length === 0 && <span className="text-xs text-[#3f5a47]">— empty hand —</span>}
      {hand.map((ref) => {
        const card = getCard(ref.cardId);
        const affordable = canAfford(state, side, card);
        const isActive = active === side;
        const selected = sel?.instanceId === ref.instanceId;
        return (
          <button
            key={ref.instanceId}
            onClick={() => onSelect(side, ref.instanceId)}
            className={`h-14 w-11 shrink-0 rounded-md transition ${
              selected ? 'ring-2 ring-yellow-300' : ''
            } ${isActive && affordable ? 'opacity-100' : 'opacity-45'}`}
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
  highlight,
  onClick,
}: {
  state: GameState;
  side: Side;
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
        return (
          <button
            key={l}
            onClick={() => onClick(side, l)}
            className={`flex aspect-[3/4] flex-1 items-center justify-center rounded-lg border p-0.5 ${
              hot ? 'border-yellow-300 bg-[#1e3326] ring-1 ring-yellow-300' : 'border-[#2a3d30] bg-[#111e16]'
            }`}
          >
            {f ? <CardFace card={getCard(f.cardId)} fighter={f} /> : <span className="text-[10px] text-[#3f5a47]">L{l}</span>}
          </button>
        );
      })}
    </div>
  );
}
