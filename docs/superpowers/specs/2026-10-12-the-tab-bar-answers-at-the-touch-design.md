# The tab bar answers at the touch

**Asked by Ruben, 12 October 2026:** the phone's tab bar (Today · Inbox · Calendar · People · More) should move its lit
place the way the Inbox's strip of views moves its highlight, and switch pages as fast as Instagram's tab bar, "you see
the menu item move to select the page I tap on". Then: "review to ensure it is the best plan taking everything into
account … continue as you ultimately best suggest". Written against `fc4192cbc`.

## What was measured

**Production's field data** (`page_vitals`, 5 to 12 October 2026, a phone's moves into Today, the Inbox, the Calendar and
People; READY is timed from the touch, client/page-speed.ts): 127 moves. 105 waited on nothing at all (page and rows
held) and were drawn at a median of 180 ms; 15 (12%) waited on the router fetching the page from the server, median
307 ms. The bar showed nothing until then: its lit place was a fill switched by a class when the router had landed, and
the page faded in from nothing over 240 ms after that.

**A production build on this machine**, a phone's screen in headless Chromium (`dev-tools`-style recorders in the
lane's notes), each move warmed:

| | Before | After |
| --- | --- | --- |
| A quick tap, full speed (finger down ~16 ms) | drawn 49-83 ms after the touch | 50-83 ms |
| A quick tap, CPU 4x slower | 211-325 ms | 112-163 ms |
| A person's tap (finger down ~90 ms), full speed | ~125-140 ms (the hold, then the move) | 44-94 ms, before the lift |
| A person's tap, CPU 4x slower | ~350 ms and more | 98-277 ms |
| What the bar shows in the first frame after the touch | nothing | the place lit, its lozenge moving |
| The page's fade | 240 ms from nothing | none: cut in |

Where the old move's time went (CPU 4x, a profile): the router's transition, the frame drawn again and the page built,
a forced layout, the page's focus and the Ask face's canvas, with no one cost dominant. Showing a page already built
costs 2 to 22 ms (`display` or `content-visibility` turned back on), against 200 to 300 ms to build it.

## The design

- **One bar, the kit's.** `TabBar` (`apps/dashboard/src/surfaces/kit/tab-bar/tab-bar.tsx`, kit.css `.tab-bar`, its
  gallery families "Tab bar" and "Tab bar, as a place changes"). The look moved from mobile.css and components.css
  value for value (measured: every box, colour, fill and shadow of the bar equal before and after); the page only
  places it (`.phone-places`). A place is a link, as every door is; More, which is no place, a button. One change the
  move brought to light: in the gallery's check the lit place's coral word read 3.6:1 on the dark lozenge, under the
  4.5 a word needs, so the word is the ink now, as a strip's lit tab's is, and the glyph keeps the coral (a glyph needs
  3:1). Lightening the coral instead was weighed and not taken: it is the pale salmon the canvas turned down.
- **The press answers at the touch.** A finger's press lights the place and starts the lozenge as it lands, and a
  painted frame on the address moves, while the finger is still down; the click its lift makes is the same press and
  does nothing more. A mouse, a key and a screen reader press on the click, as on any link. The frame after the paint is
  waited for by a message, never a timer: on a page that listens to touches Chromium holds timers back for about 100 ms
  after a touch lands, in case it is a scroll, and the first build's move waited for the lift because of it.
- **The lozenge glides as the strip's highlight does**: one element moved by `transform` (view-tabs/glide.ts), on the
  strip's spring, from rest, on a timeline of its own (motion/view-deck.ts `alone`), since no page slides under it. At
  rest the lit place draws its own fill, with nothing measured. Under reduced motion it does not travel.
- **The page is cut in.** A place the bar moves to draws at once, with no fade, as a phone's tab bar opens a place; one
  still reading when it lands fades in as any page does (app-shell.jsx `useViewFade`, `placed`). Moves between the views
  of one place keep their strip's slide.
- **A place holds its pages.** The Inbox is lit on Conversations and Live, People on its scopes and a person, so the
  lozenge never leaves for a view of the place. The place on screen pressed again goes to its first page, or to the top
  of the page when it is on it already; the phone app's own tab does the same (`shell:top`, one `pageToTop`).
- **The places are kept warm.** The router lets a warmed page go after five minutes and nothing warmed it again until
  the page changed: a phone put away came back to places that each waited on the server first (the 12%). They are
  warmed again as the router lets one go while the tab is on screen, and all of them as it comes back
  (workspace.ts `keepWarm`); never on a connection that asked to save data.

## What was weighed and not taken

- **Keeping the four pages alive** (Instagram's own way: each tab's screen stays built and is only shown). It would
  save the 30 to 100 ms that building a page still takes, which a person's tap now mostly hides inside the finger's time
  on the glass. Against it: the frame's `<main>` is keyed by the route and the strip's deck moves a view by replacing
  it, so its slide between Needs you and Conversations would need a second design; each page reads the address itself
  (`usePathname`) and would answer one that is not its own while hidden; ids, test ids and window keys would stand
  twice; and People and Leads kept alive with React's `<Activity>` measured no gain on 5 October (revealing 10,000
  elements styles and lays them out again). Taken up again only if the field data after this says a page's build is
  what a person waits on.
- **Next's own keeping (`cacheComponents`)**, which hides previous routes in `<Activity>`: it keeps three routes, so a
  round of four places misses one every time; the frame's keyed `<main>` would rebuild them anyway; and turning it on is
  decision 0053's step 5, a migration of its own.
- **The move on the lift, the lozenge at the touch.** The lozenge alone would answer at once, but the page would wait
  for the finger: the 90 ms of a person's tap would stay in every move.

## Where it is held

`tooling/scripts/tests/shell/views/tab-bar.test.mjs` (the bar, its press, its lozenge, reduced motion, More, a long
press), `tooling/scripts/tests/styles/kit-components.test.mjs` (the component against its gallery family),
`tooling/scripts/tests/workspace/workspace-path.test.mjs` (kept warm), `tooling/scripts/tests/shell/phone-shell.test.mjs`
and `e2e/shell/phone.spec.ts` (the frame's bar). After it ships, production's READY for a phone's moves (Settings,
Platform, or `page_speed`) says whether the move is now the build of a page, and so whether keeping pages alive is worth
its cost.
