# 0139 · Stop everything is one fact every way out reads

**Status:** Built in one pull request, 17 November 2026, waiting for Ruben's word to push. He asked for it in three
steps: "Start with the stop" and "Build slice b first" (13 November 2026, on the plan for Ask's operations engine, its
part 2, kept outside the repository), then to complete it end to end (17 November 2026). What still goes while
everything is stopped (rule 2) is that plan's recommendation; he has not yet said it in words. Written against main at
`8bf2938710`. One migration, 00637.

## Context

Stop everything (Settings › Autonomy, or said to AI; `apps/dashboard/src/server/ask/act/stop.ts`) paused each running
sequence through its own door, set Replies to Asks you, and kept what it paused in the workspace's settings
(`ask.stopped`) for Resume to put back. Nothing at the wire knew a stop stood. A pause that failed, a campaign already
going out, a message already queued, a post at its time and a review reply whose hold ran out all still went, while the
page said everything was paused.

Billing's pause (`tenants.status = 'paused'`) already fences every automatic send: at the send door
(`packages/core/src/deliver/deliver.ts` `refusalFor`), at the head of a campaign's batch
(`packages/core/src/messages/broadcast/stops.ts` `stoppedByBilling`), in the receptionist's posture
(`packages/core/src/inbound/reply-posture.ts`), and in the two sequence clocks (`sequence_steps_due`,
`sequence_occasions_due`). The owner's stop needed no second set of places, only a second cause at the same ones, with
its own outcome: billing's pause cancels what it meets, since nobody knows when it ends; a stop holds it, since its
owner will resume.

Two ways out had no fence of either kind: a post going up (`apps/edge/lib/instagram/post-send.ts`,
`apps/edge/lib/google/post-later.ts`) and a public reply under a Google review
(`apps/edge/lib/google/review-answers.ts`). Nothing places a call to a customer, and a lead search reaches nobody.

## Decision

1. **One fact.** `tenants.sending_stopped_at`: when the workspace's owner stopped all sending, null while nothing is
   stopped. Stop everything writes it first and Resume lifts it last, on the service role (a stop may be pressed below
   settings' own role); no session writes it. It is read by one predicate where the workspace's row is in hand (core
   `deliver/stop.ts` `sendingHoldOf`, beside billing's pause) and by one reader where a workspace is asked about (db
   `isSendingStopped`).
2. **What still goes:** a person's own reply, and the words the rules require of us (a STOP's confirmation). Everything
   else waits.
3. **The send door holds, it does not cancel** (core `stopOf`). What was going out by itself, a campaign's send or a
   sequence's message to one person, is left queued and looked at again every five minutes, so it goes once sending is
   resumed. Past its own last moment, or after a day, it is too late, as it would be with no stop. A reply somebody is
   waiting for (the receptionist's answer, its queued draft) is refused as any other refusal is: canceled with the
   reason, its words kept, the thread handed to a person. A cold email is canceled with `stopped` and its clock plans
   it again, as for billing's pause.
4. **A campaign's run waits** at its head and mid-batch (`holdForTheStop`, `giveBackFromTheDoor`): everyone on it still
   queued, nobody failed, nobody told. Billing's pause still fails a run. A run made for a day is still ended by that
   day's hours, never sent a day late.
5. **Nothing new starts.** The two sequence clocks skip a stopped workspace; its steps are due again, their day still
   open, once it is resumed.
6. **The receptionist speaks to nobody without a person** (core `effectiveReplyMode(posture, personMode, stopped)`): a
   mode that would speak alone reads as Asks you, so a customer's message is drafted for a person; Never stays Never.
   The same holds for a link a caller asks for on the phone. A ringing phone is still answered.
7. **A post due stays down.** Instagram's two steps and Google's recheck hold it in words
   (`ON_INSTAGRAM.held.stopped`), the bell says so, and it is its owner's to post again once they resume. A post never
   goes up late by itself.
8. **Nothing is said in public under the business's name** (db `doesWorkspaceAnswerOnItsOwn`): a review is neither
   drafted nor answered. A reply written and held before the stop waits too, and goes on the first sync after Resume.
9. **The press.** The stop is written, then its record at once, since the page and AI read the stop from the record: a
   press that dies after that leaves a stop the page shows and Resume lifts. Then, as clean-up, the sequences are
   paused and Replies set to wait, as before. Resume puts back what the stop paused, then lifts the stop; a lift that
   fails fails the press and keeps the record.

## What is not built

- **The clean-up stays.** Stop everything still pauses each sequence and rewrites Replies, so no page changes its
  look. With the fence in place both are redundant; removing them (one fact, nothing to put back, nothing that can
  half fail) needs Campaigns to draw a sequence held by the stop, which is a canvas first.
- **A person who starts something automatic while stopped is not refused.** It waits with the rest, at its batch's
  head. The refusal ("Everything is stopped. Resume first.") belongs with the gate every act of AI passes (the plan's
  part 1).
- **A run held by the stop shows no reason on its own page while it waits.** Its report says "everything was stopped"
  of anyone it never reached. The same canvas as the first item.
- **Lead searches already running go on.** They read; they reach nobody. What they find is not written to until
  sending is resumed.
- **Resume does not say what it let go** ("12 held messages are going now"). The plan drafted the words; nothing
  counts what is held yet.

## Deploy order

The migration first, applied to production before the merge. Then either app: every read and write of the column goes
on without it on a database the migration has not reached (db `noStopColumn`), where no stop stands.

## Tests

- `tests/messages/stop/the-door-holds-for-a-stop.test.mjs`, `tests/messages/stop/a-queued-send-waits-out-a-stop.test.mjs`:
  the door and a queued send.
- `tests/broadcasts/stop/a-run-waits-out-a-stop.test.mjs`: a run at its head and mid-batch.
- `tests/receptionist/stop/nobody-speaks-unattended-under-a-stop.test.mjs`: the mode in force.
- `tests/ask/act/stop-says-what-it-could-not-stop.test.mjs`: the press, its record, Resume, and each way they fail.
- `tests/instagram/a-post-goes-on-instagram.test.mjs`, `tests/google/a-post-goes-on-google-at-its-time.test.mjs`: a
  post held at each step.
- `tests/google/google-profile.test.mjs`: a stopped workspace answers no review on its own.
- On a database, in CI: `tests/ops/sweep-pages.db.test.mjs`, `tests/campaigns/occasions/occasion-doors.db.test.mjs`.

## Risks

- **A stop nobody remembers.** Sends wait in silence for as long as it stands. The Autonomy row says so, a held
  message gives up after a day and is handed to a person, and a post held at its time rings the bell. Nothing yet
  reminds an owner the next day that a stop still stands.
- **The hottest path reads one column more,** in the row the door already reads: no query is added to a send. A
  campaign's batch, a post and a review sync each ask once.
- **Held messages look again every five minutes,** one job a message. Only what was already queued when the stop was
  pressed can be held: the clocks hand nothing new to a stopped workspace.

## Open questions

- Whether an owner should be reminded that a stop still stands, and where (Today, or the bell).
- Whether Stop everything should also end a lead search in flight, which spends but sends nothing.
- The plan's decisions 2 and 3: the refusal of a start, and the end of the clean-up.
