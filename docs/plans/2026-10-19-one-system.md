# One system: the shell's last pieces leave

**Date:** 19 October 2026 · **Lane:** E of the loadability review (19 October 2026, approved by Ruben the same day) ·
**Written against:** `origin/main` at `bd5069f36` (#1740), measured there, and the loadability lane's tree
(`cm-loadability`, branch `perf/loadability`, uncommitted), which lands first · **Branch:** `perf/one-system-wave-1`,
wave 1's steps 1 to 3 built on it and not committed (section 9).

**What it closes.** The review rated onboarding 6 of 10 because a new engineer learns two systems. One is the App Router
surfaces: TSX, typed, linted, reaching what they use by import. The other is what is left of the classic shell: 15 JSX
files (6,505 lines) evaluated in a fixed order as classic scripts, outside the typecheck, Prettier and all but the hooks
rules of lint, talking through `window`, with a 91 KB conventions file of their own and a mockup that compiles them with
Babel in the browser; and the window seam the TSX surfaces still read through (74 `window.__*` names, 104 publisher
sites). This is decision 0015's step 12 (Ask) and step 13 (the frame, then the tree), refined from the code as it stands,
plus the TypeScript half of the window, which 0015 expected to fall as the pages left and which did not.

**What it does not do.** No redesign: each move draws what the JSX drew, proved equal by value (0015, Tests). No new
dependency. The registry's engine stays: TanStack Query behind `useSurface` is 0053 step 6, and lands after this on the
same seam. The stub React the node tests draw TSX on stays (section 8).

## 1. What is left

Measured on 19 October 2026 on `bd5069f36` with `next build`, `corepack pnpm check:bundle`, `next analyze -o` and
`next analyze export`; the lane's numbers come from its analyzer snapshot of 13:16 that day (`a10`) and its last
`check:bundle`. The analyzer gzips each module alone, which overstates a chunk: 958,963 B against the build's 827,192 on
main, 603,363 against 535,641 on the lane. A size marked ≈ is the analyzer's figure scaled by its build's ratio (0.86 on
main, 0.89 on the lane).

Route JS is 827,192 B gz on main (35 files) and 535,641 on the lane (31 files). Route CSS is 161,298 B gz on both, and
every legacy stylesheet loads on every page (`apps/dashboard/app/(os)/layout.tsx` imports `legacy-bridge/legacy.css`).

| Piece                     | What                                                                                                                                                                                                                                            | Lines                       | In the frame (lane)                                                                  | Window                                                                                                                  | Ratchet entries                                                                                                    | Tests that load it                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| The helpers               | `legacy/components/data-bits.jsx`                                                                                                                                                                                                               | 914                         | ≈6.7 KB, moves                                                                       | 11 sites, 24 names; three of them (`Sparkline`, `StatStrip`, `StatCell`) drawn by nothing; the stores `POLICY`, `PR_STORE` | file length 1, complexity 2, lint 2, inline style 1, hand route 1                                                  | 81, of which 71 load no other legacy file                       |
| Ask                       | `legacy/pages/ask-{text,hooks,turn,home,real}.jsx`, and `legacy-bridge/ask.ts`, which installs it                                                                                                                                               | 2,699                       | the pages a chunk already; the install ≈22.6 KB                                      | 7 sites, 1 more in the lane's `ask/line-globals.ts`; `__ask`, `__mascot`                                                | file length 1 (`ask-real.jsx`, 1,027), lint 20 (18 exhaustive-deps in `ask-real.jsx`), inline 1, hand route 1; the lane's Rises row for `line-globals.ts` | 6                                                              |
| The mascot                | `legacy/components/ask-face.jsx` and `legacy-bridge/mascot/` (13 modules)                                                                                                                                                                       | 51 + 2,964                  | ≈12.4 KB                                                                             | 2 sites; `__mascot`                                                                                                     | lint 1                                                                                                             | 7                                                              |
| The frame                 | `legacy/pages/app-{shell,routes}.jsx`, `legacy/components/{topbar,sidebar,surface-tabs,shortcuts}.jsx`, `legacy/data/constants.jsx`; `legacy-bridge/manifest.ts`, `legacy-bridge/seed-globals.ts` and the boot gate in `LegacyApp.tsx`          | 2,628                       | ≈26 KB, moves                                                                        | 11 sites, and `seed-globals.ts`'s 11; it publishes 58 names on main (43 on the lane)                                    | complexity 4, lint 14, inline style 10, hand routes 9, appointment words 1                                         | 29                                                             |
| The mockup                | `legacy/Chanlytics.html`, `legacy/data/bridge-stubs.jsx`, the document and six bundles `tooling/scripts/serve-legacy.mjs` builds for it, `legacy/CLAUDE.md`, `.design-canvas.state.json`, `.thumbnail`                                          | 213, and the page           | none                                                                                 | 12 sites                                                                                                                | complexity 1                                                                                                       | 5, among them `repo/legacy-harness.test.mjs` (673 lines)       |
| The window, TS on both sides | the overrides' `globals`, the bridge's installers, and the surfaces' adapters: `surfaces/legacy-verbs.ts` (572 lines, imported by 315 files), `inbox/shell.ts`, `today/shell.ts`, `kit/record/shell-verbs.ts`, `settings/business/shell.ts` and five smaller | about 1,300 in the adapters | none                                                                                 | the rest of the 74 names and 104 sites                                                                                  | window globals, window publishers; tree shape (`legacy-bridge`, 33 modules at its root)                            | 22 name `seed-globals.ts`                                      |
| The stylesheets           | `legacy/styles/*.css` (21)                                                                                                                                                                                                                      | 24,322                      | route CSS, every page                                                                | none                                                                                                                    | legacy files 21; their kit primitives, style values and breakpoints move with them                                 | none                                                           |
| Demo samples              | `surfaces/{calendar,reports,campaigns/broadcasts,live}/sample*.ts`                                                                                                                                                                              |                             | not in the frame: ≈2.5, 5.2, 1.5 and 0.7 KB in those pages' own chunks               | none                                                                                                                    | none                                                                                                               | their pages' own                                               |

Of the 74 `window.__*` names, 27 have a reader in the legacy JSX, 6 more only in the mockup's stubs, and 41 are read only
by TypeScript: the bridge and the surfaces' adapters. Only 9 are read by legacy JSX and by no surface. So the JSX leaving
is half of one system; the other half is TypeScript reading TypeScript through `window`. (Readers counted with quoted
names too, which the ratchet's syntax walk does not see: `today/shell.ts` reads `object("__ask")`.)

## 2. What each removes

| Piece                         | Frame bytes                                               | `__` names / sites  | Ratchet entries                                           | Test stubs                                                                   | Work      |
| ----------------------------- | --------------------------------------------------------- | ------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------- | --------- |
| Settings' Business by import  | none                                                      | 17 / about 20       | none                                                      | none new: its harness already hands it the real functions                   | half a day |
| The helpers                   | none                                                      | 2 / 11, and 24 bare names | 7, the 914-line file among them                     | 81 tests stop importing a classic script for its side effects               | 1 day     |
| The frame                     | none at once; its chrome can then join the prerender      | 9 / about 25, and about 45 bare names | 38                                       | 29 tests; `window` as `globalThis` for publishing                           | 4-5 days  |
| Ask                           | ≈8 KB (its install, less what boot reads: measured in §9) | 1 / 8               | 23, the 1,027-line file and 18 exhaustive-deps among them | 6                                                                            | 3-4 days  |
| The mascot                    | ≈6 KB (its rest frame keeps its drawing: §9)              | with Ask / 2        | 1                                                         | 7                                                                            | 1 day     |
| The mockup and the tree       | none                                                      | with the frame / 12 | 1, and 19 legacy files                                    | 5, and the 673-line harness test                                            | 1-2 days  |
| The rest of the window        | none                                                      | 45 / about 35       | both window rows retire; tree shape −1                    | the tests' stand-ins on `window` move to `fetch`, under the typed client    | 3-4 days  |
| The stylesheets               | per-surface CSS becomes possible (0053 step 7)            | none                | legacy files to 0, and the row with them                  | none                                                                         | 1 day     |
| Demo samples                  | ≈10 KB, in four pages' own chunks                          | none                | none                                                      | none                                                                         | half a day |

Across the whole lane the register's block moves: window globals 74 to 0, window publishers 104 to 0, files over 800
lines 2 to 0, functions over the limit 58 to 51, lint warnings 284 to 247 (exhaustive-deps 37 to 10), inline style props
69 to 57, directories over 20 modules 3 to 2, files in the legacy tree 40 to 0. A function over the limits is split as it
moves (a new path's offender is a red build), each split proven equal as #1161 proved its thirteen.

## 3. The order: three waves, one pull request each

Ruben's rule (29 September and 5 October 2026) is one pull request per batch worth a review, its steps proven locally as
commits. 0015's "one surface per pull request" predates it: each step below is one commit with its own proof, and a wave
is one push. Each wave leaves a smaller shell, not a broken one, so the lane can stop after any of them.

The lane starts from main once the loadability lane has merged: that lane rewrites `seed-globals.ts`, `LegacyApp.tsx`,
`ask-real.jsx` and Ask's install, and moves the Line's pages into a chunk (`legacy-bridge/ask/line.tsx`, `line-code.ts`,
`line-globals.ts`), the Business tab's parts out of `seed-globals.ts`, Leads' plan card into `line-globals.ts`, and adds
`legacy-bridge/surfaces/code.ts`, `legacy-bridge/hearing/live-feed.ts` and `legacy-bridge/invitations/handover.tsx`. Each
step re-reads the tree it lands on. A step that touches a file an open lane holds waits for it (0015, Steps):
`cm-ask-manager` (Ask's answers shape themselves, local since 13 October) holds `ask-real.jsx`, `ask-text.jsx`,
`ask-turn.jsx`, `ask/api.ts`, `ask/palette.ts` and `ask.css`; five local lanes hold stylesheets.

**Wave 1 · the cheap removals.** Steps 1 to 3 (section 4), built (section 9); steps 4 and 5 moved to wave 2. Measured
on the build: the frame 6.2 KB lighter (539,484 to 533,278 B gz), three pages' own chunks 9.1 KB lighter and two 5.5 KB
heavier, window names 71 to 54, publisher sites 104 to 76, files over 800 lines 2 to 1, and the tests that load a
classic script 105 to 34.

**Wave 2 · no classic script left.** About 10 days; Ask needs `cm-ask-manager` landed or dropped first.

4. and 5. from wave 1: **the mascot's driver after the first paint** and **Ask's install as a door**, built with Ask's
   move in step 6 (section 9 says why).

6. **Ask leaves**: its five pages as TSX in `apps/dashboard/src/surfaces/ask/`, importing the kit's charts, the hold to
   talk and Leads' plan card; `ask/line-globals.ts` and the lane's Rises row go. Each of `ask-real.jsx`'s 18
   exhaustive-deps warnings is read first: a missing dependency that is a bug is fixed in a commit before the move, one
   that is meant carries its reason on its line.
7. **The frame leaves**, as five commits, each proved equal by value and by a style-equality record of every page:
   - a. The route table: `[[...route]]/page.tsx` draws the parked pages' landing and the not-found card itself
     (`surfaces/frame/landing.tsx`); `SHELL_ROUTES`, `SOON_META` and `drawRoute` go.
   - b. The sidebar, and the shortcuts sheet as a chunk of its own. Its 8 accessibility warnings are fixed in a commit
     before the move, so the proof holds across it.
   - c. The strip (`surface-tabs.jsx`).
   - d. The top bar: the bell (its popover a chunk, drawn only when open), the live call bar, the status bar.
   - e. The frame itself (`app-shell.jsx`, `constants.jsx`) as `surfaces/frame/`. `manifest.ts`, the boot gate, the
     names `seed-globals.ts` publishes for JSX, `surfaces/kit/kit-globals.ts`, `surfaces/inbox/legacy-globals.ts` and
     `surfaces/people/people-globals.ts` go. The frame then reads no `window` as its modules evaluate, so `#frame-shell`,
     `src/frame-shell.ts` and `ssr: false` can go, and its chrome can join the one prerendered document (decision 0053):
     the sidebar and top bar would paint before any script runs. Measured then (first paint p75 is about 850 ms today),
     not promised here.

   The moved rows draw with the kit where the lint in `src/surfaces` asks it (no raw `<button>`); where a kit part moves
   a pixel, that is a commit of its own with its record, before the move.
8. **The mockup and the tree**: `Chanlytics.html`, `bridge-stubs.jsx`, `serve-legacy.mjs`'s document and its bundles,
   `legacy-harness.test.mjs`, `legacy/CLAUDE.md` (the rules in it that still guide a page move into
   `.claude/skills/chanlytics-interface/SKILL.md`), the legacy block of `eslint.config.mjs`, the line in `.prettierignore`
   and the exclude in `apps/dashboard/tsconfig.json`. `corepack pnpm e2e:local` runs the real app, `next start` on a
   build, behind the harness's record, which already answers the two auth calls and every `/api/v1` read a page makes;
   the kit's gallery keeps a document of the stylesheets alone.

On its merge: no JSX, no manifest and no Babel in a browser anywhere; `src/legacy` holds stylesheets only; window names
about 45, publisher sites about 35; lint warnings 284 to 247, functions over the limit 58 to 51, files over 800 lines 0,
inline style props 69 to 57; about 5,300 lines of JSX typed, formatted and linted.

**Wave 3 · one way to reach anything.** About 5 to 6 days.

9. **The rest of the window**: each override writes its typed value (`surface-values.ts`, read through `useSurface`) and
   declares no `globals`; each installer exports what it published (`__clock`, `__tabMemory`, `__chrome`, `__shell`,
   `__ask`, `__notifs`, `__refreshSurface`, `__replies`, `__personNotes`, `__deal` and the rest); the surfaces' adapters,
   `legacy-verbs.ts` first, dissolve into imports. Tests stand in at `fetch`, under the typed client, instead of on
   `window`, so a save's real verb runs. One commit per family: Settings, the Inbox's verbs, the registry's gates,
   notifications, the workspace, the campaigns' verbs, People's detail. It ends with `window-globals.json` and
   `window-publishers.json` empty and deleted, with their rows in `docs/debt.md`, their entries in `_measures.mjs` and
   `shell-names-are-published.test.mjs`. 0053 step 6 then changes the engine under `useSurface` with nothing else to move.
10. **The bridge named for what it is**: `legacy-bridge/` (33 modules at its root, against the limit of 20) becomes
    `src/frame/` (the host, the doors, identity, the workspace, the clock) and `src/seam/` (the registry, the runner, the
    caches, hearing, the refresh map), each grouped by domain; `LegacyHost` and `LegacyApp` become `FrameHost` and
    `Frame`.
11. **The stylesheets leave `src/legacy`**: each to its surface's folder, `tokens.css` and `components.css` beside the
    kit. `store.css`, `fleet.css` and `pipeline.css` (the parked pages, whose mockups went on 17 October) and the rules of
    `dashboard.css` that nothing draws are deleted after a style-equality record of every page: by a name search, about
    85% of their classes are named nowhere. `legacy-files.json` and its row go, and the shell's row under "named and not
    yet measured" retires. 0053 step 7, a stylesheet per surface, needs this.
12. **The docs say one system**: README's paragraph on the shell, `docs/architecture.md`'s "The shell", the takeover's
    rows that end on 0015, CLAUDE.md's canonical rows ("A real surface, not yet moved" removed; the paths of the tokens
    and of a page's styles), and 0015's status, Built. Each earlier step already fixes what it makes false.

## 4. The first moves (wave 1)

**Step 1 · Settings' Business reads its helpers by import** (half a day). `surfaces/settings/business/shell.ts` reads 28
`window.__*` names for the Business tab. The ones that are functions or words become imports: contracts' `samePhone`,
`whyNotAPhone`, `whyNotAHandoff`, `formatPhoneDisplay`, `normalizeLink`, `handoffE164` and `BROKEN_CONFIG_WORDS`; the
receptionist's defaults `inbox-verbs.ts` hands on
(`fallbackMessages`, `FALLBACK_DEFAULTS`, `instructionsDraft`, `newReceptionistDefaults`, `unknownDetails`,
`composedPrompt`); `hoursLines` (`legacy-bridge/business-tab.ts`); the Calendar's page words (`CALENDAR_PAGE`). Their
publishes go: seven lines of `seed-globals.ts`, six of `inbox-verbs.ts`, three of `business-tab.ts` (two of them,
`__businessTab` and `__configLimits`, read by nothing since Settings' JSX left on 4 October), and the mockup's four stubs
of them.
Beside them, three names published for nobody: `CV_ROUTE` and `CV_IN_CHANNEL`, and `window.ROLE_PERMS`, which
`identity.ts` reads only as a fallback to the table it imports; and `ReactDOM`, which two adapters read off `window`
(`calendar/shell-verbs.ts`, `kit/record/shell-verbs.ts`) and can import. The tab's verbs (`__saveSettings`, `__workspace`,
`__calendar`, `__setup`), the zone's words (`__tz`, whose device the harness fixes to Chicago) and its reads
(`__SETTINGS`, `__FACTS` and the rest) wait for step 9, where the tests stop standing in on `window`. Held by the
Business tab's tests, whose harness (`_business-tab-harness.mjs`) already hands these names the real functions. Banks:
window names 74 to 57, about 20 publisher sites.

**Step 2 · The helpers become TypeScript** (1 day). `data-bits.jsx`'s parts go where their kind lives, behaving as the JSX
did:

- a thumb's gestures and an overlay's way out (`touchSwipe`, `leaving`, `leaveOverlay`), what the keyboard covers
  (`watchKeyboard`) and a switch that holds still (`holdStill`) to `surfaces/kit/motion/`, beside `view-deck.ts`;
- focus (`trapTab`, `tabStops`, `trapFocus`, `dialogRef`, `keyPress`, `useHotkey`) to `surfaces/kit/focus/`;
- the role gate (`canDo`, `mayAtLeast`, `gateTitle`, `gate`, `gatedProps`) beside the role store in
  `legacy-bridge/identity.ts`, reading contracts' `roleGate`, so `__roleGate` goes;
- a door that is a link (`routeDoor`) to `surfaces/frame-doors.ts`;
- the frame's one flash (`usePPToast`, `refusalToast`) to `surfaces/frame/flash.ts`. The kit's toast is a second toast
  already; folding the two is a design change, after (0015: no redesign inside a move);
- the stores `POLICY` and `PR_STORE` to `legacy-bridge/policy-store.ts`, which already reads the first;
- `Sparkline`, `StatStrip` and `StatCell`, which no shipped file draws, deleted with the stand-ins 16 tests set for them.

`legacy-verbs.ts` imports them instead of reading `window`, so its 315 importers do not change. The frame's and Ask's JSX
read the same names from `seed-globals.ts`'s one `Object.assign` until they move (0015, "What is shared moves once"), so
no site is added. `__warmPerson` goes too: People's detail is imported. Proof: a throwaway recorder runs the JSX and the
TSX over the 81 tests' worlds and scripted gestures (`touchSwipe`'s pages, edge and pace; `leaving`'s still copy;
`holdStill`'s room) and compares the element trees, the hook cells and the side effects, as the pilot did. Banks:
publisher sites −11, window names −2, file length −1, complexity −2, lint −2, inline style −1, hand route −1; 71 tests
load no classic script.

**Step 3 · Demo samples only in a demo** (half a day). The Calendar's, Reports', Broadcasts' and Live's samples are
fetched only in a session that declared itself a demo, as the lane already does for the Inbox's
(`surfaces/inbox/shell.ts`, `demoCode`) and People's (`surfaces/people/hooks/demo.ts`). About 10 KB off those four
pages' own chunks (the lane's analyzer: calendar 2,836, reports 5,813, broadcasts 1,660, live 834 B by module). Held by
each page's honest test (a real session draws no sample) and the nightly's `no-fabricated-data.spec.ts`.

**Step 4 · The mascot's driver comes after the first paint: moved to wave 2** (§9 says why; it was to take a day). `legacy-bridge/mascot/index.ts` keeps in the frame
only the one mood (`mood.ts`, `follow`), which the palette and the arrival say before any face mounts. The character and
its driver (`character*.ts`, `driver.ts`, `colour.ts`, `liquid.ts`, `draw.ts`, ≈12.4 KB) become a chunk, fetched when the
frame is idle (`aheadWhenIdle`) or when a face mounts, whichever comes first. Until it lands a face is the three at rest,
the driver's own first frame drawn once by a few hundred bytes, so the top bar's face is there at first paint as it is
today. `ask-face.jsx` becomes `surfaces/kit/face/ask-face.tsx`, published under its old names for the top bar and the
Line until they move. Proof: the rest frame recorded against the driver's first draw, light and dark, desk and phone,
and a face that mounts before the chunk lands takes over where the rest frame stood. If the rest frame cannot be made
equal, this step is dropped and the mascot stays in the frame: 12 KB is not worth a face that jumps.

**Step 5 · Ask's install becomes a door: moved to wave 2, with Ask's move** (§9 says why; it was to take a day). `installAsk` builds all of Ask at boot (the palette, the routes,
speech, the voice agent's session, the follow-ups, the page's context) for four readers outside the Line: the top bar's
count of follow-ups, the arrival, `legacy-verbs.ts` (a surface's "Ask about") and Today's read aloud. After it,
`window.__ask` is a small object of doors that load the rest with `codeOnce`, on first use or when the frame is idle,
and the frame keeps only what a press needs at once: the one audio element and `stopSpeaking` (a phone plays sound only
from inside the press, so the clip's element is started there and filled when its words arrive) and the follow-ups'
count (`ask/follow-ups.ts`). The Line's chunk imports the whole API. About 20 KB off the frame (`legacy-bridge/ask.ts` and
what only it reaches: 25,490 B by module on the lane, ≈22.6 KB, less what stays). Proof: `ask.test.mjs` and
`ask-palette.test.mjs` over the door and over the API itself; Today's read aloud pressed on a phone (WebKit) before and
after; a turn sent before the chunk lands waits for it and is sent once. It touches no file `cm-ask-manager` holds.

## 5. Calls made

Each is mine, stated so it can be reversed:

- **Settings' Business first**, out of 0015's order: no JSX, nothing held, the largest fall of names for the least work.
- **The helpers before Ask and the frame**: both read them, and every TSX surface reaches them through `legacy-verbs.ts`;
  moved once, every later move imports them.
- **Three waves, one pull request each**, the steps as commits (Ruben's rule over 0015's one surface per pull request).
- **The mascot's rest frame**, and the step dropped if it is not equal.
- **Ask's audio element stays in the frame**, so read aloud still starts inside the press.
- **`e2e:local` runs the real app** behind the harness's record, not a second bundle of the frame, which would be a
  second mockup.
- **The parked pages' landing is drawn by the catch-all page**, one component, not a route per parked page.
- **`src/frame/` and `src/seam/`** for what `legacy-bridge/` holds once the shell is gone.
- **The frame's flash and the kit's toast stay two** until a design change after this lane.

## 6. Ruben's word

- **The plan**: the three waves in this order, or stop after any one of them.
- **`cm-ask-manager`** (Ask's answers shape themselves, local since 13 October): land it or drop it before wave 2; it
  holds Ask's files.
- **Two deletions**: the standalone mockup in step 8 (`Chanlytics.html` and its server's document; `e2e:local` moves to
  the real app), and the parked pages' stylesheets in step 11.

## 7. Risks

- **The frame is every page's chrome**, so a fault there is on every page. Each of 7a to 7e is proved equal by value and
  by a style-equality record of every page (desk and phone, light and dark) before its commit, and the wave's pull
  request runs the nightly's specs against its preview before it merges.
- **The kit inside a move.** The sidebar's and the top bar's raw buttons must become the kit's under the lint in
  `src/surfaces`; where that moves a pixel, it is its own commit before the move.
- **Sound on a phone** (step 5): a clip's element started outside the press stays silent on iOS. Pressed on WebKit before
  and after.
- **Ask's lane stays open.** Then wave 2 moves the frame and leaves Ask in JSX, drawn by the TSX frame through the one name
  `AskBar` (the lane's `AskLine`), and Ask follows as a pull request of its own.
- **Test churn.** 81, 29 and 6 tests change what they import; every proof runs before the old file is deleted.
- **Pace.** About 18 days of work in all; each wave stands alone.

## 8. What stays

- `tooling/scripts/tests/_legacy-react.mjs` (531 lines), the stub React that 178 tests draw on, TSX surfaces included. It
  is renamed `_stub-react.mjs` in step 8 and loses its window-publishing half; drawing the page tests with React's own
  renderer, so Base UI parts draw on node (Reports' `KIT_PENDING`), is a question of its own.
- The registry's six caches: 0053 step 6.
- The kit primitives the stylesheets still declare, `ask.css`'s among them: Phase 4 of the kit plan
  (`docs/plans/2026-09-28-the-interface-kit-and-its-looks.md`).

## 9. Built: wave 1 (19 October 2026, staged, not committed)

On `perf/one-system-wave-1`, from the loadability lane's `200450b98` (#1742), in `cm-one-system`. Nothing is committed or
pushed; it waits for Ruben's look. It goes up as one pull request, stacked on #1742, and moves onto main once that merges.

**Built.**

- **Step 1.** The Business tab imports its helpers: contracts' phone, link and hand-off checks, the receptionist's
  defaults, `composedPrompt` (through `inbox-verbs.ts`), `CALENDAR_PAGE` and `BROKEN_CONFIG_WORDS`. Gone from the window:
  `seed-globals.ts`'s seven, `inbox-verbs.ts`'s six, `business-tab.ts`'s installer with `__businessTab` and
  `__configLimits`, `CV_ROUTE`, `CV_IN_CHANNEL` and `window.ROLE_PERMS`, the mockup's stubs, and the business tab's
  bundle in `serve-legacy.mjs`. The tab's verbs and reads stay on the window, as planned, until step 9.
- **Step 2.** `data-bits.jsx` is deleted. Its parts are TypeScript where their kind lives: `kit/motion/` (`swipe.ts`,
  `leaving.ts`, `keyboard.ts`, `hold-still.ts`), `kit/focus/` (`trap.ts`, `keys.ts`), `frame/flash.tsx`, `frame/tip.ts`,
  `frame/gate.ts`, `frame-doors.ts`, `inbox/store.ts` (`PR_STORE`) and `policy-store.ts` (`POLICY`). Three things differ
  from section 4. The gate sits in `surfaces/frame/`, not in `identity.ts`, because it reads the tip and the role
  store, which the frame owns. `flash` is `.tsx`, since it draws. And `__roleGate` and `__warmPerson` stay, because the
  tests stand in on them until step 9. `frame-globals.ts` publishes the names the frame's JSX and Ask still read, in one
  `Object.assign`, and the mockup builds it as a bundle. `Sparkline`, `StatStrip` and `StatCell` are deleted.
- **Step 3.** The Calendar's, Reports', Broadcasts' and Live's samples are fetched only in a demo session (`demo.ts`
  beside each, `codeOnce`).

**Measured** (`next build` on the lane and on `200450b98`, then `check:bundle`):

| | Before | After | Change |
| --- | --- | --- | --- |
| Route JS, gz | 539,484 | 533,278 | −6,206 |
| Calendar's own | 108,779 | 105,377 | −3,402 |
| Reports' own | 100,058 | 94,876 | −5,182 |
| Live's own | 8,156 | 7,613 | −543 |
| Settings' own | 197,258 | 202,713 | +5,455 |
| Start's own | 104,823 | 110,474 | +5,651 |

Every other page and the route CSS are unchanged. Settings and Start grow because the prompt builder and the phone
helpers no longer come with the frame. They now load only on the two pages that draw the Business tab, so the pull
request carries a `Bundle:` line. `check:static-shell` passes. The register: window names 71 to 54, publisher sites 104
to 76, files over 800 lines 2 to 1, functions over the limits 58 to 55, lint warnings 284 to 282, inline style props 69
to 68, legacy files 40 to 39. Hand routes stay at 100: one moved, with its Rises row, beside the frame's publishers.
Dead exports stay at 255.

**Proved.** Each step's tests were run on the lane and on the base, and the lane fails nothing the base passes: step 1's
Business tab suites, step 2's 94 test files plus the 31 that set their own window, and step 3's 77. The only difference
is two bridge tests removed with the installer they tested. Typecheck, lint, the ratchets, the debt register, knip and
the docs' paths all pass. Section 4's recorder was not built, because the moved code is the same code typed, and the
tests that drew it before draw it now.

**Corrected from section 4.**

- **Frame bytes.** Section 4 promised about 32 KB. Only about 6 KB fell, and that came from step 1. Step 2 typed the
  helpers but kept them in the frame, since the frame's JSX still draws them, and steps 4 and 5 moved.
- **Window names.** Step 2 frees no `__` name. Its reads stay as the tests' seams until step 9.

**Why steps 4 and 5 moved to wave 2.**

- **Ask's door** frees only 9.3 KB by module on the analyzer's export graph: voice, context, commit, `ask.ts` and the plan
  steps, among eleven. That is far short of the 20 KB in section 4. The palette, the follow-ups, speech and the API stay
  in the frame for the arrival, the top bar and Today. Built with Ask's move, the door has nothing else to keep open.
- **The mascot's** rest frame can only be identical if it keeps the drawing, the colour and the character, about 6.5 KB
  of the 12.4. That leaves about 6 KB saved, which is not worth a first paint at risk now. With Ask's move, the face
  becomes TSX anyway.
