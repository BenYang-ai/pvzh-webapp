import { DEFAULT_CONFIG } from '../config.ts';

const LANES = Array.from({ length: DEFAULT_CONFIG.laneCount }, (_, i) => i);

// M0 静态骨架:对方 hero 行 / 5 lane 双行 / 己方 hero 行。无交互、无引擎。
export function Board() {
  return (
    <div className="flex aspect-[4/3] max-h-full w-full max-w-[1024px] flex-col gap-2 rounded-xl bg-[#16241a] p-3 shadow-lg">
      <HeroBar label="Opponent" side="enemy" />

      <div className="flex flex-1 flex-col justify-center gap-2">
        <LaneRow rowLabel="Opponent" />
        <LaneRow rowLabel="You" />
      </div>

      <HeroBar label="You" side="self" showResource />

      <div className="flex items-center justify-between rounded-lg bg-[#0f1a12] px-3 py-2 text-sm text-[#8fae95]">
        <span>Phase: —</span>
        <button
          className="rounded-md bg-[#2e5a38] px-3 py-1 text-[#e8f0e8] opacity-50"
          disabled
        >
          End phase ▶
        </button>
      </div>
    </div>
  );
}

function HeroBar({
  label,
  showResource = false,
}: {
  label: string;
  side: 'self' | 'enemy';
  showResource?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-[#0f1a12] px-3 py-2">
      <span className="font-semibold">{label}</span>
      <span className="rounded bg-[#3a1f1f] px-2 py-0.5 text-sm">HP {DEFAULT_CONFIG.heroStartHp}</span>
      <BlockMeter />
      {showResource && <span className="ml-auto text-sm">Sun ☀ 0</span>}
    </div>
  );
}

function BlockMeter() {
  const cells = Array.from({ length: DEFAULT_CONFIG.blockMeterMax }, (_, i) => i);
  return (
    <span className="flex gap-0.5" title="Super-Block Meter">
      {cells.map((i) => (
        <span key={i} className="h-3 w-2 rounded-sm bg-[#26382b]" />
      ))}
    </span>
  );
}

function LaneRow({ rowLabel }: { rowLabel: string }) {
  return (
    <div className="flex items-stretch gap-2">
      <span className="flex w-16 shrink-0 items-center text-xs text-[#8fae95]">{rowLabel}</span>
      {LANES.map((l) => (
        <div
          key={l}
          className="flex aspect-[3/4] flex-1 items-center justify-center rounded-lg border border-[#2a3d30] bg-[#111e16] text-xs text-[#3f5a47]"
        >
          L{l}
        </div>
      ))}
    </div>
  );
}
