# 0035 · Every write is answered once per key

**Status:** Proposed on 6 October 2026, not built: the second half of Phase 1's "one dedupe key, one idempotency key"
(0031, invariant 3), whose first half, the ledger's `jobs.dedupe_key`, is 0033's and is built. Written against the
branch `claude/chanlytics-os-architecture-analysis-ejqx0e` at `74112b2`. Where this note and the code disagree, the code
wins.

## Context

A write that reaches the server, commits, and loses its answer on the way back is pressed again, and runs again. The
dashboard's client gives every write a timeout (`apps/dashboard/src/client/api.ts`, `WRITE_TIMEOUT_MS`), so a slow
commit is exactly the case a person retries. Two writes are guarded today, each its own way:

- **A reply** carries its draft's key (`apps/dashboard/src/surfaces/inbox/verbs.ts`); the route hands it to core, which
  keeps it per member (`packages/core/src/conversations/reply.ts`, `${userId}:${key}`).
- **An Ask card** carries its proposal's id; `route()` keeps the card's answer under `card:<id>` and gives a second press
  the first answer (`apps/dashboard/src/server/route.ts`, `onceForCard`), but only for a request that says it is Ask's
  (`x-via: ask`).

Every other write runs as often as it arrives: a person added twice, a note kept twice, a broadcast scheduled twice. The
table both guards use, `idempotency_keys` (unique on the workspace and the key), keeps a key and its answer for ever:
no clock purges it.

## Decision

`route()` answers any write that carries an `Idempotency-Key` once, the way it answers a card today, with the request
held to its key:

1. **The claim.** The key is claimed under the prefix `req:` with the request's hash (its method, its path and its
   body, SHA-256), so a card's `card:` and a reply's member-scoped key stay apart.
2. **A second request with the same key and the same hash** is given the kept answer and changes nothing. One with a
   different hash is refused, 422, in words: the key was used for another request. One that arrives while the first
   still runs is 409, as a card's is, and an abandoned claim is taken over after the card's two minutes.
3. **A write that fails** lets the key go, so pressing again tries again.
4. **A route that keeps its own key** says so in its policy (`idempotent: "own"`, the reply), and `route()` leaves the
   header to it. `route-policy.json` pins the field; `docs/api.md` documents the header.
5. **Keys are kept a day**, then purged by a nightly clock of the keep kind (`tooling/scripts/tests/clocks/_clocks.mjs`).

The client attaches a key per intent, not per call: a form keeps one from the moment it opens to its success, a sheet
from open to done, so the second press of one intent is the same request. A call with no key runs as it always has.

## Steps

1. **The server half:** the claim with the hash, the 422, the policy field and its pin, the purge and its clock. Either
   deploy order: no client sends a key yet beyond today's two, and those keep their meaning.
2. **The client half:** the dashboard's forms and sheets attach their intent's key, then the phone app's.
3. **A conformance test per route kind:** the same key twice is one write and one answer; another body under the same key
   is 422.

## Tests

- `route()` over a database in memory: a keyed write twice is one handler run and the same answer; the same key with
  another body is 422 and runs nothing; a failed write lets the key go; a route that keeps its own key is untouched.
- The purge on a real Postgres keeps a day and drops the rest.

## Consequences

- A keyed write costs one claim and one receipt on `idempotency_keys`: two small writes.
- The answer is kept a day in the workspace's own row, under RLS as today; an answer that names a person is erased with
  them only by the day's purge, which an erasure may want sooner (0036).

## Open questions

- Is a day the right keep? The longest retry a person makes is minutes; a day covers an offline phone.
