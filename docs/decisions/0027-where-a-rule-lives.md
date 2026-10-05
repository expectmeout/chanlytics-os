# 0027 · Where a rule lives

**Status:** Decided on 4 October 2026 (Ruben, approving the file-tree review's list as recommended). Step 1 built:
the outbound gate moved into `packages/core/src/messages/` (4 October 2026). Written against `d481afeed` (main, 4
October 2026) and verified against the code at it; where this note and the code disagree, the code wins. The
scorecard of 29 September asked for "SQL door vs core verb", and the file-tree review of 4 October found rules in
three places.

## Context

- **What the repository says.** `CLAUDE.md`, "Where new code goes": "A rule the product enforces: `packages/core`, or a
  SQL door when it needs the service role." Its rules say the same in other words: "Verbs over ports", "One predicate
  per rule". What an edge door calls lives in `apps/edge/lib/<domain>/`; what a dashboard route calls in
  `apps/dashboard/src/server/<domain>/`.
- **What the code does.** Rules the product enforces also live in those two app trees, beside the wiring. The review
  of 4 October read, among others: `apps/edge/lib/receptionist/outbound-gate.ts` (a pure, ordered gate: may an
  automated message go, by consent, pause, a person on the thread, a held booking, the reply mode, the daily cap);
  `apps/edge/lib/reach-out/sender.ts` (the claim order of a reach-out send, and when one is held or skipped);
  `apps/edge/lib/receptionist/steer.ts` (a new draft is queued before the old one retires; a rewrite that quotes a
  price is refused); `apps/dashboard/src/server/campaigns/policy-write.ts` (which dials a reply class may carry, and
  each dial's range); `apps/dashboard/src/server/people/erase-contact.ts` (the order of an erasure's legs);
  `apps/dashboard/src/server/campaigns/playbooks.ts` (a playbook refused on an archived list). Core holds 87 files;
  the dashboard's server 199; the edge's lib about 140.
- **Why it matters.** A rule in an app tree can be asked by that app alone: the outbound gate is the voice path's,
  and the WhatsApp path enforces the same rules as statement order in its own handler. A second sender that needs the
  rule copies it or reaches across trees, which `CLAUDE.md`'s layer rules forbid for the dashboard and the edge
  alike. And the "thin doors" work (#1370) moved the doors' bodies into these app trees as pure moves, so some of
  what it moved is rule and some is wiring, by design of that lane.

## Decision

1. **A rule the product enforces is core's**: a decision about whether, or what, happens, true whichever app or
   provider asks. It is a pure function or a verb over ports in `packages/core/src/<domain>/`, named in the domain's
   barrel, with no database client, framework, provider or environment inside it.
2. **A rule that needs the service role or one transaction is a SQL door** (a `security definer` function with its
   own member or owner check), called through `packages/db`.
3. **An app's server code wires**: it authenticates, reads the request, gathers what the rule needs, calls the rule
   and maps its outcome to its own words and status. It may keep what only its transport means (a webhook's
   signature, a page's paging), never a decision another sender would have to make again.
4. **A provider's protocol is `packages/channels`'**, and a word a person reads is `packages/contracts`'.

## Steps

Each is a pure move, its own pull request or part of one, with its tests repointed and no behaviour changed: the
export list equal, every line that moved reappearing verbatim in the module that took it.

1. **The outbound gate** (`outboundGate`, `refusalScript`, `OutboundRefusal`) moves to
   `packages/core/src/messages/outbound-gate.ts`, exported from core's messages barrel; the voice path
   (`apps/edge/lib/voice/call-booking-link.ts`) takes it through the edge's package facade. Built, 4 October 2026: a
   rename with five lines added (the import, now `@chanlytics/contracts`, and why it is core's) and one removed;
   seven tests repointed.
2. **The candidates above, one at a time**, each read first: what of it is rule (moves) and what is wiring (stays).
   `steer.ts`, `sender.ts`'s hold rules, `policy-write.ts`'s dials, `playbooks.ts`'s refusals, `erase-contact.ts`'s
   order. A module that is all wiring stays where it is and says so in its header.
3. **The WhatsApp handler asks the gate** instead of enforcing the same rules as statement order, once step 2 has
   moved what the gate needs. Its own note if it changes an order a customer sees.

## Tests

- `tooling/scripts/tests/messages/outbound-gate.test.mjs` and the six other suites that run the gate import it from
  its new path, unchanged otherwise.
- Core's coverage floor (`tooling/scripts/checks/coverage.mjs`) counts the gate once it is core's.

## Risks

- **A move that is not pure.** Each step is proved as #1370's doors were: export lists equal before and after, every
  line that left reappearing verbatim. A step that has to change a line to move is two pull requests: the change,
  then the move.
- **A rule core cannot hold.** One that needs the database's own guarantees (a claim, a count under a lock) is a SQL
  door by point 2, not a core verb that reads and then writes.
