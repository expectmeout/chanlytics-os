# 0124 · A note is unread until it is read

**Status:** Accepted by Ruben, 11 November 2026 ("Yes, plan stage 1", then "Yes, start stage 1"), and built as the bell's first stage. Migration 00614. Written against main at `0b1d559000`. Amended 12 November 2026 ("Yes, fix all six", after the review of the stage as it shipped): migration 00622, against main at `29c61280da`.

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

## Amended, 12 November 2026: the bell reads what was seen

The stage was reviewed as it ran, and six things were found. Ruben: "Yes, fix all six".

1. **A note, or a group, is read where it stands.** A dot goes only by a press, and on a desk the one press a note had opened it; a group could only be unfolded. An unread note, and a group with an unread note in it, carries a check beside its × (`.tbn-read`, frame/topbar/notif-popover.tsx): it shows with the × on a desk, on hover or the keyboard's focus. On a phone a note is still slid, and a group, which cannot be slid, shows its check. A group's notes go in one write (`PUT notifications { ids, read: true }`, each through the member's own door).
2. **The closed bell says what is unread.** Once looked at it said nothing, though notes still wore dots. With nothing new and something unread it shows the same dot at the same shoulder, quiet (`.tb-bell-unread`), and its name and tip say "3 unread"; while anything is new they say "6 new" (contracts `BELL_READ_WORDS.name`, `tip`). The section over unread notes is "Unread", where it said "New".
3. **Mark all read reads what the tab holds.** It read up to the server's now: a note that arrived a second before the press, never on the screen, was read with the rest, and so was every kept note where the bell's rows had not loaded. The press now carries the moment of the newest note the tab holds, a millisecond past it (`{ read_all: true, read_through }`), and the door reads up to it: never past now, and never back, so a tab that listed less than another device has read moves nothing but the look. The door takes a third argument for it (`p_read`): a moment with it is a read, a moment without it is the Undo, as it was. With no note in the tab the press is a look.
4. **Undo goes back to where the server says the member stood.** It sent the tab's own idea of that moment, wrong after another device had read, and it left with the read, so on a slow line it could land first and be lost. It now waits for the read's answer and sends the `was` the door answered. A read that took two tries may have landed on its first; its Undo takes the earlier of the door's moment and the tab's.
5. **A save that fails is tried once more, then said.** A failed Mark all read was silent: the toast had said "N marked read", and the dots came back at the next read. A mark is tried again after two seconds; a read that fails twice lets the tab's held press go at once, so the dots are back, and the toast's place says so in plain words, as a failed Undo does (`BELL_READ_WORDS.readFailed`, `undoFailed`).
6. **A member's bell starts when they join.** A seat had no row until its first look, so a teammate who joined yesterday found thirty days of notes new, and after one look every one of them dotted. `memberships_start_the_bell` (00622) makes the row as the seat is made, both moments at the seat's `created_at`, and never stops a seat from being made. The seat's moment is a floor: a member who comes back has a row already, and its moments move up to the new seat's where they are earlier, so what happened while they were away is not theirs to read, and what they read past it is kept. The seats of the last thirty days are given the same, a row where they have none and moments no earlier than the seat (on production, 13 November: three seats with no row, and three owners of the demo workspaces whose seats were made again on 9 November); an older seat is left, since every note the bell holds is after it joined, and its first read answers the moment it joined.

Deploy order for the amendment: 00622 before the build. The build before it names one or two of the door's arguments and reaches the new door by its defaults; the new build names the third, which a database before 00622 refuses, and the refusal is said as item 5 says it.

## What it does not do

- **What needs you is still a note.** A person waiting, a run to approve and a warning are rows a member can read away. The block on top that leaves when the work is done is the next stage (B4, B5).
- **Marks on rows the browser makes are still this device's** (a thread that needs you with no kept hold, a held reply, a missed call, an invitation), and booking emails and reviews are still judged settled by the pages a tab has open. The next stage moves both to the server (B8).
- **Notes older than the bell's list** are read by Mark all read (it is a moment, and they are older than the newest note the tab holds), and are not counted to keep the button up: they have no dot on screen. The sentence for them still counts what is new since the look.
- **No list by day, no swipe to unread, no Clear all, no × on the sheet.** The stage after (B6, B7).

## Deploy order

The migration before the build. The build selects the new column, so it fails on a database without it; the build before it neither reads the column nor calls the door, and runs unchanged on the new database.

## Held by

`tests/today/record/a-note-is-unread-until-it-is-read.test.mjs` (the rule, the bell's rows, the bridge's look and Mark all read), `tests/today/notifications.db.test.mjs` (the door on a database), `tests/partners/second-factor-catalog.db.test.mjs` (the door named), `tests/routes/reads-routes.test.mjs` (the read and the write), `tests/today/record/one-row-for-one-hold.test.mjs` (a kept hold), `tests/today/bell-rows.test.mjs` (the top bar, drawn, and its Mark all read pressed; the check on a note and a group; the quiet sign; a failed save said), and for the amendment the same files, with `tests/database/tenancy.db.test.mjs` (a seat's row made with the seat).
