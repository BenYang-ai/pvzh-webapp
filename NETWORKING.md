# M5 — WiFi networking (Supabase)

Two devices play across the room. Sync model: the **whole `GameState`** lives in one
Supabase row (`games`) as jsonb; the engine is a deterministic reducer, so the mover applies
`reduce` locally, pushes the new state, and the other device adopts it via a realtime
subscription. `rev` (monotonic) de-dupes echoes. No replay logic.

**Without Supabase env vars the app still runs** — it falls back to the local hot-seat
god-view. Networking only lights up once `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set.

## 1. Create a Supabase project
1. https://supabase.com → sign in → **New project** (free tier is fine). Pick a region close by.
2. Wait for it to provision.

## 2. Create the table + realtime + policy
Project → **SQL Editor** → run:

```sql
create table if not exists public.games (
  id text primary key,
  rev bigint not null default 0,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  host_side text,  -- 建房方执方(棋盘朝向);2026-08-15 席位大厅新增
  names jsonb not null default '{}'::jsonb,  -- 双方显示名 {plant?,zombie?};2026-08-15 新增
  plant_token text,   -- 占 🌱 座的设备令牌(null=空位);2026-08-16 DB 席位权威
  zombie_token text   -- 占 🧟 座的设备令牌(null=空位);2026-08-16 DB 席位权威
);
-- 老库补列(表已存在时):
alter table public.games add column if not exists host_side text;
alter table public.games add column if not exists names jsonb not null default '{}'::jsonb;
alter table public.games add column if not exists plant_token text;
alter table public.games add column if not exists zombie_token text;

-- realtime broadcast of row changes
alter publication supabase_realtime add table public.games;

-- RLS: family use — anonymous read/write, secrecy is the 4-letter room code.
-- (Tighten later if you ever make this public.)
alter table public.games enable row level security;
create policy "anon all" on public.games for all to anon using (true) with check (true);
```

## 3. Get the keys
Project → **Settings → API**:
- Project URL → `VITE_SUPABASE_URL`
- `anon` `public` key → `VITE_SUPABASE_ANON_KEY`

## 4. Local env
```bash
cp .env.example .env.local
# edit .env.local with the two values
```

## 5. Test on two devices (no deploy needed)
```bash
npm run dev   # vite --host, prints http://<mac-ip>:5173
```
- Both iPads open `http://<mac-ip>:5173` (same WiFi).
- Device A: **Play over WiFi → Create room**, pick a side (e.g. 🌱 Plants), note the 4-letter code.
- Device B: **Play over WiFi → Join room**, enter the code, pick the **other** side (🧟 Zombies).
- Take turns. Each device sees only its own hand; the opponent's hand shows as card backs, and
  hidden gravestones on the opponent's side stay face-down. Controls are disabled on the
  opponent's turn.

Superpowers charge via the Super-Block Meter (faithful mode) exactly as in local play.

## 6. Deploy (later, after it works locally)
Add the same two env vars in **Vercel → Project → Settings → Environment Variables**, then
redeploy. Until they're set in Vercel, the deployed site shows the local hot-seat only.

## Seat model (2026-08-16 — DB is the seat authority)
Seat ownership lives in the `games` row, **not** in each device's localStorage (the old
localStorage-seat design caused a "myself twice" collision when a stale saved seat matched
the host's side). Each device mints a `crypto.randomUUID()` **device token** (localStorage
`pvzh.device`) — that token, not the display name, owns a seat.

- **Claim** (`claimSeat`): atomic conditional update — `set {side}_token=me where token is
  null or already = me`. Single statement → Postgres row-locks, so two racers can't both take
  the same open seat; the loser gets an empty result and is told "seat just taken."
- **Reconnect**: on lobby open we read the row; if `{side}_token === my token` I'm auto-seated
  back on that side (`mySeat` in `src/net/seat.ts`).
- **Takeover** (`takeoverSeat`): unconditional overwrite, only after an explicit confirm — used
  when both seats are full and a new device wants in (the old holder drops).
- **Release** (`releaseSeat`): clears my token on Back, freeing the seat.
- **New game from the lobby** bumps `rev` to `currentRev+1` (never resets to 0) so a peer already
  in-game — whose guard ignores `rev ≤ applied` — still adopts the reset. `createRoom(…, rev)`.

The lobby (`src/ui/Lobby.tsx`) is explicit: it shows occupancy (who's on each side), whether a
game is in progress (turn N) / finished / waiting, and offers Join & resume · Start new · Take
over accordingly. Names never silently default — you must pick one, and a name already used by
the other seated player is blocked.

## Notes / limits (v1)
- Turn-based, so only the active side pushes; last-writer-wins with an `rev` guard is enough.
- Room row persists — re-creating the same code overwrites it (fresh game). **One fixed room**
  (口令 slug) + upsert on the `id` PK → the `games` table stays at a single row no matter how
  many games are played; no cleanup needed.
- Seat-locking via device tokens (above); client-side gate is obscurity, not real auth (family game).
