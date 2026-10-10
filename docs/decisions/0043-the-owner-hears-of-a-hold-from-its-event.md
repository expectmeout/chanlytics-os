# 0043 · The owner hears of a hold from its event

**Status:** Decided on 10 October 2026 (Ruben: "review and go with the best suggestions for chanlytics"), as recommended
here. Steps 1 to 3 are built (00393, `owner_notice`); step 4 moved to 0044 and is built with its due rows. Phase 3's
first real subscriber in 0031's order (its review of 9 October). Written against commit
`ef0aea36a` (main, 10 October 2026). Where this note and the code disagree, the code wins.

## Context

A thread is handed to a person by one door since 00388: `escalation_open`, through `upsertEscalation`
(`packages/jobs/src/escalate.ts`), writes the hold and `escalation.opened` in one transaction, or replaces an open hold's
reason (`escalations_note_change` writes `escalation.changed`), or moves its words (`refreshed`, no event). Twenty-five
places decide a hold. How the owner hears of one is still decided at each of them:

- **The text receptionist** pairs each of its fifteen holds (`packages/core/src/inbound`: `gates.ts`, `reply-gates.ts`,
  `dispatch.ts`, `unreadable.ts`) with a `tell(...)`, which reaches `alertStaff` and the edge's `notify` as a `handoff`
  notice: the customer's words, the receptionist's reply, the channel and number. On WhatsApp it runs inside Meta's
  request, before the 200, unless the workspace answers as jobs (`WHATSAPP_ANSWERS_AS_JOBS`). The mail goes beside the
  hold's write (`Promise.all`), so it goes even when the write failed; and about eleven of the fifteen mail on every
  message, though `escalate.ts` says a caller alerts once per hold.
- **A send that failed** (`send.ts`, `late-failure.ts`) tells once per hold, through `alertFor`; inside Meta's and
  Twilio's status requests for a late one.
- **An email** (`email-ingest.ts`) tells on `opened` and `changed` only, in its job.
- **A turn that never finished** (`unfinished.ts`) tells once, from the deadman tick.
- **A call** that asks for a callback or breaks a price rule holds the thread and tells nothing itself: the owner hears
  through the call's own summary (`callNotice`, once per call, inside Retell's request), which an owner may switch off.
- **A delivery receipt** that says a send failed (`email-receipts.ts`) holds the thread and tells no one; the Inbox and
  the deadman, two hours later, are all.

Where a notice goes is one policy since 0040: the bell row always, email by `emailsFor` (`handoff` and `deadman` are
always emailed), each member's phone by `push_off` (00372). That half is settled; when and from where is not.

## Decision

The owner hears of a hold from the hold's event, once, after the commit.

1. **One subscriber, `owner_notice`,** on `escalation.opened` and `escalation.changed`, in lane 0. It reads what the
   notice says from the rows: the hold's reason in words (one map in contracts, beside `handoffMessage`, which moves
   there), its details, the customer's last message in the thread, the receptionist's last reply, the person's name and
   number, and the hours the thread is paused when this hold paused it. It sends through the same path as today: the
   bell row, the email `emailsFor` allows, the phones `push_off` allows.
2. **Once per hold.** A hold opened, or an open one taking another reason, is told. A message that repeats the same hold
   tells nobody again: the Inbox's "Needs you" holds it, and the deadman tells at two hours. This is the one thing an
   owner receives less of, on purpose: eleven branches mailed every message of a thread already waiting.
3. **A hold that could not be written is still told,** from where it was decided: the direct `tell` stays only for a
   write that failed (`failed`, or no answer), so a database that refuses the hold never silences it.
4. **Every hold is told alike.** A call's callback and price rule, and a receipt's failed send, get the `handoff` notice
   the text receptionist's holds get; the call's own summary stays as it is.
5. **Once, however often it is delivered.** The notice keeps the event it answers (`notifications.source_event`,
   unique): a second delivery, a re-drive, or an old edge that already told finds it and sends nothing.
6. **Nobody erased is named.** A person erased, or being erased, is told of as a thread, never by name or words.
7. **The platform's copy says what the hold is.** `JobNews` takes a `redactedBody`, so a workspace with no address sends
   the platform a line about a person waiting, not "a reply could not be delivered".
8. **The deadman becomes a due row.** The subscriber schedules the hold's two-hour check as a job at the hold's time
   plus two hours, which tells only if the hold is still open; the deadman clock retires (0031, invariant 6).

## Not decided here

- Assigning a hold to one member, and telling that member alone: 0003 step 5.
- The bell's own rows for kinds other than `handoff` and `deadman`.

## Steps

Each step works whichever app deploys first.

1. **Words and the record.** The reason-to-words map and `handoffMessage` in contracts; `JobNews.redactedBody`;
   `notifications.source_event`, a unique column, in a migration. Nothing reads them yet.
2. **The subscriber.** `owner_notice` in `EVENT_SUBSCRIBERS` and `SUBSCRIBERS`, its ports in `packages/jobs`, the
   double-delivery harness's case. Built with step 1 in 00393, which subscribes it at once: an old edge still tells
   inline, and the subscriber finds that notice (a `handoff` about the thread since a minute before the hold, the
   `holdTold` read) and sends nothing, so either deploy order tells once.
3. **The doors stop telling.** The fifteen `tell` calls and the send-failed paths keep only the failed-write branch;
   `polish.test.mjs`'s count of `alertStaff` calls moves with them. Built: `tell` takes the hold's write and tells
   only when it answered `failed` or nothing; `raiseSendFailed` and the unfinished turn's two holds do the same, and a
   late failure throws instead, so the provider says it again. An email's hold (`email_review`) is the one exception
   to step 4: it is told where it is taken in, by the intake in its job, naming the sender and the subject, by its
   reading for a reach-out's reply, or by the failure notice of a job that died taking it in, and the subscriber leaves
   it to them rather than race the intake's bell.
4. **The deadman's due row.** A `hold_check` job kind with its handler, caller, CHECK and lane in one change; the
   deadman clock leaves the event-shaped baseline. Moved to 0044 (10 October 2026): its due rows are one shape for every
   wait a write already knows the time of, and a hold's two hours are one more. The clock stays either way, since it
   also finds a turn that never finished and a reply nothing was sending, which no write schedules.

## Tests

- The subscriber over a database in memory: each reason, opened and changed, a refreshed hold that is not an event, an
  erased person, a second delivery, an old edge's notice already there.
- On a real Postgres: a hold opened through `escalation_open` reaches the notice through the relay, once.
- The double-delivery harness: two runs of one delivery leave one notice.

## Risks

- **A notice seconds later.** It moves from inside Meta's request to the relay and a lane-0 job: seconds, and out of a
  request that a slow mail and a slow model turn together could cut at the function's limit.
- **A reply row written after the event.** The subscriber reads the thread's last rows when it runs; a reply written in
  the same turn after the hold is read as the thread has it then.
