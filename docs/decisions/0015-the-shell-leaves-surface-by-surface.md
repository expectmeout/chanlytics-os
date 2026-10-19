# 0015 · The shell leaves, one surface at a time

**Status:** Accepted by Ruben, 28 Sep 2026. Built: steps 1 to 11 of the order, the address and every surface but Ask
(each has its _Built_ section below, the last of them Settings' frame on 4 October 2026); step 12 (Ask) and step 13
(the frame, then the tree) to come. Ruben left the open questions to be settled by analysis (27 September); the
answers close the note, and he accepted it with one amendment, which follows them. Written against commit `519724e9c` (main, 27 September 2026, after the organization
program merged in #1161), and every file and line below was read at it. Where this note and the code
disagree, the code wins. It is the exit the plan `docs/plans/2026-09-26-organization-and-code-health.md` asks for
(§2, 40 · Technical debt: "an exit path written for the largest item") and the register names in its shell rows
(`docs/debt.md`). The next free number was 0014, which #1165 took for a partner who hears what changed, so this
note takes 0015.

## Context

### What the shell is

The operator UI is a single-page React shell that began as a design mockup and was made real one surface at a time by
branching inside its components (`README.md`, _Things that will surprise you_). `/w/<slug>` renders one component
(`apps/dashboard/app/(os)/w/[workspace]/page.tsx`), `LegacyHost`, which renders `LegacyApp`
(`apps/dashboard/src/legacy-bridge/LegacyApp.tsx`). That seeds the globals (`seed-globals.ts`) and then evaluates the
manifest (`manifest.ts`): 123 JSX files under `apps/dashboard/src/legacy/`, imported in a fixed order because they are
classic scripts. None of them imports anything. Each destructures `React` from `window`, reads what the others and the
bridge put there, and publishes its own components with `Object.assign(window, { … })`. `Chanlytics.html` loads the
same list for the standalone mockup, and `legacy-harness.test.mjs` holds the two lists to one order.

The tree is about 53k lines of JSX: `pages/` 76 files and 37.6k lines, `components/` 24 and 6.9k, `data/` 13 and 3.3k,
`demo/` 11 and 5.1k. It sits outside the checks that hold the rest of the repository:

- `apps/dashboard/tsconfig.json:20` excludes `src/legacy`, so nothing in it is typechecked;
- `.prettierignore` leaves `apps/dashboard/src/legacy/` alone, "surface by surface as each one moves to a real route";
- `eslint.config.mjs:264` gives it the hooks rules and nothing else, with an alias list of five effect hooks.

### How a surface is fed

`surface-registry.ts` classifies every route as `real` or `demo` (`SURFACE_STATES`) and names the override that feeds
each real one (`ROUTE_SURFACE`). The override lives in `surface-data.ts` and, by the seam's own contract, fetches from
`/api/v1`, maps the rows through a contracts view model, and "writes the SAME window globals the surface already reads"
(`surface-data.ts`, the header). So a real page still reads its data from `window`: `window.__REPORTS`
(`surface-data.ts:1810`), `window.__PEOPLE` (`:938`), `window.__LIVE` (`:1901`), `window.__SETTINGS` (`:687`). Its verbs
are TypeScript modules in the bridge (`inbox-verbs.ts`, `broadcast-verbs.ts`, `people-detail.ts`) installed on
`window`; its words are contracts functions that `seed-globals.ts` publishes on `window`.

### The address is a hash

`/w/acme#/inbox` is the address. The frame listens for `hashchange` (`pages/app-shell.jsx:334`, and the bridge at
`legacy-bridge/app-bridge.ts:106`), publishes `window.appNavigate` (`app-shell.jsx:626`), and `pages/app-routes.jsx` is
the table from a route to what it draws. Hash addresses are already outside the code's reach:

- emails the edge sends (`apps/edge/api/admin/you-are-live.ts:99`, `apps/edge/api/cron/lines.ts:124`);
- the phone app, which opens the web app in a view (`apps/mobile/src/site.ts:22`);
- every bookmark a member made.

The bell's rows store a route name without the `#/` (`packages/contracts/src/today/notifications.ts:28`), so they read
the same under a path. Because the address is a hash, the App Router cannot split the shell by route: the whole shell,
its seeds and its demo pages are one client chunk.

### The measures

The register's block holds the two numbers this program exists to bring to zero: window globals (the `window.__*`
names the shell reads) and window publishers (`Object.assign(window, …)` and `window.x =` sites), each a baseline that
may only fall. At `519724e9c` they are 194 names and 388 sites in 141 files. By surface, measured with the ratchet's
own definitions (`_ast.mjs`, `windowUse`); a name several groups read counts in each:

| Group                                                 | Files | Lines  | Publisher sites | Names read | Names only it reads (with the bridge) |
| ----------------------------------------------------- | ----- | ------ | --------------- | ---------- | ------------------------------------- |
| Reports                                               | 2     | 639    | 3               | 8          | 3                                     |
| Inbox, Conversations and the thread                   | 6     | 4,021  | 29              | 23         | 10                                    |
| Today                                                 | 8     | 1,490  | 9               | 13         | 2                                     |
| People, its person page, Lists and the Pipeline       | 12    | 7,547  | 31              | 47         | 23                                    |
| Calendar                                              | 1     | 791    | 9               | 5          | 0                                     |
| Campaigns: Broadcasts, Playbooks, Messages, templates | 9     | 3,781  | 13              | 24         | 13                                    |
| Live                                                  | 1     | 584    | 1               | 7          | 4                                     |
| Leads                                                 | 7     | 3,630  | 7               | 33         | 27                                    |
| The first run and Setup                               | 2     | 1,759  | 4               | 19         | 1                                     |
| Settings and its panes                                | 20    | 9,468  | 33              | 67         | 27                                    |
| Ask                                                   | 6     | 2,652  | 11              | 7          | 0                                     |
| The frame: `app-shell`, `app-routes`, `components/`   | 26    | 8,094  | 48              | 51         | 9                                     |
| Seed data (`data/`)                                   | 13    | 3,287  | 47              | 13         | 1                                     |
| The demo tree (`demo/`)                               | 11    | 5,055  | 12              | 2          | 0                                     |
| The bridge (`legacy-bridge/`, TypeScript already)     | 82    | 17,170 | 131             | 127        | 101                                   |

The bridge is the largest publisher: it puts on `window` what the pages read. Its 131 sites fall as the pages that read
them leave, not by editing the bridge on its own.

### The stores and the twins

Twelve `*_STORE`s hold session state on `window`: `IX_STORE` and `VW_STORE` (`data/inbox-data.jsx`), `ST_STORE` and
`INT_STORE` (`pages/settings.jsx`), `FL_STORE` (`data/fleet-data.jsx`), `LM_STORE` (`data/live-data.jsx`), `LD_STORE`
(`data/people-data.jsx`), `SG_STORE` (`pages/segments.jsx`), `AS_STORE` (`data/store-data.jsx`), `PR_STORE`
(`components/data-bits.jsx`), `CP_STORE` (`pages/client-profile.jsx`) and `ZONES_STORE` (`legacy-bridge/zone.ts`). Some
cross surfaces: `IX_STORE` is read in sixteen files, the Inbox's and Today's among them.

Five real pages still fork to a seeded twin when their surface is absent: `pages/calendar.jsx:788` (`CalendarSeed`),
`pages/broadcasts.jsx:959` (`BroadcastsSeed`), `pages/outbound.jsx:239` (`OutboundSeed`), `pages/live-monitor.jsx:21`
and `:584` (`LiveMonitorPage`), and `pages/client-profile.jsx:1830` (`ClientProfileSeed`); `pages/segments.jsx:157`
reads `BC_HISTORY_SEED`. The first four twins live under `demo/`, and they and `BC_HISTORY_SEED` are why the manifest
still loads the demo tree for every workspace (`docs/debt.md`, the demo row). Reports and Today draw a declared demo session from a contracts sample instead (`surfaces/reports/sample.ts`, formerly `reports-sample.ts`,
`today-sample.ts`), which is the shape a twin should have had.

### What the plan and the register already say

The register's shell row retires when "every real surface is a TSX module on an App Router route, with typed imports
and its `*_STORE` and seed twin gone; then the frame, the manifest and the tree". The plan's §4 (17, Frontend architecture) puts first what makes the move cheaper: the effect
hooks' alias as `use\w+Effect`, `exhaustive-deps` as an error under the warnings ratchet, `no-undef`, and a
`legacy-globals.d.ts` generated from the publishers the ratchet already lists. The tree-shape ratchet already refuses a
new file in `legacy/pages` and `legacy/components`, both over its ceiling.

## Decision

**The shell leaves one surface at a time, onto App Router routes, as TypeScript that imports what it uses. The address
moves first; the frame hosts both kinds of page until it moves last; the globals and publishers ratchets are the
measure of how far it has come.** No surface is redesigned on the way: a move draws what the JSX drew, and a design
change is its own pull request before or after.

### The address first

`/w/acme/inbox` becomes the address, and `/w/acme#/inbox` keeps working for ever: the frame replaces a `#/<route>`
address with `/<route>` on load, before it draws. Emails in inboxes and the phone app's links are never re-sent, so
that redirect is permanent. The frame moves from `page.tsx` into `app/(os)/w/[workspace]/layout.tsx`, so it stays
mounted across a navigation; a catch-all `[[...route]]/page.tsx` draws nothing of its own and leaves the route to the
legacy table. The frame's `navigate` pushes a path through the App Router; it stops listening for `hashchange`.

### A surface, done

A surface has left the shell when all of this is true, in one pull request:

1. **A TSX module on an App Router route.** `app/(os)/w/[workspace]/<route>/page.tsx` draws it; its code lives under
   `apps/dashboard/src/surfaces/<surface>/`; `pages/app-routes.jsx` loses its row in the same change, so a route is
   never drawn twice. The frame draws the route's page where the legacy table would have drawn its component.
2. **Typed imports, nothing from `window`.** Its data through a hook over the seam (`useSurface("<key>")`, over the
   runner and the cache that exist), its verbs by importing the bridge's modules, its words from contracts, its
   components from the TSX kit. It reads no `window.__*` name and publishes nothing.
3. **Its store and its twin gone.** The `*_STORE` it owns and the seeded twin it forks to are deleted, with the seed
   data only they read. A demo session draws a contracts sample, as Reports and Today do.
4. **The checks cover it.** Typecheck, Prettier and the full lint apply to `src/surfaces` like any other browser code;
   `eslint.config.mjs` names it in the browser layer beside `legacy-bridge`, `client`, `yes` and `auth`.
5. **The numbers bank.** The names only it read leave `window-globals.json`, its sites leave
   `window-publishers.json`, and the bridge's publishes whose last reader it was go with it; all banked with
   `UPDATE_BASELINES=1 corepack pnpm test` in the same diff.
6. **Its route says the product's word.** Where the glossary lists a route that disagrees (`#/clients`, `#/segments`,
   `#/outbound`, `#/messages`, `#/admin`), the path takes the product's word and the old name redirects.

### What is shared moves once

A component two surfaces draw (`EmptyState`, `FailedRead`, `RecordSheet`, the chips) moves when the first surface that
needs it moves: its TSX module becomes the one implementation, and `seed-globals.ts` publishes it under its old name
for the legacy pages still reading it, as it publishes contracts functions today. A store two surfaces read
(`IX_STORE`) moves the same way: into a typed module with the first of them, published once for the rest until the
last leaves. Neither is ever written twice; the site moves from the JSX file to the bridge, so the publishers count
does not rise.

### How the two numbers reach zero

Each surface banks the names only it read and the sites only it had. A name the frame or another page still reads
stays until that reader moves; the step that moves the last reader deletes the name and the bridge's publish of it.
Nothing in `src/surfaces` may add a name (the globals ratchet already refuses one) or a site. The frame's step takes
what is left, `seed-globals.ts` and the data seeds with it, and the two baselines are empty. Then their rows leave the
register, and the two measures leave `_measures.mjs` with their baseline files, as the register's rule says.

### Beside it

The plan's lint steps for the shell (§4, 17) protect the pages while they wait, and go first: the effect hooks matched
as `usew+Effect`, `exhaustive-deps` an error under the warnings ceiling, `no-undef`. Type-checking the JSX where it
stands (`checkJs`, a surface at a time), which the plan also lists, is not a step of this program: a surface goes
straight to TSX, where the typecheck already reaches, and typing it twice is work thrown away. A `legacy-globals.d.ts`
generated from the publishers is worth writing only for the bridge, whose window casts it would replace (the casts row
of the register); it shrinks as the names do.

### The order

| Step | What moves                                                | Why here                                                                                                                                                                   | What retires with it                                                                                                                                                     |
| ---- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | The address                                               | Every later step needs a route to land on, and it moves no surface                                                                                                         | `hashchange` in the frame and the bridge                                                                                                                                 |
| 2    | Reports, the pilot                                        | The smallest real surface: two files, three sites, eight names, no store, no twin, and its demo is already a contracts sample. It proves the route, the hook and the tests | Its names and sites                                                                                                                                                      |
| 3    | Inbox, with Conversations and the thread                  | The surface a member lives in, and the owner of the stores Today reads                                                                                                     | `IX_STORE` and `VW_STORE`, and `LM_STORE`, which Conversations reads, into typed modules; the inbox and conversation seeds only they read                                |
| 4    | Today                                                     | The home page; it reads nine surfaces (`ROUTE_DRAWS.today`), so it goes once their hook exists, and after the Inbox whose decisions it counts                              | The dashboard seeds only it reads                                                                                                                                        |
| 5    | People: the list, the person page, Lists and the Pipeline | The largest real surface; its person page reads the Calendar's seed, so it goes before the Calendar                                                                        | `ClientProfileSeed`, `CP_STORE`, `SG_STORE`, `LD_STORE`; `segments.jsx`'s read of `BC_HISTORY_SEED`; `#/clients` and `#/segments` become the product's words             |
| 6    | Calendar                                                  | After People, whose person page reads its seed (`CALENDAR_DATA`); the frame's read of it goes at step 13                                                                   | The `CalendarSeed` fork and its twin in `demo/pages/calendar.jsx`                                                                                                        |
| 7    | Campaigns: Broadcasts, Playbooks, Messages, templates     | Two twins to retire, and two of the glossary's renames                                                                                                                     | The `BroadcastsSeed` and `OutboundSeed` forks and their twins; `#/outbound` and `#/messages` become Playbooks and Templates                                              |
| 8    | Live                                                      | Its twin, and the last real page that forks to one                                                                                                                         | The `LiveMonitorPage` fork and its twin in `demo/pages/live-monitor.jsx`                                                                                                 |
| 9    | Leads                                                     | Many names only it reads, no store, no twin                                                                                                                                | Its names and sites                                                                                                                                                      |
| 10   | The first run and Setup                                   | Reads Settings and Live, both typed by now                                                                                                                                 | Its names and sites                                                                                                                                                      |
| 11   | Settings, one pane per pull request                       | The most names of any surface; each pane stands alone                                                                                                                      | `INT_STORE`; `ST_STORE`'s policy rows (its role and team parts are the frame's)                                                                                          |
| 12   | Ask                                                       | When the Ask Rewired program says: its files are that program's                                                                                                            | Its names and sites                                                                                                                                                      |
| 13   | The frame, then the tree                                  | Last, because every legacy page draws inside it                                                                                                                            | `app-shell`, `app-routes`, `components/`, `PR_STORE`, `ST_STORE`, the demo surfaces and their stores, the data seeds, the manifest, `seed-globals.ts`, `Chanlytics.html` |

The demo surfaces (the fleet, the store, the studio, tasks, content, the retired deal board and the shared report
viewer) draw only inside the frame, so they leave with it. Ruben decided on 11 September to keep them in the tree
until the product is at 100% (`surface-registry.ts`, the comment on the demo rows), so where they go then is his call
(below).

## Shape

```text
apps/dashboard/app/(os)/w/[workspace]/
  layout.tsx                 the frame's host: LegacyHost, moved from page.tsx, drawing {children}
  [[...route]]/page.tsx      nothing of its own: a route the legacy table still draws
  reports/page.tsx           <ReportsSurface />, step 2; one such file per surface that has moved
apps/dashboard/src/surfaces/
  reports/                   the page, its hooks and its parts, in TSX, importing what they use
  kit/                       the shared components, each moved once by the first surface that draws it
  use-surface.ts             useSurface(key): the seam's value for one surface, typed, over the runner and the cache
```

```ts
// src/surfaces/use-surface.ts: one typed value per surface, the one the override already builds.
export function useSurface<K extends SurfaceKey>(key: K): SurfaceValue<K> | undefined;
// surface-data.ts: an override writes its value here as well as to its window global while a legacy reader remains,
// and here alone once the last one has moved; surface-cache.ts snapshots the same value.
```

The frame receives the route's page as a prop from `LegacyApp` (the App Router's `children`), never through `window`.
`proxy.ts` needs no change: every path under `/w/<slug>` is gated as `/w/<slug>` is today.

## Steps

Each is one pull request, shippable in either deploy order (the dashboard deploys alone; nothing here touches the
edge or the database), merged the day it is opened so the programs in flight rebase once. A surface moves only when no
open pull request holds its files.

1. **This note**, accepted or amended by Ruben.
2. **The address** (step 1 of the order). Held by: an e2e spec that `/w/<slug>#/inbox` lands on `/w/<slug>/inbox` and
   that a reload of a path boots the frame; a unit test of the hash-to-path mapping beside `routeOfHash`
   (`packages/contracts/src/setup/setup.ts:549`); `legacy-harness.test.mjs` unchanged; a test that no new file appears
   under `src/legacy`.
3. **Reports, the pilot** (step 2). Held by: the equality below; the page's tests re-pointed at the TSX module; the
   ratchets banked; the canonical-example table in `CLAUDE.md` gains "A real surface: `src/surfaces/reports/`", and
   _Where new code goes_ says a page is drawn there.
4. **One surface per pull request after it**, in the order above. Held by the same four things each time: the
   equality, the tests, the banked ratchets, and the harness lists shrinking together.
5. **The frame and the tree** (step 13). Held by: the two baselines empty and deleted with their rows; the legacy
   block leaving `eslint.config.mjs`, the line leaving `.prettierignore`, the exclude leaving `tsconfig.json`; the
   harness tests (`legacy-harness.test.mjs`, `_legacy-react.mjs`, `_hook-frames.mjs`) deleted with what they held.

## Tests

- **Equal by value, as Phase 2 proved its splits.** Before the JSX is deleted, a throwaway recorder draws the legacy
  page and the TSX module over the worlds the page's own tests build, pokes every handler, and compares the element
  trees, the hook cells and the side effects byte for byte (#1161's `BroadcastsReal` split is the worked example). A
  bug the types find is fixed in its own pull request, before or after, never inside the move, so the proof holds.
- **The module, run.** A TSX surface is tested by importing it and drawing it on the stub React the page tests use;
  `tooling/scripts/tests/auth/create-workspace-screen.test.mjs` already runs a TSX screen that way.
- **The ratchets.** A step banks its fall; a step that would raise either number needs an argument in its pull
  request, as every ratchet does.
- **One route, one drawing.** The registry's test (every route classified, every real route fed) gains: a route with
  an App Router page has no row in `app-routes.jsx`.
- **End to end.** Each surface's spec runs on its path address; the nightly's `no-fabricated-data.spec.ts` does not
  change.

## Risks

- **Two routers for a while.** Paths and the legacy table live side by side from step 2 to step 13. One table owns
  each route (the test above), and the frame reads the path in one place.
- **Addresses in the wild.** A hash address in an email, the phone app or a bookmark must still land. The redirect is
  permanent and tested; the phone app moving to paths is the phone program's change, never a requirement of this one.
- **A move that redesigns.** The page must draw what it drew; the equality test is what makes "it looks the same" a
  fact rather than a screenshot.
- **State that crosses surfaces.** A store two surfaces read moves once and is published for the rest; the
  publishers ratchet shows whether the last publish went.
- **Programs in flight.** Ask Rewired owns Ask; Reach out and the phone app touch pages. A surface moves only when no
  open pull request holds its files.
- **The cache.** `surface-cache.ts` snapshots the window globals an override declares; it must snapshot the typed
  value too, or a TSX surface paints cold on every boot. The pilot proves it.
- **Pace.** Thirteen steps over 53k lines is weeks of work, and nothing forces it to finish. The two numbers say how
  far it has come; each step stands on its own, so stopping halfway leaves a smaller shell, not a broken one.

## Answers (27 September)

Ruben left the note's open questions to be settled by analysis. They are:

1. **The program and its order: as written.** The address first, Reports as the pilot, then Inbox, Today and People,
   and the frame last. The order is what each surface reads, so no step has to move a store twice.
2. **The route names: yes.** Each of the five takes the product's word as its surface moves, and the old name
   redirects for ever, like the hash.
3. **The demo surfaces: a standalone mockup outside `apps/dashboard`.** Ruben chose on 11 September to keep them until
   the product is at 100%; moved out of the app at the frame's step, they keep that choice without holding the frame
   back, and no ratchet counts them there.
4. **When: the address once no open pull request holds a page that reads its own `#/` address, and the pilot right
   after it; then one surface at a time, never two in flight.** The address is not the frame alone. Five files listen
   for `hashchange` (`legacy-bridge/arrival.ts`, `legacy-bridge/app-bridge.ts`, `pages/app-shell.jsx`,
   `pages/pipeline-scope.jsx`, `pages/leads-real.jsx`), and the last two parse their own part of the address. On 27
   September the Reach out program holds the Leads page, with ten of its twelve pull requests to come, so the address
   would move under it. The lint steps and the ledger's (0018) go first, since they hold no page.

## Amendment (28 September 2026, accepted)

**Each surface moves its own `legacy-bridge` modules with it.** Accepted by Ruben with the note on 28 September 2026,
as the Road to Ten organization review recommended. A surface's step takes the bridge modules that only it uses (its
override, its verbs, its detail readers) into `apps/dashboard/src/surfaces/<surface>/` in the same pull request, and
a module two surfaces use moves with the first of them, as a shared component or store does above. Otherwise the
bridge keeps what every surface left behind: at `9e524a428` (main, 28 September) `apps/dashboard/src/legacy-bridge`
holds 56 modules against the tree-shape ratchet's ceiling of 20 (`tooling/scripts/tests/baselines/tree-shape.json`),
and about 34 of them would stay over it after the frame's step. So condition 1 of "A surface, done" includes the
bridge modules the surface owned, and condition 5 banks the bridge folder's fall with the other numbers. Since this
note was written, #1278 split the seam's overrides out of `surface-data.ts` into
`apps/dashboard/src/legacy-bridge/surfaces/`, one module per surface; that module is the first each step takes.

## Built: the pilot (30 September 2026, branch `kit/k1-address-reports-inbox-today`)

Reports left the shell as step 3 of the steps above (step 2 of the order). What the pilot settled, for the surfaces after it:

- **The seam is a typed store, mirrored.** `apps/dashboard/src/surfaces/surface-values.ts` holds one value for each key of
  `SurfaceValues` (`reports`, `google`), written by the override that owns the surface (`setSurfaceValue`), and mirrored
  under the window name the pages that have not moved still read (`declareSurfaceValue("reports", "__REPORTS")`: one line,
  deleted with its last reader). `useSurface(key)` (`src/surfaces/use-surface.ts`) is React's `useSyncExternalStore` over
  the surface's own signal. The cache keeps the value beside the globals a surface owns, under the reserved name
  `$value`, and gives it back before React draws (`SurfaceOverride.value` names the key).
- **The frame draws the page as `children`, through a prop.** `LegacyHost` passes the layout's children to the frame only
  while the address is a route with a page (`src/surfaces/routes.ts` `SURFACE_ROUTES`: the sidebar item, the crumbs and
  whether it draws in a pane, which the row said), so a move between the shell's own routes changes no prop and draws
  the frame no more than it did. `drawRoute` (`app-routes.jsx`) wraps the page it is given. A route with a page moves
  through the App Router (`goToRoute` asks the router `LegacyHost` registered), and the frame is told when the address
  says it landed (`AddressFollower`).
- **What a page still asks of the shell is one module of verbs** (`src/surfaces/legacy-verbs.ts`: navigate, the role gate,
  holdStill, askAbout, the People list door, the toast, a failed read's Retry). Each calls the window's own and is a line
  to delete when its owner moves. A surface imports it and reads nothing off `window`.
- **What is shared moved once**: `Icon`, `EmptyState`, `FailedRead`, `SegmentBar` and the chart kit are the kit's TSX
  (`src/surfaces/kit`); seed-globals publishes the four the pages still read; the standalone mockup gets them from a
  bundle its server builds (`data/kit-globals.js`), and has no Reports, which only the app draws.
- **The amendment's bridge modules** (the override, the sample, the period's verb) are in `src/surfaces/reports/`.
- **Proof.** A throwaway recorder drew the JSX page and the TSX module over the page's own worlds (37), every handler
  with every event it takes and 15 scripted sequences, and the shared components over 738 property sets: 11,918 steps,
  no difference, and 18 planted faults, every one caught (`docs/plans/` holds nothing of it: it is never committed).
- **Its kit step took what a stub can draw**: the reply's Send is the kit's `Button`, and the quiet words that act (Reply,
  Cancel, Asked, never booked, Read every review on Google) are its `LinkButton`. The one canvas of the six that could
  have covered Reports does not exist: Today, Inbox, People, Leads, Campaigns and the Pipeline are the six.
- **Two things the pilot could not do.** Base UI's parts (the kit's Field, Segmented, toast) cannot be imported on the
  stub React the page tests use, so Reports' period tabs, its reply box and its toast stay as the JSX drew them until the
  page tests can draw a Base UI part (the next step of the plan's Phase 4); Reports is listed in `KIT_PENDING` for that.
  And a route's page is not drawn for an address under it (`reports/anything`): it is not found, where the table drew
  Reports for any param.

## Built: the Inbox (30 September 2026, same branch)

The Inbox, Conversations and the one thread left the shell together as step 4 of the steps above (step 3 of the order); the
bridge modules only they used moved with them (the amendment). What it settled, for the surfaces after it:

- **A surface may be several routes, and an address may name a thing in one.** `apps/dashboard/app/(os)/w/[workspace]/inbox/[[...thread]]/page.tsx`
  and `.../conversations/[[...tab]]/page.tsx` draw `inbox/th-<id>` and `conversations/<tab>:<row>`. A `SURFACE_ROUTES` row
  takes `params` (the address may carry a tail: `routeHasPage` splits at the first `/`), `mount` and, where the chrome
  follows the address, a function for `activeNav` and `crumbs`. The page reads its route with `usePathname()`, never
  `useParams`: the App Router keys a dynamic segment by its param, so a `router.replace` between two threads would remount
  the page and read again. `goToRoute` keeps a move that stays within one route's page (`onOnePage`, for a route that
  takes an address) on the patched history, and the real-app run shows the Inbox's root element is the same node across
  thread moves. A thread pressed is a replace on a desktop (Back leaves the Inbox instead of replaying every thread read)
  and an entry of its own on a phone (Back closes it).
- **The store and the twin.** `IX_STORE`, `VW_STORE` and `VW_UTIL` are typed modules (`surfaces/inbox/store.ts`); the mockup's
  seeds are `sample.ts` and its `sample/`; the old names the pages that have not moved still read (`INBOX_DATA`,
  `CONVERSATIONS_DATA`, `IX_STORE`, `ixWaitsOnYou`, `CV_ROUTE`, `CV_IN_CHANNEL`) are one object, `legacy-globals.ts`,
  published by `seed-globals.ts` and, in the standalone mockup, by a bundle its server builds (`data/inbox-globals.js`). The
  seam's values are `useSurface("inbox")` and `useSurface("conversations")`.
- **The bridge modules** (the two overrides, and the verbs of `inbox-verbs.ts` only the Inbox used: `inboxVerb`, `inboxBulk`,
  `steerDraft`, `cancelSend`, `refreshInbox`) are in `surfaces/inbox/`; what Today, Ask and the deal sheet still call stays in
  the bridge. The surface held 29 modules against a ceiling of 20 the day it moved, so it is `pages/` (what a route draws)
  and `thread/` (what one thread draws, wherever it opens) and a root of the seam, the rules and the demo.
- **The shared parts moved once into the kit**: `StatePill`, `Confirm`, `MoreMenu`, `PolicyChip` and `TlMedia`
  (`surfaces/kit/`), published for the pages that still draw them by name.
- **Proof.** The pilot's recorder, extended for a surface that fetches: 142 worlds (every seeded thread, the real payloads in
  every state, each composer, each call, Conversations by tab), 6,495 handlers poked with each event they take, 74 scripted
  sequences and a matrix of 1,436 checks over the pure rules and the small components: 13,437 steps, no difference, and 24
  faults planted in the TSX, each caught (20 by the recorder; the shared verbs' four by their own test, which the moved verbs
  had none of). A fault at a boundary is caught only by a world that stands on it, so the plants ran off the boundary and over
  every world and script.
- **Its kit step took what a stub can draw**: 32 buttons are the kit's `Button` and 3 quiet words that act its `LinkButton`.
  `KIT_PENDING` keeps the Inbox for what waits: six inputs, three textareas and a select (Field, Switch and Select are Base
  UI's, which no page test can import yet), the chips and rows that are the page's own looks, and the toasts and menus.
  `ConfidenceMeter` is not the kit's `Meter` (the kit's draws parts by share and no words): a redraw the Glass canvas decides.
- **What a surface may not assume, from the day.** A route of a surface that follows its address (`params`) is not moved through
  the router within itself; the lint probe of the raw-element rule stands in a folder no surface will take
  (`surfaces/probe/`), since each surface that leaves waits in `KIT_PENDING`; and a test that imports a surface module through
  a template path hides its exports from knip, so they are written as literals.

## Built: Today (30 September 2026, same branch)

Today left the shell as step 5 of the steps above (step 4 of the order), after the Inbox whose decisions it counts; the bridge modules only it
used moved with it (the amendment). What it settled, for the surfaces after it:

- **The workspace's own address is a page.** `/w/<slug>` names no route, which is Today (`routeOfAddress`), so the catch-all
  page beside `today/page.tsx` draws Today when the path names none, and `LegacyHost` asks `pageRouteOf` (an empty route is `today`)
  before it hands the layout's children to the frame. `/w/<slug>/today` is the same page by the product's word. An address under it
  (`today/anything`) is no page, as `reports/anything` is not.
- **A moved surface may name the top bar's one act.** A `SURFACE_ROUTES` row takes `act` (`label`, `glyph`, `primary`, `ask`,
  `prompt`), which `drawRoute` draws for a demo session (Today's "New task" opens Ask composing): what `drawToday` gave the row.
- **What a surface borrows, it borrows through one file of doors.** Today draws from the nine surfaces of `ROUTE_DRAWS.today`, and
  eight of them have not moved. `surfaces/today/shell.ts` reads each by its global's name at call time (`borrowed`), redraws on it
  with the shell's own hook (`useMoved` is `surfaceHook` over React's `useCallback` and `useSyncExternalStore`, so the hook cells
  the page had are the ones it has), and draws the rows of the shell's pages it borrows by name (Setup's card rows, the agenda's). Each
  is a line to delete on the day its owner moves; nothing reads `window` but that file.
- **The shared component moved once, with the first surface that drew it.** The attention row (`AttnRow`: Today's queue, People's strip,
  Setup, the partner and platform panes) is the kit's TSX (`surfaces/kit/attention/`), published by `seed-globals.ts` as `window.AttnRow`
  for the pages still on the shell.
- **The twin is deleted.** The standalone mockup drew Today from a sample (`legacy-bridge/today-sample.ts` and its folder: 1,372 lines and
  its bundle, `window.__TODAY_SAMPLE`); the page is an App Router page, which only the app draws, so the mockup no longer draws it (nor
  the Inbox, nor Reports), and its bundle, its script tag and its test leave with the sample.
- **The seam.** `today` is a key of `SurfaceValues` (contracts' `TodayVM`), mirrored as `window.TODAY_DATA` for Ask, the phone's bridge
  and the bell; the override and the helpers (`TODAY_HELPERS`, once published as `window.__today` for Settings, which stopped reading it, and imported by the page since) are in `surfaces/today/`.
- **Proof.** The pilot's recorder over 75 worlds (every state of the day, the queue's rows and runs, the day's calendar and steps, the
  leaks, the pins, the bell), every handler of them, 21 sequences and 82 checks of the attention row: 3,116 steps, no difference, and
  25 faults planted in the TSX, every one caught.
- **Its kit step took what a stub can draw**: three buttons are the kit's `Button` (Open Reports, Open Calendar, Mark all read). The
  rest of Today's buttons are the page's own looks (the chips, the door rows, the queue's open, the leaks' acts), which no kit part
  has yet; Today waits in `KIT_PENDING` for them.

## Built: Campaigns and Live (30 September 2026, branch `kit/k3-campaigns-live-leads`)

Steps 7 and 8 of the order, on the pilot's mechanism and People's (`takes` and `chrome`, for the addresses a page takes under its route).

**Campaigns** (step 7): Playbooks, Broadcasts and Templates are TSX in `apps/dashboard/src/surfaces/campaigns/` on `playbooks`, `broadcasts` and `templates`
(the path says the product's word; the shell's routes are still `outbound` and `messages`, `ROUTE_WORDS`), with the reach-out rows, the sheet, the door and the
approval, the shared head, picker, reach bar and message preview, and the twins and stores retired: `BroadcastsSeed`, `OutboundSeed`, their demo pages. 19 JSX files
(6,061 lines) are deleted. The typed values are `playbooks`, `broadcasts`, `reach_outs` and `settings` in the seam; Today and Leads still read four names
(`__broadcasts`, `__refreshPlaybooks`, `__reachOuts`, and the components `bcWhenWords`, `ReachOutDoor`, `ReachOutSheet`, which `surfaces/campaigns/globals.ts`
publishes in the call that publishes the kit's names).

**Live** (step 8): `apps/dashboard/src/surfaces/live/` on `live`, `LM_STORE` and the twin (`demo/pages/live-monitor.jsx`, `demo/data/live-data.jsx`) retired, three
JSX files (1,023 lines) deleted. Live is never kept by the tab's cache: a reload must not paint a call that ended while the tab was closed. The call verbs
(`whisperCall`, `endCall`, `handOverCall`, `refreshLive`) stay in the Inbox's bridge until that file moves.

Proved equal by value (docs/decisions, "Tests"): 53,673 steps over 798 worlds for Campaigns, 0 differences, 205 planted faults caught but one argued; Live 0 differences
over 870 steps. What a demo draws is the contracts' sample, not the twin. Campaigns' kit step (Phase 4) was taken on 3 October 2026: its raw buttons, inputs, textareas and select are the kit's, and `campaigns` has left `KIT_PENDING`. Live's kit step waits: `live` stands there.

## Built: the People family and the Calendar (30 September 2026, branch `kit/k2-people-calendar`)

The Calendar, People's list, Lists, the Pipeline and a person's page left the shell as steps 5 and 6 of the order. What the
family settled, for the surfaces after it:

- **The path says the product's word.** `ROUTE_WORDS` (contracts `shell/address.ts`) names `clients` as `people` and
  `segments` as `lists`: `workspacePath` writes the word, `routeOfPath` and `routeOfHash` answer the shell's own route, and
  `movedAddress` sends an old name, in a path or a hash, to the word, keeping the search and the hash. A page's folder is
  the word: `app/(os)/w/[workspace]/people/[[...param]]/page.tsx`.
- **A family of addresses is one page.** A `SURFACE_ROUTES` entry says every address under its route is the page's
  (`params`, as the Inbox's) or which of them it draws (`takes(param)`, as People's: Leads is not), and what the frame draws
  around each: the crumbs and the nav item as functions of the param, or (`chrome({ param, backToPeople })`, where they depend on
  what the surface holds and on the frame's own Back) the crumbs, the mount its view is kept under and the top bar's one act,
  which `drawRoute` draws from `surfaceAct` (a link out, or the Ask door, composing from a `prompt` where the entry gives one).
  `staysOnPage(from, to)` says a move between two of them stays on the page, so `goToRoute` asks the App Router only across pages and otherwise pushes or replaces an
  entry, which `usePathname` follows. The page follows its own address, so a list picked is said in the path and nothing
  is mounted afresh for it. People's one page draws a person's page, the Pipeline and People's list
  everywhere else; Leads, which has not moved, is the one address under it the frame's table still draws.
- **Shared parts moved once.** The kit took what more than one surface draws (`kit/record`: the record sheet, its folds and fields, fourteen modules; Confirm, FieldError, and the Calendar's
  agenda); People's parts the pages that have not moved still read are published by `seed-globals` from one object
  (`people/people-globals.ts`), deleted name by name as the last reader moves. The seam gained `people` and `calendar`.
- **Nothing in a module graph may read an export at load.** The frame's modules (`workspace.ts`, `routes.ts`) and the
  surfaces' chromes reach one another, so a route's `takes` and `chrome` are read when an address is drawn, never when
  `routes.ts` loads, and the person's cache (`people-detail.ts`) is made on first use: read in the other import order, both
  were a temporal-dead-zone error at load that only a test importing the modules in that order could see.
- **Proof.** A throwaway recorder per piece drew the JSX and the TSX over the pieces' own worlds, every handler with every
  event it takes, scripted sequences and property-set matrices, and planted 18 to 35 faults in each: the record kit 310,366
  steps and the house parts 42,354; the Calendar 15,682; People's list 47 worlds, 6,081 handlers, 80 sequences, and 495
  property sets (2,151 handlers); the Pipeline 89,658 steps over its scope, its parts and the deal card; the person's page
  and the two sheets 19,990. No difference in any, and every planted fault caught. A saved list's route taking the wrong
  slice of its param (`list:` cut at 6, the row's at 5) was found by the Calendar's tests, not by the list's matrix: a
  matrix needs a world with a list kept by hand.
- **Two tests may not share what they fake.** Two stub worlds on one window clobber each other's `CHANLY.nav` (the later
  install wins), and a fetch double that is not put back answers the tests after it (`t.after`); both were found only when
  the pieces were folded into one file.

## Built: Leads (3 October 2026, branch `perf/load-path`, uncommitted)

Step 9 of the order. People's Leads scope is TSX in `apps/dashboard/src/surfaces/leads/` (`page/`, `scope/`, `cells/`,
`bench/`, `map/`, `finder/`, `reach-out/`, beside the peek that moved first), drawn by People's own page for every
`clients/leads…` address (`people/people-route.tsx`; `peopleTakes` takes them, `peopleChrome` names one mount,
`clients/leads`, and the crumbs). Its row and `drawLeads` left `app-routes.jsx`. Seven JSX files (3,344 lines) are deleted:
`leads-real`, `leads-scope`, `leads-cells`, `leads-bench`, `leads-map`, `leads-finder` and `reach-out/reach-out-leads`.

- **The bridge modules only Leads used moved with it** (the amendment): `legacy-bridge/leads.ts` is `leads/surface.ts`
  and the three `lead-map*.ts` are `leads/map/`, by `git mv`. The courier is gone: the surface publishes no `__lead…` name,
  the page imports its acts, and the map's streets are a module's (`leadMapApi()`), not `__LEAD_MAP`. The seam holds the
  value under `leads`; `__LEADS` stays as its mirror only for Ask (`ask/context.ts`, `ask/palette.ts`), a line to delete
  at step 12.
- **What only Leads read left the window.** seed-globals no longer publishes `__LEAD_WORDS`, `__LEAD_VM` or `__leadWays`,
  the peek's names, Campaigns' `bcWhenWords`, `ReachOutDoor` and `ReachOutSheet` (Today imports the when-words now), or
  People's table, hooks and rail kit: `people-globals.ts` keeps the nine names the shell itself draws (the strip's scopes,
  the deal and step sheets, the demo Lists page's two). `installReachOuts` is gone with its one reader. The one Leads part
  still published is `LeadPlanCard`, which Ask's palette calls by name (`leads/globals.ts`), until Ask moves.
- **A page that follows its own address replaces through the address.** The shell's `CHANLY.nav` takes a route alone, so a
  `navigate(to, { replace: true })` pushed: the peek walking its leads would have made an entry per lead. Leads, like the
  Pipeline, moves through the route's own door (`people-route.tsx` `ownGo`: `addressReplace` for a replace).
- **A list of your own is said by its search's `via`.** The JSX read `plan.list`, which the SQL writes (00242, 00272) and
  the plan's type does not name; the TSX asks contracts' `isLeadList` (`via` import or chosen), the same searches.
- **Proof.** A throwaway recorder drew the JSX at HEAD and the TSX over one world (the real surface loaded over a fake wire,
  the JSX reading the courier names mapped to the same functions) and compared the host trees by value: 37 states, desk and
  phone, Classic and Glass (all leads, a search, a waiting search and its answer row, Needs review as the bench and as a
  phone's sections, a list, the first day and its line, a failed read, a lead open with its why and its photo, a
  selection with its bar, its sheet and its whys, all that match, the map, Values, the Columns menu, rename, remove, Search
  again, the Lists sheet, the import sheet), no difference; then deleted, with the JSX. The page's tests moved onto the TSX
  and the wire: leads-honest, leads-peek, leads-finder, leads-bridge, leads-cold-boot, the map's, list-pages and back-pages.

## Built: the first run and Setup (3 October 2026, branch `perf/load-path`, uncommitted)

Step 10 of the order. The first run is TSX in `apps/dashboard/src/surfaces/setup/first-run/` on an App Router page of its
own, `app/(os)/w/[workspace]/start/[[...param]]/page.tsx`: every `start/<step>` address is that one page, which reads its
step from the path (`first-run/route.tsx`). Setup's rows, the line chooser, the forwarding card and the try card are
`surfaces/setup/rows/`. The frame draws the route's page full screen in place of its chrome, beside Ask's palette
(`app-shell.jsx` `firstRunScreen` draws `routePage`), and the `start` row left `app-routes.jsx` for `SURFACE_ROUTES.start`.
The route word stays `start`, which is the product's word too. Two JSX files (1,758 lines) are deleted: `first-run.jsx` and
`setup.jsx`.

- **The bridge module moved with it** (the amendment): `legacy-bridge/setup.ts` is `surfaces/setup/surface.ts`, by
  `git mv`. Setup's value is the seam's (`useSurface("setup")`, null when its read failed); `__SETUP` stays as its mirror
  and `__setup` as its verbs only for the Settings panes that still read them (`settings.jsx`, `integrations-real.jsx`,
  `business-can.jsx`), lines to delete at step 11. It no longer publishes `__firstRun` (the page imports contracts'
  `FIRST_RUN_HELPERS`) or `__forwarding` (the card imports `FORWARDING_WORDS`).
- **What it still borrows goes through one door module** (`surfaces/setup/shell.ts`): the Business tab's rows, its saver
  and its doors, which Check and Live draw as that tab does so the two screens never disagree, and the billing and Google
  verbs. Each line goes when its owner moves: the Business tab with Settings (step 11).
- **Today imports the rows.** Today's card (`today/pages/setup-card.tsx`) draws `SetupRows` and `SetupCardRow` by import
  and reads Setup through the seam; Today's door module lost its five Setup lines.
- **A step's move replaces through the address, and tells the frame** (`first-run/route.tsx`: `addressReplace`), as the
  shell's own replace did, so Back still leaves the first run: the shell's `CHANLY.nav` takes a route alone.
- **Proof.** A throwaway recorder drew the JSX at HEAD and the TSX over one world (Setup, the settings read and Live through
  the seam and their window names alike; the Business tab's rows as markers that draw the props they were handed) and
  compared the host trees by value: 57 states, among them reading and failed, Check's press, a viewer's Check, Check
  waiting, failed and drawn with its chips, Find with its matches, more, a pick, nothing found, a failure and the owner's
  words, every stage of the phone step (choosing, a new number, a wrong area code, a number left, a trial, buying, back
  from Stripe and cancelled, the two questions, the code with its help and asked again, an office system, a viewer's
  questions), Try it listening, nudged, quiet, on the call and over with its transfer, Live for an owner and a viewer, and
  Setup's rows as the first run and Today's card draw them, with the line chooser's three ways, the forwarding card's form,
  its code while testing, an office's and a verified line, rows put off, a viewer's rows and the try card. No difference,
  before the JSX left and again on the final code; a one-class change made it fail. Then it was deleted, with the JSX. The
  page's tests moved onto the TSX and the seam (first-run-page, first-run-check, setup-page-activate, setup-later,
  today-doors) and the source pins onto the files that hold them now (setup, billing, forwarding). On the real app
  (`next start` over this tree, the test workspace, every write stopped before it left), `/start` draws the first run full
  screen on a desk and on a phone, a step opened from the rail replaces the address so Back leaves, `#/start` and
  `#/admin/setup` land on it, Finish later goes to Today, and Today's card opens it again.

## Built: Settings › Billing, the first pane (3 October 2026, branch `perf/load-path`, uncommitted)

Step 11 of the order moves Settings one pane at a time, and the panes go before the page that draws them. Settings' page
(`settings.jsx` `SettingsPage`: the rail, the strip on a phone, the question before leaving unsaved work) stays in the
shell until its last pane, and draws a pane that has moved by the name its JSX published, which `seed-globals.ts`
publishes now (`surfaces/settings/globals.ts`), as a shared part does ("What is shared moves once"): the site moves from
the JSX to the bridge, and the publishers count does not rise. The frame does not go first for two reasons: the panes
private to `settings.jsx` would each need a name published for it, a rise per pane, and the e2e harness
(`tooling/scripts/e2e-harness`, the local runner the Business tab's spec and its mutation runs use) draws Settings in the
standalone mockup, which an App Router page leaves, as People did. The page, its route word (`settings`) and the
harness's answer for the Business tab come with the last pane.

- **Billing is TSX** (`surfaces/settings/billing/pane.tsx`), published as `PaneBillingReal`; `billing-real.jsx` (201
  lines) is deleted, and so is the mockup's twin inside `settings.jsx` (`PaneBilling`, 126 lines: a seeded plan of agent
  credits and top-ups the standalone mockup drew where no settings read existed; the sidebar and the demo's Agent Store,
  which read its seed after a visit, keep their own defaults). The standalone mockup has no Billing pane now.
- **The bridge module moved with it**: `legacy-bridge/billing.ts` is `surfaces/settings/billing/surface.ts`, by `git mv`.
  Billing's value is the seam's (`useSurface("billing")`, null when its read failed); `__BILLING_ACCOUNT` stays as its
  mirror and `__billing` as its verbs only for the frame's top bar (`topbar.jsx`, a paused workspace), lines to delete at
  step 13. Setup's rows and the first run import the verbs (`billingVerbs`), and `setup/shell.ts` lost its billing door.
- **The phone app's flag is the document's class.** The pane asked `window.__IN_APP`; it asks contracts' `IN_APP_CLASS`
  on the document element, which the same boot script stamps before paint, as the app's bridge does (`app-bridge.ts`).
- **Proof.** A throwaway recorder drew `billing-real.jsx` at HEAD and the TSX over one world (the seam's value and its
  mirror, the module's verbs, which the window's `__billing` is) and compared the host trees by value: 25 states (reading,
  failed, no subscription, not ready to charge, test mode, a trial and its start-now question, active with a card, the
  invoices shown, none and refused, past due, paused, unpaid, canceled, incomplete, a direct arrangement, no account row,
  no price, an operator, a viewer, inside the phone app, back from Stripe and dismissed). No difference, on the final
  code too; a one-word change made it fail. Then it was deleted. The pane's tests moved onto the TSX and the seam
  (settings-doors) and the source pins onto the files that hold them (billing, truth-pass).

## Built: Settings › Connections, the second pane (3 October 2026, branch `perf/load-path`, uncommitted)

The second pane of step 11, drawn by `settings.jsx` by its old name as Billing is. Three JSX files (808 lines) are TSX in
`surfaces/settings/connections/`: the pane (`pane.tsx`, published as `PaneIntegrationsReal`) and its row, Google's
location chooser and the email form; the business on record (`record-form.tsx`); the domains cold email is sent from
(`domains-block.tsx`). The two forms are imported by the pane, so `BusinessRecordForm` and `SendingDomains` leave the
window.

- **The bridge modules only Connections used moved with it**, by `git mv`, each a module object the pane imports and
  nothing on the window: `business-record.ts` (`record.ts`), `sending-domains.ts` (`domains.ts`), `mailbox.ts`,
  `whatsapp-connect.ts` (`whatsapp.ts`, `waConnect`, without its four casts and its one lint warning); `connections.ts`, which
  published two contracts names, is deleted. `LegacyApp.tsx` installs none of them.
- **Google's verbs are a module object** (`legacy-bridge/google.ts` `googleVerbs`), which the pane, the first run's Find
  and Reports import. Its last window readers moved with this pane, so `__google` and the `__GOOGLE` mirror are gone:
  Today's review line reads the seam's `google` and contracts' `toGoogleVM`, and `setup/shell.ts` lost its Google door.
  `google.ts` stays in the bridge, shared by four surfaces.
- **The twin and its store retired, as the order said**: `PaneIntegrations` (the mockup's seven invented services) and
  `INT_STORE` with its `integrations:changed` event, from `settings.jsx`, with the demo's two readers (the top bar's
  Gmail nag overlay, the demo Tasks page's released nurture). The mockup's Gmail nag now stays as it is seeded.
- **What fell with it.** The WhatsApp module's rejection was the tree's last `prefer-promise-reject-errors` finding, so
  that rule left `HELD_TYPED` (`eslint.config.mjs`) and is an error from now on; `settings.jsx` no longer reads
  `__CHANNELS`, so the e2e harness's excuse for not publishing it is gone (`e2e-harness.test.mjs` `NOT_PUBLISHED`).
- **Proof.** A throwaway recorder drew the three JSX files at HEAD and the TSX over one world (the seam's settings, Setup and
  Google values beside the window names the JSX read, the modules' objects as the names' values) and compared the host
  trees by value: 32 states (the settings read failed or not yet in, a new workspace, channels on and off, WhatsApp to
  connect, a listing and its menu and Remove, a profile, a location to choose with and without places, back from Google
  and refused, the email form and a wrong address, a name to change, domains with their records, held, the add form and
  its refusals, Remove, the business record and its question, a path chosen, Not right?, rejected, still reading and
  failed, an operator and a viewer). No difference, on the final code too; a one-class change in either form or the pane
  made it fail. Then it was deleted. The pane's tests moved onto the TSX and the seam (settings-doors,
  refusals-on-the-page, registration-path, first-run-page) and the source pins onto the files that hold them
  (connections, google, google-profile, a2p, reports-seam, starter-templates, whatsapp-connect).

## Built: Settings › Notifications, the third pane (3 October 2026, branch `perf/load-path`, uncommitted)

The real branch of `settings.jsx`'s Notifications (who is alerted, what they are alerted about, and how) is TSX in
`surfaces/settings/notifications/pane.tsx`, published as `PaneNotificationsReal`, the name it had inside the file, and
drawn by `settings.jsx` by that name as Billing and Connections are. It reads the settings read over the seam
(`useSurface("settings")`, in place of `__SETTINGS` and its `surface:settings` listener), saves through the bridge's
`saveSettings` by import (in place of `__saveSettings`), and lists contracts' `NOTIFICATION_KIND_GROUPS` (in place of
`__today.notificationKinds`); its gate, its sentence and its tip are `legacy-verbs`' `canDo`, `gate`, `gateTitle` and
`showTip`.

- **The twin retired, as the order said.** `PaneNotifications`, the mockup's six switches kept in the browser
  (`chanlytics-notif-prefs`) that nothing read, and its loader went, with `SetSectionHead`, whose last reader this pane
  was, and `SetToggle`, whose last drawer the twin was (its window copy was for the demo Calendar, which left the shell
  at step 2; `settings-words.test.mjs` names a row's control through the dials now). The standalone mockup has no
  Notifications pane now. In the app the twin drew only where the settings read had never landed, which a real workspace
  never shows: its route waits for that read. The switch's rules in `settings.css` (`.set-switch`, `.set-knob`) have
  no drawer left; they are `kit-primitives.json`'s to empty with the rest of Settings' in Phase 4.
- **What fell with it.** `settings.jsx` is 214 lines shorter (1,510) and publishes one name fewer (`SetToggle`); it no
  longer reads `__today` or `__saveSettings` (window globals −2; the e2e harness's excuse for `__today` went, `e2e-harness.test.mjs` `NOT_PUBLISHED`), and its
  `exhaustive-deps` warning on the pane's listener went (lint 367 → 366). The pane's `style={{ flex: 1 }}` moved with its
  row (inline styles: +1 in `pane.tsx`, −1 in `settings.jsx`, under Rises in `docs/debt.md`).
- **Proof.** A throwaway recorder drew HEAD's JSX branch and the TSX over one world (the settings read on the seam beside
  `__SETTINGS`, the JSX's `__saveSettings` the same `saveSettings`, over a fetch that hangs, accepts or refuses) and
  compared the host trees, every toast each raised, what each sent and the tips each showed: 20 states (two addresses,
  one, none in three shapes, the workspace's own sending address, a broken config, an operator and a viewer, an address
  typed, a wrong one, one already there, the eleventh, a save in flight, accepted by Enter, refused, a Remove accepted and
  undone, a Remove in flight, an operator pressing the gated Add, a kind's tip). No difference, on the final code too; a
  class or a toast's words changed in the TSX made it fail. Then it was deleted. `settings-owner-panes.test.mjs` draws
  the TSX through Settings' page as the app publishes it, and now draws what `settings-truth.test.mjs` read from the
  page's text: the card's "except the two marked for Chanlytics", and every write closed on a broken config (F32).

## Built: Settings › Autonomy, the fourth pane (3 October 2026, branch `perf/load-path`, uncommitted)

The real branch of `settings.jsx`'s Autonomy (the policy matrix, the reply row's three dials, the hard limits and their
two dials) is TSX in `surfaces/settings/autonomy/`, published as `PaneAutonomyReal` and drawn by `settings.jsx` by that
name: `pane.tsx` (the pane and its dials' steps), `matrix.tsx` (a mode's words, the desk's table, the phone's one line
per class, Settings' breakpoint), `controls.tsx` (Settings' row, the segmented control and the dial) and `verbs.ts`.

- **Its reads and its door.** The rows are the bridge's `uiRows` (policy-store.ts) over the settings read's policies,
  which the seam's settings value now carries beside the globals it copies (`policies`, null where that read failed);
  the JSX read `window.POLICY`, the store over `__POLICIES`. A mode's words are contracts' through `UI_MODE_WORDS`, the
  hard limits contracts' `hardLimitsWords` by import (`__hardLimits` is no longer published: this was its last reader),
  and the one door is `autonomyVerbs.setPolicy`, the bridge's `setPolicy`, an object a test stands a door in on.
  `window.POLICY` and `__setPolicy` stay for their other readers (the policy chip beside every approval, Fleet).
- **The row names its control by handing it the id.** `SetRow` cloned its child to add `aria-labelledby`; the TSX row
  draws its control from a `control` function given the label's id, so the same attribute lands on the same element
  with nothing cloned.
- **The twin retired, as the order said.** `PaneAutonomy` (the mockup's own matrix, its four defaults and the
  per-segment guardrails kept in `ST_STORE` and `SEG_GUARDRAILS`) with `PolicyMatrix` and `VetoModeRow`, and every
  helper only the two panes used (`SetRow`, `SetSeg`, `SetDial`, `polMode`, `PolModeHead`, `PolLockedCells`,
  `PolPhoneRows`, `useSetPhone`, the dials' steps). The standalone mockup has no Autonomy pane now; the guardrail chips on
  its other pages keep their seeded values.
- **What fell with it.** `settings.jsx` is 539 lines shorter (971, still over the 800 a file may hold until Profile, Team and the frame leave), and
  its one function over the limits (`PaneAutonomyReal`, 183 lines) went; it reads `__POLICIES` and `__setPolicy` no
  more (window globals −2, `__hardLimits` gone, the e2e harness's excuse for `__setPolicy` with it), `seed-globals.ts`
  publishes one name fewer, an inline style and an `exhaustive-deps` warning went (lint 366 → 365). Nothing rose.
- **Proof.** A throwaway recorder drew HEAD's JSX branch over the policy store and the TSX over the seam, both given the
  same rows and the same door, and compared the host trees, every toast, every save asked for and every tip: 26 states
  (the reply row alone, every class with deals on and off, no rows stored, every dial off its steps, the read failed,
  an operator and a viewer, a phone in four of them with its mode menu and a dial's steps opened, a mode and a step
  picked there, a mode pressed while saving, accepted and refused, each of the five dials accepted, a dial refused, a
  row's tip). No difference, on the final code too; a class or a toast's words changed in any of the three files made
  it fail. Then it was deleted. `settings-owner-panes.test.mjs` and `settings-words.test.mjs` draw the TSX through
  Settings' page; what `settings-truth.test.mjs` and `brain-v2.test.mjs` read from the page's text (the autonomy gate on
  every dot and dial, a dial edit sending itself alone and never the row's mode) is drawn and pressed there now, and
  `layout-measure.test.mjs`' pins on the old row's source point at `settings-words.test.mjs`, which reads the name off
  each control's element.
- **A test step 10 left behind.** The reach-out sheet's two page tests (`reach-out-sheet-page`, `reach-out-rows`) still
  handed Setup's read in as `window.__SETUP`, which the sheet stopped reading at step 10 (`setupDto()` is the seam's
  setup value): they set the seam's value now, and pass.

## Built: Settings › Profile and Team, the fifth pane (3 October 2026, branch `perf/load-path`, uncommitted)

Profile and Team move together, because they shared the role words. `surfaces/settings/profile/pane.tsx` (your name,
the address you signed in with, your role, sign out, delete your account) and `surfaces/settings/team/team.tsx` (the
roster, its open invitations, View-as, invite, change a role, remove) are published as `PaneProfile` and `TeamSection`,
the names `settings.jsx` published, so the page and the Partner pane's Team (`partner-real.jsx`, which draws
`window.TeamSection` under its partner card) draw them unchanged. `surfaces/settings/shared.ts` holds what more than one
pane says or checks: each role's name and what it may do, and the shape of an address (Notifications reads it too).

- **Their reads and their doors.** The seam's settings value carries the team read beside the globals it copies (`team`,
  `invites`, typed from the route's own answer), which Team reads; Profile reads who is looking (`meNow()`). Contracts'
  `memberWords`, `personInitials`, `identityWords`, `inviteState` and `stateOf` are imported. The doors are module
  objects a test stands a door in on: `meVerbs` (`identity.ts`: your name, your account; `__me` is no longer
  published) and `teamVerbs` (`inbox-verbs.ts`: invite, change a role, remove; `__teamInvite`, `__teamSetRole`,
  `__teamRemove` and `__inviteState` are no longer published). View-as and sign-out go through `legacy-verbs`
  (`viewAsRole`, `setViewAs`, `onRolesChanged`, `shellSignOut`), the role store and the frame staying the shell's.
- **The twin retired, as the order said.** `TeamSection` drew the mockup's seeded roster wherever no team read existed:
  four invented colleagues with seats, an invite that sent nothing, a Resend, and undos on the seed. The TSX draws the
  real roster and a failed read, and nothing else; the standalone mockup has no Profile or Team pane now.
- **What fell with it.** `settings.jsx` is 500 lines (971 → 500, under the file limit: its entry in
  `file-length.json` went), and its last function over the limits but the page itself (`TeamSection`, 289 lines) went;
  it publishes two names fewer and reads eight window names fewer, `inbox-verbs.ts` four publishes fewer, `identity.ts`
  two casts fewer, and an `exhaustive-deps` warning went (lint 365 → 364). Under Rises in `docs/debt.md`: the face's
  hue and the invitation box's `autoFocus` moved with their rows, and `identity.ts`' write of the name to who is
  looking is seen as a publish now that its casts are gone.
- **Proof.** A throwaway recorder drew HEAD's `PaneProfile` and `TeamSection` and the TSX over one world (the roster
  and invitations on the seam beside the window's names, the same doors as the window's verbs and the module objects)
  and compared the host trees, every toast, every door asked and where View-as was left: 52 states (an owner, an
  operator, a viewer; a failed team read for two roles; one member, a partner on the roster, a preview; View-as pressed;
  Invite opened, cancelled, a role picked, a wrong address, one already there, sent by Enter, each of the server's four
  answers, refused, in flight; a member's and an invitation's menu, a role changed, refused, the same one; Remove asked,
  kept, done, an invitation revoked, refused, in flight; your name with and without one, nobody read, an operator and a
  partner; Change opened, saved by Enter and by Save, cleared, refused, unchanged, in flight; Change password; Sign out
  with and without the frame and in the demo; Delete asked, kept, refused, in flight, in the demo). No difference, on
  the final code too; a class or a toast's words changed in either file, or a role's words, made it fail. Then it was
  deleted. The tests that drew either pane off the window draw the TSX (`confirm`, `empty-failed`, `settings-doors`,
  `settings-honest`, `settings-owner-panes`); `settings-truth`'s pins on the old source are drawn now (an invitation's
  menu offers no role; your name is a row on Profile, never in the Team card), `team-audit-and-invites`' pins on the
  seeded branches read the TSX (the card writes only through its doors, never the role store's roster, and offers no
  undo), `surface-registry.test.mjs`' five pins on the old card are drawn (a team read that failed keeps the server's
  role and invents nobody; You is the signed-in address), `identity.test.mjs` reads the roster's words from the TSX,
  and the e2e harness's excuses for eight names `settings.jsx` no longer reads went. The role words are a lookup
  (`roleWords`) that says a role it does not know as stored, so the card reads no index the compiler lets pass.

## Built: Settings › Partner, the sixth pane (4 October 2026, branch `shell-exit/settings-partner`)

`legacy/pages/partner-real.jsx` (581 lines) is TSX in `surfaces/settings/partner/`: `pane.tsx` (the offer, the
account), `account.tsx` (the daily letter, two-step sign-in), `workspaces.tsx` (what the link brought, a workspace set
up for a business and its handover), `invitations.tsx` (who asks the partner in) and `team-card.tsx` (Team: the roster,
then the workspace's partner card). Settings' page draws it by the name it published, `PanePartner`, and Team as
`PanePartner.Team`, which seed-globals publishes (`settings/globals.ts`); `TeamSection` is no longer published, since
the TSX Team imports it.

- **Its read and its doors.** `legacy-bridge/partner.ts` moved beside the pane as `surface.ts`: the account is the
  seam's value (`useSurface("partner")`: undefined until read, null when the read failed), written by the read and by
  the two verbs that answer with the row (become, the letter), which say so on `surface:partner` as before. The verbs
  are a module object a test stands a door in on, `partnerVerbs`; `__partner` and `__PARTNER` are no longer published.
  View-as, the role gate and `team:changed` go through `legacy-verbs` (`viewAsRole`, `gate`, `onRolesChanged`).
- **What fell with it.** Two window names and two publishing sites, a file of the legacy tree (`legacy/pages` 25 → 24
  modules) and of the bridge (35 → 34), three casts. Nothing rose: the copied button's 1.5 seconds is named
  (`COPIED_MS`). The standalone mockup loads no Partner pane, as it loads none of the moved panes.
- **Proof.** A throwaway recorder drew HEAD's `PanePartner` and `PanePartner.Team` and the TSX over one world (the
  account on the seam and the window, the same verbs object as `window.__partner`) and compared the host trees, every
  toast and every door asked: 52 states (reading, failed and retried; the offer with the factor reading, off, on,
  unreadable, set up, a code refused and taken, cancelled, unavailable, not started; the offer filled before the factor,
  refused, taken; an account active and paused, with and without earnings, the server's count; the workspaces reading,
  unreadable, with rows, one opened; set up full, opened, a one-letter name, refused, made without its invitation,
  cancelled; a handover's resend opened, sent, not sent, refused; the letter turned off, refused; the link copied and
  not; invitations joined, declined, refused, unreadable; Team asked, not sent, refused, waiting and taken back, refused,
  a partner on it, forbidden, unreadable, previewed as an operator, an operator's and a viewer's gate). No difference;
  15 of 17 one-change mutations of the TSX made it fail, and the two that did not are equivalent (the factor's code
  cleared once it is on, which no state shows again; the gate's words for the shell's own toast). Then it was deleted.
  `partner-pane.test.mjs` draws the TSX over the seam and `partnerVerbs`; the two Settings tests that open Team publish
  `PanePartner` as the app does.

## Built: Settings › AI memory, its twin retired (4 October 2026, same branch)

AI memory has no pane to move: a workspace has always drawn `PaneSoon`, which says the receptionist does not learn rules
on its own yet and points at Business, and that stays with the frame. What went is the mockup's twin, drawn wherever no
settings read existed: five invented memories with sources, uses and attributed revenue, a Teach button that asked Ask
for something no verb stores, and a Forget with an undo that kept nothing. `settings.jsx` is 444 lines (500 → 444), a
function left the complexity list, and the twin's rules left `settings.css` and `components.css` (`set-mem-*`, drawn by
nothing else). `truth-pass.test.mjs` pins the one branch the pane has now.

## Built: Settings › Activity, the seventh pane (4 October 2026, same branch)

`legacy/pages/activity.jsx` (245 lines) is `surfaces/settings/activity/pane.tsx`, published as `PaneActivity`, the name
it had: the pane, its filters (`ActivityFilters`, with the person search as a hook, its 250 ms named
`PERSON_SEARCH_MS`) and the log (`ActivityLog`), each under the function limits the settings tree holds as errors. Its
reads stay the bridge's `activity` object (`legacy-bridge/activity.ts`), which the pane imports; `window.__activity`
stays published only for the rail's warm read in `settings.jsx`, a line that goes with the frame. The clock is
`pageClock()`, the gate `canDo`, a row's Open `navigate`. The branch for a page with no bridge (the standalone mockup)
went: the app always has it, and the mockup no longer loads the pane, as it loads none of the moved ones.

- **What fell.** A file of the legacy tree (`legacy/pages` 24 → 23), a publishing site, a function over the limits,
  and two window names' reads (`__activity`, `__clock`). Under Rises: the two inline styles moved with the pane.
- **Proof.** A throwaway recorder drew HEAD's `PaneActivity` and the TSX over the same `activity` object and compared
  the host trees and every read and Open asked: 25 states (an operator and a viewer told it is the owner's; reading
  with nothing and with last time's rows; the log across days with every actor and subject, a row's and every row's
  Open; unreadable with and without words, retried; nothing there, nothing for a kind and for a person, cleared; more,
  shown and while reading; the filters asked for and put away; a kind half typed, left, whole, entered; a day; a person
  before the search, found, picked, dropped, matched by nobody, emptied). No difference, after the split too; 15 of 16
  one-change mutations failed it (the survivor swaps the export gate for the team gate, which no role tells apart).
  `settings-owner-panes.test.mjs` stands its feed in on the `activity` object; its test of the missing bridge went with
  the branch.

## Built: Settings › Back office, the eighth pane (4 October 2026, same branch)

`legacy/pages/platform.jsx` (798 lines) is TSX in `surfaces/settings/platform/`: `pane.tsx` (the pane, the partners card
and the every-workspace card), `detail.tsx` (a workspace opened: its Setup, its lines and what may be done to each, what
has happened), `partners.tsx` (a payout, a partner's status and second factor, a workspace's standing) and `cards.tsx`
(the waiting list, the platform's health, how fast the pages are, each workspace's day). Settings' page draws it by the
name it had, `PanePlatform`; the four rows the JSX published only for its test (`PlatformLine`,
`PlatformWaitingRow`, `PlatformPartnerRow`, `PlatformPartnerStandingRow`) are imports now.

- **Its reads and its verbs.** `legacy-bridge/platform.ts` keeps them, read on demand as before: the verbs are one
  object, which the pane reads through `backOffice.verbs` so a test stands a whole other set in, as it once replaced
  `window.__platform`; `installPlatform` still publishes it for the rail's warm read, a line that goes with the frame.
  The members a stand-in may lack (the peeks, the warms, the second factor's words) are optional in its type, and the
  pane asks for them as the JSX did. A Setup row's tone is contracts' `stateOf`, the tip `showTip`, the toast
  `useLegacyToast`.
- **What fell.** A file of the legacy tree (`legacy/pages` 23 → 22), a function over the limits (`PanePlatform`, 204
  lines), two non-null assertions, five publishing sites and three window names' reads (`__platform`, `__chrome`,
  `__tip`). Under Rises: the Setup meter's width moved with it, and the three rows the test drives on their own are
  exports knip counts as dead.
- **Proof.** A throwaway recorder, built on `back-office.test.mjs`' own harness and fixtures, drew HEAD's `PanePlatform`
  and the TSX over the same verbs through the same steps and compared the host trees after each step, every toast and
  every verb asked: 54 scenarios (reading, refused and read again, thrown, empty, found and not, read again, painted
  from what was held; health, timings with and without rows, each workspace's day; the queue marked, put off, refused,
  thrown, empty, one waiting; a workspace opened and closed, by its row, with nothing recorded, unreadable and retried,
  thrown, still reading, held from the hover with its read still out, waiting on its owner; a line failed with every
  state and its mark, with none, refiled, put off, refused, released, acted on and read again; the partners card, none,
  a payout recorded, put off, refused, thrown, its reference too long, the list read again after a refusal; a partner
  paused, restored and refused, put off; a second factor reset, put off, thrown; a standing qualified, disqualified and
  refused, put back under review, put off, thrown, its reason too long). No difference; 28 of 29 one-change mutations
  failed it (the survivor clears the detail before a re-read that clears it anyway). The recorder's first version could
  not see an armed row: the harness counts hooks across every walk, so each snapshot now starts from a fresh draw.
  `back-office.test.mjs` draws the TSX (65 tests); its pins on the page's source read the four files.

## Built: Settings › Business, the tab (4 October 2026, same branch)

The twelve files of the Business tab (`legacy/pages/business-tab*.jsx` and `business-can.jsx`, 5,451 lines that spoke to
each other through the window) are ES modules in `surfaces/settings/business/`: the saver and the rows' tables
(`save.tsx`), each fold's helpers (`folds.ts`, `fold-shapes.ts`, `fold-says.ts`) and the one object the two make
(`saver.ts`, published as `__businessTabSave`); the row, fold and sheet gestures (`gestures/`: `common`, `row`, `editor`,
`fold`); each card (`who`, `open` with `open-week` and `open-calendar`, `offer`, `answers` with `answers-fields`, `can`,
`services`, `prompt`, `create`); and the page (`tab.tsx`). The parts import each other; the bridge's helpers are
imported (`BUSINESS_TAB`); and what the tab still reads of the shell (the settings read, the workspace, the calendar, the
bridge's defaults and number helpers) reaches it through one module, `business/shell.ts`, each read when it is called,
so a stand-in on the window is the one read. The app publishes fifteen names from `business/globals.ts`, the ones a page
of the shell or the first run still reads (settings.jsx draws `BusinessTab` and `BtCreateCard`; the first run draws
eleven of the tab's rows and takes its saver through setup/shell.ts); the rest are no longer published.

- **How it moved.** Five agents converted the files from one written spec (every window name and its replacement, the
  module map, the function limits), each against the JSX; the joins, the publishing, the wiring and the proof are this
  step's own. The eight JSX functions over the limits were split into functions, hooks and hookless parts in the same
  module; where a split added a component that takes children, a walk of the element tree met its parts in another
  order (the sheet slot was no longer the page's last child; the can card's section came after what it holds), which the
  page tests caught, and those two are calls again. Two branches went: the folds' answers for a page with no bridge (the
  folds import it), with the two test halves that drove them.
- **What fell.** Twelve files of the legacy tree (`legacy/pages` 22 → 10), the eight functions over the limits, the JSX's
  casts, fifteen published names and the reads behind them (`__businessTab` and `__businessTabSave` twelve reads each
  to one), three lint warnings (362 → 359), and a cast in `legacy-bridge/business-tab.ts` the declared window made
  unnecessary. Every new file is under 800 lines and the folder holds 20. Under Rises: six lint warnings moved with
  their effects as written, and `BtSheetSlot` exported for the tests that hold it last.
- **Proof.** A throwaway twin of the tab's own test harness loaded the JSX at HEAD and the TSX side by side and drew the
  page over seven records (Marisa's, an empty one, a sparse one resolved from facts, a business that books, one that
  proposes, no Setup read, a viewer), then every row and fold the JSX offers on each, opened, typed into, saved, emptied
  and saved, and cancelled; the host trees after each step, every toast and every save sent compared. No difference.
  Of the one-change mutations, every one that touched what a state draws or sends made it fail; an Undo pressed after
  its editor closed is reached by no recorded state and by no test, at HEAD or now. Every Business test draws the TSX
  through the harness (`_business-tab-harness.mjs`, over `receptionist/business-tab/_business-parts.mjs`, which puts
  each part on the test's window by its JSX name), its pins on the source read the TSX, and 355 test files across the
  app's domains pass but for the two the voice lane left red on main. Read-only on the real app, desk and phone, the
  cards stand in their order, every row offers its act, a link that is not one is refused under its box before any
  save, the hours fold opens its week, and nothing is written.

## Built: Settings' frame, the end of step 11 (4 October 2026, same branch)

`legacy/pages/settings.jsx` is gone. Its frame is TSX in `surfaces/settings/frame/` -- `tabs.ts` (the rail's sections and
the rule that names the pane a route opens, which the page and its crumb both ask), `page.tsx` (the rail, the phone's
strip, the leave guard, and the pane the route names, every pane imported), `workspace.tsx` (the Business pane: the tab,
the card that sets a receptionist up, a configuration only Chanlytics can repair, and the owner's copy of everything)
and `route.tsx` -- on its own App Router page, `app/(os)/w/[workspace]/settings/[[...param]]/page.tsx`. The path says the
product's word, `settings`, for the shell's own route, `admin` (contracts `ROUTE_WORDS`): a bell row, an email or a
bookmark that says `admin/<pane>` is moved on load, as `clients` is to `people`. The frame's row in `SURFACE_ROUTES` takes
every pane's address (`params`), its crumbs from the same rule; the shell's `drawSettings` row is gone. A pane that moved
elsewhere (`admin/setup`, the first run) draws nothing while the frame takes the address there, as the row drew nothing.

- **The role store.** settings.jsx also made `window.ST_STORE`, the role store every gate in the app asks. It moved to
  `legacy-bridge/identity.ts` (`installRoleStore`, run by seed-globals.ts before any page loads, as the JSX ran as the
  manifest loaded), the same object under the same name; identity.ts completes it as before.
- **Nothing published for Settings.** With the page importing every pane, `settings/globals.ts` and its eleven
  publications went, and the Business tab publishes only what the first run still reads.
- **One cycle avoided.** The route table reads `tabs.ts` as the frame boots, so the rule holds no import: the warm reads
  of Activity and the back office are the page's (`WARM`), which the activity bridge's read cache would otherwise have
  been asked for before it had run.
- **The standalone mockup no longer draws Settings** (Ruben, 4 October 2026), and the e2e harness's Settings scenarios
  went with it. Ask is the one real surface left in the shell; CLAUDE.md's canonical example of one not yet moved names it.
- **Proof.** A throwaway recorder drew HEAD's `SettingsPage` and the TSX over the Business harness's record, the same TSX
  panes on both sides: every tab (and a route that names none) for an owner and for a viewer, the back office and the rail
  for a platform admin, Business broken, with no receptionist and with no settings read, a tab pressed, AI memory's door,
  and the leave guard over an unsaved fold, kept and then left. 32 states, no difference.
