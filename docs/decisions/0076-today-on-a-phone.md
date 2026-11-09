# 0076 · Today on a phone

**Status:** Built 28 October 2026 on the lane `design/today-phone`, no migration. Asked for by Ruben the same day ("the
phone Today feels like a messy scroll"), drawn as the canvas "Today on a phone, redesigned" (design version 4) and its
spec (`docs/superpowers/specs/2026-10-28-today-on-a-phone-design.md`), built on his word "Start the build". Written
against main's `dca230386` (#1906). Phones only (tokens.css `--bp-phone`, 720px): the desk's Today is as it was.

## Context

Under 720px the Glass bento stacked in its desk order: the strip; Need you with its own head, every draft and call brief
printed whole in its first two rows, and the steps due, the visits to mark, Ask's ideas and the reviews to answer among
the people (0007, 0047, 0071); setup, brought in and Going today; Your brief; While you were away; Today so far; Worth a
look; the pinned lists. The frame's head said "Today" alone. It ran to about five screens, its first held one person,
and the news was said three times (Need you, Your brief, While you were away).

## Decision

1. **A phone has a head.** The page draws it (`today-head.tsx` says `{ title: null }` on a phone, as a person's hero
   does): the greeting with Listen at its right, what now in the page's largest words, one line under it. The words are
   the ladder's (contracts `todayPhoneHead` over `todayHeadline`): "3 conversations need you", the oldest wait and the runs
   waiting; "Nothing needs you" only over nothing (S7-1). The canvas drew "3 people need you" and "You're clear": the
   house's words were kept, one spelling for the desk, the phone, Ask and the bell.
2. **Need you is who waits on the owner, right under the head.** The people and the runs waiting for a word; no head,
   count, door or Ask's line of its own (each card says what Ask prepared). One card, the first row still open, with Ask's words cut to two lines and Read; every other
   open row short, its press opening the walk on it; a row acted on keeps its receipt and undo in its place (0071), and
   the next open row becomes the card. How long each has waited stands beside its name, amber from an hour.
3. **The walk.** Read, a short row's press or a row's words open the kit's Sheet on that row (`need-you/walk-sheet.tsx`):
   its words, its own work (`workOf`) with its presses in the sheet's foot, across to the next or the one before, on to
   the next open one a beat after it is acted on, and "That's everyone" at the end. What a row came to is kept by the row
   (`need-you/row-state.ts`), so the page and the sheet say the same. The runs act from their own rows; the walk holds the
   people.
4. **Change it with Ask reaches Ask's own drafts.** `POST conversations/:id/draft` takes `instruction` (280 characters
   at most); the draft is written again from the kept one, in its place. The sheet offers Shorter, Warmer and Ask for a
   day, and the member's own words. The receptionist's held reply keeps its `steer`.
5. **The day card** stands where the strip stands on a desk (`phone/day.tsx`): the date and how the day stands
   (contracts `todayDayNote`: closed, fully booked with the next opening, how many and what is open), now and next, the
   day as the kit's Meter with now as a mark (contracts `todayDayBar`, over every visit that stands, `at` and the grid's
   hours), and one line for the rest, opened in place: the visits to come, Going today's sends with Stop (0064's band
   stays the desk's), the runs that went out. It opens by itself when nothing waits and nothing is to do.
6. **To do, in Need you's pane** (`phone/to-do.tsx`): under the people, a hairline and its own small head: the steps
   due, the visits to mark and the reviews to answer (0007's, 0047's and 0071's rows, presses and caps; never in the
   count). One place for everything that is on the owner. The coral is Need you's first act, else To do's, else setting
   up's (`queue-coral.ts`).
7. **Ask found** (`phone/ask-found.tsx`): Ask's ideas alone, in the rows a desk draws them in, with Approve, Open in Ask
   and Not today.
8. **The day's numbers in one row** (`card.tsx` on a phone): the four figures by their short names (contracts
   `TODAY_PHONE_WORDS.figure`), each a press for its clause and door; Worth a look under them, a line each with Ask why
   and its door (`leaks.tsx` `LeakLines`), as what the numbers mean.
9. **Setting up**: what is left to set up and what was brought in (0073), one card.
10. **What leaves the phone page.** Your brief: its sentence is the head, Listen is in the head, a reply that failed is a
    warning under the head, the review that landed is in Ask found, a run that went out is in the day. While you were
    away is the bell's, but for a warning (`phone/warnings.tsx`). Ask a follow-up is the tab bar's Ask.
11. **The order.** The head, the warnings, Need you with To do, the day, Ask found, the day's numbers with Worth a look,
    the lists, setting up, "That's everything for today." With nothing waiting and nothing to do: the head, the warnings,
    the day opened, setting up (holding the coral), Ask found, the numbers, the lists, the end.

Refined on Ruben's word the same day ("Apply all five"), after the first build: the numbers to one row with Worth a
look under them, the reviews to To do and Ask found to ideas alone, To do into Need you's pane, Ask's line dropped
on a phone, and setup with brought in as one card. Nine sections became seven.

Refined again after his look on production (Ruben, 29 Oct 2026: "the top feels a bit cluttered and wordy"; "Build 1–4"):
the head's line says only the runs waiting; the warnings under it are only what stops customers being answered (a line
down, a reply that never arrived, the bell's `number`, `sweep` and `billing`); the card's foot says who it left out, with
See all; a row says since when only on a desk, a call-back's sentence leaves its ask to its state line and Call, Ask's
brief on a card is its first line with Read, and a run waiting for your OK says so once and opens with Review; the day
card's head is its note on one line. The spec's "Refined after his look on production" says each.

One headline (Ruben, 31 Oct 2026: the old "Today" showed and went before the greeting came; "only one", in the old Today's
type). Item 1's head is the frame's again: the greeting is the page's name, `.pg-title` on every width, said by Today's
address from the frame's first draw (`today/chrome.ts`, through the chrome's `head`, kit/head/standing.ts `HeadFirst`), so
the head never draws the crumb "Today" first. On a phone Listen is the page's act at the greeting's right, its seat held
from that first draw and while Your brief's words are on their way (`seat`, components.css `.pg-act-seat`); the page's own
head is what now and its line. And a view landing where its own reading view stood keeps the head it holds still while
its words fade in (shell-hooks.ts `landed`, components.css `data-landed`): Today's head is in the page's own scroll, and the
whole view faded, so the greeting went out and came in again as the page was read. Measured on production before it, as
the e2e owner: "Today" from 0.8s, the greeting from 3.2s on a desk and 7.9s on a phone; on the lane after it, the greeting
from the first draw (0.44s), one entrance, and nothing moving as the page lands.

Not built: a swipe on a row for Not now (a new gesture beside #1811's scroll handling, and every card and sheet has Not
now); the docked player showing the line being read (the speech route gives no timings); the week's sparkline
(`reports_headline` has no days); the pinned lists as chips (Ruben, 20 Oct 2026: chips under the cards "read as
unfinished"); setup as a progress row (its card's head and one row stand as they are).

## Consequences

- 0007, 0047 and 0071 hold on a desk; on a phone the steps, visits and reviews are To do's and the ideas Ask found's.
- No read is new: every fact is one Today held. Listen and the brief's words are shared with Your brief
  (`pages/listen.tsx`, `useBriefWords`), the bell's grouping with While you were away (`useAwayGroups`).
- The kit's Meter gains the ink and ground tones and a mark (its gallery's `meter-mark`); the attention row gains `wait`.
- Reverse a call by drawing that part as the desk does: each is one branch of `today-page.tsx` `PhoneToday`.

## Amended 1 November 2026 · One sentence, Need you in groups, the day on a desk

Asked for by Ruben on 1 November 2026 (the Today canvas, approved end to end): the head and Need you were confusing and
cluttered on a phone, and the page under them said things twice. What changed, on a desk and a phone alike:

- **The head** is the greeting and one sentence (contracts `todayHeadLine`): what leads in the darker ink, a line that is
  down or how many need you in the badge's number, then what Ask prepared and the one thing that cannot wait
  (`needYouSay`), with Listen at its end. The phone's second headline (`todayPhoneHead`) and Listen's seat at the
  greeting's right went.
- **Need you** is in groups (contracts `needYouGroupsOf`): Up next, Waiting on you, To decide, and Over a week with Mark all
  done (each handed back to the receptionist, asked first, one Undo). A strip of the kit's `SubTabs` cuts them by what each
  asks (Reply, Call, Approve) where two or more do. A person waiting has no state line: who, how long, the wire it came by
  and their words. To do and Ask found are a line each at Need you's foot that opens in place, on a desk too.
- **Under it** what cannot wait stands across the page on a desk as on a phone (`phone/warnings.tsx`); the day is a card
  beside the work on a desk (`pages/day-card.tsx`, item 5's card, with what goes on its own today and what went out at
  their times); Today so far is a phone's alone; the week is Worth a look's foot. Your brief's pane, Going today and the
  desk's day card went: each thing they said is said where it is acted on.

Item 1's head, item 4's To do under the people and item 7's Ask found as a pane of its own are replaced by the above.

A parity pass the same day (Ruben's phone: "too much fixed empty space within the component"), to the canvas as approved:
Listen stands beside the bell on a phone and beside the greeting on a desk (the kit head's `beside`), not at the
sentence's end; the cuts are chips; on a phone Need you has no pane of its own, each group's name standing over a pane of
its own and To do and Ask found one pane of two rows; Up next's draft is on the inset's ground with Edit beside Send, and
a row's note mark stands after its name rather than on a line of its own (since replaced by its words: below); a tap no
longer leaves a row lit.

Ranked by value (2 Nov 2026, after the 7 in 10 read of Today against the field): Need you's one order (contracts
`needYouOrder`) is the queue's before its six are cut, and Up next is its first. A near clock first; then the waits under a
week before those past it; then what each is worth, someone asking to book (a time they picked, or an ask for one: the row's
`booking`) before a call back, before a lead's reply to a reach-out, before the rest; the longest wait among equals. Sorted
by the longest wait alone, a week's old mail took the six and the new asks were a count at the foot. An email's row says
Not a person under Not now's times, the owner's, as the thread's Actions do (decision 0080).

Outcomes before activity (2 Nov 2026, the same read's items 3 and 4):

- **A row is let go from the row.** Under Not now's times a hold's row (a handoff, a reach-out's reply read) says Mark done:
  its thread goes back to the receptionist (the thread verb `hand_back`, as Mark all done does), the row says so in its
  place with Undo, and a new message from them brings them back. Before, a row left only by Mark all done, once a week
  old. Not a person stands under it on an email's row, the owner's.
- **The figures lead with what was booked.** The four are booked, customer messages, answered by the receptionist and
  calls; new people gives up its seat, since a booking is the outcome a new person leads to, and People and Reports
  count them. Booked is the bell's own rule over the day (contracts `bookingArriving`: a visit added or confirmed by the
  owner's calendar, a booking tool or its email, never the owner's own entry or a calendar's first read), each still
  booked and each once (`bookedOnce`), counted by the server beside `metrics_summary` (`server/metrics/bookings.ts`), so
  the page, Ask's Today and the bell agree. Its clause is the soonest, its receipt who booked for when, opening the
  soonest on its day; a zero on a workspace no booking has ever reached asks for a calendar link instead of saying nobody
  booked. A read that says nothing of bookings (an older server, a read that failed) keeps the four as they were.

The 10/10 read's polish (2 Nov 2026):

- **Amber is the business's own target.** Settings › Autonomy says "Answer people within" (the reply policy's
  `answer_within_hours`, 1 to 168, a day by default, contracts `answerWithinHoursOf`); a wait past it is the amber on
  Need you's rows, read from the settings read the page borrows. It meant "past a day" for every business.
- **No sentence is cut.** What a run or a search says (what to do, never a person's words) wraps whole; on a phone its
  verb stands beside its name so the sentence has the row's width; the day card's note has a line of its own on a phone.
- **Nothing promised that cannot go.** The head counts Ask's drafts only for rows whose words can be sent: a reply
  outside WhatsApp's window, whose one press is a template, is not said as drafted.
- **Fewer controls over little.** The chips stand over four rows or more; Need you's name has no heading margins of its
  own, so Up next sits under it.
- **Why in words.** An open row says why it was handed over beside the name ("asked for a person"); the mark that held
  it went, and a short row draws none.
- **Even figures.** A desk's head says the four by their short names, as a phone does, the whole name its title.
- **No tall empty card.** While you were away, when nothing happened, keeps its own height instead of stretching to the
  work's foot.

## Amended 2 November 2026 · Today in three zones

The canvas of 2 Nov 2026 (https://claude.ai/artifact/AwcTtpQ71E8D2x8CizCuAB), approved by Ruben the same day, is the page
on a phone as on a desk, in one column (`surfaces/today/zones/page.tsx` `PhoneToday`): what cannot wait; what is left to
set up while nobody waits; Need you, each group a pane of its own under its name (Up next as the card, who waits on you,
To decide, To do, Older); Ask found, leading wide on a quiet day; the day, with what asks for something or comes back
(a plain visit is the Calendar's); Ask found under it on any other day; Today so far, the four figures (Booked, Answered N
of M, Calls, New people, each with its receipt) and the week under them; the pinned lists; what is left to set up while
someone waits; and the page saying it is done. The head says the greeting, one sentence, Listen beside the bell, and
Since you looked under it. The chips, To do's line and Ask found's line at Need you's foot went, and the walk in a sheet
stays.

## Amended 8 November 2026 · Calm days, and every press goes somewhere

Listen is a circle the bell's size beside it on a phone, only where the brief has news; while it plays a capsule stands in the
date's place on every page, whose press stops it, and a call going on outranks and ends it (`BriefPlaying`). With nobody waiting
the head says what is listening on any day, and "That's everyone" only once the member has cleared rows today. Older has no say
in the page: no coral, no part in whether Ask found leads, and alone it stands at the page's end; one person is their own row,
which opens, and a toll-free number says so. A folded setup card keeps its next step. A day the business is closed with nothing
on it turns to tomorrow at once. Today so far on a phone is one line under the day where nothing was counted (always the four
stands on a desk's head and wherever anything was), and each of a phone's four figures opens. Booking gap asks first whether
anyone in People is on the calendar at all. Not today rests a row a week wherever Today says it, in the member's saved view, with
the day it comes back and an Undo in its toast. Ask found's "and N more" opens in place, and Since you looked's answered row
opens the thread it names.

## Amended 8 November 2026, later · One head for every section

Five kinds of head stood on one page: a small label outside the card on Need you's groups and a title inside the others, and at
their right a pill under one card over a divider, a word and an arrow in another, a chevron in a third. Now every section, on a
phone and a desk, has one head (`zones/section-door.tsx`, `tz-head`): its name, one quiet fact, and at its right edge one press. A
word and › goes to a page; a chevron, with a word where it says more, opens here. On a phone each of Need you's groups keeps its
own pane and holds its head inside it: the first holds `Inbox ›`, and one that could not hold all it has holds `See all ›`, so
nothing stands under the list. How many were done today moves to the head's sentence there. The page's last line, "That's
everything for today", waits until nobody does. An old call's sheet leads with Mark done, as its note says to, with Call the quiet
press beside it and no Not now. Ask found's glyph and a desk's See all capsule go with it, overriding the boards that drew them.
