# The receptionist fills the book: the build

The spec is `docs/superpowers/specs/2026-10-30-the-receptionist-fills-the-book-design.md` (decided by Ruben on 30 Oct
2026), and the decision note is 0081. Built on `sequences/the-receptionist-fills-the-book` in the `cm-fills-the-book`
worktree from `5d0394714`, one branch, one pull request. The migration takes the next free number when it is pushed
(00494 is claimed twice on 30 Oct, by #1962 and the 0079 lane; read `Claude Video/docs/migration-claims.md` and claim
the number there first; the plan writes it as `NNNNN`) and goes to production before the merge (`land --applied`).
Nothing is offered until a workspace turns the moment on, so no switch is needed.

**L1 as built (31 Oct 2026, uncommitted in `cm-fills-the-book`).** Tasks 1 to 5, with what the build found:

- **The word.** The typecheck found the cold email's `OpeningVerdict` beside this lane's: "opening" is the cold email's
  word (the sentence its check writes, `{{opening}}`). So this moment never says it. A person reads "Fill a
  cancellation", the code says a freed time (`freed`, `freed_when`, `freed_ask`, `calendar/freed-time.ts`,
  `freed_time_taken`, `freed_time_offer`), and the starter is "A time freed up" (`time_freed`). The plan's names below
  are the built ones.
- **The migration is 00497,** applied on the lane's throwaway stack (`cm-fills-the-book-test`, ports 583xx) and
  recorded in the ledger, with 00494's gap argued (held by #1962 and the 0079 lane). `took` rides `run_counts`, which
  Sent and Today read, rather than `campaign_ledger`.
- **The freed time** is read over the receptionist's own `freeWindows`, so it is a time the receptionist would offer;
  two refusals joined the set (`all_day`, `no_hours`).
- **The approval's refusal** reads the moment an approval would send (`runDaysAt`'s new `sendsAt`), not the lead
  hours; the approval verb's row read (`verbs.ts` `loadBroadcast`) and the waits' count (`runAsked`) carry
  `offered_start`, so the page, the count and the verb agree.
- **A new wait rule,** `freed_ask` (ends `end_of_its_time`), says how a freed time's batch ends.
- **Task 10's Lists & offers line was built here** (`offFreedTimeRow`), since the home's tests count the moments a
  workspace may turn on.
- **The slot kind reaches** the composer's choices (`templateSlots`, `freed`), Ask's drafts and their judge (`freed` on
  a known moment), New's message sheet (`freedOnly`, `freedFirstOnly`), the routes' input schemas (`PARAM_SOURCES`) and
  Ask's frozen tool schemas (refrozen).
- **One dead export left for L2:** `freedTimeFactsFor`, which task 6's run calls.
- **Checks run:** every touched test file (29, one per run), the database suite on the stack (6 of 6), `pnpm -r
  typecheck`, ESLint uncached on the touched files (no new warning; one complexity error fixed by `keptWords`),
  Prettier.

**L2 as built (31 Oct 2026, uncommitted in `cm-fills-the-book`).** Tasks 6 to 9, with what the build found:

- **The migration is 00497 now.** Main moved while L2 was built: #1964 took 00495 (on production) and #1962 holds
  00496, so this lane's file was renumbered from 00495 to 00497 as a working number, listed under "waiting for a
  number" in the shared claims file, not claimed. The ledger argues 00494 to 00496 until main is merged in. L2 added
  two functions to it: `assemble_broadcast` keeps a batch's `offered_*`, and `sequence_steps_due` never hands the hourly
  sweep a step on `slot_opened`.
- **The bell and the batch never disagree.** The relay writes one delivery per subscriber, each its own job, so
  `visit_notice` could read before `freed_time_offer` made the batch. So both take one path (core subscribers.ts
  `freedTimeAsked`): the decision by `freedTimeOf`, then the edge's offer, which makes the batch once per appointment
  and answers a second ask with the batch it made. `visit_notice` asks it for its clause; an offer that cannot be asked
  leaves the clause out and never holds the news. Pausing offers platform-wide therefore means pausing both
  subscribers, or the workspace's step.
- **The calendar's copy of a cancelled booking holds no time.** A booking tool that writes the owner's calendar leaves
  a copy there until the feed's next read. `freedTimeOf` and `freedTimeTaken` leave out the freed visit's other
  sightings: the same person, starting as the visit did (`SAME_VISIT_MS`). A copy the calendar sweep matched to nobody
  still holds its time, and that time is not offered.
- **What the subscriber reads:** `freedTimeFactsOf` (packages/db) gives the row and the calendar: the profile's hours,
  closures and rules, the zone, and every standing row over the booking window, the feed's synced rows among them.
  The edge's offer (`apps/edge/lib/calendar/freed-time-offer.ts`, injected into the job context as `freedTimes`) runs
  the first running step on the moment through the sweep's own `runPlaybook`, `RunRequest.freed` carried to core and
  the batch's `offered_*` through the assemble port. Its answer is `FreedTimeOffer` (contracts): offered with its
  people and whether it waits for an OK, or why not (`no_step`, `paused`, `nobody`, `off` with the run's reason).
- **A time that has begun by the send is not offered:** the run refuses it (`freed_time_passed`) when a night's batch
  would go at nine after the time starts.
- **Taken, at the first send:** `takenBeforeItWent` (core broadcast-stops.ts) asks the record before a scheduled
  batch's first send, cancels through the cancel verb as the system (reason `taken`) and tells once
  (`freedTimeTakenNotice`). `keptWords` moved to broadcast-words.ts, so broadcast.ts stays under 800 lines.
- **Time passed, in the sweep:** `waitingPlaybookRuns` reads a freed time's batch (it has `offered_start`, no
  `run_for`), the cancel's reason is `time_passed`, and `skippedRunNotice` says the time it offered.
- **Where things went, against this plan:** the freed time's rule is `packages/contracts/src/calendar/visit/freed-time.ts`
  and the lane's tests are in `tooling/scripts/tests/freed-times/`, since the calendar folders (contracts and tests)
  and the sequences tests stood at their 20 modules. The cases L1 had put in the core run and campaign tests, both past
  their 1600 lines, moved there too (`the-step-that-fills-a-cancellation.test.mjs`). The database's reads are one
  module, `packages/db/src/repositories/campaigns/freed-times.ts`, so the db barrel gains no line.
- **What the checks found:** three tests that list the moments by hand take `slot_opened` (the Campaigns pools, the
  moments offered with a calendar, the value kinds' sentence); `took` makes Sent and the Calendar's marks read
  appointments, recorded as an over-read in `baselines/reads-not-heard.json` (the count rides with the run's row), and
  the writes baseline says a visit's write does not re-read them; the trees held by the complexity lint kept their hold
  by small helpers (`reachOrder`, `freedTimeRefusal`, `batchWhen`, `heldBeforeAnyClaim`).
- **Checks run:** every touched test file, the lane's database suites and the ones over the re-created functions on
  the stack, `pnpm -r typecheck`, ESLint uncached on every touched file (no new warning: the eight it says are main's),
  Prettier, the dead exports (none of this lane's), and the 229 test targets CI's picker names for this change.

**L3 as built (31 Oct 2026, uncommitted in `cm-fills-the-book`).** Tasks 10 and 11, with what the build found:

- **How it runs (the settings sheet):** a freed time's sequence offers no hour, gap or cadence; its cap is "People per
  freed time" (2, 4, 6 or 10, a number set elsewhere kept among them); "Up to N days ahead" is a line, not a choice: the
  workspace's booking window, which the receptionist offers inside anyway. A window of the step's own has no column, so
  none was added. The record's `settings.days_ahead` is read for a freed time's sequence alone.
- **The sequence's row and head:** no next run by its hour (it runs when a cancellation frees a time), and Run now is
  not offered (`freed_time`: "It runs when a cancellation frees a time, never by hand.").
- **History and Reports' "Each send":** `sequence_history` is re-created in 00497 to say each batch's `offered_start`
  and `took`, and a day says "1 took it" as Today's line does.
- **The guide:** a row on no stage, just before the month's offer, only with a calendar.
- **The activity log:** a cancel the system made says why: "Skipped a freed time's run when its time came", "Stopped a
  freed time's run: someone booked the time".
- **Ask:** the signal `freed_times_unoffered` (weight 2) where at least 3 appointments were cancelled in 30 days, a
  calendar is connected and no step on the moment runs by the one rule (contracts `freedTimesUnoffered`), over a new count (`cancellationsSince`: events of a person's
  appointment cancelled by the service or vanished from the feed); the definition "freed time"; the signals tool's
  description changed, so Ask's frozen tools were refrozen. The eval case `freed_time_yes_en` is added and validated, not
  run: `eval-brain.mjs` calls production's eval door with the edge's secret and a real workspace's prompt, which waits
  for Ruben's word and a workspace to run it on.
- **Not built:** a "took" figure on a run's own sheet (its report counts from its recipients; Today, History and
  Reports say it), and a taken batch's own words on its History day (it says Canceled; the owner was told once).
- **Debt:** the db barrel grows 854 to 860 for the four reads, recorded under Rises in `docs/debt.md`; the pull request
  carries a `Debt:` line for it.

**How each task runs:**

- Each task writes its test first and runs that one file, red, then makes it pass:
  `node tooling/scripts/checks/test.mjs <file>`, one file per run, never an empty file argument.
- A `.db.test.mjs` runs against this lane's local stack, which `supabase start` makes. Run it with
  `--test-concurrency=3`, and never point it at production.
- The generated files (`gen:schema-sets`, `gen:schema-snapshot`, `gen:db-types`, `gen:data-model`) are regenerated on
  the lane's stack after the migration, in task 1, and again if a later task changes a table.
- Lint (uncached, on the touched files), typecheck, format and dead exports run once, in task 12.
- Every commit waits for Ruben's word ("no commit until approved"). Until then the new files are marked intent-to-add
  (`git add -N`), so the tests that read tracked files see them.
- The code is written by hand; a sub-agent reads, never writes.

## L1. The moment and its words

### 1. The migration

Files:

- `supabase/migrations/NNNNN_a_time_a_cancellation_frees_is_offered.sql` (new)
- `tooling/scripts/tests/freed-times/freed-times.db.test.mjs` (new; planned under `tests/sequences/`)
- the generated files, from the local stack

Steps:

1. **The test,** over `tooling/scripts/tests/_rows.mjs` with made-up people (555-01xx numbers) and a workspace with a
   zone:
   - **The check:** a `sequence_steps` row with trigger `slot_opened` inserts; `not_a_trigger` is refused.
   - **The columns:** a batch with the three `offered_*` columns inserts; `offered_start >= offered_end` is refused;
     two batches of one step with one `offered_from` are a unique violation; two with null `offered_from` are not.
   - **`was_at`:** an `appointments` row moved by `update ... set starts_at` (as the service) writes
     `appointment.changed {change: moved, was_at: <old starts_at>}`; `appointments_feed_sync` fed a second read with
     the item moved writes the same with `was_at`; a cancellation's event carries no `was_at`.
   - **`freed_time_taken`:** a batch with an offered span and three sent sends; one person books inside the span after the
     batch started (1), one before the batch (0), one outside the span (0), one vanished (0), one cancelled (0); a
     `proposed` row inside counts (1).
   - **`run_counts`:** a run with an offered span says `took`; one without says null.
   - **The subscription:** `event_subscriptions` has `('appointment.changed', 'freed_time_offer', 2)`.
2. **The migration, re-runnable:**

   ```sql
   -- NNNNN · A time a cancellation frees is offered (decision 0081).
   set local lock_timeout = '3s';

   alter table public.sequence_steps drop constraint if exists playbooks_trigger_check;
   alter table public.sequence_steps add constraint playbooks_trigger_check check (trigger in (
     'quiet_30', 'new_week', 'phoned_only', 'everyone_monthly', 'visit_tomorrow', 'visited', 'lapsed',
     'saved_list', 'proposal_waiting', 'lead_first', 'after_step', 'slot_opened'));

   alter table public.sequence_batches add column if not exists offered_start timestamptz;
   alter table public.sequence_batches add column if not exists offered_end timestamptz;
   alter table public.sequence_batches add column if not exists offered_from uuid
     references public.appointments(id) on delete set null;
   alter table public.sequence_batches drop constraint if exists sequence_batches_offered_check;
   alter table public.sequence_batches add constraint sequence_batches_offered_check check (
     (offered_start is null and offered_end is null and offered_from is null)
     or (offered_start is not null and offered_end is not null and offered_start < offered_end));
   create unique index if not exists sequence_batches_offered_once
     on public.sequence_batches (step_id, offered_from) where offered_from is not null;

   insert into public.event_subscriptions (kind, subscriber, lane)
   values ('appointment.changed', 'freed_time_offer', 2) on conflict do nothing;
   ```

   - `appointments_note_change()` re-created from `supabase/schema.sql`'s form, its `moved` branch adding
     `'was_at', old.starts_at` to the data.
   - `appointments_feed_sync(...)` re-created from the snapshot's form, both `moved` branches adding `'was_at'`: the
     row's `starts_at` before the update (the loop's `v_row.starts_at`), and null for an insert-as-move.
   - `freed_time_taken(p_batch_id uuid) returns integer`, `security definer set search_path to 'public'`, stable:

   ```sql
   select count(distinct a.contact_id)::int
     from sequence_batches b
     join sequence_sends s on s.batch_id = b.id and s.state = 'sent' and s.contact_id is not null
     join appointments a on a.tenant_id = b.tenant_id and a.contact_id = s.contact_id
    where b.id = p_batch_id and b.offered_start is not null
      and a.status in ('proposed', 'booked', 'kept') and a.vanished_at is null
      and a.starts_at >= b.offered_start and a.starts_at < b.offered_end
      and a.created_at >= coalesce(b.started_at, b.created_at);
   ```

   EXECUTE revoked from `public` and `anon`; granted to `authenticated` and `service_role`. It reads as the caller
   (`set search_path to ''`, no definer), so RLS counts a member's own workspace and another's as 0.

   - `run_counts` (00374's form) re-created from the snapshot, each run's counts gaining
     `'took', case when b.offered_from is not null then public.freed_time_taken(b.id) end`.
3. **The generated files,** on the lane's stack. `schema-sets.generated.ts` gains `slot_opened` in
   `sequence_steps.trigger`; `database.types.ts` the three columns and the function.

### 2. The trigger, its kind, its purpose and its row

Files:

- `packages/contracts/src/playbooks/playbook-triggers.ts`
- `packages/contracts/src/playbooks/playbook-purpose.ts`
- `packages/contracts/src/config/workspace-config/policy-classes.ts`
- `tooling/scripts/tests/playbooks/triggers.test.mjs` (the file that holds `PLAYBOOK_TRIGGERS` today; new cases)
- `tooling/scripts/tests/consent/` (the file that holds `messageAboutOfTrigger`; new cases)

Steps:

1. **The tests:**
   - `triggerOf("slot_opened")` is `{ kind: "freed", cls: "follow_up", list: "asked_never_booked" }`; it is among
     `MOMENT_TRIGGERS`; `momentOffered` says yes with a calendar and no without; `momentReadsCalendar` says yes.
   - its label is "Fill a cancellation" for every trade (it names no appointment, so `triggerWords` has no case).
   - `messageAboutOfTrigger("slot_opened")` is `theirs`; `purposeOfPlaybook("follow_up")` is `conversational`;
     `channelNeverCarries("sms", "conversational")` is null.
   - `POLICY_CLASS_WORDS.follow_up.name` is "Follow-ups" and its note names the freed time.
   - `policyClassOffered("follow_up")` stays true.
2. **The entry,** after `proposal_waiting`:

   ```ts
   // 0081: a time a cancellation freed, offered within the hour to the people who asked this month and never booked.
   // Conversational, about their own ask (playbook-purpose.ts): a text may carry it, an email needs no yes.
   {
     id: "slot_opened",
     label: "Fill a cancellation",
     list: "asked_never_booked",
     cls: "follow_up",
     kind: "freed",
     hint: "A time a cancellation freed, offered to the people who asked and never booked",
   },
   ```

   - `momentReadsCalendar`: `isWinBack(t.id) || t.kind === "visit" || t.kind === "freed"`.
   - `messageAboutOfTrigger`: `kind === "visit" || kind === "deal" || kind === "freed"`.
   - The Follow-ups row's words, as the spec says them.
3. **Run the two files.** Green.

### 3. The freed time

Files:

- `packages/contracts/src/calendar/visit/freed-time.ts` (new; planned as `calendar/freed-time.ts`)
- `packages/contracts/src/calendar/index.ts`
- `tooling/scripts/tests/freed-times/freed-time.test.mjs` (new; planned under `tests/calendar/`)

Steps:

1. **The test,** with a zone of `America/New_York`, hours 9:00 to 18:00 Monday to Saturday, a closure, and
   `BOOKING_DEFAULTS`:
   - a `cancelled` event by the service about a row with a person, starting tomorrow 15:00, span 60 minutes, nothing
     standing: offered `{ start, end }` of that span;
   - `by: member`: `not_a_service_change`; no `contact_id`: `no_person`; `moved` with no `was_at`: `no_was_at`;
     `moved` with `was_at`: the old span, the row's length;
   - starting inside the lead hours: `too_soon`; past `max_days_ahead`: `past_window`; on a closure, or outside the
     hours: `closed`; a standing `booked` row overlapping: `not_free`; a span of 20 minutes: `too_short`;
   - a span half taken (a standing row covers its first half): the free half, when at least a slot long;
   - `freedTimeWords`: "today at 4:30 PM", "tomorrow at 2:00 PM", "Tuesday at 3:00 PM", read at the send's moment,
     and across the autumn clock change (the test's two legs, `TEST_TZ`).
2. **The module:**

   ```ts
   export type FreedTimeRefusal =
     | "not_a_service_change" | "no_person" | "all_day" | "no_was_at" | "no_hours" | "too_soon" | "past_window" | "closed" | "not_free" | "too_short";
   export interface FreedTimeEvent { change: string; by?: string | null; was_at?: string | null; starts_at?: string | null }
   export interface FreedTimeRow { id: string; contactId: string | null; startsAt: string; endsAt: string; allDay: boolean }
   export interface FreedTimeCalendar {
     tz: string; hours: Record<string, Hours | undefined> | undefined; closures: Closure[] | undefined;
     standing: ReadonlyArray<{ start: number; end: number }>; rules: Partial<typeof BOOKING_DEFAULTS> | null;
   }
   export function freedTimeOf(event: FreedTimeEvent, row: FreedTimeRow, cal: FreedTimeCalendar, now: Date):
     { ok: true; start: number; end: number } | { ok: false; why: FreedTimeRefusal };
   export function freedTimeWords(startMs: number, tz: string, sendAt: Date): string;
   export const FREED_TIME_WORDS = { timePassed: (when: string) => `${when} has passed`, taken: (when: string) => `${when} was taken before it went` };
   ```

   `freedTimeOf`: the span is the row's, or `was_at` to `was_at + (endsAt - startsAt)` for a move; `too_soon` against
   `now + lead_hours`, `past_window` against `max_days_ahead`, `closed` by `openAt` at the span's first minute, the free
   part by subtracting `standing` (widened by `buffer_min`), `too_short` under `slot_min`. `freedTimeWords` is
   `visitDayWord` and `visitStartTime` over a visit-shaped `{ start }`.
3. **Barrel:** the names in `calendar/index.ts`, in its order. Green.

### 4. The slot and the starter

Files:

- `packages/contracts/src/templates/templates.ts`
- `packages/contracts/src/templates/starter-templates.ts`
- `packages/contracts/src/templates/template-slots.ts` (where a kind's words are, if it holds them)
- `packages/core/src/messages/` (the fill that reads `facts.visit_when`)
- `tooling/scripts/tests/templates/starter-templates.test.mjs`, `message-version-slots.test.mjs`

Steps:

1. **The tests:** the starter `time_freed` is in the set, utility, for `slot_opened`, with three slots whose third is
   `freed_when`; every version passes the check in both languages with no warnings (the set's own test); the fill of a
   message whose slot is `freed_when` reads `facts.freed_when` and refuses a send with none, as `visit_when` does.
2. **`PARAM_SOURCES`** gains `"freed_when"`; `ParamSpec` gains `{ kind: "freed_when" }` with its comment ("an
   freed time's own words: the time a cancellation freed, the same for everyone of its batch").
3. **The starter,** after `proposal_follow_up`:

   ```ts
   {
     key: "time_freed",
     name: "time_freed",
     title: "A time freed up",
     purpose: "for a time a cancellation freed, to the people who asked and never booked",
     category: "utility",
     trigger: "slot_opened",
     texts: {
       en_US: { body: "Hi {{1}}, it's {{2}}. A time just opened {{3}}. Want it? Reply here.", footer: null, slots: [FIRST, BUSINESS, FREED_WHEN] },
       es: { body: "Hola {{1}}, te escribimos de {{2}}. Se abrió un espacio {{3}}. ¿Lo quieres? Responde aquí.", footer: null, slots: [FIRST_ES, BUSINESS_ES, FREED_WHEN_ES] },
     },
     email: {
       en_US: { subject: "A time opened {{3}}", body: "Hi {{1}},\n\nA time just opened at {{2}} {{3}}. Want it? Reply to this email." },
       es: { subject: "Se abrió un espacio {{3}}", body: "Hola {{1}}:\n\nSe abrió un espacio en {{2}} {{3}}. ¿Lo quieres? Responde a este correo." },
     },
     sms: {
       en_US: { body: "Hi {{1}}, it's {{2}}. A time just opened {{3}}. Want it? Reply here." },
       es: { body: "Hola {{1}}, te escribimos de {{2}}. Se abrió un espacio {{3}}. ¿Lo quieres? Responde aquí." },
     },
   },
   ```

   with `FREED_WHEN = { kind: "freed_when", label: "When", example: "Tuesday at 3:00 PM" }` and its Spanish twin
   ("Cuándo", "el martes a las 3:00 PM"). The Spanish text keeps to the letters the carriers send plainly, as the
   reminder's does.
4. **The fill:** where a slot of kind `visit_when` reads the send's `facts.visit_when`, `freed_when` reads
   `facts.freed_when`, through the same function. Green.

### 5. The batch's shape and words

Files:

- `packages/contracts/src/broadcasts/broadcasts.ts` (the run DTO, `BroadcastCounts`, `toBroadcastVM`)
- `packages/contracts/src/today/today-runs.ts`
- `packages/contracts/src/playbooks/playbook-approval.ts` (`runApprovalRefusal`)
- `packages/contracts/src/playbooks/playbook-triggers.ts` (`batchWaitWords`)
- `packages/contracts/src/playbooks/playbooks.ts` (`freedTimeFactsFor`)
- `tooling/scripts/tests/today/today-queue.test.mjs`, `tooling/scripts/tests/playbooks/approval-sheet.test.mjs`,
  `tooling/scripts/tests/broadcasts/broadcasts.test.mjs`

Steps:

1. **The tests:**
   - a run DTO with `offered_start`, `offered_end`, `offered_from` and `counts.took` maps whole; one without has them
     null (a database from before the migration).
   - `todayRunWords` for a waiting freed time: meta "Campaign · ready", sentence "Tue 3:00 PM opened. 4 people asked this
     month and never booked."; soon: "Campaign · soon"; done: "Sent to 4 · 2 replied · 1 took it", and no "took" when
     the count is null.
   - `runApprovalRefusal` refuses a run whose `offered_start` is inside `lead_hours` of now, in `FREED_TIME_PASSED_WORDS`,
     and allows one an hour past the lead.
   - `batchWaitWords("slot_opened", { offeredStart, tz })` says "until Tue 1:00 PM".
   - `freedTimeFactsFor` answers `{ freed_when, appointment, offered_start, offered_end }`.
2. **The DTO and the view model:** the three fields and `took` on `BroadcastCounts` (`RUN_COUNTED` unchanged: `took` is
   read from the row, never summed from the people).
3. **The words,** as the tests say. `batchWaitWords` takes the run (its trigger and its offered start) where it took
   the trigger alone; its two callers (`readyRunNotice`, `todayRunWords`) hand it the run.
4. **`freedTimeFactsFor(run, tz, sendAt)`** beside `visitFactsFor`. Green.

## L2. The run and the door

### 6. The run with a freed time

Files:

- `packages/core/src/campaigns/run-playbook.ts`
- `packages/core/src/campaigns/ports.ts` (`RunPlaybookCommand.freed`)
- `tooling/scripts/tests/broadcasts/core-campaigns.test.mjs` (new cases)

Steps:

1. **The tests,** over the file's fakes, a step `slot_opened` and a command with
   `freed: { start, end, from, when: "Tuesday at 3:00 PM" }`:
   - the people are `asked_never_booked`'s members, most recent last contact first, capped at `cap_per_run`;
   - a person the week's breath holds is skipped `heard_this_week`; one whose thread a person has, `human_has_it`;
     an opted-out one, `opted_out`;
   - each is reached on the channel `reachFor` picks for a conversational message about theirs (a text person by text,
     an email-only person by email, a WhatsApp person by WhatsApp);
   - the batch has `offered_*` and `run_for` null, is named "Fill a cancellation · Tue 3:00 PM", and `alreadyRan` is never
     asked;
   - every send's facts are `{ freed_when: "Tuesday at 3:00 PM", appointment, offered_start, offered_end }`;
   - the mode follows `batchModeOf` (words new: `pending_approval`; veto: scheduled 30 minutes on; auto: now), and a
     run outside the sending hours is scheduled for 9:00;
   - a `RunPlaybookCommand` with a freed time for a step that is not `slot_opened` is refused (`not_a_freed_time_step`),
     and a `slot_opened` step run without one is `off` with `no_freed_time` (the sweep never runs it for a day).
2. **The branch:** `trig?.kind === "freed"` resolves the list through the saved-list path (`resolveList` over
   `list_key: "asked_never_booked"`), sorts by `lastContact.ts` descending, and slices to the cap; `recipientFacts`
   returns `freedTimeFactsFor`; the row carries the freed time; `alreadyRan` is skipped; the name is
   `${p.name} · ${clockNearWhen(freed.start, tz)}` ("Tue 3:00 PM"). The assemble port's row type takes the three
   columns (`assembleBroadcast` in `packages/db`). Green.

### 7. The subscriber

Files:

- `packages/contracts/src/shared/enums.ts` (`EVENT_SUBSCRIBERS`)
- `packages/core/src/subscribers.ts`
- `packages/db/src/repositories/calendar/appointments.ts` (`appointmentOf`, `appointmentStandingOver`)
- `packages/db/src/repositories/campaigns/sequences.ts` (`freedTimeBatchOf`: the batch an appointment's event made)
- `packages/jobs/src/handlers.ts` (the ports)
- `tooling/scripts/tests/events/a-freed-time-is-offered-from-its-event.test.mjs` (new, on the harness)

Steps:

1. **The test,** on the harness `an-event-is-delivered-to-its-subscriber.test.mjs` uses:
   - an `appointment.changed {change: cancelled, by: service}` about a row with a person makes one call to
     `offerFreedTime` with the span; delivered twice, one call and one batch (the port answers the batch already made);
   - a member's cancel, a row with no person, a `moved` without `was_at`, a time inside the lead hours, and a workspace
     whose `offerFreedTime` says `no_step` each make nothing and log why (`freed_time_not_offered {why}`);
   - `visit_notice`'s clause: with a batch of 4 people, "offered to 4 people"; with none, "nobody asked this month who
     hasn't booked".
2. **The name:** `EVENT_SUBSCRIBERS` gains `"freed_time_offer"` with its comment, beside `visit_notice`'s.
3. **The ports:**

   ```ts
   /** The appointment an event is about, as the record holds it now (packages/db appointmentOf); null when gone. */
   appointmentOf(tenantId: string, id: string): Promise<FreedTimeRow | null>;
   /** The edge's door: the workspace's running slot_opened step runs for this freed time (0081). */
   offerFreedTime(tenantId: string, freed: { from: string; start: number; end: number }): Promise<OfferOutcome>;
   /** The batch this appointment's freed time made, if any, for the news's clause (packages/db freedTimeBatchOf). */
   freedTimeBatchOf(tenantId: string, appointmentId: string): Promise<{ people: number } | null>;
   ```

   `OfferOutcome` is `{ made: true; batchId: string; people: number } | { made: false; why: "no_step" | "paused" |
   "already_offered" | "no_freed_time"; detail?: string }`.
4. **The subscriber:** `freed_time_offer` reads the event, asks `appointmentOf`, asks the calendar's facts the way
   `visit_notice` reads the zone (through the ports' facts), runs `freedTimeOf`, and calls `offerFreedTime`. Every refusal
   is one log line. `visit_notice` asks `freedTimeBatchOf` before `visitChangeNews`, which takes the count.
5. **The jobs' ports** build the two reads from `packages/db` and take `offerFreedTime` from the job context
   (`ctx.offerFreedTime`, set by the edge's tick). Green.

### 8. The edge's offer

Files:

- `apps/edge/lib/freed-times/offer.ts` (new)
- `apps/edge/lib/playbooks.ts` (`RunRequest.freed`)
- `apps/edge/api/jobs/tick.ts` (the context's `offerFreedTime`)
- `apps/edge/lib/log-events.ts` (`freed_time_offered`, `freed_time_not_offered`)
- `tooling/scripts/tests/freed-times/offer-freed-time.test.mjs` (new, fakes)

Steps:

1. **The test:** a workspace with a running `slot_opened` step: `runPlaybook` is asked with the freed time, and the
   outcome is the run's (`made: true`, the batch's id and people); no step: `no_step`; a paused step: `paused`; a
   workspace paused: `paused`; the run's `off` with `no_freed_time` passes through.
2. **`offerFreedTime(db, tenantId, freed)`:** `loadTenantRunContext`, the step by `trigger = 'slot_opened'` and
   `state = 'running'` (`runningStepsOn`), `runPlaybook(ctx, step, { by: { kind: "system" }, freed })`.
3. **`RunRequest.freed`** passed into the core command. Green.

### 9. Taken, and the time passed

Files:

- `packages/jobs/src/broadcast-send.ts`
- `apps/edge/lib/reach-out/playbooks-sweep.ts` (`endRunsWhoseDayPassed`)
- `packages/contracts/src/playbooks/playbook-approval.ts` (`skippedRunNotice`'s words for a freed time)
- `tooling/scripts/tests/broadcasts/` (the file that runs `broadcast_send` over fakes; new cases)
- `tooling/scripts/tests/playbooks/` (the sweep's day-passed test; new cases)

Steps:

1. **The tests:**
   - a batch with an offered span whose `appointmentStandingOver` says a row stands: cancelled through the cancel verb
     with reason `taken`, told once (`the taken words`), no send claimed; one whose span is free sends as before;
   - the sweep ends a waiting freed time batch whose `offered_start` is inside the lead hours, reason `time_passed`, told
     once, and leaves one an hour past it.
2. **The send:** before the first claim of a batch with `offered_from`, ask the record; taken cancels.
3. **The sweep:** `endRunsWhoseDayPassed` reads `offered_start` beside `run_for`. Green.

## L3. Where it is seen

### 10. The reads, the sheet, the home, the guide, the news

Files:

- `apps/dashboard/src/server/readers/` (the broadcasts reader: `offered_*`, `took`)
- `apps/dashboard/src/surfaces/campaigns/sequences/settings-sheet.tsx`
- `packages/contracts/src/sequences/sequence-words.ts`
- `packages/contracts/src/playbooks/lifecycle/lifecycle-ledger.ts` (`offFreedTimeRow`)
- `packages/contracts/src/journey/journey-guide.ts`
- `packages/contracts/src/notices/visit-news.ts`
- `tooling/scripts/tests/playbooks/` (the lifecycle ledger's test), `tooling/scripts/tests/sequences/sequence-words.test.mjs`,
  `tooling/scripts/tests/today/bell-rows.test.mjs`

Steps:

1. **The tests:**
   - the ledger's Lists & offers shows "Fill a cancellation · Turn on" where the moment is offered and none stands, and the
     sequence's row where one does; a workspace with no calendar shows neither;
   - the guide has a row on no stage, "when a cancellation frees a time: a freed time to the people who asked and never
     booked", only with a calendar;
   - `visitChangeNews(v, "cancelled", nowMs, { offered: 4 })` ends "· offered to 4 people"; `{ offered: 0 }` ends
     "· nobody asked this month who hasn't booked"; `null` (a batch not yet known) says neither;
   - the settings sheet's words: "People per freed time" with 2, 4, 6 and 10, and "Up to N days ahead".
2. **The reader** maps the three columns and `took`.
3. **The sheet** draws the two rows for a `slot_opened` step in place of the cap's and the gap's.
4. **The home, the guide and the news,** as the tests say. Green.

### 11. Ask and the receptionist's case

Files:

- `apps/dashboard/src/server/ask/tools/read/signals.ts`
- `apps/dashboard/src/server/ask/prompt.ts` (`ASK_DEFINITIONS.freed_time`)
- `tooling/evals/whatsapp-cases.json`
- `tooling/scripts/tests/ask/` (the signals test; new case), the Ask prompt fixture the definitions test re-records

Steps:

1. **The tests:** a workspace with 6 cancellations in 30 days and no `slot_opened` step raises
   `freed_times_unoffered` (weight 2), whose `next` is `propose_sequence with action moment on slot_opened`; with the
   step on, nothing.
2. **The spot:** reads the cancellations from the appointments the pool's visits carry (`withVisitsOf`: cancelled rows
   in the window) and the sequences read (`seqs`).
3. **The definition:** `freed_time`: "A time a cancellation freed on the calendar, offered within the hour to the people
   who asked this month and never booked, by the sequence A freed time; a reply is answered by the receptionist, and a
   booking stays the owner's to confirm where the workspace takes requests."
4. **The eval case:** a thread whose last outbound is the freed time's words, answered "Yes, I'll take it", on a workspace
   taking booking requests: the record's `booking` names that time and the service; `then` is a hold for the owner.
   Run `eval-brain.mjs` on it once, locally, with the key. Green.

## L4. Checks, docs and landing

### 12. Checks, docs and landing

Files:

- `docs/glossary.md` (Freed time, under the campaign words)
- `docs/system-prd.md` (S-14.3 the moments; S-20 `sequence_batches`)
- `docs/data-model.md` (regenerated)
- `docs/decisions/README.md` (the 0081 row's status, if it moves)

Steps:

1. **Docs,** as above; `tooling/scripts/tests/docs/*.test.mjs` and `history/decisions.test.mjs` green.
2. **Lint** (uncached, on the touched files), **typecheck** (`corepack pnpm -r typecheck`), **format**
   (`corepack pnpm format`), **dead exports** (`corepack pnpm check:dead-exports`), once, after the last change.
3. **The real app,** on the lane's stack with a made-up workspace and a calendar: a booking's cancellation notice
   arrives by email, the batch waits on Today, Approve, the send, a yes as the customer, the request held for the
   owner; the Campaigns row, Lists & offers, the bell's clause.
4. **Ruben's word,** then the commits, `land --applied` with the migration applied to production first, the smoke, and
   the lane ended.

**Measure after a week on production:** freed times offered against cancellations by the service; replies per freed time;
`took` over sent; stops and edits of the words; minutes from the event to the batch.
