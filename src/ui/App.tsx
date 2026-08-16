import { useEffect, useState } from 'react';
import type { Side } from '../engine/types.ts';
import { isNetworkEnabled } from '../net/supabase.ts';
import { hasAccess, FAMILY_ROOM } from '../net/access.ts';
import { fetchRoomMeta, type RoomMeta } from '../net/room.ts';
import { Gate } from './Gate.tsx';
import { LocalGame } from './LocalGame.tsx';
import { NetworkGame } from './NetworkGame.tsx';
import { Lobby } from './Lobby.tsx';

type Screen =
  | { kind: 'menu' }
  | { kind: 'lobby'; mode: 'new' | 'resume' }
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
      {screen.kind === 'menu' && (
        <Menu
          net={net}
          onNew={() => setScreen({ kind: 'lobby', mode: 'new' })}
          onResume={() => setScreen({ kind: 'lobby', mode: 'resume' })}
          onLocal={() => setScreen({ kind: 'local' })}
        />
      )}
      {screen.kind === 'lobby' && (
        <Lobby
          mode={screen.mode}
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

const sideEmoji = (s: Side) => (s === 'plant' ? '🌱' : '🧟');

// 意图优先的落地页:有在进行的局才显示「Resume」;New online → 选名字+边;Local → 单屏。
function Menu({
  net,
  onNew,
  onResume,
  onLocal,
}: {
  net: boolean;
  onNew: () => void;
  onResume: () => void;
  onLocal: () => void;
}) {
  const [meta, setMeta] = useState<RoomMeta | null>(null);
  const [checking, setChecking] = useState(net);

  useEffect(() => {
    if (!net) return;
    let alive = true;
    fetchRoomMeta(FAMILY_ROOM)
      .then((m) => alive && (setMeta(m), setChecking(false)))
      .catch(() => alive && setChecking(false));
    return () => {
      alive = false;
    };
  }, [net]);

  const inProgress = Boolean(meta?.exists && meta.turn >= 1 && meta.winner == null);
  const occ = meta
    ? `${meta.names.plant ?? '—'} ${sideEmoji('plant')} vs ${meta.names.zombie ?? '—'} ${sideEmoji('zombie')} · turn ${meta.turn}`
    : '';

  return (
    <div className="flex w-full max-w-sm flex-col gap-3 rounded-xl bg-[#16241a] p-6 text-[#e8f0e8] shadow-lg">
      <h1 className="text-xl font-bold">🌱 vs 🧟 Card Game</h1>
      {net && inProgress && (
        <button onClick={onResume} className="rounded-md bg-[#2e5a38] px-3 py-3 text-left font-semibold hover:bg-[#3a6d45]">
          <div>Resume game</div>
          <div className="text-sm font-normal text-[#bfe0c6]">{occ}</div>
        </button>
      )}
      {net && (
        <button onClick={onNew} className="rounded-md bg-sky-700 px-3 py-3 font-semibold hover:bg-sky-600">
          New online game (2 devices)
        </button>
      )}
      <button onClick={onLocal} className="rounded-md bg-[#243a2b] px-3 py-3 font-semibold hover:bg-[#2f4c37]">
        Local game (one screen)
      </button>
      {net && checking && <p className="text-xs text-[#6f8a76]">Checking for a game in progress…</p>}
    </div>
  );
}
