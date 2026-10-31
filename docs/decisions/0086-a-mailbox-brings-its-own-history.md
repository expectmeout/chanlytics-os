# 0086 · A mailbox brings its own history, and its owner chooses how far back

**Status:** Decided by Ruben on 31 October 2026 ("Start lane 1"), after the review
`Claude Video/docs/2026-10-31-mailbox-history-review.md`. Built on the lane `imports/a-mailbox-brings-its-own-history`,
with migration 00499. Written against main's `55c162727`. It amends decision 0073 (R19, R20, R23): "connected means
filled" stands as the default, now one the owner may change.

## Context

Connecting a mailbox brought its last six months in (decision 0073, R19) with no say: the first run's card and the
Connections row told the owner, and never asked. The calendar and the contacts had a choice, Google's checkboxes; the
mail, the most personal of the three, had none.

Under it sat a defect. The imports ledger (00477) kept one row a workspace and source, and the job's place (its cursor)
with it, while a workspace may connect several mailboxes. A second mailbox connected while the first was still bringing
its six months in set the shared cursor back; each mailbox's parts then read on from the other's place (the cursor names
its mailbox, and the part never looked); and "done" could be written while the other was still reading. Nothing was
written twice (each message is kept once by its Gmail id), but the work was wasted and the progress was wrong. The 27 Oct
fix, summing counts across mailboxes as they were written, treated the symptom. The jobs' key for a part (00478) named
the workspace, the source and the run, not the mailbox, so two mailboxes' first runs ("1:1") took each other's part for
their own, and one stalled.

And there was no way to stop a run: only Try again, once it had failed.

## Decision

1. **What a mailbox brings is its own.** The ledger keeps one row a mailbox for the sources a mailbox brings (`mailbox`,
   `contacts`: contracts `PER_MAILBOX_SOURCES`), and one a workspace for every other, as before:
   `imports.connection_id`, unique with the workspace and the source, a workspace's own rows counting as one. Its cursor,
   state, counts and run belong to the mailbox they describe. A part's job key names its mailbox. The pages say each
   source once, every mailbox's rows added up as they are read (contracts `sourceRowsOf`), so the summing on write goes.
2. **A run holds its row.** A start takes the row for its run (`imports.run`); Stop takes it from every run; a write of
   a run that no longer holds the row changes nothing, in the door itself (`import_ledger_note`'s `p_run`, `p_take`), and
   its next part ends as it wakes (`history_part` with `ended: "not_its_run"`). So a part mid-read as the owner presses
   Stop never writes over the stop, and two parts never read one mailbox at once.
3. **The owner chooses, under Connect.** One quiet line under each Connect (the first run's email card, Connections):
   "Brings in the last 6 months of email from people. Change". Change opens the two ways in place, the kit's segmented
   control, each with its sentence: **Last 6 months** (the default) and **From now on**. The choice rides the signed
   state through the provider and back (`h`), and is kept on the mailbox (`mailbox_connections.history`). From now on
   starts no six months; the contacts and the calendar keep their own consent on Google's screen. A reconnect never
   asks again.
4. **Reversible, on the mailbox's row.** While it comes in: where it stands, and **Stop** (what came is kept). Stopped by
   its owner: **Resume**, from where it stopped. Failed: **Try again**. Connected from now on: "Email from Oct 31 on",
   and **Bring in the last 6 months**, once, whose window ends where the mailbox connected, where the live read began.
   One mailbox's acts sit on the Email card's Inbox fact; several mailboxes', on each one's line. An owner's acts alone
   (`POST mailbox-connections/:id/history`).
5. **Remove says it whole:** "Nothing more comes in or leaves from it. What it brought stays on each person." The first
   run's and the Connections row's sentences drop the six months: the quiet line says it, once.

Not chosen: more ranges (30 or 90 days). The reasons to opt out are yes or no, and every range is a window, a progress
bar and a line to keep.

## Steps, in either deploy order

- **00499** is applied before the merge. It adds the columns and the index, gives the rows already done or stopped the
  mailbox their cursor names (where it is still the workspace's), and replaces the door with one that takes the mailbox,
  the run and the take, each defaulting to none. An edge before 0086 names none of them and writes the workspace's row as
  before. A run still going in that row is handed to its mailbox the first time the new edge writes for it (its cursor
  names it, or it is queued or running and names none).
- The edge and the dashboard deploy in either order: a dashboard before the edge sends `history` the old edge ignores
  (the six months, as before), and the history route's ops answer `unknown_op` until the edge is there; an edge before
  the dashboard is never asked for the new ops.
- The 27 Oct recount script (`ops/imports-recount-mail.mjs`) leaves a ledger that holds a mailbox's own row alone.

## Owed beside it

The review's lanes 2 (the strangers the six months found asking, as a list with a reply drafted, and a notice when the
import is in) and 3 ("These look automated", once, for every workspace) are Ruben's pick.
