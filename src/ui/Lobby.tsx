import { useEffect, useState } from 'react';
import type { Side } from '../engine/types.ts';
import { createInitialState } from '../engine/reduce.ts';
import { createRoom, fetchRoomMeta, setPlayerName, type PlayerNames } from '../net/room.ts';
import { FAMILY_ROOM, PLAYER_NAMES, savedName, saveName, savedSeat, saveSeat } from '../net/access.ts';

const other = (s: Side): Side => (s === 'plant' ? 'zombie' : 'plant');
const label = (s: Side) => (s === 'plant' ? '🌱 Plants' : '🧟 Zombies');

// 大厅:无房号(口令即房间)。选名字 + 第一人选边建局;第二人自动分到另一方,只读确认后进入。
export function Lobby({ onEnter, onCancel }: { onEnter: (seat: Side) => void; onCancel: () => void }) {
  const room = FAMILY_ROOM;
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exists, setExists] = useState(false);
  const [hostSide, setHostSide] = useState<Side | null>(null);
  const [names, setNames] = useState<PlayerNames>({});
  const saved = savedSeat(room);
  const [pick, setPick] = useState<Side>('plant');
  const [name, setName] = useState<string>(savedName(room) ?? PLAYER_NAMES[0]);

  useEffect(() => {
    let alive = true;
    fetchRoomMeta(room)
      .then((m) => {
        if (!alive) return;
        setExists(m.exists);
        setHostSide(m.hostSide);
        setNames(m.names);
        setLoading(false);
      })
      .catch((e) => alive && (setErr((e as Error).message), setLoading(false)));
    return () => {
      alive = false;
    };
  }, [room]);

  const fresh = () => createInitialState({ seed: `${room}-${Date.now()}` });

  // 认领名字(需房间已存在)+ 记本地。
  async function claimName(side: Side) {
    saveName(room, name);
    saveSeat(room, side);
    await setPlayerName(room, side, name);
  }

  // 第一人开局 / 任一方“New game”:写入 fresh state,保留 host 执方。
  async function startFresh(side: Side, host: Side) {
    setBusy(true);
    setErr(null);
    try {
      await createRoom(room, fresh(), host);
      await claimName(side);
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
      await claimName(side);
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

  const namePicker = (
    <>
      <p className="text-sm text-[#8fae95]">Your name</p>
      <div className="flex gap-2">
        {PLAYER_NAMES.map((n) => (
          <button
            key={n}
            onClick={() => setName(n)}
            className={`flex-1 rounded-md px-3 py-2 ${name === n ? 'bg-[#2e5a38] ring-1 ring-[#4a8f5a]' : 'bg-[#1a2a1f]'}`}
          >
            {n}
          </button>
        ))}
      </div>
    </>
  );

  if (loading) {
    return (
      <div className={box}>
        <p>Connecting…</p>
      </div>
    );
  }

  const mySide: Side | null = saved ?? (exists ? other(hostSide ?? 'zombie') : null);

  // —— 第一人:选名字 + 选边开局 ——
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
        {namePicker}
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

  // —— 执方已定:选名字 + 只读确认执方(第二人自动分边 / 本方刷新回来)——
  const oppName = names[other(mySide)];
  return (
    <div className={box}>
      <h2 className="text-lg font-bold">Play over WiFi</h2>
      {namePicker}
      <p className="text-sm text-[#8fae95]">Your side{oppName ? ` · vs ${oppName}` : ''}</p>
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
