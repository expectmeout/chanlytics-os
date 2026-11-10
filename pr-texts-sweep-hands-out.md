The texts sweep (00594, #2065) read every texting line's record from Twilio inside its own ten-minute tick, oldest line
first, for forty seconds: about a hundred lines, and past that the newest lines were never read. Now its clock hands each
workspace with a line that texts one `texts_read` job, as the calendar's and Google's clocks do (decision 0115), and the
ledger runs it with its retries and Health. And a line's record is read back page by page: Twilio answered only its
newest twenty texts, so an outage that brought one line more than twenty lost the older ones.

## What changes for a customer

- A text that arrived while our door was down is taken in at any size: every workspace's lines are read every ten
  minutes, however many workspaces text, and a line's whole last day is read back (fifty texts a page, five pages).
- Nothing else: the door decides each recovered text as it always does, and a late one is still held for a person.

## What moved

- `00605`: one row, `job_kinds ('texts_read', 2, array['@tenant'], false)`: the bulk lane, once per workspace while one
  waits or runs.
- `apps/edge/lib/sms/texts-sweep.ts`: `sweepUnheardTexts` (the clock's door) reads which workspaces have a line that texts
  on this edge's provider and hands each one job (`handOutJobs`, spread over five minutes); `textsReader` is the job,
  reading its own workspace's lines and starting none past its deadline (a line left is read on the next tick).
- `packages/channels` Twilio `recentTexts` follows `next_page_uri` until a page reaches past its moment, at most five.
- `packages/db` `findLinesThatText` takes a workspace.
- The kind in every list a kind is named in: contracts `JOB_KINDS`, its payload, Health's label, its words; jobs
  `KIND_POLICY` (no speaking, tried twice, the platform told), the handed-out page, the settlers, the runner's `texts`
  slot and its handler; the edge's job tick injects the reader.
- `docs/capacity.md`: the texts sweep has no ceiling now. The runbook and the PRD say the clock hands out.

## To set or apply before merging

- **Apply 00605 to production before the merge**: the new edge hands out a kind the ledger refuses without its row.

## Deploy order

00605, then either app.

## Debt

Debt: a new job kind and its log line are one name each in the closed lists that declare them once (`JOB_KINDS` in contracts' `shared/enums.ts`, `LOG_EVENTS` in the edge's `shared/log-events.ts`); both files were past 800 lines before this, and splitting either is its own change, not this one's.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
