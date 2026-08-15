import { useState } from 'react';
import { Board } from './Board.tsx';
import { useGame } from './useGame.ts';
import { useCombatAnimation } from './useCombatAnimation.ts';

// 本地 god-view:双方手牌可见、同屏操作(M4 行为)。
// 战斗结算走 useCombatAnimation 逐拍回放(见该文件),点击任意处可跳过。
export function LocalGame({ onExit }: { onExit?: () => void }) {
  const { state, apply: rawApply, error, reset, exportLog, importLog } = useGame('game-1');
  const { displayState, fx, animating, apply, skip } = useCombatAnimation(state, rawApply);
  const [seedN, setSeedN] = useState(1);

  function newGame() {
    reset(`game-${seedN + 1}`);
    setSeedN((n) => n + 1);
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <Board
        state={displayState}
        apply={apply}
        error={error}
        onNewGame={newGame}
        onLeave={onExit}
        getLog={exportLog}
        onImportLog={importLog}
        fx={fx}
      />
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
