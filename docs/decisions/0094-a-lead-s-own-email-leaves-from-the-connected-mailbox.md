# 0094 · A lead's own email leaves from the connected mailbox

**Status:** decided by Ruben on 4 November 2026 ("Yes, as recommended": Road A with the row, and the four answers under
Open questions as recommended). Built on the lane `leads/a-one-off-leaves-from-the-mailbox` from main's `d56b2e620c`, not
merged: migration 00540 (not applied), the door, the clock's branch, the sheet and History. Written against `ba52601b4c`,
and read again at `d56b2e620c`, where #2090 brought the write step to main. Where this note and the code disagree, the
code wins.

**Decision:** Road A, a new lead door through `deliver.ts`, with one thing borrowed from Road B: the email is a row
in `sequence_sends` that has no sequence. Reply reading, the mailbox's day and the clock's settling then work with no
change to them, and nothing new shows on the Sequences list.

## Context

### What the write step does today (lane)

`POST leads/:id/draft` writes the words, with `leadDraftFooter` as the foot (`lead-plan.ts:187`). It refuses a never-again
address before asking the model (`lead-draft.ts:99-100`). The owner sends from their own mail app. "Did you send it?"
answered yes posts `{kind: "emailed"}`, which moves the lead to nurture, and `wroteActsOf` asks Take out while a sequence
stands (`dock-asks.tsx:132-144`).

### Five facts that decide this

1. **The mailbox's day counts `sequence_sends` rows and nothing else.** `mailbox_capacity` (00451) joins on
   `s.mailbox_id`, for `sent_today`, `used`, `recent` and the ramp's `sent_days`. An email with no row is invisible to it,
   so the door's backstop (`deliver.ts:472`) would let the mailbox past its share.
2. **A reply is matched through `sequence_sends`.** `reach_out_reply_of` (00451) finds the send, and `reachOutReplyOf`
   answers null without a `send_id` (`outreach.ts:214`). Null means no `reply_read` job (`email-ingest.ts:282`), so a "no
   thanks" never becomes an opt-out, although the foot promises it. Stopping is separate: `outreach_wrote_back` (00451)
   reads `messages` and calls, so any reply stops cold sends with or without a send row.
3. **The clock settles a lead's email from its row.** `sequence_queued_outcomes` feeds `clock.ts:211-219`, which calls
   `leadWritten` (`reach-out.ts:557`). With no row, nothing moves the lead when the email goes.
4. **A send must name a sequence and a batch today.** Both columns are `not null` (00440:133, :135); `step_id` may be
   null. The enrol triggers join on `step_id` (00459), so a send with no step makes and moves no place, and
   `sequence_sends_one_first` (00440:255) does not see it.
5. **Every sequence is listed.** `sequence_overview` reads every `sequences` row of the workspace, with no way to hide
   one. Decision 0060 says "everything that sends on its own is a sequence", and a person's press is not on its own.

## The two roads

**Road A: a lead door.** `POST leads/[id]/send`, through `deliver.ts` with `purpose: "outreach"`, under every rule the
door already holds (`deliver.ts:456-473`, `reach-out-rules.ts:43`). With a `messages` row alone, facts 1 to 3 are three
gaps. Closing them means a union over `messages` in a hot function, a new arm in `reach_out_reply_of` with a null
`send_id` through its readers, and a settle of its own.

**Road B: a sequence of one.** Reading the writer, each email needs a sequence, a step, a template (it reads words from
the step's template, `sender.ts:415`) and a batch, before its send. It collides in four places:

- A root-step send breaks `sequence_sends_one_first` for any lead with a first email already.
- A non-root step is skipped as `no_parent` (`sender.ts:430`), and a null step as `step_removed` (`sender.ts:399`).
- `reach_out_why_not`'s `written` (00459) refuses that lead for any later sequence.
- `lead_chain_of` (00451) follows the latest send, so the lead's chain turns into the hidden sequence.

Hiding it from the list means a filter in `sequence_overview` and in whichever of about 55 functions naming
`sequence_batches` draw it, and a missed one fails silently, as clutter on a page or a wrong report. It would also send
late: a `planned` row waits for the claim's gap, so Send could go hours later.

**Road A with the row (recommended).** The same door, and its row is `sequence_sends` with `sequence_id`, `batch_id` and
`step_id` all null. Facts 1 to 3 need no change, fact 4 keeps it out of every place, and a query that joins through a
sequence or a batch never sees it.

## What each answer is

| Question                                           | Road A with the row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Road B                                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **How is the reply read, and what stops writing?** | Gmail sync, `email_ingest`, then `reach_out_reply_of` finds it by the Message-ID that `fromMailbox` stamps (`deliver.ts:565`). It then gets the `reply_read` job, the notice and the draft, and a no becomes an opt-out. `outreach_wrote_back` stops cold sends once the message is kept, and the reading's `skipSends` skips the lead's waiting sends. No edits.                                                                                                                                                     | The same, no edits.                                                                              |
| **How does it count against the day?**             | `mailbox_capacity` counts it, no edit. The door asks for room before queuing (`mailboxDailyCap`: 10 to 40 by the ramp, 20 on a customer domain). A full day says so and the mail app stays. The month's 2,000 counts it through `meta.source`.                                                                                                                                                                                                                                                                        | Counted too, but it waits for the claim's gap.                                                   |
| **Does the opening check hold it?**                | No. The check reads `planned` rows, because nobody reads each email of a batch. This row is born `queued`, and the owner has read every word.                                                                                                                                                                                                                                                                                                                                                                         | Yes, unless it is written as checked and its `checked_words` match the step's (`sender.ts:423`). |
| **What stage does it leave?**                      | `leadWritten` when the message says sent: ready becomes nurture, a later stage is kept, `contacted_at` keeps the first, `lead.emailed` is written. Nurture still takes cold email, so a running sequence keeps writing; anything past nurture stops it. Refused or failed moves nothing. As with the mail app today, nurture reads `closed` to `reach_out_why_not`.                                                                                                                                                   | The same.                                                                                        |
| **How does it read in History?**                   | One row per email on its own day, "You wrote to them from {mailbox}". It replaces `wroteYourself` read off `last_outcome` at `contacted_at`, which shows only the last word, on the first contact's day. `leadWritten` writes the same `last_outcome` (`reach-out.ts:575`), so `emailed` can't tell a hand-sent email from a sequence's, and only a send row can. PR #2090 therefore draws that row only where no sequence send has gone, and a lead both you and a sequence wrote to loses it. Real rows close that. | Free only inside the hidden sequence's place, which the Sequence line must then hide.            |
| **What if no mailbox is connected?**               | The draft answers `from: null`, and the step is exactly today's: mail app primary, then "Did you send it?". The same when the mailbox can't send now or its day is full, with one line saying why.                                                                                                                                                                                                                                                                                                                    | Needs the same fallback, and the choice of whether a sequence gets made first.                   |
| **What about a lead whose sequence is running?**   | It leaves from the mailbox their sequence uses (`mailbox_id`, kept by the lead, 00440:217), so the business hears from one address. If that mailbox can't send, the mail app. Their place doesn't move. It opens its own Gmail thread, and later steps keep answering theirs. After the send, the same `wroteActsOf` ask, whose words stay true (`lead-sheet-dock.ts:77`).                                                                                                                                            | A second sequence on the lead: its chain and place need filters to stay on the real one.         |

## Shape

```sql
-- <next free number> · A lead's own email is a send with no sequence.
alter table public.sequence_sends
  alter column sequence_id drop not null,
  alter column batch_id drop not null;
alter table public.sequence_sends add constraint sequence_sends_own_is_a_leads check (
  (sequence_id is not null and batch_id is not null)
  or (sequence_id is null and batch_id is null and step_id is null and lead_id is not null));
-- One on its way per lead: a double press finds the first.
create unique index sequence_sends_own_once on public.sequence_sends (tenant_id, lead_id)
  where sequence_id is null and state = 'queued';
```

`lead_chain_of`, `reach_out_lead_timeline`, `reach_out_why_not`'s `written`, `sequence_move`, `reach_out_chain_totals` and
`reach_out_report` each gain `sequence_id is not null`. The last two would otherwise have grown a row for a sequence called
nothing, and `sequence_move` would have refused a lead its owner had written to.

**The door,** `POST leads/[id]/send` with `{subject, body}`: scope row and role operator, as the draft's are; a rate of its
own; a row in `route-policy.json`.

1. Pick the mailbox (a pure function in contracts): the one their sequence writes from; else the first the member
   connected (the order `signingMailboxOf` keeps, 0081); else the workspace's first that sends now and has room. Google
   mailboxes only, and no Graph code is touched.
2. `reachOutPerson` (00430), as a first step makes it: `already_yours`, `lead_closed`, `erased` and `no_address` refuse,
   and it gives the person and their one thread.
3. `draftFactsOf` with `draftRefusalOf`, asked first of all, with `mailboxSendsNow` and `mailboxDailyCap`: the mapping the
   door and the clock read (`outreachRefusalOf`), over facts a lead with no person yet can answer. An opt-out is the door's
   `suppressed` fact, so `addressesSuppressed` stays in the draft alone and nothing is checked twice. A refusal answers in
   the words consent already holds.
4. Freeze with `reachOutRequest`, moved whole from the edge to `packages/channels/src/email/cold-request.ts`, so the
   send, the tests and this door keep one email build (#2080). It carries the cold foot and the one-click unsubscribe the
   door demands, and signs with the mailbox's signature.
5. Write the queued email under `sendMessageId`, with `meta.source = "reach_out"` and `meta.reach_out` naming the lead
   (`handlers.ts:119`). Write the `queued` row with `message_id`, `mailbox_id` and `said_by`. Schedule `outbound_send` with
   `purpose: "outreach"` and `proactive: true`. `deliver` judges it again at the wire.

**The clock,** one branch: a wait refusal (`isWaitRefusal`) on a row with no sequence is skipped with its reason, never
planned again. The owner pressed Send now, so nothing may leave by surprise tomorrow, and History says it didn't go and why.

**The sheet.** The draft also answers `words`, `from`, `why_not`, and the foot the send would make. The subject and the words
are the kit's `Field`, theirs to change, with what is added under them drawn beneath. With a mailbox the email says "From
{address}", the primary is Send, and the caret holds Your mail app, Gmail, Outlook and Copy. `wroteActsOf` wraps the send
too, and an Undo takes its question back. History says "Sending from {address}" until the row says sent, from
`GET leads/:id/emails`. Every word lives in contracts (`LEAD_OWN_EMAIL_WORDS`).

## Steps

Each ships in either deploy order, because no row with a null sequence exists until step 3's door is live.

1. **The migration and its readers.** Read the remaining functions named under Risks first. Types and `schema.sql` by
   hand (no stack on this PC); CI replays them.
2. **The move.** `reachOutRequest` to `packages/channels`, with no change in behaviour.
3. **The door and the clock's branch.**
4. **The sheet and History.**
5. **The walk.** Campaigns rig, scenario `salon-sheet-d`, with `POST leads/:id/send` and a mailbox added to the pile: 375
   and 1024, light and dark. Uncommitted until Ruben approves.

## Tests

- **Database (CI only, no stack on this PC):** `tooling/scripts/tests/lead-workbench/a-lead-s-own-email.db.test.mjs`: a row with no
  sequence is counted by `mailbox_capacity`, found by `reach_out_reply_of` by its Message-ID, ignored by `written` and
  `lead_chain_of`, makes no place, a second `queued` one for the lead is refused, and a customer's send must still name its
  batch.
- **The door:** `tooling/scripts/tests/lead-workbench/lead-send-door.test.mjs`, over `_fake-db`: what is written, each refusal, the
  mailbox it leaves from, a second press, and "Did you send it?" keeping its row.
- **The clock:** `tooling/scripts/tests/lead-workbench/reach-out-clock-own-email.test.mjs`: sent moves the lead to nurture; a wait
  refusal or a provider's no ends the row, never planned again; proved to fail without the branch.
- **The rules and the sheet:** `tooling/scripts/tests/lead-workbench/lead-email.test.mjs`, and five walks in
  `tooling/scripts/tests/leads/finder/leads-peek.test.mjs`: Send, Undo, a refusal, no mailbox.

## Risks

- **The table's name stretches.** Its comment said "one message of a sequence", and this row is not one, so the comment
  changed with it. 65 functions name the table at `d56b2e620c`. Each that reads a lead's sends with no join to a sequence
  was read before the migration, and the six above are the ones that needed the filter. The rest either key on a sequence or
  a step, keep to `planned`, `held` or `drafted`, or should count this row (the mailbox's day, its connection counts, the
  day's numbers, a reply said by its owner).
- **Nullable types ripple.** The compiler listed six readers, each a sequence's or a customer's send, narrowed where they
  read (`ReachOutSendRow` keeps both columns required; `ofASequence` tells them apart). That is the loud failure Road B lacks.
- **A press is not yet a send.** The email is queued and judged again at the wire, so it can still be refused. The sheet
  must not say sent until the row does.
- **Two emails close together.** If the owner keeps the sequence going, its next step may follow soon after. The Take out
  ask says so; nothing spaces them.
- **A first press makes a person,** so the lead shows in People, as a first step does today.

## Open questions, answered 4 November 2026

Ruben: "Yes, as recommended".

1. **The road:** A with the row.
2. **Can the owner edit the words before Send?** Yes: their mail app lets them, and otherwise a press sends the model's
   words as written.
3. **Does "Did you send it?" write the same row, with no mailbox?** Yes: `last_outcome` can't tell a hand-sent email from a
   sequence's, so without the row History loses the hand-sent one on a lead a sequence wrote to. It makes a person and a
   message for a hand-sent email, as `reach_out_send_said` does for an owner's step, so the mark's Undo goes from the toast
   (a person made is not undone from a toast, §9.6).
4. **Undo after Send?** Yes: the 15 seconds a member's reply has (`SEND_GRACE_MS`), through `POST messages/:id/cancel-send`,
   which brings the words back to change.
5. **Does a one-off bar a later sequence?** No: the row doesn't count as `written`. Nurture already reads `closed`, so only
   Move back to Ready lets them join, the same as the mail-app road.
