import { useCallback, useEffect, useState } from 'react';
import type { Side } from '../engine/types.ts';
import { createInitialState } from '../engine/reduce.ts';
import { createRoom, fetchRoomMeta, claimSeat, takeoverSeat, resetSeats, type RoomMeta } from '../net/room.ts';
import { FAMILY_ROOM, PLAYER_NAMES, deviceToken, savedName, saveName, saveSeat } from '../net/access.ts';
import { mySeat, openSeats, isFull, nameBlocked } from '../net/seat.ts';

const label = (s: Side) => (s === 'plant' ? '🌱 Plants' : '🧟 Zombies');

// 大厅:mode 决定意图。'new' = 选名字+边开新局(重置双方座位);'resume' = 加入/重连/抢座已有局。
export function Lobby({ mode, onEnter, onCancel }: { mode: 'new' | 'resume'; onEnter: (seat: Side) => void; onCancel: () => void }) {
  const room = FAMILY_ROOM;
  const token = deviceToken();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<RoomMeta | null>(null);
  // 名字不默认成 PLAYER_NAMES[0]:只用本设备上次选过的名字预填,否则强制先选。
  const [name, setName] = useState<string | null>(savedName(room));
  const [pick, setPick] = useState<Side | null>(null); // 需选边时(new / 两座皆空)

  const refresh = useCallback(async () => {
    const m = await fetchRoomMeta(room);
    setMeta(m);
    return m;
  }, [room]);

  useEffect(() => {
    let alive = true;
    refresh()
      .then(() => alive && setLoading(false))
      .catch((e) => alive && (setErr((e as Error).message), setLoading(false)));
    return () => {
      alive = false;
    };
  }, [refresh]);

  const fresh = () => createInitialState({ seed: `${room}-${Date.now()}` });

  function seatIn(side: Side) {
    if (name) saveName(room, name);
    saveSeat(room, side);
    onEnter(side);
  }

  // 'new':写 fresh state(已有房间须 rev+1),重置座位为「我坐 pick、对方清空」。
  async function startNew() {
    if (!name || pick == null) return;
    if (meta?.exists && !window.confirm('Start a new game? This resets the board for both players.')) return;
    setBusy(true);
    setErr(null);
    try {
      await createRoom(room, fresh(), pick, meta?.exists ? meta.rev + 1 : 0);
      await resetSeats(room, pick, token, name);
      seatIn(pick);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  // 'resume':加入空位 / 重连本座(原子条件认领)。被抢则刷新提示。
  async function join(side: Side) {
    if (!name) return;
    setBusy(true);
    setErr(null);
    try {
      const ok = await claimSeat(room, side, token, name);
      if (!ok) {
        setErr('That seat was just taken — refreshed.');
        await refresh();
        setBusy(false);
        return;
      }
      seatIn(side);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  // 'resume' 满员:抢座(确认后无条件覆盖对方令牌)。
  async function takeover(side: Side) {
    if (!name) return;
    const who = meta?.names[side] ?? 'the current player';
    if (!window.confirm(`Take over ${label(side)} from ${who}? They'll be disconnected.`)) return;
    setBusy(true);
    setErr(null);
    try {
      await takeoverSeat(room, side, token, name);
      seatIn(side);
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
  const primary = 'flex-1 rounded-md bg-sky-700 px-3 py-2 font-semibold hover:bg-sky-600 disabled:opacity-50';
  const title = <h2 className="text-lg font-bold">Play over Internet</h2>;

  // 名字选择器。block=true 时(resume)屏蔽对方座位已用的名字。
  const namePicker = (block: boolean) =>
    meta && (
      <>
        <p className="text-sm text-[#8fae95]">Your name</p>
        <div className="flex gap-2">
          {PLAYER_NAMES.map((n) => {
            const blocked = block && nameBlocked(meta.claims, meta.names, token, n);
            return (
              <button
                key={n}
                disabled={blocked}
                onClick={() => setName(n)}
                className={`flex-1 rounded-md px-3 py-2 ${
                  name === n ? 'bg-[#2e5a38] ring-1 ring-[#4a8f5a]' : 'bg-[#1a2a1f]'
                } ${blocked ? 'cursor-not-allowed opacity-40' : ''}`}
              >
                {n}
                {blocked ? ' ·taken' : ''}
              </button>
            );
          })}
        </div>
      </>
    );

  const sidePicker = (
    <>
      <p className="text-sm text-[#8fae95]">Your side</p>
      <div className="flex gap-2">
        {(['plant', 'zombie'] as Side[]).map((s) => (
          <button
            key={s}
            onClick={() => setPick(s)}
            className={`flex-1 rounded-md px-3 py-2 ${pick === s ? 'bg-[#2e5a38] ring-1 ring-[#4a8f5a]' : 'bg-[#1a2a1f]'}`}
          >
            {label(s)}
          </button>
        ))}
      </div>
    </>
  );

  if (loading || !meta) {
    return (
      <div className={box}>
        <p>{err ? `⚠ ${err}` : 'Connecting…'}</p>
        {err && <div className="flex gap-2">{backBtn}</div>}
      </div>
    );
  }

  const needPick = name == null;

  // ————————————————— NEW GAME —————————————————
  if (mode === 'new') {
    return (
      <div className={box}>
        {title}
        <p className="text-sm text-[#8fae95]">Start a new game — pick your name and side.</p>
        {namePicker(false)}
        {sidePicker}
        {meta.exists && meta.turn >= 1 && meta.winner == null && (
          <p className="text-sm text-amber-300">A game is in progress — starting new resets the board for both players.</p>
        )}
        {err && <p className="text-sm text-red-300">⚠ {err}</p>}
        <div className="mt-1 flex gap-2">
          <button onClick={startNew} disabled={busy || needPick || pick == null} className={primary}>
            {busy ? '…' : 'Start game'}
          </button>
          {backBtn}
        </div>
      </div>
    );
  }

  // ————————————————— RESUME / JOIN —————————————————
  const seat = mySeat(meta.claims, token);
  const opens = openSeats(meta.claims);
  const full = isFull(meta.claims, token);

  const statusLine = (() => {
    if (!meta.exists) return 'No game found.';
    if (meta.winner != null) return `Last game finished — ${meta.winner === 'draw' ? 'a draw' : `${label(meta.winner)} won`}.`;
    if (meta.turn >= 1) return `Game in progress — turn ${meta.turn}.`;
    return 'Waiting to start.';
  })();

  const occLine = meta.exists && (
    <p className="text-sm text-[#8fae95]">
      {(['plant', 'zombie'] as Side[])
        .map((s) => `${label(s)}: ${meta.names[s] ?? (meta.claims[s] ? '—' : 'open')}${meta.claims[s] === token ? ' (you)' : ''}`)
        .join(' · ')}
    </p>
  );

  // 无局可续(极少:menu 已 gate)→ 回菜单开新局。
  if (!meta.exists) {
    return (
      <div className={box}>
        {title}
        <p className="text-sm text-[#8fae95]">No game to resume. Go back and start a new one.</p>
        <div className="flex gap-2">{backBtn}</div>
      </div>
    );
  }

  // 我已占一座:直接续。
  if (seat != null) {
    return (
      <div className={box}>
        {title}
        {occLine}
        <p className="text-sm text-[#8fae95]">{statusLine}</p>
        <div className="rounded-md bg-[#0f1a12] px-3 py-4 text-center text-2xl font-bold ring-1 ring-[#2a3d30]">
          {label(seat)} <span className="text-sm font-normal text-[#8fae95]">(you)</span>
        </div>
        {err && <p className="text-sm text-red-300">⚠ {err}</p>}
        <div className="mt-1 flex gap-2">
          <button onClick={() => join(seat)} disabled={busy} className={primary}>
            {busy ? '…' : 'Resume game'}
          </button>
          {backBtn}
        </div>
      </div>
    );
  }

  // 满员且不是我:只能抢座。
  if (full) {
    return (
      <div className={box}>
        {title}
        {occLine}
        <p className="text-sm text-[#8fae95]">{statusLine}</p>
        {namePicker(true)}
        <p className="text-sm text-amber-300">Game is full. Take over a seat to join (the current player drops).</p>
        {err && <p className="text-sm text-red-300">⚠ {err}</p>}
        <div className="flex gap-2">
          {(['plant', 'zombie'] as Side[]).map((s) => (
            <button key={s} onClick={() => takeover(s)} disabled={busy || needPick} className={primary}>
              Take over {label(s)}
            </button>
          ))}
        </div>
        <div className="flex gap-2">{backBtn}</div>
      </div>
    );
  }

  // 有空位:加入(单空位=定死该方;双空位=选边)。
  const target: Side | null = opens.length === 1 ? opens[0] : pick;
  return (
    <div className={box}>
      {title}
      {occLine}
      <p className="text-sm text-[#8fae95]">{statusLine}</p>
      {namePicker(true)}
      {opens.length === 2 ? (
        sidePicker
      ) : (
        <div className="rounded-md bg-[#0f1a12] px-3 py-4 text-center text-2xl font-bold ring-1 ring-[#2a3d30]">{label(target!)}</div>
      )}
      {err && <p className="text-sm text-red-300">⚠ {err}</p>}
      <div className="mt-1 flex gap-2">
        <button onClick={() => join(target!)} disabled={busy || needPick || target == null} className={primary}>
          {busy ? '…' : 'Join & resume'}
        </button>
        {backBtn}
      </div>
    </div>
  );
}
