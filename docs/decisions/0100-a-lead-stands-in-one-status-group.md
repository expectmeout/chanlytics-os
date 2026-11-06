# 0100 · A lead stands in one status group, and what needs you comes first

**Status:** Built on the lane `cm-table-works` (`table/every-cell-says-two-lines`), 5 November 2026. Migration 00552. The
read's cost was measured on production before it was written; the suite that holds it runs in CI's Database job.

## Context

Leads was a list to read. Sorting by Stage walked the stored stages, so a lead waiting on an OK stood among the leads nobody
had written to, and the Filter button sat apart from the column it filtered. Nothing said how many of a view could be reached
without reading it.

## Decision

**One rule says where a lead stands in the queue.** `lead_status_groups` answers `needs` (its place waits on the member: an OK,
a hold, an email theirs to send, a reply, or on a list no batch can take it) and `in` (any other place that stands). A lead it
leaves out stands in neither. `leads_page`, `lead_view_counts` and `lead_bulk` all ask it, so the order, the counts, a filter and
"all that match" cannot disagree. The place is the one the row says, by `sequence_places_of`'s rule.

**The word is status group.** "Band" already means Leads' class tabs and fit bar, and "bucket" the pile's bulk door.

**Three groups, not six.** The rail's lists already filter by stage. A heading that filtered by stage too would show two
different counts for "Contacted", so the Stage heading filters by the three alone.

**Sorted by Stage, the page is the queue:** what needs you, what is in a sequence, then the rest in the stages' order, the newest
first within each. A head stands before each run, kept drawn among the windowed rows and held under the heading while its group
scrolls, which is what lets a row stop repeating its group's word.

**A heading holds its own filter.** Stage's menu holds the three with the view's counts; Reach's holds the two the Filter button
held. The button is gone from a desk. A filter on stands lit at its heading with the menu closed, and in the foot with Clear
filters, even if its column is hidden. A phone's Sort sheet takes the three as chips; a phone's cards draw no heads.

**Named views are a page's saved view.** `memberships.views["leads-named"]`, six at most, through the door any page's view goes
through, so they are no new door and no migration. Three starters are offered and never stored. No view shows a count: that
would read every lead's status on every first page.

## What it costs

A read of status groups covers the whole view, because one page's rows cannot say what the next page holds. `leads_page` reads
them only for a stage sort or a status filter; `lead_view_counts` on every first page, for the menu and the foot.

Measured on 5 November 2026 on the largest workspace (174 leads): a view's places 16 ms; why a lead on a list is not planned about
0.4 ms a lead, asked only of leads on a list (3 that day). So 300 leads waiting on lists would be about 115 ms a read. If that
outgrows a read, the fallback is storing the reason on the write side, a change of its own. `lead_list_counts` is left alone.

## Either deploy order

A server before the migration asks nothing new of it. A server after it on a database before it reads no group and no counts of
them, and the old read ignores a filter it does not know: the heads then fall back to the stages' words, and the foot says what
it could read.

## Not decided here

Real links on names; heading menus on People and the Pipeline; folding a group; Ask filtering by status group. Ask's leads tool
reads the same `leads_page`, so its `stage` sort now answers what needs you first; its words do not change.

Needs you here counts leads, and Today's Need you counts decisions (one OK may cover nine leads). The Stage menu's caption says
so, so the two numbers are not read as one.
