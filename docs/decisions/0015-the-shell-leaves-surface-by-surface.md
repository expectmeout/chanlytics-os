# 0015 · The shell leaves, one surface at a time

**Status:** Accepted by Ruben, 28 Sep 2026; decided, not built. Ruben left the open questions to be settled by
analysis (27 September); the answers close the note, and he accepted it with one amendment, which follows them. The
address, the first step, waits until no open pull request holds a page that reads its own `#/`
address (the fourth answer). Written against commit `519724e9c` (main, 27 September 2026, after the organization
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
