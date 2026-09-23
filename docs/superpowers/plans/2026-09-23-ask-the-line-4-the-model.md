# Ask, the Line · Plan 4 of 4: the model

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decide the model Ask answers on. Sonnet 5 stays unless Opus 5.5 wins the gate the spec sets (section 8.3): it passes every case Sonnet 5 passes, Ruben prefers it on at least 8 of 12 answers read blind, its first words come within 1.5 s of Sonnet 5's, and no round stops at the cap. Its cost per answered turn sits beside those numbers for Ruben's call.

**Spec:** `docs/superpowers/specs/2026-09-23-ask-the-line-design.md`, sections 8 (the model, the gate), 9 (`ASK_MODEL`), 10.2 (cost per answered turn), 11 (PR 4), 12 (R2, R4, R5); decisions D11 and D16.

**Worktree:** `cm-gate`, on branch `design/ask-the-line-4`, off `origin/main` at `cb34c3ae` (#935, after #936 merged the answer).

**What the code already holds (plans 1–3):** the edge allows `claude-opus-5-5` (`ask-gateway.ts` `GATEWAY_MODELS`); thinking blocks are read as their own kind and replayed unmodified (`sse.ts`, `round.ts`, `replayBlocks`); every round asks `auto`, the last `none`, which Opus 5.5 accepts; `output_config` carries `effort: "low"` and the answer's format; `ASK_MAX_TOKENS` (2000) is one number on both sides. The model is one line: `ASK_MODEL` in `packages/contracts/src/ask.ts`, sent by the loop and defaulted by the edge.

---

## Files

| File | Change |
|---|---|
| `tooling/scripts/eval-ask.mjs` | The three measurements the gate names and the harness lacked: the run's cost from Ask's own usage rows (`usage.ask_tokens`, one per round, priced per spec 8.1), the rounds that stopped at the cap, and the model that answered; the day's budget before the run; the whole final message kept in the backup, so the review can draw the answer; a note when a figure repeats the breakdown's total |
| `tooling/scripts/eval-ask-pairs.mjs` | New: two backups become the twelve pairs of the blind review, the models hidden, the sides decided by a hash and kept in a key file the page never sees |
| `packages/contracts/src/ask.ts` | `ASK_MODEL`, only if Opus 5.5 wins; its note records the runs either way |
| `tooling/scripts/tests/ask.test.mjs`, `ask-routes.test.mjs` | The two pins on the model's name follow `ASK_MODEL`, only if it changes |
| `packages/contracts/dist/*`, `apps/edge/lib/packages/contracts.ts` readers | Rebuilt with the constant, only if it changes |

No new mechanism: the model is one constant, and the gate is the existing harness read more fully.

## The gate, as run

- Every run is a production build of this branch served on `localhost:3290` with `VERCEL_ENV=development EDGE_PROVIDERS=live`, against the production edge, as `e2e-owner@example.com` on the seeded e2e workspace. The env comes from `vercel env pull` into `apps/dashboard/.env.production.local` (gitignored, never printed).
- The two builds differ in one line, `ASK_MODEL`. Sonnet 5 runs first (the merged code as it is), then Opus 5.5, three runs each, back to back on the same day; one warm-up case precedes each set and pays any grammar compile outside the measured runs.
- A run spends the shared production key (the receptionist's): 28 turns each, 168 in all, at roughly $0.04 (Sonnet 5) and $0.08 (Opus 5.5) per turn. A `credit balance` refusal stops the run, and topping up is Ruben's.
- The blind review is a page Ruben reads: the twelve questions, each with its two answers side by side as the Line draws them, the models hidden and the sides shuffled. He picks the better answer per question on five points: it leads with the finding; Show earns its place; nothing is repeated; the next step is obvious; it is complete enough. The picks are read back after he is done, and the key file says which side was which.

## Tasks

### Task 1: The harness measures what the gate asks

- [x] `eval-ask.mjs`: the budget before the run; cost per answered turn, cap hits and the model from the usage rows (`memberships` for the workspace, `events` for the rows, both through the service role the harness already holds); the final message in the backup; the repeat note. `prettier`, `node --check`, and the three pins in `ask.test.mjs` still hold.
- [x] `eval-ask-pairs.mjs`: the twelve, `oneDoor` applied, the cards' words only, a hash for the sides, a key file.

### Task 2: Sonnet 5, three runs

- [ ] Build (`corepack pnpm --filter "./packages/*" build && corepack pnpm --filter @chanlytics/dashboard build`), serve, warm up on one case, run three times. Record the pass set, first words, final, one-round, cost per turn, cap hits.

### Task 3: Opus 5.5, three runs

- [ ] `ASK_MODEL = "claude-opus-5-5"`, rebuild the same way, warm up, run three times. Record the same. A round at the cap raises `ASK_MAX_TOKENS` on that evidence and repeats the run (spec 8.3).

### Task 4: The blind review

- [ ] `eval-ask-pairs.mjs` over the first run of each model; the review page published for Ruben with the twelve pairs; his picks read back; the key opened only then.

### Task 5: The call, the constant, the PR

- [ ] The numbers and the picks in this plan's Results. If every condition holds, `ASK_MODEL` becomes `claude-opus-5-5` with the two pins and the dist, and the note in `ask.ts` records the runs; otherwise the note records them and Sonnet 5 stays.
- [ ] Gates (test, typecheck, lint, format:check, check:dist), PR, CI, merge on green. If the model changed: production checked on the salon with the three questions plan 3 used.

## Results

Both sets ran on 23 Sep (UTC evening), the same build but for `ASK_MODEL`, the same judge (the harness as committed here), the e2e workspace with Ask's budget at 538k of 1.5M before the first run.

**Sonnet 5, three runs (`ASK_MODEL = "claude-sonnet-5"`, main at `cb34c3ae`):**

| run | passed | one-round | first words median / p90 | final median / p90 | per answered turn | the run | at the cap |
|---|---|---|---|---|---|---|---|
| 1 | 27/28 | 13/28 | 3315 / 4386 ms | 5383 / 6887 ms | $0.010 | $0.269 (43 rounds) | 0 |
| 2 | 27/28 | 15/28 | 3176 / 4789 ms | 4960 / 6907 ms | $0.009 | $0.262 (42 rounds) | 0 |
| 3 | 27/28 | 14/28 | 3058 / 5479 ms | 4696 / 7971 ms | $0.010 | $0.269 (43 rounds) | 0 |

- The one miss every run is `hours`: the e2e workspace has no hours set, so no answer can name them. The pass set is the other 27, identical across the three runs.
- Run 2 was judged 26/28 as it ran: `spanish_thread` quoted the receptionist's message in single quotes ("'Yes! Pick a time here: …'") and the headline check counted the quote's own sentences. The check now strips a single-quoted message too (a space or a colon before the quote, never an apostrophe); re-read under that rule, run 2 is 27/28 with no other change, and the Opus runs are judged by the same rule.
- A run costs about $0.27 at list price, 96% of it cache reads (about 590k cached tokens against 32k uncached input and 8.6k output): the rules, the examples and the snapshot ride cached into every round.
- One usage row more than the turns reported in runs 2 and 3: the previous run's last row, written by the edge as its stream settled, landing inside the next run's window (the harness now opens its window one second before the run, not five, and waits five seconds at the end).

**Opus 5.5, three runs (`ASK_MODEL = "claude-opus-5-5"`, the same build otherwise, effort low as on Sonnet):**

| run | passed | one-round | first words median / p90 | final median / p90 | per answered turn | the run | at the cap |
|---|---|---|---|---|---|---|---|
| 1 | 24/28 | 25/28 | 2322 / 7366 ms | 4771 / 7591 ms | $0.013 | $0.351 (32 rounds) | 0 |
| 2 | 23/28 | 26/28 | 2230 / 5789 ms | 4476 / 7041 ms | $0.012 | $0.328 (31 rounds) | 0 |
| 3 | 22/28 | 26/28 | 2291 / 5717 ms | 4345 / 8546 ms | $0.011 | $0.319 (31 rounds) | 0 |

What failed, beyond `hours`:

- **`show_profile`, every run.** The answer said "Opening the profile of Casey Example" and opened nothing: it answered in one round from `list_calls`, without reading the person, so the profile it named was not a row read this turn and `normalizeAnswer` dropped its route (spec 5.6). Sonnet 5 read `get_person` first every time and opened it.
- **`propose_closure`, every run.** Twice (runs 1 and 2) the answer said "I proposed closing the studio … It's a card for you to approve" with no tool called and no card made: a proposal claimed that does not exist, the one thing the rules forbid outright. The third time the card was made, and the headline opened with "Here's a proposal" and ran to two sentences.
- **A two-sentence headline in six of 84 answers** (`rules` twice, `missed_calls`, `whats_running`, `show_profile`, `propose_closure` once each): the detail written into the headline instead of `say.detail`.
- **`no_invention_person`, twice:** "nothing he said", "if he wrote" about a person who does not exist (the case forbids "he said" and "he wrote"; Sonnet 5 wrote "them").

What Opus 5.5 did better: its first words came about a second sooner (2.2–2.3 s median against 3.1–3.3 s), its final a little sooner (4.3–4.8 s against 4.7–5.4 s), and it answered in one round far more often (25–26 of 28 against 13–15), because it trusted the snapshot; it repeated no breakdown total in a figure. A run cost $0.32–0.35 against $0.26–0.27, $0.011–0.013 per answered turn against $0.009–0.010: fewer rounds offset most of the doubled token price, and cache reads cost the same on both.

**The call.** The gate's first condition (every case Sonnet 5 passes) fails on two cases in all three runs, one of them a claimed act; the review's preference cannot change that. **Sonnet 5 stays**, `ASK_MODEL` is unchanged, and its note in `ask.ts` records the runs. A later plan could try Opus 5.5 at medium effort with a rule that a proposal exists only when its tool was called this round; that is a new plan, not this one.

**The blind review** (from run 1 of each model, `eval-ask-pairs.mjs`, key kept beside the pairs in `tooling/backups/`): published at https://claude.ai/artifact/7dh3cXbqLv5jkfEs3rLPLy for Ruben's own read, and for whether that later plan is worth its time. It does not move the call above. His picks are read back from the page's store, then opened against the key.
