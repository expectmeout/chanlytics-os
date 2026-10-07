# 0031 · Records, events, reactions and doors

**Status:** Decided on 6 October 2026 (Ruben: "all approved"); of Phase 0, the fixes (00330, 00331) and the five numbers
(00332) are built; of Phase 1, the spine (00333 to 00336, through 0032 and 0033), intake lag (00337), the event-shaped
clocks ratchet that holds invariant 6 (`tooling/scripts/tests/clocks/_clocks.mjs`) and the writers-per-table ratchet that
shows invariant 1 (`tooling/scripts/tests/baselines/writers.json`); of Phase 2, 0034's door with every writer on it and
its doubt queue (00342 and 00344, 7 October 2026); the rest is not yet built: this note is the frame, and each step below is a note of its own,
three of them decided with it (0032, 0033, 0034), and "Where it stands" below says, phase by phase and invariant by
invariant, what is built and what is not. Proposed the same day from the wiring map of 5 October (the trace of
how the Inbox, Campaigns, People, the Calendar and Setup reach each other, and a second review of it answered point by
point). Written against commit `b9a4d5c` (main, 5 October 2026) and verified against the code at it, and read again at
`6a8e85f` (main, 6 October 2026), since which 0028's merge door (00326) and the message-status notice (00327) are in the
code. Where this note and the code disagree, the code wins.

## Context

### Inside each area the rules hold; between areas a fact is pulled

Everything a customer receives leaves through one door, `packages/core/src/deliver.ts`, which re-reads consent, the
pause and the workspace's status at the wire and refuses rather than guesses. Every route declares its policy with
`route()` (`apps/dashboard/src/server/route.ts`), pinned in `tooling/scripts/tests/route-policy.json`. The state
machines live in the database where every writer passes them (`messages_guard`, `jobs_guard`, 00106). Decisions are
pure functions proved over a database in memory (`planSmsIngress`, `planResendEvent`, `planCallEvent`, `replyPosture`).
None of that changes here.

Between the five areas it is different. Traced on 5 October 2026, a fact made in one area reached another in one of
four ways: in the writer's own transaction (6 of 38 wires), pushed as a job or a notice (4), noticed later by a clock
(9), or worked out again by whoever read it (19). The `events` ledger records what happened (`supabase/schema.sql`,
`events`: a kind, a subject, `request_id` from the caller's header, the kind's schema `version` since 00264) and
nothing subscribes to it: no table names a subscriber, no trigger wakes a reader, and `packages/jobs/src/schedule.ts`
enqueues with a plain insert that only pg_cron's ten-second poll notices (`trigger_jobs_tick`, 00098).

Three gaps follow from that, each traced to its lines:

- **No appointment is a record.** The owner's calendar is one iCal address (`tenant_config.config.calendar.ical_url`)
  fetched and parsed by every reader that needs a time: the receptionist (`apps/edge/lib/calendar/availability.ts`),
  the board and People (`apps/dashboard/src/server/calendar/`), Reports, the visit playbooks
  (`apps/edge/lib/playbooks.ts`), the sweep (`apps/edge/lib/calendar/calendar-sweep.ts`). Two caches per instance can
  disagree for up to thirty minutes, a reminder frozen into a run goes after a cancellation, and the product learns of
  a booking only when the feed shows it. 0002 decided the record on 21 September 2026 and it is not built.
- **A person has nine writers, and a merge only by hand.** `ingest_inbound` (00110), `ingest_call` (00164),
  `create_person` (00053), `import_person` (00263), the calendar sweep's own insert
  (`apps/edge/lib/calendar/calendar-people.ts`), `lead_set_stage` (00220), `reach_out_person` (00184), the call's
  booking link (`apps/edge/lib/voice/call-booking-link.ts`) and the email backfill
  (`packages/db/src/repositories/email.ts`) each match their own way; `contacts.merged_into_contact_id` was only ever
  cleared (00027, 00151) until 00326 (decision 0028, 5 October 2026) let an owner merge two records through one door,
  named by hand and never by a match; and until 00331 `create_person` never asked whether a number had been erased, so
  opening the Calendar could bring back a person who asked to be forgotten
  (`apps/dashboard/app/api/v1/calendar/route.ts`, `people-seen.ts`).
- **Every multi-step process is status columns and a clock.** Thirty-one pg_cron jobs run on 5 October 2026 (sixteen
  of them calling an edge door through `request_sweep`, 00086); ten do work that is a due time or a reaction (the job
  poll, two ten-second scans of `conversations`, the two reach-out clocks, the deadman, the lines, notes, playbooks and
  calendar sweeps). Only line provisioning keeps saga state (`packages/channels/src/lines/lines-saga.ts`). Moments,
  reach-out chains and broadcasts are three schedulers for one job; WhatsApp connect, carrier registration and the
  Google callback run provider calls inside the owner's request; a configuration save is live at the next message,
  with no version and no rollback (`packages/db/src/repositories/control-plane.ts`).

### The second review's method, and what it could not see

A review of the map, written from the map alone, found its refinements with one move: take a seam where state
crosses from one part to another and ask what commits together, what order is needed, what guarantee is honest, what
fails alone, who owns the truth, what is the smallest mechanism, how it moves without stopping, and what number shows
it. It asked that of five seams. Its central correction was right and is taken (0032): fan-out after the commit, never
inside the writer's transaction, so a bad subscriber cannot roll back a customer's message. Two of its mechanisms do
not fit this deployment and are declined with the reason in their notes: `NOTIFY` as the wake (nothing here can
`LISTEN`: the edge is Vercel functions, and no `pg_notify` or listener exists in the tree) and a tracing vendor
(`docs/takeover.md`, row 11: no error-tracking vendor, by policy). The same questions were then asked of every seam the
trace crossed; the answers are the invariants below.

## Decision

Four nouns, and twelve invariants held the way this repository holds a rule: by a test, with a number.

**Records** are the truth: one row for each thing that exists, written by one SQL door or one core verb. **Events**
are the fact's own row, written in the record's transaction from a catalogue of kinds; an event tells, it does not
store. **Reactions** are durable steps on the ledger after the commit: the relay, workflows, projectors, the notifier,
reconcilers. **Doors** are where privilege or irreversibility lives: `route()`, a `security definer` function,
`deliver()`, a provider's webhook. In one sentence: one record, one door, one event; many reactions after the commit;
one guarded way out.

| #   | Invariant                                                                                                                   | Mechanism                                                                                            | Held by                                                                                       | Shown by                      |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------- |
| 1   | One record for each thing, and one door writes it                                                                           | SQL doors and core verbs; `resolve_person` for people (0034)                                         | A table-to-door registry test; the table-names ratchet keeps falling                          | Writers per table             |
| 2   | A fact and its event share a transaction, and no door names a subscriber                                                    | `events` written inside the door; subscriptions as rows; the relay after the commit (0032)           | A conformance test per door: after it runs, its event exists; a doors-without-events baseline | Relay lag                     |
| 3   | Below the commit line, everything is at least once and idempotent                                                           | One delivery per event and subscriber; `jobs.dedupe_key`; projectors apply by version (0032, 0033)   | The double-delivery harness: a subscriber run twice on one delivery leaves the same rows      | Dead letters by subscriber    |
| 4   | A send to a person is at most once                                                                                          | `deliver()` claims the row before the wire; `SPEAKS_TO_A_PERSON` (`packages/jobs/src/ledger.ts`)     | The existing suite, unchanged                                                                 | Duplicate sends, target zero  |
| 5   | Order is per subject; a reader applies by version                                                                           | `aggregate_version` on the event; a projector ignores what is older than it holds (0032)             | A projector fed out of order ends in the same state                                           | Stale notices skipped         |
| 6   | Time is a row                                                                                                               | A timer is a job's `due_at`; a clock only reconciles, judges or purges (0033)                        | An event-shaped-clocks baseline that may only fall                                            | Timer punctuality             |
| 7   | Capacity and fairness are rows, counted in the claim                                                                        | `job_capacity` read by `claim_due_jobs`; lanes 0 and 1 take turns as lane 2 does (0033)              | Claim tests over a database in memory, and `jobs/jobs-lanes.db.test.mjs`                      | Lane lag per workspace        |
| 8   | Configuration is published; the runtime is keyed by a version; providers are converged to it, and drift is a fact           | Published versions; reconcilers writing observed provider state (a note to come)                     | Publish and reconciler tests                                                                  | Drift count; time to converge |
| 9   | Readiness is one predicate                                                                                                  | A `capabilities` projection read by Setup, the gates and the back office (a note to come)            | Three readers import one function                                                             | Capabilities false, with why  |
| 10  | Every table has a tenant, a floor and an erasure strategy                                                                   | RLS and the revokes (00120 to 00122); an erasure registry (a note to come)                           | `database/tenancy.db.test.mjs`, which exists; a registry test naming an unregistered column   | Erasure completeness          |
| 11  | Every model turn is a record, and a change to what the receptionist says is tested on recorded turns before it is published | `model_turns`; evals over them; a shadow canary for a new version (a note to come; 0023 is the base) | The publish gate                                                                              | Hold rate; override rate      |
| 12  | Every promise has a number with a target                                                                                    | Columns on `platform_metrics` (00277) and alarms on them                                             | A test that every number names a target, as `docs/debt.md`'s register holds its rows          | The numbers below             |

What the framework refuses, each considered: event sourcing (records stay the truth; evidence events are purged at
thirty days, 00115, and RLS, the doors and the tenancy proof stand on records); a message broker (the ledger has lanes,
leases, settlement and request ids); a workflow vendor (a thin runtime on the ledger keeps Postgres the only memory);
exactly-once (at least once inside, at most once at the wire); global ordering; a cache tier; a service split; a
journey editor; a second answer to "is it working"; a read that writes.

## Shape

Five tiers, read top to bottom, with one line between the second and the third that nothing below sees across until
the fact is durable:

1. **Facts arrive.** Channel adapters, booking doors, commands through `route()`, provider events, provider state.
2. **One small transaction.** The record, its event, and a command's own continuation (the job `assemble_broadcast`
   writes today, 00282, is the pattern): never a subscriber.
3. **The spine, after the commit.** The relay drains undispatched events with no cursor, writes one delivery per
   subscriber, and one job each; the ledger is woken when a due row is written and claims by capacity (0032, 0033).
4. **Reactions.** The conversation engine, the workflow runtime, projectors, the notifier, reconcilers: each a step
   that may run twice harmlessly.
5. **What leaves.** `deliver()`, at most once, unchanged; projections and the notice that names them; provider
   settings converged.

## Steps

Each phase ends on a number, not a feeling, and each step ships in either deploy order, as the README requires.

**0 · Fix, instrument, stage.** The defects the trace found, each with a test: `create_person` refusing an erased
number (00331, with 0034); the runtime stamp covering channels, listings and lines (00330); a WhatsApp number routing
only once its token is in Vault (`apps/edge/lib/whatsapp/connect-number.ts`); the booking door handed the newest
appointments first (`packages/contracts/src/reach-out/reach-out-booked.ts`); the calendar sweep under a time budget;
the dashboard's assemble port keeping the counted list; the merge-conflict remnant in `apps/edge/lib/sms/inbound-text.ts`.
Then five numbers in SQL before anything moves, built as 00332 (columns of `platform_metrics`, rolled nightly and read
on the back office: lag per lane from `jobs.fired_at - due_at` at the 95th percentile, time to first answer per channel
from `messages`, duplicate sends, dead letters by kind, and relay lag, which the relay's migration writes), and three
settings that are Ruben's: the
log drain, the outside pinger on `/api/health`, and a second alarm path that does not depend on the mail provider it
watches; and a staging project with the migrations replayed, so no later phase is proved on production. _Both orders:_
fixes and reads.

**1 · The spine, alone.** 0032 and 0033: the envelope, subscriptions, outbox, relay, deliveries, the intake ledger,
wake on insert, one dedupe key, capacity in the claim. No business logic moves; the first subscriber only measures
relay lag. _Done when_ a job written while the runner is idle is claimed within two seconds, relay lag p95 is under a
second, a late-committing event is never skipped, and an older edge runs green against the new tables.

**2 · One door, one vertical, one channel.** 0034's `resolve_person`; appointments end to end on 0002 (the record,
sources with cursors, a reminder workflow per appointment, the first projection); receipts as events into the inbox
projection; SMS answered after the acknowledgement, since the SMS door holds Twilio's request past its wait today
(`apps/edge/lib/sms/inbound-text.ts`). _Done when_ a reminder fires within sixty seconds of its due time and never
for a cancelled appointment, the calendar creates no duplicate person in a week, and a function killed mid-turn still
answers.

**3 · The receptionist as a governed system.** The runtime generalised from the reminder (the line saga first);
WhatsApp after the acknowledgement once the App Review contract (`apps/edge/lib/whatsapp/webhook.ts`) is re-read;
0001 steps 2 to 8; one action registry and one policy evaluator for text, voice, Ask and journeys (0027 steps 2 and
3); one record for every wait on a person, where today there are four (an escalation, a run `pending_approval`, a
send `held`, an Ask card); every model turn a record, with a grounding check as the reach-out check already makes
(`packages/contracts/src/reach-out/reach-out-opening.ts`, `facts_used`, `unbacked`). Each a note of its own.

**4 · Orchestration and the control plane.** Journeys in place of moments, chains and follow-ups; timers in place of
the scans; configuration as published versions with a canary in shadow and a rollback that is a publish; reconcilers
and observed provider state; one readiness predicate; retention as rows and one purge; erasure as a workflow over a
registry. Each a note of its own.

**5 · Scale and observation.** Projections with versioned notices and replay on rejoin (0019 step 4); breaker and
nonce state in Postgres; targets and alarms on the numbers; "what happened to this message" as one query over the
request id.

## Where it stands, 7 October 2026

Read against main at `49765c8d` (7 October 2026), after Phase 1 (#1447), the keyed write and the erasure registry
(#1451) and 0034's door (00342), and brought up to the change that put every writer on the door with its doubt queue
(00344, the same day), and to the change that links a lead on every identity and answers a text after its
acknowledgement (00346, 00347), built on #1469's appointments record (00345). Not fully complete: Phases 0 and 1 are built in mechanism and measured; Phase 2 has
begun; Phases 3 to 5 are not started. Of the twelve invariants, four are held by a mechanism and a test, four in part,
and four are not begun.

| Phase                                     | Built                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Not yet                                                                                                                                                                                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 · Fix, instrument, stage                | The seven fixes (00330, 00331, #1447); the five numbers (00332) and intake lag (00337), read on the back office                                                                                                                                                                                                                                                                                                                                                                                                                | The log drain, the outside pinger, the second alarm path and the staging project: Ruben's switches, deferred by Ruben                                                                                                                                                             |
| 1 · The spine, alone                      | All of it (00333 to 00337): 0032 steps 1 to 4, 0033 steps 1, 2 and 4; an older edge proved green against the new tables                                                                                                                                                                                                                                                                                                                                                                                                        | 0033 step 3, the three job indexes, which wait on a dedupe index covering finished rows; the reach-out sender's own count until its sends are jobs                                                                                                                                |
| 2 · One door, one vertical, one channel   | 0034 entire (00331, 00342, 00344, 00346): `resolve_person` with every one of the nine writers on it, assurance on identities, the doubt queue and the People page's row, and the lead link on every identity; 0002's record with its first source, a booking tool's notice by email (00345, #1469); SMS answered after the acknowledgement (00347): the door records the text and answers Twilio, an `inbound_answer` job answers it, and a job taken back after its runner died answers only while no reply names the message | The calendar feed kept as appointments and a reminder that asks its appointment again at the send, on 00345's table; 0002's reads (Reports, People, playbooks), its webhook and a person's status, and the reminder as a job on a due row; 0032 step 5, the first real subscriber |
| 3 · The receptionist as a governed system | Nothing; 0023's shadow port is the base, and off                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Each item, a note of its own first                                                                                                                                                                                                                                                |
| 4 · Orchestration and the control plane   | 0036 steps 1 and 2, the erasure registry with its ratchet, the notes' scrub and the completeness proof (00341); 0035 steps 1 and 3, a keyed write answered once (00340), with step 2 begun at eight routes                                                                                                                                                                                                                                                                                                                     | Everything else; 0036 step 3 and 0035's remaining client calls are the nearest                                                                                                                                                                                                    |
| 5 · Scale and observation                 | Nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 0019 step 4 only if wanted; the rest with Phase 4's numbers                                                                                                                                                                                                                       |

Phase 1's "done when" has its mechanisms and its tests, and the two numbers it names are on the back office; whether
production meets the targets is held by nothing yet, which is invariant 12.

| #   | Invariant                                              | Where it stands                                                                                                                                                                                                              |
| --- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | One record, one writer                                 | In part: the writers ratchet (57 tables with more than one, `person_doubts` the fifty-seventh, argued in `docs/debt.md`; `contacts` 22 and `contact_identities` 3 since 00344); the table-to-door registry test is not built |
| 2   | Fact and event in one transaction, no subscriber named | Mechanism built (0032); the conformance test per door and the doors-without-events baseline are not                                                                                                                          |
| 3   | At least once and idempotent below the commit          | Held: one delivery per event and subscriber, `jobs.dedupe_key`, the double-delivery harness                                                                                                                                  |
| 4   | At most once at the wire                               | Held, unchanged; duplicate sends counted since 00332                                                                                                                                                                         |
| 5   | Order per subject, apply by version                    | Not begun beyond the two columns (00334): no projector exists                                                                                                                                                                |
| 6   | Time is a row                                          | Held by the event-shaped clocks ratchet: 9 clocks remain of 10                                                                                                                                                               |
| 7   | Capacity and fairness in the claim                     | Held (00335)                                                                                                                                                                                                                 |
| 8   | Configuration published and converged                  | Not begun; a note to come                                                                                                                                                                                                    |
| 9   | Readiness is one predicate                             | Not begun; a note to come                                                                                                                                                                                                    |
| 10  | Tenant, floor and erasure strategy per table           | In part: the tenancy proof, the registry (195 of 312 personal columns unnamed) and the completeness proof of what it names (0036 step 2); step 3 names the rest                                                              |
| 11  | Every model turn a record, tested before publish       | Not begun beyond 0023's shadow                                                                                                                                                                                               |
| 12  | Every promise a number with a target                   | In part: the six day-numbers exist; the test that every number names a target, and the alarms, are not built                                                                                                                 |

One of the three gaps the trace opened with stands as it did: every multi-step process is still status columns and a
clock. A person's nine writers all match through one door, which links their lead too, an appointment is a record a
booking tool's notice writes (#1469), and a text is answered by a job its door leaves, so a function killed mid-turn
still answers, once. In order, what takes the frame further: the calendar feed kept on the same record, with the
reminder asking its appointment again at the send; receipts as events (0032 step 5, which waits on a reader: the inbox
shows no delivery state yet), 0002's reads and the reminder as a job on a due row (two
clocks retire), the verbs that set a field of `contacts`'s twenty-two, 0036 step 3 with 0035's conformance, the targets
of invariant 12 with Ruben's alarms, then Phase 3's notes.

## Tests

The invariants' holds, each a baseline under `tooling/scripts/tests/baselines/` that may only fall, in
`docs/debt.md`'s register: event-shaped clocks (ten on 5 October 2026); doors that write a tenant table with no event
test; subscribers with no double-delivery test; personal columns with no erasure strategy; tables with more than one
writer. Each arrives with the note that builds its mechanism.

## Risks

- **A frame that outruns its notes.** This note decides the shape; nothing is built from it directly. A step built
  without its note is the risk 0015 names, and the same rule holds: a note first, against a commit.
- **Fairness at the wire.** Every invariant below the commit line says "at least once"; the one at the wire says "at
  most once". A change that blurs the two in either direction is a customer failure, and the existing suite is the
  guard.
- **The staging project.** Without it, phases 1 to 3 are proved on production, as the nightly is today
  (`docs/takeover.md`, row 24).

## Open questions for the owner

1. May the receptionist ever book, behind the Booking class of the Autonomy matrix? 0002's open question 5 says no.
2. What exactly did Meta's App Review pin: the 200 inside the invocation, or the handshake and the signature?
3. Does the no-vendor policy for error tracking also cover a tracing exporter?
4. The staging project and the second alarm path are settings; both are needed before phase 1.
5. How long does a new configuration version run in shadow before it speaks, and what agreement rate lets it through?
