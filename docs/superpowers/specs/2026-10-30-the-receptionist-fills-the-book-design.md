# The receptionist fills the book

**Asked by Ruben, 30 October 2026.** He asked for five bold changes to the product a second time that day, then
"Shape #1": when an appointment on the business's calendar is cancelled or moved, the time it frees is offered to the
few people who asked this month and never booked, and the receptionist takes their reply. The design brief (`Claude
Video/docs/2026-10-30-fills-the-book-brief.md`, outside the repository) was approved with its spend: "Approve, write
spec". Written against main's `5d0394714` (#1961), by hand, no sub-agents. Decision note 0082 (0079 and 0080 are held
by open lanes).

**Status:** decided, not built. The lane is `sequences/the-receptionist-fills-the-book` in `cm-fills-the-book`, one
branch and one pull request, built in the order of the plan
(`docs/superpowers/plans/2026-10-30-the-receptionist-fills-the-book.md`). One migration, the next free number when it
is pushed.

**What the code read changed from the brief.** Six calls are simpler than the brief had them, each said where it
lands below:

1. The door is the record's own event, `appointment.changed`, delivered to a new subscriber: nothing new watches the
   calendar.
2. The batch is a run of the moment through the one run every moment takes, so the breath, the modes, the trial, the
   sending hours and the decision row are the ones every sequence has.
3. A move says the time it left (`was_at` on its event); an event from before says none, and a move offers nothing.
4. A freed time's batch has no day of its own: its time is the batch's, and one batch is made per freed appointment.
5. "Taken" is asked of the record, not the feed: whether a standing appointment overlaps the offered time now.
6. No intent is kept on a person, so the people written to are the most recent first; the brief's ranking by what
   they asked about is a later step.

## Why

Read on main `5d0394714`:

- **A cancelled appointment frees time that nobody offers.** The record's trigger says each cancellation and move as
  `appointment.changed` (`appointments_note_change`, 00436), and the feed's hourly read says each vanished and moved
  row the same way (`appointments_feed_sync`, 00419). The owner is told of a customer's cancellation on the bell
  (`visit_notice`, contracts `bookingChanged`), and the time stays empty.
- **The people who could take it are already a list.** People's "Asked, never booked" (contracts
  `people/lists/builtin-lists.ts`: wrote or called in the last 30 days, and nothing on the calendar since answers it)
  is Today's own "Worth a look" leak and a one-off send's audience (`sendOnceRoute("asked_never_booked")`).
- **Every part of a batch exists.** A moment runs through `runPlaybook` (`apps/edge/lib/playbooks.ts`, core
  `campaigns/run-playbook.ts`): the pool, the breath (`PLAYBOOK_BREATH_MS`, one campaign message a person a week), the
  channel each person is reached on (`reachFor`), the mode and its hold (`batchModeOf`, `planRun`, decision 0064), the
  sending hours (`PLAYBOOK_HOURS`), the batch and its people in one write (`assemble_broadcast`), the words a person's
  send keeps (`sequence_sends.facts`, as a visit's time is kept) and Today's row (`todayRunWords`).
- **The reply is the receptionist's already.** A campaign's reply lands in the person's thread; the receptionist
  answers it with the thread's history, which holds the message it sent. Where a workspace takes booking requests
  (decision 0061, 00443), a time the customer picks is held for the owner; else the booking link goes.
- **An offer would reach almost nobody.** Meta delivers no marketing template to a US number
  (`broadcasts/whatsapp-offers.ts`, since 1 April 2025), and a text carries no offer (`channelNeverCarries`). A
  message about the person's own ask is conversational and about them: `purposeOfPlaybook("follow_up")` is
  conversational, `messageAboutOfTrigger` says theirs for a visit's and a deal's kind, and by email such a message
  needs no yes (`mayMessageFor`, consent.ts: a proactive message about theirs).

So a freed time is one more moment, run by the parts that exist, started by the event the record already writes.

## What is decided

1. **One new moment, `slot_opened`, of a new kind, `freed`, under the Follow-ups row (class `follow_up`).**
   - `PLAYBOOK_TRIGGERS` gains `{ id: "slot_opened", label: "Fill a cancellation", list: "asked_never_booked", cls:
     "follow_up", kind: "freed", hint: "A time a cancellation freed, offered to the people who asked and never
     booked" }`. One label for every trade: it names no appointment, so `triggerWords` needs no case for it.
   - **The word.** The cold email owns "opening" (the sentence its check writes, `{{opening}}`, docs/glossary.md), so
     this moment never says it: a person reads "Fill a cancellation", the code says a freed time (`freed`,
     `freed_when`, `calendar/visit/freed-time.ts`), and its starter is "A time freed up" (`time_freed`).
   - `momentReadsCalendar` says yes for the kind: the moment is offered only where a calendar is connected, as the
     appointment moments are, and the check that makes a campaign says why it is refused without one.
   - `messageAboutOfTrigger` says theirs for the kind. `purposeOfPlaybook` already says conversational for its class.
   - The Follow-ups row's words widen (`POLICY_CLASS_WORDS.follow_up`): name "Follow-ups", note "how the proposal
     follow-up and a freed time start · one nudge per proposal, with its link; a time a cancellation freed, to the people
     who asked · each keeps its own on its page, and asks you before its first batch and after new words". Its modes
     stay auto, veto and ask.
   - The database's check on `sequence_steps.trigger` takes `slot_opened`.
2. **Who hears of it.** The people the "Asked, never booked" list names now, as a saved moment resolves a list
   (`membersOf`), minus the opted out, minus a thread held for a person (`human_has_it`), minus anyone the week's
   breath holds (`heard_this_week`), each reached on the channel `reachFor` picks for a conversational message about
   theirs: WhatsApp (a utility template), text, or email with no yes. Most recent contact first, `cap_per_run` of them
   (4 by default, choices 2, 4, 6 and 10). The step's `gap_days` is 7, the limits' floor, so nobody hears of freed times
   more than weekly.
3. **What counts as a freed time.** An `appointment.changed` event whose `change` is `cancelled`, `moved` or `vanished`,
   whose `by` is the service (a booking tool's email or door, or the feed; a member's own word frees nothing to offer),
   about an appointment linked to a person (`contact_id`), whose freed time:
   - starts no sooner than now plus the booking rules' `lead_hours`, and no later than `max_days_ahead` (14 by
     default);
   - is inside the business's hours and not on a closure (`openAt`);
   - is still free on the record now: no standing appointment (`proposed` or `booked`, not vanished) overlaps it;
   - is at least one slot long (`slot_min`, 30 by default).

   The freed time is the row's own span (`starts_at` to `ends_at`), or for a move the span it left: its event gains
   `was_at` (the old `starts_at`), written by the record's trigger and the feed's read alike; the span's length is the
   row's. An event from before this change says no `was_at`, and a move from it offers nothing.
4. **One batch per freed appointment, with its time on it.**
   - `sequence_batches` gains `offered_start`, `offered_end` and `offered_from` (the appointment's id), and a unique
     partial index on `(step_id, offered_from)`: a second delivery of the same event, or a cancel and a vanish of one
     row, make one batch.
   - A freed time's batch has `run_for` null (the one-run-a-day index is on `playbook_id, run_for`; the day is the
     offered time's), and its name is the step's name and the time: "Fill a cancellation · Tue 3:00 PM".
   - Its words for every person are the same and kept on each send's `facts` as a visit's are:
     `{ freed_when: "Tuesday at 3:00 PM", appointment: <offered_from>, offered_start, offered_end }`.
5. **The door is a subscriber of the event.** `EVENT_SUBSCRIBERS` gains `freed_time_offer`, subscribed to
   `appointment.changed` in lane 2 beside `visit_notice` and `reach_out_booked`. It reads the event, asks the record
   for the row and the freed time (decision 3), finds the workspace's running `slot_opened` step, and asks the edge's
   `runPlaybook` for a run with the freed time (`RunRequest.freed`). A workspace with no such step, a paused one, an
   event that frees nothing to offer, or one whose time is already offered, makes nothing and says why in its log line.
   It may run twice on one delivery and leaves the same rows (the unique index).
6. **The batch is decided as every batch is (decision 0064).** Its mode is `batchModeOf`: the step's words new to the
   owner, or the sequence in ask mode, wait for an OK on Today; veto, and the first week under auto, go 30 minutes
   later with Stop; auto sends. A batch made outside the sending hours waits for 9:00 by the business's clock
   (`nextOpenMoment`) and says so; a time that starts before then is not offered (decision 3's lead hours against the
   send's moment).
   - **Its wait ends with the time:** `runApprovalRefusal` refuses an approval once the time it offers has begun by the
     moment the approval would send it (`runDaysAt` says that moment, `sendsAt`), in `FREED_TIME_PASSED_WORDS`; its wait
     rule is `freed_ask` ("Goes only if you approve it before Tue 3:00 PM; after that it is skipped"); the sweep that
     ends a missed day's run (`endRunsWhoseDayPassed`) ends a freed time's the same way, reason `time_passed`.
   - **Taken before it went:** the send asks the record as it claims the batch (`broadcast_send`, as a visit's send
     asks the feed): a standing appointment overlapping the offered time cancels the batch with reason `taken`, told
     once as a skipped run is (`skippedRunNotice`), and sends nothing.
7. **The message is the starter `time_freed`,** utility, for the moment `slot_opened`, in English and Spanish, on
   WhatsApp, email and text, with three slots: first name, business name, and a new slot kind `freed_when`.
   - WhatsApp, en_US: "Hi {{1}}, it's {{2}}. A time just opened {{3}}. Want it? Reply here." es: "Hola {{1}}, te
     escribimos de {{2}}. Se abrió un espacio {{3}}. ¿Lo quieres? Responde aquí."
   - Email subject "A time opened {{3}}" / "Se abrió un espacio {{3}}"; the text version the WhatsApp words.
   - It asks for a reply and carries no link. A workspace that turns the moment on files it through the one door
     every starter goes through (`starterForTrigger`), and WhatsApp's version waits for Meta's approval as every new
     message does; until then the WhatsApp people of a batch are held (`template_not_approved`) and the rest go.
   - `PARAM_SOURCES` gains `freed_when`, filled from the send's facts as `visit_when` is; its words are
     `visitDayWord` and `visitStartTime` over the offered start ("today at 4:30 PM", "tomorrow at 2:00 PM", "Tuesday
     at 3:00 PM"), read at the send's moment.
8. **The reply is the receptionist's turn, unchanged.** The thread's history holds the message, so the receptionist
   answers a yes from it: where the workspace takes booking requests, the time the customer picks is held for the
   owner (`booking_request_open`); else the booking link goes, as it does for any caller. A second yes to a time now
   held hears the next open times from the calendar. One eval case holds it: a thread whose last outbound is an
   freed time, answered yes, takes the request for that time.
9. **"Took the freed time" is read, never stored.** One SQL reader, `freed_time_taken(p_batch_id)`: the people the batch
   sent to who have an appointment on the record, `proposed`, `booked` or `kept` and not vanished, starting inside the
   offered span, written after the batch started, from any source. Counted on the batch's counts (`took`, beside
   `sent` and `replied`) through `run_counts`, which Sent, Today and a run's sheet read; the Campaigns lens's own
   figure reads the same counts (task 10).
10. **Where it is seen.**
    - **Today:** the waiting batch as every run's row: "Campaign · ready", "Tue 3:00 PM opened. 4 people asked this
      month and never booked." with Approve and Skip; under veto "Campaign · soon"; once it went, the done line "Sent
      to 4 · 2 replied · 1 took it". A batch cancelled as taken: "Tue 3:00 PM was taken before it went", once.
    - **Campaigns › Sequences:** the sequence's row, its batches by time, its History, and its settings sheet with
      "People per freed time" (the cap's choices 2, 4, 6, 10) and "Up to N days ahead" (the booking window by default,
      the step's own number otherwise).
    - **Campaigns home:** under Lists & offers, beside the month's offer: the sequence's row, or where none stands and
      the moment is offered, a line "Fill a cancellation · Turn on" as the month's offer has (`offOfferRow`'s twin).
    - **The bell:** `visit_notice`'s cancellation news gains one clause, "offered to 4 people" or "nobody asked this
      month who hasn't booked", read from the batch the same event made (or didn't), so the two never disagree. A
      time freed on the owner's own calendar stays untold (`VISIT_CHANGES_TOLD`).
    - **Reports › Campaigns:** the run counted as every run is, plus `took` as a figure of the run.
    - **Autonomy › Follow-ups:** its evidence line counts the sequence's batches with the proposal follow-up's
      (`classEvidenceLine`).
    - **Ask:** the moment is proposable as every offered moment is (`PROPOSABLE_TRIGGERS`); the journey guide gains a
      row on no stage, beside the month's offer ("when a cancellation frees a time: a freed time to the people who asked
      and never booked"); the signals gain a spot, "N appointments were cancelled in the last 30 days and the time was
      offered to nobody", whose card turns the moment on.
11. **Later, not this change:** freed times on a quiet day (tomorrow less than half booked, from the room read); a second
    wave to quiet regulars under the Win-back row, by email; "Offer it to more" on a batch; the ranking by what the
    person asked about, once the receptionist's intent is kept on the person.

## What changes, part by part

### 1. The database (one migration)

- **The check:** `playbooks_trigger_check` (on `sequence_steps`, from 00183) dropped and added with `slot_opened`.
- **`sequence_batches`:** `offered_start timestamptz`, `offered_end timestamptz`, `offered_from uuid` (to
  `appointments`, on delete set null); a check that all three are null or `offered_start < offered_end`; a unique
  partial index `sequence_batches_offered_once (step_id, offered_from) where offered_from is not null`.
- **`was_at` on a move:** `appointments_note_change` (00436's form) adds `'was_at', old.starts_at` to a `moved`
  event's data; `appointments_feed_sync` (00419's form) adds `'was_at', v_row.starts_at` to its `moved` events. Both
  re-created whole, from `supabase/schema.sql`, with the one addition each.
- **`freed_time_taken(p_batch_id uuid) returns integer`,** `security definer`, `stable`: the count of decision 9.
- **`run_counts`:** a freed time's run's counts gain `took`, `freed_time_taken(b.id)`; any other run's say nothing of
  it (the key absent, so the counts every other reader compares stay as they were).
- **The subscription:** `insert into event_subscriptions (kind, subscriber, lane) values ('appointment.changed',
  'freed_time_offer', 2) on conflict do nothing`.
- **The generated files,** on this lane's local stack: `gen:schema-sets`, `gen:schema-snapshot`, `gen:db-types`,
  `gen:data-model`.

### 2. Contracts

- **The trigger** (`playbooks/playbook-triggers.ts`): the entry, the kind, `momentReadsCalendar`, `triggerWords`,
  `batchWaitWords` for a freed time (its time), and `approvalEndsWithSendingHours` untouched (a freed time's wait ends with
  its time, not the day's hours).
- **The purpose** (`playbooks/playbook-purpose.ts`): `messageAboutOfTrigger` says theirs for the kind.
- **The class words** (`config/workspace-config/policy-classes.ts`): the Follow-ups row's name and note.
- **The freed time** (`calendar/visit/freed-time.ts`, new): `freedTimeOf(event, row, calendar, rules, now)` answers the offered span
  or why not (`FREED_TIME_REFUSALS`: `not_a_service_change`, `no_person`, `all_day`, `no_was_at`, `no_hours`,
  `too_soon`, `past_window`, `closed`, `not_free`, `too_short`), over the receptionist's own `freeWindows` and the
  record's standing rows; `freedTimeWords(start, tz, sendAt)`; the refusal and
  held words (`time_passed`, `taken`).
- **The slot** (`templates/templates.ts`): `PARAM_SOURCES` gains `freed_when`; the fill reads `facts.freed_when`
  where `visit_when` reads `facts.visit_when`.
- **The starter** (`templates/starter-templates.ts`): `time_freed`, with `FREED_WHEN` slots in both languages; its
  check passes as every starter's does.
- **The run's words** (`playbooks/playbooks.ts`): `freedTimeFactsFor(run, tz, sendAt)` beside `visitFactsFor`.
- **The batch** (`broadcasts/broadcasts.ts`): `offered_start`, `offered_end`, `offered_from` and `counts.took` on the
  DTO and the view model; `todayRunWords` says the freed time's sentence and the done line's "took it";
  `runApprovalRefusal` reads `offered_start` against the lead and now.
- **The subscriber's name** (`shared/enums.ts`): `EVENT_SUBSCRIBERS` gains `freed_time_offer`; `EVENT_KINDS` unchanged.
- **The journey guide** (`journey/journey-guide.ts`): the row on no stage.
- **The lifecycle** (`playbooks/lifecycle/lifecycle-ledger.ts`): `offFreedTimeRow` under Lists & offers where the moment
  is offered and none stands.
- **The news** (`notices/visit-news.ts`): `visitChangeNews` takes the offer's count and says the clause.
- **The settings sheet's words** (`sequences/sequence-words.ts`): "People per freed time", "Up to N days ahead".

### 3. Core and jobs

- **The run** (`core/campaigns/run-playbook.ts`): a run with a freed time skips `alreadyRan`, resolves the list
  `asked_never_booked` as a saved moment does, orders by last contact, caps, keeps the freed time on the batch and the
  facts on each send, and names the batch by its time. `recipientFacts` returns `freedTimeFactsFor` for the kind.
- **The subscriber** (`core/subscribers.ts`): `freed_time_offer`, over two new ports: `appointmentOf(tenantId, id)` (the
  row's span, status, `vanished_at`, `contact_id`, `source`) and `offerFreedTime(tenantId, freed)` (the edge's: the
  running step, the run). `visit_notice` asks `freedTimeOffered(tenantId, appointmentId)` for its clause.
- **The send** (`jobs/broadcast-send.ts`): a batch with `offered_from` asks `appointmentStandingOver(tenantId, span)`
  as it claims; taken cancels through the cancel verb with reason `taken`.
- **The ports** (`jobs/handlers.ts`): the two reads and the edge's offer, beside the ports `visit_notice` has.

### 4. The edge

- **`apps/edge/lib/freed-times/offer.ts`** (new): `offerFreedTime` loads the tenant's run context
  (`loadTenantRunContext`), finds the running `slot_opened` step, and calls `runPlaybook(ctx, step, { by: { kind:
  "system" }, freed time })`. Its outcome is the run's.
- **`apps/edge/lib/playbooks.ts`:** `RunRequest.freed`, passed to core.
- **`apps/edge/api/jobs/tick.ts`** (or where the subscriber ports are built): the edge's `offerFreedTime` handed to the
  jobs' ports.

### 5. The dashboard and Ask

- **The read** (`server/readers`, `GET broadcasts`): `offered_*` and `took` on each run.
- **The settings sheet** (`surfaces/campaigns/sequences/settings-sheet.tsx`): the two rows for the kind.
- **Today** (`surfaces/today/pages/queue.tsx`, the runs' words): nothing but the words contracts gives it.
- **Ask:** the signals spot (`server/ask/tools/read/signals.ts`); the proposable triggers follow `MOMENT_TRIGGERS`;
  Ask's definitions say what a freed time is (`prompt.ts` ASK_DEFINITIONS: `freed_time`).
- **The eval case:** `tooling/evals/whatsapp-cases.json` gains the freed time's yes.

### 6. Docs

- `docs/decisions/0082-the-receptionist-fills-the-book.md` and its README row.
- `docs/glossary.md`: Freed time (a moment).
- `docs/system-prd.md` S-14.3's moments, S-20's `sequence_batches`.
- `docs/data-model.md` regenerated.

## Either deploy order

The migration goes to production before the merge. It widens one check, adds three nullable columns, one index and one
reader, re-creates two functions with the same signatures and one more field in their events, adds a per-run field the
lens reads as optional, and a subscription whose subscriber an edge from before does not know: `event_deliver` keeps a
delivery for a name it does not know as an unknown kind (`subscriberNamed`), and settles it once the edge ships.

The edge ships with no step on the moment anywhere, so nothing is offered until a workspace turns it on. A dashboard
from before the edge draws a sequence it cannot make, since the check that makes a campaign refuses a trigger the edge
does not know: the composer's refusal is the one every unknown moment gets.

## What this costs

The owner's, inside their plan. Nothing new is spent on the platform's account.

- **Per freed time, at most four messages:** a text about $0.01, a WhatsApp utility template about $0.005, an email
  about nothing. No model call to send.
- **A reply** is a receptionist turn as today, about $0.02 to $0.05 on Opus 5.5.
- **A busy workspace with ten freed times a week:** about $0.50 a week in messages.
- The WhatsApp figure is a third-party reading of Meta's per-message rates; Meta's US table was not read from here. A
  marketing template would cost $0.025 and is undeliverable to US numbers.

## What proves it

- **Contracts:**
  - `tooling/scripts/tests/freed-times/freed-time.test.mjs`: every refusal of `freedTimeOf`, a move with and without
    `was_at`, the lead hours, the window, a closure, a standing row overlapping, a slot too short; `freedTimeWords`
    today, tomorrow and a weekday, across a clock change.
  - `tooling/scripts/tests/playbooks/triggers.test.mjs` (existing file, new cases): the trigger offered only with a
    calendar, its words, its wait words, the refusal once its time passed.
  - `tooling/scripts/tests/templates/starter-templates.test.mjs`: the starter passes the check in both languages on
    three wires, and `freed_when` is a slot the fill reads.
  - `tooling/scripts/tests/today/today-queue.test.mjs`: the waiting row, the soon row, the done line with "took it",
    the taken line.
  - `tooling/scripts/tests/consent/`: `messageAboutOfTrigger("slot_opened")` is theirs; a text may carry it; an email
    needs no yes.
- **The database:** `tooling/scripts/tests/freed-times/freed-times.db.test.mjs`:
  - the check takes the trigger
  - a `moved` event says `was_at`, from the trigger and from the feed's read
  - `freed_time_taken` counts a booking inside the span after the batch, and not one before, outside, vanished or
    cancelled
  - the unique index makes a second batch for one appointment a conflict
  - `run_counts` says `took` for a freed time's run and nothing of it for others
- **Core:**
  - `tooling/scripts/tests/broadcasts/core-campaigns.test.mjs` (existing file, new cases): a run with a freed time
    resolves the list, orders by last contact, caps, keeps the freed time on the batch and `freed_when` on each send,
    holds the breath and a held thread, and names the batch by its time; `run_for` null.
  - `tooling/scripts/tests/events/a-freed-time-is-offered-from-its-event.test.mjs` (the subscriber harness): a
    cancellation by the service makes one run; a member's cancel, a row with no person, a `moved` with no `was_at`
    and a workspace with no step make none and say why; twice on one delivery, one batch.
  - `tooling/scripts/tests/broadcasts/`: the send that finds the time taken cancels with `taken` and tells once.
- **The edge:** `tooling/scripts/tests/freed-times/offer-freed-time.test.mjs` (fakes): the running step found, a paused one
  refused, the run asked with the freed time.
- **The receptionist:** `tooling/evals/whatsapp-cases.json`: a yes to a freed time takes the request for that time.
- **The dashboard:** the settings sheet's two rows; Ask's spot in `tooling/scripts/tests/ask/`.
- **The real app:** on the local stack, a made-up workspace with a calendar: cancel a booking through a notice,
  watch the batch wait on Today, approve it, read the send, answer yes as the customer, and read the request held.

## Considered and not taken

- **A new Autonomy class for freed times.** One more row on the matrix, a check widened, and words everywhere for a
  moment that is a follow-up to the person's own ask. The Follow-ups row's words widen instead; a class of its own is
  one later change if the row grows crowded.
- **Offering the time as an offer (the Win-back or Offers row).** An offer never reaches a US number on WhatsApp and
  never goes by text; the people who asked would hear nothing.
- **A link in the message.** The booking link may be absent, a slot cannot be empty, and the yes is the
  receptionist's job already: a reply opens the 24 hours in which it may say anything, and holds the request where the
  workspace takes them.
- **Watching the calendar.** The record already says each cancellation as an event, and the feed each vanished row;
  a reader of the feed beside them would be a second detector.
- **A daily run that offers freed times.** A time freed at 10:00 for 15:00 is worth offering at 10:00, not tomorrow at
  the run hour; the quiet-day moment is the daily one, and it is later.
- **Writing to everyone on the list.** Four is a wave; a slot takes one person. More is a press.

## Later

- Freed times on a quiet day (tomorrow less than half booked), from Ask's room read, at the step's run hour.
- A second wave to the quiet regulars under the Win-back row, by email: an offer, so WhatsApp to US numbers cannot
  carry it.
- "Offer it to more" on a batch whose time is still free.
- The ranking by what the person asked about, once the receptionist's intent is kept on the person.
- A freed time told to the Follow-ups row's own evidence as its own line, if the row's one line reads as two things.
