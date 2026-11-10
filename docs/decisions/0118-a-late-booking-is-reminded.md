# 0118 · A late booking is reminded

**Status:** Accepted by Ruben, 9 November 2026 ("Yes, plan it"), and built on his word of the same day ("Yes, start stage 1"). The first of five stages of "one timeline per person" (the plan is outside this repository, `docs/2026-11-09-sequences-timeline-build-plan.md`). Migration 00580, one row, applied after the build is live.

## Context

The appointment reminder looks once a day, at its hour, for tomorrow's visits (`sequence_steps_due`, contracts `runDueNow`). One batch a step a day is the rule in storage (`sequence_batches_step_run`), and the look stamps the day whether it found anyone or not (`stampStepRun`).

So a customer who books at three in the afternoon for nine the next morning was reminded by nobody: today's look was at ten, and tomorrow's looks at the day after. Read on written code against main at `6bf8296cba`; nothing in a customer's thread or the owner's day said it had not gone.

A second look in the day was not open: the day's batch holds the key, and a second batch on it is refused.

## Decision

1. **The booking asks for its own reminder.** The subscriber `visit_reminder` (core `events/subscribers.ts`, the bulk lane, beside `visit_notice` and `freed_time_offer`) reads `appointment.changed`, and for a change that leaves an appointment standing (added, confirmed, moved) hands its id to the edge's door (`apps/edge/lib/campaigns/late-reminder.ts`). A cancellation asks nothing.
2. **One rule says whether it is late, and when its reminder goes** (contracts `lateReminderAt`). A booking the day's look will still name gets nothing extra. One it can no longer name goes at 8:00 PM the evening before; at once when that has just passed; else at the reminder's hour on the morning of the visit, where that leaves two hours (`LATE_REMINDER_NOTICE_MS`). Booked today for today, or at night for the next morning, it gets nothing: they booked hours ago.
3. **It is the reminder's own run, for one person.** The door runs the workspace's running step on `visit_tomorrow` through `runPlaybook` with `late`: the same message, the same consent, the same channels, the same week's rules, and the mode its owner chose. Any other step refuses a late booking (`not_a_reminder_step`).
4. **Its batch has no day.** The day's batch holds `(step_id, run_for)`, so a late reminder's keeps none, as a freed time's does (0082), and its name says the visit ("Appointment reminder · Tue, Nov 10, 9:00 AM"). Its record says `late`, and the edge never stamps the day for it: a late reminder must never close the day for everyone else.
5. **Once a visit.** Before it runs, the door asks whether a reminder already stands for that person and that start (`findReminderOfVisit`: queued or sent, in the day's batch or a late one). The event is delivered at least once; the second delivery answers `already`. A reminder its owner stopped, or the sweep skipped for want of an OK, is still the visit's reminder, so a later word about the same booking never makes another; a batch that failed holds none. The send asks the appointment's row again (`appointmentHolds`, decision 0002), so one that moved or was cancelled since is never reminded of the old time.
6. **One that waits for an OK ends by its own facts.** Under a sequence that asks, the batch waits. Its audience keeps the visit's start and the day its words were written for (`Audience.late`), and the one predicate (contracts `runApprovalRefusal`) refuses an approval that would send it on a later day than its words name, or after the visit began. Its words are those of the moment it was to go, never of the night it was made. The hourly sweep reads these batches on their own (`listWaitingPlaybookRuns`), ends each that is too late, and tells the owner nothing later sends it (`lateReminderSkippedNotice`).
7. **Every booking says what came of it, in one line** (`late_booking_reminded`, `late_booking_not_reminded` with why). A door that could not be asked throws, so the delivery is tried again.

## What it does not do

- **It reads everyone in People for one reminder** (`loadTenantRunContext`). The door asks nothing of the workspace until the rule says the booking is late and no reminder stands, so the cost falls on late bookings alone. Stage 4 of the plan replaces the read.
- **A waiting late reminder says "before 21:00".** Its row and its notice use the visit's sentence (`batchWaitWords`). For one made at night for the next morning, the wait can end sooner, when the appointment begins; the verb's refusal then says why, and the sweep ends it within the hour.
- **Reports and the Sequences list judge a waiting run by its day alone.** Their reads keep a run's moment and not its audience (`reports/campaigns/record.ts`, `sequence_overview`'s waiting batches), as for a freed time. A late reminder past its time is counted as waiting there until the sweep ends it, within the hour; Today's row, the sheet and the verb read the audience and say it is too late at once.
- **"Once a visit" is asked, not held by the database.** A batch is given a random id when it is made, so two deliveries about one booking that ran in the same second could both find no reminder and each make one. The ledger runs a tick's jobs one after another, so it takes two ticks at once and two events at once. Stage 2's key per person and occasion closes it.
- **A booking inside the seconds the day's look runs can be missed by both.** The look reads the calendar, then stamps the day; a booking written and delivered between the two is not in the look's read and not yet late by the rule. Stage 2 times each reminder from its booking and retires the look for reminders, which closes it.
- **A reminder under way is not moved.** A visit moved after its late reminder was planned is held at the send (`appointmentHolds`), and the move's own event asks again for the new time.

## Deploy order

The build first, then the row. A build that does not know the subscriber's name must never be handed its deliveries: it would keep and alarm each as an unknown kind (00456). Until the row is in, nothing new is delivered and the reminder behaves as it did.

## Held by

`tests/campaigns/late-reminders/`: `when-it-goes.test.mjs` (the rule), `one-person-and-no-day.test.mjs` (the run), `a-waiting-one-ends.test.mjs` (the wait) and `remind-late-booking.test.mjs` (the door, over a database in memory); `tests/events/a-late-booking-is-reminded.test.mjs` (the subscriber) and `tests/cron/cron-playbooks-door.test.mjs` (the sweep).
