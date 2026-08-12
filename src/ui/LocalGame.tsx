import { useState } from 'react';
import { Board } from './Board.tsx';
import { useGame } from './useGame.ts';

// 本地 god-view:双方手牌可见、同屏操作(M4 行为)。
export function LocalGame({ onExit }: { onExit?: () => void }) {
  const { state, apply, error, reset, exportLog, importLog } = useGame('game-1');
  const [seedN, setSeedN] = useState(1);

  function newGame() {
    reset(`game-${seedN + 1}`);
    setSeedN((n) => n + 1);
  }

  return (
    <Board
      state={state}
      apply={apply}
      error={error}
      onNewGame={newGame}
      onLeave={onExit}
      getLog={exportLog}
      onImportLog={importLog}
    />
  );
}
