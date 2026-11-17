# 0140 · Messages folds into Campaigns: every message is inside the campaign that sends it

**Status:** Approved by Ruben, 17 November 2026 ("Approve, start step 1", on the canvas "Campaigns: one tab, messages inside"), and built on one branch: four steps, then the fixes of an end-to-end review the same day. No migration. Written against main at `ef33ecc529`. Amends 0060 (its D4, "the Library is Messages") and 0065 (New's kinds).

The code's comments name these calls as "Campaigns, one tab, call C3": the numbers are this note's.

## Context

Campaigns' strip read Campaigns · Messages · Content · Ads. Messages listed 25 messages on Ruben's account: 4 a customer campaign sends and 14 a cold email sends, each already a step of a campaign the first tab showed, and 7 ready-made ones nothing sent. A step of a campaign opened its own sheet, whose "In Messages" opened the message's sheet over it, whose "Open in Campaigns" led back: two sheets pointing at each other. A message WhatsApp refused needed you on Messages, while the campaign it stopped said nothing until its next run did nothing.

Two things the Messages list alone said would have been lost with it: "Waiting" (something sends a message and no channel can carry it here yet) and the month's email allowance.

## Decision

1. **C1. One tab.** The strip is Campaigns · Content, and Ads where it is drawn. One "+ New".
2. **C2. A step that sends a message opens on the message itself.** One sheet: the message's own pane under a line that says the step (Step 1 · Day 1 · 10:00 AM) with Send me a test beside it, and the step's facts under the words (when it goes, how, what it is doing, its last 30 days). Its name's menu is Edit step N, Rename and, after the first step, Take away; never Put away, a version's Remove or Delete, which reach everything else that sends the message. Its tabs are the channels the step goes by and no other; it opens on the language the step sends and offers no other. How many went out is said once, by the step.
3. **C3. WhatsApp's no lands on the campaign.** A running campaign whose step's message cannot go (WhatsApp refused it or paused it where the step goes by WhatsApp, it has no version in the step's language, or it is gone) is in Needs you, its row naming the step and why. The list read works it out on the server (`sequenceMessageOff`), so the list, Today and AI see one fact. WhatsApp's no is one word, "refused", on the row, the step, the bell, and a run that did nothing for that message.
4. **C4. The ready-made set is off screen.** AI starts from it; nothing lists it as presets.
5. **C5. "Not in a campaign"**, folded at the list's foot: the messages no campaign sends, one row a name, each saying what can use it. One put away says what that does ("Hidden from the Inbox"); one WhatsApp refused or paused says so, with the press that mends it.
6. **C6. A shared message says what else sends it**, and a change to its words is a change for each.
7. **C7. A search finds a campaign by its steps' messages**, by their titles, and says which step.
8. **C8. Old links still open.** Messages' list addresses (`campaigns/messages`, `messages`, the path `templates`) land on Campaigns' list. A message's own address stays `campaigns/messages/<name>` and opens the message over that list; a press on a message anywhere opens it over the page it was pressed on. A message has no page of its own, so its sheet has no door home.
9. **C9. The call's text lives where calls are set up.** Settings › Business, on the booking-link row: one press sends the ready-made call's text to WhatsApp, the row says WhatsApp is checking it, or opens it where WhatsApp turned it down.
10. **C10. The Inbox's new conversation takes one line to AI** where no approved message can start a chat with the person: AI writes a message the Inbox can start a chat with and files it.
11. **C11. WhatsApp's own list is asked quietly as Campaigns opens**, whichever view is on screen, at most once a visit and once an hour, and only once the page is idle: it is never beside the reads the list opens on.
12. **C12. "New message" is New's line.** Where what is said is only the words of a message to keep (nobody to send it to, no moment, day or time), the drafter answers that and no draft, and New hands the line to AI's message card, which writes and files it.
13. **C13. Waiting is said quietly.** A running campaign whose step's message nothing can carry here now says "Waiting" on its row and its step, never Needs you: it goes by itself once a channel can. Judged by the channels the step goes by, so a message that could go by email does not carry a step that goes by WhatsApp alone.
14. **C14. The month's emails stand on Campaigns' head**, once half are used, on a desk beside New.

## What it does not do

- **A phone shows no month's emails line.** A phone's head is the page's name alone (the kit's rule), as the canvas's phone boards drew Campaigns.
- **A refused message no campaign sends is not in Needs you.** It says so on its row in the fold, which is shut until asked, and the bell's note about it opens it.
- **A one-off and a cold email are not read for a message that cannot go.** A one-off says its own day's failure; a cold email's steps are written in their own sheet.
- **A campaign's own read carries no `message_off`.** It is the list read's fact, which the record takes from the list beside it.
- **The step's old view stays** for a step whose message is gone, and for a call or a note.
- **The retired home's head still names a "Messages" count** (`lifecycleHeadOf`): nothing draws it and AI's read of Campaigns does not carry it.
