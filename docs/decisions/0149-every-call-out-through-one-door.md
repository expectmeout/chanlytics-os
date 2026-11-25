# 0149 · Every call out goes through one door, and says its time under its name

**Status:** Decided and built on one branch (`wiring/outside-calls-one-door`, lane 1 of the code refinement plan of 25
November 2026: layer 12, integrations and observability). Ruben asked that day for one standard for the wiring and that
each choice take the cleanest standard option; this is that choice, taken in the lane. Written against main at
`421be6183a`. No migration.

## Context

At `421be6183a` a call that left a process went one of several ways. A provider's went through channels'
`fetchFromProvider` (`packages/channels/src/shared/provider-fetch.ts`): bounded, never thrown, retried by outcome, a
breaker per provider, but its time said nowhere. The dashboard's JSON calls to the edge went through `callEdge`, its
three streamed ones (Ask's speech, Reach out's pressed check, the model gateway) each wrote their own `fetch` beside it,
and the gateway's had no bound. Ask's presses called the dashboard's own routes with a `fetch` each (`ask/act/run.ts`,
`ask/act/stop.ts`, the second unbounded). The files bucket was read by a signed link in two apps with a `fetch` each, the
edge's unsubscribe probe and its one call to the dashboard each had their own, and four pages wrote a `fetch` of their
own for routes the typed client does not hold. Nineteen calls in seventeen files, by syntax tree; the ratchet
`fetches-outside-a-client` held the eight in the server trees.

A read that stopped at PostgREST's 1,000-row cap was a `db_answer_at_cap` warning (decision 0111, rule 7), and no line is
shipped or alerted on (`docs/runbook.md`, "Where the logs go").

## Decision

1. **One way out: `fetchFromProvider`.** Every call from a server process to another service goes through it, named by
   what it calls: a provider, `edge` (the dashboard's calls to the edge), `dashboard` (the edge's, the probe's and Ask's
   calls to the dashboard) and `storage` (the files bucket by a signed link). Each carries its bound (`timeoutMs`,
   required), its retry policy (`tries`, `idempotent`, `deadlineMs`) and its breaker (`hold`, or `count` for a call that
   must always be made). Our own two apps and the bucket are `count`: named for their time and faults, never held.
2. **Its time under its name.** Each call notes how long its caller waited as `out.<name>` in the request's timings
   (packages/log `noteTiming`), beside `db` and `read.<reader>`: the dashboard's answer says it in Server-Timing and its
   `route_answered` line. A call that took half its bound or more says so (`outside_call_slow`). A per-call line for every
   call was weighed and not taken: a sweep makes hundreds, and the slow ones are what an incident reads.
3. **The dashboard's edge client is two calls:** `callEdge` (JSON) and `streamEdge` (a 2xx body handed back unread), both
   over the one way out.
4. **A page's call to its own server** goes through the API client by route key, or, for a route outside the typed set
   (sign-up, a lead's preview, the version), `askOwnRoute` (`apps/dashboard/src/client/own-route.ts`).
5. **Named exceptions, held outright** (`FETCH_EXCEPTIONS`, `tests/repo/rules/_rules.mjs`): `packages/channels` (the
   providers' wire; two byte downloads from a provider's CDN stay off its breaker), `apps/relay` (a Cloudflare Worker that
   bundles nothing of ours), `apps/mobile` (paused, shares no client with the site) and the Google button's read of
   Supabase's auth settings (a page's call to the identity store stays in the browser). `fetches-outside-a-client` is
   retired: `rules.test.mjs` fails any other global `fetch` in `apps` or `packages`.
6. **One logger.** `console` is the transport in two places only (`CONSOLE_SINKS`: the logger's own, and db's stand-in
   before an app hands it the logger); the new `console-calls` measure counts every other call, the browser's and the
   phone app's, so they only fall.
7. **The cap is an alarm.** db's observer port gains `atCap(table)`, told once per table per instance per ten minutes.
   Each app notes the read in the pager's memory (`operator_pages`, `db_answer_at_cap:<table>`), so Health shows it under
   what paged us, and the edge's health sweep pages each one noted and untold, once per the pager's window
   (`apps/edge/lib/ops/cap-watch.ts`). The edge does not page from its logger: the pager logs through it.

## Steps

One pull request, either deploy order: nothing either app sends the other changes shape.

## Tests

`tests/ops/provider-fetch.test.mjs` (the time under its name, the slow line), `tests/edge/dashboard-edge.test.mjs`
(`callEdge`, `streamEdge`), `tests/repo/rules/rules.test.mjs` (the rule and its exceptions, `console-calls`),
`tests/database/client/row-cap.test.mjs` (the alarm told once per window), `tests/ops/cap-watch.test.mjs` (the sweep's
page), `tests/shell/own-route.test.mjs` (a page's own-route call), and each moved caller's own tests.

## Risks

- A timeout's `detail` in `callEdge`'s refusal reads `timeout`, `fetchFromProvider`'s word, where it read the platform's
  "The operation was aborted due to timeout"; an unreachable edge's carries the network's cause beside its message. Each
  caller words the code itself.
- A failed note of the cap is said and gone past; the line is written first.
