import type { Side } from '../engine/types.ts';
import { activeSide } from '../engine/selectors.ts';
import { Board } from './Board.tsx';
import { useNetworkGame } from './useNetworkGame.ts';

// 联网单侧视角。seat = 本设备执方。
export function NetworkGame({ code, seat, onLeave }: { code: string; seat: Side; onLeave: () => void }) {
  const { state, apply, error } = useNetworkGame(code);

  if (!state) {
    return (
      <div className="flex flex-col items-center gap-3 text-[#e8f0e8]">
        <p>Connecting to room “{code}”…</p>
        {error && <p className="text-red-300">⚠ {error}</p>}
        <button onClick={onLeave} className="rounded-md bg-[#3a3a4a] px-3 py-1 hover:bg-[#4a4a5a]">
          Back
        </button>
      </div>
    );
  }

  const active = activeSide(state);
  let banner: string;
  if (state.phase === 'GAME_OVER') banner = `Room ${code}`;
  else if (active === seat) banner = `Room ${code} · Your turn`;
  else if (active) banner = `Room ${code} · Opponent's turn…`;
  else banner = `Room ${code} · resolving…`;

  return <Board state={state} apply={apply} error={error} viewSide={seat} onLeave={onLeave} banner={banner} />;
}
