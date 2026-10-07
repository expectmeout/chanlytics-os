# Ask Rewired, Phase 6: the gateway and the budget — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the bill and the cache can be read, and a silent change that breaks the cache is noticed the day it lands.
Ask's day budget becomes one SQL sum instead of a page-by-page read of every usage row; every model round says why its
cache missed, when it did; the hop through the edge is measured; and a nightly check opens an issue when the day's
median cache hit or first words cross a line.

**Architecture:** a migration adds `ask_tokens_day(tenant)`, which the edge's gateway calls instead of reading the
day's `usage.ask_tokens` rows. The gateway's allowlist passes `diagnostics.previous_message_id`; the dashboard sends it
on every round (the previous round's message id, or the previous turn's last one when the thread is live) and records
each round's message id and cache miss reason on the turn's shape. The edge answers with a `server-timing` header that
splits its own time from the model's, so the dashboard can say what the hop cost. `ask-day.mjs` gains a `--check` that
exits non-zero with a sentence when the day crosses a line, and the nightly workflow runs it and opens an issue.

**Spec:** `docs/superpowers/specs/2026-09-25-ask-rewired-design.md` §5.8, §9 (Phase 6). Sources: the cache diagnostics
page, re-read 28 Sep 2026 (https://platform.claude.com/docs/en/build-with-claude/cache-diagnostics). Written against
`origin/main` at `7197be0aa` (28 Sep 2026) after a code map read at that commit.

---

## Where this fits, and what the code map found

1. **The budget reads every row.** `askTokensLast24h` (`apps/edge/lib/ask-gateway.ts`) pages through the day's
   `usage.ask_tokens` events and sums `input_tokens + output_tokens` in JavaScript, once a minute per instance per
   workspace. The index the sum needs exists (`events_tenant_kind_created`, 00002). A failed read counts as zero.
2. **The message id is already parsed.** `sse.ts` reads `message.id` off `message_start` into `GatewayUsage.messageId`
   and `round.ts` keeps it, for this phase. Nothing sends it anywhere, and nothing reads `message.diagnostics`.
3. **The gateway drops unknown fields.** `validateGatewayRequest` rebuilds the request from an allowlist, so
   `diagnostics` never reaches the API today.
4. **Cache diagnostics is generally available** on the Claude API: no beta header; the response's
   `message.diagnostics` arrives on `message_start` in a stream; `null` means no divergence or nothing to compare, and
   `{cache_miss_reason: {type, cache_missed_input_tokens?}}` names `model_changed`, `system_changed`, `tools_changed`,
   `messages_changed`, `previous_message_not_found` or `unavailable`. Fingerprints are hashes only, short-lived, and
   scoped to the workspace.
5. **The shape already holds the hit ratio and the latencies** (`cache_hit`, `first_text_ms`, `first_say_ms`, PR 0.1),
   stored on the answer row; `ask-day.mjs` summarises a window of them.
6. **The nightly** (`.github/workflows/nightly-e2e.yml`, 09:00 UTC) already holds the production service key and opens
   an issue when it goes red.
7. **Production's numbers** (28 Sep, the last three days, Opus 5.5): 11 to 18 answered turns a day; the median cache hit
   73 to 82%, the lower quartile 0 to 50%; the median first text 2.8 to 4.3 s.

## Decisions this plan takes (Ruben may overrule any; each names its PR)

| #  | Decision | Why | PR |
| -- | -------- | --- | -- |
| D1 | **`ask_tokens_day(p_tenant uuid) returns bigint`**: the sum of `input_tokens + output_tokens` over the workspace's `usage.ask_tokens` events of the last 24 hours, exactly what the gateway counts today; `security invoker`, `stable`, execute for `service_role` only. A failed call still counts as zero (the budget never refuses on a read that failed). | The same number, one statement, no row cap. | 6.1 |
| D2 | **Diagnostics on every round, in production.** Round 1 of a turn sends the previous turn's last message id when the thread is live (5.4's replay), else `null`; each later round sends the round before it. The shape records each round's message id and its miss reason. | The page says GA, hashes only, no cost; a nightly can only name a cause that production recorded. The spec said development only; this widens it. | 6.2 |
| D3 | **The hop is split, not timed across clocks.** The edge answers with `server-timing: gateway;dur=<its own ms before the model call>, model;dur=<the model's time to headers>`; the dashboard records `hop_ms` = its own time to headers minus both. | No clock skew between the two deployments; one header, no new event. | 6.2 |
| D4 | **The nightly's lines are alarms, not targets:** at least 10 answered turns in the last 24 hours, else the check says so and passes; a median cache hit under 50%, or a median first text over 6,000 ms, fails the step and opens an issue naming the numbers and the top miss reason. | The targets (80%, 2.0 s) are not met yet; a line at the target would open an issue every day. | 6.3 |
| D5 | **The migration is pushed before its merge**, dry run first, the number re-checked. Additive; Ruben's "continue with phase 6 and merge on green" (28 Sep) is the yes. | The house rule; the gateway calls the function once 6.1 deploys. | 6.1 |
| D6 | **Merge on green**; the closing docs ride with PR 6.3. | As Phases 3 to 5. | all |

## How every PR is proven

The six checks, as in Phases 4 and 5: typecheck, lint, Prettier, dists in sync, the full suite, and the database
replay; plus each PR's own below.

---

# PR 6.1 · The budget is one SQL sum

- [ ] `supabase/migrations/<n>_ask_counts_its_day_in_one_sum.sql`: `ask_tokens_day` as D1; re-runnable; grants as D1.
- [ ] `askTokensLast24h` calls it (`db.rpc("ask_tokens_day", { p_tenant })`); a failed call logs
      `ask_budget_read_failed` and counts zero, as now. The minute's cache per instance stays.
- [ ] Proof: a db test seeds usage events around the day's edge and another workspace's, and reads the sum; the door's
      test drives the gateway with the sum at the cap less one (runs) and at the cap (429 `ask_budget`).

# PR 6.2 · Every round says why its cache missed, and what the hop cost

- [ ] The gateway's allowlist passes `diagnostics: {previous_message_id: string | null}` (an id of the API's own
      shape, or null; anything else is dropped, never refused).
- [ ] `sse.ts` reads `message.diagnostics` off `message_start` (`cacheMiss: {type, tokens} | null`); `round.ts` keeps it.
- [ ] The loop sends D2's previous id on every round; the previous turn's last id is read with the chain (the shape
      holds it).
- [ ] The shape gains `message_ids`, `cache_miss` (per round: the type, or null) and `hop_ms` (D3); `v` stays 1, all
      additive; `ask-day.mjs` prints the day's miss reasons and the hop's median.
- [ ] The edge sets D3's `server-timing` header; the log line `ask_gateway_turn` gains the same two numbers.
- [ ] Proof: the gateway's tests (the field passes, a bad one is dropped, the header's numbers); the parser's test
      reads a `message_start` with and without diagnostics; a two-turn loop test sends null, then round 1's id, then the
      previous turn's last id on a live follow-up; the shape records them.

# PR 6.3 · The nightly check, and Phase 6 closed

- [ ] `ask-day.mjs --check`: D4's lines over the last 24 hours; the verdict and the numbers on one line; exit 1 on a
      crossed line. The pure verdict lives in a module a test can run (`tooling/scripts/ask-stats.mjs`).
- [ ] `nightly-e2e.yml`: a step runs it with the production key, and a step after it opens an issue with its line when
      it failed ("Ask's cache or first words crossed a line <date>").
- [ ] Proof: the verdict's test (a forced miss, a slow day, too few turns, a good day); the workflow's step is read by a
      test that pins the command and the issue step.
- [ ] Docs: the spec's "Phase 6, landed"; `docs/system-prd.md` S-18 (the budget's sum, the diagnostics, the hop, the
      nightly check).
