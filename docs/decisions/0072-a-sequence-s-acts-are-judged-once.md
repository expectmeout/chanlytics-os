# 0072 · A sequence's acts are judged once

**Status:** Decided by Ruben on 24 October 2026 (the architecture review's candidate 1, settled in three rounds of
questions the same day). Built on the lane `sequences/acts-judged-once` from main's `4b19a8457`, the commit this note
was written and checked against, and merged in #1824 on 25 October 2026; no migration. Where this note and the code disagree, the code wins. The status was read again at `e9d6325f0` (26 October 2026).

## Context

What a sequence's head offers (Start, Pause, Turn on, End it, Discard, Run now, Rename, Cancel this send, Send it again)
is decided in three places, each in its own words:

- **The page**, `apps/dashboard/src/surfaces/campaigns/sequences/record-acts.tsx`: twelve checks of the row's state and
  kind (`ends` :173, `turns` :177, Discard on any draft :251 and :577, Rename :300).
- **Ask's cards**, `apps/dashboard/src/server/ask/tools/act/sequence.ts` (`proposeStart` :260, `proposeRunNow` :375,
  `proposeDiscard` :394) and the batch card, `act/run.ts` :85.
- **The doors**: `sequence_discard` (00465 :485), `PUT playbooks/[id]` through `checkPlaybookPatch`
  (`packages/core/src/campaigns/check-playbook.ts` :381) and `changePlaybook`, `DELETE playbooks/[id]` (`deletePlaybook`,
  `apps/dashboard/src/server/campaigns/playbook-row.ts` :382) and `POST playbooks/[id]/run`.

Only Run now and Cancel this send share a rule between the page and Ask (`sequenceRunsNow`,
`packages/contracts/src/sequences/sequence-acts.ts` :37; `sequenceCancels`, `sequence-words.ts` :486). The rest disagree:

| Act               | The page offers it                   | Ask's card                         | The door                                                                                                                                                                            |
| ----------------- | ------------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discard           | on any draft                         | on a draft whose `last` is empty   | takes a moment's or a list's sequence in any state, or a kept one-off draft, that never made a batch nor took anyone in (00465 :503 to :510)                                        |
| Discard, to leads | on any draft                         | on any draft                       | refused, "Sequence not found.": its own door, `reach_out_remove` behind `DELETE reach-outs/[id]`, has no caller (`apps/dashboard/src/surfaces/campaigns/reach-out/surface.ts` :171) |
| End it            | a moment's or a list's, on or paused | no card                            | anything but a sequence to leads                                                                                                                                                    |
| Rename, to leads  | offered                              | refused by the change card's check | refused, 409: a reach-out's step takes its state and its mode alone (`check-playbook.ts` :393)                                                                                      |
| Cancel this send  | a scheduled one-off                  | only one waiting for an OK         | scheduled, sending or waiting (`packages/core/src/campaigns/cancel.ts` :27)                                                                                                         |

Two facts lie behind the doors.

- **End it and Discard are one mechanism.** Both take away the sequence's first step, and the trigger
  `sequence_steps_first_gone` (00440 :464) decides: a sequence that ever made a batch is ended and keeps its History;
  one that never did is deleted. End it on a sequence that never ran already takes it away, under End's words. Letting
  go of a sequence to leads runs the same trigger.
- **Taking anyone in means a batch was made.** A person is put in a sequence only by a send
  (`sequence_sends_move_enrollment`, 00459 :1305), and every send has its batch (`sequence_sends.batch_id` is not null),
  so the Discard door's two conditions are one fact. The record carries neither it nor, for a sequence to leads, whether
  it wrote: `in_it` counts who is in it now (`packages/contracts/src/sequences/sequence-dto.ts` :115), and `last` is the
  last batch that went (:110), not one cancelled before it went.

## Decision

1. **One judge.** `sequenceActsOf(record, { tz, nowMs })` in contracts answers every act of a sequence's head at once,
   each `{ ok: true }` or `{ ok: false, because, instead? }`: `because` one of a closed set of reasons, each with the words
   a person reads, and `instead` the act offered in its place. It takes in `sequenceRunsNow` and `sequenceCancels`.
2. **Stricter than a door, never looser.** The judge never offers what a door refuses on the facts the record carries.
   Where the product's word is stricter than its door (Start only from a draft, where the door turns a sequence on from
   any state), its row says so. What the record cannot carry stays the door's refusal at the press, in the door's words:
   a twin on a visit moment and an email still to write on Start and Turn on (`playbook-row.ts` :269 to :273), an archived
   list, and Run now's refusals on the edge (it ran today, its class is set to Never, the number is flagged, its last day
   has passed, the workspace is paused).
3. **Discard is for a sequence that never made a batch, in any state; End it for one that did.** A sequence to leads is
   let go of while it has written nothing, through its own door, and is never ended: it is paused instead.
4. **One Discard.** `DELETE sequences/[id]` sends a sequence to leads through `removeChain`
   (`apps/dashboard/src/server/campaigns/reach-outs.ts` :319), choosing by the row its scope already read. The page and
   Ask never choose.
5. **One Rename.** `checkPlaybookPatch` takes a name on a reach-out's first step, beside its state and its mode, held to
   the leads name's limit.
6. **The record carries two facts**, read by its reader from `packages/db`: whether the sequence ever made a batch, and,
   for a sequence to leads, whether it ever wrote. No migration.
7. **The page hides what is not offered.** The reason is for Ask: its cards refuse in the reason's words, with their hint
   for the model after them, taken from `instead`. Ask gains an End card (the `sequence_end` spec is there), and its batch
   card cancels a scheduled one-off as the page does. A one-off that is sending has no Cancel: stopping half way leaves
   some of its people with it and some without.

## The acts

The reasons' names are the build's to fix; what each act is offered on is decided here.

| Act              | Offered when                                                                                                            | Not offered, why (and what instead)                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Start            | a draft, not a one-off, with no email still to write                                                                    | not a draft; a one-off (it opens in New); an email to write                           |
| Pause            | on, not a one-off                                                                                                       | not on; a one-off                                                                     |
| Turn on          | paused, not a one-off                                                                                                   | not paused; a one-off                                                                 |
| End it           | a moment's or a list's sequence that made a batch, on or paused                                                         | never ran (Discard); to leads (Pause); a one-off; ended                               |
| Discard          | a moment's or a list's sequence, or a kept one-off draft, that never made a batch; a sequence to leads that never wrote | it ran (End it); to leads, it wrote (Pause); a one-off that went or waits for its day |
| Run now          | `sequenceRunsNow`, with no batch waiting for an OK                                                                      | to leads; a one-off; a batch waiting; not today                                       |
| Rename           | not a one-off, not ended                                                                                                | a one-off; ended                                                                      |
| Cancel this send | a scheduled one-off                                                                                                     | not scheduled                                                                         |
| Send it again    | a one-off that went                                                                                                     | not sent yet                                                                          |

## Shape

- **Contracts:** `packages/contracts/src/sequences/sequence-acts.ts` holds the acts, the reasons and their words
  (`SEQUENCE_ACT_WHY`), and `sequenceActsOf`; `sequenceRunsNow` and `sequenceCancels` fold into it. `SequenceRecordDto`
  takes the two facts (`ran`, `wrote`). Ask's guide no longer keeps End it on the page.
- **Database reads:** one, `sequenceRecordFacts` in `packages/db/src/repositories/campaigns/sequences.ts`: the record's
  facts beside its row and steps, each read on its own (its first step's run, why its last run did nothing, and what it
  has done), so one that fails costs only its own lines; read by `apps/dashboard/src/server/readers/sequences.ts`.
- **Dashboard server:** `discardSequenceNow` (`apps/dashboard/src/server/sequences/doors.ts`) chooses the door by the
  row its scope read, a sequence to leads going by `removeChain`; `discardBySequenceDoor` is sequence_discard's alone,
  which New's letting go of a kept one-off calls. The refresh map's `DELETE sequences/[id]` row reads Leads too.
- **Core:** `checkPlaybookPatch` allows a name on a reach-out's first step (`reachOutTakes`).
- **The page:** `record-acts.tsx` draws its head, its More and a phone's dock from the judge, and `steps.tsx` a
  one-off's Cancel.
- **Ask:** `act/sequence.ts` refuses by the judge and gains an end action; `act/run.ts` cancels a one-off waiting for
  its day by its row and the judge; `act/playbook-change.ts` lets core judge a sequence to leads, its own copy of the
  rule gone.

## Steps

One lane, one pull request: this note and the glossary's rows first, then the build. The tests of the two presses
refused on a sequence to leads were written first and failed on main before either was fixed: Discard's on a replayed
stack ("Sequence not found."), Rename's in core, where its refusal is judged (409). No migration: either deploy order.

## Tests

- **The judge:** every act against every state and kind of sequence, its answer and its reason
  (`tooling/scripts/tests/sequences/sequence-acts.test.mjs`).
- **The page:** its head, its More on a desk and a phone, a draft's notice and a phone's dock draw each act the judge
  offers and none it does not (`tooling/scripts/tests/sequences/head/record-head-acts.test.mjs`).
- **The doors,** on a replayed stack (`tooling/scripts/tests/sequences/sequence-doors.db.test.mjs`): both Discard doors,
  and the record's two facts against what each door counts, a batch cancelled before it went among them.
- **Core,** with fakes: the acts `checkPlaybookPatch` judges, a name on a sequence to leads among them
  (`tooling/scripts/tests/playbooks/change/check-playbook-patch.test.mjs`).
- **Ask:** each card refuses in its reason's words (`tooling/scripts/tests/sequences/head/ask-head-acts.test.mjs`, the run
  card's in `tooling/scripts/tests/broadcasts/ask-run-card.test.mjs`); Ask's tests of the refusals it wrote itself went
  where the judge now decides.
- No Playwright spec: each rule is proved where it is judged.

## Risks

- A sequence that is on and never ran offers Discard where it offered End it. The result is the same as before (the
  trigger took it away either way); the word changes.
- A sequence to leads let go of after a batch that wrote nothing (one cancelled before its first email) is ended, with
  an empty History, not taken away: the trigger's rule, kept.
- A reason's words are said by both the page's Ask and the model's hint, so a copy edit changes both, as intended.
- The judge reads the record as it was read; a press on a stale record is refused by its door, in the door's words, as
  today.

## Open questions

- Whether a sequence to leads let go of after a batch that wrote nothing should be taken away whole rather than ended.
- The review's candidate 5: every verb's spec says when it may be pressed, from its family's table (threads have
  `CONVERSATION_MOVES`). After this.
