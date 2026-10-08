# One motion for every strip of views

**Asked by Ruben, 8 October 2026:** the strips of views (Needs you · Conversations · Live, People · Leads · Pipeline,
Reports' lenses) should move the same way whichever way they are swiped, feel "smooth, clean, not glitchy", be one
shared component, and move the same on a desk and a phone, "not different implementations", recoded if needed. He
approved the design below from a side-by-side mock (today's measured sequences beside the proposed one), with Settings'
sections included and a desk's travel short with a cross-fade. Written against `5152b0aa6`.

## What was measured

A recorder sampled every painted frame of a tab change on a development build of main (the suite's workspace; the
sequences are structural, the milliseconds a development build's): the page element's identity, its place and opacity,
the lit tab, the highlight's place and width, the strip's scroll. It is kept beside the other load-parity tools as
`strip-motion-recorder.js`, with a headless runner.

| Where | What a person saw |
| --- | --- |
| A phone, a tap (Inbox, People) | The old page stood still, then was cut in one frame. The new one appeared 40px to the side at full opacity, stood 35 to 100 ms, then slid in. |
| A phone, a swipe (Inbox) | 1:1 under the finger. At the lift the exit eased in from rest, so a page moving 1.4 px/ms crawled 7px in 85 ms; then it was cut when React committed, and the new page appeared 40px to the side (a jump of about 250px). With a later commit the exit finished and the pane stood empty. One gesture, two sequences. |
| A phone, a swipe (People) | Cut 16 ms after the lift, with no exit; the new page stood 100 ms at 40px, then slid in. |
| Reports, a tap | The lens changed in place. Nothing moved, on a phone or a desk. |
| Reports, a swipe | A whole 180 ms exit, an empty pane, the tab lit some 200 ms after the lift, then the same 40px arrival: 430 ms against 280. |
| The highlight | It glided on a tap and jumped in one frame on every swipe. It animated `width`, which only the main thread can do, so it stalled in the frame the page rendered. Two presses 107 ms apart left it under the first tab while the second was lit. |
| Reports' strip on a phone | The highlight travelled to a lens past the strip's edge, then the strip's scroll jumped 68px and 62px in one frame each. |
| A desk, a click | Inbox and People: the old page was cut to nothing, the pane stood empty 50 to 200 ms, and the new one faded up 4px. No side. Reports: nothing. |

Left and right were mirror images of each other in every recording. What differed between them was how long the page
being entered took to render, because that decided where the exit was cut.

## Why

The exit and the arrival were two animations with nothing between them but the moment React committed. The exit was an
inline `transform` on the element React was about to take away (`data-bits.jsx` `swipeLeave`); the arrival was a CSS
animation on the element that replaced it (`components.css` `route-slide-*`, chosen by a class `useViewFade` set). A
phone had the slide and a desk a fade (`route-in`), by a media query. A page that stays mounted across its views
(Reports) took a third path (`stays`, a promise, a poll and a 400 ms cap). Settings drew a copy of the strip and its own
slide class. The highlight was a pseudo-element placed by custom properties from two functions with two clocks.

## The motion

One timeline per change of view, whoever asks for it (a tap, a click, a key, a swipe, the browser's Back):

- It starts at the press, or where the finger left the page and at the finger's speed. It is a critically damped
  spring toward the page's far side, so there is no ease-in, no stall and no overshoot.
- The page leaving and the page arriving are on it together. The one leaving never waits for the other: it moves on
  the compositor while React renders. The one arriving joins the timeline where it should already be, attached to the
  leaving page's edge, so it neither pops nor stands waiting. One that joins late fades in over 90 ms where it joins.
- Only `transform` and `opacity` move, as Web Animations, so the main thread cannot stall them, and each ends on its
  own `finished`, never on a timer.
- The highlight is one element moved by `transform` on the same timeline, and a strip wider than its place scrolls to
  the tab picked as it goes.
- How far a page travels is one token, `--view-travel`: the page's own width where the page is one column (a phone;
  People to 900px), 56px on a desk, where the leaving page is gone by half way and the arriving one fades in across
  it. It is one implementation with one length that differs.
- A second press while a change is under way starts from where the page is, on a timeline of its own; nothing queues
  and nothing jumps to its end.
- Under reduced motion the page still follows the finger, and a change is a 160 ms cross-fade with no travel.
- A page that is asked to leave and is never replaced (a guard kept it) comes back.

During a drag only the page on screen follows the finger, as it did: the next page is not drawn until the tab is
pressed at the lift, and joins then. Drawing it during the drag would put a page's render under the finger.

## How it is built

**The deck** (`apps/dashboard/src/surfaces/kit/motion/view-deck.ts`), with no React in it:

- A view is an element that is replaced when the view changes: the frame's `main` (keyed by the route's mount),
  Reports' lens body (keyed by the lens), Settings' pane (keyed by the section). Each registers through a callback
  ref, `viewDeck.view(owner)`; the innermost one registered is the one a gesture moves.
- A view that mounts wearing `data-slide="next"` or `"prev"` arrives by the deck. The frame already decides this for
  its strips (`useViewFade`, from `stripPlace` and `stripSlide`); a page with views of its own decides it with
  `useSlide` (`kit/motion/use-slide.ts`).
- `leave(dir, velocity)` starts the exit on the view on screen and returns the move, which the strip follows.
  `drag(dx)` and `settle()` are the finger's.
- When the next view registers, the one React removed is put back beside it as a still copy: the removed node itself,
  not a clone, so nothing is copied, a chart's canvas keeps its picture, and its animation carries on (proved in
  Chromium and WebKit: the same `Animation` object is running after the node is removed and inserted again). It is
  inert, hidden from a screen reader, stripped of its ids and test ids, placed over where it stood, and removed when
  its animation finishes.

**The strip** (`apps/dashboard/src/surfaces/kit/view-tabs/`): `ViewTabs` draws what `SurfaceTabs` drew (a `nav.stabs`
of links, a door being a link) with one more element, `.stabs-pill`. A press lights the tab, starts the highlight and
the exit, and then moves the address. `viewPager` is what `touchSwipe` asks for a page to walk: it finds the strip and
hands the finger to the deck.

**The frame** keeps `SurfaceTabs` as the adapter that knows the shell's groups and their counts, drawing `ViewTabs`;
`stripPlace` and `stripSlide` stay. `main` registers with the deck and wears `data-slide`.

**One reader of a touch** stays `data-bits.jsx` `touchSwipe` (the gesture rules of 25 September). Its `pages` answer is
now `{ prev, next, drag, settle, go }`; the Calendar's days, which stay mounted and are no strip, keep their own turn in
place through the same three words.

## What goes

`route-slide-next`, `route-slide-prev` and their keyframes; `set-slide-*`; `SurfaceViews.stays` and `data-stays`;
`stripPager`'s poll and observer; `stripTap`, `stripUnglide`, `stripAround`; the strip's `::after` and its two custom
properties; `swipeLeave`'s early branch and the `moving` list; Settings' own strip markup.

## Tests

- `tooling/scripts/tests/shell/view-deck.test.mjs`: the spring (monotone, no overshoot, ends on its target, mirrored),
  the two opacities, the travel token, and the deck on elements that answer what it asks: a leave then an arrival on
  one timeline, the removed node put back and removed at the end, an arrival nobody pressed for, a second press, a
  guard that kept the page, reduced motion.
- `tooling/scripts/tests/shell/view-tabs.test.mjs`: the strip as drawn (links, the one lit, the count, the pill), a
  press, a press with a key held, the pager's answers.
- `it-moves.test.mjs`, `shell-status.test.mjs`, the strips' own tests and the kit's gallery follow the new words.
- In a browser: the recorder as a check, `dev-tools/load-parity/strip-motion-check.js`, run headless at a phone's and a
  desk's size in Chromium and WebKit: no cut, no empty frame, the two pages attached, the highlight moving every
  frame, left and right mirrored. `e2e/shell/phone.spec.ts` keeps its swipe test.

## Not in this

The Calendar's days (a pager of dates, not of views). The Inbox's views declared by its chrome, as People's and
Reports' are, rather than by the shell's groups. Drawing the next page during a drag.
