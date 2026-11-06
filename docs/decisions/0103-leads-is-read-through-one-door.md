# 0103 · Leads is read through one door, and every fact a row holds can be shown

**Status:** Built on the lane `cm-table-works` (`leads/columns-right-at-volume`), 6 November 2026. Migration 00554. The reads were
compared with production's on its own data before they were written, rolled back each time; the gate below is read from CI's
Database job, since no local stack can run it.

## Context

Leads was built for the leads a workspace has today. Read against a workspace at its ceiling (50,000 leads, 60,000 memberships,
40,000 enrollments, 150,000 lead sends, 100,000 customer sends), four things gave way:

- `sequence_places` walked every send of the workspace for every page: Postgres plans a SQL function without its arguments'
  values, so `(p_lead_ids is null or s.lead_id = any (p_lead_ids))` is never an index condition.
- A page, the counts and "all that match" each said which leads a view holds in their own words, each calling `lead_matches` a
  row (32 µs a call), so a page sorted by Found at 12,000 rows took 506 ms.
- The browser made every loaded row again on every change: 763 ms at 12,000 rows.
- An export stopped at 10,000 rows without saying so, a response being held to 4.5 MB.

And a member could not see most of what a row already holds, or sort by it.

## Decision

**One door says which leads a view holds.** `lead_view_rows` answers one row a lead, with what a sort, a filter or a count reads of
it and no more, under the caller's row security. A lead in two searches keeps its strongest-fit membership, then its newest.
`leads_page`, `lead_view_counts` and `lead_bulk` read it, so the rows, the counts and a bulk act cannot disagree, and `lead_matches`
is dropped. `leads_page` builds its sort key over the door's rows and reads the whole row for the page alone.

**The reads are planned with their values.** `sequence_places`, `lead_view_rows`, `leads_page` are plpgsql over `return query
execute`, so a null argument folds away and a list of leads is an index condition. Each sets `work_mem = '64MB'` for its own call:
production's default of 3.5 MB spills their sorts to disk.

**Where a lead stands is computed, not stored.** Storing it means triggers on the send path, and a stored status can drift. A
whole-view read of the queue asks only what stands (`p_standing_leads`): a lead's open sends, each the newest of its lead there, through
an index of open sends alone, so what was sent long ago costs it nothing. A named search hands its own leads to that read; All leads
reads it whole. Why a queued lead is not planned costs about 0.3 ms a lead, so it is asked of the hundred longest on a list.

**The queue is how the page opens** (`sort=stage, dir=asc`), and a saved view that names a sort keeps it. The API's own default stays
`fit`, so Ask is unaffected. Inside its groups: wrote back, then yours to send, OKs, holds, not planned, each oldest first; in a
sequence, the next send soonest; not contacted, by fit, then reach, then weighted rating, then newest found; contacted, the longest
since contact; talking and closed, the most recently moved. Under the Not contacted head a row says its fit with why under it, where
it was blank, and the pill beside the name gives way.

**Rated is weighted:** `(reviews × rating + 10 × 4.0) / (reviews + 10)`, so 5.0 from one review does not beat 4.8 from 900. The number
shown stays the real one, and the heading's tip says so. **Empty values sort last in both directions.**

**The box matches each word,** in any order, in the name, kind, neighbourhood, area, street, email or website; a word of three or more
digits also in the phone. Six words are read.

**Fourteen columns, off until asked for,** each from the row the page already holds, so showing one never waits on the network. The
Columns menu stands them under six headings, with a way back in one press (Show default columns). A business's name is a real link to
its lead; a plain press still opens the sheet.

**An export is any size, one file and one line a lead.** The route answers a chunk of about 3 MB, or what eight seconds read, and where
the next begins; the page asks until none is left, joins them and saves one file. Each chunk marks what it took, so only what left is
charged; the ledger row is written once. A later chunk tried twice and failing saves what it holds, and says so.

**The next page is read two screens before the end,** whichever box scrolls the list, and Show more stays for a keyboard and for a read
that failed. A refresh keeps the object of every row it found the same, and a row's words are made again only for a row that changed, a
search whose plan changed, or a new minute.

## The gate

The first page and its counts each answer within 300 ms at the ceiling above. `leads-at-volume.db.test.mjs` seeds that workspace on CI's
database, reads every sort and the counts as a member, logs each read's time and fails at one second, so a slow runner does not flake it.

## What it costs

A whole-view read of the queue still reads every open place of the workspace. If it misses the gate and the other sorts hold it, the
default goes back to Best fit, one value in four places, and the queue stays one press away; storing the status is then priced on its own.

## What this does not do

No new filters, heading menus or address segments: a search in the rail is already one kind in one area, and a typed filter system is
worth building once, when People needs it too. People and the Pipeline at this volume are the next lane; what migrants bring (an owner,
tags, custom fields) is the one after.
