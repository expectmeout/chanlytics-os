# 0065 · One New for every sequence

**Status:** Decided 20 October 2026 (Ruben: "Approved with your picks", on the New canvas, artifact
3eGjrhpQABiRHEgmiy27Kb v8, option 2 on the one model, with its three calls as recommended). Built: #1764 (00465 on
production before its merge, 21 October 2026), completed against the canvas end to end in #1767. Steps 6 and 7 built
on `campaigns/new-steps-6-7` and merged in #1773 (21 October 2026): the record's Add a step offers a call or a note, and the send screen
left, New's one-off counting who can hear it again as it changes and saying why nobody can, by its cure. Where this
note and the code disagree, the code wins. The status was read again at `e9d6325f0` (26 October 2026).

## Context

Campaigns' New is four tabs over three engines, read against `8e4bee882`:

- **A moment and A list** draft through `POST sequences/draft` (`apps/dashboard/src/server/sequences/draft.ts`): one
  model call that picks a moment and messages the workspace already holds, never one it lacks (its RULES: "Never
  invent ... what a message says"). A miss is a 422 toast. Nothing Ask chose can be changed in the draft but typed
  values (`apps/dashboard/src/surfaces/campaigns/sequences/new.tsx`).
- **Once** is Sent's send screen dropped into the pane (`BroadcastSend`), with no Ask and its own grammar.
- **Leads** is two doors out to People › Leads (`reach-out/sources.tsx`). Its Ask draft (`draft-leads.ts`) never reads
  the owner's line and always returns three steps: an email, a follow-up, and a call three days later, fixed in code.
- **The record splits too:** a customer's step sheet views, then edits, then saves (`step-sheet.tsx`); a lead's saves
  as it is typed (`leads/step-sheet.tsx`).
- **Storage is already one:** every step is a `sequence_steps` row (`kind` moment | reach_out; a lead's email is a
  template row `reach_out_<step>`), and the record draws one rail. What differs is held by the table's checks: a call
  or a note (`hand`) on a lead's step only; `only_if` on a customer's later step only; waits of 2-30 days for leads
  and 1-90 for customers; email alone, a pace and an OK on every first email for leads (`sequence_mode_for`).
- **A one-off has no draft:** its sequence row is made by its batch's insert (`sequence_batches_place`, 00440).

## Decision

1. **One New, one line.** New opens on "What should it do?" and starts read from the workspace: what is happening
   (visits this week, people gone quiet, ready leads), each one press to a draft, and what already runs.
2. **Two kinds, two audiences.** A draft is **A sequence** or **Once**, **To people** or **To leads**. Ask picks both
   from the line; a toggle beside "Who and when" flips the audience, and Ask drafts again from the same line. The
   audience changes only what each picker offers: who (moments and lists; searches and leads picked), the channels,
   the values the words may use, the wait's range, whether "if not booked" is offered, and Your OK's choices.
3. **One draft engine.** `POST sequences/draft` takes the line (and any choice already made) and answers one draft
   shape for every kind and audience; Leads' "A draft by Ask" asks it too (`draft-leads` is gone). Every part of it is a choice the owner can change in place: the kind, who,
   when, each step's wait, condition and message, and a call or a note. Nothing is fixed in code: a call is drafted
   only when the line asks for one.
4. **Ask writes a missing message.** Where none of the workspace's messages fits a customer's step, Ask writes one
   (its email and text now, its WhatsApp version sent to Meta when the sequence is kept or started, through the door
   Ask's message card files one by, `writeMessage`). A lead's emails are always its own words, as today.
5. **Checked before Start.** The draft says what Ask checked: a sequence already on the moment (the twin, with Open
   it), who can hear it, which channels can carry it now, a new message's review, and what stops it.
6. **Calls and notes for people too** (the canvas's call 2). A customer's later step may be a call for you or a note
   for the team, on Today with the person, its wait and its condition as any later step's; always the last step.
7. **A one-off can be kept** (call 1). Keep as a draft puts it under Drafts, as a sequence's draft is; sending it makes
   the one-off and lets the draft go.
8. **No send on approval** (call 3). A one-off whose new WhatsApp version is still with Meta goes by email and text to
   those who can hear it that way (the send door refuses a version Meta has not approved, so the make leaves WhatsApp out),
   or is kept: kept, its message is filed, so Meta reviews it while the draft waits under Drafts, and it is sent another
   day. Nothing waits for Meta on its own.
9. **Once to leads** is a sequence to leads of one email, started: its first email waits for an OK as every one does.

## Shape

- **Contracts:** `sequences/new-draft.ts` (the draft, its steps, checks and words) beside `sequence-draft.ts`.
- **Server:** `sequences/new-draft.ts` (the engine: the workspace read, one model call, each answer judged against
  what the workspace offers and holds, per audience), `sequences/new-make.ts` (Keep and Start: messages written
  first, then the sequence, the one-off or the leads' sequence).
- **Database (one migration):** `sequence_steps` takes `hand` on a customer's later step; `sequence_create` and
  `sequence_step_save` take it; `sequence_hand_run` hands a customer's call or note to Today as `reach_out_hand_run`
  does a lead's; `sequences.once` keeps a one-off's draft (a `date` row in state `draft`).
- **Dashboard:** `surfaces/campaigns/sequences/new/` (the page, its start, its draft, its sheets and its cases).

## Steps

1. Contracts and the engine, over a fake model.
2. Keep and Start: messages written, then the sequence, one-off or leads' sequence.
3. The New pane: start, draft, pickers, cases, on a phone and a desk.
4. The migration and the run of a customer's call or note; the record draws them.
5. Tests, the rig walk in both themes, then one pull request.
6. The record's own Add a step offers a call or a note on a customer's sequence (sequence_step_save takes one since 00465).
7. The old send screen leaves: what it says of a missing yes and an unreachable list moves into New's checks, its tests into
   New's, and the run screen keeps the state hook they shared (docs/debt.md, the rise it left).

## Tests

The engine over a fake model (what each audience may be drafted as, and what is refused); the make over fake doors;
the migration's doors on the stack; the page's words from contracts; the rig walk of every board's state.

## Risks

- One model call now decides kind and audience: a wrong guess is one press to correct (the toggle, the kind), and
  the draft says what Ask chose.
- A message Ask writes is filed only on Keep or Start, so Discard leaves nothing in Messages.

## Open questions

None at the decision. The one-step sheet shared by both audiences on the record follows this build.
