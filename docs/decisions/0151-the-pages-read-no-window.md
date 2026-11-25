# 0151 · The pages read no window: what the bridge installs, a read's answer and a page's report each have one home

**Status:** Decided and built on one branch (`wiring/no-window-globals`, lane 7 of the code refinement plan of 25
November 2026: the frontend pillar's state). Ruben asked that day for one standard for the wiring, with the plainest
modern pattern where the old one is poor; this is that choice, taken in the lane. Written against main at `f41a343542`,
and measured again at `1c4769fb2d` (#2594, the kit lane's one sheet, merged in). No migration; either deploy order
(nothing the two apps send each other changes).

## Context

The shell began as a set of classic scripts that shared one global scope, so everything one part made for another was
hung on `window` and read back by name (decision 0015). The scripts are gone and every page is a module, but the habit
stayed: at `f41a343542` the dashboard's browser code read **40** `window.__*` names (the register's `window-globals`) and
wrote to the window at **32** sites in **14** files (`window-publishers`), and as many again through helpers that read a
name off the window without the measure seeing it (`windowValue("__WORKSPACES")`, `Reflect.get(window, "__ME")`, a
window passed in as a parameter). They were of three kinds:

- **What the bridge installs at boot:** the shell's verbs (`__shell`), the chrome's words (`__chrome`), the business's
  clock (`__clock`), the tab's memory (`__tabMemory`), the bell (`__notifs`), the tip (`__tip`), the route gate
  (`__surfaceGate`, `__surfaceFailed`, `__onSurfaceReady`, `__routeWaitMs`, `__surfaceState`, `__surfaceRetired`), a
  page's Retry (`__refreshSurface`), and the verbs a page reaches without carrying their code (`__broadcasts`,
  `__calendar`, `__billing`, `__replies`, `__href`, `__setPolicy`, `__saveSettings`, `__refreshPlaybooks`, `__workspace`,
  and the people page's courier: `__deal`, `__personNotes`, `__warmPerson`).
- **A read's answer:** the workspace read wrote five (`__WORKSPACES`, `__ME`, `__ACTIVE_WORKSPACE`, `__PENDING_WORKSPACE`,
  `__SIGNUP_POSTURE`), the bell's read and the leads' replies one each (`__NOTIFICATIONS`, `__REPLIES`), and six surfaces
  mirrored their typed value onto a window name for the pages that had not moved (`__PEOPLE`, `__LIVE`, `__BROADCASTS`,
  `INBOX_DATA`, `CONVERSATIONS_DATA`, `TODAY_DATA`), as the line under the top bar its status (`__SHELL_STATUS`).
- **Words and rules a page can import:** the role gate's sentence (`__roleGate`, contracts' `roleGate`), the identity and
  zone words (`__identity`, `__tz`), People's list route (`__listRoute`), and whether the page is inside the phone app
  (`__IN_APP`, which contracts' boot script also puts on the root as a class).

They were on the window for two reasons that still hold, and one that does not. A node test stands a part in for a page
drawn alone; a page drawn without the bridge (a test, the e2e harness) draws as it did then; and the shell's classic
scripts could not import, which is over.

## Decision

1. **What the bridge installs is held in one typed store, `apps/dashboard/src/bridge/provided.ts`.** `provide(name, part)`
   as the bridge installs a part, `provided(name)` where a page or the frame uses it, read when it is used and undefined
   before the bridge has installed it, as the window was. The names and their types are one interface (`BridgeParts`); a
   part typed by its owner's own interface is declared there by the owner (`declare module "./provided" { interface
BridgeParts { clock: PageClock } }`), as each once declared its window name, so the store imports nothing, at run time
   or for its types, and the kit, the frame and every surface can import it without a circle. A test hands in its
   stand-in with `provide`. This is a module-level store, the first of the four replacements the plan offered: a part installed once
   for the life of the tab has no subscriber to tell, a React context would not reach the non-React readers (the runner,
   the bell, the surfaces' adapters), and a prop would thread through every page for parts the frame alone installs. A
   verb that stays installed (not imported) does so to keep its code where it is today, in the code every page shares
   because the frame installs it: the people page's courier exists to keep the deal and step sheets' rules out of the
   pages that only reach them (the loadability review, 19 Oct 2026).
2. **A read's answer is the seam's.** A surface's value is read where it is held, `surfaceValue(key)` or `useSurface(key)`
   (`surfaces/surface-values.ts`), and the mirrors are gone with their readers. The bridge's own three reads (who is
   looking, the bell's notices, the leads' replies) are held in the bridge, `bridge/held-reads.ts`, since the bridge stands
   under the surfaces and may not lean on them (decision 0110); `bridge/who.ts` reads and holds the workspace read's answer
   as one value (`whoIsLooking()`, `holdWhoIsLooking()`, `currentWorkspace()`), with the shapes it answers in (`Workspace`,
   `Me`). An override whose answer the bridge holds says so (`held: true`), and the surface cache keeps that answer with
   its snapshot under a slot of its own (`$held`) and gives it back before React draws, as it gave the window's globals back;
   a snapshot holding one is drawn under the build that kept it, as a globals snapshot was. The status line's state is
   the shell's own (`ShellApi.status()`), heard by `shell:status` as before.
3. **Words and rules are imported:** `roleGate`, `identityWords`, `workspaceInitials` and the zone's words from contracts,
   `plListRoute` from People's words, by each page that links a list (Reports, the activity log), not through the frame's
   verbs, which would lean the frame on People. The phone app is read off the root's class (`IN_APP_CLASS`), which contracts' boot
   script stamps before paint, as #2590 reads the page's other states off the root.
4. **A page's console line goes through one report seam,** `apps/dashboard/src/client/page-report.ts` (`pageReport.error`,
   `pageReport.warn`), the one browser module named in `CONSOLE_SINKS`. The lines are said as they were; the day they are
   sent on is a change to that module alone. The phone app's three wait for the phone app.
5. **The tests stand their world in where the app holds it:** `tests/shell/_bridge-holds.mjs` `bridgeHolds({ who, values,
reads, parts }, { fresh })`. The Playwright specs that read the page's window ask the server for the address's
   workspace, read People through its route, and stand in for the settings save in the browser's traffic (the save the
   page makes, through its client, answered without a write).

## What is left, and why

- **The frame's helpers published for the pages by name** (`frame-globals.ts`, `seed-globals.ts`, `app-shell.tsx`'s three
  doors): `CHANLY`, the role store, the gate, the toast, the kit's parts. Their few app readers are next to move; most of
  their readers are tests' stand-ins (`CHANLY` in 124 test files), and the kit lane's files read `ReactDOM`, `leaving`,
  `trapTab`, `tabStops`, `leaveOverlay` and `dialogRef`. A change of its own. The record kit's own three reads
  (`kit/record/shell-verbs.ts`: the chrome's words, the tip, the tab's memory) ask the store now, since #2594 landed.
- **Names the register does not see:** Ask's on-screen ledger (`bridge/ask/on-screen.ts`, `__askOnScreen`, written and
  read by that module alone), the phone app's bridge (`__appBridge`, the native shell's door, which the paused phone app
  calls) and the e2e loads' probes (`__inboxLoad` and its kind, which only the specs write).

## Numbers (the register's measures, main `1c4769fb2d` against the branch)

| Measure                       | Main                           | Branch                       |
| ----------------------------- | ------------------------------ | ---------------------------- |
| window globals                | 40 names                       | 0                            |
| window publishers             | 32 sites in 14 files           | 6 in 3 (the frame's helpers) |
| console calls past the logger | 28 (25 dashboard, 3 phone app) | 3 (the phone app's)          |
| module circles (values)       | `bridge/api.ts`'s, 19 modules  | 16                           |
| type circles                  | `bridge/activity.ts`'s, 122    | 121                          |

## Tests

The behaviour tests of every reader moved (the frame's shell tests, the bell, Ask's palette, the surfaces' pages, the
cache) stand their world in through `bridgeHolds` and run the code as it reads the stores; `tests/shell/surfaces/
surface-cache.test.mjs` holds the cache's `$held` slot; `tests/repo/rules/rules.test.mjs` the seam in `CONSOLE_SINKS`.
