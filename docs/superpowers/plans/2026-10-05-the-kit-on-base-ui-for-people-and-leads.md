# The kit on Base UI for People and Leads: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People and Leads draw their menus and their phone sheets with the kit's Base UI parts, as the Inbox and People's own menus already do, so the hand-written versions can go: Leads' four menus on the kit `Menu`, the Columns switches as a set in the kit `Menu`, and People's phone sheets on the kit `Sheet` with a phone's pull-down and step back.

**Architecture:** Every piece lands in the kit first (a variant, its gallery entry, its `kit-behaves` proof), then the pages move onto it and their own copy is deleted in the same change (the interface kit's decision 15: hand-written behaviour goes as its Base UI version lands, never beside it). Base UI does a part's behaviour (focus, keys, roles, portal, closing); the house keeps one reader of a thumb (`touchSwipe`, Ruben's gesture rules), so a sheet's pull-down is `touchSwipe`'s, not Base UI `Drawer`'s.

**Tech Stack:** `@base-ui/react` 1.8.0 (per-part imports: `menu`, `dialog`), the kit (`apps/dashboard/src/surfaces/kit/`, `kit.css`, `classes.json`, the gallery `tooling/scripts/e2e-harness/kit-gallery.mjs`), `e2e/kit/kit-behaves.spec.ts` (`corepack pnpm e2e:local -- e2e/kit/kit-behaves.spec.ts --scenario=kit`), the node suite's stub React (page tests read a kit part by its type and its props, `reference_base_ui_in_the_suite`).

**Origin:** the 5 Oct 2026 analysis ("Is moving both to Base UI better? ... worth finishing as a separate consistency track"), approved with plan 1 (`2026-10-05-tab-switch-parity.md`). One correction to the analysis: it named Base UI's `Drawer` for the phone sheets; `Drawer` brings a swipe of its own, and the house's rule is one reader of a thumb (`touchSwipe`), so the sheets move to the kit `Sheet` (Base UI `Dialog`) with `touchSwipe`'s pull-down instead.

## Global Constraints

As plan 1's: worktree `cm-load-path`, branch `perf/tab-switch-parity` (one batch with plan 1), local commits, **nothing pushed**; Sonnet for any agent; touched tests + ratchets + typecheck + lint; Edit for CRLF files, never `sed -i`; `?v=` bumps for every edited legacy file; e2e pins grepped before a class, test id or role moves; the `chanlytics-interface` skill read before a kit change.

## Not in this plan

- **The strip as the kit's TSX `ViewTabs`.** The strip is the frame's, and decision 0015 moves the frame last (step 13, after Ask, step 12, which waits on Ask Rewired Part B). Its tabs became links in plan 1 (B3), which is what the analysis asked of it; its move into the kit waits for step 13 rather than jumping the decision's order.
- **Settings' and the bulk bars' `MoreMenu`s.** Settings moves pane by pane in its own lane; this plan is People and Leads.

---

### Task C2: Leads' menus on the kit `Menu`

**Files:** `apps/dashboard/src/surfaces/leads/cells/call-menu.tsx` (a lead's Call: the number as the heading, Dial, Copy, Log), `leads/scope/controls.tsx` (Glass's ⋯: Map or Table, Values or Signals, Export), `leads/scope/rail.tsx` (a kept search's menu, every item a route), `leads/peek/asks.tsx` (the peek's asks); tests `leads/finder/leads-honest.test.mjs` (the `menus` recorder reads `MoreMenu`'s props), `leads/finder/leads-finder.test.mjs` if it reads them; e2e `e2e/leads.spec.ts` pins (`lead-call`, `leads-more`, the search menu's test id).

- [x] **Step 1:** the recorder in `leads-honest.test.mjs` records the kit `Menu` (`recorded.set(Menu, menus)`) and the tests read `groups` instead of `items` (an item's `label`, `glyph`, `meta`, `hint`, `onSelect` or `href`, a group's `header`); red.
- [x] **Step 2:** each menu draws `<Menu trigger={<Button …>} groups={…} align="end">`: the trigger the kit's `Button` with the glyph and words the `MoreMenu` trigger had, and its test id; a heading as the first group's `header`; a route item an `href` (the rail's, "every item is a route"); `gated` as the trigger's gate. `escape` has no counterpart: the kit `Menu` is placed against the window in a portal already.
- [x] **Step 3:** green: the Leads tests, typecheck, lint, `check:dead-exports`, `kit-primitives` (the `more-*` selectors the pages drew fall). `leads-peek.test.mjs` was missed here and went red (it pressed the house `MoreMenu`'s trigger); fixed with C3: it reads the kit `Menu` by type (`kitItem`).
- [x] **Step 4:** look at it: the call menu on a row, the ⋯, a search's menu, the peek's asks, desk and phone (the kit `Menu` is the phone's action sheet under 900px), against `main` side by side.
- [x] **Step 5:** commit (`7552e0068`).

### Task C3: Columns, a set of switches in the kit `Menu`

**Files:** `kit/menu/menu.tsx` (a `toggles` group: Base UI `Menu.CheckboxItem` each, `closeOnClick={false}`, an item that is `locked` drawn checked and refused with its word, "Always"), `kit/kit.css` and `kit/classes.json` (only if a class is new), the gallery's Menu family (`kit-gallery.mjs`: a menu with a set of switches), `e2e/kit/kit-behaves.spec.ts` + `kit-behaves-checks.ts` (a switch flips and the menu stays open; Escape closes; a locked one does not flip), `people/table/columns-menu.tsx` (deleted), its readers (`people/page/screen.tsx`, `leads/scope/controls.tsx`, the Pipeline's), the page keyboard listener's Columns branch (`people/hooks/use-place.ts`: Esc closes the Columns menu first; Base UI's Escape does it now).

- [x] **Step 1:** the kit `Menu` gains `toggles: { items: { value, label, on, locked? }[]; onToggle(value); tick }` (`locked` is the word itself, "Always"); a type test beside it; the gallery entry `menu-kit-switches`; the `kit-behaves` check `menuSwitches`; green in a browser (7 of 7, 23 checks in each of 8 runs).
- [x] **Step 2:** People's Columns (and Leads' and the Pipeline's, the same menu) draws the kit `Menu` with one `toggles` group under the heading "Show on the table"; the page's open state for it goes (Base UI holds it); the keyboard listener's Columns branch goes, and `pl-cols-menu` leaves `PL_OVERLAY`'s own list. Two changes from the step as written: `columns-menu.tsx` stays as the one composition the three pages share (deleting it would write the menu three times), and the items carry no `column-<key>` test ids (the kit's items take none; the one e2e pin, `e2e/people/people.spec.ts`, finds them by role and name). `plColumnOptions` hands a switch its words as a string: a column headed by no words is fixed, so never a switch.
- [x] **Step 3:** green: People 105, Leads 81, peek 42, Pipeline 74, table 13, calendar 51, finder 20, record kit 82; ratchets (kit-primitives `clients.css::more-item` 6 → 3, register 1988 → 1985), lint (357 → 355 warnings), dead exports 301 unchanged, typecheck; e2e pins grepped. `e2e/kit/kit.spec.ts` has two reds that are main's, not this branch's (`.rec-combo-*`, `.token[data-readonly]`, `.rec-input-title` undrawn; the combobox input's ring in Glass). Commit.

### Task C4: People's phone sheets on the kit `Sheet`

**Files:** `kit/sheet/sheet.tsx` (on a phone: a handle, a pull down to close through `touchSwipe({ onDown })` on the popup, and a step back, `back: { label, glyph, onBack }`, in the head's start), `kit.css` (the handle, the back), the gallery's Sheet family (a phone sheet with a step back), `kit-behaves` (a pull past a third closes; a back press calls `onBack`, Escape still closes), `people/sheets/phone-sheet.tsx` (`PhoneSheet` deleted; `PhoneSheetRow` stays, it is a row), its readers (`people/page/screen.tsx`, `people/page/list-acts.tsx`, `people/sheets/list-sheets.tsx`, `people/bulk/phone-bulk.tsx`, `people/pipeline/new.tsx`, `leads/scope/bulk-bar.tsx`), the page keyboard listener (`PL_OVERLAY` / `pl-sheet`: Base UI's Escape closes it now).

- [x] **Step 1:** decided: the kit `Sheet` takes a second shape, `shape="job"` (a short head: a step's way back, the title, a word to close it or none; then the job; no sub, tools or foot, which its type refuses), drawn with PhoneSheet's values as the kit's `.sheet-job-*`. Every kit sheet now: keeps a field focused as it draws (`initialFocus` as a function), leaves showing what it held as it closed, and is pulled down on a phone (data-bits `touchSwipe`, whose settle now leaves a sheet that is `data-leaving` where the pull took it: `it-moves.test.mjs`).
- [x] **Step 2:** the gallery's `sheet-job` beside PhoneSheet's head and body as a twin (held equal, frame, head and body, then the twin and PhoneSheet's sources went), the Base UI entry `sheet-kit-job` and the `kit-behaves` check `sheetJob` (a step back, the word, Escape from a step), green. The pull is not on the kit's running page (it has no data-bits): `e2e/shell/phone.spec.ts` pulls a real sheet, and `dev-tools/load-parity/phone-sheets.mjs` did on the build.
- [x] **Step 3:** each `PhoneSheet` became the kit `Sheet` with `open` the page's, kept mounted so it leaves the way it came; Leads' two sheets are one with two steps; test ids kept (`<testid>`, `<testid>-back`, `<testid>-close`); `PhoneSheet` deleted (`phone-sheet.tsx` keeps `PhoneSheetRow`, `JOB_CANCEL`, `jobBack`), with its rules (clients.css, components.css) and `legacy-verbs`' `dialogRef`. The page's keyboard no longer closes them: they are in `PL_OVERLAY` and close on their own Esc. Glass's test-id rules for People's sheets still dress the kit's, so nothing moved there; Leads' two take the kit's Glass sheet.
- [x] **Step 4:** green: People 105, Leads 81, peek 42, Pipeline 74, it-moves 19, focus trap 8, kit tests, ratchets (kit-primitives 1985 → 1960, data-bits 943 → 942 lines), lint, dead exports 301, typecheck; e2e pins grepped (`phone.spec.ts`'s two `.more-wrap > button` locators were stale on main since #1374 and now find the ⋯ by its name). Looked at on the build at 390 in both looks: the same head, word, handle, corners and fields as before; Cancel 217 ms, Escape 226 ms, a pull leaves and never comes back; the selection's step and its way back.

## Self-review

- The analysis's Base UI track: Leads' menus (C2), the Columns menu (C3), the phone sheets (C4, on the kit `Sheet` rather than `Drawer`, said above); the strip's move into the kit waits for decision 0015's step 13, said above.
- Every piece lands in the kit with its gallery entry and its browser proof before a page uses it, and the page's own copy goes in the same task.
