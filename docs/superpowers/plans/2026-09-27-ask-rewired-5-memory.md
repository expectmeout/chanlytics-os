# Ask Rewired, Phase 5: memory — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a follow-up is answered with what came before it. While a thread is warm, the earlier turns are sent back
exactly as the model saw them — the person's side and the model's, thinking included — so the prompt cache and the
thinking blocks stay valid; on a cold reopen the history is rebuilt as one compact line per turn (its words, its cards
with their outcome, the rows it cited), and from there the session is append-only again. A thread reads its newest
sixty messages, keeps the scope of its latest turn, and is scrubbed of a person when that person is erased — by their
name too, in the threads that are about them.

**Architecture:** the raw turn — every message of the last request from the question on, the final round, the results
of acts that ended the turn, the last round's start and a hash of the prefix it ran on — is stored on the answer row
(`ask_messages.content.raw`, no migration) and never shipped to the browser. A new `server/ask/memory.ts` decides the
history for each turn: live (the stored raw turns, verbatim, from the last rebuild on), rebuilt (compact lines, frozen
on the turn that made them), or none. A fourth cache breakpoint moves with the last block of every request, so each
round writes only what it appended. The scrub is a replaced SQL function bounded to the person's own threads.

**Spec:** `docs/superpowers/specs/2026-09-25-ask-rewired-design.md` §5.5, §5.6, §5.7, §5.11, §7, §9 (Phase 5).
Written against `origin/main` at `9f1762833` (#1233, Phase 4 closed; 27 Sep 2026) after a code map read at that commit
(read only; its findings below). Phase 4 plan: `docs/superpowers/plans/2026-09-27-ask-rewired-4-all-data.md`.

---

## Where this fits, and what the code map found

Phases 1–4 gave Ask one read layer, the page as context, one registry, one spec per card and reach over every page.
Every turn still starts from nothing but the words of the ones before it. The map corrected the spec in twelve places;
the ones that shape this plan:

1. **"Verbatim" includes the person's side, and none of it is stored.** The cache and a thinking block's signature are
   bound to `system`, `tools` and every earlier message (bundled claude-api docs, `shared/model-migration.md:1608,
   :1940`). An earlier turn's user message is the page's `search_result` blocks, the `read://` blocks, the turn's words
   with its clock, and the question (`server/ask/loop.ts:306-335`); the store keeps the question's words and the
   answer's metadata only (`app/api/v1/ask/route.ts:184, :245-259`). Replaying the answers over a rebuilt question side
   breaks the prefix at the first earlier user message.
2. **Two ways a turn ends leave a `tool_use` unanswered.** "Cards alone" and "an answer beside acts" return without
   pushing the final round (`loop.ts:691-741`); its `tool_use` blocks never got results. A replay must open the next
   user message with those acts' results, so the store keeps them.
3. **Warm needs more than the clock.** The same model, the same `system` bytes and the same `tools` bytes are required
   too; `stableSystem` changes with settings, notes, hours and autonomy (`prompt.ts:185-270`), so a settings or policy
   card approved between two turns makes the next one cold. A replayed thinking block after such a change is a 400 on
   accounts created on or after 31 Aug 2026 (`model-migration.md:1608, :1620`). The TTL runs from the last round's
   *start*, not from the saved row (`shared/prompt-caching.md:148`).
4. **A sliding window is a history edit.** Removing the oldest turn from a verbatim replay invalidates every later
   thinking block (`model-migration.md:1612`); the bound can only be met by a cold rebuild. Today's `MAX_HISTORY = 12`
   counts messages, six turns (`loop.ts:76`). The edge refuses more than 60 messages or 700,000 characters
   (`apps/edge/lib/ask-gateway.ts:197, :199`), which twelve heavy turns exceed.
5. **`readThread` reads the oldest sixty** (`store.ts:38, :120-125`, pinned by `ask-shape.test.mjs:330-387`); a thread
   past thirty turns reopens on its first thirty.
6. **The scope is pinned at both ends:** the client sends the thread's first scope (`legacy/pages/ask-real.jsx:548`),
   the route falls back to it (`route.ts:173`), `touchThread` never writes it (`store.ts:168-174`) though the grant
   allows it (`00040:82`), and the page's `focus` is parsed and read by nothing on the server.
7. **"Approve that one" and "open the second" have nothing to resolve against.** Earlier turns reach the model as words
   cut to 1,200 characters; an earlier turn's rows are outside this turn's read set (`loop.ts:230`) under a rule that
   says "this turn" (`prompt.ts:64`); the client resolves "the second" to the page's second row
   (`legacy-bridge/ask/context.ts:239-245`). And Ask never approves: it proposes (`prompt.ts:72`, §7).
8. **The scrub misses more than names**: the formatted number, a thread's or a call's citation, a differently cased
   address, and every thread's title and scope (`supabase/migrations/00040_ask.sql:109-147`; the route passes digits
   and the email, `app/api/v1/contacts/[id]/route.ts:96-103`). A name through today's function would match in every
   member's threads, case-sensitive, 7 characters or more ("Mariana" takes "Marianela"; "Rosa" is never scrubbed).
   Bounding it to the person's own threads is a replaced function — a migration. No test runs the function today.
9. **Every file Phase 5 touches sits at a ratchet.** `runAskTurn` is exactly its complexity baseline (558 lines);
   the ask route's `handle` exactly 247, the erasure route's exactly 232; `loop.ts` is 782 of 800; `store.ts` holds 9
   table names; `tooling/scripts/tests/ask/` holds 20 suites. Room is made first, as a pure move.
10. **A live replay costs more than today's words unless each round's tail is cached once.** The loop marks the page's
    last block and nothing after it (`loop.ts:310-312`); a live replay would write every earlier round's tail fresh.
    The documented healthy loop puts a moving marker on the last block of each request (`prompt-caching.md:47-51`) —
    the fourth breakpoint. The day budget counts only uncached input and output, so the dollars move, not the budget.

**Measured on production (read-only, 27 Sep):** since turns began recording their shape (26 Sep), 32 turns, 25 of them
follow-ups: 15 within 5 minutes of the last, 2 between 5 and 60 minutes, 8 after more than an hour; 375 threads; the
longest has 38 messages (19 turns). The five-minute cache is the window.

## Decisions this plan takes (Ruben may overrule any; each names its PR)

| # | Decision | Why | PR |
| --- | --- | --- | --- |
| D1 | **The window is the five-minute cache.** A turn is live only when the previous turn's last round *started* under 4½ minutes ago (the half minute is the margin for this turn's own reads before round 1). No 1-hour TTL. | Measured: 15 of 25 follow-ups within 5 minutes, 2 in 5–60 (a 1-hour write costs 2× for them). | 5.4 |
| D2 | **Warm's other conditions:** the stored model id equals this turn's; a hash of `system` + `tools` + the format flag equals this turn's; the previous turn was saved whole and did not fail. Anything else is cold. | Finding 3: a replayed block on another prefix is a 400 on newer accounts. | 5.3, 5.4 |
| D3 | **The bound:** twelve turns since the last rebuild, and at most 48 messages and 400,000 characters of replay; past any of them the turn is rebuilt cold. The words-only fallback counts twelve *turns* (not messages). | Finding 4: a sliding window is an edit; the edge's 60 messages / 700,000 characters bind first. | 5.1, 5.4 |
| D4 | **The compact line:** the question's words; the answer's headline (`say`); each card as `id · kind · title · outcome` (state and receipt); each item's source as `kind id label`, in the answer's order. Frozen on the turn that rebuilt (stored on its raw turn) and replayed verbatim while live. | One line per turn (§5.6); frozen, because an outcome recorded later would change a recomputed line. | 5.5 |
| D5 | **Earlier rows are citable:** the rows the replayed or rebuilt turns cited join this turn's read set as their RowRefs, so "open the second" needs no read; a *fact* about them is read again, and the rule at `prompt.ts:64` says so. | Finding 7: "open the second" resolves to the item (§5.6). | 5.5 |
| D6 | **"Approve that one" points, never presses.** The model names the card by its title and says it is one press above; a dismissed or failed card it may propose again. The Line never approves on words. | The charter: Ask proposes, a person approves (§7). | 5.5 |
| D7 | **Ordinals in an open thread** resolve against the answer's items before the page's rows, and the server reads `focus`. | Finding 7. | 5.5 |
| D8 | **What happened since** (a card approved, dismissed or undone after the last turn) is a sentence in the new question's words, never an edit of an earlier message. | Append-only (finding 4). | 5.4 |
| D9 | **Scope per turn:** the route stores the scope each turn ran with; an explicit `null` clears it; the client sends the chip's scope first. | Finding 6; §5.6 "updates its scope on each turn". | 5.1 |
| D10 | **The fourth breakpoint:** a marker on the last block of every request, moving each round. | Finding 10; the documented healthy loop. | 5.4 |
| D11 | **Where the raw turn lives:** `content.raw` on the answer row; the replay reads it by JSON path; the Line's reads and `GET ask/threads/[id]` never select it. No migration. | Map §1.3: `content jsonb` is insert- and owner-update-granted. | 5.3 |
| D12 | **Thinking binding:** no opt-in (the edge forwards no beta header until Phase 6); correctness comes from D2 — a turn whose prefix differs is never replayed. 5.4's proof includes a real two-turn case run (Ruben's key) showing no 400 and turn 1 read from the cache. | Map §3: enforcement on this key is unknown; the guard makes it moot. | 5.4 |
| D13 | **The scrub is bounded and replaced in SQL (a migration):** in the person's own threads — those where an id, number or email needle hits, or scoped to them — every message holding one of their names (display, WhatsApp, the names callers gave; three characters or more, whole word, any case) goes; the formatted number and the conversation and call ids become needles everywhere; those threads' titles and scopes are cleared. A single-word name outside those threads is never touched. The migration is held for Ruben: pushed (dry run first, the number re-checked) before its PR merges. | Finding 8: a name workspace-wide deletes other people's turns; under the floor it deletes nothing. | 5.6 |
| D14 | **Merge on green**, as Phases 3 and 4 (Ruben, 26 Sep: "merge right away and continue working"); his eval re-run follows each change to what the model reads. The migration alone waits (D13). | His instruction. | all |

### The spec amendments this plan makes (in the plan's PR)

- §5.6: the person's side of each turn is stored and replayed too; warm = D1 + D2; the bound = D3; "approve that one"
  points (D6); the name needle is bounded (D13) and is a migration.
- §9: Phase 5 as eight PRs, and "No migration" corrected (the scrub).

## How every PR is proven (the six checks, then each PR's own)

1. `corepack pnpm --filter "./packages/*" build` after formatting; `corepack pnpm -r typecheck`; `corepack pnpm lint`
   (0 errors); `node tooling/scripts/gen-route-types.mjs --check`; `corepack pnpm format:check`.
2. The full `corepack pnpm test`; the harness (`tests/ask/ask-turn.test.mjs`) asserts on `s.requests[i]`, and Phase 5
   adds two-turn harness tests (turn 2's request against turn 1's).
3. Dists rebuilt and committed; `node tooling/scripts/check-dist.mjs` in sync.
4. The ratchets: nothing rises without a banked reason; every fall banked (`UPDATE_BASELINES=1`; a rise with
   `UPDATE_BASELINES=raise` and its row under "Rises" in `docs/debt.md`); knip at its baseline.
5. The model's request: a PR that must not change it proves it byte-equal; a PR that changes it names every byte that
   moved.
6. `git diff origin/main --stat` limited to the PR's files; the rebase-and-rebank cycle before every push when main
   moved.

Each PR: its own worktree from that day's `origin/main`; one implementer; one combined review round; squash-merge on
green (D14).

---

# PR 5.0 · Room, as a pure move

- [ ] The route's thread block (`route.ts:159-182`: find or create the thread, the history, the time since the last
      turn, the scope) into a new `server/ask/memory.ts`; the `done` shape's assembly (`loop.ts:352-408`) out of
      `runAskTurn` into its own function beside it.
- [ ] Proof: every export value-equal to main's; the harness's `s.requests` byte-equal for the existing suites; the
      falls banked (`complexity.json`: `runAskTurn`, the route's `handle`); `loop.ts` under 780 lines.

# PR 5.1 · The newest sixty, the scope per turn, twelve turns counted as turns

- [ ] `readThread`: newest sixty (descending, `id` as the tiebreak), reversed; `since_last_ms` always known.
- [ ] The scope: the route stores the scope the turn ran with (`touchThread` carries it; an explicit `null` clears);
      the client sends the chip's scope first (`ask-real.jsx:548`, no net line: the file is at its baseline).
- [ ] `MAX_HISTORY` counts twelve turns (D3's fallback while 5.4 and 5.5 are not in).
- [ ] Proof: route tests over the fake database — seventy rows: the newest drawn and replayed; a scope changed and
      cleared between turns; the pins `ask-shape.test.mjs:330-387` and `ask-routes.test.mjs:727-733` rewritten as
      behaviour. The request moves: the scope line and up to six more turns of words (named).

# PR 5.2 · Two-turn eval cases, and their baseline

- [ ] `tooling/evals/ask-cases.json` gains a second turn per case (a `then: {text, expect}` or the runner's chosen
      shape); `eval-ask.mjs` passes the first turn's thread id, judges both turns, and `--list` counts and prices turns.
- [ ] Cases on two or more surfaces each: "approve that one" (points, never presses), "open the second" (the answer's
      item), "and last week?", a scope changed between turns, a settings card approved between turns (cold by D2).
- [ ] Proof: `--list` says the turns and the cost; Ruben's run is the baseline 5.4 and 5.5 are measured against.

# PR 5.3 · Store the raw turn (nothing replayed yet)

- [ ] `runAskTurn` returns the turn as sent: the question's user content (after any refusal's drop), each round's
      assistant blocks and results, the final round's blocks, the results of acts that ended the turn, the last
      round's start, the model id and the prefix hash (D2); the route stores it at `content.raw` (D11); `readThread`
      and `GET ask/threads/[id]` never select it.
- [ ] Proof: a harness test that the stored raw equals the scripted model's last request from the question on, plus
      the final blocks, byte for byte; sizes at the caps; the Line's payload unchanged; the request byte-equal.

# PR 5.4 · The live replay

- [ ] `memory.ts` decides live (D1–D3) and replays the stored raw turns verbatim from the last rebuild on; the
      unanswered acts' results open the new user message; what happened since is a sentence (D8); the fourth breakpoint
      (D10); anything else falls to the words (until 5.5) or the rebuild (after it).
- [ ] The shape records the history kind (`replay: "live" | "rebuilt" | "none"`; `warm` already names the context
      cache).
- [ ] Proof: a two-turn harness test that turn 2's messages begin with turn 1's last request's messages byte for byte,
      thinking and redacted thinking intact; a changed `system`, tools, model or an old clock → cold; the 13th turn,
      the 49th message and the byte budget → cold; the eval's live cases against 5.2's baseline; a real two-turn case
      (Ruben's key) with no 400 and turn 1 read from the cache (D12).

# PR 5.5 · The cold rebuild

- [ ] The compact lines (D4), frozen on the rebuilding turn and replayed verbatim while live; earlier cited rows into
      the read set (D5); the prompt's rule for earlier turns and cards (D6); ordinals against the answer's items and
      `focus` read on the server (D7).
- [ ] Proof: harness tests of a rebuild's bytes and of the next live turn appending to it; the eval's cold cases;
      `ask-page-context.test.mjs:224` rewritten as the new behaviour.

# PR 5.6 · The scrub (the migration, held)

- [ ] `supabase/migrations/<n>_a_person_is_scrubbed_from_ask_by_name.sql` (the number re-checked at push; main tops at
      `00221`): `scrub_ask_for_contact` replaced as D13 (bounded names, the formatted number, conversation and call ids,
      titles and scopes); re-runnable; grants unchanged.
- [ ] The erasure route computes the needles in a helper (`server/people/erasure.ts`), not inline (its `handle` is at
      its baseline).
- [ ] Proof: the first db test that runs the function (the local stack): an owner erases a person; a teammate's thread
      naming them, one quoting their formatted number and one citing their thread go, titles and scopes with them; the
      same first name in another customer's thread stays; the source scan at `ask.test.mjs:786-805` removed (banked).
      The push held for Ruben (D13).

# PR 5.7 · Phase 5 closed

- [ ] The spec's Phase 5 paragraph as landed; `docs/system-prd.md` (the thread and the scrub, S-18 step 6); the wiring
      map's D11, E2, E6 and E9 re-read and republished; the eval's turns and cost. No code the model reads.
