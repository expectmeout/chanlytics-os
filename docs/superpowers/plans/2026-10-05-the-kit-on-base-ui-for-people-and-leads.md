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

- [ ] **Step 1:** the recorder in `leads-honest.test.mjs` records the kit `Menu` (`recorded.set(Menu, menus)`) and the tests read `groups` instead of `items` (an item's `label`, `glyph`, `meta`, `hint`, `onSelect` or `href`, a group's `header`); red.
- [ ] **Step 2:** each menu draws `<Menu trigger={<Button …>} groups={…} align="end">`: the trigger the kit's `Button` with the glyph and words the `MoreMenu` trigger had, and its test id; a heading as the first group's `header`; a route item an `href` (the rail's, "every item is a route"); `gated` as the trigger's gate. `escape` has no counterpart: the kit `Menu` is placed against the window in a portal already.
- [ ] **Step 3:** green: the Leads tests, typecheck, lint, `check:dead-exports`, `kit-primitives` (the `more-*` selectors the pages drew fall).
- [ ] **Step 4:** look at it: the call menu on a row, the ⋯, a search's menu, the peek's asks, desk and phone (the kit `Menu` is the phone's action sheet under 900px), against `main` side by side.
- [ ] **Step 5:** commit.

### Task C3: Columns, a set of switches in the kit `Menu`

**Files:** `kit/menu/menu.tsx` (a `toggles` group: Base UI `Menu.CheckboxItem` each, `closeOnClick={false}`, an item that is `locked` drawn checked and refused with its word, "Always"), `kit/kit.css` and `kit/classes.json` (only if a class is new), the gallery's Menu family (`kit-gallery.mjs`: a menu with a set of switches), `e2e/kit/kit-behaves.spec.ts` + `kit-behaves-checks.ts` (a switch flips and the menu stays open; Escape closes; a locked one does not flip), `people/table/columns-menu.tsx` (deleted), its readers (`people/page/screen.tsx`, `leads/scope/controls.tsx`, the Pipeline's), the page keyboard listener's Columns branch (`people/hooks/use-place.ts`: Esc closes the Columns menu first; Base UI's Escape does it now).

- [ ] **Step 1:** the kit `Menu` gains `toggles: { items: { value, label, on, locked?, lockedWord? }[]; onToggle(value) }`; a type test beside it; the gallery entry; the `kit-behaves` checks; red, then green in a browser.
- [ ] **Step 2:** People's Columns (and Leads' and the Pipeline's, the same menu) draws the kit `Menu` with one `toggles` group under the heading "Show on the table"; the page's open state for it goes (Base UI holds it); the keyboard listener's Columns branch goes; the test ids `people-columns`, `column-<key>` stay on the trigger and the items (e2e pins).
- [ ] **Step 3:** green (People, Leads, Pipeline page tests; e2e pins grepped), look at it, commit.

### Task C4: People's phone sheets on the kit `Sheet`

**Files:** `kit/sheet/sheet.tsx` (on a phone: a handle, a pull down to close through `touchSwipe({ onDown })` on the popup, and a step back, `back: { label, glyph, onBack }`, in the head's start), `kit.css` (the handle, the back), the gallery's Sheet family (a phone sheet with a step back), `kit-behaves` (a pull past a third closes; a back press calls `onBack`, Escape still closes), `people/sheets/phone-sheet.tsx` (`PhoneSheet` deleted; `PhoneSheetRow` stays, it is a row), its readers (`people/page/screen.tsx`, `people/page/list-acts.tsx`, `people/sheets/list-sheets.tsx`, `people/bulk/phone-bulk.tsx`, `people/pipeline/new.tsx`, `leads/scope/bulk-bar.tsx`), the page keyboard listener (`PL_OVERLAY` / `pl-sheet`: Base UI's Escape closes it now).

- [ ] **Step 1:** decide with the kit's `Sheet` as it stands which of its parts a phone sheet needs (a title, a Close or Cancel word, the body; no `tools`, no `foot` unless the job has one), and add only the phone's handle, pull and back.
- [ ] **Step 2:** the kit `Sheet`'s phone behaviours with their gallery entry and `kit-behaves` checks; red, then green.
- [ ] **Step 3:** each `PhoneSheet` becomes the kit `Sheet` (`open` the page's, `onClose`, `back` where it had `onBack`), test ids kept (`<testid>`, `<testid>-back`, `<testid>-close`); `PhoneSheet` deleted.
- [ ] **Step 4:** green (People, Leads, Pipeline page tests; `e2e/shell/phone.spec.ts` and `e2e/people/*` pins grepped), look at every sheet on a phone (390) in both looks, commit.

## Self-review

- The analysis's Base UI track: Leads' menus (C2), the Columns menu (C3), the phone sheets (C4, on the kit `Sheet` rather than `Drawer`, said above); the strip's move into the kit waits for decision 0015's step 13, said above.
- Every piece lands in the kit with its gallery entry and its browser proof before a page uses it, and the page's own copy goes in the same task.
