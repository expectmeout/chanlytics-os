# 0061 · A booking the receptionist asks for is held for the owner

**Status:** Decided 15 October 2026, and built on the lane `receptionist/a-booking-request` from main's `e88afd8d2`, as
migration 00443, merged in #1615 the same day. This is
the AI-native plan's item 4, "the receptionist may REQUEST a booking that an owner confirms, never confirm one itself",
which Ruben approved on 9 October 2026. **Amended 22 November 2026** (migration 00679, waiting for Ruben's word to
push): a request has a clock, and one nobody answered is told to the customer once. It reverses point 6's "Nothing is
sent to the customer by itself" and point 4's "its hold stays until a person answers", which Ruben confirmed the same
day ("Yes, confirm"); the section "A request has a clock" below says what replaced them. It is the first step of the appointment spine the second-pass engine review drew
(`Claude Video/docs/2026-10-11-chanlytics-engine-review-second-pass.md`, 4.6 and Lane 9). Ruben picked it on 15 October,
with the review's open points answered as recommended (its Part 7, item 10). The number is the next free one after 0060,
which the Sequences lane holds. Where this note and the code disagree, the code wins. The status was read again at `e9d6325f0` (26 October 2026).

## Context

When the team confirms its own bookings, a text conversation about one ends without a record of what was asked:

- **No booking link** (a business that quotes each job, or books by phone): the open times end in "take their details so
  the team can confirm one" (contracts `describeOpenings`).
- **A hold on bookings** (the Autonomy row for bookings set to Ask me first): the open times end in "a member of the team
  will call or text them to confirm". Layer two then hands the thread to a person (`policy_ask`).

In both, the owner finds a thread that needs them. To learn which slot the customer chose, and for what, they have to read
the conversation. The Calendar shows nothing, so the slot stays open to the next customer. And if the owner never
answers, nothing says a booking was left unconfirmed.

Two facts already in place make a record cheap. `appointments` already has a `proposed` status, which a booking tool's
notice writes for a request the owner confirms in the tool. A `proposed` row already takes its slot (`LIVE_STATUSES`, the
receptionist's openings and the board). And a hold already carries an act that says what a person does: reply, call back
or hand back. The call-back hold carries what to do in its details.

## Decision

1. **A workspace switch, off by default:** "Booking requests" (`features.booking_requests`), in Settings › Business, in
   the booking tool's fold, beside what the business books with. While it is off, nothing changes: the model is sent
   exactly the answer's record it always was, and keeps exactly the record it kept. (Since 18 October 2026 the switch
   is no control of its own: Hours & booking asks once "When someone wants to book", and "It offers times, you confirm"
   writes it with the booking row, contracts `business-tab/choices.ts`.)
2. **When the receptionist may ask.** On a text channel (WhatsApp or SMS), where the team confirms (no booking link offered
   in chat, or the booking row set to Ask me first), with the switch on and the calendar read. When the customer picks a
   time, the receptionist writes two fields beside its reply:
   - `booking_slot`: the start as `YYYY-MM-DD HH:MM` on the business's clock, taken from the open times it was given;
   - `booking_service`: the service, as the business lists it.

   Both are empty otherwise, and the two fields are in the answer's schema only on a turn that takes requests. Its words
   say the team will confirm. It never confirms a slot itself, and a handoff the model flags on a time the code finds open is the request's: the model flags every picked time for a person whatever it is told (the evals of 15 October 2026), and a request already hands the thread to a person. The phone is not part of this step.

3. **Code decides whether it is a request, never the model.** The slot counts only if it is a real time on the
   business's clock (a day and a clock time that exist: not the 30th of February, not an hour the spring skips), starts
   inside one of the open windows read when the customer picked it (their own open request aside), and the window from
   that start runs as long as the service takes (or the business's slot length). The service counts only if the business
   lists it, in any case and spacing, or is empty. And the words that said the team will confirm must have gone as the
   model wrote them: a hold layer two placed for something else (a price, money, the model's own handoff) stands.
   - Anything else records nothing. The turn becomes a person's to answer with a new reason, `booking_reply` ("Asked to
     book a time — reply to them", its act `reply`), so "the team will confirm" stays true. A thread a booking set to Ask
     me first already holds keeps that hold (`policy_ask`).
   - A second request from the same person replaces their open one: one open request per person (a unique index). A
     person has one thread in a workspace, so the thread's hold is said again, never twice.
4. **The record:** one `appointments` row with `status = 'proposed'` and `source = 'receptionist'`, carrying:
   - the person (`contact_id`, and their name and number as the row's client);
   - the slot and the service;
   - an expiry (`expires_at`): the sooner of 23 hours after it was asked and one hour before the slot. (24 hours until
     22 November 2026: at 24 the message that tells the customer could not go, since WhatsApp carries a free reply only
     within 24 hours of their last message.)

   It takes its slot until it is answered or expires, so the receptionist never offers that time to anyone else. Past its
   expiry it takes nothing and leaves the board (filtered where the record is read, not by a sweep). Booked, it no longer
   expires. Until 22 November 2026 its hold then stayed until a person answered; since then its clock closes it ("A
   request has a clock", below).

5. **The hold:** one escalation, reason `booking_request`, whose act is `confirm`, with the request's row in its details.
   - Today's queue says it under the person's name ("Asked for Sat, Oct 18, 2:00 PM · Balayage") with two buttons,
     **Booked it** and **Can't**, and so do the Inbox's thread and the Calendar's visit (Can't in its More).
   - The badge, the bell and the deadman count it once, as every hold is counted.
   - It is opened in the same statement as the row (a door, below), so neither is ever there without the other.
6. **What the owner's answer does:**
   - **Booked it** books the row (`booked`, by the member), hands the thread back to the receptionist through the
     hand-back door (`conversation_hand_back`, 00386), which resolves the hold, and puts a reply drafted from the row's
     words ("You're booked for Saturday, October 18 at 2:00 PM for a Balayage.") in the thread's box for the owner to
     send: from Today and the Calendar it opens the thread with the words carried in.
   - **Can't** cancels the row and leaves the thread waiting on them: the hold's reason becomes `booking_reply` (its act
     `reply`), its line "Could not book Sat, Oct 18, 2:00 PM · Balayage: reply to them", so it reads "Reply" until someone
     answers the customer.
   - Past its expiry, Booked it is refused: the request took no slot after it, so its time may have gone to someone
     else. Can't still answers it, and the owner replies with what is open now.
   - Nothing confirms a booking to the customer by itself: an automatic confirmation is the spine's step 2, off by
     default, and not built here. (Until 22 November 2026 this read "Nothing is sent to the customer by itself". One
     message now is: that a time nobody confirmed could not be confirmed, below.)
7. **The board** draws a request as "Requested", and its visit's sheet leads with Booked it and says "Requested by text ·
   Booked it or Can't"; Can't stands in More where a visit's cancel would. Answered, it is on no calendar, so its foot
   says so: "Booked by text · change it with them in their thread", or "Asked for by text · you couldn't take it". The
   Business tab's limit row says it still never books by itself, and where a picked time waits.
8. **Two doors for a request while it waits, and the code calls only these** (its clock's are in the next section):
   - `booking_request_open`, service role only: opens the row and the hold in one transaction and replaces the person's
     earlier open request. A slot an hour away or less is refused (`too_soon`), and the edge then holds the thread for a
     reply (`booking_reply`), as it does when the door fails.
   - `booking_request_answer`, a member's (an operator or above, as a visit's word is), through one route,
     `POST conversations/:id/booking-request`: books or cancels, writes the decision as the member's
     (`answer_booking_request`, and the hand-back's `hand_back`), and resolves the hold or turns it into a reply.

   The record's own trigger says each move as `appointment.changed`: `added`, then `confirmed` or `cancelled`.

## A request has a clock (amended 22 November 2026)

A customer who picked a time was told "the team will confirm", and if the owner never answered, nothing happened at the
end: the time was freed, the owner's card stayed open for ever, and the customer was never told. It was the one gap on
every road a person arrives by (`Claude Video/docs/2026-11-22-journeys.md`, section 5). The plan is
`Claude Video/docs/2026-11-12-lapsed-booking-plan.md`, which Ruben said to build whole on 12 November 2026; its facts
were read again against main at `133c654ae4`.

1. **The owner is nudged once before it runs out.** Two hours before `expires_at`, for a request that lives longer than
   four hours (a shorter one would be nudged on top of the first alert, or of the watchdog's "still waiting" two hours
   in): the bell, the phones and the mail, saying who waits, for what time, and when it stops being held. Told once per
   request (`appointments.nudged_at`, stamped only once the nudge was delivered).
2. **When it runs out, AI tells the customer once, in their language.** It says the time could not be confirmed, offers
   what is open now, confirms nothing and says nothing of when the team will answer. The words are AI's own, through the
   one writer of a reply (decision 0093), so they are in the language the customer writes in, and the writer's checks
   hold them: no price it was not given, no promise of a follow-up by a time.
3. **Not where a person may have it in hand, or the business said no.** Nothing is sent when a person typed a reply
   since the customer asked, the customer asked to stop, a person or a call holds the conversation, the workspace is
   paused, the reply setting in force does not let AI speak by itself (Asks you, Stays quiet, or any mode while
   everything is stopped: decision 0139), the conversation is not on WhatsApp or a text, WhatsApp's reply window has
   closed, it is more than two hours after the request ran out, or AI had no words. One rule says which (core
   `lapseHoldOf`, contracts `LAPSE_HOLDS`), asked before the model is, so words that cannot go are never written.
4. **It follows the workspace's reply setting, as every reply does.** Under Auto it goes at once; where replies are held
   for a Stop it waits that window, and the owner may stop it. It leaves through the one send door, which reads the
   customer's consent, the stop and whether a person spoke since once more at the wire, and it never leaves more than
   two hours after the request ran out (`stale_after`).
5. **The conversation goes back to AI and the request closes as not confirmed in time.** The request is cancelled with
   `lapsed_at` and `lapse_told`; its hold is resolved as the platform's own close (nobody's decision, as a thread set
   aside is closed); the conversation is open, with no pause. If the customer picks another time, that is a new request,
   and its owner is alerted again from the start. The record says `appointment.changed` with `lapsed`, never
   `cancelled`: nobody cancelled, so no freed time is offered on it (decision 0082).
6. **The owner gets one note.** Where the customer was told: a line on the bell, "Ana Ruiz's time wasn't confirmed",
   opening the conversation, told once from the record's event. Activity says it in a line either way
   (`appointment.lapsed`), and the visit's sheet says "Asked for by text · not confirmed in time".
7. **Where the message cannot go, the card becomes "reply to them", as Can't leaves it.** The request closes the same,
   and its hold takes the reason `booking_reply` with "Sat, Oct 18, 2:00 PM · Balayage wasn't confirmed in time: reply to
   them". The hold's own change tells the owner (decision 0043) and asks for the reply's draft (decision 0093), so a
   draft is there wherever a reply can still go.
8. **One clock, one job, one door.**
   - The watchdog's tick (every ten minutes) reads what is due, last and on its own
     (`apps/edge/lib/receptionist/request-clock.ts`, `booking_requests_due`): it nudges, and it hands each request that
     ran out to the ledger. A model is never asked inside the watchdog's minute. The plan put the model's call in the
     tick; the ledger holds it instead, since the tick's sixty seconds are the watchdog's and a busy hour's run-outs
     would not fit in what it leaves.
   - The job `booking_lapse`, one a request, in the reply lane: core's `settleLapsedRequest` reads the request and its
     conversation, asks the rule, asks AI, and calls the door. A writer that throws is asked again; the last try, and a
     run the ledger gave up on, close the request for a person.
   - The door `booking_request_lapse`, the service role's, in one transaction under the request's lock: the message is
     queued with its send job in the statement that closes the request (`queue_send`), so neither happens without the
     other, and a second run finds the request closed and sends nothing.
9. **Requests that had already run out are left alone.** They are stamped in the statement that adds `lapsed_at`, so the
   clock never takes them up: nobody hears about a request from weeks ago.

Not built with it: a time asked for on a call (the phone is still not part of this), a request taken by Instagram DM
(it closes for a person, since its address is not a number), and a setting to turn the message off (booking requests on
already means "it offers times, you confirm").

Tests: `tests/calendar/booking-requests/a-request-nobody-answered-is-told.test.mjs` (the rule and the verb),
`tests/calendar/booking-requests/a-run-out-s-job-reads-the-rows.test.mjs` (the job over the rows), `tests/cron/a-request-has-a-clock.test.mjs` and
`tests/cron/cron-deadman-door.test.mjs` (the tick's step), `tests/events/a-time-that-ran-out-is-told-once.test.mjs` (the
note, Activity's line), and on a database in CI `tests/calendar/booking-requests/a-request-that-runs-out.db.test.mjs`.

Deploy order: the migration first. The edge before it calls none of the new functions; the edge after it, met before
the migration, logs that it could not read what is due (`booking_request_clock_failed`) and does nothing.

## Not now

- An automatic confirmation to the customer (spine step 2).
- The phone: the call agent's own request.
- A later booking for the same person on the same day closing the request. Today the owner's Booked it closes it.
- Notice-only appointment moments, the review ask and rebooking (spine steps 3 to 5).

## Risks

- **A wrong slot read as right.** The model writes a time; code checks it against the windows it was shown. A time that is
  free but is not what the customer meant can still pass. The request is never a booking: the owner reads it beside the
  conversation before pressing Booked it.
- **An owner who never answers.** The deadman's "Still waiting" says so after two hours, as for any hold; the owner is
  nudged two hours before the request runs out; and when it does, after at most 23 hours, the customer is told and the
  request is closed (amended 22 November 2026: until then it expired off the board and its hold stayed open).
- **A message the owner did not write.** The one message goes in the business's name with nobody having read it. It
  says only that a time could not be confirmed and what is open, it follows the workspace's reply setting, and an owner
  on Asks you gets a draft and no send.
- **A held slot that is never confirmed.** It takes its slot for at most 23 hours, and never past one hour before it, so a
  slot is not lost to a request nobody answers.
