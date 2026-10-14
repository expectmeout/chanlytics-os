# 0047 · A page hears the record it draws

**Status:** Decided on 11 October 2026 (Ruben: "all approved end to end as you suggest"), not built. Lanes 2 and 3 of the
Wiring Blueprint of 11 October 2026 (`Claude Video/docs/2026-10-11-chanlytics-wiring-blueprint.md`). Amends 0019 (what a
notice carries and which tables are told) and builds the coverage test the 4 October Campaigns wiring review decided
(its lane W3). Written against commit `132ab95eb` (main, 11 October 2026). Where this note and the code disagree, the
code wins. Amended on 13 October 2026 by 0058: which page hears what is one table (`PAGE_HEARS`), an omit covers no table
the surface's own routes read, the baseline says what kind each exception is, and the tracer lives at
`tooling/scripts/trace-routes.mjs`.

## Context

A page learns of a change in one of three ways, and each is a list kept by hand.

- **The live feed.** The database tells a workspace which of 26 tables changed (`packages/db/src/realtime.ts:34`,
  WATCHED; 0019), and each surface names the tables it hears (`refreshOnTables`, judged by
  `apps/dashboard/src/legacy-bridge/surface-realtime.ts:62`). People hears the trio, deals, notes and lists
  (`apps/dashboard/src/surfaces/people/surface.ts:328`); Settings hears nothing.
- **The refresh map.** Each write names the surfaces its own tab reads again
  (`apps/dashboard/src/legacy-bridge/refresh-map.ts`). A mark on a visit names the Calendar alone (`:280`).
- **ROUTE_DRAWS and window events**, for what a page draws besides its own surface.

Nothing ties a surface's reads to what it hears. When a reader starts drawing a new record, the lists fall behind. It
has happened four times: People's lists and the sends feed (#1399), a send's ticks (#1417), templates (#1423, "not on the
feed, so an approval reaches an open Inbox within five minutes") and visits (#1551, read by People, Reports and the
playbooks with no wiring). A machine trace of every surface's reads to the tables behind them, verified by hand, found
the person (`contacts`), the business's facts (`tenant_config`), the rules (`policies`), templates, mailboxes, held
booking emails and the team on no feed at all, and 102 real gaps between pages (the Blueprint's evidence).

Two more costs follow from the lists. The receptionist compares one stamp over the settings, the rules and the
workspace's status before every message, so it knows of a change the owner's other tabs never hear. And a write is read
twice in its own tab: once by the refresh map and again by its own notice (`surface-runner.ts:349` forgets what was
read before the notice), up to 22 requests for one reply in the Inbox.

0031 wants facts to cross areas as events. 70 doors still write no event (its invariant 2's baseline), so a feed built
on events alone would leave those records silent today.

## Decision

1. **Every table a page draws a record from is told to its workspace**, by 0019's `tell_the_workspace`, with the
   trigger narrowed to the columns a page draws, so a stamp tells nothing (`tenant_config`'s hourly
   `calendar_checked_at` is not a change of the settings). New: `contacts`, `tenant_config`, `policies`, `templates`,
   `mailboxes`, `appointment_notices`, `memberships`, `invitations`, `tenants` (its status).
2. **A notice carries its table, its operation, and the transaction's clock (`at`)**, never a row and never an id. A
   tab drops a notice older than the read its surface already started, so your own change is read once.
3. **Contracts names each table's record kind** (`person`, `conversation`, `visit`, `rules`, …). Each surface declares
   the kinds it draws and how fresh it must be: on every notice, on its own page only, or after an age. Its live tables
   are derived from the declaration, not written.
4. **A coverage test** follows each surface's reads to their tables and fails a table that is neither heard nor listed,
   with its reason, in a baseline that may only fall. A second check holds each write's refresh row to the surfaces that
   declare what it changes.
5. **The receptionist and the pages hear the same changes.** A database test holds WATCHED to include every table the
   runtime stamp reads.
6. The live feed's notices (the changes a page hears, not the bell's rows) are raised from the events ledger in place of
   table notices once 0031's invariant 2 holds on both sides: `doors-without-events.json` (a SQL door that writes a
   record and no event) and `ts-only-events.json` (an event kind written only from TypeScript, after its fact) both
   empty. The first baseline alone could reach zero while the TypeScript side still wrote its facts apart (the wiring's
   second audit, S11-9, 14 October 2026). Ids in a notice (0021 step 5) wait for that note. Moving the bell's notices
   onto subscribers is 0031 Phase 3's, the escalation notice first.

## Shape

The migration adds the narrowed triggers and the `at` field to `tell_the_workspace`'s payload; WATCHED gains the rows; the
existing database test holds the two equal. `packages/contracts/src/activity/record-kinds.ts` maps kinds to tables (not
under `shell`: the phone app typechecks that folder under stricter settings); `liveTablesOf(kinds)` derives a surface's
tables. A surface override spreads `declareReads(key, { reads, fresh, ... })` (`apps/dashboard/src/legacy-bridge/surface-registry.ts`),
which derives its `refreshOnTables` and `refreshWhen`; where it hears only part of a kind it says which tables it omits and
why. `tooling/scripts/tests/shell/hearing/reads-are-heard.test.mjs` is the coverage test, over the tracer in
`tooling/scripts/tests/shell/hearing/_reads.mjs`, with its baseline in `tooling/scripts/tests/baselines/reads-not-heard.json`.
Its second check reads a write's tables with the event each makes: a surface is told of a write when the refresh map names it (or
forgets what it holds) or when the feed tells it of every table the write changes that it draws, since the feed reaches the
writer's own tab too (the own-change read, step 2). Its third holds a row to surfaces that read a table the write changes, so a
re-read is never for nothing.

## Steps

1. The silent tables join the feed, with `at` (a migration; either deploy order: a notice nobody hears is dropped).
2. The surfaces hear them; your own change is read once.
3. Record kinds and declared reads; the coverage test and its baseline.

## Tests

The each-workspace-is-told database test (WATCHED equal to the triggers, and covering the runtime stamp's tables); the
surface-realtime rule tests; the coverage test; the refresh-map tests.

## Risks

More notices: each new trigger fires once per statement per workspace, and the narrowed columns keep stamps out. A
surface that hears a table on every page pays a read per change: heavy surfaces keep `onlyOnItsPage`.

## Open questions

None for the owner. Ids in notices wait for 0021 step 5's own note.
