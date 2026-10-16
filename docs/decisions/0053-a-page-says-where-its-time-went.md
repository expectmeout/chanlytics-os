# 0053 · A page says where its time went

**Status:** Built, steps 1 and 2 (12 October 2026; Ruben: "go with all of your best decisions do the work yourself",
then "go ahead as you recommend"): step 1 (#1565, 00412) the shell's own measures, the browser's five said for the page
they were of, Server-Timing by reader and by database call, and the back office's card; step 2 for Today, one read for
its first screen, and the boot's accept no longer asking every read again. Step 3 is deferred on the numbers. Step 5 is
built (12 and 13 October 2026; Ruben: "go ahead with step 5 as you recommend", then "continue as you suggest your best
approach"): the warms kept warm, and the signed-in frame one prerender for everyone, its gate the proxy;
`partialPrefetching` is not taken, on the numbers. Steps 4 and 6 to 10 are decided, each its own change, ordered by
what the numbers say.
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
   - **Next's flags**: `cacheComponents` in step 5, once its layout no longer reads the session (built);
     `partialPrefetching` was decided beside it and is not taken (step 5 says why, and when it would be); the React
     Compiler in step 7, on `src/surfaces` first, its build time measured beside its gain, since the
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
2. **One read per route** (built for Today, 12 October 2026): `GET open` answers a page's whole first screen as one
   streamed request, called from the head in place of one request a read; the per-read routes stay for refreshes and
   for every other page until each joins (`PREFETCH_BESIDE`). What the first numbers showed, and what it changed:
   - **A cold load of Today asked for 36 reads, nine of them twice** (a production build, 12 October 2026). The boot
     holds every answer so the surfaces that read the same lists share them, and the one accept of invitations it sends
     on every boot (#1564) let go of them all, as every write does; in production it also dropped Setup's and the
     Calendar's reads in flight, which the page then asked for again at about 1.5 s, the reads its READY waited on. The
     accept now keeps the reads (`keepsReads`, client/api.ts) and lets go of them only when it seated someone.
   - **Ten of Today's eleven surfaces' reads left only once the shell had mounted.** The head started the page's own
     nine; the ten it draws beside them (the period line, the bell, Sent's runs, the playbooks, the people…) waited
     for the boot, and the parts drawn from them came last (2.7 to 4.1 s). Now the head asks `GET open?route=today`
     once (contracts `openReads`): who is looking and the page's own first, then what it draws beside them, each a
     line of JSON the moment it settles, parked under the URL the page reads it by. Each read is answered by its own
     route's `run` past one session check, one membership read (`shareMembership`) and one readers' turn
     (`shareTurn`), so its answer is the bytes its own request answered, and its refusal the same
     (`answerOfThrow`). A read the stream did not carry, or a refusal of the whole, is the page's to ask for itself.
   - Measured on a production build on a laptop (12 October 2026): the cold load's requests fell from 36 to 9, none
     twice, all in by 745 ms where they had been by 1,503; one read had the page's own in by about 280 ms against 305 to
     332 as nine, and everything by 521 to 595 against 660. In production each read was a serverless call of its own,
     many of them cold, which the laptop does not show: the field data will.
   - Not yet: a part's own Server-Timing reaches the page only as the whole read's, so a page's wait says `open`.
3. **People and Pipeline as projections**: their counts and the board in SQL, no read of everyone at boot; the
   Calendar stops drawing People. **Deferred, 12 October 2026, on the numbers**: production holds 52 people across
   its workspaces, 29 in the biggest, so the read of everyone has never asked for a second page (it pages at 1,000),
   and a move to People drew its table in 214 ms at the median (27 moves). In SQL the lists' rules would be said twice
   for nothing yet. Taken when a workspace passes 500 people, or People's READY passes 500 ms at the 75th percentile.
   **Read again 16 October 2026**: still 52 people and 29 in the biggest; a move to People at 170 ms median and 254 ms
   three in four (357 moves in 14 days). Still deferred. The back office's speed cards now set People's moves against
   the 500 ms line ("Steps waiting on their numbers", contracts `pageSpeedWords`), so passing it is seen where the
   pages' time is read; the 500 people are not read there, and stay this note's to check. On main then the read of
   everyone stood in five places (People, Sent's audience, a campaign's pools, the audience reader, the Calendar's week):
   the step's reach is counted again when it is taken.
4. **The Inbox's threads as a projection**, messages read on open, and a notice that names its row patches it in place.
5. **A static shell** (built): the layout stops reading the session (the proxy and the routes verify), then
   `cacheComponents`. Its first part kept the moves warm that the frame already warmed, since every move asked the
   server for its page while the frame was a render per request:
   - **A warm was never repeated.** The frame kept a list of the pages it had warmed and let one go only on Next's
     `onInvalidate`, which Next calls for a refresh, a server action or a rewrite's retry and never for age; Next keeps
     a page warmed in full for five minutes (`staleTimes.static`), so after five minutes in a tab no page was warmed
     again and every move asked the server at the press. Now every reach asks and Next's cache decides: a page it still
     keeps is not fetched (its scheduler skips a fulfilled segment), one it has let go is (workspace.ts `warmRoute`).
     The tab bar's places (`keepWarm`, #1571) waited on the same list and on `onInvalidate`, so they were never warmed
     again either; now they are as the tab comes back to the screen and, on a tab left on screen, at the first press or
     key once Next has let them go, so a tab nobody touches asks for nothing.
   - **Settings was warmed at an address it does not open**: the phone's drawer warmed `admin/workspace`
     (`/settings/workspace`), and Settings opens at `admin` (`/settings`), another entry of Next's cache.
   - **A door warmed nothing but a person**: a name, a face or a chip that opens another page (data-bits `routeDoor`)
     now warms that page as a pointer reaches it or it takes focus, as the sidebar's rows do.
   - **A move's wait could be another page's warm**: step 1 counted any router fetch that landed inside a move as the
     page's; one of another page (a warm beside it) is now `warm`, and only the fetch of the page moved to is `page`.
   - Measured on a production build on a laptop: a warm is one request for the route's tree and one for the page
     (about 520 bytes and 2 KB), and Next still held it at 71 seconds. At 336 seconds, a pointer on Inbox's row fetched
     it again, and the press asked for nothing; a press with no warm (Reports) fetched its page at the press, the
     80 to 155 ms the field data says a move waits on in production. Opening the phone's drawer warmed `/settings`, and
     Settings then opened asking for nothing.
   - **Its second part makes the frame one prerender for everyone** (planned by three independent designs, a judge
     who checked them against Next 16.3.8's source and four refuters, none of whose claims fell; the plan is
     `docs/2026-10-12-chanlytics-static-frame-plan.md`, outside the repository). The `(os)` layout reads no request,
     so `cacheComponents` prerenders every workspace page once, for any address of its route: a document is the
     build's file, and a warm is the build's segment files behind the proxy (`router.prefetch` with no kind, where it
     was a render in full for one address). What it took:
     - **The proxy is the page gate.** Its matcher covers every `/w/` path in either case (`/(w|W)/:path*`): an address
       ending in `.png`, `.css` or `.js` skipped its first pattern, and the layout's own check was all that stood in
       front of it; signed out, the router's request for `/w/acme/people/x.png` was answered with the page's payload
       (the spinner and its scripts, no one's data). Vercel routes `/W/...` to the same page (production, 12 October
       2026), so the pattern takes both cases. The layout's check, kept as a guarantee should the proxy be bypassed,
       guarded a frame with no one's data in it and never ran on a move or a prefetch; every read verifies the session
       itself (`withRoute`). The proxy is held by running it (`auth-gate.test.mjs`, "the gate, run": every ending and case, signed out,
       a token signed by a key the project does not hold, a key it does, the auth server down), the `(os)` tree by the
       lint (no session, header or database), and the build by `check:static-shell`.
     - **A workspace's documents are never stored**: `private, no-store` from `next.config.ts` for `/` and `/w/...`
       when the request is not the router's, which Next answers itself. Until now they were no-store only by being a
       render per request.
     - **What cacheComponents refuses**: 17 route handlers drop `dynamic = "force-dynamic"`, which it rejects; the five
       public pages of a business (`/b`, `/yes`) say `instant = false` and render per request as before; the voice
       route drops `runtime = "nodejs"`, which it also rejects (Node is the default); `/api/version` and the filler's
       feed await `connection()`, so the deploy probe names the deploy that answers, and the feed its own day.
     - **The frame reads the address only in the browser**: `LegacyHost` draws the frame, the first reader of the
       router's address, once the address is placed, which a prerender never does, and the hash-to-path move sits in a
       boundary, as Next asks of a read a prerender cannot know. The server's frame is today's spinner.
     - **`next` pinned exactly** at 16.3.8 (0054, rule 3): the plan rests on this release's scheduler and segment cache.
     - **Partial Prefetching on** (`partialPrefetching: true`, 14 October 2026, on 16.4.1, which asks for the switch;
       17 makes it the default): a warm is one App Shell per route, and the frame's is its prerender. Two production
       builds of one commit, without it and with it, wrote the same segment files and asked the same: a warm is the
       route's tree and its page (about 490 bytes and 2.5 KB gzipped), another address of the route or another
       workspace asks for nothing, and a warmed move asks the server for nothing.
     - **A warm on its own goes on 3g too**: a warm is the build's files now, about 3 KB a page, and on a slow line the
       round trip it saves at the press is the longest. Save-Data and 2g still warm only what a pointer or a finger
       reaches (`warmsOnItsOwn`). Chrome reads a desk's line as 3g when its round trips run long for a moment, and the
       idle warms stopped there.
     - **A page's idle warms skip its own addresses, as judged when it asked**: Reports' strip warmed its lenses, the
       warm went once the Inbox was on screen, and Next asked the prerender for each lens's head alone, which it answers 404. A move between a page's addresses never asks the router.
   - Measured on production builds on a laptop, this build against main's, the same workspace:
     - **Moves**: after the idle warms, a press on People or the Calendar asked the server for nothing, and a
       person's address after People was warmed asked for nothing either: one warm serves every address of a route.
       A warm is the route's tree (about 800 bytes) and its page's segment (about 2.5 KB), and the frame's own segment
       once. In production a warmed move loses the router's wait, 80 to 155 ms of a move's 190 to 335 at the median.
     - **Loads** (five each, the median): the first byte 8 ms against 17, then one request for the frame's payload,
       which a frame prerendered for any address does not carry (in by 36 ms, from the build's segment files); the
       frame booted at 386 ms against 372, and Today's first screen was in at 638 ms against 612. Level on a laptop,
       where a render is cheap and the scripts arrive at once. In production the payload's 5 KB arrives while the
       frame's scripts still are, and the document no longer waits on a function: the slowest tenth of loads waited
       261 ms for a first byte (294 on a phone, 14 days to 12 October 2026), a cold function, which a prerendered file
       never is. The field data by build says whether loads moved; a rise there is undone by `instant = false` on the
       workspace layout, which renders documents per request again and keeps every warm static.
     - Signed out, every address under `/w` (`x.png`, `.js`, a capital W, the router's own request) was the proxy's
       redirect, with its `?w=` and fragment and `private, no-store`.
   - **`partialPrefetching` is not taken.** Its one gain here, a warm that serves every address of its route, came
     with `cacheComponents` and Next's default prefetch (varyParams re-keys a client page's segment across params):
     the person's address above asked for nothing without it. What it adds is a runtime prerender beside each dynamic
     render of a route that reads the request (Next's app-render), and nothing under `(os)` does. Taken when a page
     under `(os)` reads its params on the server, or when Next makes it the default.
6. **One persisted query cache** behind the seam (TanStack Query, IndexedDB), replacing the six, surface by surface.
7. **The shell's stylesheets and chunks split by surface; the React Compiler** on `src/surfaces`. Measured 12 October
   2026 (`next experimental-analyze`): of what a cold load fetches at boot, contracts' browser entry is about 30%, Next
   itself about 17%, Supabase's client about 7%, and every surface's code the rest, Settings' included on Today. Handing
   the bundler contracts' sources with `sideEffects: false` saved nothing (route JS 809,607 bytes against 806,913): the
   shell imports every surface's data and its view at boot (LegacyApp, the manifest, seed-globals), so what it carries
   is used. The split is the shell's own, surface by surface as each leaves it (decision 0015), not the packages'.
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
