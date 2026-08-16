import { useCallback, useEffect, useState } from 'react';
import type { Side } from '../engine/types.ts';
import { createInitialState } from '../engine/reduce.ts';
import { createRoom, fetchRoomMeta, claimSeat, takeoverSeat, type RoomMeta } from '../net/room.ts';
import { FAMILY_ROOM, PLAYER_NAMES, deviceToken, savedName, saveName, saveSeat } from '../net/access.ts';
import { mySeat, openSeats, isFull, nameBlocked } from '../net/seat.ts';

const label = (s: Side) => (s === 'plant' ? '🌱 Plants' : '🧟 Zombies');

// 大厅:无房号(口令即房间)。座位权威在 DB(*_token),本地 token = 身份。
// 显式区分:第一人开局 / 加入续局 / 抢座 / 重开新局。
export function Lobby({ onEnter, onCancel }: { onEnter: (seat: Side) => void; onCancel: () => void }) {
  const room = FAMILY_ROOM;
  const token = deviceToken();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<RoomMeta | null>(null);
  // 名字不再默认成 PLAYER_NAMES[0]:只用本设备上次选过的名字预填,否则强制先选。
  const [name, setName] = useState<string | null>(savedName(room));
  const [pick, setPick] = useState<Side | null>(null); // 需选边时(首个玩家 / 两座皆空)

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

  // 提交入座(claim/takeover 成功后统一:记名、记座、进入)。
  function seatIn(side: Side) {
    saveName(room, name!);
    saveSeat(room, side);
    onEnter(side);
  }

  // 加入空位 / 重连本座(原子条件认领)。被抢则刷新提示。
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

  // 第一人开局 / 重开新局:写 fresh state(已有房间须 rev+1),再认领本方。
  async function startFresh(side: Side, host: Side) {
    if (!name) return;
    if (meta?.exists && !window.confirm('Start a new game? This resets the board for both players.')) return;
    setBusy(true);
    setErr(null);
    try {
      await createRoom(room, fresh(), host, meta?.exists ? meta.rev + 1 : 0);
      // 重开后认领本方;若本方此刻被别人占(极少),显式覆盖(我正开新局,承诺此方)。
      const ok = await claimSeat(room, side, token, name);
      if (!ok) await takeoverSeat(room, side, token, name);
      seatIn(side);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  // 抢座(满员):确认后无条件覆盖对方令牌。
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

  const namePicker = meta && (
    <>
      <p className="text-sm text-[#8fae95]">Your name</p>
      <div className="flex gap-2">
        {PLAYER_NAMES.map((n) => {
          const blocked = nameBlocked(meta.claims, meta.names, token, n);
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

  if (loading || !meta) {
    return (
      <div className={box}>
        <p>{err ? `⚠ ${err}` : 'Connecting…'}</p>
        {err && <div className="flex gap-2">{backBtn}</div>}
      </div>
    );
  }

  const seat = mySeat(meta.claims, token); // 本设备已占的座(重连)
  const opens = openSeats(meta.claims);
  const full = isFull(meta.claims, token);
  const needPick = name == null; // 名字必须显式选

  // 进度描述行。
  const statusLine = (() => {
    if (!meta.exists) return null;
    if (meta.winner != null) {
      const w = meta.winner === 'draw' ? 'a draw' : `${label(meta.winner)} won`;
      return `Last game finished — ${w}.`;
    }
    if (meta.turn >= 1) return `Game in progress — turn ${meta.turn}.`;
    return 'Waiting to start.';
  })();

  // 占用行:每方谁在。
  const occLine = meta.exists && (
    <p className="text-sm text-[#8fae95]">
      {(['plant', 'zombie'] as Side[])
        .map((s) => `${label(s)}: ${meta.names[s] ?? (meta.claims[s] ? '—' : 'open')}${meta.claims[s] === token ? ' (you)' : ''}`)
        .join(' · ')}
    </p>
  );

  // —— 房间不存在:第一个玩家,选名字 + 选边 + 开局 ——
  if (!meta.exists) {
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
          <button onClick={() => startFresh(pick!, pick!)} disabled={busy || needPick || pick == null} className={primary}>
            {busy ? '…' : 'Start game'}
          </button>
          {backBtn}
        </div>
      </div>
    );
  }

  // —— 满员且不是我:只能抢座 ——
  if (full) {
    return (
      <div className={box}>
        <h2 className="text-lg font-bold">Play over WiFi</h2>
        {occLine}
        {statusLine && <p className="text-sm text-[#8fae95]">{statusLine}</p>}
        {namePicker}
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

  // —— 我已占一座(重连)——
  if (seat != null) {
    return (
      <div className={box}>
        <h2 className="text-lg font-bold">Play over WiFi</h2>
        {occLine}
        {statusLine && <p className="text-sm text-[#8fae95]">{statusLine}</p>}
        {namePicker}
        <div className="rounded-md bg-[#0f1a12] px-3 py-4 text-center text-2xl font-bold ring-1 ring-[#2a3d30]">
          {label(seat)} <span className="text-sm font-normal text-[#8fae95]">(you)</span>
        </div>
        {err && <p className="text-sm text-red-300">⚠ {err}</p>}
        <div className="mt-1 flex gap-2">
          <button onClick={() => join(seat)} disabled={busy || needPick} className={primary}>
            {busy ? '…' : meta.turn >= 1 && meta.winner == null ? 'Resume game' : 'Enter'}
          </button>
          {backBtn}
        </div>
        <button
          onClick={() => startFresh(seat, meta.hostSide ?? seat)}
          disabled={busy || needPick}
          className="rounded-md bg-[#3a2a2a] px-3 py-2 text-sm hover:bg-[#4a3a3a] disabled:opacity-50"
        >
          Start a new game (resets the board)
        </button>
      </div>
    );
  }

  // —— 有空位:加入续局(单空位=定死该方;双空位=选边)——
  const target: Side | null = opens.length === 1 ? opens[0] : pick;
  const resuming = meta.turn >= 1 && meta.winner == null;
  return (
    <div className={box}>
      <h2 className="text-lg font-bold">Play over WiFi</h2>
      {occLine}
      {statusLine && <p className="text-sm text-[#8fae95]">{statusLine}</p>}
      {namePicker}
      {opens.length === 2 ? (
        <>
          <p className="text-sm text-[#8fae95]">Pick your side.</p>
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
      ) : (
        <div className="rounded-md bg-[#0f1a12] px-3 py-4 text-center text-2xl font-bold ring-1 ring-[#2a3d30]">
          {label(target!)}
        </div>
      )}
      {err && <p className="text-sm text-red-300">⚠ {err}</p>}
      <div className="mt-1 flex gap-2">
        <button onClick={() => join(target!)} disabled={busy || needPick || target == null} className={primary}>
          {busy ? '…' : resuming ? 'Join & resume' : 'Join game'}
        </button>
        {backBtn}
      </div>
      <button
        onClick={() => startFresh(target ?? opens[0], meta.hostSide ?? target ?? opens[0])}
        disabled={busy || needPick || target == null}
        className="rounded-md bg-[#3a2a2a] px-3 py-2 text-sm hover:bg-[#4a3a3a] disabled:opacity-50"
      >
        Start a new game (resets the board)
      </button>
    </div>
  );
}
