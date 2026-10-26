# 0061 · A booking the receptionist asks for is held for the owner

**Status:** Decided 15 October 2026, and built on the lane `receptionist/a-booking-request` from main's `e88afd8d2`, as
migration 00443, merged in #1615 the same day. This is
the AI-native plan's item 4, "the receptionist may REQUEST a booking that an owner confirms, never confirm one itself",
which Ruben approved on 9 October 2026. It is the first step of the appointment spine the second-pass engine review drew
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
   - an expiry (`expires_at`): the sooner of 24 hours after it was asked and one hour before the slot.

   It takes its slot until it is answered or expires, so the receptionist never offers that time to anyone else. Past its
   expiry it takes nothing and leaves the board (filtered where the record is read, not by a sweep), and its hold stays
   until a person answers. Booked, it no longer expires.

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
   - Nothing is sent to the customer by itself: an automatic confirmation is the spine's step 2, off by default, and not
     built here.
7. **The board** draws a request as "Requested", and its visit's sheet leads with Booked it and says "Requested by text ·
   Booked it or Can't"; Can't stands in More where a visit's cancel would. Answered, it is on no calendar, so its foot
   says so: "Booked by text · change it with them in their thread", or "Asked for by text · you couldn't take it". The
   Business tab's limit row says it still never books by itself, and where a picked time waits.
8. **Two doors, and the code calls only these:**
   - `booking_request_open`, service role only: opens the row and the hold in one transaction and replaces the person's
     earlier open request. A slot an hour away or less is refused (`too_soon`), and the edge then holds the thread for a
     reply (`booking_reply`), as it does when the door fails.
   - `booking_request_answer`, a member's (an operator or above, as a visit's word is), through one route,
     `POST conversations/:id/booking-request`: books or cancels, writes the decision as the member's
     (`answer_booking_request`, and the hand-back's `hand_back`), and resolves the hold or turns it into a reply.

   The record's own trigger says each move as `appointment.changed`: `added`, then `confirmed` or `cancelled`.

## Not now

- An automatic confirmation to the customer (spine step 2).
- The phone: the call agent's own request.
- A later booking for the same person on the same day closing the request. Today the owner's Booked it closes it.
- Notice-only appointment moments, the review ask and rebooking (spine steps 3 to 5).

## Risks

- **A wrong slot read as right.** The model writes a time; code checks it against the windows it was shown. A time that is
  free but is not what the customer meant can still pass. The request is never a booking: the owner reads it beside the
  conversation before pressing Booked it.
- **An owner who never answers.** The request expires off the board after at most 24 hours. Its hold stays open, and the
  deadman's "Still waiting" says so after two hours, as for any hold.
- **A held slot that is never confirmed.** It takes its slot for at most 24 hours, and never past one hour before it, so a
  slot is not lost to a request nobody answers.
