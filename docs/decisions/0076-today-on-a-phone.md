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
