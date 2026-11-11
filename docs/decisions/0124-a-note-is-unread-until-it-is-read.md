# 0124 · A note is unread until it is read

**Status:** Accepted by Ruben, 11 November 2026 ("Yes, plan stage 1", then "Yes, start stage 1"), and built as the bell's first stage. Migration 00614. Written against main at `0b1d559000`.

## Context

A member's bell kept one moment in a workspace, `notification_reads.seen_at`: when they last looked. It answered two questions at once. What is new since they looked is the bell's number, the phone app's icon, a push's badge and Today's "Since you looked". What they have read is a row's dot, "New" above "Earlier", and whether Mark all read is offered. Closing the bell and Mark all read both wrote the one moment.

So a look read everything. A member who opened the bell, glanced and closed it found every dot gone next time, a note a teammate left them among them, and no Mark all read: it is offered only while something is unread. Ruben, 11 November: "the mark all read on the notification bell behaves weird even if i dont click it it disappears".

Three ways were put to him: only stop closing from reading; two moments, seen and read; or fold the bell's list into Today. He chose the second, drawn on the canvas _The bell: news you read, work you finish_ (calls B1 to B10, yes to each). This note is its first stage: B1, B2, B3 and B9.

## Decision

1. **A look moves the number alone.** Closing the bell writes `seen_at`, as it did. The number, the phone's icon, a push's badge and Today's "Since you looked" read it, as they did (contracts `unreadFor`, `olderUnreadOf`, `keptUnreadOf`, `todaySince`; packages/db `getUnreadOfReaders`: none edited). The bell's own number counts the rows new since the look that are not read (bridge/notifications.ts `unread`), where it counted every dot.
2. **A note's dot reads how far the member has read.** `notification_reads.read_through_at` (00614) is a second moment beside the first. A row newer than it with no read mark of the member's is unread (contracts `bellReadThroughMs`, the one reading; `serverNotificationRows`, `applyReadState`, the bridge's `bellFeed`). Opening or swiping a note writes that note's own mark, as it did.
3. **Mark all read moves both moments to now, and can be undone.** `PUT notifications { read_all: true }` is the door `notifications_read_through`, which answers the moment it stood at before. Undo sends that moment back (`{ read_through }`): `read_through_at` goes back, never forward, and the look stays. The toast says how many it read (contracts `BELL_READ_WORDS`).
4. **Each member starts where they stand.** 00614 sets `read_through_at` to their `seen_at`, so nothing a look had read lights up again.
5. **A press answers at once.** The tab holds the moment it pressed while its write and the re-read behind it are on their way, and lets go when the server's own moment is read again (bridge/notifications.ts `readThroughOf`).

`read_through_at` is never later than `seen_at`: reading everything is also a look.

A server that says no read-through moment (a fixture, a build before this) reads as it did: the dots follow `seen_at` (`bellReadThroughMs`).

## What it does not do

- **What needs you is still a note.** A person waiting, a run to approve and a warning are rows a member can read away. The block on top that leaves when the work is done is the next stage (B4, B5).
- **Marks on rows the browser makes are still this device's** (a thread that needs you with no kept hold, a held reply, a missed call, an invitation), and booking emails and reviews are still judged settled by the pages a tab has open. The next stage moves both to the server (B8).
- **Notes older than the bell's list** are read by Mark all read (it is a moment), and are not counted to keep the button up: they have no dot on screen. The sentence for them still counts what is new since the look.
- **No list by day, no swipe to unread, no Clear all, no × on the sheet.** The stage after (B6, B7).

## Deploy order

The migration before the build. The build selects the new column, so it fails on a database without it; the build before it neither reads the column nor calls the door, and runs unchanged on the new database.

## Held by

`tests/today/record/a-note-is-unread-until-it-is-read.test.mjs` (the rule, the bell's rows, the bridge's look and Mark all read), `tests/today/notifications.db.test.mjs` (the door on a database), `tests/partners/second-factor-catalog.db.test.mjs` (the door named), `tests/routes/reads-routes.test.mjs` (the read and the write), `tests/today/record/one-row-for-one-hold.test.mjs` (a kept hold), `tests/today/bell-rows.test.mjs` (the top bar, drawn, and its Mark all read pressed).
