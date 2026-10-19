# 0064 · A sequence is approved once, then held

**Status:** Decided 19 October 2026 (Ruben: "all approved as you best suggest", on the One hold review of 18 October,
`Claude Video/docs/2026-10-18-chanlytics-one-hold-review/index.html`), with its six calls as recommended. Built in part on
the lane `sequences/one-hold` from main's `d2dd2c3e5`: steps 1, 2, 3, 5 and 6 in one change (00461 before the merge,
00462 after its deploys); step 4 is its own change, after this one is on production. Where this note and the code
disagree, the code wins.

## Context

Seven things wait on the owner: a reply counting down, a thread handed over, a customer's batch, a batch to leads, an
email the check held, a draft the owner sends, and a review's reply. Each was built on its own, and together they do not
agree on what "Asks you" means, what is written before the wait, or what happens when nobody answers.

- **The mode is the class's, for the whole workspace** (`policies`, Settings › Autonomy). Letting one offer send on its
  own lets every offer. The record, the Calendar, Ask and the run each read it their own way.
- **A new workspace asks for every offer, win-back and follow-up** (`provision_tenant`, 00274, decision 0006's "ask is
  safe"). On 18 October all seven live workspaces still did; none had ever approved a batch; the one real batch that
  waited (7 September) was skipped by the sweep that night.
- **A customer's batch nobody approved dies at night in silence** (`endRunsWhoseDayPassed`, decision 0048's "no mail
  and no bell row"). Its people are drawn again the next day, which asks again.
- **Every step asks on its own**, so a three-step sequence under Asks you asks up to three times a day.
- **"Asks you" means three things**: a reply is not drafted and the thread is the owner's; a batch is written and waits
  until night; a review's reply is not written until the owner presses Draft.
- **A cold email already does the right thing**: its chain's first batch waits for its owner, and later batches give
  thirty minutes to be stopped (`run-reach-out.ts`).
- **The trial** (00416) is a second fact about the same thing: for a week, a run its class would send waits as Holds it.

## Decision

1. **The mode lives on the sequence.** `sequences.mode`: `auto` (Sends it), `veto` (Holds it: thirty minutes to stop
   it) or `ask` (Asks you). A new sequence takes its class's Autonomy row; a one-off has none, since pressing Send is
   its decision. A sequence to leads is never `auto`. The sequence's How it runs says it ("Before each batch") and
   changes it; Ask's sequence change takes it.
2. **Autonomy's rows are the defaults.** The rows for offers, win-backs, follow-ups and reach-outs say what a new
   sequence starts as, and lose Never: a sequence is paused on its page. A row changed later changes no sequence.
3. **Each step's words are seen once.** `sequence_steps.words_ok_at` is when a person last let a batch of the step's
   words go: approved it, or ran it now. It is null while the words are new to the owner: at the step's making, after
   its message or slots change, and after its message's words change in Messages. A batch of a step whose words are
   new waits for an OK, whatever the mode. This replaces the trial, and a chain's "first run waits" rule.
4. **A batch's plan is one derivation**, contracts `batchModeOf`: `ask` while the step's words are new, else the
   sequence's mode, else `ask` (fail safe). The run, the Calendar, Ask and the record all read it. A person's Run now
   sends now, as their decision, and counts as their OK.
5. **The mode is every batch's, later steps too.** "Asks you" asks each time, as it says; under Holds it a later step
   never asks, but once for new words. The 17 October review's item 9 is answered by the default, not by an exception.
6. **Nothing is skipped in silence.** A customer's batch that waited past its day is still skipped by the sweep (a
   day's run, and a visit's reminder must not go a day late), and the owner is told on the bell: the batch did not go,
   nobody approved it, and its people are in line again (00453 puts them back).
7. **The defaults move.** `provision_tenant` seeds offers, win-backs and follow-ups as `veto`, and the live workspaces'
   rows move from `ask` to `veto` (Ruben's word). Every sequence takes its class's row as it stands after that move.

Two refinements of the review, made while building it and said to Ruben with how to reverse them:

- **The OK is kept per step**, not once per sequence (the review's `first_ok_at`): a change to step 3's words asks of
  step 3 alone, and a new step's words are seen once in a real batch.
- **Asks you covers every batch** (point 5), where the review had later steps hold under it: a mode that says "each
  time" and holds is a mode that lies.

## Steps

1. **Approve the sequence, not the batch.** Migration 00461 (expand): `sequences.mode`, `sequence_steps.words_ok_at`,
   the defaults and backfills, the doors that set and clear them, the class modes without Never. Core plans by
   `batchModeOf`; a reach-out asks by the same rule; the sweep's skip tells; the readers, the record, How it runs, the
   Autonomy rows and Ask read and set the sequence's mode; the trial goes from the code. Migration 00462 (contract,
   applied after the merge's deploys, as 00460 was): `sequence_steps.trial_until` goes.
2. **Every hold tells once and says its expiry.** A reply held in its window (or for low confidence) is a bell row and
   a push, closed when it goes or is stopped. One rule says each wait's expiry (contracts `waitRuleOf`); every notice
   and Today's rows read it. Today shows what goes today, each with its Stop, above what waits for an OK.
3. **Send once can be stopped.** A one-off pressed for now goes in ten minutes, and its receipt carries the Stop. One
   set for later already can be canceled.
4. **A step carries only what is its own.** The hour, the cap, the gap, the cadence and the last day move to
   `sequences`; the copies on later steps, and 00453's carrying of them, go. Not built with the others: it moves every
   setting's storage and re-creates the functions 00461 and 00462 just re-created, so it lands on its own, after them,
   with its own rollback.
5. **Each sequence shows its evidence.** "12 batches went: 11 as approved, 1 stopped, 2 skipped because nobody
   answered" on the record and under each Autonomy row, from the ledger and the runs.
6. **A review's reply waits like everything else.** Under Asks you a new review's reply is written and held for an
   Approve; under Holds it (new for the row) it posts in thirty minutes unless stopped.

## Not decided here

- A sequence moving itself to Sends it. It never does: the record shows the evidence, and the owner moves the mode.
- A digest of the day's batches by mail. Today's band is that list.

## Tests

The run's plan over every mode and words state (core run-playbook), a reach-out's first batch and a changed step's
(core run-reach-out), the doors and triggers that set and clear `words_ok_at` and the defaults (database suites), the
sweep's skip telling, the readers' mode, the record's words, Ask's parity and the hearing golden.

## Risks

- **A batch goes that nobody looked at.** Only once its step's words were seen in a real batch; every change of words
  asks again, and every held batch is told on the bell with its Stop.
- **A reminder sequence's first batch waits.** A visit's reminder made under Sends it now asks once, and a batch nobody
  answers that day reminds nobody. The record says so before it is turned on.
