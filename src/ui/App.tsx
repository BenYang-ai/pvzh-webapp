import { useState } from 'react';
import type { Side } from '../engine/types.ts';
import { isNetworkEnabled } from '../net/supabase.ts';
import { LocalGame } from './LocalGame.tsx';
import { NetworkGame } from './NetworkGame.tsx';
import { Lobby } from './Lobby.tsx';

type Screen =
  | { kind: 'menu' }
  | { kind: 'lobby' }
  | { kind: 'local' }
  | { kind: 'net'; code: string; seat: Side };

export function App() {
  const net = isNetworkEnabled();
  // 无 Supabase env → 直接进本地 god-view(联网不可用)。
  const [screen, setScreen] = useState<Screen>(net ? { kind: 'menu' } : { kind: 'local' });

  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0f1a12] p-2">
      {screen.kind === 'menu' && <Menu onLocal={() => setScreen({ kind: 'local' })} onNet={() => setScreen({ kind: 'lobby' })} />}
      {screen.kind === 'lobby' && (
        <Lobby
          onEnter={(code, seat) => setScreen({ kind: 'net', code, seat })}
          onCancel={() => setScreen({ kind: 'menu' })}
        />
      )}
      {screen.kind === 'local' && <LocalGame onExit={net ? () => setScreen({ kind: 'menu' }) : undefined} />}
      {screen.kind === 'net' && (
        <NetworkGame code={screen.code} seat={screen.seat} onLeave={() => setScreen({ kind: 'menu' })} />
      )}
    </div>
  );
}

function Menu({ onLocal, onNet }: { onLocal: () => void; onNet: () => void }) {
  return (
    <div className="flex w-full max-w-sm flex-col gap-3 rounded-xl bg-[#16241a] p-6 text-[#e8f0e8] shadow-lg">
      <h1 className="text-xl font-bold">🌱 vs 🧟 Card Game</h1>
      <button onClick={onNet} className="rounded-md bg-sky-700 px-3 py-3 font-semibold hover:bg-sky-600">
        Play over WiFi (2 devices)
      </button>
      <button onClick={onLocal} className="rounded-md bg-[#2e5a38] px-3 py-3 font-semibold hover:bg-[#3a6d45]">
        Local hot-seat (one screen)
      </button>
    </div>
  );
}
