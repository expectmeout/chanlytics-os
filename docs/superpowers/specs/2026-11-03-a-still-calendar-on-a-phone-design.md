# A still Calendar on a phone

**Asked by Ruben, 3 November 2026**, with his fourth recording of the day: "I still see slight issues on the day, month,
and within agenda switching between days ... we are over engineering patches and small fixes on top of fixes; instead we
should totally recreate it from scratch, cleaner, better." He picked the still Calendar (A) over a page that follows the
finger (B) and a scroller of three periods (C). Written against `6c4da4d1d`.

## What was measured

His four recordings (WhatsApp, 384x848 at 60 fps, about a video pixel to a CSS pixel), each frame against the frame the
screen settles on:

| Recording | What stepped | When |
| --- | --- | --- |
| 12:00 AM | the Agenda's cards, 1 px | as its fade-in (`cal-in`, 160 ms) ended |
| 8:23 AM | the Agenda's cards, 1 px; Month and Agenda 50 px up after Day | a slide into Agenda's end; the deck's scroll |
| (none) | Week and Month, "like a pixel" | the slide's end; Week's and Month's lines on fractions of a pixel |
| 10:34 AM | the Agenda's cards, 1 px, on each of three swipes; Month to Agenda | each swipe's glide's end; the slide's end |

Each fix took one move away or set one length on a whole pixel (#2057 `cal-in`, #2059 the deck's scroll, #2060 the grids),
and the moves left kept stepping. A 23 October note in calendar.css took away a 3 px rise for the same complaint.

## Why it steps

While an element moves by `transform` or `opacity` (a Web Animation, a transition, an inline `translate3d`), an iPhone
draws it on a layer of its own. When the move ends, the layer goes and the element is drawn on the page again, and what
was on a fraction of a pixel lands on another device pixel: the Agenda's cards were drawn a whole CSS pixel off while on
their layer. Nothing on this machine shows it: desktop WebKit composites nothing, and Chromium lands on the same pixel.
So every end of a move is a chance to step, and a fix that tunes one end leaves the others.

What moved the days on a phone:

1. **A view of the strip** (Agenda, Day, Week, Month): the deck slid the days out a screen's width and the next in
   (kit/motion/view-deck.ts), and put the view under the bar by a scroll margin.
2. **A swipe across the days**: the pane followed the finger, left, the period changed, and it came back in from 40 px to
   its side (kit/motion/swipe.ts, "a page that stays": the Calendar was its only user).
3. **A read on its way**: the days faded to 45% and back (components.css `[data-loading] [data-dims]`, 120 ms).

## The design

On a phone (720px and under) nothing moves the days but the thumb scrolling them. Every change is drawn in place, in the
frame it is asked for, at a place decided before that frame is painted.

- **A view** of the strip is cut in. The deck learns one word: a view whose `--view-travel` is `none` holds still. The
  deck neither moves it, fades it nor scrolls it, arriving or leaving, pressed or dragged. The Calendar's body says
  `none` on a phone (calendar.css). The deck's scroll margin goes (no other view reads it).
- **A swipe** across the days is read as the kit reads every page's swipe (past a third, or a flick; never from the
  screen's edges, a field, a sheet or a menu; the browser's scroll held while it is across), over a page that does not
  follow the finger: let go, the next days are drawn, as ‹ and › draw them. The staying page and its turn leave the kit.
- **A read on its way** does not dim the days on a phone: the days not read yet say "Reading this day…" themselves, the
  presses wait as before (`pointer-events`), and `data-loading` and `aria-busy` still say it.
- **Where the page stands** after a change is one rule, the page's (`calendar-page.tsx`), run in the commit before the
  paint: after a change of view, or of days in the Agenda or the Month, the days' top is put just under the bar if the
  page had gone past it (where the bar sticks, not where it stands: near the foot of a shorter page it is pushed up out
  of its place); a board (Day, Week) keeps its hours where they are across days, since its heads stick; a board
  that holds today opens at the hour before now, once for the view (board-dom.ts `boardToNow`, which the page now calls,
  where the board called it). A day picked in the Month holds still (kit/motion/hold-still.ts), so a shorter day under
  it never pulls the month down.
- **A day's head is as tall whether it holds today or not.** Today's date is the accent's 22px circle, and its head
  stood 3px taller than another day's, so a board's hours stepped 3px as Day or Week changed to or from today. Every
  date now stands in the circle's box (calendar.css `.cal-dayhead .cal-date`), on a desk too.
- **A desk** is as it was otherwise: the deck's cross-fade, the board's own box scrolling, the dim.
- **Stays from before:** the grids on whole pixels (#2060) and no `cal-in` on a phone, which is now the still view's
  rule.

## How it is proven

An iPhone's layers cannot be seen here, so the proof is that there is no layer to hand back:

1. **Tests** (red first): the deck, given a still view, starts no animation and scrolls nothing, for a press, an arrival
   and a drag; the swipe has no page that stays; the Calendar's swipe is a page whose drag moves nothing; calendar.css's
   phone block holds the still view and the undimmed body.
2. **The real app at 375 and 393 wide, Chromium and WebKit**: for each change (the four views both ways, ‹ ›, Today, a
   swipe both ways, a day picked in the Month, a read on its way), no animation runs on `.cal-pane` or under it
   (`getAnimations`), no transform or opacity under 1 is set on it, and the first frame painted after the press is the
   frame it settles on.
3. **His recording** of the same on production.

## What was measured after

On `phone/a-still-calendar` behind the local rig (the e2e workspace), 3 Nov 2026:

- **Every frame** (a recorder on each animation frame, 0.9 s in Chromium, 2.5 s in WebKit, whose headless build draws
  about five a second), twenty changes (the four views both ways, ‹ ›, Today, swipes both ways in the Agenda, Day, Week
  and Month, a day picked in the Month from the page's foot, a read on its way): no finite animation on `.cal-pane` or
  under it, no transform, translate or opacity under 1 on the pane or the view, and nothing moved from the frame the new
  days were first drawn. Chromium 375 and 393, WebKit 375 and 393: 20 of 20 each (WebKit missed a tap now and then in
  its slow frames, which changed nothing and moved nothing; pressed again, it held still).
- **Painted frames** (Chromium's screencast, eleven changes): the days' band is the old days until one frame and the
  settled frame from it on, in every change; what still changes after is the now line's rows alone (its dot's pulse,
  and the line moving on the minute).
- **The heads**: Day 43px and Week 52px on a phone, 43px on a desk, holding today or not, in both engines.
- **A desk** still moves its views by the deck (the token 56px, `cal-in`, the 120 ms dim), in both engines.
