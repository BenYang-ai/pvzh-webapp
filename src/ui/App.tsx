import { useState } from 'react';
import type { Side } from '../engine/types.ts';
import { isNetworkEnabled } from '../net/supabase.ts';
import { hasAccess, FAMILY_ROOM } from '../net/access.ts';
import { Gate } from './Gate.tsx';
import { LocalGame } from './LocalGame.tsx';
import { NetworkGame } from './NetworkGame.tsx';
import { Lobby } from './Lobby.tsx';

type Screen =
  | { kind: 'menu' }
  | { kind: 'lobby' }
  | { kind: 'local' }
  | { kind: 'net'; seat: Side };

export function App() {
  const net = isNetworkEnabled();
  // 访问门:公开链接需先输口令。已通过(localStorage)则跳过。
  const [unlocked, setUnlocked] = useState(hasAccess());
  // 无 Supabase env → 直接进本地 god-view(联网不可用)。
  const [screen, setScreen] = useState<Screen>(net ? { kind: 'menu' } : { kind: 'local' });

  if (!unlocked) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0f1a12] p-2">
        <Gate onUnlock={() => setUnlocked(true)} />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0f1a12] p-2">
      {screen.kind === 'menu' && <Menu onLocal={() => setScreen({ kind: 'local' })} onNet={() => setScreen({ kind: 'lobby' })} />}
      {screen.kind === 'lobby' && (
        <Lobby
          onEnter={(seat) => setScreen({ kind: 'net', seat })}
          onCancel={() => setScreen({ kind: 'menu' })}
        />
      )}
      {screen.kind === 'local' && <LocalGame onExit={net ? () => setScreen({ kind: 'menu' }) : undefined} />}
      {screen.kind === 'net' && (
        <NetworkGame code={FAMILY_ROOM} seat={screen.seat} onLeave={() => setScreen({ kind: 'menu' })} />
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
