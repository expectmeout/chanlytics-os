# 0119 · An occasion enrols a person

**Status:** Accepted by Ruben, 9 November 2026 ("continue next stages end to end"), and built on his word of the same day. The second of five stages of "one timeline per person" (the plan is outside this repository, `docs/2026-11-09-sequences-timeline-build-plan.md`). Written against main at `c2ee98232f`. Built with no check run, on his word for that turn ("without lints or checks"), then checked the same night: the typecheck is clean and the node tests of what it changed pass. The lint, the debt and the database suites are still owed before it lands.

## Context

A moment runs once a day, at its hour, for whoever that day's look names (`sequence_steps_due`, one batch a step a day). Three things a business owes a customer cannot be said that way, and no sequence could send them:

- **A reminder two hours before a visit.** The only reminder is the day before. A person who books for this afternoon gets none, and nobody is reminded on the day.
- **A word after a visit marked missed.** A member marks it, and nothing follows: no "pick another time".
- **A follow-up the day after someone is sent the booking link and does not book.** The receptionist sends the link, the person goes quiet, and the ask is lost.

Each is owed to one person, for one thing that happened to them, at a time of their own. Decision 0118 gave one such case (a late booking) a batch with no day, asked for by its event. This makes that the rule for a kind of moment.

## Decision

1. **A fourth kind of moment: `occasion`.** Three triggers, `visit_soon`, `visit_missed` and `asked_no_booking` (contracts `triggers/kinds.ts`, `triggers/occasions.ts`). A sequence starts on one as it starts on any moment: the composer offers them where a calendar is connected (`momentReadsCalendar`), and its first step holds the message. The hourly sweep never runs one (`sequence_steps_due` leaves them out), and Run now refuses one ("It goes to each person at their own time, never by hand").
2. **What happened is kept once, in `sequence_occasions`** (00598): one row per sequence, person and occasion, unique for good whatever became of it. The occasion is a key of ids the edge makes (contracts `occasions.ts`): an appointment at one start (`visit:<id>:<minute>`), an appointment marked missed (`missed:<id>`), the message that carried the link (`ask:<id>`). A second word about the same thing makes no second message, and one its owner stopped stays stopped. The row holds when its step is due (`due_at`, which never moves), when it is next tried (`try_at`), and what became of it: waiting, ran with its batch, or left with why.
3. **An event enrols.** The subscriber `occasion_enrol` (core `events/subscribers.ts`, the bulk lane) reads `appointment.changed` and `booking_link.sent` and hands each to the edge's door (`apps/edge/lib/campaigns/occasions/enrol.ts`), which reads the record as it stands now, whatever the event said:
   - _Booked:_ each running sequence on `visit_soon` takes the person in for this start, due two hours before it (contracts `visitSoonAt`). A start the visit had before leaves (`moved`). A visit whose two-hours-before falls outside the sending hours gets no second reminder where a day-before reminder runs (0118 already reaches them the day or the evening before); where none runs, it goes at 8:00 PM the evening before. Booked inside the two hours: nothing.
   - _Marked missed:_ each sequence on `visit_missed` takes them in, due ten minutes on (`missedFollowUpAt`), so a slip of the finger can be taken back and nothing is sent. Marked more than three days after the visit, nobody is enrolled: that is tidying the record.
   - _Cancelled, gone from the calendar, or kept:_ what waited for the visit leaves. A Missed taken back takes its message out.
   - _The booking link sent:_ each sequence on `asked_no_booking` takes the person in for the next day at the sequence's hour (`askFollowUpAt`), unless they hold a visit ahead or booked since, or the message was a campaign's own (a template, the system's words, or a send a sequence's batch names): a follow-up that carries the link is not someone asking. One at a time, and none within seven days of the last in the same sequence (`ASK_REST_DAYS`), which is what keeps a follow-up's own link from starting the next.
4. **The sequences' clock hands out what is due, each minute** (00599: `trigger_sequences_clock` calls `sequence_occasions_hand_out`, decision 0115's shape). One job of kind `sequence_occasions` for each workspace with a row to try, none where one already waits or runs, spread over twenty seconds. No call to the edge, and no new sweep.
5. **The job runs each due person's step, or leaves it** (`apps/edge/lib/campaigns/occasions/due.ts`), and the row says which:
   - _Left_ where its sequence, its step or the workspace was off when its time came (the read answers such rows too, so none waits on a sequence that is off); where it was found more than a day late (`OCCASION_LATE_MS`); where what it was for no longer holds, by the one reading (contracts `occasionGone`: the visit gone, moved or begun; no longer marked missed; they booked); or where the run reached nobody or was off.
   - _Ran_ through `runPlaybook` with `occasion` (core `run-playbook.ts`, `run-batch.ts`): the same message, consent and channels, and the mode its owner chose. It names its one person and keeps no cap, no gap and no week's breath (contracts `playbookRunReach`): the message is owed for what happened, once. Its batch has no day, as 0082's and 0118's; its name says the visit; its record says `occasion`, and the edge never stamps a day for it.
   - _Put off_ ten minutes at a time while a step's words are new and its first batch waits for the owner's OK, so the people behind it do not each become an approval of their own; and after a run that failed. A day of that ends it, since `due_at` never moves.
6. **The visit's words come off the record.** The run takes the appointment's row (`OccasionRun.visit`), not the calendar's feed: "today at 2:00 PM" for one ahead, the day for one behind (`visitFactsFor` by `visitSideOf`). The send asks the row again as every visit's message does (`appointmentHolds`): by the calendar event's own key where it has one, so the feed is asked too, else by the row's id. A missed visit's message is held to the row still saying missed (`visit_was`).
7. **The job reads the workspace narrow** (`loadOccasionRunContext`): the rows of the people due, the zone, the number and the channels. Not everyone in People, not a year of touches, not the calendar. At fifty thousand people a minute's job reads a handful of rows. This is stage 4's change, made here for this path because it runs every minute.
8. **A batch that waits ends by its own facts.** One about a visit keeps that visit in its audience (`Audience.late`, as 0118's; `behind` where the visit had begun when the words were written). The one predicate (`runApprovalRefusal`) refuses a two-hour reminder once its visit has begun, and a missed visit's message once the day its words name has passed; the hourly sweep ends each and tells the owner in the occasion's own sentence. An ask's follow-up names no day and waits until answered. Three wait rules say so (`soon_ask`, `visit_ask`, `occasion_ask`).
9. **The pages say who is next.** A sequence's row carries `coming` (the first person waiting and how many wait), so the Sequences list, the record's Steps and its History say "next today 2:00 PM · first of 5 people". A person's page lists the sequence from the moment they are enrolled, with the hour: "step 1 · next today 2:00 PM".
10. **Every enrolment and every row left says so, in one line** (`occasion_enrolled`, `occasion_left` with why, `occasion_run_failed`, `sequence_occasions_ran` with the job's counts). A workspace with no sequence on these moments answers the event after one read and says nothing.

## What the written plan said, and what was built instead

- **A table of its own, not columns on `sequence_enrollments`.** The plan added an occasion and a time before the first send to enrolments. An enrolment is made by a send (`sequence_sends_move_enrollment`), and its trigger would have had to be rewritten while it runs for every sequence. A separate table leaves it untouched, keeps "served once" where an owner's Stop cannot undo it, and hands a person to the existing machinery the moment their first step goes: steps after the first follow by the day, as before.
- **The day-before reminder stays a daily look.** It was not moved to a time per person: 0118 covers the bookings the look misses, and moving it is a change to every running reminder with nothing a customer would see.
- **"Asked, never booked" starts from the link.** Whether someone asked and never booked is read at the moment it is shown, and no event says it. The booking link leaving is the event that exists, so the occasion is the link.

## What it does not do

- **The lint, the debt and the database suites have not run.** The typecheck and the node tests of what it changed have. The migrations have never been replayed: no stack runs on the machine it was written on, so CI's replay is their first.
- **The edge's two doors have no test of their own yet.** `enrol.ts` and `due.ts` are proved only through the rules they call; a test over a database in memory, as 0118's door has, is owed with the fake's four new functions.
- **`supabase/schema.sql`, `database.types.ts` and `schema-sets.generated.ts` were edited by hand, or not at all.** The types and the sets carry the new table by hand; the snapshot, `docs/data-model.md`, `docs/sql-map.md` and the migrations' ledger are owed from their generators, which need the stack CI has.
- **The Sequences list is not regrouped by what happened.** Each row says who is next; the list's groups are as they were.
- **A lead's sheet and Ask's signals do not say what is next for an occasion.** A person's page does.
- **One waiting approval at a time means the people behind it can run out of time.** While a step's words wait for their first OK, a two-hour reminder behind it is put off, and is left once its visit begins. The owner is told of the first; nothing tells them others were skipped behind it.
- **Marked missed at night, the message goes at nine.** The run moves any send outside the sending hours to the next morning, and its words then say "yesterday".
- **An occasion is not counted before it happens.** The composer shows no "N people" for these moments: nobody is in one until something happens to them.
- **Ask proposes them with no count.** Since 10 Nov 2026 (Ruben's "Yes, add them") each has a starter message (`two_hour_reminder`, `missed_visit`, `booking_follow_up`) and Ask's `propose_sequence` takes the three where a calendar is connected. Its card says who each reaches as it happens and counts nobody, and the moments read marks them `each_at_their_own_time`; Ask cannot say how many people one will reach in a week.

## Deploy order

00598 either way: it adds a table, functions and a job kind nothing calls. The build next. 00599 only once the build is live: it subscribes `occasion_enrol` and gives the clock the hand-out, and a build that knows neither would keep each delivery as an unknown kind (00456) and fail each job. Until 00599 is on, nothing is enrolled and nothing is handed out.

## Held by

`tests/campaigns/occasions/when-a-step-is-due.test.mjs` (the rules: keys, times, whether it is still owed, how a waiting batch ends), `tests/campaigns/occasions/one-person-at-their-own-time.test.mjs` (the run), `tests/events/an-occasion-enrols-its-person.test.mjs` (the subscriber). `tests/jobs/job-kinds.test.mjs`, `tests/jobs/writers/job-payloads.test.mjs` and `tests/repo/store-retired.test.mjs` name the new kind.
