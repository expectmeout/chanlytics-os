---
name: chanlytics-interface
description: The dashboard's interface kit, its tokens and its looks. Use when a change draws or restyles anything in apps/dashboard (a page's markup or stylesheet; a button, tab, chip, card, sheet, field or menu; a colour, size, radius, shadow or blur; the theme or a look), or when a style measure or the kit's lint goes red.
---

# The interface kit

The plan's aim (`docs/plans/2026-09-28-the-interface-kit-and-its-looks.md`): a look is a set of token values, a
primitive is written once in the kit, and a page only composes. Phases 1 and 2 built the ground: the tokens and their
roles, the kit's own rules in one stylesheet, its React components (ten of them with behaviour of their own, on Base
UI, step 2.5), and a gallery that draws the kit whole. Glass, the canvases' look, is drawn, and not yet offered to
members. The pages still carry values and primitives of their own, and move onto the kit surface by surface (the
plan's Phase 4, after each surface leaves the shell under decision 0015). Until then the build holds what it counts
(The holds, below): each count may only fall, and a new entry is a red build.

## The seven rules

The plan's contract (its §2.1), with what the build holds of each today.

1. **A value is a token.** A colour, type size, radius, shadow, blur or duration is declared once, in
   `apps/dashboard/src/legacy/styles/tokens.css`, and a rule reads it with `var()`. Layout lengths (widths, gaps, grid
   tracks) stay with the page. Held: the type sizes, radii, shadows, colours and blurs a stylesheet writes as
   literals, and the `style` props in the shell's markup, are counted. No measure counts a duration.
2. **A look is a set of token values.** Two settings on `<html>` and on every root that stamps a theme: `data-theme`
   (light or dark) and `data-look` (classic, or glass, which is drawn and not yet offered). A new look is two blocks
   in the tokens; a tweak is one token.
3. **A primitive is written once, in the kit** (`apps/dashboard/src/surfaces/kit/`): button, switch, segmented control,
   pill, chip, count, mark, panel, field, select, menu, sheet, row, face, meter, empty state, toast, tooltip. Held: a
   page stylesheet's primitive classes and its selectors naming a kit class are counted (a row and a page's own count
   are not), and a raw control in a surface is a lint error.
4. **The kit reads only tokens; a page declares only layout**: display, grid, flex, gap, position, size, overflow.
   Phase 4's target. Today only rules 1 and 3's counts hold it, `kit.css`'s own literals among them.
5. **Variants are props.** A new need becomes a variant in the kit, with its gallery entry. Held: a kit class no
   gallery entry draws fails `corepack pnpm test`.
6. **A restructure proves it changed nothing**: by value for a move (decision 0015), by computed style for CSS. A pull
   request's proof, not a measure (Prove a change, below).
7. **The build holds it.** Each rule is a measure that may only fall, or a lint error, from the step that makes it
   true.

## Where things are

| What | Where |
| --- | --- |
| The tokens | `apps/dashboard/src/legacy/styles/tokens.css`: the scales on `:root`; each theme's colours and shadows on `[data-theme="light"]` and `[data-theme="dark"]`; the roles on `:root, [data-theme]`, which are Classic; Glass's two blocks after them |
| The kit's rules | `apps/dashboard/src/surfaces/kit/kit.css`, reading a role where a look sets the value (a surface, a control, an action), and otherwise a scale or the theme's colour; one breakpoint, 900px. Four primitives stand in it twice until Phase 4 takes the house's out: `.avatar` and `.face`, `.rec-sheet` and `.sheet`, and the surfaces of `.rec-card-tip` and `.confirm-block` beside `.panel-pop` and `.panel-inset`. Its header says what belongs there |
| Its registry | `apps/dashboard/src/surfaces/kit/classes.json`: the kit's class names (the house's own, no prefix) and, apart, the modifiers its rules name (`.active`, `.show`). The measures read it |
| Its components | `Button`, `LinkButton`, `Panel`, `Face`, `ListRow`, `Meter`, and those with behaviour of their own, on Base UI: `Sheet`, `Menu`, `Popover`, `Select`, `Combobox`, `Tooltip`, `useToast`, `Switch`, `Segmented`, `Field` (Behaviour: Base UI, below): a folder each, `apps/dashboard/src/surfaces/kit/<family>/`, holding the component and its type test, named in `apps/dashboard/src/surfaces/kit/index.ts`; `cx` and `variants` in `apps/dashboard/src/surfaces/kit/variants.ts`, and what a press is in `apps/dashboard/src/surfaces/kit/press.tsx`, at the kit's root |
| The house's components over its classes | `StatePill`, `MoreMenu`, `Confirm`, `EmptyState`, `FailedRead`, `FieldError` and `usePPToast` in `apps/dashboard/src/legacy/components/data-bits.jsx`; `SurfaceTabs`; the record kit (`apps/dashboard/src/legacy/components/record-*.jsx`); `Icon`. JSX, which a surface cannot import (Draw with the kit, step 2) |
| The gallery | `tooling/scripts/e2e-harness/kit-gallery.mjs`: `node tooling/scripts/e2e-harness/server.mjs 3210 kit`, then http://localhost:3210/ (`t` turns the theme, `l` the look), and the page that runs the Base UI components at http://localhost:3210/behaves (`tooling/scripts/e2e-harness/kit-behaves-entries.tsx`); `docs/runbook.md`, "See the kit" |
| Its checks | `e2e/kit/kit.spec.ts` and `e2e/kit/kit-behaves.spec.ts` in a browser; `tooling/scripts/tests/styles/kit-*.test.mjs` in `corepack pnpm test` |
| The measures | `tooling/scripts/tests/_measures.mjs`, reading the stylesheets through `tooling/scripts/tests/_css.mjs` and the markup through `tooling/scripts/tests/_ast.mjs`; the baselines in `tooling/scripts/tests/baselines/`; the register, `docs/debt.md` |

## Draw with the kit

1. Find the primitive in the gallery: its family, and the entry whose markup is what the page needs.
2. On a legacy page (`apps/dashboard/src/legacy/`), draw the house component where one exists (`MoreMenu` for a menu,
   never its markup typed again), and otherwise write the entry's classes (a button, a chip, a panel). On a surface
   under `apps/dashboard/src/surfaces/`, import the component from the kit's `index.ts`: a press that opens a page
   takes `href` and is drawn as a link, and `className` carries layout alone. A surface cannot import the house's JSX:
   the lint's refusals name the kit's Button, Field, Switch, Select, Combobox and Sheet by their folders, and Confirm,
   the house's until the first surface that needs it moves it into the kit as TSX, drawing what it drew (the plan's
   Phase 3 table), as it moves any other house component the kit lacks. A sheet, a menu, a picker or anything else
   with behaviour of its own is the kit's, on Base UI (below).
3. Place it from the page's own stylesheet with display, grid, flex, gap, position, size and overflow, through a class
   of the page's own that names no kit class and holds no primitive's word: `.cal-copy` is not counted, where
   `.cal-copy-btn` and `.cal-tools > .btn` both are. Which variant it draws at which width (a glyph alone on a phone)
   is the page's too, at the width its own layout already changes (the Calendar's `crPhone`, 720px); the kit's own
   rules change at 900px alone. A value it needs is a token; a look it needs that the kit lacks is a variant (both
   below).

Done when the change raises no count and adds no entry in the three measures: no literal type size, radius, shadow,
colour or blur; no class that draws a primitive, and no selector naming a kit class, in a page's stylesheet; and no
`style` prop.

## Add a variant

1. **The rule** in `kit.css`, on a class of its own as `.btn-sm` is, beside the primitive's other rules. It reads a
   role where a look sets the value (a surface, a control, an action), and otherwise a scale or the theme's colour,
   and writes no literal; an `@media` in it names 900px alone.
2. **The name** in `classes.json`: a class that draws goes under `classes`; a state written as a word of its own
   (`.active`) under `modifiers`.
3. **The component**, where the family has one: the value in its `variants()` map and its props' type, and in the pin
   its type test holds on that union (`button/button.type-test.ts`).
4. **The gallery entry**, in the family in `kit-gallery.mjs`: the markup the component renders, with every state its
   rules name as a class or an attribute (disabled, a role's gate, `.active`); the spec forces the presses itself. A
   variant that reproduces a page's own rule takes a `twin`: a `source` entry drawing the page's class, which the spec
   holds equal to it, longhand for longhand.
5. **The drawing**, where the family has a component: the entry's id and the call that draws it, in the family's map
   in `tooling/scripts/tests/styles/kit-components.test.mjs` (`BUTTONS`, `PANELS`, …); for a component on Base UI, the
   entry on the running page with the same id (`tooling/scripts/e2e-harness/kit-behaves-entries.tsx`), and in
   `e2e/kit/kit-behaves.spec.ts` how a person brings it to that state.
6. **Run** `corepack pnpm --filter "./packages/*" build`, then `corepack pnpm -r typecheck`, which compiles the type
   test, `corepack pnpm lint`, `corepack pnpm test`, and `corepack pnpm e2e:local -- e2e/kit/kit.spec.ts
   --scenario=kit` (and `e2e/kit/kit-behaves.spec.ts` for a component on Base UI). Show the spec's run in the pull
   request.

Done when all of them are green: the type test compiles, and the spec draws every selector of the new rule, and each
token it reads moves what it feeds.

A new primitive takes the same steps under a short name in the house's style that no stylesheet uses yet, as a family
of its own in the gallery, with its component and type test in a folder of its own beside the others (`kit/button/`),
which the index names it from. The kit's root holds only what its families share: the index, the stylesheet, the
registry, `variants.ts` and `press.tsx`, so no folder of it comes near the 20 modules a folder may hold (the
tree-shape measure).

## Add a value

- A scale (tier 1): a step of type, space, radius or motion, on `:root` in `tokens.css`.
- A colour or a shadow the themes differ in: in both `[data-theme="light"]` and `[data-theme="dark"]`.
- A role (tier 2), a value a look sets: on `:root, [data-theme]`, made from the scales and the theme's colours so that
  Classic draws what it drew. A role arrives with its first reader in `kit.css`. Where Classic draws nothing, its value
  is the one that draws nothing: for a blur, `none`, read through `var()`, which the build keeps. Never `blur(0)`,
  which is not `none` (`docs/runbook.md`, "Add a look").
- A component's own value (tier 3): on its class in `kit.css` (`--sheet-in`). No look sets it.
- A look: `docs/runbook.md`, "Add a look".

A new token says, in a comment beside it, what it is for.

## Prove a change

- **One that must move nothing on screen** (a literal becoming its token, a rule moving into the kit, a page trading
  its class for the kit's): record the base before editing, then the change against it, and show equal in the pull
  request. Name each recording for the branch with its slash replaced (`before-kit-my-change.json`): a name with a
  slash is read as a path, and one inside the repository is refused. Every worktree shares the folder recordings go
  to. A recording takes ten to fifteen minutes and needs the network.

  ```bash
  corepack pnpm check:style-equality -- record before-<branch>.json
  corepack pnpm check:style-equality -- record after-<branch>.json --against before-<branch>.json
  ```

  The pull request names each changed rule no recorded page drew, and how it was checked. `docs/runbook.md`, "Prove a
  style change", says what the recorder cannot see.
- **One meant to be seen**: the spec's run, and the gallery shot in both themes and both looks, at a desk and a phone
  width.
- **A move** under decision 0015: equal by value, as that decision says.

## The holds

| Hold | What turns it red |
| --- | --- |
| `tooling/scripts/tests/baselines/style-values.json` | a type size, radius, shadow, colour or blur written as a literal, counted per stylesheet: every stylesheet of the dashboard but the tokens, the kit's among them. The charts' validated palette in `apps/dashboard/src/legacy/styles/charts.css` is counted, and kept |
| `tooling/scripts/tests/baselines/kit-primitives.json` | in every stylesheet but the tokens' and the kit's: each selector naming a class the registry lists, even one that only places it (`.cal-tools > .btn`), or a class whose name holds a primitive's word (`btn`, `chip`, `tab`, `card`, `sheet`, `field`, `face`, `menu`, `pop`, `tip`, `toast`…, so `.pl-card-slot` counts). Not a row, nor a page's own count |
| `tooling/scripts/tests/baselines/inline-styles.json` | a `style` prop under `apps/dashboard/src/legacy` or `apps/dashboard/src/surfaces`, counted per file |
| the raw-element lint (`eslint.config.mjs`) | a raw `<button>`, `<input>`, `<select>`, `<textarea>` or `<dialog>` in `apps/dashboard/src/surfaces` outside the kit; a surface moved before its kit step waits in `KIT_PENDING` |
| `tooling/scripts/tests/styles/kit-css.test.mjs` | a class the kit's stylesheet declares and the registry lacks; an `@media` width in it other than 900px; a page outside the shell drawing a kit class while `apps/dashboard/app/globals.css` does not import the kit |
| `tooling/scripts/tests/styles/kit-gallery.test.mjs` | a registry name no entry draws |
| `tooling/scripts/tests/styles/kit-components.test.mjs` | a component of step 2.4 and its gallery family parting, in a tag, a class, or an attribute a stylesheet or a screen reader reads |
| `tooling/scripts/tests/styles/kit-behaves.test.mjs` | the running page and the gallery's families on Base UI parting (an entry on one side alone); a switch, a segmented control or a field drawn on a server otherwise than its entry; a second React, or another Base UI, in the page's bundle |
| `tooling/scripts/tests/styles/kit-base-ui.test.mjs` | Base UI pinned with a caret or a tag, or at a version the install did not make; a licence not MIT, a peer range without the dashboard's React, or an install script anywhere in what it brings |
| the Base UI lint (`eslint.config.mjs`, `BASE_UI_INDEX`) | Base UI's index (`@base-ui/react`) imported, or re-exported, anywhere in the dashboard: each component imports its own part |
| `corepack pnpm check:bundle` (CI, after the build) | the workspace route's CSS past its budget |

A fall is banked with `UPDATE_BASELINES=1 corepack pnpm test`, which rewrites the register's numbers too, and the
bundle's with `corepack pnpm check:bundle -- --update` after a dashboard build. A rise is raised with
`UPDATE_BASELINES=raise corepack pnpm test` (the bundle's with `corepack pnpm check:bundle -- --raise`) in the same
change as its row under "Rises" in `docs/debt.md`, argued in the pull request. The one style prop the kit keeps, a
meter part's share, is argued there.

## One shape per job

The badges (`docs/superpowers/specs/2026-09-23-one-badge-system-design.md`, and the comment over them in `kit.css`):

- a **pill** is a state (`StatePill`): at rest, its dot and its word; filled in its tone when it asks to be seen;
- a **chip** is a name (a list, a person, a role, a service, a source): a hairline, no fill, never a tone;
- a **tally** is a number on a tab, a nav row, a filter or an icon, amber (`tally-warn`) when it counts people who
  need you;
- a **mark** is a row's kind, neutral always.

"Needs you" is amber on every badge and in every sentence, red is for what failed, and the coral accent is for live
and now alone. Words in a tone take its `-ink` token.

## What the kit already answers

The families the plan found built more than once (its Appendix A), with what a page takes instead. A legacy page draws
each as it stands. A surface imports the kit's own components (`Button`, `LinkButton`, `Panel`, `Face`, `ListRow`,
`Meter`, and those on Base UI); the rest are the house's JSX, which the first surface to need one moves into the kit as
TSX (Draw with the kit, step 2).

| A page's own | The kit's |
| --- | --- |
| close or back button | `Button` with `iconOnly` and its `aria-label` (`.btn.btn-icon`) |
| segmented control | `Segmented` (`.rec-seg`); `RecordToggleGroup` on a legacy page |
| switch | `Switch` (`.rec-switch`); `RecordSwitch` on a legacy page |
| sheet, modal | `Sheet` (`.sheet`), which no page draws yet; `RecordSheet` (`.rec-sheet`) on a legacy page |
| menu, popover | `Menu` (`.more-*`), `Popover` (the panel's pop); `MoreMenu` on a legacy page |
| select, picker, field | `Select` and `Combobox` (`.rec-combo-*`), in a `Field` (`.rec-field`); `RecordCombobox`, `RecordField` and `.input` on a legacy page |
| face, initials | `Face` (`.face`) |
| empty state | `EmptyState`, and `FailedRead` for a read that failed (`.empty*`) |
| state pill | `StatePill` (`.pill`) |
| name chip | `.chip`, its × `.chip-x` |
| tab strip | `.stabs`, as `SurfaceTabs` draws it |
| card | `Panel`: `pane`, `inset` or `pop`; `sm` or `flush` |
| meter, bar | `Meter` (`.meter`) |
| tooltip, a native `title` | `Tooltip` (`.ui-tip`); on a legacy page a `data-tip` attribute, drawn by `.ui-tip` on hover and on keyboard focus, and `RecordTip` in the record kit |
| quiet link | `LinkButton` (`.link-btn`) |
| list row | `ListRow` (`.list-row`) |
| confirmation, flash | `Confirm` (`.confirm*`); `useToast` (`.pp-toast*`), `usePPToast` on a legacy page |
| glyph | `Icon` (`apps/dashboard/src/legacy/components/icons.jsx`) |

## Behaviour: Base UI

The kit builds every component with behaviour of its own on Base UI (`@base-ui/react`, one exact version pinned in
`apps/dashboard/package.json`): Ruben's decision of 29 September, the plan's decision 15, built in step 2.5. Base UI
brings the behaviour (focus held inside, Escape, the keyboard, the page behind held still, what a screen reader is
told), and the kit's classes draw its parts, since Base UI draws nothing.

| Component | Base UI's part | What it draws |
| --- | --- | --- |
| `Sheet` | Dialog, modal | `.sheet-backdrop`, and `.sheet` with its handle and the record sheet's head, tools, rows and foot; Base UI's closing state is the kit's `data-leaving` |
| `Menu` | Menu | `.more-menu` on its positioner (`.pop-place`): `.more-item` (a link where it opens a page, `danger` where it destroys), `.more-header` over a group, `.more-divider` between two, a set to choose one of as radio items |
| `Popover` | Popover | the panel's pop (`Panel`, `variant="pop"`) on `.pop-place` |
| `Select` | Select | the record kit's box as a button (`.rec-input.rec-select`), its list on the panel's pop (`.rec-combo-pop`, `.rec-combo-list`, `.rec-combo-opt`) |
| `Combobox` | Combobox | the record kit's box (`.rec-combo`), its list as the select's |
| `Tooltip` | Tooltip | `.ui-tip` on its positioner (`.tip-place`); Base UI's open state is the kit's `.show` |
| `useToast` | Toast, with a manager of its own | `.pp-toast-stack` and `.pp-toast-<tone>`, raised by a `flash` as usePPToast's is |
| `Switch` | Switch | `.rec-switch` and its knob, a real button |
| `Segmented` | RadioGroup and Radio | `.rec-seg` and `.rec-seg-btn`, a sentence under each option where it has one |
| `Field` | Field | `.rec-field`: the label, the box (`.rec-input`, with its unit) or another of the kit's controls, and the hint (`.rec-hint`) or what is wrong (`.field-error`) |

- Write none of that behaviour by hand in new code: no focus trap, Escape listener, outside-click handler or scroll
  lock of your own. Import the kit's component; if the kit lacks it, build it in the kit, on Base UI's part.
- Each component imports its own part (`@base-ui/react/dialog`), never the package's index: the lint refuses the index
  anywhere in the dashboard (`BASE_UI_INDEX` in `eslint.config.mjs`).
- A popup goes through Base UI's portal to the document's body, where nothing holds it: in the Glass look a pane or a
  bar with a backdrop filter is the containing block of what is fixed inside it.
- A state Base UI marks is drawn by the kit's own state where the kit has one (`data-leaving` for a sheet leaving,
  `.show` for a tip, `data-chosen` for the option chosen, `hidden` for a list nothing matches), through the part's
  `render` or `className` function. The rules kit.css added for Base UI are few, read no literal, and each is drawn by
  the gallery: the positioners' layers (`.pop-place`, `.tip-place`), the menu and the tip in flow on them, a menu item
  that is a link, an option walked to (`[data-highlighted]`), the floating list (`.rec-combo-pop`) and the select's box
  (`.rec-select`).
- A glyph is the page's: a component that draws one (the sheet's Close, the select's chevron, the combobox's glass, a
  field's problem, a toast's tone and its ×, a menu item's and a set's tick) takes it as a prop, the Icon at the
  house's size, as the Button and the Face do, until the Icon moves into the kit (the plan's Phase 3).
- A legacy page keeps the house's component (`RecordSheet`, `MoreMenu`, `RecordCombobox`, `usePPToast`, `[data-tip]`)
  until its surface's Phase 4 step swaps it for the kit's. The swap is a listed difference, not a byte-equal move (the
  plan's step 2.5 lists what each draws and does otherwise): it deletes the surface's hand-written behaviour in the same
  change, and the first Base UI component a surface draws raises the workspace route's JS budget there, with the
  reason.
- A surface's views that change the address are links, never Base UI's Tabs: a door is a link, and `.stabs` stays a
  strip of links when `SurfaceTabs` moves.
- Held: each is drawn on the harness's running page (`tooling/scripts/e2e-harness/kit-behaves-entries.tsx`, at
  `/behaves`), which `e2e/kit/kit-behaves.spec.ts` drives with a keyboard and a pointer, at both widths, in both themes
  and looks, and holds, state by state, to its gallery family "on Base UI"; `kit-behaves.test.mjs` holds what a server
  can draw in `corepack pnpm test`. A new state or variant adds its entry on both pages, with the same id.

### Add a component with behaviour of its own

The canonical one to copy is `apps/dashboard/src/surfaces/kit/menu/menu.tsx` with its type test beside it.

1. **The part.** Base UI's own (`import { Dialog } from "@base-ui/react/dialog"`), never the index, and no second
   version: the exact one in `apps/dashboard/package.json` is the only one `kit-base-ui.test.mjs` accepts.
2. **The folder.** `apps/dashboard/src/surfaces/kit/<family>/<family>.tsx` and `<family>.type-test.ts`, named in
   `apps/dashboard/src/surfaces/kit/index.ts` (each export by name). Its props are typed, `className` is for layout and
   comes last, the ref reaches the part's element, a glyph is a prop, and a door is a link.
3. **The classes.** The kit's own, through `variants()`, on the part's `className` or `render`; a state Base UI marks is
   drawn by the kit's own where it has one. A rule the part needs that kit.css lacks is a variant (Add a variant), read
   from tokens, with its name in `classes.json`.
4. **The two drawings.** The gallery's family "on Base UI" in `tooling/scripts/e2e-harness/kit-gallery.mjs`, every state
   as markup, and the entry of the same id on the running page, `tooling/scripts/e2e-harness/kit-behaves-entries.tsx`,
   drawn by the component itself.
5. **The browser test.** In `e2e/kit/kit-behaves.spec.ts`: how a person brings each state to that entry, and what a
   keyboard and a pointer do (Escape, Tab, the arrows, the typeahead), held against a fault planted in the page.
6. **Run** the build, typecheck, lint and test, then both specs (`corepack pnpm e2e:local -- e2e/kit/kit-behaves.spec.ts
   --scenario=kit`, and the same for `e2e/kit/kit.spec.ts`), and show them in the pull request. The route's JS budget does
   not move until a page draws the component, and then it is raised in that change (`check:bundle -- --raise
   js=<bytes>`).
