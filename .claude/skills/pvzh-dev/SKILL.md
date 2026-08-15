---
name: pvzh-dev
description: >-
  Work on the PvZ Heroes family card game (pvzh-webapp) — fix a gameplay bug OR
  build a new feature. Two paths share one house-rules core (engine purity, English
  UI, green gate, PR/squash-merge, HANDOFF+memory updates). Use whenever Ben reports
  a bug, pastes a debug log JSON ({seed, config, actions, engineLog}), or asks to add
  / change a feature (lobby, networking, animation, UI, cards, superpowers).
  Triggers: "pvzh bug", "replay log", "Copy log", "Copy state", "load log",
  "smelly/cactus/zombie should have…", combat/keyword/superpower/Super-Block/trick
  behaves wrong, "add a feature", "networking", "lobby", "seat", "animation".
---

# PvZ card game — dev loop (bug fix OR feature)

Deterministic engine (pure reducer + seeded RNG) → a log fully reproduces a game.
Pick a path below, but the **House rules** apply to both. Keep commits/PRs normal-English.

## 0. Orient (always)
- Read **`HANDOFF.md`** first — it's the SOURCE OF TRUTH: "Known bugs / next fixes",
  rule decisions (combat §6 / keywords §7 / superpowers §8), networking, git workflow.
  Confirm against the code; the `pvzh_webapp` memory is a pointer, not the spec.
- Decide the path: **A (bug)** if something behaves wrong vs the real rule;
  **B (feature)** if adding/changing behavior. Mixed = do the bug first.

---

## House rules (both paths)
- **Engine is a pure deterministic reducer** — no React / network / `Math.random` in
  `src/engine`. All tunable numbers live in `src/data/cardpool.json` / `src/config.ts`.
- Keep `reduce.ts` validation and `selectors.ts` UI queries **in sync** (they mirror
  each other for legality).
- **Game UI strings are English only** (kids don't read Chinese). Chinese code
  comments are fine. Match surrounding style.
- **Green gate:** `npm test` AND `npm run build` must pass before committing.
- **Ship — PR per change, squash-merge, no review:**
  ```
  git checkout main && git pull
  git checkout -b fix/<slug>   # or feat/<slug>
  # … edits …  (write commit msg + PR body to a scratchpad file — apostrophes
  #             break heredocs; use -F / --body-file)
  git -c user.name='Ben Yang' -c user.email='ybyangben@gmail.com' commit -F msg.txt
  #   end the commit message with:
  #   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  git push -u origin <branch>
  gh pr create --title "…" --body-file pr.txt   # end PR body with the Claude Code line
  gh pr merge <n> --squash --delete-branch
  git checkout main && git pull
  ```
  Live site (`pvzh-webapp.vercel.app`) auto-deploys on push to main. Merge once green
  (see the `merge-autonomy` memory).
- **If a RULE or infra changed** (not just a code bug): update `HANDOFF.md`
  (rule-decisions / networking) and record it in the `pvzh_webapp` memory so future
  sessions inherit it. Update `cardpool.json` if card data changed.

---

## Path A — BUG

### A1. Reproduce
- `src/engine/replay.ts`: `replay(log)` → final state; `replaySteps(log)` → state
  after each action (`steps[0]` = initial, index N = after action N).
- The bug report may or may not include a log. **Local** log = `{seed, config,
  actions, engineLog}` (only *successful* actions — an "it let me do X illegally" /
  "it rejected legal X" bug won't be in `actions`, so ask Ben for that one move).
  **Net** bug = ask Ben to tap **📋 Copy state** (Ben-only button) → he pastes the
  authoritative `GameState` JSON; load it into a scratch test to inspect the board.
- To inspect state, write a throwaway `tests/_scratch.test.ts` that `console.log`s
  the lanes/heroes at the step, run `LOGJSON='…' npx vitest run tests/_scratch.test.ts`,
  read output, then **delete the scratch file**. (instanceIds encode the card:
  `plant_15` is a specific card; dump `getCard(f.cardId).name` to identify it.)
- The exported `engineLog` (combat events) usually explains what happened — read it.

### A2. Verify it's a REAL bug BEFORE touching code
- Compare replayed behavior against the real PvZ Heroes rule and cite it.
- Many reports are misunderstandings, not bugs (a card had `bullseye`/`deadly`, etc.).
  If the engine is correct, explain it with the replayed state + rule — do **not**
  "fix" correct behavior. Only proceed if the rule is genuinely violated.

### A3. Fix + A4. Regression test
- Fix per House rules. Turn the bug into a permanent test (prefer engine level —
  build a minimal state via `tests/engine/helpers.ts` `baseState`/`placeFighter`/
  `giveCard`, or replay the actual log). Assert the corrected behavior.

### A5. Hand back
- One/two lines: what was wrong + the fix. Offer the **📥 Load log** resume path
  (paste same log → replays to the buggy spot → he re-checks live). Ask for a fresh
  log if the fix needs eyeballing.

---

## Path B — FEATURE

### B1. Scope + confirm
- Restate the ask in one line; surface real decisions with `AskUserQuestion` only
  when the answer changes what you build (interval, host model, etc.). Otherwise pick
  the obvious default and say so. Ben likes seeing effort/approach before a big build.

### B2. Design against the architecture
- Read the touched files first (map in HANDOFF "Architecture"). Reuse existing
  patterns: engine effect kinds & keywords, `Board` presentational props, the
  networking transport (`src/net/room.ts` whole-`GameState` jsonb row + `rev` guard),
  the `useCombatAnimation` replay helpers.
- **Networking gotchas learned:** realtime is best-effort → reconcile poll heals
  dropped events; a "new game" must push at **rev+1**, never reset rev to 0 (peers'
  `rev>local` guard would ignore it); client-side gates are **obscurity, not auth**.

### B3. DB migration? (Supabase)
- Adding a column (host_side, names, …) needs a one-time `alter table … add column
  if not exists …` that **Ben runs** in the Supabase SQL Editor. Make it
  backward-compatible (nullable / default), call it out clearly in the PR body and
  to Ben, and add it to `NETWORKING.md`. Code that reads the column ships in the same
  PR but the app breaks until the SQL is run — tell Ben to run it first.

### B4. Test what's testable; say what isn't
- Engine/pure logic → unit test (extract pure helpers so they're testable, e.g. the
  combat-replay functions, `access.ts` secret/slug). Transport / React / timers are
  NOT unit-tested here (matches the repo) — verify by build + a real 2-device check,
  and state plainly that they rest on manual testing.

### B5. Hand back
- One/two lines on what shipped + any action Ben must take (run the SQL, hard-refresh
  both iPads, retest over WiFi). Offer follow-ups rather than scope-creeping.
