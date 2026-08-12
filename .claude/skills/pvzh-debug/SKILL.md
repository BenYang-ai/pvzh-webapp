---
name: pvzh-debug
description: >-
  Fix a bug in the PvZ Heroes family card game (pvzh-webapp) from a pasted replay
  log: reproduce deterministically, verify it's a real bug, fix the engine, add a
  regression test, PR + squash-merge. Use when Ben reports a gameplay bug and/or
  pastes a debug log JSON ({seed, config, actions, engineLog}). Triggers: "pvzh
  bug", "replay log", "Copy log", "load log", "smelly/cactus/zombie should have…",
  combat / keyword / superpower / Super-Block / trick behaves wrong.
---

# PvZ card game — bug-fix loop

Deterministic engine (pure reducer + seeded RNG) → a log fully reproduces a game.
The only variable input is the pasted log. Follow these steps; keep commits/PRs normal-English.

## 0. Orient
- Read `HANDOFF.md` first — especially **"Known bugs / next fixes"**, the rule
  decisions (combat §6 / keywords §7 / superpowers §8), and the git workflow.
- The bug report may or may not include a log. If it does, it's
  `{ seed, config, actions, engineLog }` (only *successful* actions are recorded —
  an "it let me do X illegally" / "it rejected legal X" bug won't be in `actions`,
  so ask Ben for that one move).

## 1. Reproduce
- Use `src/engine/replay.ts`: `replay(log)` → final state; `replaySteps(log)` →
  state after each action (index = after action N; `steps[0]` = initial).
- To inspect board state, write a throwaway `tests/_scratch.test.ts` that
  `console.log`s the lanes/heroes at the relevant step, run it with
  `LOGJSON='…' npx vitest run tests/_scratch.test.ts`, read output, then **delete
  the scratch file**. (instanceIds encode the card: `plant_15` is a specific card
  regardless of shuffle — dump `getCard(f.cardId).name` to identify it.)
- The exported `engineLog` (combat events) usually explains what happened — read it.

## 2. Verify it's a REAL bug BEFORE touching code
- Compare the reproduced behavior against the real PvZ Heroes rule and cite it.
- Many reports are misunderstandings, not bugs (e.g. a card had `bullseye` or
  `deadly`). If the engine is correct, explain it with the replayed state and the
  rule — do **not** "fix" correct behavior. Only proceed if the rule is genuinely
  violated.

## 3. Fix
- Engine stays a **pure deterministic reducer** — no React/network/`Math.random`
  in `src/engine`. All tunable numbers live in `src/data/cardpool.json`.
- Match the surrounding code style; Chinese code comments are fine (game UI strings
  stay **English only** — kids don't read Chinese).
- Keep `reduce.ts` validation and `selectors.ts` UI queries in sync (they mirror
  each other for legality).

## 4. Regression test
- Turn the bug into a permanent test (prefer the engine level — build a minimal
  state via `tests/engine/helpers.ts` `baseState`/`placeFighter`/`giveCard`, or
  replay the actual log). Assert the corrected behavior.

## 5. Green gate
- `npm test` and `npm run build` must both pass before committing.

## 6. Ship (PR per fix, squash-merge, no review)
```
git checkout main && git pull
git checkout -b fix/<slug>        # or feat/<slug>
# … edits …
# write commit msg + PR body to a scratchpad file — apostrophes break heredocs;
# use -F / --body-file. End the commit message with:
#   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
git -c user.name='Ben Yang' -c user.email='ybyangben@gmail.com' commit -F msg.txt
git push -u origin fix/<slug>
gh pr create --title "…" --body-file pr.txt   # end PR body with the Claude Code line
gh pr merge <n> --squash --delete-branch
git checkout main && git pull
```
Live site (`pvzh-webapp.vercel.app`) auto-deploys on push to main.

## 7. If a RULE changed (not just a code bug)
- Update `HANDOFF.md` (rule-decisions / known-bugs) and `src/data/cardpool.json`
  as needed, and record the change in the `pvzh_webapp` memory so future sessions
  inherit it.

## 8. Hand back
- Tell Ben what was wrong + the fix in one or two lines. Offer the **📥 Load log**
  resume path (paste the same log → replays to the buggy spot → he re-checks on the
  live site). Ask for a fresh log if the fix needs eyeballing.
