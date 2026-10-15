# A booking the receptionist asks for is held for the owner: Booked it or Can't (0061, 00443)

Decision 0061, the AI-native plan's item 4 (approved 9 October 2026; picked 15 October 2026 with the engine review's open points answered as recommended).

## What changes for a customer

Nothing, until an owner switches **Booking requests** on (Settings › Business, the booking tool's fold). Off, the receptionist is sent exactly the answer's record it always was and keeps exactly the record it kept.

Switched on, and only where the team confirms its own bookings (no booking link offered in chat, or bookings set to Ask me first):

- When a customer picks one of the open times by text, the receptionist writes the time and the service beside its reply, and says the team will confirm.
- **Code decides whether it is a request, never the model.** The time must exist on the business's clock (not the 30th of February, not an hour the spring skips). It must start inside a window read when the customer picked it (their own open request aside), and the window must hold the whole service. The service must be one the business lists.
- Otherwise the thread is a person's to answer under a new reason, `booking_reply` ("Asked to book a time — reply to them"), so "the team will confirm" stays true.
- A request is a `proposed` appointment (source `receptionist`) that takes its slot, plus the thread's hold (`booking_request`), opened together by one door.
  - It expires at whichever comes first: a day after it was asked, or an hour before the slot. Past that it takes nothing and leaves the board; its hold stays.
  - One open request per person.
- The owner answers on **Today**, in the **Inbox** thread, or on the **Calendar** visit (Can't is in More):
  - **Booked it** books the time, hands the thread back to the receptionist (which resolves the hold), and puts "You're booked for Saturday, October 17 at 2:00 PM for a Balayage." in the reply box for the owner to send.
  - **Can't** cancels it and leaves the thread waiting on a reply (`booking_reply`).
  - Past its expiry, Booked it is refused: its time may have gone to someone else. Can't still answers it.
  - Nothing is sent to the customer by itself.
- Answered, the visit's sheet says where it came from ("Booked by text · change it with them in their thread", or "Asked for by text · you couldn't take it"), never "on your calendar". The Business tab's limit row says the receptionist still never books by itself.

## What is in it

- **Migration 00443:**
  - `appointments` gains `expires_at` and `conversation_id` (its key names the workspace too, `(tenant_id, conversation_id)`, as 00279 holds every key between workspace tables), takes source `receptionist`, and gets the unique index `appointments_request_one`.
  - `escalations` gains `booking_request` and `booking_reply`; `decisions` gains `answer_booking_request` (main's Sequence verbs kept).
  - `booking_request_open` is the service role's door.
  - `booking_request_answer` is a member's door. On Booked it, it calls `conversation_hand_back`; past the expiry it refuses Booked it (`expired`).
- **contracts:**
  - `calendar/visit/booking-request.ts`: the rule (`requestedBookingOf`, `takesBookingRequests`), the words, and the refusals.
  - `brainOutputSchemaFor`, the switch, the hold's act `confirm`, and the verb spec `booking_request`.
  - A request's block and its sheet, and Today's row.
- **core:**
  - Optional ports `calendar.requests` and `sink.request`.
  - The gate in `modelTurn`; dispatch opens the turn's hold through `turnHold`.
- **edge:**
  - The brain sends the two fields only on a turn that takes requests.
  - `takesRequests` and `requestTermsFor`; the sink's `requestOpened` falls back to `booking_reply` when the slot is too soon or the door fails.
  - The eval door now mirrors the live turn (the open times, and the two fields where requests are taken), and the judge checks `expect.booking`. One provisional case.
- **db:**
  - `openBookingRequest`, `answerBookingRequest` and `openRequestOfThread`.
  - Expired requests are filtered where the record is read (`unexpired`).
- **dashboard:**
  - Route `POST conversations/[id]/booking-request` (operator, `thread_state`), committed through `commitVerb`.
  - Today's row, the Inbox thread's two buttons, the Calendar sheet, and the Settings switch.
  - Rows added to the refresh map, `route-policy.json`, the typed client, `docs/api.md` and the reach golden.
- **Ratchets:** `appointments` writers rise from 4 to 6, argued under Rises in `docs/debt.md`. `evaluateCases` and `pgSink` stay under their baselines (the falls are banked).

## Also in it

- **Main's red, fixed:** seven Business-tab tests still expected the words #1613 changed ("an appointment" → "a booking"). #1613's picker never ran them; they now say main's words.

## Before merging

Apply 00443 to production with `supabase db push --linked --yes` after the dry run lists exactly 00443 and `migration-push.mjs` passes. Read it back, then merge.

**Deploy order:** the migration first, then either app. The board's reads name `expires_at`.

## Tested

- New suites:
  - `calendar/booking-requests/a-picked-time-is-held-for-the-owner` (10): the rule, the switch, the schema, the parse, the open times, the words, the executed WhatsApp turn, and the edge's sink.
  - `…/a-request-is-answered-through-one-door` (3).
  - `…/the-owner-answers-a-request.db` (7, on a throwaway stack with every migration).
  - `today-record/a-time-picked-by-text-is-answered-in-the-queue` (3).
  - A new case in `calendar/calendar-panel`, and the switch in `business-tab-folds`.
- `sequences/sequence-doors.db` passes with 00443 on top.
- `check:local` before the push.

Bundle: Booked it and Can't on Today, the Inbox thread and the Calendar visit, and the Settings switch (decision 0061).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
