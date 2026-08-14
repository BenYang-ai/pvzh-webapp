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

## Bug-fix workflow
Invoke the **`pvzh-debug`** project skill (`.claude/skills/pvzh-debug/SKILL.md`) when Ben pastes a replay log — it encodes the whole loop (reproduce → verify real bug → fix → regression test → PR/squash-merge → offer Load-log resume).

## Known bugs / next fixes
- **superpowers-as-stackable-trick-cards FIXED (2026-08-14, PR pending).** Was: `hero.readySuperpower` single slot → a new Super-Block grant overwrote an unplayed one (held SP lost, never >1). Now `hero.readySuperpowers: string[]` — grants stack, nothing lost. A superpower is treated as a trick card: **free** when fired in the Super-Block fight-interrupt window (the block reward), otherwise **costs `config.superpowerHandCost` (default 1)** played from the tray in the owner's trick window (zombie `ZOMBIE_TRICKS`, plant `PLANT_PLAY`). `PLAY_SUPERPOWER` gained an optional `superpowerId` (which held SP to play; defaults to most-recent). Touched: `types` (HeroState + action), `superpowers.grantSuperpower` (push), `reduce.playSuperpower`/`pickSuperpower`/init/off-mode gate, `selectors` (`readySuperpowers`/`superpowerCost`/`canPlaySuperpowerNow`), `Board.SuperpowerControls` (one button per held SP, shows cost). Config `superpowerHandCost?` read with `?? 1` fallback so old replay logs still reproduce. Verified with the game-1 log: zombie now ends holding `['sb_cut_down','sb_carried_away']` (previously the 2nd overwrote the 1st).
- **zombie superpower phase gating FIXED (2026-08-14, PR pending).** Zombie SP was playable in `ZOMBIE_PLAY`; now `ZOMBIE_TRICKS`-only (+ fight interrupt), mirroring the PR#7 zombie-tricks divergence. Plants unchanged (`PLANT_PLAY`, no separate trick phase). Fixed both `reduce.playSuperpower` and `selectors.canPlaySuperpowerNow`.
- **`bullseye` FIXED (Ben, 2026-08-13, PR pending).** Was hero-seeking (skipped lane fighter). Now attacks normally — hits the fighter in front if present, else the hero; its only special effect is bypassing the Super-Block Meter on **hero** hits (`isFighterHit:false` only when bullseye reaches a hero). Deleted the bullseye early-return in `performAttack`; normal hero-hit branch passes `isFighterHit: !bullseye`. Verified with the Cactus-vs-Smelly repro (Cactus deals 2 → Smelly 4→2, then dies to Smelly's deadly).

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
- **Hand size limit (`config.handSizeMax`=10):** at turn start a side with **≥10 cards does NOT draw** (other mechanics — superpowers/card effects — can still push a hand past 10). While a hero's own hand is **≥10, enemy hits do NOT charge that hero's Super-Block Meter** (treated as bullseye: no charge, no block, damage passes). Both gated on `handSizeMax`; the meter charge check lives in `combat.applyHeroDamage`, the draw skip in `reduce.startTurn`.
- **Super-Block mid-fight interrupt:** when the meter fills *during a FIGHT* and grants a superpower, the fight PAUSES (`phase='SUPERPOWER_INTERRUPT'`) after the current lane finishes. The owning side may play a held superpower immediately (free in this window) or skip; the SP is already in `readySuperpowers` (the grant pushed it), so skipping just leaves it there to play later from the tray for `superpowerHandCost` (default 1). Mechanics: `combat.resolveFight` is resumable via `state.fightResume={nextLane}`; `applyHeroDamage` pushes the charging side onto `state.interrupts` (a queue — both sides can charge in one fight, offered one at a time in lane order); `reduce.finishInterruptStep` pops the queue and resumes the fight (resets `phase='FIGHT'` so `endTurn` proceeds to the next turn once the fight completes). `playSuperpower`/`advancePhase` accept the interrupt phase for the queue-front side only. Real PvZH adds the SP to hand; here it goes into a stackable `readySuperpowers` tray that plays like a trick card (free in this window, else 1 in the trick window) — Ben's design (2026-08-14).
- Super-Block Meter (§8.1) implemented in M3 (see "M3 — DONE"). `applyHeroDamage(state, side, amount, {isFighterHit})` charges/blocks/grants; bullseye/trick/SP pass isFighterHit:false (no charge).
- **Super-Block trigger cap (Ben, 2026-08-15):** each side's meter can fill at most **3 times** (`config.blockMeterMaxTriggers`=3). `HeroState.blockTriggers` counts fills; once it hits 3 the meter never charges again — enemy fighter hits pass full damage (like the meter is gone). Per-side independent. Gate in `combat.applyHeroDamage`; UI `BlockMeter` shows "no block" when capped.
- **Superpowers are UNIQUE cards (Ben, 2026-08-15):** each of the 4 SPs/side can be drawn only ONCE (same as a deck card with N copies — no 5th appearance). `HeroState.usedSuperpowerIds` tracks drawn ids; `grantSuperpower` filters them out (faithful → random from remaining, marks used; pick/off → offers only remaining) and returns a bool (false = all drawn → no grant, no interrupt). `reduce.pickSuperpower` marks the picked id used. With the 3-trigger cap ≤ 4 uniques, faithful never exhausts, but empty is handled defensively.
- Superpowers (M3) confirmed vs wiki — Green Shadow: precision_blast(sig, 5 dmg mid lane), whirlwind(bounce random zombie), big_chill(freeze + draw), embiggen(+2/+2). Super Brainz: carried_away(sig, move zombie to empty lane +1/+1 + bonus attack), telepathy(draw 2), cut_down(destroy plant atk≥5), super_stench(all zombies gain deadly + draw). Modes: faithful(default)/pick/off — engine must support all three.

## Effect system
Effect kinds implemented: `damage`, `buff`, `draw`, `rampResource`, `destroyIf`, `bounce`, `freeze`, `shield`, `giveKeywordAll`, `move`, `bonusAttack` (M3: wired via `combat.bonusAttackAt` = performAttack + remove destroyed defender + game-over check; effects.ts↔combat.ts is a call-time-only ESM cycle, fine). TargetRef: `{lane,side}` | `'chosen'` (player pick) | `'random'` | `'fixedLane2'` | `'self'` (ETB fighter).
- **`GameState.config` now carries GameConfig** (M3): combat/effects/superpowers read `state.config` (needed for Super-Block RNG). `reduce` uses `prev.config` over its legacy `configOverride` param. `createInitialState` + test `baseState` stamp it.

## M3 — DONE (superpowers + Super-Block Meter, spec §8)
- SPs live in `cardpool.json` `superpowers.{plant,zombie}` (id/name/faction/targeting/minAttack?/effects?). Most reuse existing effect kinds; **`gs_precision_blast`** (5 dmg mid-lane index2, fighter-or-hero) and **`sb_carried_away`** (move friendly zombie to empty lane +1/+1 → bonus attack) are id-special-cased in `src/engine/superpowers.ts`.
- Green Shadow: precision_blast(sig), whirlwind(bounce random), big_chill(freeze+draw), embiggen(+2/+2). Super Brainz: carried_away(sig), telepathy(draw2), cut_down(destroy plant atk≥5), super_stench(all zombies deadly + draw).
- Super-Block Meter in `combat.applyHeroDamage`: fighter hit on hero (not bullseye/trick/SP) charges 1–3 (seeded); ≥8 → **fully blocks that hit**, clears meter, grants SP. faithful=random pushed into `readySuperpowers`; pick/off=offer 4 via `superpowerOfferedIds` → `PICK_SUPERPOWER` (pushes chosen into `readySuperpowers`). off mode: no charge, instead every `superblockOffEveryNTurns` turns each side is offered (in `startTurn`).
- Actions `PLAY_SUPERPOWER`(+optional `superpowerId`)/`PICK_SUPERPOWER` in `reduce.ts`. SP playable in the fight-interrupt window (free) or the owner's trick window (zombie `ZOMBIE_TRICKS` / plant `PLANT_PLAY`) for `superpowerHandCost` (default 1); validation `validateSuperpowerTarget`. Enemy-target SPs (big_chill/cut_down) **cannot** touch `untrickable` or hidden-gravestone fighters; friendly buffs (embiggen/carried_away) are unrestricted. UI: `Board.SuperpowerControls` (one play button per held SP w/ cost / targeting hint / pick buttons) + `selectors` `canPlaySuperpowerNow`/`readySuperpowers`/`superpowerCost`/`offeredSuperpowers`/`superpowerTargets`.
- Tests: `superpowers.test.ts` (14) + `superblock.test.ts` (7). Total **61 green**.
- Also fixed (PR #7): zombie could play tricks in `ZOMBIE_PLAY`; now `ZOMBIE_TRICKS`-only (diverges from real PvZH per Ben's call).

## Debug log / replay (bug reports)
- Local god-view footer has an always-visible **🐞 Copy log** button (`useGame.exportLog()` → `src/ui/Board.tsx` `CopyLogButton`). Copies `{seed, config, actions, engineLog}` JSON to clipboard (insecure-origin/LAN-http fallback: a select-all textarea modal). Only successful actions are logged.
- **📥 Load log** button (next to Copy log) resumes from a pasted log: `useGame.importLog(json)` → `replay(log)` → continues recording (further actions append; `exportLog` stays a full replayable chain). Returns an error string on bad JSON/illegal action, else null. Lets Ben re-check a fixed bug by replaying to the buggy position and playing on.
- **To debug a pasted log:** `src/engine/replay.ts` `replay(log)` (final state) / `replaySteps(log)` (state after each step). Engine is deterministic, so this reproduces the game bit-for-bit → turn any log into a regression test. Tests: `replay.test.ts`.
- Only wired into `LocalGame` (full-replay, copy + load). Net mode not wired (remote moves bypass local `apply`; would need state-snapshot capture — deferred per scope).

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
