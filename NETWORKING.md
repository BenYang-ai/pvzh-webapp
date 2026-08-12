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
  updated_at timestamptz not null default now()
);

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

## Notes / limits (v1)
- Turn-based, so only the active side pushes; last-writer-wins with an `rev` guard is enough.
- Room row persists — re-creating the same code overwrites it (fresh game).
- No auth/seat-locking: both devices trust each other to pick opposite sides (family game).
