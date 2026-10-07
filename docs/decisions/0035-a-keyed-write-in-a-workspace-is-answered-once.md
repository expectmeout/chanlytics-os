# 0035 · A keyed write in a workspace is answered once

**Status:** Decided on 6 October 2026 (Ruben, as recommended: keys are kept a day, and the purge takes every row, a
card's and a reply's too); step 1 built with the note (`route()`, 00340) and step 2 begun at broadcasts, the spend
routes and a note; step 3 built on 7 October 2026 (`routes/route-definition.test.mjs`: a row's write keyed where the row
lives, a platform's with nothing to key on, beside the workspace's and the account's). Proposed the same day as new scope: 0031 holds one dedupe key below the commit line (invariant 3,
`jobs.dedupe_key`, 0033), and nothing there answers a request sent twice the same way, which is this note's. Written
against commit `163f367` (main, 6 October 2026) with Phase 1's pull request (#1447) on it, and built on `266fff9a`.
Where this note and the code disagree, the code wins.

## Context

A write that reaches the server, commits, and loses its answer on the way back is pressed again, and runs again. The
dashboard's client gives every write a timeout (`apps/dashboard/src/client/api.ts`, `WRITE_TIMEOUT_MS`), so a slow
commit is exactly the case a person retries. Two writes were guarded, each its own way:

- **A reply** carries its draft's key (`apps/dashboard/src/surfaces/inbox/verbs.ts`); the route hands it to core, which
  keeps it per member (`packages/core/src/conversations/reply.ts`, `${userId}:${key}`).
- **An Ask card** carries its proposal's id; `route()` kept the card's answer under `card:<id>` and gave a second press
  the first answer, but only for a request that said it was Ask's (`x-via: ask`).

Every other write ran as often as it arrived: a note kept twice, a broadcast scheduled twice. A person is not added
twice, since `POST /api/v1/contacts` is get-or-create by number (`create_person`, 00053). The table both guards use,
`idempotency_keys` (unique on the workspace and the key), kept a key and its answer for ever: no clock purged it.

Not every write has a workspace to keep a key in. Of the 151 writes the routes declared on 6 October 2026
(`tooling/scripts/tests/route-policy.json`), 27 have none, and `docs/api.md` says so beside each:

- **Account-scoped, 17:** `POST ask/messages/[id]/proposals/[pid]`, `DELETE ask/threads/[id]`, `POST client-errors`,
  `POST handovers/[id]/accept`, `POST handovers/[id]/decline`, `PUT me/devices`, `DELETE me/devices`, `PUT me`,
  `DELETE me`, `POST partner/invitations/[id]/accept`, `POST partner/invitations/[id]/decline`, `POST partner`,
  `PATCH partner`, `POST partner/workspaces/[id]/resend`, `POST partner/workspaces`, `POST vitals`,
  `POST workspaces/create`.
- **Platform-scoped, 10:** `POST platform/jobs/requeue`, `POST platform/lines/refile`, `POST platform/lines/release`,
  `POST platform/lines/replace`, `POST platform/lines/retry`, `POST platform/partners/payout`,
  `POST platform/partners/second-factor`, `POST platform/partners/standing`, `POST platform/partners/status`,
  `POST platform/waitlist/invited`.

## Decision

`route()` answers any write in a workspace that carries an `Idempotency-Key` once, the way it answered a card, with the
request held to its key (`apps/dashboard/src/server/route.ts`, `onceForKey`):

1. **The claim.** The key is claimed under the prefix `req:` with the request's hash (its method, its path and its
   body, SHA-256), so a card's `card:` and a reply's member-scoped key stay apart. A card keeps its prefix and no hash:
   a card approved from two tabs is one write whatever each tab sent.
2. **A second request with the same key and the same hash** is given the kept answer and changes nothing. One with a
   different hash is refused, 422, in words: the key was used for another request. One that arrives while the first
   still runs is 409, as a card's is, and an abandoned claim is taken over after two minutes.
3. **A write that fails** lets the key go, so pressing again tries again.
4. **A route that keeps its own key** says so in its policy (`idempotent: "own"`, the reply), and `route()` leaves the
   header to it. `route-policy.json` pins the field; `docs/api.md` documents the header and names the writes that take
   none. A write with no workspace runs as it always has.
5. **Keys are kept a day**, then purged by a nightly clock of the keep kind, every row whatever its prefix, a card's
   and a reply's too (`purge_idempotency_keys`, 00340; contracts `RETENTION_DAYS.idempotency_keys`, which the privacy
   page states).

The client keeps one key per intent, not per call (`once` in `apps/dashboard/src/client/api.ts`): a key is made at the
first send of a request (its route, address and body) and kept until that request lands, so a press after a timeout is
the same request; once it lands, or when the body changes, the next send is a new intent. A call without `once` sends
no key and runs as it always has.

## Steps

1. **The server half:** the claim with the hash, the 422, the policy field and its pin, the purge and its clock. Built
   (00340). Either deploy order: a client that sends no key is answered as before.
2. **The client half:** begun where Ruben put it first, at broadcasts and the spend routes, with a note:
   `POST broadcasts`, `POST lead-searches/[id]/more`, `POST lead-searches/import`, `POST leads/check-again`,
   `POST lines/buy`, `POST lines/register`, `POST reach-outs/preview` and `POST contacts/[id]/notes` send `once`; a new
   lead search is an Ask card and keyed as one. Then the workspace's other writes, then the phone app's.
3. **A conformance test per route kind:** the same key twice is one write and one answer; another body under the same key
   is 422. Built: `route()` is the one pipeline every kind runs through, so the proof is per scope it resolves (a
   workspace's write, a row's write keyed in the row's workspace, an account's and a platform's with no workspace to key
   on, a card's and the reply's own), in `routes/route-definition.test.mjs` and `ai/card-once.test.mjs`.

## Tests

- `route()` over a database in memory (`routes/route-definition.test.mjs`, `ai/card-once.test.mjs`): a keyed write twice
  is one handler run and the same answer; the same key with another body or path is 422 and runs nothing; a failed
  write lets the key go; a route that keeps its own key, an account's write and a request with no key are untouched; a
  write with no schema is keyed by a copy of its body, which its handler still reads.
- The purge on a real Postgres keeps a day of every prefix and drops the rest (`ops/retention.db.test.mjs`).
- The client's key per intent (`routes/typed-client.test.mjs`).

## Consequences

- A keyed write costs one claim and one receipt on `idempotency_keys`: two small writes.
- The answer is kept a day in the workspace's own row, under RLS as before; an answer that names a person goes with the
  day's purge, and 0036's registry says so (by age).

## Open questions

- Answered: a day is the keep, and the purge takes every row (Ruben, 6 October 2026). The longest retry a person makes
  is minutes; a day covers a phone that was offline.
