# 0059 · An email the owner sends is handed to them

**Status:** Built on the lane `reach-out/drafts-you-send` from main's `ca41d8e6f`, 13 October 2026, and not yet merged
(the lead workbench's calls 7 and 10, which Ruben approved with canvas B v16 on 13 October 2026 and decision 0057 left
owed as a lane of their own; the 4 October spec, `docs/superpowers/specs/2026-10-04-reach-out-drafts-the-owner-sends-design.md`,
approved as recommended, is the design). The number is the next free one after 0058 (hearing is a table, #1583). Where this note and the code
disagree, the code wins.

## Context

Decision 0056 sends a cold email only from a mailbox the business connected (Gmail or Microsoft 365). Until one is
connected, a reach-out could not start: the sheet's Start waited for a mailbox (`sheet.tsx`, `pace.mailboxes > 0`), and
the send clock claimed nothing without the unsubscribe's seal (`sender.ts`, `mailboxLane`). Connecting takes each
provider's own approval of the app, and some owners will never connect one. Canvas B's Sending board said of drafts:
"Works for every owner on day one, and stays the fallback for any mailbox that can't be connected".

The mailbox's pace was 8 to 8 in the lead's time, a new chain's gap 12 minutes, and a mailbox's due sends went in the
order they were due, so a nudge could wait behind a day of first emails.

## Decision

1. **A reach-out says who sends it.** `playbooks.owner_sends`, a root's: its mailboxes, or its owner from their own
   inbox (the sheet's From, "You send them"). With no mailbox connected the owner sends it, the one way it can go, and
   Start no longer waits. Either way round is safe to switch: the mailbox claim never takes an owner's send, and the
   draft claim never takes a mailbox's.
2. **An owner's email is handed to them, written and checked.** It plans, checks and is approved as any other; when due
   it is claimed by its own claim (`reach_out_claim_drafts`), written as a mailbox's would be up to its words, and kept
   on the send as a draft (`drafted`): the address, the subject, the words and the cold foot, whose way out is the
   reply its words ask for, with no link (the owner's client carries no List-Unsubscribe header). Nothing is sent and
   nobody is made at the draft. No send door stands between the owner's inbox and the business, so a draft is judged
   as the door would judge it (contracts `draftRefusalOf` over `reach_out_draft_facts`: the lead closed, stopped, wrote
   back, on the never-again list, or a customer's address) when it is handed over, when To send is read (a refused
   draft is never offered) and on each tick of the clock (which skips it with why). A step after the first whose email
   before it the owner sent is handed to them too, whoever sends the chain now: the thread is theirs.
3. **The owner says whether it went** (`reach_out_send_said`, the run's To send: Sent or Skip). Sent writes, in one
   transaction (the lead locked before the send), the person, the email as sent under an id of its own (no provider,
   no Message-ID), the send and the lead, as the clock does for an email that left. Sent is the truth whatever changed
   since the draft was handed, since the email left the owner's inbox: a draft skipped since (given up, its lead
   closed or stopped) is recorded sent all the same, and what would refuse its lead now is said beside it (`since`),
   never instead of it. A follow-up's Sent asks first whether the business wrote back, with They wrote back… beside it.
4. **What came back is the owner's to say** (Leads' peek, "They wrote back…"): read through the one reading door
   (`reach_out_reply_said` → `reach_out_reply_apply` with `p_said`), with the plan the reply job makes (contracts
   `readingPlan`, claim `owner`: it tells nobody and drafts nothing). The door is the service role's, for the member the
   route checked, so no plan reaches the reading door but the one rule's; it is said once per email that went (a
   second word answers `already`). The reading is keyed to a note in the owner's words on the person's email thread
   (source `owner_said`, never counted as an email), and undone as any reading is. The owner's word is writing back:
   `outreach_wrote_back` reads it, so the followers, the send door and Reports all stop for it. Not now asks the day,
   and Wrong person who instead.
5. **The owner is the pace**: thirty drafts a day per chain (`REACH_OUT_DRAFTS_PER_DAY`), all due when the run goes
   ahead, and never more waiting for them than two days' share (`REACH_OUT_DRAFTS_OPEN_MAX`): an owner who falls behind
   is handed nothing new until they catch up. A draft waits fourteen days, then is given up (`kept_waiting`), as a hold
   is. A paused chain keeps its drafts. Reports counts none of the owner's emails delivered: nobody can know they landed.
6. **Drafts need no seal.** The send clock claims drafts before it asks for `UNSUBSCRIBE_SECRET`, and the check runs
   without it; a mailbox's send checked without the seal waits, planned, and the send clock answers 503 `lane_unset`
   while one is due, as before.
7. **Sending order (call 7)** is drafts first, then Outlook, then Gmail: the order a business can use them in, as each
   provider approves the app. The draft claim runs before the mailboxes' in each tick. Both mailbox providers were built
   by 0056; which reaches owners first is each provider's approval.
8. **The pace of an own mailbox (call 10)**: a new chain's gap is 20 minutes (`REACH_OUT_GAP_FIRST`); a cold email
   arrives 9 to 5 in the lead's time, inside its open hours (`SEND_DAY_FRAME`); a mailbox's steps after the first go
   before its first emails when both are due (`reach_out_claim_from`), and the playbooks sweep plans a chain's later
   steps before its first.

The names say "said" (`said_at`, `said_by`, `reach_out_send_said`, `reach_out_reply_said`, `p_said`): "told" already
means the notice a reply sends (`reach_out_reply_told`).

## Shape

00428 (working number): the column, the state and its guard (claimed → drafted; drafted → sent | skipped), the two
claims, the clock's reads (finishable, closed, held stale, the sweep's trigger), the two doors, the replies' `owner`
claim with `said_by`, Stop writing, Leave out and Save taking a draft back, the lines' `drafted` and `to_send`, and
Reports' mailboxes naming the owner's own inbox apart (`yours`), from the emails before 00424 that left from no mailbox
either. Edge: the sender's owner branch and claim loop, the replan's owner path, the check sweep without the lane gate.
Dashboard: `POST /api/v1/reach-out-sends/[id]/said`, `POST /api/v1/reach-outs/leads/[id]/said`, the run's To send
(Gmail, Outlook and mail-app links, `reach-out/owner/compose.ts`), Today's drafted row, the sheet's From and Pace, the
peek's Send it and They wrote back. An owner with a reach-out a day and its follow-ups has a run for each, so the emails
handed over are also one list: Sent's To send (`broadcasts/to-send`, `reach-out/to-send-all.tsx`), every run's To send in
one pane, the oldest run first, each run's part its own detail drawn by the run's own list. Today draws two or more such
runs as one row that opens it (contracts `toSendRunsOf`), and every door to the waiting runs goes there when each waits
only for its owner (`waitingRunsDoor`). No route of its own: Sent's list says which runs hand emails over, and each run's
detail what they are.

## Tests

`reach-out-drafts/owner-sends.db.test.mjs` on a stack (the guard, the claim's order, Sent, Skip, the reading, the
give-up, Stop and Leave out, Save); the one To send's rules (`reach-out-drafts/to-send-all.test.mjs`); the send clock's
owner path over `_fake-db.mjs`
(`cron/cron-reach-out-door.test.mjs`); the foot, the timetable, the sheet, the lens and the peek's words in their own
files.

## Risks

- An owner who never says Sent leaves a draft for fourteen days; its run stays open until then. A draft given up, or
  skipped by its owner, still counts as the lead's first email (00427's one-first rule): the lead is not written to
  again by this reach-out or another, and To send says so at Skip ("nothing more is written to them"), where it said
  "out of this run". Kept so on purpose: a business its owner chose not to write to is not handed to the next
  reach-out. Releasing a skipped lead (were it wanted) is more than the index: one reach-out per lead is also its
  search's membership (reach_out_add's `elsewhere`, lead_chain_of), so it would take the one-first index rebuilt alone,
  reach_out_why_not, the audience leaving it out of the reach-out it was skipped in, and those two.
- An owner's word is the only proof an email went; a bounce or a complaint reaches their inbox, never ours, so Reports
  says no share for their row.

## Open questions

None owed by this lane. Companies with named people (call 8) stays owed by 0057.
