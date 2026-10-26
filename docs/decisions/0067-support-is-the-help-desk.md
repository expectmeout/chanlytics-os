# 0067 · Support is the help desk

**Status:** Decided by Ruben on 21 October 2026, and built on the lane `console/support-help-desk` from main's
`01de97952`: step 1, the queue and the door, in one change, its migration 00468, merged in #1774 the same day. Step 2,
worth reaching out, is to come.
The Support review's second pass set the rule ("the app should be working so we only want to have support in regards
to helping users take advantage of the app properly or set up their agent better … not helping with like ux ui broken
issues as via the health page we will be analyzing these things separately later"), and his answers set the inbox
(hi@chanlytics.agency, hi@chanlytics.com later) and the promise ("We answer within 24 hours on business days").
Review: https://claude.ai/artifact/J9YfCMDPLEFDkFN8oxmAbc, written against main's `29071de24`. Where this note and the
code disagree, the code wins. The status was read again at `e9d6325f0` (26 October 2026).

## Context

Decision 0066 gave the Console a Support screen built around what a member reported: the reports of a week or all of
them, capped at 200, an error that reached several workspaces shown once above them, and the setup asks under them. It
had no way to say a report was answered, no clock, and no help for the person answering: the steps for a setup ask lived
only in the edge's mail to the pager's mailbox, and the owner was told "You will hear from us by email". A member's
question about using the product and a page that broke for them arrived the same way and sat in the same list.

## Decision

1. **Support helps people use the product; Health has what broke.** At Get help (the door that was Report a problem)
   the member says what they need first: How do I…, Help setting up, Something isn't working, or Billing
   (`support_reports.kind`: how_to, setup, wrong, billing). A failed card and the error screen open it on Something
   isn't working, with the error; Settings opens it on a question, and the error then goes with nothing. A report kept
   without a kind is judged by its error: one caught is `wrong`. `wrong` lands on Health, the rest on Support, and every
   one is mailed to the inbox and answered by a person. Either page moves a report across with one press.
2. **One queue, sorted by a promise.** Questions and setup asks in one list, late first, then the oldest. The promise:
   a person answers within 24 hours of business days, counted Monday to Friday in New York (`SUPPORT_ZONE`, a
   constant; holidays not counted yet). Members read "within one business day", on the sheet once sent and in the
   bell note of a setup ask. A row past its day is in Home's Due too.
3. **Three views, no ticketing.** Needs a person (new, or taken: the workspace's existing claim), Waiting on them (a
   setup ask answered, until the workspace shows the work is done), Done (the last thirty days). A row's state is read
   from the team's acts, never kept on it: `report_answered`, `report_reopened`, `ask_answered`, `ask_done`,
   `ask_reopened`, each one press whose reason is the row's own code as a ticket (R-1044, an ask's A- and six of its
   event's id). An ask for a line is done when the workspace has one; forwarding, when a test call comes through after
   the ask; the rest are marked done by hand until the Console can read them.
4. **Topics, not errors.** A question's topic (WhatsApp, forwarding, a line or number, calendar, billing, language,
   hours and prices, team and alerts, other) is read from its words and page by a keyword table in contracts, at read,
   never stored. A model classifier only if the keywords miss too often: it would spend the platform's key per report.
5. **A playbook per topic and per ask.** What to check first, the steps, and a reply with their first name in
   (`support-playbooks.ts`). The edge's setup-ask mail reads the same steps, so the Console and the mail never
   disagree. The replies are copied into the inbox and sent from it; the Console sends nothing to a member.
6. **The inbox is one address the Console opens.** `SUPPORT_INBOX_URL` (the dashboard's) is a search's address with
   `{q}` where the words go: Answer in the inbox opens it on the R-number; unset, the Console copies the code. It moves
   to hi@chanlytics.com with the edge's `SUPPORT_TO`, together.
7. **A report the inbox did not get is sent again** from its row: the edge's support door, on behalf of the member who
   wrote it, logged as `report_resent`, its reason the code.

## Shape

- `supabase/migrations/00468_support_is_the_help_desk.sql`: `support_reports.kind` and its index, the old reports with
  an error made `wrong`; `platform_acts.target_kind` gains report and ask; `setup_request()`'s five bell notes say the
  promise and what to have ready.
- `packages/contracts/src/console/support.ts`: the clock (`supportDueAt`, `businessMsBetween`, `supportWaitOf`), the
  topics, `askDoneOf`, the queue (`supportQueueOf`, `supportPageOf`, `supportDue`, `answeredMedianMs`), the words.
  `support-playbooks.ts`: the playbooks, read by the Console and the edge alone. `shell/report-problem.ts`: the kinds
  and the sheet's words.
- `apps/dashboard/src/server/platform/support.ts`: the book the queue is built from (ninety days of questions and asks,
  who sent each, the team's marks, the claims, the workspaces, the forwarding tests), cut to one page's rows, which the
  page builds again in its reader's zone; the three presses. Routes: `GET platform/support`, `GET
platform/support/bugs`, `POST platform/support/mark`, `POST platform/support/resend`, `POST platform/support/kind`.
- The Console's Support: a queue (four columns on a desk, rows on a phone) and the one opened beside it (a sheet on a
  phone), keys on a desk. Health lists the bug reports, grouped by error.

## Steps

1. The queue and the door (this change). Either deploy order: a dashboard from before 00468 writes reports with the
   column's default and reads nothing of it; 00468 is applied before this merges, since its reads name the column.
2. Worth reaching out: workspaces that would get more from the product with a nudge, from signals the database keeps
   (hand-offs, unanswered holds, corrections, stuck in setup, a trial ending, quiet); asks mailed to the support inbox
   rather than the pager's.

## Not in this note

Help cards under Settings › Help (deferred, his word, 21 October); Ask answering how-to from the playbooks; the inbox
thread's state beside a row; Health's own analysis of what breaks, which is that page's to design.
