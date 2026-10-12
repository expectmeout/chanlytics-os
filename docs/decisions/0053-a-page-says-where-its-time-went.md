# 0053 · A page says where its time went

**Status:** Built, step 1 (12 October 2026, 00412; Ruben: "go with all of your best decisions do the work yourself"):
the shell's own measures, the browser's five said for the page they were of, Server-Timing by reader and by database
call, and the back office's card. Steps 2 to 10 are decided, each its own change, ordered by what step 1's numbers say.
Written against commit `b220a8b74` (main, 12 October 2026, after #1563). Where this note and the code disagree, the
code wins.

## Context

Ruben asked, on 12 October 2026, which pages, parts of a page and components load slower than the others, and for
the architecture that would make them fast. The review he read (`2026-10-12-chanlytics-page-load-architecture-review.md`,
outside the repository) found the speed machinery sound and its measurement blind. Read against `b220a8b74`:

- **Field data saw document loads only.** 00255 kept the browser's five (LCP, INP, CLS, FCP, TTFB) for each page load,
  named for the page the load landed on, through Next's `useReportWebVitals` (`client/field-data-reporter.ts`). The
  shell moves between pages without a document load, so a move, which is most of what a person waits on, was never
  measured, and an interaction on a page reached by a move was counted under the page the load began on.
- **Nothing said which part of a page was drawn last**, or what the page waited on: the head's prefetch, the page's own
  read, a chunk, or rendering.
- **Server-Timing said two numbers**, `auth` and `app` (`server/server-timing.ts`): not which reader a slow answer
  waited on, nor how many database calls it made.
- **The back office's card** read the 75th percentile of the five, by page, from page loads alone.

## Decision

1. **A page says when it is drawn with its rows.** Two measures of the shell's own: `READY`, a page or a part of one
   drawn with the rows a person came for, timed from the press that asked for it (a move) or from the document's start
   (a load), to the paint after it; and `SETTLED`, every surface the route draws read, once per load. Each report says
   its page, its part (none for the page itself: `PRIMARY_PART` names the part whose READY is the page's), the page it
   came from (none for a load; the page itself for a move within it, a thread opened, a person changed), whether it
   drew held rows, and what its time went on: the read it waited for (`wait`, `wait_ms`), that read's server and
   database time and count (`server_ms`, `db_ms`, `db_n`), the chunk it fetched (`chunk_ms`) and the rendering after
   (`render_ms`). A page with no primary part says READY when its route's gate opens and the frame paints.
2. **The browser's five say the page they were of.** web-vitals' attribution build, with soft navigations: a move's
   LCP, INP and CLS are reported under the page it moved to, each with the element (its nearest `data-testid`, else
   its tag and class, never its text) and the phase that took the time. Where a browser reports no soft navigations,
   an interaction and a shift are named for the page on screen when they happened.
3. **A load says its device and build**: `desk` or `phone` at the kit's one breakpoint (900px), and the deploy's sha.
4. **Server-Timing says where the handler's time went**: `auth`, `app`, `db` with its call count, and each reader the
   request read through (`read.<name>`), slowest first, at most eight.
5. **Only a production build reports, and never a browser driven by automation** (`navigator.webdriver`): a dev
   build's numbers are compile time, and the suites' runs are not people.
6. **The back office reads the 75th percentile** by page and part, by how the page was reached (a load, a move, a move
   within), by device and by held or read, with what the slowest waited on most often; and the elements whose
   interactions, paints and shifts cost the most (`page_speed`, `page_spots`). A row needs 20 samples, an element 10.
7. **The review's six owed decisions**, made as Ruben asked, each with how it is undone:
   - **Hybrid delivery: yes, staged** (steps 5, 2, 6): a static shell, the first data in one read, then the client's
     store. Each is its own change and stands without the next.
   - **The query cache: TanStack Query, behind the seam** (step 6, under 0054). `useSurface` stays the one way a page
     reads, so no page changes when the engine under it does; the six caches leave surface by surface, each proved
     equal by value. Undone by putting the old engine back under the same seam.
   - **Next's flags**: `cacheComponents`, then `partialPrefetching`, in step 5, once its layout no longer reads the
     session; the React Compiler in step 7, on `src/surfaces` first, its build time measured beside its gain, since the
     build is what Vercel bills. `experimental.webVitalsAttribution` is not set: it feeds Next's own reporter, which the
     shell no longer uses. Each is one line of `next.config.ts`.
   - **A realtime notice may carry the changed row's id** (step 4): an amendment to 0019's "never carries a row". An
     id is not the row: the page reads it under RLS, as it reads the list today. A notice without one is read as today.
   - **The database's size** (compute and pooler) is Ruben's: it is spend. `db_ms` and `db_n` are the evidence for it.
   - **0015's order is kept**: step 7's chunk and stylesheet split follows the surfaces as they leave the shell.

## Shape

- **The words**: `packages/contracts/src/shell/vitals.ts` (`PAGE_SPEED`, `PAGE_METRICS`, `PAGE_DEVICES`,
  `PageVitalDetail`, `vitalsPageOf`, which names People's scopes and a person's page by their own names, and
  `PRIMARY_PART`); `shell/vitals-schema.ts` (at most 100 reports a beacon); `shell/page-speed.ts` (the card's rows,
  bands and sentences, `pageSpeedWords`).
- **The table**: 00412 adds `part`, `came_from`, `warm`, `device`, `build` and `detail` to `page_vitals`, each held by
  a CHECK (detail a JSON object of at most 2048 bytes); `note_page_vitals` takes the device and the build, and keeps a
  report's own page; `page_vitals_p75` reads page loads alone, as its card always meant; `page_speed` and `page_spots`
  are new, on the service role alone. Kept thirty days, as before.
- **The shell**: `client/page-speed-rules.ts` (the timer's rules and the wait's reading, pure, run in node) and
  `client/page-speed.ts` (the browser's side: the shell's moves and the resources the browser fetched);
  `surfaces/use-surface.ts` `usePartShown(page, part, ready, key)`, which each part calls; `legacy-bridge/LegacyApp.tsx`
  installs it and draws `SpeedFrame` last; `legacy-bridge/workspace.ts` says when a route is asked for;
  `legacy-bridge/surface-registry.ts` `routeGateOpen`.
- **The parts placed**: Today (queue, setup, strip, card, look), Inbox, Conversations and Live (list, thread or call),
  People and Leads (table), Pipeline (board), a person (hero), Calendar (board).
- **The browser's five**: `client/field-data-reporter.ts` on `web-vitals/attribution`, loaded once the page has
  loaded, as before; `client/field-data.ts` keeps each report under its id and sends it again when it changes.
- **Server-Timing**: the request's store in `packages/channels/src/log/request.ts` (`noteTiming`, `requestTimings`);
  the database observer's `timed` (`packages/db/src/observe.ts`); the readers' cache (`server/readers/index.ts`);
  `server/server-timing.ts` writes the header.
- **The card**: three cards in Settings' Platform tab (`surfaces/settings/platform/cards.tsx`): where the pages' time
  goes, what is drawn last, what a person waits on; read with the overview (`server/platform/vitals.ts`
  `platformSpeed`). `page_vitals`' four functions are called by name in one place,
  `packages/db/src/repositories/reports/page-vitals.ts`.
- **In DevTools**: each report is a measure on the Performance panel's track "Pages", in the group "Chanlytics".

## Steps

Step 1 is this change. The rest are the review's ranked list; each is its own change, taken once step 1 has a week of
production numbers, and the one whose page is slowest goes first.

1. **Measure** (built): the above.
2. **One read per route**: a composite `open` read over the readers' `load()`, called from the head; the per-read
   routes stay for refreshes.
3. **People and Pipeline as projections**: their counts and the board in SQL, no read of everyone at boot; the
   Calendar stops drawing People.
4. **The Inbox's threads as a projection**, messages read on open, and a notice that names its row patches it in place.
5. **A static shell**: the layout stops reading the session (the proxy and the routes verify), then
   `cacheComponents` and `partialPrefetching`.
6. **One persisted query cache** behind the seam (TanStack Query, IndexedDB), replacing the six, surface by surface.
7. **The shell's stylesheets and chunks split by surface; the React Compiler** on `src/surfaces`.
8. **Claims carry the memberships**; the JWKS warm at boot; `preconnect` to Supabase; a list unchanged answers 304.
9. **Felt**: the route fade at most 120 ms, or a view transition; the last page kept under `<Activity>`.
10. **On a phone**: Live's list kept for a reload; the glass's paint measured on a low-end Android.

**Both orders:** the route takes a body from before 00412 (the page and its five) and keeps it as it did; an older
shell sends that body. The dashboard's write needs 00412's `note_page_vitals`; before it, the write fails and the
report is lost, never an error (the door's own rule), and the card reads no rows.

## Tests

`tooling/scripts/tests/platform/page-speed.test.mjs` runs the timer over doubles (a load, a move, a move within its
page, a begin said twice at once, the gate, settling, a hidden tab and the minute's ceiling, the wait's choice, a
read's name), the browser's five as reports and their elements' words, the back office's read and the card's
sentences. `field-data.test.mjs` holds the seven
to the table's set, the names of People's pages, the device and build, the refusals and the beacons in several.
`page-vitals.db.test.mjs` runs 00412 on the stack (the columns' CHECKs, the report's own page, `page_speed`'s groups
and its `waits_on`, `page_spots`). `routes/server-timing.test.mjs` holds the header's shares, the request's store,
the database calls and the readers.

## Risks

- **More rows**: a load now sends about twenty reports where it sent five. The reads take the latest 50,000 within
  seven days, and the purge keeps thirty.
- **Soft navigations are Chromium's**: elsewhere a move's LCP is not reported and its INP and CLS are named by time.
  READY is the shell's own, and every browser says it.
- **A held page draws at once**: its READY is near zero, so every row is split by held or read, and the card says it.
- **What a part calls ready is the part's**: a part that says ready before its rows are drawn would lie. Each hook
  reads the same value the part draws from.

## Not decided here

- A time budget per route in CI beside the byte budget, and `instant()` tests for the static shell (step 5's).
- Watching `pg_stat_statements` per SQL function, as the 9 October findings were made.
- The database's compute and pooler (Ruben's).
