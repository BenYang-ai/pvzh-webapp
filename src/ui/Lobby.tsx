import { useEffect, useState } from 'react';
import type { Side } from '../engine/types.ts';
import { createInitialState } from '../engine/reduce.ts';
import { createRoom, fetchRoomMeta } from '../net/room.ts';
import { FAMILY_ROOM, savedSeat, saveSeat } from '../net/access.ts';

const other = (s: Side): Side => (s === 'plant' ? 'zombie' : 'plant');
const label = (s: Side) => (s === 'plant' ? '🌱 Plants' : '🧟 Zombies');

// 大厅:无房号(口令即房间)。第一人选边建局;第二人自动分到另一方,只读确认后进入。
export function Lobby({ onEnter, onCancel }: { onEnter: (seat: Side) => void; onCancel: () => void }) {
  const room = FAMILY_ROOM;
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // meta.exists=已有局;hostSide=建房方执方。saved=本设备上次选的边(刷新不翻面)。
  const [exists, setExists] = useState(false);
  const [hostSide, setHostSide] = useState<Side | null>(null);
  const saved = savedSeat(room);
  // 第一人(无局、无记录)才主动选边;否则执方已定(记录 > 对手的另一边)。
  const [pick, setPick] = useState<Side>('plant');

  useEffect(() => {
    let alive = true;
    fetchRoomMeta(room)
      .then((m) => {
        if (!alive) return;
        setExists(m.exists);
        setHostSide(m.hostSide);
        setLoading(false);
      })
      .catch((e) => alive && (setErr((e as Error).message), setLoading(false)));
    return () => {
      alive = false;
    };
  }, [room]);

  const fresh = () => createInitialState({ seed: `${room}-${Date.now()}` });

  // 建新局(第一人开局 / 任一方“New game”):写入 fresh state,保留 host 执方。
  async function startFresh(side: Side, host: Side) {
    setBusy(true);
    setErr(null);
    try {
      await createRoom(room, fresh(), host);
      saveSeat(room, side);
      onEnter(side);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  // 进入已有局(只读确认后)。局已被清则顺手建一局(本方为 host)。
  async function enterExisting(side: Side) {
    setBusy(true);
    setErr(null);
    try {
      if (!exists) await createRoom(room, fresh(), side);
      saveSeat(room, side);
      onEnter(side);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  const box = 'flex w-full max-w-sm flex-col gap-3 rounded-xl bg-[#16241a] p-5 text-[#e8f0e8] shadow-lg';
  const backBtn = (
    <button onClick={onCancel} className="rounded-md bg-[#3a3a4a] px-3 py-2 hover:bg-[#4a4a5a]">
      Back
    </button>
  );

  if (loading) {
    return (
      <div className={box}>
        <p>Connecting…</p>
      </div>
    );
  }

  // 已定执方:本设备记录优先,否则第二人 = 对手(host)的另一边。
  const mySide: Side | null = saved ?? (exists ? other(hostSide ?? 'zombie') : null);

  // —— 第一人:主动选边开局 ——
  if (mySide == null) {
    const seatBtn = (s: Side) => (
      <button
        onClick={() => setPick(s)}
        className={`flex-1 rounded-md px-3 py-2 ${pick === s ? 'bg-[#2e5a38] ring-1 ring-[#4a8f5a]' : 'bg-[#1a2a1f]'}`}
      >
        {label(s)}
      </button>
    );
    return (
      <div className={box}>
        <h2 className="text-lg font-bold">Play over WiFi</h2>
        <p className="text-sm text-[#8fae95]">You're first — pick your side.</p>
        <div className="flex gap-2">
          {seatBtn('plant')}
          {seatBtn('zombie')}
        </div>
        {err && <p className="text-sm text-red-300">⚠ {err}</p>}
        <div className="mt-1 flex gap-2">
          <button
            onClick={() => startFresh(pick, pick)}
            disabled={busy}
            className="flex-1 rounded-md bg-sky-700 px-3 py-2 font-semibold hover:bg-sky-600 disabled:opacity-50"
          >
            {busy ? '…' : 'Start game'}
          </button>
          {backBtn}
        </div>
      </div>
    );
  }

  // —— 执方已定:只读确认(第二人自动分边 / 本方刷新回来)——
  return (
    <div className={box}>
      <h2 className="text-lg font-bold">Play over WiFi</h2>
      <p className="text-sm text-[#8fae95]">Your side</p>
      <div className="rounded-md bg-[#0f1a12] px-3 py-4 text-center text-2xl font-bold ring-1 ring-[#2a3d30]">
        {label(mySide)}
      </div>
      {err && <p className="text-sm text-red-300">⚠ {err}</p>}
      <div className="mt-1 flex gap-2">
        <button
          onClick={() => enterExisting(mySide)}
          disabled={busy}
          className="flex-1 rounded-md bg-sky-700 px-3 py-2 font-semibold hover:bg-sky-600 disabled:opacity-50"
        >
          {busy ? '…' : exists ? 'Enter' : 'Start game'}
        </button>
        {backBtn}
      </div>
      {exists && (
        <button
          onClick={() => startFresh(mySide, hostSide ?? mySide)}
          disabled={busy}
          className="rounded-md bg-[#3a2a2a] px-3 py-2 text-sm hover:bg-[#4a3a3a] disabled:opacity-50"
        >
          Start a new game (resets the board)
        </button>
      )}
    </div>
  );
}
