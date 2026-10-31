# 0082 · The receptionist fills the book

**Status:** Decided by Ruben on 30 October 2026, built on 31 October in L1 to L3 (the plan's "as built" notes) and
landed that day: #1969 = `d4e8ae47d`, its migration 00498 on production before the merge. The design brief was approved with its spend ("Approve,
write spec"). Spec `docs/superpowers/specs/2026-10-30-the-receptionist-fills-the-book-design.md`, plan
`docs/superpowers/plans/2026-10-30-the-receptionist-fills-the-book.md`, lane
`sequences/the-receptionist-fills-the-book`. Written against main's `5d0394714` (#1961), and verified against the
code at it. Numbered 0082: 0079 is the lead preview's lane, and 0080 and 0081 landed first (#1964, #1965).

## Context

A cancelled appointment frees time that nobody offers. The record says each cancellation and move as an event
(`appointments_note_change`, 00436; the feed's read, `appointments_feed_sync`, 00419, says each vanished and moved
row the same way), the owner is told of a customer's cancellation on the bell (`visit_notice`), and the time stays
empty. The people who could take it are already a list: People's "Asked, never booked" (`people/lists/builtin-lists.ts`,
wrote or called in the last 30 days and nothing on the calendar answers it), Today's own "Worth a look" leak.

Every part of a batch exists in the one run every moment takes (`apps/edge/lib/playbooks.ts` over core
`campaigns/run-playbook.ts`): the pool, the week's breath, the channel each person is reached on, the mode and its
hold (decision 0064), the sending hours, the batch and its people in one write, and Today's row. The reply is the
receptionist's already: a yes in the thread holds a request for the owner where the workspace takes them (decision
0061), else the booking link goes.

An offer would reach almost nobody: Meta delivers no marketing template to a US number
(`broadcasts/whatsapp-offers.ts`), and a text carries no offer. A message about the person's own ask is
conversational and about them (`purposeOfPlaybook("follow_up")`, `messageAboutOfTrigger`), so a text may carry it,
WhatsApp takes a utility template, and an email needs no yes.

## Decision

1. **One new moment, `slot_opened`, of a new kind `freed`, under the Follow-ups row** (class `follow_up`), offered
   where a calendar is connected. The row's words widen to say the freed time beside the proposal follow-up.
2. **Who hears of it:** the people "Asked, never booked" names now, minus the opted out, a thread held for a person
   and anyone the week's breath holds, most recent first, four by default (2, 4, 6 or 10), each on the channel a
   conversational message about theirs may go by. A person hears of freed times at most weekly (`gap_days` 7).
3. **A freed time** is an `appointment.changed` event by the service (cancelled, moved or vanished) about an
   appointment linked to a person, whose freed time starts past the lead hours and inside the booking window, is
   inside the hours, is still free on the record, and is at least a slot long. A move says the time it left
   (`was_at` on its event); an event without it offers nothing.
4. **One batch per freed appointment,** its time on it (`offered_start`, `offered_end`, `offered_from`), no day of
   its own, named by its time, every send carrying `freed_when`. The subscriber `freed_time_offer` makes it through
   `runPlaybook`, so the breath, the modes, the trial, the sending hours and the decision row are every batch's.
5. **Its wait ends with its time** (`runApprovalRefusal`), and a time taken before it went cancels it (`taken`),
   asked of the record as the batch is claimed.
6. **The message is the starter `time_freed`,** utility, three slots (first name, business, `freed_when`), asking for a
   reply and carrying no link. The receptionist takes the reply as it takes any.
7. **"Took the freed time" is read, never stored:** `freed_time_taken(batch)`, on the batch's counts and in the Campaigns
   lens.
8. **Seen** on Today (the row, the done line), Campaigns (the sequence, Lists & offers' line), the bell's clause,
   Reports, Autonomy's Follow-ups evidence, and Ask (proposable, the guide's row, a signals spot).

## Shape

- **The database:** one migration.
  - `playbooks_trigger_check` takes `slot_opened`.
  - `sequence_batches.offered_start`, `offered_end`, `offered_from`, their check, and the unique partial index
    `(step_id, offered_from)`.
  - `appointments_note_change` and `appointments_feed_sync` say `was_at` on a move.
  - `freed_time_taken(p_batch_id)`, and `run_counts`' per-run `took`.
  - The subscription `appointment.changed` → `freed_time_offer`, lane 2.
- **Contracts:** the trigger and its kind, the purpose, the class words, `calendar/visit/freed-time.ts` (`freedTimeOf`,
  `freedTimeWords`, the refusals), the slot kind `freed_when`, the starter `time_freed`, `freedTimeFactsFor`, the
  batch's fields and `took`, the runs' words, the approval refusal, `EVENT_SUBSCRIBERS`, the guide's row, Lists &
  offers' line, the news's clause, the settings sheet's words.
- **Core and jobs:** the run with a freed time; the subscriber and its two ports; the send's ask of the record.
- **The edge:** `lib/freed-times/offer.ts`, `RunRequest.freed`, the ports handed to the jobs.
- **The dashboard and Ask:** the broadcasts read, the settings sheet's rows, the signals spot, Ask's definition, the
  eval case.

## Steps

One pull request, in the plan's order:

1. L1, the moment and its words
2. L2, the run and the door
3. L3, where it is seen
4. L4, checks, docs and landing

The migration is applied to production before the merge (`land --applied`). Nothing is offered until a workspace
turns the moment on.

## Tests

The spec's "What proves it". In short:

- The freed time's rule, the words, the starter and the batch's words are pure tests.
- The migration is a database suite: the check, `was_at`, `freed_time_taken`, the index, the ledger's `took`.
- The run and the subscriber run over fakes, the subscriber twice on one delivery.
- The send that finds its time taken cancels and tells once.
- One eval case: a yes to a freed time takes the request for that time.
- One walk in the real app on the local stack: a cancellation, the row, the approve, the send, the yes, the request.

## Risks

- **Meta may read the words as marketing.** They name no offer; refused, WhatsApp drops out and text and email carry
  it, said on the tick.
- **A freed time the owner meant to keep.** Only the service's changes count, never a member's own word, and the
  first batch waits for the owner's OK as every new sequence's does.
- **Spend:** cents per freed time, the owner's, inside their plan.
- **A second yes:** the first reply holds the time; the second hears the next open times, as any caller does.

## Open questions

- Whether a move inside the same window should offer its old time: the record's `was_at` says it, and the run reads
  whether the span is free now, so it offers only a time that is open.
- The intent of the person's last message, once kept on the person, for the ranking: a later step.
