# Drafts you send, and the mailbox's pace (the workbench's calls 7 and 10)

Decision 0057 owes two calls of the lead workbench as a lane of their own: **7**, the sending order (drafts the owner
sends first, then Outlook, then Gmail) and **10**, the pace of an own mailbox (one email every 20 minutes, 9 to 5 their
time, follow-ups first). Ruben approved both with canvas B v16 on 13 Oct 2026, whose Sending board says of drafts:
"Works for every owner on day one, and stays the fallback for any mailbox that can't be connected". The 4 Oct spec
(`docs/superpowers/specs/2026-10-04-reach-out-drafts-the-owner-sends-design.md`, approved as recommended) is the design;
it was written before decision 0056 put the mailbox engine in, so this plan grounds it on main at `ca41d8e6f`. Where
0056 says it supersedes that spec's step 1, 0057 (merged after it) keeps drafts as the first sender, beside mailboxes.

Built on `reach-out/drafts-you-send` in `cm-phone`, locally; no commit or push until Ruben's word.

## What changes from the 4 Oct spec, and why

1. **A reach-out says who sends it.** 0056 made an empty `mailbox_ids` mean "every connected mailbox", so "no mailbox"
   cannot mean "you send". The root gains `playbooks.owner_sends` (a root's, as `signed_by` is). The sheet's From offers
   **You send them** beside the mailboxes; with none connected it is the only choice, and Start no longer waits for a
   mailbox. Switching a chain later is safe both ways: the mailbox claim never takes an owner chain's send, and the
   draft claim never takes a mailbox chain's.
2. **The wire stays.** Nothing of 0056 is removed. The draft path is a second claim and a branch of the writer, not a
   replacement for them.
3. **The way out is in words.** A draft carries the cold foot with "Reply 'no thanks'" and no link: the owner's own
   client carries no List-Unsubscribe header. `coldParts` takes a null link (0056's 7 already makes the reply the way
   out).
4. **Drafts run without the unsubscribe's seal.** The send sweep claims drafts before it asks for `UNSUBSCRIBE_SECRET`,
   which only the mailbox lane needs.
5. **What they wrote back** is said by the owner on the lead and read through the same plan as a model's reading
   (`reach_out_reply_apply` with `p_said`); the owner's reading converts and opts out through the `reply` source (it is
   a reply, as a person says it), the row says `claim = 'owner'` and who said it (`said_by`), and it is keyed to a note
   in the owner's words on the person's email thread (`reach_out_replies.message_id` is a message). The names say
   "said", never "told": `reach_out_reply_told` and `told_at` already mean the notice a reply sends.

## The calls made here (product calls, the best ones)

- **Thirty drafts a day per chain**, all due when the run goes ahead (approval, or the veto's thirty minutes): the owner
  is the pace. `REACH_OUT_DRAFTS_PER_DAY = 30`.
- **A draft waits fourteen days**, then is skipped `kept_waiting`, as a held send is.
- **The person is made when the owner says it went**, never at the draft.
- **A paused chain keeps its drafts**, and they may still be sent; pausing stops new ones.
- **The pace of an own mailbox** (call 10): a new chain's gap is 20 minutes; a cold email arrives between 9 and 5 in the
  lead's own time, inside its open hours (was 8 to 8); when a mailbox's sends are due together, a step after the first
  goes before a first email; the playbooks sweep plans a chain's later steps before its first, so a nudge is placed
  before new leads fill the day.

## Parts

1. **Database** (`00429_an_email_the_owner_sends_is_handed_to_them.sql`, working number): `playbooks.owner_sends`;
   `reach_out_sends` state `drafted`, `drafted_at`, `draft`, `said_at`, `said_by`; the guard's moves (claimed → drafted,
   drafted → sent | skipped); `reach_out_claim_drafts`; `reach_out_claim_from` follow-ups first and never an owner
   chain's send; `reach_out_finishable`, `reach_out_held_stale`, `reach_out_closed_sends` reading drafted;
   `reach_out_send_said`; `reach_out_replies` claim `owner` and `said_by`; `reach_out_reply_apply(.., p_said)`;
   `reach_out_reply_said`; `reach_out_save` taking `owner_sends`; the lines saying drafted; the report's mailboxes
   naming the owner's own inbox apart (`yours`). Then the generated files.
2. **Contracts**: the send state, the chain's `owner_sends`, `reachOutDraftOf`'s words of a draft, the compose links
   (`reach-out-compose.ts`, `leadMailto` moved in), the foot without a link, `ReplyClaim` `owner`, the run's `drafted`,
   Today's drafted row, the lines' and the timeline's words, the sheet's From and Pace, the pace constants.
3. **Core and edge**: the planner's owner path; the draft claim and writer; the sweep without the seal for drafts; the
   clock; the replan; the playbooks sweep's order.
4. **Dashboard**: `POST reach-out-sends/[id]/said`, `POST reach-outs/leads/[id]/said`; the run's To send; Today's row;
   the sheet; the drawer; Leads' line, peek and They wrote back; the person page and Reports naming "your inbox".
5. **Tests and documents**: db tests on a throwaway stack, unit tests of the pure parts, door tests; a decision note,
   the glossary, the runbook, the PRD.

## How it is proved

As the workbench was: contracts by unit tests, SQL on the throwaway stack, routes over `_fake-db.mjs`, the pages in the
real app (desk and phone), and `corepack pnpm check:local` before any push.
