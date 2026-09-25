# Swipe between a strip's tabs on a phone

**Asked by Ruben, 25 September 2026:** "on mobile you can swipe left and right on the screen to switch between tab
pages for a more smooth clean modern flow when navigating." Chosen in the brainstorm: the page follows the thumb (not
a swipe read only at its end), and a tap slides the same way. Written against `ec6aeae8` (#1030, one tab strip).

## What a person gets

On a phone (720px and under), on the three pages drawn under a tab strip -- the Inbox (Needs you · Conversations ·
Live), People (People · Leads · Pipeline) and Campaigns (Playbooks · Broadcasts · Templates):

- **The page follows the thumb.** A touch that goes across (8px, mostly sideways) takes the page under the strip with
  it, 1:1. The strip stays where it is, and its underline glides from the picked tab toward the one the page is
  going to, in step with the drag.
- **Let go past a third of the width (160px at most), or with a flick**, and the page finishes leaving that way, the
  neighbour is pressed -- the tab's own button, so a swipe is exactly a tap -- and the new page slides in from that
  side. Short of it, the page and the underline settle back.
- **Nothing beyond the ends.** At the first tab a swipe right, and at the last a swipe left, moves the page a quarter
  of the drag and never more than 48px, then settles back.
- **A tap slides too.** Pressing a tab to its right brings the new page in from the right, to its left from the left,
  so a tap and a swipe read as one control. Above 720px a tap keeps today's arrival.
- **Reduced motion:** the page still follows the finger (the person's own motion); the leaving and the slide in do
  not play, and the switch is at once.

A swipe walks the strip under the top bar and nothing else: Conversations' channel tabs, the Inbox's buckets and
Leads' class tabs stay taps.

## Where a swipe never starts

What a person does today keeps working, because the page swipe only starts where nothing else would take the touch:

- In a field (`input`, `textarea`, `select`, contenteditable) or anything that scrolls across (touchSwipe's
  `swipeOwnDrag`, which every gesture already honours).
- In a dialog, a sheet, a menu or a toast: `[role="dialog"]`, `[aria-modal="true"]`, `[role="menu"]`, `.sb-sheet`,
  `.pp-toast`. The lead's and the Pipeline's peek are dialogs and keep their own across (a pile's walk).
- On something marked `[data-own-drag]`: the Leads map's streets (MapLibre pans under a thumb) and Live's hold-to-talk.
- Within 24px of either edge of the screen: the phone's own back gesture.
- Where no strip is drawn, or it is hidden: an open thread (Inbox, Conversations), a person's page. The strip is the
  test, not a list of routes.
- Mostly down or up: a scroll, as the sheets decide it today (the first 8px choose the axis).

## How it is built

**One reader of a touch** (`components/data-bits.jsx`, touchSwipe) gets a third way that follows the finger, beside
`down` and `back`:

- `pages(el, from)` is asked once, as a touch is taken across: `{ prev, next }` (booleans) or `null` for no page way.
  `from` is where the touch began, so the page can refuse it.
- `onFollow(offset, progress, step)` is told on every move: how far the page is drawn (resistance applied), how far
  toward the neighbour (0..1), and which way (`1` next, `-1` previous).
- `onPage(step)` is called once the page has left (or at once under reduced motion).
- The page way moves `el` by `transform` only (no opacity: People's strip is inside what moves), leaves to
  `translate3d(∓100%, 0, 0)` on the leave's curve, and settles as the others do. `onGrab(el, on)` is told as for `back`.
- `back` keeps its precedence where both are given.

**The strip owns its swipe** (`components/surface-tabs.jsx`):

- `stripSwipe(when)` returns the touchSwipe handlers for the shell's route view. It finds the visible `.stabs` in
  the route view's `.main` (the shell's strip, or People's own inside the page), its `.stabs-tab` buttons and the
  `.active` one; the neighbour is the button beside it. On `onPage` it presses that button (`.click()`).
- The underline glides as one `::after` on the strip, placed by `--glide-x` and `--glide-w` (interpolated between the
  picked tab's and the neighbour's `offsetLeft` and `offsetWidth`) while `[data-glide]` is on the strip; the picked
  tab's own underline is clear meanwhile. On a settle it goes back and is cleared; after a switch it is cleared once
  the neighbour is the active tab (or after 400ms).
- A strip inside what moves (People's) is held where it is: it takes the opposite transform, on the same curve.
- `stripPlace(page, param)` says which strip a route is on and where: the groups' own `ST_GROUPS` order (demo-only tabs
  as the strip draws them), and People's scopes by `plScopeRoute`'s order (`clients` 0, `clients/leads…` 1,
  `clients/pipeline…` 2; a person's page is on no strip). `stripSlide(from, to)` is `"next"`, `"prev"` or `null`.

**The shell** (`pages/app-shell.jsx`) spreads `stripSwipe(phone)` on `.route-view`, and in the draw that mounts a new
view decides its slide from the view before (`stripSlide`), beside `routeStay`; the view carries `route-slide-next` or
`route-slide-prev`.

**CSS** (`components.css`): `.stabs { position: relative }`, the glide's `::after`, and at 720px and under (and no
reduced motion) `route-slide-next/prev`: a 220ms entrance from 32px on that side, from 0.4 opacity, animating the
`translate` property, never `transform`, so a finger that takes the page mid-entrance keeps it. It outranks
`route-stay`, so People's scopes slide too.

## Tests

- `it-moves.test.mjs`, against data-bits itself: the page follows both ways; resists where there is no page (a
  quarter, 48px at most); past a third it leaves and then `onPage(1)`; short of it it settles; nothing from 24px of
  either edge or where `pages` answers null; `back` keeps precedence; reduced motion switches at once.
- A node test of `stripPlace`/`stripSlide` on the stub (the strips' orders, a person's page on none).
- `e2e/phone.spec.ts`, real touches through CDP (`Input.dispatchTouchEvent`, as `today.spec.ts` does): on the Inbox a
  swipe left lands on Conversations and a swipe right comes back; a swipe right on the first tab stays; Campaigns
  and People switch the same way; a swipe in an open thread moves no tab. Run on the local harness; the mutation run
  (no handlers on the route view) must go red.

## Not in this

The bottom tab bar's pages (Today · Inbox · Calendar · People) do not swipe into each other; inner tabs do not
swipe; there is no wrap from the last tab to the first; nothing changes above 720px but the strip's `position`.
