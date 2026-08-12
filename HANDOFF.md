# PvZ Family Card Game — Project State / Handoff

Living doc so any session can resume. Spec: `PvZ-Family-Card-Game-SPEC.md` (source of truth for rules).
Repo: `BenYang-ai/pvzh-webapp` (private). Live: **https://pvzh-webapp.vercel.app** (auto-deploys on push to `main`).

## What this is
PvZ Heroes-rules family card game. Two devices (iPads), Ben vs Miles(象象,11)/Leo(豹豹,7).
Goal: faithful PvZ Heroes ruleset, Green Shadow (plants) vs Super Brainz (zombies).
**Game UI is English only** (kids don't read Chinese). Code comments are Chinese, fine.

## Stack
Vite 6 + React 19 + TS (strict) + Tailwind v4 + Vitest. Node 22. Pure-reducer engine, no React/net/random in engine.

## Build order + status
- M0 ✅ scaffold + empty board + deploy pipeline
- M1 ✅ pure engine core (types, reduce, cardpool, deck, rng, effects) + tests
- M2 ✅ combat + all keywords
- **M4 ✅ local god-view UI** (moved before M3 to verify logic; hot-seat DROPPED — network/wifi only)
- Combat rules FIXED to real PvZH (see below)
- Leo's custom card **Petrosaurus** added + art pipeline live
- Real card pool REBUILT with wiki-verified stats (PR #5, deck 30) — see "Real card pool — DONE"
- **M3 ✅ superpowers + Super-Block Meter** (8 SPs, faithful/pick/off modes) — see "M3 — DONE"
- **M5 ✅ merged (PR #10)** — Supabase networking, env-gated (dormant on live until Vercel creds added). NOT yet live-tested on 2 devices. See "M5 — networking"
- **Debug replay log ✅ merged (PR #11)** — 🐞 Copy log button + `replay.ts`. See "Debug log / replay"
- **v1 FEATURE-COMPLETE (2026-08-12), 67 tests green.** Now bug-fix/playtest phase.
- M6 ⏳ PWA + deploy polish
- M7 ⏳ hand-drawn art takeover (pipeline already works via `art.image`)

## Architecture (files)
- `src/config.ts` — GameConfig constants (HP20, meter 8, charge 1–3, deck 40, superblock.mode='faithful', etc.)
- `src/data/cardpool.json` — ALL card data + decklists. Add card = edit JSON, no engine change.
- `src/engine/types.ts` — GameState, GameAction, Card, Effect, Fighter, TargetRef, Phase.
- `src/engine/rng.ts` — mulberry32 seeded RNG + shuffle (pure; state in `GameState.rng`).
- `src/engine/cardpool.ts` — typed loader (`getCard`, `decklistFor`).
- `src/engine/deck.ts` — keyword parse (`hasKeyword`/`keywordValue`), deck build, `makeFighter`.
- `src/engine/effects.ts` — effect interpreter + helpers (`applyNonCombatDamage`, `removeFighter`, `drawCards`, `otherSide`, `player`). TargetRef 'self' resolves to ETB fighter.
- `src/engine/combat.ts` — §6 FIGHT resolution + `performAttack` (no-removal unilateral attack) + `applyHeroDamage`.
- `src/engine/reduce.ts` — `createInitialState` + `reduce` (phase machine, play gating, resources, draw). `IllegalActionError` on bad moves.
- `src/engine/selectors.ts` — UI legal-move queries (`activeSide`, `emptyLanes`, `trickTargets`, `canAfford`).
- `src/ui/useGame.ts` — hook running reduce locally, surfaces errors. (M5 reuses; adds transport.)
- `src/ui/Board.tsx` — god-view board (both hands, lanes, hero bars, phase bar, selection+targeting).
- `src/ui/CardFace.tsx` — card render (emoji placeholder OR `art.image` scan) + keyword/status icons.

## Rule decisions (BEYOND spec, or CORRECTING it)
- **Combat is real PvZH (corrected from spec §6's sequential model):** lane-by-lane 0→4; within a lane zombie attacks first, then plant — and **the plant deals its damage even if already reduced to 0** (strikes as it dies). Even trade → BOTH die (spec's "tie→zombie wins" was WRONG). Source: plantsvszombies.wiki.gg.
- **Hero lethal checked immediately** mid-combat (zombie-first can win before plant retaliates); `resolveFight` stops as soon as a hero ≤0.
- **Frenzy** fires only if the zombie SURVIVES the plant's retaliation (then bonus attack into cleared lane → hero).
- **Ending zombie tricks auto-resolves the fight** (no separate "resolve" click) — advancing from ZOMBIE_TRICKS runs endTurn.
- Fatigue REMOVED: empty deck on forced draw = **tie game**.
- Keywords v1: `armored:N`, `bullseye` (hero-direct, no block charge), `strikethrough` (fighter+hero), `deadly` (>0 dmg destroys; armor doesn't save when residual>0), `frenzy`(z), `gravestone`(z, untargetable by anyone until FIGHT reveal), **`untrickable`** (trick-immune, both sides), **`cantBeHurt`** (temp this-turn shield: zeros ALL damage incl deadly, but destroyIf still works; cleared at next turn start).
- Super-Block Meter (§8.1) implemented in M3 (see "M3 — DONE"). `applyHeroDamage(state, side, amount, {isFighterHit})` charges/blocks/grants; bullseye/trick/SP pass isFighterHit:false (no charge).
- Superpowers (M3) confirmed vs wiki — Green Shadow: precision_blast(sig, 5 dmg mid lane), whirlwind(bounce random zombie), big_chill(freeze + draw), embiggen(+2/+2). Super Brainz: carried_away(sig, move zombie to empty lane +1/+1 + bonus attack), telepathy(draw 2), cut_down(destroy plant atk≥5), super_stench(all zombies gain deadly + draw). Modes: faithful(default)/pick/off — engine must support all three.

## Effect system
Effect kinds implemented: `damage`, `buff`, `draw`, `rampResource`, `destroyIf`, `bounce`, `freeze`, `shield`, `giveKeywordAll`, `move`, `bonusAttack` (M3: wired via `combat.bonusAttackAt` = performAttack + remove destroyed defender + game-over check; effects.ts↔combat.ts is a call-time-only ESM cycle, fine). TargetRef: `{lane,side}` | `'chosen'` (player pick) | `'random'` | `'fixedLane2'` | `'self'` (ETB fighter).
- **`GameState.config` now carries GameConfig** (M3): combat/effects/superpowers read `state.config` (needed for Super-Block RNG). `reduce` uses `prev.config` over its legacy `configOverride` param. `createInitialState` + test `baseState` stamp it.

## M3 — DONE (superpowers + Super-Block Meter, spec §8)
- SPs live in `cardpool.json` `superpowers.{plant,zombie}` (id/name/faction/targeting/minAttack?/effects?). Most reuse existing effect kinds; **`gs_precision_blast`** (5 dmg mid-lane index2, fighter-or-hero) and **`sb_carried_away`** (move friendly zombie to empty lane +1/+1 → bonus attack) are id-special-cased in `src/engine/superpowers.ts`.
- Green Shadow: precision_blast(sig), whirlwind(bounce random), big_chill(freeze+draw), embiggen(+2/+2). Super Brainz: carried_away(sig), telepathy(draw2), cut_down(destroy plant atk≥5), super_stench(all zombies deadly + draw).
- Super-Block Meter in `combat.applyHeroDamage`: fighter hit on hero (not bullseye/trick/SP) charges 1–3 (seeded); ≥8 → **fully blocks that hit**, clears meter, grants SP. faithful=random into `readySuperpower`; pick/off=offer 4 via `superpowerOfferedIds` → `PICK_SUPERPOWER`. off mode: no charge, instead every `superblockOffEveryNTurns` turns each side is offered (in `startTurn`).
- Actions `PLAY_SUPERPOWER`/`PICK_SUPERPOWER` in `reduce.ts` (SP playable in own play phase, cost 0; validation `validateSuperpowerTarget`). Enemy-target SPs (big_chill/cut_down) **cannot** touch `untrickable` or hidden-gravestone fighters; friendly buffs (embiggen/carried_away) are unrestricted. UI: `Board.SuperpowerControls` (play button / targeting hint / pick buttons) + `selectors` `canPlaySuperpowerNow`/`readySuperpower`/`offeredSuperpowers`/`superpowerTargets`.
- Tests: `superpowers.test.ts` (14) + `superblock.test.ts` (7). Total **61 green**.
- Also fixed (PR #7): zombie could play tricks in `ZOMBIE_PLAY`; now `ZOMBIE_TRICKS`-only (diverges from real PvZH per Ben's call).

## Debug log / replay (bug reports)
- Local god-view footer has an always-visible **🐞 Copy log** button (`useGame.exportLog()` → `src/ui/Board.tsx` `CopyLogButton`). Copies `{seed, config, actions, engineLog}` JSON to clipboard (insecure-origin/LAN-http fallback: a select-all textarea modal). Only successful actions are logged.
- **To debug a pasted log:** `src/engine/replay.ts` `replay(log)` (final state) / `replaySteps(log)` (state after each step). Engine is deterministic, so this reproduces the game bit-for-bit → turn any log into a regression test. Tests: `replay.test.ts`.
- Only wired into `LocalGame` (full-replay). Net mode not wired (remote moves bypass local `apply`; would need state-snapshot capture — deferred per scope).

## Testing
`npm test` (Vitest, 67 tests, all green). `npm run build` (tsc -b + vite). `npm run dev` for local wifi (`http://<mac-ip>:5173`). Test helpers in `tests/engine/helpers.ts` (`baseState`, `placeFighter`, `giveCard`) build minimal states directly.

## Git / deploy workflow
- PR per change, squash-merge, no review: `git checkout -b feat/x` → commit → `git push -u origin feat/x` → `gh pr create --body-file <file>` → `gh pr merge --squash --delete-branch` → `git checkout main && git pull`.
- Commit msgs use `git -c user.name='Ben Yang' -c user.email='ybyangben@gmail.com'`, end with Co-Authored-By line.
- **Commit-message gotcha:** apostrophes break `$(cat <<EOF)` heredocs — write msg/PR body to a scratchpad file, use `-F file` / `--body-file file`.
- Deploy: Vercel (email login; GitHub OAuth had failed) auto-builds on push to main, base `/`. GitHub Pages blocked (private repo needs paid plan); `.github/workflows/deploy.yml` is manual-only, uses `DEPLOY_TARGET=pages` for subpath base. `gh` CLI authed as BenYang-ai.

## Real card pool — DONE (wiki-verified stats)
Pool rebuilt with real PvZ Heroes stats from plantsvszombies.wiki.gg. Deck size = **30** (8 uniques/side; reaching 40 just needs 2 more real uniques/side + copies). Simplifications noted in cardpool `_note` (splash/amphibious/conjure dropped to v1 mechanics).
- Plants: Peashooter 1/1/1, Sunflower 1/1/1 (+1 sun ramp), Wall-Nut 1/0/6, Bonk Choy 1/2/1, Cactus 3/2/5 bullseye, Snapdragon 4/3/3, Bloomerang 4/3/5 strikethrough, Cherry Bomb 6-trick (4 dmg).
- Zombies: Imp 1/1/1, Conehead 2/2/2 armored:1, Smelly 3/2/4 gravestone+deadly, Vimpire 3/2/3 frenzy, Space Cowboy 4/3/5 strikethrough, Petrosaurus 8/4/5 deadly+frenzy+armored:1 +shield-self (Leo's, ×2), Nibble 1-trick (-1/-1), Backyard Bounce 3-trick (bounce).
- Keyword coverage: bullseye(Cactus), strikethrough(Bloomerang/Space Cowboy), armored(Conehead/Petro), deadly(Smelly/Petro — deadly is zombie-only in PvZH), frenzy(Vimpire/Petro), gravestone(Smelly), plus cantBeHurt(Petro onPlay). No card carries `untrickable` yet (engine supports it).
- `effects.ts` buff now removes a fighter reduced to ≤0 hp (for Nibble -1/-1).

### To extend the pool later (constraints)
- v1 does NOT enforce class legality (spec §14 roadmap) — free to pick real plants for plant deck, real zombies for zombie deck.
- Use ONLY mechanics we support (keywords above + implemented effect kinds). Avoid amphibious/team-up/splash/conjure/overshoot etc.
- KEEP Leo's `z_petrosaurus` (cost 8, 4/5, deadly+frenzy+armored:1, onPlay shield self, art.image scan).
- Decks are 40 cards (`init.test.ts` asserts deck+hand=40 per side); keep totals at 40 or update that test.
- Get EXACT stats from https://plantsvszombies.wiki.gg (do NOT guess — wrong stats is the bug being fixed).
- After building, update combat/trick tests that reference specific card stats (many hard-code z_basic 3/2, wallnut armored:1, etc.).
- All numbers stay in cardpool.json for family playtesting/tuning (§10.4).

## M5 — networking (merged PR #10, not yet live-tested)
Full setup + test plan: **`NETWORKING.md`**. Merged but env-gated → dormant until Supabase creds exist. To test: `npm run dev --host`, 2 iPads, Supabase creds in `.env.local`. To enable on the live site: add the 2 env vars to Vercel.
- **Sync model:** whole `GameState` in one Supabase row (`games` jsonb). Engine is deterministic → mover applies `reduce` locally, pushes state, other device adopts via realtime `postgres_changes`. `rev` (monotonic) de-dupes echoes; no replay logic.
- **Env-gated:** `src/net/supabase.ts` `isNetworkEnabled()` = both `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` present. Missing → app runs local hot-seat only (safe fallback; deploy without creds is harmless).
- Files: `src/net/supabase.ts` (client), `src/net/room.ts` (createRoom/fetchRoom/pushState/subscribeRoom), `src/ui/useNetworkGame.ts` (optimistic apply + subscribe), `src/ui/Lobby.tsx` (create/join + side pick), `src/ui/NetworkGame.tsx` + `src/ui/LocalGame.tsx` (Board wrappers), `src/ui/App.tsx` (menu/lobby/local/net router).
- **Board is now presentational** (`BoardProps`: state/apply/error/viewSide/onNewGame/onLeave/banner). `viewSide` set = single-side view: opponent hand → card backs, opponent hidden gravestone → back, controls gated to `mine(side)`. `viewSide` undefined = god-view (M4 behavior, `LocalGame`).
- Supabase table + RLS SQL is in `NETWORKING.md` §2. `@supabase/supabase-js` added to deps.
- Tests: `serialization.test.ts` guards jsonb round-trip (no Map/Set/undefined). 64 green. (Transport itself needs the live service — not unit-tested.)
- **TODO to enable live:** create Supabase project + run SQL (NETWORKING.md §2), add the two env vars to Vercel, then do a real 2-device test.

## Open decisions
- `superblock.mode` default `faithful` (random) — CONFIRMED by Ben (kids-pick not wanted).
- Real-pool roster: user chose "research wiki + build". Keep current pool live until replacement is ready + tested.
