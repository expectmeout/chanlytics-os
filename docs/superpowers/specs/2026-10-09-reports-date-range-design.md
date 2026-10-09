# Reports reads the days a member picks

**Asked by Ruben, 9 October 2026:** the date control beside Reports' strip of lenses should say what it is on, as the
Calendar's options do, and a glyph alone only where there is no room; and the calendar it opens should let a member
"select specific dates instead of the preset days", with "the wiring" working "cleanly with the charts", end to end. He
approved four decisions from the analysis: a range is 90 days at most until a longer read is measured, days a member
picked live in the address, a range may be one day, and every figure stays compared with the days before it (a year
before is a later change). Written against `ba00408e5`.

## What it was

One closed set of four periods (`7d`, `30d`, `90d`, `month`) ran through everything, and every layer under the control
knew only a count of days ending today: the request (`?period=`), the reader (`reportDaysFor`), and the four SQL
functions, each anchored on the workspace's today. The control was a glyph in a circle that opened the four periods over
a month which drew the period and "chose nothing".

Two things made the change smaller than it looked. The view models were already window-shaped: they take `days` and a
series of twice as many rows, and only the anchor had to stop being today. And the charts already cope with length.

## What it is

A report is read over a **range**: a period by name, or the days a member picked (`ReportDays`, a first and a last day
in the workspace's own zone). One function turns a range into days for every layer, `reportWindowOf(range, today)`
(contracts `reports/report-window.ts`), and nothing in it reads a clock: the workspace's today is the caller's to say.
What a range is and its one name (`reportRangeKey`) are `reports/report-periods.ts`'s, which every page loads for the
frame's strip; the control's words are a module of their own, so they load with Reports' page alone.

| Layer | What it does |
| --- | --- |
| Control | A capsule at the strip's right that says its word: "30 days", "Month", "Yesterday", "Sep 1 – 20". On a desk the half its word leaves out stands beside it. On a row too short for any word it is the glyph's circle, by the row's own width. Days in two months stand without the glyph beside a strip on a phone, so two tabs stay whole. |
| What it opens | The days in words, the days they are compared with, the four periods, three windows reached in one press (yesterday, last week, last month: days worked out from the workspace's today, never kept by name), and a month to pick any days on. |
| The month | The kit's `DayRangePicker`. Two presses choose, in either order; one day pressed twice is that day. Nothing is chosen until the second press. The band follows the pointer or the keys; days to come and days too far to be the other end stand down; Escape lets go of the first day. The ARIA grid the date picker is. It took the place of `MonthRange`. |
| Keeping it | A period by name is the device's (`localStorage`), as before, and is what Today's line reads. Days are the address's and nothing else's: `reports/people:2026-09-01~2026-09-20`, the Overview's the days alone. A link opens on them, Back walks them, every lens tab keeps them, and tomorrow's visit opens on the period. |
| First load | The document's head reads the address as the page does and starts the three reads over the days (`route-prefetch.ts`). |
| Request | `period`, or `from` and `to` together, never both (`ReportQuery`). What cannot be read is refused in words before the database is asked: days to come, more than 90, out of order, half a window, a day no month has. |
| Reader | `reportWindowFor` answers `{ days, end }`. `end` is null for days that end on the workspace's today. |
| SQL | 00360: `report_series`, `campaign_series`, `reach_out_report` and `reviews_ledger` take `p_end date default null`. The anchor is the window's last day, every source is read to the midnight after it, and the answer says `end` beside the real `today`. `reach_out_report` takes any count from 1 to 90. |
| Words | A window that ended before today is named by its dates and happened "in the 20 days to Sep 20", never "the last 20 days" (`periodWords`, `endedOn`). |
| Booking line | Not counted for days that ended: it follows people as they stand today. It says so. |
| Deals, Reviews, Google's gain | Counted over the window's own days, to its last day. |
| Ask | Reads the days on screen by their one name, and names them by their dates. |

## Decisions made while building

- **A pick is read on the second press, with no Apply.** The analysis proposed an Apply button so a mis-tap read
  nothing. The first press already chooses nothing, a wrong second press is one read and one press to correct, and Back
  undoes it. One step fewer for the common case.
- **A popover on a phone too**, not a sheet: it fits a 360px screen whole (312 by 577) and is the same control at every
  width.
- **Refused days are answered by the period.** A link to days the report refuses used to leave nothing to draw, and the
  shell said the workspace could not be reached. The read answers with the period kept, marked with the days it stands
  in for; the page says which days it could not read and the address takes the period's place.
- **The page asks for nothing while the document's first read is out.** That read is of what the address says. Asking
  beside it read the report twice and said a link's days had failed while showing them.

## What was proven

- 00360 on a real database: a window that names no day, today, or a day to come is the read it always was, to the
  byte; a window that ended is the same slice of the days whichever day it is asked from; nothing after its last day
  is counted; one signature each; a member may run each and a visitor may not
  (`tooling/scripts/tests/reports/periods/report-window.db.test.mjs`, and the reach-outs' in
  `tooling/scripts/tests/reach-out-back/what-comes-back.db.test.mjs`).
- The page in a browser over that database, at a desk and a phone, in Chromium and WebKit: a pick, the address, a lens
  over the days, Back, a shortcut, a period from days, a link opened cold with and without a cache, and three addresses
  that cannot be read.
- The kit's gallery draws the picker in both themes and at both widths, and every rule of its stylesheet.

## Deploy order

Either. A period by name passes no `p_end`, so the dashboard reads a database without 00360 as it always did. Days that
ended before today need 00360; until it is applied they are refused in words ("Picked days cannot be read yet") and the
page keeps the period.

## Left out

- Marking the days before a workspace's first activity on the month.
- "Same period last year". The window's `before` is a window of its own in the contract, so a second read fits it.
- A range over 90 days: measure a 180 and a 365 read on the real database first.
