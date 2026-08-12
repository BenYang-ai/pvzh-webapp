import { useState } from 'react';
import type { Side } from '../engine/types.ts';
import { createInitialState } from '../engine/reduce.ts';
import { createRoom } from '../net/room.ts';

function randomCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // 去掉 I/O 易混
  let out = '';
  for (let i = 0; i < 4; i++) out += letters[Math.floor(Math.random() * letters.length)];
  return out;
}

// 大厅:建房(写初始 state)或加入,并选执方。
export function Lobby({ onEnter, onCancel }: { onEnter: (code: string, seat: Side) => void; onCancel: () => void }) {
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [code, setCode] = useState(randomCode());
  const [seat, setSeat] = useState<Side>('plant');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    const c = code.trim().toUpperCase();
    if (!c) {
      setErr('enter a room code');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      if (tab === 'create') {
        await createRoom(c, createInitialState({ seed: c }));
      }
      onEnter(c, seat);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  const seatBtn = (s: Side, label: string) => (
    <button
      onClick={() => setSeat(s)}
      className={`rounded-md px-3 py-1.5 ${seat === s ? 'bg-[#2e5a38] ring-1 ring-[#4a8f5a]' : 'bg-[#1a2a1f]'}`}
    >
      {label}
    </button>
  );

  const tabBtn = (t: 'create' | 'join', label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`flex-1 rounded-md px-3 py-1.5 ${tab === t ? 'bg-[#2e4a5a]' : 'bg-[#1a2530]'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex w-full max-w-sm flex-col gap-3 rounded-xl bg-[#16241a] p-5 text-[#e8f0e8] shadow-lg">
      <h2 className="text-lg font-bold">Play over WiFi</h2>

      <div className="flex gap-2">
        {tabBtn('create', 'Create room')}
        {tabBtn('join', 'Join room')}
      </div>

      <label className="text-sm text-[#8fae95]">Room code</label>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        maxLength={8}
        className="rounded-md bg-[#0f1a12] px-3 py-2 font-mono text-lg tracking-widest outline-none ring-1 ring-[#2a3d30] focus:ring-[#4a8f5a]"
      />

      <label className="text-sm text-[#8fae95]">Your side</label>
      <div className="flex gap-2">
        {seatBtn('plant', '🌱 Plants')}
        {seatBtn('zombie', '🧟 Zombies')}
      </div>

      {tab === 'join' && (
        <p className="text-xs text-[#8fae95]">Pick the side the other player did NOT take.</p>
      )}
      {err && <p className="text-sm text-red-300">⚠ {err}</p>}

      <div className="mt-1 flex gap-2">
        <button
          onClick={go}
          disabled={busy}
          className="flex-1 rounded-md bg-sky-700 px-3 py-2 font-semibold hover:bg-sky-600 disabled:opacity-50"
        >
          {busy ? '…' : tab === 'create' ? 'Create & enter' : 'Join'}
        </button>
        <button onClick={onCancel} className="rounded-md bg-[#3a3a4a] px-3 py-2 hover:bg-[#4a4a5a]">
          Back
        </button>
      </div>
    </div>
  );
}
