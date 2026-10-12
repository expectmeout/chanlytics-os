# 0048 · One list of what needs you

**Status:** Decided on 11 October 2026 (Ruben: "all approved end to end as you suggest"), not built. 0046 lane A step 4
("one record for every wait on a person, begun as one read over the four that exist") and lane 5 of the Wiring
Blueprint of 11 October 2026. Written against commit `132ab95eb` (main, 11 October 2026). Where this note and the code
disagree, the code wins.

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
