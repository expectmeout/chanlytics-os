# 0056 · A reach-out takes the leads you add

**Status:** Built on the lane `leads/workbench` from main's `38d3f2529`, 13 October 2026, and merged in its pull request
(Ruben chose canvas B v2 of the lead workbench on 13 October 2026, https://claude.ai/artifact/9WafSeCumGch2fNCEFf4Dy,
version 16, approved every call on its Model board, and asked for it built end to end; "continue and merge" the same
day). The number is the next free one after main's 0055. Where this note and the code disagree, the code wins.

## Context

A lead search found businesses and a reach-out wrote to them, but nothing went from one to the other a lead at a time:

- **A reach-out wrote to a search's whole audience or to a list chosen once.** A list-fed reach-out could not take
  another lead, and the rule for "would this lead be written to" was spelled inside the audience alone.
- **Leads had no way through a search one lead at a time.** Keep, exclude and put back were find's; nothing put a lead
  off without deciding it, and nothing said which reach-out a lead went with.
- **What came of a reach-out stopped at its emails.** A booking marked the lead, but a won deal never reached its line
  or the report, a visit did not name its lead, and a lead who said "not now" until a day had nowhere to come back.
- **Every page said a lead's place in its own words**, and the person page said "still writing" after a reply.

## Decision

The ten calls of canvas B, as approved:

1. The page word stays **Reach-out**.
2. **A reach-out fed by a list takes more leads**; a finder search never gains a lead it did not find (amends Part 7
   J7's last sentence and spec 4.2). `reach_out_add` appends, copying fit, reason and share marks from where each lead
   was found; `reach_out_why_not` is the one predicate for "would this lead be written to", and the audience is built
   on it.
3. **A list-fed reach-out's first-email run always waits for its owner's say** (core `runReachOut`, `fed_by`).
4. **Same-day adds**: a step's day is stamped only when a run was made or the step is off.
5. **Later** is the pile's soft word (`lead_member_later`); Skip stays the run page's.
6. **An operator undoes their own** add, later, leave, stage and bulk acts (`lead_undo`).
7. **Sending order**: drafts the owner sends first, then Outlook, then Gmail. Not built here (below).
8. **Companies with named people.** Not built here (below).
9. **No second reach-out to a lead** (`reach_out_sends_one_first`, 00424): one who said "not now" comes back on their
   day in **Back today** (`leads_back_today`), to write to by hand.
10. **Pace defaults** for an own mailbox: one email every 20 minutes, 9 to 5. They belong with call 7.

What it built (00423, 00424; the plan in `docs/superpowers/plans/2026-10-13-the-lead-workbench.md`):

- **The pile** on Leads: a search gone through one lead at a time (`leads_page`'s `pile` sort, `lead_pile_counts`),
  with Add, Later and Not a fit, Undo three deep, and a list of its own made at the end ("Write to the N").
- **One standing line** (`reachOutStandingOf`), which Leads, the drawer, the person page, Inbox, Today and Ask read.
- **Who is in a reach-out**: one rule (`reach_out_people_of`) for the drawer's People (waiting, writing, done, each row
  with its real inverse: Open the run, Leave out, Stop writing) and the ledger's People cell; an address of its own,
  `campaigns/moment:<id>:people`; Add leads and New message's Write to leads.
- **What came of it**: won from deals that name their lead, on the line, the story, the report and the drawer; a visit
  names its lead (`appointments_lead_stamp`) and the 6 PM line counts the bookings; Back today.
- **Ask** proposes an add as a card (`propose_campaign` action `leads`, gate approve, undo "Take them back"), never
  approves a run, and reads a lead's standing.

## Consequences

- Owed, as lanes of their own: drafts the owner sends and the mailbox pace (calls 7 and 10, beside the own-mailbox lane);
  companies with people named on them (call 8); a visit's origin drawn on the Calendar's visit sheet (the data is
  stamped); Today's "N added since your last approval" on a list-fed run; the card's first-email preview and the place's
  signals.
- `lead_operations`, `lead_search_members` and `reach_out_sends` gained writers (argued under Rises in `docs/debt.md`).
