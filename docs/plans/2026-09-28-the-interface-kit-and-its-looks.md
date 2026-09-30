# The interface kit, and the looks it wears

**One component kit and one theme system for the dashboard, built from the foundation up: the architecture under
the pixels first, then the kit, then every page on it, then the new look, and last the rules that keep people and
agents on it. A PRD.**

**Date:** 28 September 2026 · **Owner:** Ruben · **Status:** decided, not built: Ruben took every recommendation in
§8 on 28 September ("go with your recommendations") · **Written against:** `origin/main` at `81c5a7a42` (#1261),
and #1205 (open), which settles decision 0015. Every count below was measured on that tree on 28 September, and every
fact carries its file and line. Where this document and the code disagree, the code wins and this document is
corrected.

**Follows:** decision 0015 (the shell leaves one surface at a time; settled by #1205), the frontend plan
(`docs/plans/2026-09-27-frontend-performance-scale.md`, §17 "one set of breakpoints, as tokens"), the organization
and code-health plan (`docs/plans/2026-09-26-organization-and-code-health.md`) and the Road to Ten page, which own the
rest of the codebase's health and are not re-planned here, the one-badge-system spec
(`docs/superpowers/specs/2026-09-23-one-badge-system-design.md`), and the six Liquid Glass canvases drawn on 27 and
28 September, which are the design this program builds (Appendix C).

---

## 0. Why, and what this is

Ruben, 28 September: the site should "have a clean component and styling system", so that a theme can be changed or
tweaked "without having to go in tons of files and components individually", and "i don't want to over engineer".
Then: "focus on the backend architecture rather than creating new frontend buttons", "ensure the codebase is perfect
and ready and leave the button for last", and make the last task "ensure the other agents and future work follow the
new shadcn like setup instead of recreating buttons".

The aim, in one line: **a look is a set of token values, a component is written once, and a page only composes.** A
new look, or a tweak to one, is then an edit to two files: the tokens and the kit.

**shadcn's model, not its packages.** shadcn/ui is three ideas: semantic CSS variables that a theme sets, components
that live in the repository and read only those variables, and variants passed as props. The dashboard already has
the first (`tokens.css`, §1.2) and a working example of the second: the charts kit, which says of itself "Shaped like
shadcn/ui's charts" (`apps/dashboard/src/legacy/components/chart-core.jsx:2-16`). What it lacks is one kit that
every page draws from, a second theme setting for the finish, and rules that keep it that way. Tailwind, Radix and
class-variance-authority would cost a rewrite and buy nothing the repository does not already have (§2.3).

**The order is Ruben's.** Phases 1 to 4 change nothing a member can see: they build the architecture, the kit and the
pages' use of it, and each step proves it is identical. Phase 5 is the look, the buttons among it. Phase 6, the last,
makes the kit the only way to draw a button, for people and for agents.

**What "backend architecture" covers here** is the layer under the pixels: how a look is chosen and resolved before
first paint, how the stylesheets are ordered and measured, where the kit lives and how the legacy shell reaches it,
the proofs that a restructure changed nothing, and the rules the build enforces. The one server-side question, whether
a look is saved on the member's account, is decision 3; the theme beside it is saved on each device, on purpose
(§1.3).

**What this is not.**

- Not a redesign. The canvases are the design, and no page changes how it looks until Phase 5.
- Not the shell's exit. Decision 0015 owns that, and this program fits into it (§3.6) without re-planning it.
- Not a new framework. One devDependency, a CSS parser for the measures (decision 8), and nothing at runtime.

---

## 1. What the code says today

### 1.1 The stack

- One signed-in page, `/w/<slug>`, draws the legacy shell: 123 classic-script JSX files under
  `apps/dashboard/src/legacy/` that import nothing, share components with `Object.assign(window, …)` and load in a
  fixed order (`apps/dashboard/src/legacy-bridge/manifest.ts:18-47`; decision 0015, "What the shell is"). The tree is
  not typechecked (`apps/dashboard/tsconfig.json:20`), not formatted (`.prettierignore`) and linted for hooks only
  (`eslint.config.mjs:351-379`).
- There is no Tailwind, shadcn/ui, Radix, CSS-in-JS or CSS Modules. The dashboard has 16 runtime dependencies
  (`apps/dashboard/package.json`), by the rule in `CLAUDE.md`, "What not to introduce".
- The styles are global CSS. `apps/dashboard/src/legacy-bridge/legacy.css:1-23` imports `tokens.css` and 20
  stylesheets in one order for the shell (Next does not guarantee cross-import order, so one entry file does);
  `apps/dashboard/app/globals.css:12` imports the tokens for sign-in and the public pages. The workspace route ships
  one stylesheet for every surface: 123 KB gzipped (`tooling/scripts/tests/baselines/bundle-budget.json`;
  `docs/debt.md`, Rises).

### 1.2 The tokens

`apps/dashboard/src/legacy/styles/tokens.css` (298 lines) is already a semantic system:

- **Scales:** type `--text-xs` to `--text-5xl` (:12-21), leading, tracking and weight; space `--space-0` to
  `--space-20` on a 4px base; radii `--radius-xs` to `--radius-full` (:112-118); motion (eases and three durations).
- **Layout:** the measures `--measure-prose/page/wide` and `--gutter-page`, the rails `--rail-nav/list`, and the
  phone row (`--row-pad-y` … `--row-facts-line`), each with the reason it exists written beside it.
- **Colour roles:** `--bg`, `--bg-sunken`, `--bg-raised`, `--bg-hover`, `--bg-active`, `--mark-plate`, `--line`,
  `--line-strong`, the bubbles, `--ink`, `--ink-muted`, `--ink-dim`, `--ink-faint`, `--shadow-sm/md/lg`,
  `--focus-ring`; the accent, "Used ONLY for live/active agent state. Never decorative"; four statuses, each with a
  `-soft` fill and an `-ink` for small text.
- **Two modes:** `[data-theme="light"]` (:165) and `[data-theme="dark"]` (:205). Colours are `oklch`, and rules
  already derive from tokens with relative colour (`oklch(from var(--ink) …)`, `components.css:457`).

### 1.3 How a theme is chosen: the path a look will follow

The theme is a device preference, not an account one, on purpose: it belongs to "this BROWSER rather than of you"
(`apps/dashboard/src/legacy/pages/settings.jsx:446-448`).

- **Stored** in localStorage under `chanlytics-os-prefs` as `{theme, sidebar, inboxDensity, showInboxAgentRail}`
  (`packages/contracts/src/shell/chrome.ts:50`; `apps/dashboard/src/legacy-bridge/LegacyApp.tsx:256-269`). No table,
  route, migration or zod schema touches it.
- **Typed and resolved in contracts:** `ThemePref` light, dark or system (`chrome.ts:9`), `THEME_OPTIONS` (:12-16),
  `resolveTheme` (:38-41), `DEFAULT_THEME_PREF` dark (:44), `themePrefOf` (:47), `themeBootScript` (:91-105).
- **Set before first paint:** `apps/dashboard/app/layout.tsx:61` renders `data-theme="dark"` and inlines
  `themeBootScript()` (:63), which reads the stored preference, follows the device for "system", sets
  `document.documentElement.dataset.theme` and paints `meta[name="theme-color"]` (`chrome.ts:94-103`).
- **Applied live** by `LegacyApp.tsx:350-353`, and stamped on `.app-root`, `.shared-root` and `.fr-shell`
  (`legacy/pages/app-shell.jsx:479-509`).
- **Changed** from the account menu (`legacy/components/sidebar.jsx:296-303`) and the top bar
  (`legacy/components/topbar.jsx:521-527, 610-617`), through a React prop; there is no bridge verb or API call.
- **Read by five consumers besides CSS:** `legacy-bridge/theme-color.ts:26-43`; the phone app, whose web view
  reports the theme through `legacy-bridge/app-bridge.ts:177-188` to `Appearance.setColorScheme`
  (`apps/mobile/src/shell/Surface.tsx:244-255`); the lead map (`legacy-bridge/lead-map-draw.ts:27-31, 62-73`); the mascot,
  which reads tokens (`legacy-bridge/mascot/driver.ts:136-148`); and the chart palette
  (`legacy/styles/charts.css:13, 30`).
- **Pinned** by `tooling/scripts/tests/shell/theme-boot.test.mjs:105-260`, `shell/chrome.test.mjs` (which pins
  `LegacyApp.tsx` lines 276, 317 and 351 word for word), `shell/surfaces/shell-status.test.mjs:1098-1150` and
  `e2e/sidebar.spec.ts`.

### 1.4 How the stylesheets use the tokens

Measured on every stylesheet except `tokens.css`, comments removed:

| What                                                             | Count                                                                              |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Values read through a token, `var(--…)`                          | 6,724                                                                              |
| Colours written raw (hex, rgb, oklch; not derived from a token)  | about 100                                                                          |
| Font sizes written in px                                         | 1,122: 412 equal a `--text-*` step, 710 are off the scale                          |
| The off-scale font sizes                                         | 12px 167 · 11.5px 124 · 10.5px 116 · 13px 98 · 10px 84 · 9.5px 34 · 14px 25        |
| Corner radii written in px                                       | 306: 192 equal a `--radius-*` value, 114 do not (3px 32 · 2px 22 · 10px 20 · 1px 10) |
| Different radius values in use                                   | 48                                                                                 |
| Box shadows written raw                                          | 75                                                                                 |
| Spacing written in px (padding, margin, gap)                     | 3,222                                                                              |
| Rules with a backdrop blur                                       | 6                                                                                  |
| Inline `style=` props in the 149 page and component files        | 148, and 29 raw colours                                                            |

Colour is already a theme: a new palette is one file. Shape, type size, depth and material are not: they are written
in each page's own classes, and they are exactly what a new finish changes. Some sheets are clean: `record.css` sets
all 34 of its font sizes through tokens. Others are not: `dashboard-a-v2.css` writes 131 and reads none;
`components.css`, the shared sheet, writes 189 and reads 140.

### 1.5 The primitives, as the pages draw them

Distinct class names per kind of primitive, across the 23 stylesheets:

| Kind                                          | Distinct classes | Stylesheets |
| --------------------------------------------- | ---------------- | ----------- |
| Button                                        | 82               | 17          |
| Chip, pill, badge, tally                      | 131              | 20          |
| Tab strip, segmented control, toggle          | 57               | 12          |
| Card, tile, panel, and their parts            | 198              | 21          |
| Sheet, modal, popover, menu                   | 115              | 12          |
| Field, input, select, search                  | 63               | 16          |
| Row, list item                                | 262              | 20          |
| Avatar, face                                  | 26               | 10          |
| Class families of every kind (by prefix)      | 348              | 23          |

157 rules draw a card, a raised background with a radius, across 19 stylesheets, while the shared `.card`
(`components.css:516-539`) is used by no page. The page code carries 5,370 `className` values in 149 files.

### 1.6 What is already shared

- **Kit-grade CSS in `components.css`:** buttons `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn.danger`,
  `.btn-sm`, `.btn-icon` (:427-483; 374 uses in 66 files); `.input` (:485-514); the one-badge shapes `.pill`,
  `.chip`, `.tally`, `.mark` (:541-644); `.live-dot` (:646-667); `.avatar` (:669-702); `.stat-strip` (:933-983);
  `.empty` (:1845-1872); the menu `.more-*` (:1762-1821); `.confirm`; `.field-error`; the toast `.pp-toast`
  (:1886-1929); the tooltip `.ui-tip` (:2019-2031); the tab strip `.stabs` (:2033-2068).
- **Shared components in `legacy/components/data-bits.jsx`:** `MoreMenu` (:107, 15 pages), `usePPToast` (:203, 24),
  `StatePill` (:994, 21), `Confirm` (:1028, 23), `EmptyState` (:1078, 19), `FailedRead` (:1123, 32), `FieldError`
  (:1153, 15), `PolicyChip`; the gestures `touchSwipe`, `leaving`, `holdStill`, `routeDoor`; role gating `gate` (44
  files) and `canDo` (27); the `[data-tip]` tooltip (:1177).
- **`Icon`** (`legacy/components/icons.jsx:4`): 77 glyphs, 61 in use, 468 uses in 61 pages.
- **The record kit** (`legacy/components/record-*.jsx`, `legacy/styles/record.css`): `RecordSheet`, `RecordFold`,
  `RecordField`, `RecordBox`, `RecordSwitch`, `RecordToggleGroup`, `RecordCombobox`, `RecordRow`, `RecordChips`,
  `useUnsavedWork`; used in 24 files (the Business tab, Settings, the person page, the first run, the deal and step
  sheets, the Pipeline's new proposal, the playbook composer, the reach-out sheet).
- **The charts kit** (`legacy/components/chart-*.jsx`, `legacy/styles/charts.css`): a `config` names each series once,
  `ChartCard` publishes it as CSS variables and draws the legend, the Chart/Table switch, the table twin and its CSV;
  plain SVG measured at its width; one tab stop per chart. Used by Reports and one Ask card. **This is the house
  template for the kit.**
- **Shared pieces defined inside pages:** `people.jsx` (`PeopleBulkBar`, `PeoplePhoneBar`, `PhoneSheet`,
  `PeopleScopeTabs`, `RailSection`/`RailRow`/`RailEmpty`, `plFace`, `plRowCard`, `usePeople`, `usePlControls`),
  `people-table.jsx`, `clients-bits.jsx` (`ChannelGlyph`, `BucketPill`, …), `thread-pane.jsx`, `attention-bits.jsx`
  (`AttnRow`), `leads-cells.jsx` (`LeadTile`, `LeadCallMenu`), `business-tab-gestures.jsx` (wrappers over the record
  kit).

### 1.7 Where the same thing is built more than once

Fourteen families, each file by file in Appendix A. The shortest version:

- **Segmented controls:** nine implementations, from `.rec-seg` and `.ck-seg` to `.fleet-filter` and `.setup-fw-seg`.
- **Switches:** three (`.rec-switch`, Settings' `.set-switch`, the top bar's `.tbn-alert-switch`).
- **Sheets and modals:** the record sheet, a phone sheet hand-built four times, the broadcast sheet, `.ask-modal` in
  three files, two peeks, the finder's panel.
- **Menus and popovers:** `MoreMenu`, its markup re-typed four times, and five other popovers.
- **Pickers:** `DsSelect`, `PbTok`, `RecordCombobox`, `CmPicker`, `TemplateChips`.
- **Faces:** `.avatar` has one user; thirteen other face classes draw initials.
- **Empty states:** `EmptyState`, beside eleven page-made ones and two that are defined and unused.
- **State pills outside `StatePill`:** six, plus hand-written `pill pill-*` in seven pages.
- **Name chips:** the house `.chip` in nine files; fourteen page chips beside it.
- **Tabs:** `SurfaceTabs`, re-typed by hand in `PeopleScopeTabs` and Settings.
- **Cards:** eight card classes; the house `.card` unused.
- **Close and back buttons:** `.btn-icon`, beside eleven others.
- **Meters:** six.
- **Tooltips:** the `[data-tip]` tooltip (62 uses), three others, and 264 native `title=` attributes.

Two leaks run the other way. `Confirm`, `EmptyState` and `FailedRead` style their links with `.cl-bucket-link`, a
People class (`legacy/styles/clients.css:744`). And several badges still break the one-badge rules: 9.5px uppercase
tags and "Needs you" in the accent (Appendix A, item 8).

### 1.8 The machinery that will hold the kit

- **Ratchets.** A measure is a `MEASURES` entry `{ name, file, measure, advice, mode? }`
  (`tooling/scripts/tests/_measures.mjs:69-164`) whose `measure()` returns a keyed map, usually per file
  (`perFile`, :65-67). `repo/code-health-ratchets.test.mjs:26` turns each into two tests, nothing got worse and the
  baseline is not stale. Baselines live in `tooling/scripts/tests/baselines/`. `UPDATE_BASELINES=1` banks only falls;
  `UPDATE_BASELINES=raise` seeds a measure or raises one, and a raise needs its row under "Rises" in
  `docs/debt.md`. A measure without a row in the register fails (`repo/debt-register.test.mjs:114-119`).
- **The syntax-tree rule.** "Measure the syntax tree, never the text" (`CLAUDE.md`). `_ast.mjs` parses TypeScript
  only; the repository declares no CSS parser (postcss and lightningcss are in the lockfile only as Next's own).
- **The one stylesheet lint today:** `tooling/scripts/tests/shell/layout-measure.test.mjs` refuses a literal
  720, 1160 or 1480px width in any legacy stylesheet (:60-75): the precedent for refusing a value that has a token.
- **Lint.** Layers are `no-restricted-imports` groups (`eslint.config.mjs:63-118`, applied at :239 and :317-334);
  the only `no-restricted-syntax` is the edge's `process.env` (:232-238); `LIMITED_TREES` (:137-170) makes the size
  limits errors; `repo/lint-boundaries.test.mjs:56-126` proves each rule with probe snippets.
- **Tree shape.** One more source module directly in `legacy/pages` (75) or `legacy/components` (24) fails
  (`_measures.mjs:94-107`); stylesheets are not counted. The `repo/` test folder is at its 20-module limit, so new
  test files go elsewhere.
- **The window measures.** A new `window.__*` name fails (`_measures.mjs:108-118`, set mode); publishers are counted
  per file (:119-124). 0015 uses both to measure the shell's exit.
- **The docs.** `tooling/scripts/tests/docs/docs-paths.test.mjs` checks that every path in `CLAUDE.md`'s
  canonical-example table and "Where new code goes" exists; "What not to introduce" is prose no test reads.

### 1.9 In flight

- **#1205** settles 0015: decided, not built. The address moves first, once no open pull request holds a page that
  reads its own `#/` address; the Reach out program holds the Leads page. Then Reports, then one surface at a time.
- **#1278** splits the bridge's seam, `surface-data.ts`, into twelve modules, one per surface: the seam 0015's
  `useSurface` will read.
- **The Road to Ten, phase 1** (local branches): one TypeScript compiler, a strict base, the naming rules. The kit's
  TypeScript compiles under the result. Its first step landed on 28 September as #1279: every path the docs' maps
  name must open, and `docs/architecture.md` draws the tree a new folder changes.
- **#1230** lints the markup for accessibility; **#1227** reports each page load's speed.
- **Programs that hold pages:** Reach out (Leads and the reach-out sheets), Ask Rewired (Ask), the file splitter
  (`answerInbound`, `surface-data.ts`).
- **The phone app** already draws its native tabs in iOS 26's Liquid Glass (`apps/mobile/src/app/(tabs)/_layout.tsx:2`).

---

## 2. The contract

### 2.1 Seven rules

1. **A value is a token.** A colour, type size, radius, shadow, blur or duration is declared once, in the tokens. A
   rule reads a token; it never writes a number a look might change. Layout lengths (widths, gaps, grid tracks) stay
   with the page.
2. **A look is a set of token values.** Two settings on `<html>`: `data-theme`, the mode (light or dark, as today),
   and `data-look`, the finish (classic or glass, new). A new look is one block in the tokens; a tweak is one token.
3. **A primitive is written once, in the kit.** Button, switch, segmented control, pill, chip, count, mark, panel,
   field, select, menu, sheet, row, face, meter, empty state, toast and tooltip. A page composes them and never
   declares its own.
4. **The kit reads only tokens; a page declares only layout.** A page stylesheet places things (display, grid, flex,
   gap, position, size, overflow). What they look like is the kit's.
5. **Variants are props.** A new need becomes a variant in the kit, with its entry in the gallery, never a class in a
   page.
6. **A restructure proves it changed nothing:** by value for a move (0015), by computed style for CSS (§3.5).
7. **The build holds it.** Each rule is a measure that may only fall, or a lint error, from the step that makes it
   true.

### 2.2 The layers

```text
tokens.css                   scales · roles · modes · looks          a look is edited here
src/surfaces/kit/kit.css     the primitives, reading roles only      a component is styled here
src/surfaces/kit/*/*.tsx     the React components, for TSX pages     a component's markup lives here, a folder each
legacy pages                 the kit's class names, until they move
a surface's own stylesheet   layout only
```

### 2.3 Why not Tailwind and shadcn/ui themselves

- **It is a rewrite.** Every one of the 5,370 `className` values and every stylesheet would change at once, and
  nothing could prove the result draws what the old page drew: 0015's proof compares element trees, and utility
  classes change every tree.
- **It adds dependencies the repository already has the answer to:** tailwindcss, the Radix packages,
  class-variance-authority, tailwind-merge and an icon set, against tokens, a menu, a sheet, a tooltip, 77 icons
  and a chart kit already in shadcn's shape.
- **The legacy pages cannot import a component** until 0015 moves them. A CSS class reaches them today.
- **What shadcn gives is what §3 builds:** owned components, semantic variables and variants. Radix's accessible
  primitives are the strongest argument for it. This bullet first answered that the kit keeps the house's own focus,
  escape and keyboard rules (`RecordSheet`'s focus return, `MoreMenu`'s escape, `trapTab`), which are already tested.
  On 29 September Ruben took the other road for behaviour alone (decision 15): the kit's interactive components are
  built on Base UI (`@base-ui/react`), a library of unstyled accessible parts, and each hand-written behaviour is
  deleted as its Base UI version lands. The rest of this answer stands: Base UI draws no CSS, so its parts wear the
  kit's classes, and no page's class changes.

---

## 3. The architecture

### 3.1 Tokens in three tiers, and two settings

- **Tier 1, scales.** Unchanged in meaning: the palette, type, space, radius, shadow and motion. New: a blur scale and
  a saturation step for glass; and `--radius-circle` (50%, a circle whatever the box), which step 2.2 brought with the
  face, its first reader. A blur role's Classic value is `none`, read through `var()` so the build cannot drop it: the
  build drops `backdrop-filter: none` written beside its prefixed twin (#929). `blur(0)` is not `none`: any value but
  `none` makes its element a containing block for its fixed children and a stacking context (Phase 6's review, 29
  September, in the harness's Chromium).
- **Tier 2, roles.** New: what a thing is for, set by a look.
  - Surfaces: `--surface-page` (the backdrop), `--surface-pane` (a content panel: a list, a peek, a composer),
    `--surface-control` (the control layer: sidebar, top bar, tab bar, capsules), `--surface-inset` (a row, a field,
    a card inside a pane), `--surface-pop` (menus, popovers, toasts; always opaque), `--surface-scrim` (the page
    faded behind a desk's side sheet), and `--surface-scrim-modal` (the ink's wash behind what takes a phone's screen,
    a sheet from its bottom edge), which step 2.2 brought with the sheet, its first reader.
  - Each surface's `-fill`, `-blur`, `-edge` (hairline or rim), `-depth` (shadow) and `-radius`.
  - Controls: `--control-h-sm/md/lg`, `--control-radius`, `--control-radius-sm` (a small control's, step 1.4),
    `--chip-h`, `--chip-radius`, `--selected-fill` (the picked segment).
  - Actions: `--primary-fill`, `--primary-ink`, `--primary-hover`, `--secondary-fill`, `--quiet-ink`.
  - The existing roles stay (`--bg-*`, `--ink*`, `--line*`, the statuses, the accent). In Classic the new roles are
    defined from them, so today's rules keep reading what they read.
  - A role arrives with its first reader (step 1.4). Classic has no blur, no pane depth and no control-layer fill,
    so those roles, and `--control-h-lg`, arrive with the look or the rule that first reads them.
- **Tier 3, component.** Private to `kit.css` (for example `--btn-h: var(--control-h-md)`); never set by a look.
- **The looks.** `:root, [data-theme]` sets tier 2 to today's values, so Classic is today, pixel for pixel (step
  1.4). Every element that stamps a theme is listed, not `:root` alone: a custom property is made where it is set,
  and `.app-root`, `.shared-root` and `.fr-shell` each stamp their own theme, so a role made on the root alone
  would keep the root's colours inside a root of the other theme. Those roots stamp `data-look` too (step 1.6).
  `[data-look="glass"]` sets tier 2 to the canvases' values (Appendix B), with
  `[data-look="glass"][data-theme="dark"]` for its dark side, written after Classic's block so it wins at every
  root that carries both. A third look later is one more block.
- **Material rules.** The glass rim is a masked gradient on a pseudo-element, never an extra element in the markup.
  `@supports not (backdrop-filter: blur(1px))` and `prefers-reduced-transparency: reduce` fall back to opaque fills.
  Reduced motion keeps its rule. Safari matches no `prefers-reduced-transparency`, so an iPhone with Reduce
  Transparency on keeps the glass: a platform limit, which the real-phone check before step 5.5 looks at (§6).
- **What does not change.** The five non-CSS readers of the theme (§1.3) keep reading `data-theme`. The mascot reads
  tokens, so it is checked against glass surfaces in Phase 5.

### 3.2 The look travels as the theme does

The same path as §1.3, step for step (the theme's own implementation is the canonical example):

1. `packages/contracts/src/shell/chrome.ts`: `LookPref`, `LOOK_OPTIONS`, `isLookPref`, `DEFAULT_LOOK_PREF` (classic),
   `lookPrefOf`, and a flag that says whether the look is offered to members yet; `themeBootScript` reads `.look` from
   the same stored object and sets `data-look` before first paint. Exported from `shell/index.ts`; the committed
   `dist` rebuilt.
2. `apps/dashboard/app/layout.tsx:61`: a default `data-look` on `<html>`.
3. `LegacyApp.tsx`: the preference in `Prefs`, its default and `loadPrefs` (keeping the pinned text at :276), an effect
   beside :350-353 that stamps it, and the props at :297-305 and :476-484.
4. `legacy-bridge/shell.ts`: the look's words in the chrome's words.
5. `legacy/pages/app-shell.jsx`: the props, and the stamp on `.app-root` beside `data-theme` (:509).
6. `legacy/components/sidebar.jsx`: a "Look" segment under "Theme" in the account menu (:296-303), shown only while
   the flag is on.
7. Tests: `theme-boot.test.mjs` (both attributes set before paint, every stored value), `chrome.test.mjs` (its pins),
   `shell-status.test.mjs`, `e2e/sidebar.spec.ts`.
8. Later and optional: the phone app's bridge message, if its native chrome should follow the look.

No table, route or migration: the theme's reason applies to the finish. Decision 3 asks whether the look should follow
the account instead; that path is `profiles` (`supabase/migrations/00068_profiles.sql`), its door `profile_set` and
`PUT /api/v1/me` (`apps/dashboard/app/api/v1/me/route.ts:10-26`, `tooling/scripts/tests/route-policy.json:782-788`),
with a migration.

The rollout is two constants: the flag turns the menu entry on (step 5.5), and `DEFAULT_LOOK_PREF` becomes glass
(step 5.6). A member who picked Classic keeps it.

### 3.3 The stylesheets: order, boundaries, one breakpoint

- **Order.** `tokens.css` (scales, roles, modes, looks), then `kit.css`, then `components.css` (the frame's own chrome
  and the page sections that still share it, until each moves), then one sheet per surface, then `mobile.css` and
  `ask.css`, as today. The shell's entry, `legacy-bridge/legacy.css`, imports the kit; `app/globals.css`, the entry of
  the pages outside the shell, imports it in the change that first draws a kit class on one of them. None does yet,
  so none of them waits on the kit's CSS to paint.
- **No cascade layers in this program.** The kit's selectors are single classes, and a page that needs something
  different asks the kit for a variant. Layers would re-rank 19,700 lines of existing rules at once. Revisit when the
  page sheets hold layout only.
- **One phone breakpoint.** People and the Pipeline switch at 900px; the record kit at 760px
  (`legacy/components/record-fold.jsx:422`), so between 761 and 900px a phone picker opens a desk sheet. The kit takes
  900px, and a test holds every `@media` in `kit.css` to it. This is the frontend plan's "one set of breakpoints, as
  tokens", for the kit.
- **Per route after a move.** When 0015 moves a surface, its sheet is imported by its route, the App Router splits the
  CSS per route, and the bundle budget falls ("route-level splitting comes with 0015's App Router routes",
  `docs/debt.md`).

### 3.4 The kit

- **Where.** `apps/dashboard/src/surfaces/kit/`, the folder 0015 names for "the shared components, each moved once by
  the first surface that draws it". Its stylesheet is `kit/kit.css`; its helpers `kit/variants.ts` (a `cx()` that
  joins class names and a `variants()` that maps props to classes, about twenty lines, no dependency); its index
  names each export (no `export *`).
- **Names.** The kit keeps the house's names where one exists and is in use (`.btn*`, `.pill*`, `.chip*`, `.tally*`,
  `.mark`, `.avatar*`, `.empty*`, `.more-*`, `.confirm*`, `.field-error`, `.pp-toast*`, `.ui-tip`, `.stabs*`, and the
  record kit's `.rec-*`), so 374 button uses do not change. Their rules move from `components.css` and `record.css`
  into `kit.css`. A new primitive takes a short name in the same style, one no stylesheet uses yet. The list lives in
  `kit/classes.json`; the measures read it (decision 4).
- **The React side.** One module per component: typed props, `variant`, `size` and `tone` as unions, `className`
  accepted for layout only, refs forwarded, and a door is a link (the `routeDoor` rule: a thing with a page of its own
  is an `<a>`). A component renders the kit's classes, so a legacy page and a moved page draw the same markup.
- **Behaviour.** A component with behaviour of its own (the menu and the popover, the sheet and the dialog, the select
  and the combobox, the tooltip, the toast, the switch, the tabs and the segmented control, the field) is built on
  Base UI's unstyled part (decision 15, step 2.5). Base UI holds focus, Escape, the keyboard, the page behind and what
  a screen reader is told; the kit's classes draw it. One exact version is pinned, and each component imports its own
  part (`@base-ui/react/dialog`), never the package's index.
- **How the legacy shell reaches it.** Through the classes, today. A React component reaches a legacy page only when
  0015 moves it with its first surface; then `legacy-bridge/seed-globals.ts` publishes it under its old name, and the
  site moves from the JSX file to the bridge, so the publishers count does not rise (0015, "What is shared moves
  once"). The kit never adds a window name: the globals measure refuses one.
- **Tested** as 0015 tests a moved surface: imported and drawn on the stub React the page tests use.

**The components, and what each replaces:**

| Kit component                                              | Replaces                                                                                                        |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Button: primary, secondary, quiet, danger · sm, md · icon | the `.btn` family; 82 button classes; eleven close and back buttons                                             |
| Link button: words that act · danger                       | `.cl-bucket-link` (86 sites in 26 files), which Confirm's No and EmptyState's and FailedRead's acts draw        |
| Switch                                                     | `.rec-switch`, `.set-switch`, `.tbn-alert-switch`                                                               |
| Segmented: tabs, a view switch, a stage                    | nine segmented controls; `.stabs` and `SurfaceTabs`, re-typed twice                                              |
| Pill, chip, count, mark (the one-badge system)             | about 100 page selectors named chip, pill, tag, badge or count; six state pills outside `StatePill`             |
| Panel: pane, inset, pop                                    | 157 card rules; `.fl-card` (39 uses), `.rec-card`, `.ck-card`, `.bc-card`, `.ask-card`, `.ld-card`, `.pipe-card` |
| Field, select, combobox, token                             | `RecordField`, `RecordBox`, `RecordCombobox`, `DsSelect`, `PbTok`, `CmPicker`, `TemplateChips`, `.input`        |
| Menu, popover                                              | `MoreMenu` and four hand copies; five page popovers                                                             |
| Sheet: a side pane on a desk, full screen on a phone       | `RecordSheet`, `PhoneSheet`, the phone sheet built four times, `.bc-sheet`, `.ask-modal`, the two peeks         |
| Row: a face, lines, what trails                            | the phone row's tokens with `plRowCard`, `RailRow`, `AttnRow`, `RecordRow`                                      |
| Face                                                       | `.avatar` and thirteen face classes; the letter marks drawn at inline sizes from 14 to 36px                     |
| Meter                                                      | `SegmentBar`, the reach bar, `TempBar`, `.conf-meter`, `.setup-meter`, the peek's bar                          |
| Empty state, failed read, confirm, field error             | `data-bits.jsx`'s, already one each; eleven page empties; two unused                                           |
| Toast, tooltip                                             | `usePPToast`, the `[data-tip]` tooltip; `RecordTip`, `.ld-tip`, `.ck-tip`                                       |
| Composer: a head, rows, a foot                             | the deal sheet, the step sheet, the playbook composer, the broadcast page, the template form                   |
| Icon                                                       | `icons.jsx`, and the glyphs pages draw for themselves (`LeadShape`, `LD_MARKS`, `AskRing`)                      |
| Charts                                                     | the charts kit, moved under `kit/charts/` unchanged                                                             |

**The gallery.** One page that draws every kit component in every variant, in both modes and both looks. It is served
by the e2e harness (`tooling/scripts/e2e-harness/`, a `kit` scenario) and never in production; `e2e/kit/kit.spec.ts`
opens it and checks that each entry reads its tokens. It is the page a review screenshots and the first place a new
variant appears (decision 7).

### 3.5 The proofs

- **Style equality, for every step that must look the same.** A recorder drives the e2e harness (its `salon`,
  `pipeline` and `nightly` scenarios, and from step 2.3 the `kit` scenario's gallery): each route at 1440 by 900 and 390 by 844, in both modes, walking every element
  and recording its box and a fixed list of computed properties (colour, background, border, radius, shadow, filter,
  backdrop filter, font, line height, letter spacing, opacity). Before equals after, byte for byte. A planted fault
  (one token moved one step) must differ. It is written once as `tooling/scripts/checks/style-equality.mjs` because
  the program uses it in more than twenty pull requests; the recordings stay out of the repository.
- **Equal by value** for moves, as 0015 writes it.
- **The look** (Phase 5): the harness and the gallery shot in both modes, at a desk and a phone width, in the pull
  request; and a check on a real phone of what the blur costs (§7).

### 3.6 How it fits decision 0015

- A move never changes a page's look, and neither does anything else in the same pull request. For each surface, three
  pull requests in this order: **the move** (0015) → **the kit** (the surface's primitives come from the kit and its
  own are deleted) → **the look** (its canvas layout, under Glass only).
- **A moved surface waits in `KIT_PENDING` for its kit step.** The move draws what the JSX drew, raw `<button>`s and
  all, so it adds the surface's folder to `KIT_PENDING` (`eslint.config.mjs`), which lifts the rule on raw elements
  (§3.7, item 4) there and nothing else; the kit step draws the surface's controls with the kit and takes the folder
  out. The function limits stay: `src/surfaces` is in `LIMITED_TREES` from its first file (step 1.7), so a surface
  moves with its functions under the limits. The pilot therefore splits `ReportsSections`
  (`legacy/pages/reports-sections.jsx`, 206 lines and 39 branches on 28 September) before its move or in it.
- The kit's CSS reaches pages before they move, so Phases 1, 2 and the Glass tokens do not wait on 0015. The React
  components arrive with each surface's move.
- A shared component moves with the first surface that draws it and is published under its old name (§3.4).
- A surface is not touched while an open pull request holds its files (0015's rule): today Reach out holds Leads and
  the reach-out sheets, Ask Rewired holds Ask, and #1278 holds `surface-data.ts`.

### 3.7 The measures and the lint

Three measures, built in step 1.1 so that nothing new gets added while the program runs, and a lint rule that arrives
with `src/surfaces` in step 1.7. Each measure is a `MEASURES` entry seeded with `UPDATE_BASELINES=raise`, with its row
in `docs/debt.md`:

1. **`style-values.json`:** per stylesheet, the font sizes, radii, shadows, colours and blurs written as literals.
   Parsed as CSS, not text (decision 8), in a new `tooling/scripts/tests/_css.mjs` beside `_ast.mjs`.
2. **`kit-primitives.json`:** per stylesheet, the classes that draw a primitive (the families of §1.5) declared outside
   `kit.css`, and every page rule that restyles a kit class (`.pl-peek .btn { … }`).
3. **`inline-styles.json`:** per file, `style={…}` props under `src/legacy` and `src/surfaces` (148 today), counted
   with the TypeScript parser.
4. **A lint error in `src/surfaces`:** a raw `<button>`, `<input>`, `<select>`, `<textarea>` or `<dialog>` outside
   `src/surfaces/kit/`, written as JSX (`<button>`, `<motion.button>`) or made from its name (`createElement`, `jsx`,
   `jsxs`, `jsxDEV`) (`no-restricted-syntax`, with the message naming the kit's component), proved by a probe in
   `repo/lint-boundaries.test.mjs`. A surface moved before its kit step is listed in `KIT_PENDING`
   (`eslint.config.mjs`, empty until the first move), and the rule passes over it alone: a pure move under decision
   0015 adds its surface's folder, and that surface's kit step (Phase 4) removes it (§3.6). A test fails an entry
   that names no surface's folder.

Each measure's advice names the kit: "Take the kit's Chip (`src/surfaces/kit/`). If the kit has no variant for this,
add one there with its gallery entry." The style tests live in a new `tooling/scripts/tests/styles/` folder, since
`repo/` is full; `shell/layout-measure.test.mjs` moves there with them.

---

## 4. The phases, step by step

Each step is one pull request, merged the day it opens, dashboard only, shippable in either deploy order. "Proof" is
what the pull request shows; "Done when" is what makes the next step safe.

### What each step waits on from elsewhere

- Steps 1.1 to 1.6 wait on nothing outside this program.
- Step 1.7 creates the folder decision 0015 names, so it waits for 0015 to be decided (#1205). If 0015's pilot lands
  first, step 1.7 builds on the folder the pilot made.
- 0015's lint steps (the effect-hook alias as `use\w+Effect`, `exhaustive-deps` an error under the warnings ceiling,
  `no-undef` over the shell) go before its first move, as 0015 says, which is Phase 3.
- The kit's TypeScript compiles under the compiler main has. The Road to Ten's single compiler covers it with
  everything else when it lands.

### Phase 1 · The foundation (nothing a member can see)

**1.1 The counts hold.** The CSS parser as a root devDependency pinned to the lockfile's version; `_css.mjs`; the
three measures of §3.7; their rows in `docs/debt.md`; fixture tests in `tests/styles/`.
_Proof:_ each counter's fixtures, including a stylesheet that should count zero; the register block redrawn. _Done
when:_ a new chip class or raw font size in any stylesheet is a red build with advice.

**1.2 The proof tool.** `tooling/scripts/checks/style-equality.mjs` (§3.5), with its self-test: a recording against
itself is equal, and a planted token change is not. A section in `docs/runbook.md`, "Prove a style change".
_Proof:_ the self-test. _Done when:_ one command records and compares.

**1.3 Dead and leaking styles go.** The shared classes no page uses (`.card` and its parts, `.page-head`,
`.placeholder`, `.ac-empty`, `.ghost-row`, `.ghost-tag`; each checked by search before it goes); `Confirm`,
`EmptyState` and `FailedRead` stop borrowing `.cl-bucket-link` and read a kit class of their own; stale comments fixed
(`settings.jsx:1903` on `SetToggle`'s users, `leads-cells.jsx:63-74` citing an old line of `icons.jsx`). _Proof:_
style equality, zero differences. _Done when:_ no shared rule reaches into a page's stylesheet.

**1.4 Roles, and Classic.** The tier 2 roles of §3.1 in `tokens.css`, set to today's values; the kit-grade rules
(buttons, badges, faces, empty states, the menu, confirm, the toast, the tooltip, the tab strip, the record kit) read
roles wherever the value is identical. _Proof:_ style equality. _Done when:_ changing one role changes every button.

**1.5 Every literal that equals a token becomes the token.** A codemod: 412 font sizes, 192 radii, and the shadows
equal to `--shadow-*`. Nothing moves by construction. _Proof:_ style equality; `style-values.json` falls by about
600. _Done when:_ what is left is off the scale, and falls in Phase 4.

**1.6 The look setting.** `data-look` travels as the theme does (§3.2), classic by default, not offered yet.
_Proof:_ `theme-boot.test.mjs` extended (both attributes before paint, every stored value), the chrome pins, the e2e
sidebar spec; style equality. _Done when:_ `[data-look="glass"]` in a stylesheet would reach every page at once.

**1.7 The kit's home.** `apps/dashboard/src/surfaces/` and `src/surfaces/kit/` join the dashboard's TypeScript lint
block, the browser layer and `LIMITED_TREES` (`eslint.config.mjs:281-295, 317-328, 137-170`), with the rule on raw
elements (§3.7, item 4), each with its probe;
`kit/variants.ts`; `kit/kit.css`, imported by both entry files right after the tokens; `kit/classes.json`; the docs
tree redrawn with `UPDATE_BASELINES=1`. 0015's pilot also creates `src/surfaces/`: whichever lands first creates it.
_Proof:_ the probes; style equality. _Done when:_ a TSX component can be written, linted and tested in the kit.

### Phase 2 · The kit, complete and identical (nothing a member can see)

Phase 2 ships as one pull request, 2.1 to 2.4 together, each step a commit or a few in it: on 28 September Ruben asked
for one push per big batch, since every push runs Actions and two Vercel builds. The steps below keep their order and
their proofs.

**2.1 The kit-grade CSS moves into the kit.** From `components.css`: buttons (:427-483), the input (:485-514), the
badge shapes (:541-644), the live dot, faces (:669-702), empty states (:1845-1872), the menu (:1762-1821), confirm, the
field error, the toast (:1886-1929), the tooltip (:2019-2031), the tab strip (:2033-2068). From `record.css`: fields,
the switch, the toggle group, the combobox, the sheet, the fold, the row, chips. Each class joins `classes.json`. The
kit leaves `app/globals.css`, which 1.7 had import it too: no page outside the shell draws a kit class (§3.3).
_Proof:_ style equality. _Done when:_ `components.css` holds no kit rule but at a width the kit does not take yet (the
tab strip's 720px, the record kit's 760px, which Phase 4 takes to 900px), and names a kit class otherwise only beside a
page's, in a rule the two share (the press, the role gate, how things come and go, reduced motion). What it keeps is
the frame and the page sections that still share it, among them Campaigns, Agent Studio, the thread's attachments, the
message preview, the day agenda, the KPI and stat strips, `.cl-bucket-link`, `.card`, `.glyph`, `.tbl`,
`.section-head`, `.agent-rail`, `.soon`, `.dec`, `.rp-share-link`, "why it said that" and `.ix-steer`, which leave
with their surfaces in Phase 4.

**2.2 The missing primitives, in CSS.** Each reproduces the most-used existing variant exactly, so a page that adopts
it in Phase 4 does not move: the switch (from `.rec-switch`), the segmented control (from `.rec-seg`), the panel's
three surfaces (from the most common card rule), the row (from the phone row's tokens), the sheet (the record sheet
on a desk, the phone sheet under 900px), the meter (from `SegmentBar`), the face (the phone row's 32px face), the
composer chassis (head, rows, foot, from the record sheet); and beside the panel the quiet link button (`.link-btn` and
its danger form, from `.cl-bucket-link`), which this list did not name and 2.2 took (§8, decision 14). No page uses
them yet. It comes after 2.3, whose gallery is its proof, and waits on the gallery rather than on 2.1: it adds rules
and moves none. Planned as four pull requests of a day each, where every other step is one: the panel; the face with
the list row; the meter; the sheet. They went out in Phase 2's one pull request, as its commits (above). The switch,
the segmented control and the composer chassis are the record kit's rules, which 2.1 moves, so 2.2 writes none of
them. _Proof:_ the gallery; style equality on the pages. _Done when:_ every component of §3.4 has its rule in
`kit.css`, the kit's, to which a page moves in Phase 4. Until then four stand beside the house's rule each
reproduces, and one of each pair leaves at the Phase 4 step that moves its pages: `.rec-sheet` for `.sheet` (with
PhoneSheet's `.sb-sheet`, outside the kit) and `.rec-card-tip`'s surface for the panel's pop, at the People step
(0015 step 5), where the record kit moves; `.confirm-block`'s surface for the panel's inset, at the Inbox step (0015
step 3), where Confirm moves (the tip card and Confirm's block keep only their own column, width and entrance); and
`.avatar` for `.face`, with a solid tone, at the Settings step (0015 step 11) and the frame's (step 13), where its
three sites are.

**2.3 The gallery.** The harness's `kit` scenario and `e2e/kit/kit.spec.ts` (§3.4). It goes before 2.2, whose proof it is,
and needs only 1.7; 2.1 can run beside it, and has a page that draws every class it moves once it lands. _Proof:_ the
spec. _Done when:_ every class in `classes.json` has an entry, which the spec checks, and a node test holds in CI.

**2.4 The React components for the new primitives.** Typed, rendering the kit's classes, tested on the stub React.
Where a component already exists in JSX (`StatePill`, `MoreMenu`, `EmptyState`, the record kit), its TSX is written
when its first surface moves (Phase 3), as a move, so it is never written twice. Built: `Button` and `LinkButton`
(each a link where it has an address, `press.tsx`), `Panel`, `Face`, `ListRow` (a link too) and `Meter`, each with
its props' type, named in the kit's index, and its type test; and
`tooling/scripts/tests/styles/kit-components.test.mjs`, which holds every entry of their gallery families to what they
draw, element for element: the tag, the classes and the attributes a stylesheet or a screen reader reads. So an entry
or a component changed alone in any of those is red, and the gallery and the components cannot part. The Sheet
waited on Ruben's decision whether the kit builds its interactive components on Base UI (`@base-ui/react`), since its
behaviour (focus held inside, Escape, the page behind still) is what that decision settles. He took it on 29
September (decision 15), so the Sheet is 2.5's, with every component that has behaviour of its own. _Proof:_ the
tests. _Done when:_ a moved surface can import every primitive that has no behaviour of its own.

**2.5 The interactive components, on Base UI.** Decision 15, as one pull request of its own after Phase 2's: the menu
and the popover, the sheet and the dialog (a side pane on a desk, full screen on a phone), the select and the
combobox, the tooltip, the toast, the switch, the tabs and the segmented control, and the field. Each is Base UI's
part wearing the kit's classes, typed as 2.4's are, named in the kit's index, with its type test, and drawn in the
gallery in its states. Base UI's exact version is pinned in the dashboard's `package.json`, and each component imports
its own part. The kit first takes a folder per family, as Phase 3 says it will, since these components would take it
past the 20 modules a directory may hold. No page draws one yet: each replaces house JSX (`RecordSheet`,
`PhoneSheet`, `MoreMenu`, `RecordCombobox`, `DsSelect`, `CmPicker`, `usePPToast`, `RecordTip`, `SetToggle`,
`SurfaceTabs`) at its surface's Phase 4 step, which deletes the hand-written behaviour in the same change. _Proof:_
the tests, the gallery spec, and each component's behaviour driven in a browser: Escape closes a sheet, a menu or a
popover and returns focus to what opened it, Tab stays inside a modal sheet, the page behind it does not scroll, a
menu's arrows move and its typeahead finds, a switch and a tab answer Space and the arrows. _Done when:_ a moved
surface can import every primitive of §3.4 that has behaviour of its own; the tabs are not built (a door is a link), and
Confirm, the token, the composer's foot and the Icon come into the kit with the surface that first draws them (Phase 3).

Built on 29 September. The kit took a folder per family first, as a pure move: `kit/button/`, `kit/link-button/`,
`kit/panel/`, `kit/face/`, `kit/list-row/` and `kit/meter/`, each with its type test, while `index.ts`, `variants.ts`,
`press.tsx`, `kit.css` and its registry stay at the root. Then Base UI 1.8.0, pinned exactly in the dashboard's
`package.json` (its peers are React 17, 18 or 19; MIT; nothing in its tree runs at install), which
`tooling/scripts/tests/styles/kit-base-ui.test.mjs` holds; the lint refuses the package's index anywhere in the
dashboard (`BASE_UI_INDEX` in `eslint.config.mjs`, with its probe). Then ten components, each in its family's folder
with its type test and named in the index: `Sheet` on Dialog, modal; `Menu` on Menu; `Popover` on Popover; `Select` on
Select; `Combobox` on Combobox; `Tooltip` on Tooltip; `useToast` on Toast, raised by usePPToast's `flash` and timed by
contracts' `toastShape`; `Switch` on Switch; `Segmented` on RadioGroup and Radio; and `Field` on Field. A state Base UI
marks is drawn by the kit's own where it has one (`data-leaving` for a sheet closing, `.show` for a tip, `data-chosen`
for the option chosen, `hidden` for a list nothing matches); kit.css took the few rules the rest needs, reading no
literal (the positioners' layers, `.pop-place` and `.tip-place`, with the menu and the tip in flow on them; a menu item
that is a link; the option walked to, `[data-highlighted]`; the floating list, `.rec-combo-pop`; the select's box,
`.rec-select`), so `kit.css?v=12`. Each popup goes through Base UI's portal to the body, where no Glass pane or bar
holds it. Two things differ from the step as written. The tabs were not built: `.stabs` stays a strip of links when
`SurfaceTabs` moves, since each of its views changes the address and a door is a link. And the sheet is `.sheet` as step
2.2 drew it: a side pane on a desk and, on a phone, a sheet that rises from the bottom with its handle, not a full
screen.

The gallery draws each in its states, in ten families "on Base UI" after the others, and the harness runs them on a
page of their own, `/behaves`: an esbuild bundle (esbuild 0.28.2, pinned in `tooling/scripts`) of
`tooling/scripts/e2e-harness/kit-behaves-entries.tsx`, which draws the gallery's entries with the components
themselves on the dashboard's React 19. _Proof:_ `e2e/kit/kit-behaves.spec.ts`, at a desk and on a phone, in both
themes and both looks: Escape closes the sheet, a menu and the popover and gives focus back to what opened each; Tab
stays in the sheet, and the page behind it does not scroll; a menu's arrows walk it and typing finds; a switch answers
Space and the segmented control the arrows; the combobox narrows, draws no list where nothing matches, chooses by the
keys, and a search after a choice replaces the words chosen; the tooltip shows on hover and on focus and hides on
Escape; a toast arrives in a region a screen reader hears and goes on its ×; a field's problem reaches its box's
`aria-describedby` and `aria-invalid`. It holds what each draws, state by state, element for element, to its gallery
entry, so Base UI's markup is held where it is drawn, in a browser; and in Glass it finds every popup on the body,
under no blur, by its control. Each check is shown to fail on a fault planted in the page (one fault for a check, not one
for every line of it). A menu's items are chosen by Enter and by a press, one that opens a page is a link, one of a set
is chosen and marked, and a press outside closes the menu; the popover stays for a press inside and closes for one
outside; the select is walked and chosen from by the keys and by a press; the sheet closes for its Close and for a press
on its wash and gives focus back; and the sheet, an option with a sentence and a select in its field are named and
described as the browser resolves it. No CI job runs the browser specs, so the harness page is compiled by the
dashboard's `tsc` (a props change an entry no longer meets fails typecheck), and a Base UI bump's pull request shows both
specs' runs. In `corepack pnpm test`,
`tooling/scripts/tests/styles/kit-behaves.test.mjs` holds the running page's entries to the gallery's one for one, what
a server draws of the switch, the segmented control and the field to their entries, and one React and one Base UI, at
the pinned version, in the bundle; `kit-components.test.mjs` keeps holding 2.4's six. `kit.spec.ts` draws every rule
kit.css took. The day's counts, on the tree as the step left it (29 September, Base UI 1.8.0). The kit's measures did not move:
kit.css read no literal and drew no class a page's stylesheet names, so the register counts what it did before, 1,093
literal style values in 22 stylesheets, 2,169 selectors naming 864 primitive classes outside the kit and 274 style props
in 47 files (`docs/debt.md`, "The numbers"), and the only lines the step wrote in a baseline are the meter's own style
prop, under its family's folder, and the CSS budget. The registry lists 182 classes (178 before: `pop-place`, `rec-combo-pop`,
`rec-select` and `tip-place`) and 11 modifiers, kit.css 408 rules and 448 selectors, all drawn by the gallery, whose
families went from 27 to 37. The kit's root holds 6 modules (18 before) and 16 folders of two, each a component and its
type test. The workspace route's JS is 999,034 bytes gzipped on this tree and on its base, byte for byte, with no Base
UI in what the build wrote; its CSS rose 112 bytes (133,798 to 133,910), which the budget is raised by, argued in
`docs/debt.md` under "Rises". `corepack pnpm test` ran 7,458 tests, 6,865 passing and the rest the database's, skipped
without credentials; the gallery spec ran 13 tests and the behaviour spec 7 (13 states held to their entries, and 17
checks in each of 8 runs) on the harness's `kit` record.

What each swap will do differently from the house's, for its Phase 4 step to list (decision 15, its fourth
condition):

- `RecordSheet`, `PhoneSheet`, the deal and step sheets become `Sheet`. It is drawn in a portal on the body, not in
  `.app-root`, so People's row keys, which hold still for a dialog in `.app-root` (`PL_OVERLAY`), must find it there.
  It says no `aria-modal`: Base UI makes the page behind inert and hidden from a screen reader instead. The fold's foot
  (`onSave`, `saving`, the ask) is the page's `foot`, and there is no Back (`onBack`). Base UI's focus guards wrap
  Tab; focus that went with what held it (an Undo gone with its row) goes to the sheet, not back to the field the
  person was in, and `focusOn` has no counterpart yet. Escape and a press on the wash ask `onClose`, which a page with
  a save out refuses, since the sheet is controlled; Ctrl or Cmd with Enter does not save. On a phone there is no pull
  down to close: Base UI's Drawer has one, and the People step is where Ruben chooses between them.
- `MoreMenu` becomes `Menu`: on a positioner in a portal, not in `.more-wrap` over a `.more-backdrop`; its items in
  groups (`.more-header` names one, `.more-divider` stands between two); an item that opens a page is a link; a set is
  radio items in a radio group; no gate on the trigger or an item yet. The arrows walk it and typing finds (the house's
  had neither); Escape closes it and gives focus back to the trigger, and so does a press outside. The page behind
  holds still while it is open (Base UI's menu is modal), where the house's scrolled under it or, placed against the
  window (`escape`), closed as it scrolled; Base UI places it and turns it over where there is no room, so `moreFit`
  goes.
- `usePPToast` becomes `useToast`: the stack is a region a screen reader hears, each toast in it a dialog (a failure an
  alert dialog, announced by Base UI's own hidden alert), where each of the house's was a status or an alert; no
  `links` or `icon`, but one `action` and the tone's glyph. A fourth toast waits behind the three until one goes, where
  the house's dropped the oldest; F6 takes focus to the stack; a swipe dismisses one; the clock stops for the whole
  stack while the pointer or focus is on it.
- `RecordCombobox` becomes `Combobox`: its list pops over the page on the panel's pop, where the house's pushed the rows
  under it; `aria-selected` marks the option chosen and `data-highlighted` the one walked to (the house's
  `aria-selected` marked the one walked to); with nothing matching, the box stays expanded over a hidden list, where the
  house's collapsed. Typing matches an option's words only. Focus, or a press that opens the list, selects the words
  chosen, as the house's did, but a search typed straight after a choice, with the box still focused, joins them,
  where the house's searched what was typed into them. Not taken yet: `typed` and `onLeave` (the Business tab's
  languages), `also` and an option's value (the timezone's box), `onKeyDown`, `gate`.
- `DsSelect`, a native select, becomes `Select`: a button that says the one chosen, with the page's chevron, and Base
  UI's listbox on the panel's pop, where the house's was the platform's own, on a phone too; the page behind holds
  still while the list is open; read-only while a save is out, where the house's said `aria-disabled`. `CmPicker`'s
  groups, faces, notes and status are the Campaigns step's to add to the kit's Select or Combobox.
- `RecordTip` and `[data-tip]` become `Tooltip`: one tip per trigger, in a portal, with no role (the house's one
  `.ui-tip` said `role="tooltip"`), so words a person must hear stay the mark's name or description, as RecordTip's
  are. On hover after 280 ms and on focus, and gone on Escape, as the house's; never on touch (Base UI's rule), where
  the house's showed at a press, and a gate's reason shown on a press (`window.__tip.show`) has no counterpart: a mark
  whose words matter takes the Popover at the frame's step. Moving from one tip to the next waits again, where the
  house's showed the next at once (Base UI's `Tooltip.Provider` does that).
- `SetToggle` and `RecordSwitch` become `Switch`: `.rec-switch` (Settings' `.set-switch` goes), with Base UI's hidden
  checkbox beside it, for a form; read-only is `aria-readonly`, where the house's said `aria-disabled`.
- `RecordToggleGroup` becomes `Segmented`: the same radio group of buttons, with Base UI's hidden radio beside each;
  the arrows choose and wrap, as the house's; Home and End do nothing (Base UI's radio group has neither; the house's
  went to the ends).
- `RecordField` and `FieldError` become `Field`: the same label, box, unit, hint and `.field-error`, with Base UI's ids
  (the house's `rec-<id>-problem`); the page's `problem` is shown as it is, and Base UI's own validation goes unused.
  `RecordBox`, a box in a row named by `aria-label`, has no counterpart yet.
- `SurfaceTabs` takes no Base UI part: its tabs become links with `aria-current="page"`, where the house's were buttons.

### Phase 3 · The shell leaves (decision 0015, run as written)

Not re-planned. 0015's order, with the shared components that move into the kit with each surface, the first time a
moving surface draws them. The kit took a folder for each family in step 2.5 (`kit/button/` with its component and its
type test; the index names them from there), since 2.5's components would have taken it past the 20 modules a
directory may hold (the tree-shape measure, `docs/debt.md`); a component that moves in takes a folder the same way.

| 0015 step | Surface                                    | Moves into the kit with it (where it is the first to draw them)                                                  |
| --------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 1         | The address                                | nothing                                                                                                            |
| 2         | Reports, the pilot                         | the charts kit; `EmptyState`, `FailedRead`                                                                         |
| 3         | Inbox, Conversations, the thread           | `MoreMenu`, `usePPToast`, `Confirm`, `StatePill`; `ThreadPane` and `IxWho` stay the surface's own parts            |
| 4         | Today                                      | the stat strip; `AttnRow` and `SetupRows` become kit rows or Today's parts                                         |
| 5         | People, the person page, Lists, the Pipeline | the record kit, `PhoneSheet`, `PeopleBulkBar`, the rail rows, `plFace`, `plRowCard`, the deal and step sheets, `FieldError` |
| 6         | Calendar                                   | the agenda items                                                                                                   |
| 7         | Campaigns                                  | `CmPicker` as the kit's picker, `TemplateChips`, `MessagePreview`, `PbTok` as the token                            |
| 8         | Live                                       | nothing new                                                                                                        |
| 9         | Leads                                      | `LeadTile`, `LeadCallMenu`                                                                                         |
| 10        | The first run and Setup                    | nothing new                                                                                                        |
| 11        | Settings, pane by pane                     | the switch (`SetToggle`), `PolicyChip`, the Business tab's wrappers                                                 |
| 12        | Ask                                        | the Ask face                                                                                                       |
| 13        | The frame, then the tree                   | `Icon`, the tooltip, `SurfaceTabs`, the gestures, role gating; the sidebar and top bar stay the frame's            |

Decision 15 changes no move. A component with behaviour of its own (`MoreMenu`, `usePPToast`, `PhoneSheet`, the deal
and step sheets, `CmPicker`, `SetToggle`, the tooltip, `SurfaceTabs`) moves as written and draws what it drew. Each
surface's Phase 4 step swaps it for 2.5's Base UI component, and the house's is deleted with the last page that draws
it.

### Phase 4 · Every surface on the kit (nothing a member can see, but for the listed harmonies)

One pull request per surface, in 0015's order, after its move (decision 10). In it:

- every primitive the surface draws comes from the kit (its classes in JSX, its components in TSX);
- the surface's stylesheet keeps layout only, and its own primitive classes and literals are deleted;
- `style-values.json`, `kit-primitives.json` and `inline-styles.json` fall and are banked;
- the page-made shared pieces become kit components or the surface's own parts, never window names;
- Classic draws what it drew. Where a page's own primitive differed from the kit's (a 26px chip beside the kit's 20px,
  a 9.5px uppercase tag), the page takes the kit's and the pull request shows each difference, before and after
  (decision 11).
- a house component with behaviour of its own (a sheet, a menu, a picker, a tooltip, a toast, a switch, tabs) is
  swapped for the kit's Base UI one. The swap is a listed difference, not a byte-equal move: Base UI writes its own
  attributes and focus handling, so the pull request lists what the markup and the keyboard do differently, and it
  deletes the surface's hand-written behaviour in the same change. The first Base UI component a surface draws raises
  the workspace route's JS budget in that change, with the reason (decision 15).

_Proof:_ style equality, with the harmonies and the Base UI swaps listed. _Done when:_ page stylesheets hold layout only, and the two style
measures are empty outside the kit, or each entry left is argued in the register.

### Phase 5 · The look (what a member sees: the buttons)

**5.1 The Glass tokens.** `[data-look="glass"]` for both modes, with the values in Appendix B and the material rules
of §3.1. The gallery in Glass. Not offered to members. _Proof:_ the gallery shot in four combinations.

**5.2 The kit in Glass,** one family per pull request: capsule buttons, with the primary as decision 5 says; the
segmented capsule and the stage capsule; clear panes and inset rows; the glass foot bar; the composer's rows as
sentences of tokens; the search capsule; counts as text. _Proof:_ the gallery, before and after.

**5.3 The frame in Glass:** the floating sidebar, the capsule top bar with the live call as an island, and the
phone's tab bar with Ask (decision 12). _Proof:_ harness shots, desk and phone.

**5.4 Each surface's canvas,** under Glass only, one pull request each: Today (E3), Inbox (I1 and I2), People (P1 to
P3), Leads (L1 and L2), Campaigns (C1 and C2, the compact composer), Deals (D1 to D3: the Pipeline, the deal pane,
one composer). What a canvas changes beyond the kit: the title with its standing sentence, the scope capsule, the
pane beside the list, the composer's rows. The badge-rule breakers of Appendix A, item 8, are fixed here, surface by
surface. Classic stays as it was. _Proof:_ shots against the canvas.

**5.5 Offered.** The account menu shows Look: Classic or Glass. Ruben walks production.

**5.6 The default.** `DEFAULT_LOOK_PREF` becomes glass; a member's own choice stands.

**5.7 Classic retired,** a release cycle later (decision 6): its role values and any rule only it reads are deleted,
and `data-look` stays as the setting for the next look.

_Done when:_ every pixel comes from the tokens and the kit, in the look members see.

### Phase 6 · Everyone builds with the kit (the last task)

The holds of step 1.1 have refused new one-offs since the first week. This phase writes the rule down for people and
agents, and makes each hold absolute once its count reaches zero. 6.2 to 6.5 came first, on 29 September after Phase 2
(#1331), and write the rules as the build then held them; 6.1 follows each measure's last entry, in Phase 4.

**6.1 The measures that reached zero become rules.** Each moves from a baseline to a plain test in `tests/styles/`
that refuses any entry, with no raise, as `layout-measure.test.mjs` refuses a literal width; its register row
retires. None had reached zero on 29 September, when 6.2 to 6.5 were written after Phase 2 (#1331), ahead of Phases
3 and 4: the register counted 1,093 literal style values in 22 stylesheets, 2,155 selectors naming 864 primitive
classes outside the kit (a class once per stylesheet), and 286 style props in 49 files (`docs/debt.md`, "The
numbers"). So this step added nothing then. 6.2 to 6.5 write the rules as the build held them that day, as measures
that may only fall and the lint on raw elements of step 1.7, and each measure becomes its rule in the change that
banks its last entry.

**6.2 `CLAUDE.md`.**

- Under "The rules": **One kit.** A button, switch, segmented control, pill, chip, count, mark, panel, field, select,
  menu, sheet, row, face, meter, empty state, toast or tooltip comes from `apps/dashboard/src/surfaces/kit/`. A page
  composes them and never declares its own; a new need is a variant in the kit, with its gallery entry. **A value is
  a token.** A colour, type size, radius, shadow, blur or duration is read from `tokens.css`; a page stylesheet
  declares layout only.
- The canonical-example table: a component (`apps/dashboard/src/surfaces/kit/button/button.tsx` with `kit.css`), a colour,
  size or effect (a role in `tokens.css`), a look (a `[data-look]` block in `tokens.css`), a page's styles (layout
  only, beside its surface). `docs-paths.test.mjs` then holds these paths.
- "Where new code goes": something a page draws takes its primitives from the kit, and its layout lives with its
  surface.
- "What not to introduce": a button, chip, tab strip, card, sheet, field or face of a page's own; a literal colour,
  type size, radius, shadow or blur in a stylesheet; a second implementation of a kit component.
- "Before you open a pull request": a page change draws only kit components, and a new variant has its gallery entry.

**6.3 `apps/dashboard/src/legacy/CLAUDE.md`,** while the tree lasts: "Take the kit" replaces the per-primitive notes
(pills via `.pill`, the badge shapes) with one pointer.

**6.4 The docs.** `docs/architecture.md` gains "The interface" (tokens, kit, surfaces, the looks);
`docs/glossary.md` the words look, mode, token, role, kit, variant and gallery; `docs/runbook.md` "Add a look" (its
"See the kit" came with the gallery, step 2.3).

**6.5 A skill for agents,** `.claude/skills/chanlytics-interface/SKILL.md`, which Claude Code loads when a task
touches the dashboard's interface: the seven rules; where the tokens, the kit and the gallery are; how to add a
variant (the CSS, the component, the gallery entry, the test); how to prove a change (style equality, gallery shots);
the measures and how they bank; and the families of Appendix A as the list of what not to build again. `CLAUDE.md`
names it, so a session without skills still finds the rule.

_Done when:_ a new session that reads `CLAUDE.md` or loads the skill builds with the kit, and the build refuses the
alternatives.

---

## 5. Sequence

| Step | What                                  | A member sees it | Proof                           | Waits on                            |
| ---- | ------------------------------------- | ---------------- | ------------------------------- | ----------------------------------- |
| 1.1  | The counts hold                       | no               | fixtures, register              | nothing                             |
| 1.2  | The proof tool                        | no               | its self-test                   | 1.1                                 |
| 1.3  | Dead and leaking styles               | no               | style equality                  | 1.2                                 |
| 1.4  | Roles, and Classic                    | no               | style equality                  | 1.3                                 |
| 1.5  | Literals that equal a token           | no               | style equality                  | 1.4                                 |
| 1.6  | The look setting                      | no               | boot tests, style equality      | 1.4                                 |
| 1.7  | The kit's home                        | no               | lint probes, style equality     | #1205: 0015 decided                 |
| 2.1  | Kit-grade CSS into the kit            | no               | style equality                  | 1.7                                 |
| 2.2  | The missing primitives (four)         | no               | gallery, style equality         | 2.3                                 |
| 2.3  | The gallery, before 2.2               | no               | e2e spec                        | 1.7                                 |
| 2.4  | React components, new primitives      | no               | tests                           | 2.2                                 |
| 2.5  | Interactive components, on Base UI    | no               | tests, gallery, keyboard        | 2.4; decision 15                    |
| 3.x  | 0015's thirteen steps                 | no               | equal by value                  | 0015's own holds                    |
| 4.x  | Each surface on the kit (twelve)      | harmonies only   | style equality, listed diffs    | that surface's move                 |
| 5.1  | Glass tokens                          | no (not offered) | gallery shots                   | 2.3                                 |
| 5.2  | The kit in Glass (about six)          | no (not offered) | gallery shots                   | 5.1                                 |
| 5.3  | The frame in Glass                    | no (not offered) | harness shots                   | 5.2                                 |
| 5.4  | Each surface's canvas (six)           | no (not offered) | shots against the canvas        | 5.2; that surface's step 4          |
| 5.5  | Offered in the account menu           | yes, by choice   | a walk on production            | 5.3, 5.4                            |
| 5.6  | Glass by default                      | yes              | a walk on production            | 5.5 and Ruben's yes                 |
| 5.7  | Classic retired                       | no               | style equality in Glass         | a release cycle after 5.6           |
| 6.1  | Measures at zero become rules, last   | no               | the rule tests                  | each measure's last entry (Phase 4) |
| 6.2  | `CLAUDE.md`                           | no               | `docs-paths.test.mjs`           | Phase 2 (#1331)                     |
| 6.3  | The shell's `CLAUDE.md`               | no               | none                            | 6.2                                 |
| 6.4  | Architecture, glossary, runbook       | no               | `docs-paths.test.mjs`           | 6.2                                 |
| 6.5  | The agents' skill                     | no               | a fresh session asked to add a button | 6.2                           |

About 43 pull requests were planned besides 0015's own: 7 in Phase 1, 8 in Phase 2 (2.2 as four), 12 in Phase 4,
about 17 in Phase 5, 5 in Phase 6. Since Ruben's instruction of 28 September they ship in big batches, one push each:
2.1 to 2.4 as one (#1331), Phase 6 with steps 5.1 to 5.3 as one, and 2.5 as one.
Phases 1 and 2 do not wait on any surface. The Glass tokens, the kit in Glass and the frame can come before the
surfaces are done, since they are not offered to members until step 5.5.

---

## 6. Tests and gates

- **The holds** (§3.7): three measures with fixtures and register rows from step 1.1, and the lint rule with its probe
  from step 1.7.
- **Style equality** (§3.5) on every step a member must not see, with a planted fault shown to differ.
- **The gallery spec,** from step 2.3: every class in `classes.json` drawn, each reading its tokens in both modes and
  both looks; `tests/styles/kit-gallery.test.mjs` holds the classes in CI, where no browser spec runs.
- **The look's boot:** `theme-boot.test.mjs` extended; the chrome pins updated in the same change; the e2e sidebar spec.
- **Moves:** 0015's equal-by-value proof, unchanged.
- **The bundle budget:** the kit's first steps may raise the CSS by a little, as a Rises row; each Phase 4 step
  deletes page CSS, so the budget falls from there. The JS rises with Base UI alone: the change in which a surface
  first draws one of its components raises the JS budget, with the reason, component by component (decision 15).
- **Accessibility:** the one-badge spec's contrast rules (tone words in the `-ink` tokens, 4.5:1) checked on glass
  fills in the gallery; #1230's lint.
- **The phone:** the blur's cost measured on the phone app on a mid-range phone before step 5.5, the drawer's blur
  among it: on the review's software renderers (29 September) the drawer's blur stopped about 60px short of its edge,
  and Windows' WebKit drew none. The same check sees what an iPhone with Reduce Transparency draws (§3.1).
- **The full check line** on every step: build, typecheck, lint, tests, formatting, no dist drift.

---

## 7. Risks

- **The repository moves about sixty commits a day.** Every count here is re-measured at the start of the step that
  uses it (`git diff 81c5a7a42..origin/main` over the files it touches), and a finding already fixed is said to be.
- **Pages are held by other programs.** Reach out, Ask Rewired and the file splitter hold files this program would
  touch. 0015's rule applies: a surface waits until no open pull request holds it.
- **Glass costs frames on a phone.** Backdrop blur on many layers is expensive. Blur only the control layer, and only
  where the page moves behind it: on a phone the tab bar, Ask's circle and the drawer; on a desk the top bar's capsules
  and the strip of views besides. Never rows or cards inside a pane (the canvases' "never glass on glass"), not the
  panes, and not a sheet's foot, which stands on the sheet's opaque ground: over the page's still light a pane's blur
  changed what was drawn by under one level in 255. Settings on a phone drew eleven blurred layers, six of them on
  screen at rest, and draws two, the tab bar and Ask's circle (the review of steps 5.1 to 5.3, 29 September). Measure
  on the phone app; fall back to opaque fills where blur is missing or transparency is reduced.
- **Two looks double the visual review** until Classic retires (decision 6). The gallery keeps that review to one page.
- **The build's CSS quirks.** `backdrop-filter: none` beside its prefixed twin vanishes in the build (#929), and
  `blur(0)` is not `none` (§3.1): a blur role's Classic value is `none`, read through `var()`. Relative colours already
  work (`oklch(from …)`).
- **Contrast on translucent surfaces.** A pane's fill depends on what is behind it; small text on glass is checked in
  both modes, and the `-ink` tokens stay the rule for tone words.
- **The mascot and the map read the theme and the tokens.** Both are checked against Glass in step 5.3.
- **Scope creep.** The canvases are the whole design. A page does not change in this program beyond what its canvas
  drew; anything else is its own proposal.

---

## 8. Decisions, as taken

Ruben took every recommendation on 28 September ("go with your recommendations"). Each is written as decided, with
the road not taken beside it.

1. **The approach:** shadcn's model without its packages. Not Tailwind with shadcn/ui.
2. **Where the kit lives:** `apps/dashboard/src/surfaces/kit/`, the folder 0015 names.
3. **Where a look is saved:** on each device, as the theme is. No table, route or migration; not on the account.
4. **The kit's class names:** the house's names (`.btn`, `.pill`, `.chip`…), listed in a registry. No prefix, so the
   374 button uses keep their class.
5. **The primary action in Glass:** the accent, coral, as the canvases draw it. Classic keeps ink; the `--primary-*`
   roles let each look decide.
6. **Classic's future:** retired a release cycle after Glass is the default. Not kept as a second look.
7. **The gallery:** on the e2e harness only. Not a production route.
8. **The CSS parser for the measures:** lightningcss, the parser the build already uses. Not postcss.
9. **Tweaks:** later. The tiers allow an accent hue and a font as device preferences when they are wanted.
10. **The kit's order per surface:** after the surface's move. Not before it, in the JSX.
11. **Harmonies in Phase 4:** a page takes the kit's primitive even where its own differed a little, and the pull
    request shows each difference. Not temporary kit variants.
12. **Ask on the phone in Glass:** the ✦ disc settled on 25 September, drawn in the glass circle the canvases show.
13. **The canvases:** kept with Ruben, outside the repository. Not committed under `docs/design/`.
14. **The quiet link button:** a primitive of the kit, `.link-btn` and its danger form, the kit's name for the house's
    quiet link button (People's `.cl-bucket-link`), taken on 28 September with the panel (step 2.2). Not
    `.btn-link`, which would read as a modifier of the button, whose height, padding, border and ground it has none of.
15. **The kit's behaviour:** Base UI (`@base-ui/react`) for every component with behaviour of its own (step 2.5),
    taken by Ruben on 29 September with four conditions. Each hand-written behaviour is deleted as its Base UI version
    lands, never kept beside it on a page. One exact version is pinned, and each component imports its own part. The
    workspace route's JS budget is raised in the same change as each component that reaches it, with the reason.
    Phase 4's swaps of them are listed differences, not byte-equal moves. The CSS plan does not change, since Base UI
    draws nothing, and a component reaches a surface only after 0015 moves it, so Phase 3 does not change either. Not
    the house's own focus, escape and keyboard code, kept and extended (§2.3's first answer).

---

## Appendix A · The duplicates, file by file

Paths under `apps/dashboard/src/legacy/` unless named.

1. **Segmented controls:** `.rec-seg` (`styles/record.css:302`), `.ck-seg` (`styles/charts.css:116`), `.seg`
   (`styles/leads.css:197`; `pages/leads-peek.jsx:411`), `.sb-theme-seg` (`styles/components.css:2338`;
   `components/sidebar.jsx:297`), `.ix-autonomy-seg` (`styles/inbox.css:1591`), `.fleet-filter`
   (`styles/dashboard-a-v2.css:329`), `.cl-save-mode` (`pages/people.jsx:2034`), `.fr-find-hits`
   (`pages/first-run.jsx:120`), `.setup-fw-seg` (`pages/setup.jsx:190`).
2. **Switches:** `.rec-switch` (`styles/record.css:295`); `SetToggle`'s `.set-switch` (`pages/settings.jsx:139`,
   `styles/settings.css:352`); `.tbn-alert-switch` (`components/topbar.jsx:234`).
3. **Sheets and modals:** `.rec-sheet`; `.sb-sheet` (`styles/components.css:2348`), hand-built at
   `components/shortcuts.jsx:33`, `pages/people.jsx:1106`, `pages/people.jsx:2124` (`.pp-sheet`) and
   `pages/leads-scope.jsx:284`; `.bc-sheet` (`pages/broadcasts-run.jsx:66`); `.ask-modal` (`pages/ask-real.jsx:930`,
   `pages/calendar.jsx:210`, `pages/dashboard-a-ask.jsx:622`); the peeks `.pk` and `.pl-peek`
   (`pages/leads-peek.jsx:588`, `pages/pipeline-peek.jsx:120`); `.lf-panel` (`pages/leads-finder.jsx:427`);
   `.tbn-pop` (`components/topbar.jsx:198`).
4. **Menus and popovers:** `MoreMenu`, and `.more-menu` markup written by hand at `components/sidebar.jsx:203`,
   `pages/people-table.jsx:196` and `pages/people.jsx:598, 619`; `.pop.pk-nf` (`pages/leads-peek.jsx:275`), `.lf-pop`
   (`pages/leads-finder.jsx:260`), `.lp-pop` (`components/campaign-bits.jsx:316-344`), `.rec-combo-list`
   (`components/record-field.jsx:315`), `.cl-health-pop` (`pages/people.jsx:457`).
5. **Selects and pickers:** `DsSelect` (`components/deal-sheet.jsx:64`), `PbTok` (`pages/playbook-bits.jsx:160`),
   `RecordCombobox` (`components/record-field.jsx:236`), `CmPicker` (`components/campaign-bits.jsx:148`),
   `TemplateChips` (`components/template-chips.jsx:43`).
6. **Faces:** `.avatar` (one user, `pages/settings.jsx:783`); `.ix-thread-avatar`, `.ix-th-avatar`,
   `.cl-prof-avatar`, `.cl-mini-avatar`, `.cv-row-avatar`, `.lm-row-avatar`, `.mp-avatar`, `.pl-card-initials`,
   `.ld-tile-initials`, `.pk-band-initials`, `.ld-lb-initials`, the Pipeline's faces (`styles/clients.css:2617-2665`);
   `.agent-avatar` letter marks at inline sizes from 14 to 36px (for example `pages/inbox-rail.jsx:77`).
7. **Empty states:** `.empty*`; unused `.placeholder` (`styles/components.css:874`) and `.ac-empty`/`.ghost-row`
   (:2058); page-made `.cl-rail-empty`, `.pb-empty`, `.cv-empty`, `.ix-empty-mini`, `.td-empty`, `.tq-empty`,
   `.tbn-empty`, `.lp-empty`, `.ask-rows-empty`, `.cmd-empty`, `.ck-table-empty`.
8. **State pills outside `StatePill`, and the badge rules still broken:** `BucketPill`
   (`pages/clients-bits.jsx:39`), `.cl-prof-queue-tag`, `.tick-pill`, `.conf-word`, `.ix-next-tag`, `.cmd-row-badge`;
   hand-written `pill pill-*` in seven pages. Breaking the spec's rules: `.cl-row-bucket-pill` (10px uppercase, "Needs
   you" in the accent, `styles/clients.css:967-982`), `.cl-prof-queue-tag` (9.5px uppercase, accent, :1504-1515),
   `.cl-tag` (9.5px, :1625), `.ix-tag` (9.5px, `styles/inbox.css:394`), `.ix-next-tag` (9.5px uppercase, raw `--ok`,
   :919-929), `.conf-word` (9.5px, "Needs you" in raw `--warn`, `styles/components.css:2054-2057`), `.tick-pill` (10px,
   accent, `styles/dashboard-a-v2.css:151`), `.cmd-row-badge` (10.5px, accent, :853).
9. **Name chips:** the house `.chip` in nine files; page chips `.ask-chip`, `.brief-chip`, `.bc-chip`, `.fr-chip`,
   `.pk-chip`, `.ld-chip` (26px), `.rec-can-chip`, `.bt-rule-chip`, `.cl-tag`, `.ix-tag`, `.cl-prof-how-chip`,
   `.ix-ask-chip`, `.cal-feed-chip`, `.set-card-chip`.
10. **Tabs:** `SurfaceTabs` (`components/surface-tabs.jsx:84`), re-typed in `PeopleScopeTabs`
    (`pages/people.jsx:1146`) and `pages/settings.jsx:1828`; also `.cl-triage-tabs` and `.ld-classes`.
11. **Cards:** `.card` unused; `.fl-card` (`styles/fleet.css:170`; 39 uses in 8 files), `.rec-card`, `.ck-card`,
    `.bc-card`, `.ask-card`, `.ld-card`, `.pipe-card`, `.fcard`.
12. **Close and back buttons:** `.btn-icon` and `.ck-icon-btn`, beside `.rec-sheet-close`, `.pp-sheet-close`,
    `.pp-sheet-back`, `.bc-back` (seven), `.cl-prof-back` (five), `.ix-back`, `.cmd-back`, `.pk-x`, `.lf-close`,
    `.tbn-x`, `.pp-toast-x`.
13. **Meters:** `SegmentBar` (`components/chart-core.jsx:391`), the reach bar (`CmReach`), `TempBar`
    (`pages/clients-bits.jsx:14`), `.conf-meter` (`pages/inbox-thread.jsx:878`), `.setup-meter`
    (`pages/platform.jsx:143`), the peek's bar (`pages/leads-peek.jsx:207`).
14. **Tooltips:** `[data-tip]`/`.ui-tip` (62 uses in 23 files), `RecordTip` and `RecordTipCard`, `.ld-tip`
    (`pages/leads-cells.jsx:94`), `.ck-tip`, and 264 native `title=` attributes in pages.

---

## Appendix B · The Glass values, from the canvases

The canvases' material, as their generator defines it (`liquid.py`, Appendix C). Phase 5 writes these as `oklch` in the
house's style and keeps the values.

**Surfaces and edges**

| Role (proposed)              | Light                                             | Dark                                              |
| ---------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| Page ground                  | `#F1F2F6`, three soft pools of light              | `#0F1014`, the same pools at low strength         |
| Control fill (the nav glass) | `rgba(255,255,255,0.50)`                          | `rgba(255,255,255,0.085)`                         |
| Tile fill (crystal)          | `rgba(255,255,255,0.36)`                          | `rgba(255,255,255,0.05)`                          |
| Pane fill (clear, E3)        | `rgba(255,255,255,0.26)`                          | `rgba(255,255,255,0.035)`                         |
| Inset fill (inside a pane)   | `rgba(255,255,255,0.62)`                          | `rgba(255,255,255,0.075)`                         |
| Selected segment             | `rgba(255,255,255,0.82)`                          | `rgba(255,255,255,0.13)`                          |
| Popover (opaque)             | `rgba(255,255,255,0.98)`                          | `rgba(30,31,36,0.97)`                             |
| Edge (hairline)              | `rgba(40,45,70,0.10)`                             | `rgba(255,255,255,0.09)`                          |
| Specular top edge            | `rgba(255,255,255,0.95)`                          | `rgba(255,255,255,0.20)`                          |
| Contour (outer hairline)     | `rgba(40,45,70,0.08)`                             | `rgba(0,0,0,0.30)`                                |
| Rim stops, 0 → 100%          | white at 0.98 · 0.35 · 0.14 · 0.78                | white at 0.42 · 0.10 · 0.05 · 0.22                |
| Control depth                | `0 22px 44px -26px rgba(30,36,70,0.36)`, `0 1px 2px rgba(30,36,70,0.06)` | `0 28px 60px -32px rgba(0,0,0,0.8)`, `0 2px 8px -4px rgba(0,0,0,0.5)` |
| Pane depth                   | `0 16px 36px -28px rgba(30,36,70,0.30)`, `0 1px 1.5px rgba(30,36,70,0.05)` | `0 20px 44px -30px rgba(0,0,0,0.7)`, `0 1px 2px rgba(0,0,0,0.3)` |

**Ink and tones**

| Role              | Light                                                              | Dark                                                              |
| ----------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Ink, 1 to 4       | `#1B1C20` · `rgba(50,52,64,0.86)` · `0.64` · `0.22`                | `#F4F4F6` · `rgba(236,236,245,0.72)` · `0.52` · `0.22`            |
| Accent            | `#E4523C`; button `#E0503A`, words on it `#FFFFFF`; soft `0.12`; text `#B93A26` | `#FF7262`; words on it `#1A0B08`; soft `0.15`; text `#FF8A7C` |
| Amber (one warning) | `#E09A24`; soft `0.14`; text `#8A5A0C`                           | `#F0B14A`; soft `0.15`; text `#F3C36A`                            |
| Green             | `#2C8C58`; soft `0.12`                                             | `#4CD68A`; soft `0.13`                                            |
| Count (neutral)   | `#FFFFFF` on `#1B1C20`                                             | `#17181B` on `rgba(255,255,255,0.92)`                             |
| Live island       | `rgba(22,22,26,0.94)`                                              | `rgba(10,10,12,0.92)`                                             |

**Materials**

| Level                 | Fill          | Blur | Saturation | Depth         | Radius                                   |
| --------------------- | ------------- | ---- | ---------- | ------------- | ---------------------------------------- |
| Control (nav)         | control fill  | 28px | 1.5        | control depth | 30px for the sidebar; half the height for a capsule |
| Tile                  | tile fill     | 18px | 1.3        | pane depth    | 30px                                     |
| Pane (clear)          | pane fill     | 14px | 1.25       | pane depth    | 30px                                     |
| Inset                 | inset fill    | none | none       | a 1px edge and the specular top edge | 12 to 16px              |
| Popover               | popover fill  | none | none       | a soft shadow | 14 to 16px                               |

The rim is a one-pixel gradient ring at 135 degrees through the four rim stops, masked to the border. The primary
button is a capsule filled with the accent, its words at weight 600, with a soft glow of the accent under it and the
specular top edge. The rules the canvases hold: glass is the control layer; panes are clear; never glass on glass
(inside a pane everything is an inset); coral only for the primary act, the live call, the Now line and the selected
tab; amber for the one warning; counts are neutral text; green for what is open, checked or won.

**Changed from the canvases for contrast** (the review of steps 5.1 to 5.3, 29 September). The canvases drew their
inks on their own boards; on the app's pages, and over the look's strongest light, the blue pool, some read under the
house's rule: 4.5:1 for words, 3:1 for large ones. Each value keeps its hue, and `tokens.css` says why beside it. The
ratios are the worst met, before and after: every word of nine pages, at a desk and on a phone, read on the pixels
drawn under it, and every word of the gallery (its check 7), each entry shot at the top of the window. The faint ink,
and a tone a page still writes as words, are held to Classic's own ratio on Classic's ground rather than to 4.5:1.

| Role | Canvas (or Classic) | Glass | Before → after, on the worst ground met |
| --- | --- | --- | --- |
| Ink 3, `--ink-dim`, light | `rgba(50,52,64,0.64)` | `oklch(0.328 0.021 278 / 0.78)` | 3.44 → 4.80, an empty state over the pool; the pages' 3.63 → 5.16 |
| Ink 3, `--ink-dim`, dark | `rgba(236,236,245,0.52)` | `oklch(0.946 0.012 286 / 0.66)` | 3.97 → 5.29, the sidebar's words |
| Ink 4, `--ink-faint`, light | `rgba(50,52,64,0.22)` | `oklch(0.328 0.021 278 / 0.45)` | 1.48 → 2.35; no word under its Classic twin (the Calendar's hours 2.38, Classic 2.37) |
| Ink 4, `--ink-faint`, dark | `rgba(236,236,245,0.22)` | `oklch(0.946 0.012 286 / 0.38)` | 1.82 → 2.77; no word under its Classic twin (the sidebar's hint 2.77, Classic 2.70) |
| Ink 3 and 4 on the picked lozenge, dark (new: `--selected-ink-dim`, `--selected-ink-faint`) | the page's | `oklch(0.946 0.012 286 / 0.8)`, `/ 0.5` | a count on it 3.06 → 4.86; the hint of the place you are on 1.65 → 2.86 (Classic 2.43) |
| Accent, light | `#E4523C` | `oklch(0.6 0.185 31)`, `#D84733` | white on it 3.77 → 4.31 (Classic 3.88); a page's coral words 2.92 → 3.31 (Classic 3.27) |
| Primary (the button), light | `#E0503A` | `oklch(0.58 0.184 31)`, `#D1412D` | white on it 3.90 → 4.66 |
| Accent's words, light | `#B93A26` | `oklch(0.45 0.15 32)`, `#972815` | 3.24 → 4.71, over the pool |
| Accent's words, dark | `#FF8A7C` | `oklch(0.82 0.11 28)`, `#FFA89C` | 3.81 → 4.70, the tab bar's picked label |
| Amber, light | `#E09A24` | `oklch(0.72 0.147 74)`, `#DA9419` | a page's amber words 1.92 → 2.04 (Classic 2.03) |
| Amber's words, light | `#8A5A0C` | `oklch(0.45 0.09 72)`, `#744C0E` | 3.73 → 4.71, a pill over the pool |
| Red's words, light (Classic's) | `#B7191C` | `oklch(0.45 0.17 27)`, `#9E1618` | 2.99 → 4.85, over the pool |
| Red's words, dark (Classic's) | `#E6443D` | `oklch(0.74 0.15 27)`, `#FB8276` | 2.72 → 4.85, a quiet destructive act on the glass; Today's failed line 4.16 → 6.77 |
| Blue's words, light (Classic's) | `#006394` | `oklch(0.43 0.1 235)`, `#00577E` | 3.88 → 4.83 |

Words the house's rules still write in a raw tone (a quiet destructive act, a menu's destructive item, what went wrong,
a toast's link and its act) read the tone's ink under Glass (`kit.css`), as the one-badge spec says every tone's words
do: the red and blue rows' before is those words in the raw tone. The dark look sets blue's words again, at Classic's
value, since the light look now sets its own. The pane's blur (14px and 1.25, above) is not drawn (§7).

---

## Appendix C · The canvases

| Surface   | Rows                                                                  | Verdict                                   | Where                                                         |
| --------- | --------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------- |
| Today     | E3 · Clear (of E1 to E5)                                              | picked, 28 September ("e3 it is")         | a private artifact; `Downloads/today-liquid-glass.html`       |
| Inbox     | I1 Needs you; I2 A draft on its way                                   | owed                                      | `Downloads/inbox-liquid-glass.html`                           |
| People    | P1 Everyone; P2 A list open; P3 A person                              | owed                                      | `Downloads/people-liquid-glass.html`                          |
| Leads     | L1 The panel beside the table; L2 Three states                        | owed                                      | `Downloads/leads-liquid-glass.html`                           |
| Campaigns | C1 The page and the composer; C2 One composer, three doors (compact)  | liked, 28 September                       | a private artifact; `Downloads/campaigns-liquid-glass.html`   |
| Deals     | D1 The Pipeline; D2 The deal; D3 One composer, every move             | liked, 28 September                       | a private artifact; `Downloads/deals-liquid-glass.html`       |

The generator that drew them is outside the repository, in a gitignored folder of a local worktree
(`cm-today-canvas/_gen/today-canvas/gen/`: `liquid.py` for the material, one module per surface). Decision 13 asks
whether the canvases should be committed.

---

## Appendix D · How this was read

- **Counts** (§1.4, §1.5, the literal-to-token split) by two scripts over `git show origin/main:<file>` for every
  stylesheet and every JSX and TSX file under `apps/dashboard/src` and `apps/dashboard/app`, comments removed:
  `var(--` uses; raw hex and colour functions, less those derived from a token; px font sizes, radii, shadows and
  spacing; `style=` props; class names grouped by the word that names their kind; rules that pair a raised
  background with a radius. The same scripts gave the same numbers at `f27c6a05e`, `cd878972b` and `81c5a7a42`.
- **Three read-only inventories** of `origin/main`: the theme's path end to end (§1.3, §3.2); the ratchet, register,
  lint and docs machinery (§1.8, §3.7); and the shared interface, its duplicates and the badge rules (§1.6, §1.7,
  Appendix A).
- **Documents:** decision 0015 and its settlement in #1205; the frontend, organization and Road to Ten plans; the
  one-badge-system spec; `tokens.css`, `components.css`, `legacy.css` and `globals.css` read in full.
- **The design:** the six canvases and their generator (Appendices B and C).
