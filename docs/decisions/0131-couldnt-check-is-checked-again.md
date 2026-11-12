# 0131 · "Couldn't check" is checked again

**Status:** Accepted by Ruben, 12 November 2026, and built ("Yes, build it", on `docs/2026-11-12-couldnt-check-plan.md`, with its
two recommended choices: two automatic retries, a day apart, for every "Couldn't check" address). Written against main
at `82962d0773`.

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

## Held by

`tests/leads/workbench/couldnt-check-is-checked-again.db.test.mjs` (the door takes a kept lead; the clock asks a day
later, at most twice, never with searching off; its door is the service role's), in CI's database suites;
`tests/sequences/people/couldnt-check-is-checked-again.test.mjs` (the People read asks why of the listed leads alone;
Check again covers the leads added whose address could not be checked; the words).
