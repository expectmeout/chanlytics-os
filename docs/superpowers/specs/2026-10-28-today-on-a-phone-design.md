# Today on a phone

**Asked by Ruben, 28 October 2026:** the phone Today "feels like a messy scroll"; he likes the theme and styling and wants
the structure, copy and components "cleaner compact engaging easy sophisticated". Drawn as the canvas "Today on a phone,
redesigned" (https://claude.ai/artifact/WKGFj7UdkLkPJv7d7u9ysK, design version 4, 11 boards), then "Write the spec".
Written against `dca230386`. Phones only (720px and under): the desk's Today does not change.

**Status:** built (decision 0076), merged as #1910 on 29 Oct 2026. Where the build left the spec, the spec says so
below, marked *Built:*.

**Refined after the first build** (Ruben, 28 Oct 2026: "Apply all five"). Nine sections became seven:

1. The day's numbers are one row of four by their short names, a press each for its clause, with Worth a look under
   them as what they mean (§8).
2. The reviews to answer are To do's; Ask found is Ask's ideas alone, in the rows a desk draws them in, not a rail (§6,
   §7).
3. To do stands in Need you's pane, under the people, after a hairline and its own small head (§6, §9).
4. Ask's line over the rows is a desk's: on a phone each card says what Ask prepared (§3).
5. What is left to set up and what was brought in are one card, Setting up (§8).

The order is now: the head; the warnings; Need you with To do; the day; Ask found; the numbers with Worth a look; the
lists; setting up; the end.

**Refined after his look on production** (Ruben, 29 Oct 2026: "the top feels a bit cluttered and wordy"; "Build 1–4"). The
top took eight lines before the first person, and said the run waiting three times and the oldest wait three times:

1. The head's line on the needs rung says only the runs waiting (`todayPhoneHead`); who waited longest is the first
   card's, with how long beside the name. The warnings under the head are only what stops customers being answered:
   the line that is down, a reply that never reached anyone, and the bell's `number`, `sweep` and `billing` warnings. A
   run waiting is Need you's row, and a job that did not finish is the bell's (§1, §2).
2. Where the card leaves someone out (three people beside a run, four without), its foot says how many with See all,
   which a phone had hidden since E3; the head counted them all (§3).
3. Each thing said once on a card: since when leaves a row's state line where its wait stands beside the name (the row's
   `since`); a call-back's sentence is what happened, its "Call them back." said by "Needs a call back" and Call (on a
   desk too); Ask's brief on a phone's card is its first line with Read; a run waiting for your OK says so in its
   sentence alone and opens with Review (§3).
4. The day card's head is its note on one line: the page's head says the date (§5).

The run is still said as the ladder says it ("waiting for your say", runsWaitingSentence) in the head's line and as its
row says it ("Waits for your OK", the wait rule's words): those words are shared with the Inbox, Ask and Campaigns, and
making them one is its own change.

**One headline** (Ruben, 31 Oct 2026: "on today page load i still see the old Today headline flicker and then disappear for
the new greeting … only one", in the old Today's type). The frame's head drew the crumb, "Today", until Today's page was
read, then the greeting in its place on a desk, or on a phone nothing, with a smaller greeting of the page's own lower
down; measured on production as the e2e owner, "Today" stood from 0.8s, and the greeting came at 3.2s on a desk and 7.9s on
a phone. Now Today's address says its head from the frame's first draw (`today/chrome.ts`: the greeting, which needs only
who is signed in and the business's clock), through the chrome's `head` beside People's `ownHead` (kit/head/standing.ts
`HeadFirst`). The greeting is the page's name in the page head's own type on every width (`.pg-title`: on a phone 30px
semibold, the page's light through the letters), and §1's head is what now and its line under it. Listen is the page's
act at the greeting's right, where the frame stands a page's act on a phone; its seat is held from the first draw and while
Your brief's words are on their way (`seat`, components.css `.pg-act-seat`), at one width with the button (phone.css), so
nothing beside it moves as it comes. Why Listen could not speak is still said under the page's head (listen.tsx
`useSpeechWhy`). The head also blinked once more: Today's head is in the page's own scroll, and a view landing where its
reading view stood faded in whole (components.css `route-in`), the greeting with it; now such a view fades its words in and
keeps its head as it stood (shell-hooks.ts `landed`, `data-landed`).

## What a phone shows now

Under 720px the Glass bento (`today-page.tsx` DashboardA) stacks in its desk order, and the frame's head says "Today"
alone (`today-head.tsx`: "a phone's head is the page's name alone"):

1. the alert, only while a line is down (`brief.tsx`);
2. the strip, as scrolling capsules: Now or Next, and "Next open time" (`strip.tsx`);
3. Need you (`queue.tsx`): its count, title and door; Ask's one line; up to four rows, the first two worked in place
   with the whole draft or call brief printed, then short rows; steps due, visits to mark, Ask's ideas and reviews to
   answer among the people (decisions 0007, 0047, 0071); the runs waiting for a word;
4. setup, brought in and Going today, under the queue while anyone waits (`setup-card.tsx`, `brought-in.tsx`,
   `going-today.tsx`);
5. Your brief: the day in prose, its beats, Listen and Ask a follow-up (`brief-pane.tsx`);
6. While you were away, the bell's unread rows (`away.tsx`);
7. Today so far: four figures two by two, and the week's line (`card.tsx`);
8. Worth a look (`leaks.tsx`), then the pinned lists (`pins.tsx`).

His screenshot ran to about five screens, and the first held one person. What is in the way: each draft printed whole
(one person fills a screen); the news said three times (Need you, Your brief, While you were away); chores and ideas
among the people under a count that leaves them out; the day split between the strip and Going today; nine panes of one
weight; no end.

## The design

The news in the page's largest words, with everyone it counts right under it; then the day; then your own to-dos; then
what Ask found, the day's numbers, your lists and setup; then the page says it is done. A card is a decision: one line
of why, two lines of Ask's work, one press. Opening a card walks the list in one sheet ("Need you · 2 of 4"), ending on
"That's everyone" with every receipt and its undo.

The rules it keeps:

1. **The head answers "what now"** and sits on the list it counts.
2. **Need you holds only what waits on you:** the people and the runs waiting for your word. Steps due and visits to
   mark are To do; ideas, reviews and Worth a look are Ask found. The count does not change (`needsYouCount`).
3. **A press on the page acts in place; opening a card starts the walk.**
4. **Say it once.** The head is the brief; the day holds what is left of it and what sends; the bell holds the away notes.
5. **One coral per screen:** the first open act of Need you, else of To do, else setup's (`queue-coral.ts`, extended).
   Amber for how long someone waits. Ask's three are ink at rest and the accent only while Ask works or speaks.
6. **The page ends**, above the tab bar, and says so.

## Calls made here

Product calls, made as the best for the app (Ruben, 11 Oct 2026: "the call is what you best suggest for the app"); each
is reversed by drawing that part as the desk does.

1. **Steps due and visits to mark leave Need you on a phone for To do** (0007 and 0047 put them among the rows). They
   were never counted; on a phone they stood between the people and the rest of the page.
2. **Ideas, reviews to answer and Worth a look are Ask found on a phone** (0071 put ideas and reviews under the people).
   The desk keeps 0071's extras.
3. **A phone has a head**: the greeting, the headline and one line (`today-head.tsx` gave a phone the name alone).
4. **Going today joins the day card on a phone**, with its Stop (0064 step 2's band stays the desk's).
5. **While you were away is the bell's on a phone.** Only a warning keeps a row on the page. It has stood on Today since
   the 19 Sep redesign (`todayAwayGrouped`) and canvas E3; 0015 step 4 moved it to TSX. (The canvas's Main board says
   0015 put it there: it did not.)
6. **Your brief leaves the phone page.** Its sentence is the head, Listen is in the head, a reply that failed is a warning
   row under the head, the review that landed is in Ask found, and a run that went out today is in the day card's rest.
   "Ask a follow-up" is the tab bar's Ask.
7. **The house's words, not the canvas's.** The head says the ladder's words ("3 conversations need you", "Nothing needs
   you"), the card says "Today so far". The canvas's "3 people", "You're clear" and "Ava today" were drawn, not decided:
   one spelling for desk, phone, Ask and the bell. A person with two threads is two conversations.
8. **A send from the page stays in its row**, as main does: Sending in 8s with Undo, then Sent with Open. The next open
   row becomes the card. The canvas's toast over the top bar is not built.
9. **Change with Ask reaches Ask's own drafts**, not only the receptionist's held reply: the draft door takes an
   instruction.

Not in this build: a swipe on a row for Not now (a new gesture reader beside #1811's scroll handling, and every card and
sheet already has Not now); the docked player that shows the line being read (the speech route gives no timings); the
week's sparkline (`reports_headline` carries no days); any desk change.

## What changes, part by part

### 1. The head

- **contracts** (`today/today-bands.ts`): `todayPhoneHead(standing, runs): { title: string; line: string | null }`, pure,
  beside `standingWithRuns`, over the same ladder:
  - alert: the alert's headline as the title, no line (the alert row stands under it);
  - needs: the headline without its full stop ("3 conversations need you"); the line is its detail and, with runs
    waiting, `runsWaitingSentence(runs)` after it;
  - calm with runs or something else waiting (a closing window, a call worth a listen, a search): the first of those
    sentences without its stop as the title, the rest and the traffic as the line ("Nothing needs you" is never said
    over them: S7-1);
  - calm with nothing: "Nothing needs you", and the line is the traffic and how it was answered.
- **today-head.tsx**: on a phone, `useStanding({ title: null })` (the page draws its own head, as a person's hero does,
  canvas P3), and the page draws `TodayPhoneHead`: the greeting (`todayGreeting`, small, the dim ink) with Listen at its
  right, the title (27/32, 650), the line (15/21). The desk's standing is unchanged.
- **Listen** moves out of `brief-pane.tsx` into `pages/listen.tsx` (`useSpeech`, `listenButton`, `spokenLength`), used by
  the desk's pane and the phone head. Its words, its length and its refusal line are unchanged; while it speaks it says
  Stop and Ask's three take the accent.

### 2. Warnings under the head (`phone/warnings.tsx`)

Under the head, before the list, only when there is one: the alert (`TodayAlert`, as now); a recap sentence with `warn`
(a reply that failed) with "See the thread"; a bell group whose tone is a warning, with its door. The bell's grouping
moves out of `away.tsx` into a hook both read (`useAwayGroups`), so the dedupe against the queue is one rule.

### 3. Need you on a phone (`queue.tsx`, `need-you/people-rows.tsx`, `need-you/rows.tsx`, `need-you.css`)

- The queue's head (count, title, door) is not drawn; the page head is the list's title (`aria-labelledby` its id).
  The foot is already hidden on a phone.
- Ask's one line (`AskSays`) stays over the rows.
- The rows are the people and the runs. Steps, visits, ideas and reviews are not drawn here on a phone: `TodayQueue`
  hands steps and visits to To do (§6) and draws no extras (§7). The caps stay (four rows, three people while a run
  wants a seat).
- **The card:** the first open row that works in place is drawn whole, with Ask's words clamped to two lines and Read at
  the panel's head, which opens the sheet on it; its presses are its own (Not now, Edit, Send; Not now, Call back).
  Every other open row is short: who, the wait, one line, and its press, which opens the sheet on it (a send is never
  made on words not seen). On a desk `SHORT_FROM` stays 2; on a phone it is 1 and counts open rows only.
- A row acted on keeps its place with its receipt (Going, Done), as now, and the next open row becomes the card.
- **The wait:** `AttnRow` gains `wait` (the row's `when`), drawn after the name on a phone, in the amber ink from an
  hour up. The desk keeps its meta line.

### 4. The sheet that walks the list (`need-you/walk-sheet.tsx`)

- The kit's Sheet (`kit/sheet/sheet.tsx`, record shape), on a phone only. It holds the Need you rows as drawn, people
  then runs, opened on the one pressed. Its head: "Need you · 2 of 4" and the dots, then who, how they came, the wait,
  and the close. Across is the next or the one before (`touchSwipe` onLeft/onRight, as the lead sheet walks its pile,
  `leads/sheet/sheet.tsx`); a pull down closes it (the kit's own).
- Each step draws their words (the row's quoted sentence), then the row's own work (`workOf`) unclamped, with the same
  props: Send with its countdown and Undo, Edit, Not now, Change with Ask, Call back with the brief and "How did it go?".
  The presses stand in the sheet's foot: `Acts` draws into the foot when a sheet provides one (a context), and in place
  everywhere else. *Built:* the walk holds the people; a run acts from its own row, whose presses are Sent's. What a row
  came to (a snooze, a call's outcome, a held reply stopped) is kept by the row (`need-you/row-state.ts`), so the page and
  the sheet, which draw the same row one after the other, say the same.
- When the row in view is kept (sent, snoozed, reached, approved), the sheet moves to the next open row after a beat;
  the one before stays as a line at the sheet's top while it counts down, with its Undo.
- **The end:** with no open row left, "That's everyone", every row acted on this visit with its receipt and undo, and
  "Back to Today"; with To do rows left, a quiet "2 to-dos left" that closes the sheet at To do.
- **Change with Ask on Ask's drafts:** `POST conversations/:id/draft` takes an optional `instruction` (280 characters at
  most), handed to the draft writer as the member's steer; the new draft replaces the old in the drafts store. The sheet
  offers "Shorter", "Warmer" and "Ask for a day" as one press each, and the field for its own words. The receptionist's
  held reply keeps its `steer` verb.

### 5. The day card (`phone/day.tsx`; contracts `today/today-day.ts`)

- On a phone it replaces the strip; the desk keeps the strip.
- **contracts:** each `TodayDayItemVM` gains `at: { from: number; to: number }` (minutes since midnight on the
  business's clock, from the calendar's block), and each `TodayDayFrameVM` gains `hours: { from: number; to: number } |
  null` (the business's open hours that day, else the first visit's start and the last one's end). Pure helpers:
  `todayDayBar(frame, nowMin)` (each visit's place and width, its phase, and now's place) and `todayDayNote(frame,
  nextOpening, word)` ("Closed today · note", "Fully booked · next opening Thu 10:00", "5 visits · open at 2:30").
- **The card:** the date and the note; Now (or Next) and the one after it, each time over who and what; the bar, with
  now as a line, not a knob; then one line for the rest: "2 more visits · an email sends at 6:00", which opens in place.
- **The rest, opened:** each later visit (time, who, what), each send of Going today (time, its name, Stop with the
  same Confirm and cancel as `going-today.tsx`), each run that went out today (time, what it did so far), then the
  Calendar's door.
- It opens by itself when nothing needs you and To do is empty: on a calm day the day is the page.

### 6. To do (`phone/to-do.tsx`)

The steps due (`StepWork`: Done, Not now that moves its day) and yesterday's visits to mark (`VisitWork`: Kept,
Missed, then Ask's rebook), as compact rows with their presses at the right, under "To do" and their count. The caps and
the row for the rest are contracts' (`withSteps`, `withVisitsAsked`). It takes the coral when Need you holds none.

### 7. Ask found (`phone/ask-found.tsx`)

A rail across, snapped card by card, under "Ask found" and its count: Ask's ideas (`ask_morning`), the reviews to
answer (`reviewsToAnswer`), then Worth a look (`TodayLeaks`' rows). A card: its tag ("Google review" and the stars,
"Ask's idea", the leak's tag), one sentence clamped to three lines, what Ask prepared ("A public reply is drafted"), a
quiet Not today where the kind has one, and its door: Reply and See it open the sheet on that one (`ReviewWork`,
`IdeaWork`); a leak keeps its door and Ask why.

### 8. The rest of the page

- **Today so far** (`card.tsx`): as it is, after Ask found.
- **The pinned lists** (`pins.tsx`): *Built:* as they are, a pane of figures. Ruben, 20 Oct 2026: a quiet row of chips
  under the cards "read as unfinished".
- **Setup** (`setup-card-body.tsx`): *Built:* as it is, its head and the one row that opens the first run, which holds the
  coral only when nothing before it does. Brought in stays as it is, after it.
- **The end** (`phone/end.tsx`): "That's everything for today."

### 9. The order on a phone (`today-page.tsx`)

While anything is in Need you or To do: the head; the warnings; Need you; the day; To do; Ask found; Today so far; the
lists; setup; brought in; the end.

With nothing in either: the head; the warnings; the day, opened; setup (holding the coral); brought in; Ask found; Today
so far; the lists; the end.

The phone's order is drawn from one branch on `--bp-phone` (720px, tokens.css; one hook, `usePhone`, subscribed to the
query), read before the first draw so the page never draws the desk's order first. The frame's own head keeps turning
at `--bp-narrow`.

## What it takes

- **contracts:** `todayPhoneHead`, the day's `at` and `hours`, `todayDayBar`, `todayDayNote`; the sheet's words in
  `NEED_YOU_WORDS` (the pager, the end, the quick asks); `TODAY_HELPERS` exports them.
- **server:** the draft door's `instruction`.
- **dashboard:** `listen.tsx`, `phone/warnings.tsx`, `walk-sheet.tsx`, `phone/day.tsx`, `phone/to-do.tsx`,
  `ask-found.tsx`, `phone/end.tsx`, a phone mode in `queue.tsx` and the rows, `AttnRow`'s `wait`, `Acts` into a sheet's
  foot, `queue-coral.ts` with To do's turn, `today-page.tsx`'s phone order, and the phone block of `dashboard-a-v2.css`.
- **The kit, not a page's own** (CLAUDE.md, "One kit"; `.claude/skills/chanlytics-interface/SKILL.md` first): the
  sheet is the kit's Sheet; the cards and panes are its Panel; the day's bar is its Meter, the visits and the gaps
  between them as parts, with now as a mark (a Meter variant, with its gallery entry); the pinned lists and the quick
  asks are its chip; every press is its Button. A need it does not meet is a variant there, never a class here, and
  the `kit-primitives`, `style-values` and `inline-styles` measures may only fall.
- **Reads:** none new. Every fact is one Today already holds.
- **Docs:** a decision note for the calls above (next free number when it lands: 0076 at `dca230386`), 0071's README
  row noting phones, and this spec's status.

## How it is proven

- contracts tests: each rung of `todayPhoneHead` (with and without runs, the S7-1 cases); `todayDayBar` and
  `todayDayNote` (closed, fully booked, open, a visit under way, a day before opening).
- page tests (`today-page.test.mjs`, with the 720px query stubbed): the phone's two orders; Need you without steps,
  visits, ideas or reviews; To do with them; the coral passing Need you → To do → setup; one card and short rows; the
  desk's tree unchanged.
- the sheet: opens on the row pressed, walks across, moves on after a send, ends on its receipts with their undo.
- the draft door: an instruction is taken and handed to the writer; one over 280 characters is refused.
- e2e at an iPhone's size in WebKit (`e2e/today/today-phone.spec.ts`): the head's words, the list under it, a send and
  its Undo from the sheet, the day's rest opened, Ask found's rail.
- Drawn at 390px in light and dark and looked at, as the canvas was, before it is handed over; then the route's CSS and
  bundle budgets and `check:debt`.
