# 0101 · A phone opens on what it last showed

**Status:** Built, not yet deployed (6 November 2026; Ruben: "Rows before React", from the load speed review of that day).
Written against commit `d667c818a6` (main, 6 November 2026, after #2123). Where this note and the code disagree, the code wins.

## Context

Moving between pages on a phone was already near native: 85 ms to the Inbox and 103 ms to People at the median (production,
14 days to 6 November 2026). Opening the app was not: 1.14 s to the Inbox and 0.82 s to People with the rows already on the
device, 1.91 s and 2.44 s without them. The reads were never the wait: at a phone's pace (CPU 4x, 9 Mbps, 60 ms) People's reads were
back by about 0.8 s and the app's code ran only at 1.5 to 2.1 s. Every first paint before that was the frame's outline, whatever the
device already knew. And an installed app opens at `/`, which ran the whole frame's code only to send the tab to `/w/<slug>` as a new
document that loaded it again: Today drawn at 3.8 s from the home against 2.4 s from its own address at that pace, a difference no
page's measure counted, since each starts with its own document.

## Decision

1. **The frame keeps a copy of a phone's screen** as it is left: the page's chrome and the rows on the screen, cloned from the frame's
   own elements (`apps/dashboard/src/surfaces/frame/first-rows.ts`), so there is no second way of drawing a row. A bare address of the
   Inbox, People or Today, at rest and at its top; nothing below the screen, nothing hidden, no id. Made as the page is put away, and
   a moment after its rows are drawn.
2. **The document draws that copy before any of the app's code** (`packages/contracts/src/shell/first-rows.ts` `firstRowsScript`, last
   in the body of `apps/dashboard/app/layout.tsx`), in the first paint. Only under what it was kept under: this phone's width, and the
   very stylesheets it was drawn with, read from the document's own links. A deploy that changes no stylesheet keeps the copy, and one
   that does starts that page on its outline once.
3. **The page takes its place in one frame.** `usePartShown` lets the copy go in the draw that puts the page's rows on the screen,
   before the paint (`firstRowsDrawn`): the Inbox's and People's first part, Today's last, since its first would leave the rest of
   the copy's page yet to come. What arrives under the copy plays no entrance (`useViewFade`, `useRowsArrive`), and is laid out but not
   painted. A route that is another's or cannot be read lets it go at once, as a handover and the create screen do, drawn in the
   frame's place; the app's code holds it for 8 s at most, and the document for 20 s where no code came.
4. **It is a picture.** Inert, and a press on it is the page's: a finger on a row lights it, and a press on a row or a place of the
   tab bar is made again on the page once the page is there. Any other press and any drag do nothing yet.
5. **It says nothing it may have made untrue.** Kept as the surface cache's rows are: cleared by the same calls at every sign-in,
   sign-out and switch (`clearSurfaceCache`), written by nothing once sealed, and never drawn past its age: a day for a list, an hour for
   Today, whose sentences carry the hours and the waits. A list's copy over five minutes old leaves its times as their room
   (`data-aged`, `data-when`), until the page says them.
6. **The home sends the tab on before anything has run** (`homeBootScript`), where the browser remembers a workspace and the address
   holds nothing else. Anything else is still the home's own code.

## Shape

`FIRST_ROWS_PAGES` names each page: its route, the part that lets the copy go, its blocks and how old its copy may be. A page joins by
a row there, once a film of its handover shows nothing moving. `READY` with part `first-rows` is when the copy was painted, for the
back office's card. A copy is held to `FIRST_ROWS_MOST_CHARS`. A browser a suite drives neither keeps nor draws one, as it reports no
page speed; `FIRST_ROWS_TEST` lets its own spec in.

## Tests

`tooling/scripts/tests/shell/views/first-rows.test.mjs` runs both scripts over a stand-in for a document: where a copy may be drawn and where
not, what it stamps, a press, and the home against `homeHref`. `e2e/shell/first-rows.spec.ts`, a phone in a browser: the copy against
the frame part by part, nothing moving at the handover, a press made again, nothing left once a session ends.

## Risks

- **A copy is customer rows in local storage**, as the surface cache has been since October, under the same rules.
- **Rows a moment out of date stand until the page is there**, about a second, as the surface cache's did once the code had run.
- **A deploy that changes a stylesheet costs that page's next open its copy**, once; a sheet's name follows its contents, so one that
  changes none keeps it (two builds compared, 6 Nov 2026). 45 of main's last 100 merges changed one. Field data says how often it is
  felt (`first-rows`).
- **The copy costs the page a little:** at a phone's pace the page was usable 60 to 110 ms later, for rows on screen about 600 ms sooner
  (one build, alternating loads, 6 Nov 2026).
- **Safari cannot be profiled from this PC.** The copy stands in the page, never fixed, so Safari 26's strip reads what it reads of the
  frame; a real iPhone is the proof that is owed.

## Not decided here

- Keeping a desk's screen. Wider layouts open on a thread as well, and the numbers asked for the phone first.
- Opening where a person left off rather than on Today.
