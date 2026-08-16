import { useEffect, useRef } from 'react';
import type { Side } from '../engine/types.ts';
import { activeSide } from '../engine/selectors.ts';
import { Board } from './Board.tsx';
import { savedName, deviceToken } from '../net/access.ts';
import { releaseSeat } from '../net/room.ts';
import { useNetworkGame } from './useNetworkGame.ts';
import { useNetCombatAnimation } from './useNetCombatAnimation.ts';

const other = (s: Side): Side => (s === 'plant' ? 'zombie' : 'plant');

// 联网单侧视角。seat = 本设备执方。战斗走 useNetCombatAnimation 逐拍回放(与本地一致,监听 state 变化触发)。
export function NetworkGame({ code, seat, onLeave }: { code: string; seat: Side; onLeave: () => void }) {
  // 离开时释放本座(清本设备令牌),让座位空出供他人加入。best-effort,不阻塞返回。
  const leave = () => {
    releaseSeat(code, seat, deviceToken()).catch(() => {});
    onLeave();
  };
  const { state, names, apply, newGame, error } = useNetworkGame(code);
  const { displayState, fx, animating, caption, skip } = useNetCombatAnimation(state);

  // 保持最后一条 lane 说明,避免回放结束后中间条重复播最后一 lane(与 LocalGame 同处理)。
  const lastCaptionRef = useRef('');
  useEffect(() => {
    if (animating && caption) lastCaptionRef.current = caption;
  }, [animating, caption]);

  if (!state || !displayState) {
    return (
      <div className="flex flex-col items-center gap-3 text-[#e8f0e8]">
        <p>Connecting to room “{code}”…</p>
        {error && <p className="text-red-300">⚠ {error}</p>}
        <button onClick={leave} className="rounded-md bg-[#3a3a4a] px-3 py-1 hover:bg-[#4a4a5a]">
          Back
        </button>
      </div>
    );
  }

  const myName = names[seat] ?? (seat === 'plant' ? 'Plants' : 'Zombies');
  const oppName = names[other(seat)] ?? 'Opponent';
  const isBen = savedName(code) === 'Ben'; // debug 按钮仅 Ben 可见

  // 中间条说明用真实 state(不用回放中间帧),战斗行落地即显;回放中显示当前拍说明。
  const lastLine = state.log[state.log.length - 1] ?? '';
  const isCombatLine = /\(L\d/.test(lastLine);
  const midMessage = animating && caption ? caption : isCombatLine ? lastCaptionRef.current : lastLine;

  const active = activeSide(state);
  let banner: string;
  if (state.phase === 'GAME_OVER') banner = 'Game over';
  else if (active === seat) banner = `Your turn — ${myName}`;
  else if (active) banner = `${oppName}'s turn…`;
  else banner = 'resolving…';

  function onNewGame() {
    if (window.confirm('Start a new game? This resets the board for both players.')) newGame();
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center gap-2 p-2">
      <Board
        state={displayState}
        apply={apply}
        error={error}
        viewSide={seat}
        names={names}
        onNewGame={onNewGame}
        onLeave={leave}
        banner={banner}
        copyState={isBen ? () => JSON.stringify(state, null, 2) : undefined} // 权威 state → net debug,仅 Ben 可见
        fx={fx}
        lastLog={midMessage}
      />
      {/* 回放中:全屏透明层拦截点击 → 快进到最新真实局面(tap to skip),同时防止误点。 */}
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
