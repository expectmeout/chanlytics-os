---
name: chanlytics-interface
description: The dashboard's interface kit, its tokens and its looks. Use when a change draws or restyles anything in apps/dashboard (a page's markup or stylesheet; a button, tab, chip, card, sheet, field or menu; a colour, size, radius, shadow or blur; the theme or a look), or when a style measure or the kit's lint goes red.
---

# The interface kit

A look is a set of token values, a primitive is written once in the kit, and a page only composes
(`docs/plans/2026-09-28-the-interface-kit-and-its-looks.md`). Phases 1 and 2 built the ground: the tokens and their
roles, every shared primitive's rules in one stylesheet, six React components, and a gallery that draws the kit whole.
The pages still carry values and primitives of their own, and move onto the kit surface by surface (the plan's Phase
4, after each surface leaves the shell under decision 0015). Meanwhile the build refuses anything new of a page's own:
every count below may only fall.

## The seven rules

1. **A value is a token.** A colour, type size, radius, shadow, blur or duration is declared once, in
   `apps/dashboard/src/legacy/styles/tokens.css`, and a rule reads it with `var()`. Layout lengths (widths, gaps, grid
   tracks) stay with the page.
2. **A look is a set of token values.** Two settings on `<html>` and on every root that stamps a theme: `data-theme`,
   the mode (light or dark), and `data-look`, the finish (classic, and glass once Phase 5 draws it). A new look is a
   block in the tokens; a tweak is one token.
3. **A primitive is written once, in the kit** (`apps/dashboard/src/surfaces/kit/`): button, switch, segmented control,
   pill, chip, count, mark, panel, field, select, menu, sheet, row, face, meter, empty state, toast, tooltip.
4. **The kit reads only tokens; a page declares only layout**: display, grid, flex, gap, position, size, overflow.
5. **Variants are props.** A new need becomes a variant in the kit, with its gallery entry.
6. **A restructure proves it changed nothing**: by value for a move (decision 0015), by computed style for CSS.
7. **The build holds it.** Each rule is a measure that may only fall, or a lint error.

## Where things are

| What | Where |
| --- | --- |
| The tokens | `apps/dashboard/src/legacy/styles/tokens.css`: the scales on `:root`; each mode's colours and shadows on `[data-theme="light"]` and `[data-theme="dark"]`; the roles on `:root, [data-theme]`, which are Classic |
| The kit's rules | `apps/dashboard/src/surfaces/kit/kit.css`: a class for each thing it draws, reading roles; one breakpoint, 900px. Its header says what belongs there |
| Its registry | `apps/dashboard/src/surfaces/kit/classes.json`: the kit's class names (the house's own, no prefix) and, apart, the modifiers its rules name (`.active`, `.show`). The measures read it |
| Its components | `Button`, `LinkButton`, `Panel`, `Face`, `ListRow`, `Meter`: a module each in `apps/dashboard/src/surfaces/kit/`, a type test beside each, named in `index.ts`; `cx` and `variants` in `variants.ts` |
| The house's components over its classes | `StatePill`, `MoreMenu`, `Confirm`, `EmptyState`, `FailedRead`, `FieldError` and `usePPToast` in `apps/dashboard/src/legacy/components/data-bits.jsx`; `SurfaceTabs`; the record kit (`record-*.jsx`); `Icon`. Each is written in TSX when the first surface that draws it moves |
| The gallery | `tooling/scripts/e2e-harness/kit-gallery.mjs`: `node tooling/scripts/e2e-harness/server.mjs 3210 kit`, then http://localhost:3210/ (`t` turns the mode, `l` the look); `docs/runbook.md`, "See the kit" |
| Its checks | `e2e/kit/kit.spec.ts` in a browser; `tooling/scripts/tests/styles/kit-*.test.mjs` in `corepack pnpm test` |
| The measures | `tooling/scripts/tests/_measures.mjs` over `tooling/scripts/tests/_css.mjs`; the baselines in `tooling/scripts/tests/baselines/`; the register, `docs/debt.md` |

## Draw with the kit

1. Find the primitive in the gallery: its family, and the entry whose markup is what the page needs.
2. On a legacy page (`apps/dashboard/src/legacy/`), draw the house component where one exists (`MoreMenu` for a menu,
   never its markup typed again), and otherwise write the entry's classes (a button, a chip, a panel). On a surface
   under `apps/dashboard/src/surfaces/`, import the component from the kit's `index.ts`: a press that opens a page
   takes `href` and is drawn as a link, and `className` carries layout alone.
3. Place it from the page's own stylesheet with display, grid, flex, gap, position, size and overflow. Which variant
   it draws at which width (a glyph alone on a phone) is the page's too, at the width its own layout already changes
   (the Calendar's `crPhone`, 720px); the kit's own rules change at 900px alone. A value it needs is a token; a look
   it needs that the kit lacks is a variant (both below).

Done when the change adds no class that draws a primitive to a page's stylesheet, no selector restyling a kit class
from one (`.my-page .btn`), no literal type size, radius, shadow, colour or blur, and no `style` prop: the three
measures hold or fall.

## Add a variant

1. **The rule** in `kit.css`, on a class of its own as `.btn-sm` is, beside the primitive's other rules and reading
   roles and tokens; an `@media` in it names 900px alone.
2. **The name** in `classes.json`: a class that draws goes under `classes`; a state written as a word of its own
   (`.active`) under `modifiers`.
3. **The component**, where the family has one: the value in its `variants()` map and its props' type, and in the pin
   its type test holds on that union (`button.type-test.ts`).
4. **The gallery entry**, in the family in `kit-gallery.mjs`: the markup the component renders, with every state its
   rules name as a class or an attribute (disabled, a role's gate, `.active`); the spec forces the presses itself. A
   variant that reproduces a page's own rule takes a `twin`: a `source` entry drawing the page's class, which the spec
   holds equal to it, longhand for longhand.
5. **The drawing**, where the family has a component: the entry's id and the call that draws it, in the family's map
   in `tooling/scripts/tests/styles/kit-components.test.mjs` (`BUTTONS`, `PANELS`, …).
6. **Run** `corepack pnpm test` and `corepack pnpm e2e:local -- e2e/kit/kit.spec.ts --scenario=kit`, and show the
   spec's run in the pull request.

Done when both are green: the spec draws every selector of the new rule, and each token it reads moves what it feeds.

A new primitive takes the same steps under a short name in the house's style that no stylesheet uses yet, as a family
of its own in the gallery, with its component and type test beside the others. The kit's folder held 16 modules on 29
September, of the 20 a folder may hold (the tree-shape measure): before a change passes 20, each family takes a folder
of its own (`kit/button/`), the index naming it from there (the plan's Phase 3).

## Add a value

- A scale (tier 1): a step of type, space, radius or motion, on `:root` in `tokens.css`.
- A colour or a shadow the modes differ in: in both `[data-theme="light"]` and `[data-theme="dark"]`.
- A role (tier 2), what a value is for: on `:root, [data-theme]`, made from the scales and the mode's colours so that
  Classic draws what it drew. A role arrives with its first reader in `kit.css`.
- A component's own value (tier 3): on its class in `kit.css` (`--sheet-in`). No look sets it.
- A look: `docs/runbook.md`, "Add a look".

A new token says, in a comment beside it, what it is for.

## Prove a change

- **One that must move nothing on screen** (a literal becoming its token, a rule moving into the kit, a page trading
  its class for the kit's): record the base before editing, then the change against it, and show equal in the pull
  request. Name the recordings for the branch, since every worktree shares the folder they go to; a recording takes
  ten to fifteen minutes and needs the network.

  ```bash
  corepack pnpm check:style-equality -- record before-<branch>.json
  corepack pnpm check:style-equality -- record after-<branch>.json --against before-<branch>.json
  ```

  The pull request names each changed rule no recorded page drew, and how it was checked. `docs/runbook.md`, "Prove a
  style change", says what the recorder cannot see.
- **One meant to be seen**: the spec's run, and the gallery shot in both modes and both looks, at a desk and a phone
  width.
- **A move** under decision 0015: equal by value, as that decision says.

## The holds

Each test here is under `tooling/scripts/tests/`.

| Hold | What turns it red |
| --- | --- |
| `baselines/style-values.json` | a type size, radius, shadow, colour or blur written as a literal, counted per stylesheet; `tokens.css` is not measured, `kit.css` is |
| `baselines/kit-primitives.json` | a class that draws a primitive (listed in the registry, or named with a primitive's word: `btn`, `chip`, `tab`, `card`, `sheet`, `field`, `face`, `menu`, `pop`, `tip`, `toast`…) declared or restyled in any stylesheet but `kit.css`, counted per selector |
| `baselines/inline-styles.json` | a `style` prop under `src/legacy` or `src/surfaces`, counted per file |
| the raw-element lint (`eslint.config.mjs`) | a raw `<button>`, `<input>`, `<select>`, `<textarea>` or `<dialog>` in `src/surfaces` outside the kit; a surface moved before its kit step waits in `KIT_PENDING` |
| `styles/kit-css.test.mjs` | a class `kit.css` declares and the registry lacks; an `@media` width in `kit.css` other than 900px; a page outside the shell drawing a kit class while `app/globals.css` does not import the kit |
| `styles/kit-gallery.test.mjs` | a registry name no entry draws |
| `styles/kit-components.test.mjs` | a component and its gallery family parting, in a tag, a class, or an attribute a stylesheet or a screen reader reads |
| `corepack pnpm check:bundle` (CI, after the build) | the workspace route's CSS past its budget |

A fall is banked with `UPDATE_BASELINES=1 corepack pnpm test`, which rewrites the register's numbers too. A rise is
raised with `UPDATE_BASELINES=raise corepack pnpm test` (the bundle's with `corepack pnpm check:bundle -- --raise`,
after a dashboard build) in the same change as its row under "Rises" in `docs/debt.md`, argued in the pull request.
The one style prop the kit keeps, a meter part's share, is argued there.

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

The families the plan found built more than once (its Appendix A), with what a page takes instead:

| A page's own | The kit's |
| --- | --- |
| close or back button | `Button` with `iconOnly` and its `aria-label` (`.btn.btn-icon`) |
| segmented control | `RecordToggleGroup` (`.rec-seg`) |
| switch | `RecordSwitch` (`.rec-switch`) |
| sheet, modal | `RecordSheet` (`.rec-sheet`); the kit's `.sheet` is drawn by no page yet |
| menu, popover | `MoreMenu` (`.more-*`); a popover's surface is `Panel` with `variant="pop"` |
| select, picker | `RecordCombobox` (`.rec-combo`), `RecordField` (`.rec-field`), `.input` |
| face, initials | `Face` (`.face`) |
| empty state | `EmptyState`, and `FailedRead` for a read that failed (`.empty*`) |
| state pill | `StatePill` (`.pill`) |
| name chip | `.chip`, its × `.chip-x` |
| tab strip | `.stabs`, as `SurfaceTabs` draws it |
| card | `Panel`: `pane`, `inset` or `pop`; `sm` or `flush` |
| meter, bar | `Meter` (`.meter`) |
| tooltip, a native `title` | a `data-tip` attribute, drawn by `.ui-tip` on hover and on keyboard focus; `RecordTip` in the record kit |
| quiet link | `LinkButton` (`.link-btn`) |
| list row | `ListRow` (`.list-row`) |
| confirmation, flash | `Confirm` (`.confirm*`), `usePPToast` (`.pp-toast*`) |
| glyph | `Icon` (`apps/dashboard/src/legacy/components/icons.jsx`) |

## Waiting on Ruben

Whether the kit builds its interactive components (a sheet, a menu, a picker) on Base UI (`@base-ui/react`) is Ruben's
decision, and not yet taken. The Sheet's component waits on it: until then `kit.css` draws `.sheet`, the gallery holds
it, and a page's sheet is `RecordSheet`. Any other component with behaviour of its own (focus held inside, Escape, the
page behind held still) is the same question, so ask before writing one.
