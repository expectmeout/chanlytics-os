# 0137 · Today says a thing once: no Since you looked, a card that leaves approvals to Need you, a bell for news, one switch for this browser

**Status:** Decided by Ruben, 17 November 2026 ("Build everything in one pr", after the review of his phone's Today), and built. No migration. Written against main at `c3bd898424`. Amends 0040, 0048, 0071, 0076, 0113, 0120 and 0124.

## Context

Ruben sent his phone's Today at 3:46 AM on Tuesday 17 November: "I don't like the since you just looked section display it is too bulky and cluttered", and "we cannot have so many different notification methods". The screen was read against the code. One batch of cold emails waiting for his approval was said five ways on it, with two numbers:

- the head, "1 needs you", and the Inbox tab's badge, 1: the one count (0048);
- Need you's row, "8 emails wait for your approval": every waiting run's emails (0120, D8);
- an amber card under it, "Your next 5 emails are ready for your approval": the newest campaign's run alone (0113's note);
- the bell's dot: the morning's reminder about the same runs (0120, D5);
- and above them all, "Since you last looked · 2 sent", open on a card of its own.

Four things were wrong.

1. **Since you looked said what something else already said, and said it for days.** Each of its five kinds has another home: what AI answered and what was booked are two of Today's four figures, a stop and a review are the bell's notes, read off the bell's own feed, and what the sequences sent is the bell's line at 6 PM (`reach_out_day`). It counted from the bell's `seen_at`, so a look at Today never moved it: on Tuesday it still showed Sunday's sends. Its row said one number three times ("…a nudge sent 2", "2 cold emails", under "2 sent"), its card stood in the head's slot, 56px narrower than every card under it on a phone, and its read cost up to forty-two queries on each Today load (`listSentSince`, one count per batch).
2. **The card and the row counted one fact apart.** The row sums every waiting run less what the check holds; the card read one run's `recipient_count`. Nothing kept both from drawing.
3. **The bell counted what the count counts.** A person waiting, a reply counting down, a run and a search's question each raise the one count on the Inbox's badge, and each is a note that raised the bell's number too. 0124 left this open ("What needs you is still a note").
4. **This browser's alerts were three controls for two mechanisms.** The page's own alert (a `Notification` raised while a tab is hidden) had a switch in the bell's foot and the same switch as a row of Settings › Notifications; the server's push to the browser (Web Push, D12) had a line of its own under the grid, "This browser is not told. Tell me here". A browser with both on was told each thing twice.

## Decision

1. **Since you looked goes.** The line, its panel, contracts `todaySince` and its types, `TodayVM.since`, GET today's `since`, the reader's `getSinceYouLooked`, db `findBellSeenAt`, `findAnsweredSince`, `listSentSince` and `findContactName`, the log event `today_since_fetch_failed`, and the kit head's `after` slot, which it alone used (`.pg-after`). News is the bell's; the day's numbers are the figures'. `PUT notifications` reads the bell again and no longer Today.
2. **A batch waiting for its OK is Need you's row, and the card never says it.** Contracts `coldEmailNoteOf` answers nothing for `waiting_ok`. The card stays for what Need you cannot hold: a mailbox to fix or reconnect, a step left before a first email, a paused mailbox over a batch (an OK alone would send nothing), nobody new to write to. The page's own answer (`coldEmailStandingOf`) is unchanged.
3. **The closed bell is for news.** A note about what Need you counts stays on the bell, wearing its dot, and adds nothing to the closed bell's number, its quiet dot or its swing (contracts `noticeInNeedYou`; `BellRow.in_need_you`). Judged by what the count holds, read off Today's rows, never by a note's kind alone:
   - a person (a thread that needs you, a reply counting down, the hold or held reply the edge kept, a lead's reply) while their thread is one of the count's rows, Up next or waiting;
   - a search's question while that search is one of the count's rows;
   - a run that waits for a word, or holds emails for a look, by the surface that holds it (`noticeStillWaits`).

   So someone who has waited past a week, who is Older and in no count, still lights the bell; so does a run that goes unless it is stopped, which is the day's; so does every note before Today is read, or where its read failed. No wait is left with no mark at all. A review to answer is To do's and a booking email the Calendar's: no badge counts those, so their notes stay the bell's to count.

4. **This browser's alerts are one switch, on Settings › Notifications.** The row "This browser" turns on the server's push where the browser and the deployment can take it, Chanlytics open or closed, and the page's own alert where they cannot; it says which ("Alerts as they happen · Even when Chanlytics is closed", or "When someone needs you right now · While Chanlytics is open in a tab"). Off is both. A browser the server tells is not alerted by the page too. Both left on from before read as on, by push, and alert once. An iPhone that must add the app to its Home Screen first is told so in the switch's place. The bell's foot is a door to that page ("Notification settings"); the second line under the grid goes. A subscription the server did not keep is let go by the browser, so it never reads as told (`webPushTurnOn`).

## What it does not do

- **The phone app's icon and a push's badge still count every unread kept note** (`keptUnread`, `unreadFor`, `getUnreadOfReaders`): outside the app there is one mark and no Inbox badge beside it.
- **A push, an email and the page's alert are sent as they were.** What is delivered is 0040's grid; this note changes what the app's own marks count.
- **Nothing says "AI answered 14 while you were gone" across days.** The figures are today's and Reports holds the period. If it is missed, it is a clause of the head's sentence, never a section.
- **The bell's notes about work are still notes** a member can read away; the block that leaves when the work is done is still 0124's next stage (B4, B5).
- **Ask's morning line (`ask_cards`) and a lead who tried their preview still count on the bell**: Ask found is in no count.

## Deploy order

Either. One app holds the page and its route. An older tab on the new server reads no `since` and draws no line; a new tab on an older server ignores the `since` it is sent. No migration: `notification_reads.seen_at` is still the bell's number's moment.

## Held by

`tests/today/record/the-bell-counts-news.test.mjs` (the rule, kind by kind, and the bridge's bell over Today's own rows: before Today is read, once it counts a person, and past a week), `tests/today/bell-rows.test.mjs` (the closed bell plain over a counted note; the foot's door, pressed), `tests/today/notifications.test.mjs` (the one switch: push where it can, the page's alert standing down, the fallback, both left on, an iPhone), `tests/reach-out/settings/todays-note.test.mjs` and `each-answer-says-what-is-true.test.mjs` (the card silent over a batch that waits, and still speaking for a paused mailbox), `tests/today/today-page.test.mjs` (nothing under the head's sentence), `tests/today/today-reads.test.mjs` and `tests/shell/hearing/` (what GET today reads, and what is read again after a mark).
