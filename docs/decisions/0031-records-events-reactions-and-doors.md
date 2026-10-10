# 0031 · Records, events, reactions and doors

**Status:** Decided on 6 October 2026 (Ruben: "all approved"); of Phase 0, the fixes (00330, 00331) and the five numbers
(00332) are built; of Phase 1, the spine (00333 to 00336, through 0032 and 0033), intake lag (00337), the event-shaped
clocks ratchet that holds invariant 6 (`tooling/scripts/tests/clocks/_clocks.mjs`) and the writers-per-table ratchet that
shows invariant 1 (`tooling/scripts/tests/baselines/writers.json`); of Phase 2, 0034's door with every writer on it and
its doubt queue (00342 and 00344, 7 October 2026); the rest is not yet built: this note is the frame, and each step below is a note of its own,
three of them decided with it (0032, 0033, 0034), and "Where it stands" below says, phase by phase and invariant by
invariant, what is built and what is not, and its entry of 9 October 2026 what that day's review against production
moved. Proposed the same day from the wiring map of 5 October (the trace of
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

| Phase                                     | Built                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Not yet                                                                                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0 · Fix, instrument, stage                | The seven fixes (00330, 00331, #1447); the five numbers (00332) and intake lag (00337), read on the back office                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | The log drain, the outside pinger, the second alarm path and the staging project: Ruben's switches, deferred by Ruben                                        |
| 1 · The spine, alone                      | All of it (00333 to 00337): 0032 steps 1 to 4, 0033 steps 1, 2 and 4; an older edge proved green against the new tables                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 0033 step 3, the three job indexes, which wait on a dedupe index covering finished rows; the reach-out sender's own count until its sends are jobs           |
| 2 · One door, one vertical, one channel   | 0034 entire (00331, 00342, 00344, 00346): `resolve_person` with every one of the nine writers on it, assurance on identities, the doubt queue and the People page's row, and the lead link on every identity; 0002's record with its first source, a booking tool's notice by email (00345, #1469), and its second, the calendar feed kept hourly, which a visit's reminder asks again at the send (00348); SMS answered after the acknowledgement (00347): the door records the text and answers Twilio, an `inbound_answer` job answers it, and a job taken back after its runner died answers only while no reply names the message | 0002's reads (Reports, People, playbooks), its webhook and a person's status, and the reminder as a job on a due row; 0032 step 5, the first real subscriber |
| 3 · The receptionist as a governed system | Nothing; 0023's shadow port is the base, and off                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Each item, a note of its own first                                                                                                                           |
| 4 · Orchestration and the control plane   | 0036 steps 1 and 2, the erasure registry with its ratchet, the notes' scrub and the completeness proof (00341); 0035 steps 1 and 3, a keyed write answered once (00340), with step 2 begun at eight routes                                                                                                                                                                                                                                                                                                                                                                                                                             | Everything else; 0036 step 3 and 0035's remaining client calls are the nearest                                                                               |
| 5 · Scale and observation                 | Nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 0019 step 4 only if wanted; the rest with Phase 4's numbers                                                                                                  |

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
booking tool's notice and the hourly read of the calendar both keep, which a reminder asks again before it goes, and a
text is answered by a job its door leaves, so a function killed mid-turn still answers, once. In order, what takes the
frame further: receipts as events (0032 step 5, which waits on a reader: the inbox
shows no delivery state yet), 0002's reads and the reminder as a job on a due row (two
clocks retire), the verbs that set a field of `contacts`'s twenty-two, 0036 step 3 with 0035's conformance, the targets
of invariant 12 with Ruben's alarms, then Phase 3's notes.

**8 October 2026**, from the architecture review of that day (local, not yet on main when written). Invariant 4, a
send to a person at most once, gains the two cases it did not hold: a queued message is claimed on its own row before
the wire (`messages.sending_at`, 00352: two jobs naming one message are never both answered yes), and a job that said
it was about to speak is never run again (`jobs.spoke_at`, 00352: a text's answer was repeated when its runner died
between the provider's yes and the reply's row). A run that waited is approved through one door, its release, its
job and its decision together (`approve_broadcast`, 00353), which is invariant 1's shape for one more record. And
Phase 3's first step is built behind a switch: a WhatsApp message of a workspace the edge names
(`WHATSAPP_ANSWERS_AS_JOBS`) is recorded, its answer scheduled as the same `inbound_answer` job a text's is, and
acknowledged (`apps/edge/lib/whatsapp/answer-later.ts`). Unset, which is the default, the webhook answers inside
Meta's request as its reviewed contract says; the switch is how the road is tried on one workspace's traffic before
that contract is changed for all.

**9 October 2026**, a review of the frame against main at `d1bb65961` and against production, read only, after
#1471 (00346 to 00348) and the merges of 7 and 8 October (00349 to 00359), all of which production holds (its head
is 00359). Three readings were taken, each by a reviewer who had not built what it read: the spine and the clocks,
the write paths and the patterns, and the road from a branch to production; the sharpest claims were read again in
the code before they were kept.

_What production says._ Six workspaces, four with any message in thirty days: about 140 messages and 76 calls. The
spine has one subscription, `message.received` to `audit`, whose subscriber does nothing; of some 140 event kinds, four
are written in the same transaction as their record (`message.received`, `call.recorded`, `appointment.changed`,
`contact.consent_changed`) and about eighty TypeScript sites write theirs apart, best-effort, after the fact.
`inbound_answer` has carried no production text yet (the four texts since 7 October arrived before its deploy), and
the WhatsApp switch is unset. `resolve_person` writes a `person.resolved` for every call, so the hourly calendar sweep
writes about 830 a week that say nothing changed, the largest kind by far. Every clock under pg_cron ran on time.

_What it found, in the order it matters._ Two records are still written and then recorded: `assemble_broadcast`
writes the run and its job, and the decision is a second write (`packages/core/src/campaigns/create-broadcast.ts`);
a decision that fails answers 500 and lets the idempotency key go, so the next press is a second run to the whole
audience, and the reach-out chain's save has the same shape. A member's take-over and hand-back are four to six writes
on two clients (`packages/core/src/conversations/take-over.ts`, `hand-back.ts`); one that fails between them leaves
the person's hold on the thread for up to a day while the Inbox shows it open, and the send door refuses every draft
meanwhile. A provider's STOP is written to the person and its `contact.consent_changed` written apart, best-effort,
while `consent_channels` is derived from that event. A subscription's change writes the account and the workspace's
status apart (`apps/edge/lib/billing/billing.ts`). A failed `event_deliver` is told on the customer's bell, and one
whose event was purged is counted nowhere. "May an automated message go" is two gates (voice's
`outbound-gate.ts`, text's `reply-gates.ts`), and cancelling a queued message is written in five places. The 10-second
clock that ends a hold scans `conversations`, whose `control_until` has no index. And the road: production is compared
with main by version alone, so a 00346 of another name read as the same; migrations were applied by hand before their
merge; a merge went in before its checks finished; nothing checks production after a deploy; a change to the one send
door runs almost no tests, since selection follows folders.

_What changes in the order._ The frame stands; its next steps move. Before any new mechanism, every record that is
still written and then recorded takes a door, as 00353, 00356 and 00357 began: the broadcast and the reach-out chain with
their decisions, the take-over and the hand-back whole, a provider's STOP with its event, a subscription's change with
the workspace's status; a failed delivery is the platform's to hear, not the customer's; the hold's clock reads an
index; and the sweep's no-change `person.resolved` is written no more. Then the road, since the week's two incidents
were the road's: every push to production held first to production's ledger by name as well as version, whoever
pushes; a migration the new code calls applied from its branch just before the merge, and the rest by a workflow a
person starts from main once both apps serve the commit; the compare by name; a smoke after each production deploy; a
merge only once its checks pass, which is a setting of Ruben's. Phase 2's remaining items are re-ranked behind those: receipts as events still wait on a reader;
the reminder as a due row waits on the playbooks note. Phase 3's first real subscriber is the escalation's notice to
the owner, not receipts: it has the widest coupling (fifteen sites in `packages/core/src/inbound`, the voice webhook,
the email receipts), and today the owner's mail is sent inside Meta's and Retell's requests; its precondition is
`escalation.opened` written in a door. An `appointment.*` subscriber that runs `reach_out_booked` closes the
booking-email gap, since that door runs only from the hourly calendar sweep. Of the spine, what has no caller waits
rather than grows: `aggregate_version` and `causation_id` until a projector, `job_capacity` until the reach-out's
sends are jobs, the three per-kind dedupe indexes beside `jobs_dedupe_live` until one is shown to serve a read; one of
the two re-drive paths (`event_deliveries_redrive`, the back office's `requeueFailedJob`) goes; and a paused
subscription, which drops its events against 0032's decision 4, is settled one way. Phase 5 waits on Phase 4's
numbers, as before. The staging project of Phase 0 stands beside the road, not in its place: the road keeps
production's ledger honest, and staging is where a migration and a deploy are tried before production sees either.

_Ruben's._ The merge settings (`enforce_admins`, branches kept up to date: both weighed against the Actions minutes in
`docs/runbook.md`); the Environment's three secrets for the apply workflow; whether a paused subscription holds or drops; which workspace tries the
WhatsApp switch; the alarm path the numbers of invariant 12 will ring.

**10 October 2026**, the sweep and the road brought onto main at `c368115b4` and reviewed once, each branch by a reader
who had not written it. The doors are 00373 to 00378, renumbered above main's 00371 and #1533's 00372: the run and
the chain with their decisions (00373), the billing row and the switch (00374), a provider's STOP (00375), the
resolution recorded on a change (00376), the hold's index (00377, built concurrently, alone in its file), the take-over
and the hand-back (00378). The review changed six things: `resolve_person` is 00367's body with only its ledger row
gated (copied from 00346, it would have undone 00367's rule for a number written with its +); the take-over withdraws
only a draft no run has claimed (`sending_at` null, as 00362 and #1527's pause do: as a definer it reads past the row
policy); `billing_apply` locks the row before it lays the columns over it (read from a second scan, a stamp waiting
behind a reading wrote the older status back) and keeps #1527's guard that only the row's own customer is forgotten;
the run's door refuses an actor who is not a member of the workspace; `team_decision` drops an undo link to another
workspace's line instead of failing the write on the same-workspace key; and a failed delivery pages once per
subscriber. The road changed as well: GitHub offers a private repository of a personal account no Environment with a
required reviewer, so `migrate.yml` on a push would have applied each migration unasked the moment it merged; it is
started by hand, after main's own checks and both deploys, and the before-merge path from a branch stays, held to the
same check. Main's push does not run the node tests again (the pull request ran them, and the minutes cannot pay
twice); the smoke runs on the edge's deployment, whose `ref` is the commit's sha, never `main`. Production's ledger,
read by name that day, holds no clash. Invariant 11, every model turn a record, is decision 0039's, built beside this
note and not yet on main.

The same day, on the same branch, the items the 9 October review left: a queued message is withdrawn by one door
(`withdraw_queued` and the member's doors over it, 00379), so the nine places that cancelled a send each in its own way
call it; one predicate says whether an automated message may go (`unattendedHold`, core), the receptionist's reply and
the outbound gate asking it in one order and failing closed; an escalation is opened with its event (`escalation_open`,
00380), the hold refused with an event the ledger refused; the spine's first subscriber that acts (00381): an
appointment's change writes `appointment.changed` in its own transaction, and `reach_out_booked` books the lead a
reach-out wrote to however the booking arrived; a paused subscription keeps what it would have been handed (00382), a
re-drive replaying it, and that re-drive is a delivery's one way back: the back office's requeue hands a delivery's job
to it rather than running a second beside a row it would leave failed. Invariant 10's registry names 187 of its 195 columns (0036 step 3, 00383), and 0035's client
keys the workspace's other writes. Invariant 2 is held in part: the doors-without-events baseline is built (sixty-eight
doors writing seventy-seven tables, `baselines/doors-without-events.json`), and each door the day built has its event
proved on a real database; the conformance test across every door is not. Invariant 12 waits on Ruben's targets.

## Tests

The invariants' holds, each a baseline under `tooling/scripts/tests/baselines/` that may only fall, in
`docs/debt.md`'s register: event-shaped clocks (ten on 5 October 2026); doors that write a record with no event (built
10 October 2026); subscribers with no double-delivery test; personal columns with no erasure strategy; tables with more than one
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
