# 0071 · Need you, with Ask

**Status:** Decided by Ruben on 23 October 2026 ("yes all approved end to end including any additional refinements you
see along the way"), on the canvas's merged page (https://claude.ai/artifact/DSxMfT3KXmhhGdxrFHCeg3, boards N0 to N5b,
calls E1 to E8). Built on the lane `today/need-you-with-ask` from main's `d35e72f5d`, merged in #1820 on 24 October
2026 with its migration, 00475. Where this note and the code disagree, the code wins. The status was read again at `e9d6325f0` (26 October 2026).

## Context

Today said what needs a person twice and did little about it. The queue ("Need you") listed who was waiting, each row a
door to the Inbox; under it, Ask for you printed the morning's whole markdown answer in a row's state line, then up to
three cards, often one that only repeated a queue row's button ("Next step for +1 (720) …", Approve). A reply of the
receptionist's counting down to go in the owner's name was a count with no row, then a row of Going today with Stop
alone. A send's grace (fifteen seconds on the server) was offered for the four seconds a toast lasts.

## Decision

1. **One section (E1).** Need you holds the queue's rows and Ask's: the morning's cards that are not about someone
   waiting are rows after the people (two at most, with the reviews to answer), and Ask for you is gone. Over the rows,
   one line of Ask's says what it prepared and the one thing that cannot wait (`needYouSay`); it never prints the
   morning's answer. The morning question makes no card that only answers or rings someone already waiting.
2. **Drafts ahead (E2).** Each row a reply is written for (a handoff, a closing window, a reach-out's reply) opens with
   Ask's draft in it, and a call back with Ask's brief for the call: written once by the person draft (its rules, its
   refusal of a price), kept on the thread (`conversation_drafts`, through `conversation_draft_keep`) until the customer
   writes again, so every tab and teammate reads one model call's words. Only a member who acts has drafts written; a
   viewer reads what was kept. A reach-out reply the receptionist already drafted is offered as it is.
3. **Send is the reply's door, Undo its whole grace (E3).** Edit opens the words in place; Send goes through `POST
conversations/[id]/reply` (an email waiting on a yes to its address sends again naming it), and the row counts the
   receipt's `cancelable_until` down to the second with Undo, the reply's own cancel. Outside WhatsApp's window the words
   go to the thread's box, where a template is chosen.
4. **Not now (E4).** For a person waiting it snoozes the thread to a time on the business's clock (an hour, this
   afternoon or evening, tomorrow at nine, next Monday), their next message bringing it back sooner, with Wake. For a
   step it moves the step's day, through the note's own edit as People's step sheet moves it: its words and whom it is
   for sent as they are, and a step a teammate wrote says why it cannot be moved here (the edit is its author's). For an
   idea it is Not today. A visit or a run has none.
5. **The receptionist's replies counting down are rows (E5)**, first, with their words, the seconds left, Stop (the
   Inbox's hold, after which the words are the member's to send) and Change it with Ask (`steer`). A rewrite is a new
   held reply, drawn in the row's place with its own countdown. Going today keeps the runs alone.
6. **What follows a press stays in the row (E6).** A call back: Call from the member's phone, then how it went (Reached
   hands the thread back to the receptionist, its hold resolved; No answer puts a call on tomorrow's steps; each with
   Undo). A time picked by text: Booked it, then the confirmation it drafts, sent from the row. Yesterday's visit:
   Missed, then the rebook Ask writes, sent as a first message with its grace.
7. **A public review reply waits fifteen seconds (E7)**, held by the tab with Undo; a tab that closes inside the grace
   posts it as it goes (a keep-alive request). Ask drafts it on a press; where it cannot, the member writes it.
8. **Short rows (E8).** Past the first two rows worked in place, a row is one line until it is opened; nothing is sent
   from words not seen.

## Shape

- **Database (00475):** `conversation_drafts` (one a thread and kind, `reply` or `brief`; members read, the door
  writes) and `conversation_draft_keep` (a member who acts, the thread and the message their workspace's). Gone with the
  thread; its words are erased with the person.
- **Dashboard:** two routes, `POST conversations/[id]/draft` (operator, the person draft's bucket, maxDuration 60)
  and `GET conversations/drafts` (`server/conversations/drafts.ts`); the section (`surfaces/today/need-you/`: rows,
  drafts, sends, the work of each kind) under `pages/queue.tsx`; the kit's row takes `work`, and a row with work is not
  one button: its words open it. The typed client takes `keepalive`.
- **Contracts:** `need-you/` (the words, Not now's times, the countdown, Ask's line, the drafts' shapes and schemas);
  the queue's held row and what each row's reply is written for (`today-queue.ts`); `SEND_GRACE_MS` said once
  (`config/policy.ts`, core reads it); `reply`, `thread_verb`, `steer` and `person_message` are page specs now.

## Switches, and how to undo

- No switch: the section draws from reads Today already has. Drafting ahead spends one person-draft call per waiting
  thread's newest message, kept; to stop it, `useDraftsAhead` leaves `pages/queue.tsx` and the rows offer Write it
  myself. Ask's ideas still come only with `ASK_MORNINGS=on`.
- The migration is a new table and a door: nothing else reads them.

## Steps

One lane, one pull request. The migration goes to production before the merge (the routes read and write the table),
then either deploy order.

## Tests

The words and clocks (`tests/need-you/need-you-words`), the queue's rows (held first, one row a person, what each reply
answers), the two routes' policies and refusals, the door on a replayed stack (`reply-drafts.db.test.mjs`), Today's
page and queue suites, Ask's ideas as rows, and Going today with the runs alone.

## Risks

- Every visit by a member who acts drafts the waiting threads' new messages it has no words for: a model call each,
  in the person draft's bucket and Ask's daily budget.
- On a busy veto day the receptionist's replies counting down take the card's seats for their few minutes.
- The review's hold is the tab's: a tab the system kills without closing loses it, and nothing is posted.

## Open questions

- Whether any member who acts may move a teammate's step's day, as any may mark it done (a door of its own).
- Drafts for the rows past the card: only the rows drawn are drafted.
