# 0048 · One list of what needs you

**Status:** Decided on 11 October 2026 (Ruben: "all approved end to end as you suggest"), and built with 0047 in #1564
(12 October 2026): a STOP is news, one count, the bell closes what is done. Its amendments are built too: 13 October's
in #1579 (00421), 14 October's in #1595. 0046 lane A step 4
("one record for every wait on a person, begun as one read over the four that exist") and lane 5 of the Wiring
Blueprint of 11 October 2026. Written against commit `132ab95eb` (main, 11 October 2026). Where this note and the code
disagree, the code wins. The status was read again at `e9d6325f0` (26 October 2026).

## Context

What needs the owner is counted in four places. The sidebar's Inbox badge, the phone's Inbox tab, the browser tab's
title and the phone app's badge show whatever the last `inbox:counts` event said, and that event has two publishers:
Today after each of its reads, and the Inbox. The bell holds a "needs you" row derived in the browser beside the row the
edge kept for the same hold. A kept bell row stays unread after the thing it announced is dealt with: a run approved, a
booking email dismissed, an invitation accepted.

Two kinds of notice ask for something nobody can do. A customer's typed STOP opens an `opt_out` hold
(`apps/edge/lib/receptionist/deadman-sweep.ts:69` already says it waits for nobody), which sits in Needs you, Today's
queue and the badge, and sends a mail and a push. And a hold's bell row and push wait on its mail
(`apps/edge/lib/ops/notify.ts:328`, `keepThenMail`): a mail that fails takes the row back.

## Decision

1. **One read of what waits on a person**: a hold, a run waiting for approval, a held send. One count from it feeds
   the badge, the phone tab, the title, the phone app's badge and Today, through one function in contracts.
2. **A kept bell row closes when its subject stops waiting**: a run approved or skipped, a booking email dismissed or read
   again, an invitation accepted.
3. **A STOP is news, not a wait.** The customer's answer is recorded as today. The owner is told once, on the bell, and
   by mail only if they chose it. No hold is opened, so nothing sits in Needs you.
4. **The bell row and the push never wait on the mail.** The row is kept and the push sent first; a failed mail is
   retried alone.

## Shape

`waitsOf` and `needsYouCount` in contracts over the surfaces that already hold the holds and the runs; the badge,
the title and the phone read it. The bell's derived and kept rows meet in one rule. The receptionist's STOP path records
consent and keeps one bell row of its own kind; `keepThenMail` keeps the row, pushes, then mails.

## Steps

1. A STOP is news; the bell and the push do not wait on the mail (edge).
2. One count.
3. The bell closes what is done, and the away card and the bell group one way.

## Tests

The receptionist's gate tests (a STOP opens no hold and keeps one row); notify's tests (a failed mail keeps the row and
the push); the count's tests over the four sources; the bell's closing rule per subject.

## Risks

An owner who relied on a STOP in Needs you to notice an opt-out now sees it on the bell only. The bell row says it in the
words the Inbox uses.

## Open questions

None for the owner.

## Amended, 13 October 2026

The wiring's second audit (`docs/2026-10-12-chanlytics-wiring-second-audit.md`, lane R2) found the one count and the
closing rule half built. The amendment finishes both, in the shape above, with two layers to a close.

1. **The one count, everywhere.** `waitsOf` takes the business's days (`runDaysAt`), so a run waiting for approval
   counts only while an approval can still send it (`runApprovalRefusal`, the verb's own rule). A visit's run whose day
   has passed is skipped by the playbooks sweep as a system decision (`endRunsWhoseDayPassed`, `cancel_broadcast` with
   `reason: day_passed`), with no mail and no bell row. Today's head, its standing on the calm rung, the Inbox's head, Ask's
   Right now, Ask's `today` tool, the home-screen widget and the palette all read the count's parts: holds, replies
   counting down, runs. A closing reply window is said as a window, a search's question as a search, and neither is a
   person who needs you. Today's own read takes the runs waiting and the threads of the holds past its hundred
   (`heldThreadIds`, `HELD_BY_ID_MAX`).
2. **The server closes what ended for good** (`notifications.closed_at`, 00421). A hold that resolves closes its handoff,
   deadman and call rows (`escalation_closes_its_notices`). A round that leaves `waiting_on_owner` closes its question.
   `resume_email_offers` closes the pause notice. Kept good news closes the warning it mends (contracts `NOTICE_MENDS`,
   edge `mendWarnings`): a number's flag by its "back to normal", a payment that did not go through by a paid invoice, a
   domain's hold by its own domain's resume or release. A closed row reads as read and wears no warning on every device,
   on the phone's icon (`unreadFor`) and in a push (`push_send` sends nothing for a row closed before it ran).
3. **The browser closes what the surfaces it holds say is settled now.** Every kind the edge keeps says how its row
   ends (`NOTICE_ENDS`: news, mended, or judged by its source). A run's three notices are judged by Sent: waiting for a
   word, going unless stopped, emails the check holds. A hold's notice is judged by the Inbox, only from a read that took
   every hold with its thread. A question is judged by Leads. The phone's icon leaves out what the bell reads as settled
   (`settledNoticeIds`).
4. **The bell says what it does not list.** The bell lists its newest sixty rows (`BELL_LIST_ROWS`); the server counts
   the unread rows past them (`NotificationsDto.unread`), and the badge, the away card and the bell say them, with Mark
   all read as the act that clears them.

Held emails in a going reach-out run count on the badge (Ruben, 13 October 2026): they go nowhere until the owner
says, so they wait on a person. A going run whose check holds emails is one wait, however many it holds, as a run
waiting for approval is (contracts `runWaitsOnYou`, `runHeldEmails`; db `waitingRunsOf` reads them for the server's
Today and Ask). Today's queue, the Inbox's band and Ask's Right now list it with "2 emails wait for your say" and open
the run, where each is put back or skipped; the runs' sentence says "waiting for your say", which covers both kinds.

## Amended, 14 October 2026

The wiring's second audit, lane R13 ("Ask says what the page says"), found two of Ask's doors outside the count and
the close.

1. **Ask's Inbox doors count as the Inbox does.** The `inbox` tool's `needs_you` filter and the Inbox page's figure in
   Ask's page context read the holds alone: 4 where the Inbox said "5 need you" and Ask's `today` said 5. Both now read
   the Inbox's own rule (contracts `conversationWaitsOnYou` and `threadWaitsOf`, over `threadWait`): a hold nobody has
   taken, or a reply counting down that can still be stopped. The doors that say the count are now:
   - Today's head and its standing;
   - the Inbox's head, the badge, the tab and the title;
   - the phone's icon and the home-screen widget;
   - the palette;
   - Ask's Right now, its `today` tool, its `inbox` tool's `needs_you`, and the Inbox's figure in Ask's page context.
2. **Ask closes what the bell closes.** Ask's read of the notifications listed a run approved, a booking email
   dismissed or a review answered as still waiting, and counted it unread. It now closes them before it lists and
   counts (contracts `closeSettledNotices`), over what still waits, read on the server
   (`server/ask/tools/read/notice-waits.ts`):
   - the runs the notices name (db `runsNamed`);
   - every held booking email (`heldNoticeKeys`);
   - the reviews the notices name (`reviewsNamed`).

   A hold and a lead's question are closed by the server itself (point 2 above).
