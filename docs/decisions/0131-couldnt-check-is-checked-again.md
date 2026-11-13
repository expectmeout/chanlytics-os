# 0131 · "Couldn't check" is checked again

**Status:** Accepted by Ruben, 12 November 2026, and built ("Yes, build it", on `docs/2026-11-12-couldnt-check-plan.md`, with its
two recommended choices: two automatic retries, a day apart, for every "Couldn't check" address). Written against main
at `82962d0773`. Amended 13 November 2026 ("apply and then fix the list"), against main at `29c61280da`: Mended, below.

## Context

An address whose mailbox check gives no verdict is "Couldn't check" (`leads.email_state = 'unknown'`). It gets there
three ways: the checker gave no answer for it, the checker's run was refused, or searches were switched off or the plan
had lapsed when the check came due. No sequence writes to it (`reach_out_why_not` says `unchecked`).

Nothing tried again by itself: core's check takes addresses in `checking` alone. Check again, the one way back
(`lead_check_again`, 00506, decision D3), took a lead only while it was in Needs review. A lead the search judged a fit,
or one its owner kept, whose address could not be checked, could never be checked again by anyone. On 12 November that
was 4 of Ruben's 17 such leads, and Brooklyn's three among them: they had stood on a running sequence's list since
25 October, and the Sequences list's new line, "3 leads couldn't be checked", pointed at a button that refused them.

A check costs $0.00089 an address (`LEAD_CHECK_CENTS_EACH`) and counts against the workspace's day and month of
searching, as a search does (`lead_check_ask`, `lead_spend_room`).

## Decision

1. **Check again takes a kept lead** as well as one in Needs review, while its search's round has finished. Never a lead
   left out, an address that was checked, or a lead with no search behind it (no round to check under).
2. **The leads clock asks again by itself** (`lead_check_retry`, called by the leads sweep each tick, at most 200 a
   tick): each address a day after its last check, at most twice (`leads.email_rechecks` counts the clock's tries; a
   press is the owner's and is not counted), inside the workspace's searching budget, only while its searching is on and
   it may spend. A try that finds no room is not counted. After the second it stays "Couldn't check", for Check again.
3. **The fix is beside the problem.** A sequence's People say why each lead added and not planned cannot be
   (`sequence_queued_why_not`, the door the Leads page asks), and offer Check again over those whose address could not
   be checked ("Check these 3 again"), through the Leads page's own door: its role (`find`) and its spend rules.
4. **The words follow.** A lead's card says its address "couldn't be checked" (it said "hasn't been checked yet"), and
   decision 0128's note says where the fix is.

## What it does not do

- **A lead added by hand, with no search behind it,** has no round to check under: Check again skips it, as before.
- **An address that changes** keeps the clock's count of tries for the old one. Check again still asks it.
- **The lead's own card offers no button:** its sequence's People and Leads' Needs review do.

## Mended (13 November 2026, migration 00623)

Read on production the day after it merged, and at the volume it is built for, the first build fell short. Each of these
is mended in `00623` (built as 00622, so the function comments in production still say so: another branch's 00622 went on first):

1. **The clock never ran on a quiet day.** The database calls the leads sweep only while a search is live
   (`trigger_leads_sweep`), and the retry was a step of that sweep, so with no search running no address was asked
   again. It now calls the sweep too, once an hour, while an address is due or stands `checking`.
2. **One workspace could hold every other's retries back.** The door took the 200 addresses that had waited longest
   across all workspaces; one with no room in its searching was refused, uncounted, and stood at the head of that line
   until its month renewed. It goes a workspace at a time, a quarter of the call's limit each, and leaves one with no
   room for the next.
3. **A check that died left its address `checking` for ever.** A check asked after its round ended rides a job of its
   own, which settles nothing when it fails for good; the address was then never asked again, refused by Check again and
   never written to. The clock gives it back to "Couldn't check" once no round of its is open, no check job naming it is
   on its way and no check run of its rounds is live or began within the hour.
4. **An address on a name kept for examples is never asked** (RFC 2606: `example.com`, `.test`, `.invalid` and their
   kind, which a demo's sample leads carry): its tries are spent unasked, so no check is paid for it and it says at
   once that it could not be checked. A press of Check again is still its owner's.
5. **An address never checked is due**, where a time that was never written was never "a day ago" (a new address chosen
   with no room in the day's searching); and a new address gets its two tries back (`lead_addressee_choose`).
6. **The list waits with the clock.** A lead whose address could not be checked was filed under Needs you from the first
   day, while the clock was still going to ask again. The list's read says how many are being checked again
   (`rechecking`: "3 addresses being checked again", where nothing of the sequence goes next), and counts as stuck
   only those whose tries are spent.
7. **The Added fold promises a batch only to the leads one can take** ("1 in its next batch", "none can go yet"): it
   said "in its next batch" of a fold whose every lead was refused.

Also: the clock's rows are locked while it asks, so a press at the same moment is no try of its own; and its reading
list (`leads_recheck_due`, by workspace) leaves out the addresses whose tries are spent, which stood in the first
index for good.

Not changed, and its owner's to decide: a retry that answers promotes a lead held in Needs review for its address alone
to kept and counts it in the month's allowance, as Check again does (`lead_check_commit`), now with nobody pressing.

## Held by

`tests/leads/workbench/couldnt-check-is-checked-again.db.test.mjs` (the door takes a kept lead; the clock asks a day
later, at most twice, never with searching off; its door is the service role's; and what 00623 mended: a name kept
for examples, an address never checked, a check that died, a workspace with no room), in CI's database suites;
`tests/sequences/people/couldnt-check-is-checked-again.test.mjs` (the People read asks why of the listed leads alone;
Check again covers the leads added whose address could not be checked; the words).
