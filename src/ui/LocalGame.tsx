import { useEffect, useRef, useState } from 'react';
import { Board } from './Board.tsx';
import { useGame } from './useGame.ts';
import { useCombatAnimation } from './useCombatAnimation.ts';

// 本地 god-view:双方手牌可见、同屏操作(M4 行为)。
// 战斗结算走 useCombatAnimation 逐拍回放(见该文件),点击任意处可跳过。
export function LocalGame({ onExit }: { onExit?: () => void }) {
  const { state, apply: rawApply, error, reset, exportLog, importLog } = useGame('game-1');
  const { displayState, fx, animating, caption, apply, skip } = useCombatAnimation(state, rawApply);
  const [seedN, setSeedN] = useState(1);

  // 记住最后一条 lane 说明:回放结束后 state 日志末行是同一条 lane 的战斗行,
  // 直接回落会“重复播一遍最后 lane”。故战斗结束保持这条说明,只有非战斗动作(打牌/技俩)才换成真实日志末行。
  const lastCaptionRef = useRef('');
  useEffect(() => {
    if (animating && caption) lastCaptionRef.current = caption;
  }, [animating, caption]);
  const lastLine = state.log[state.log.length - 1] ?? '';
  const isCombatLine = /\(L\d/.test(lastLine); // 战斗行格式 "X (L2) hits …";打牌行是 "… at L2"
  const midMessage = animating && caption ? caption : isCombatLine ? lastCaptionRef.current : lastLine;

  function newGame() {
    reset(`game-${seedN + 1}`);
    setSeedN((n) => n + 1);
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center gap-2 p-2">
      <Board
        state={displayState}
        apply={apply}
        error={error}
        onNewGame={newGame}
        onLeave={onExit}
        getLog={exportLog}
        onImportLog={importLog}
        fx={fx}
        lastLog={midMessage}
      />
      {/* 事件日志面板(state.log 原文)。用真实 state → 战斗行落地即显。宽屏才显示。 */}
      <LogPanel log={state.log} />
      {/* 回放中:全屏透明层拦截点击 → 快进到终局(Ben:tap to skip)。 */}
      {animating && (
        <button
          onClick={skip}
          aria-label="Skip combat animation"
          className="absolute inset-0 z-40 cursor-pointer bg-transparent"
        />
      )}
    </div>
  );
}

// 滚动事件日志:最新一行在底部,新行自动滚到底。
function LogPanel({ log }: { log: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);

  return (
    <div className="hidden aspect-[3/4] max-h-full w-44 shrink-0 flex-col rounded-xl bg-[#0f1a12] p-2 text-[#c8d8c8] shadow-lg lg:flex">
      <div className="mb-1 shrink-0 px-1 text-xs font-semibold text-[#8fae95]">Log</div>
      <div ref={ref} className="flex-1 space-y-0.5 overflow-y-auto px-1 font-mono text-[10px] leading-tight">
        {log.length === 0 && <span className="text-[#3f5a47]">— no events yet —</span>}
        {log.map((line, i) => (
          <div
            key={i}
            className={
              line.startsWith('—')
                ? 'mt-1 text-[#6f9a76] font-semibold'
                : line.includes('Super-Block')
                  ? 'text-sky-300'
                  : line.includes('destroyed')
                    ? 'text-red-300'
                    : ''
            }
          >
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
