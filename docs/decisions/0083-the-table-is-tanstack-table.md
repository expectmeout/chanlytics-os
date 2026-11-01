# 0083 · The table is TanStack Table

**Status:** Decided by Ruben on 31 October 2026 ("i agree with you on tanstack table 9", then "Approve, start A" on the
design with its three open calls as written); Phase A built with this note, the old engine gone with it. Spec
`docs/superpowers/specs/2026-10-31-the-table-design.md` (§20 says what was built and where it departs from the plan);
lane `kit/the-table-is-tanstack-table`, from main's `1225c6a4b`. Step 0 (the spike) passed every gate (spec §18).
Phase B (Leads' narrowing in the read, migration 00500) is built on its lane `leads/narrowing-in-the-read`, not yet
merged (spec §21, §22). Phase C is a lane of its own after it.

## Context

People, Leads and the Pipeline's list draw their rows through a table engine the repository wrote: a renderer, a width
model, a resize edge, column helpers, a Columns menu and the state beside them (`surfaces/people/table/`,
`people/hooks/use-controls.ts`), about 1,900 lines with the hooks, and the pages narrow and sort their rows in four more
ways of their own (People's `plPeopleShown`, Leads' words, chip, fit and reach, the Pipeline's `P.sorted`). Twenty-two
merged changes touched the engine between 15 September and 31 October; its widths were rebuilt three times (#1519,
#1868, #1873); and #1978 fixed a claim of "all that match" that outlived a narrowing because the narrowings were four
states with no one place that knew of them. A table's state — sorting, filters, visibility, order, sizing, pinning,
selection — is not Chanlytics' core, and decision 0054 takes a dependency where it is the job's standard (Ruben, 31
October 2026: a capability that is not core is bought, never built).

## Decision

1. TanStack Table v9 owns every list's table state: `@tanstack/table-core` 9.3.1 and `@tanstack/store` 0.11.2, pinned
   in the dashboard, with the kit's own React binding over the core (`kit/table/use-table.ts`), since the official
   adapter cannot load under the node suite's react-server React (step 0). One feature set (`kit/table/features.ts`).
2. One kit component, `DataTable` (`surfaces/kit/table/`), draws every operational list; People, Leads and the
   Pipeline's list are column declarations, cells, a phone's card and a page's filters.
3. The old engine leaves in the change that brings the new one; no flag, no second engine. The saved view's wire shape
   does not change, so either deploy order and a revert are safe.
4. TanStack Virtual stays the window of rows; Base UI and the kit stay the controls.
5. A sort or filter over a paged read is the server's: Phase B moves Leads' narrowing into `leads_page`, Phase C
   People's sort, state and words into `people_list`.
6. Ruben's calls (spec §16): declared column sizes with one fill column a table and two modes (fill, sized); a
   narrowing never clears the selection; Phase C leaves smart lists in the browser.
7. Not taken: AG Grid, MUI X Data Grid, React Aria's Table, Glide (spec §2.7).

## Shape

The spec holds it whole: the parity list every behaviour is checked against (§4), the architecture and the binding
(§5), the product calls (§6), saved views and places (§7), the server's phases (§8), what leaves (§9), the proof (§11)
and the plan (§12).

## Steps

Phase A, one lane, one pull request: 0 the spike (done, GO); 1 baselines (goldens, shots, performance, bundle); 2 the kit
family; 3 People; 4 Leads; 5 the Pipeline's list; 6 the styles into `kit.css`; 7 the proof; 8 the docs (all built, spec
§20); 9 land. Phase B and Phase C each one pull request with its migration applied to production before its merge.

## Tests

The binding's test (`tooling/scripts/tests/table/table-binding.test.mjs`); the goldens of the old engine's orders and
narrowings, 1,120 People cases and 240 Leads cases, which the new table equals (`table/table-goldens.test.mjs`); the
table drawn (`table/data-table.test.mjs`), its widths (`table/table-widths.test.mjs`) and its saved view
(`table/table-view.test.mjs`); a test that no page narrows or sorts its rows outside the table
(`table/table-one-place.test.mjs`); the kit's Table family in the gallery, drawn by `DataTable` itself
(`styles/kit-components.test.mjs`) and held in a browser (`e2e/kit/kit.spec.ts`); the type test beside the component;
the browser journeys that name the table, and new ones for resize, reorder, range selection and the Filter; axe on the
three pages (spec §11).

## Risks

v9 is new (pinned exactly, core features only); the kit's binding must stay equal to the adapter's on upgrades; other
lanes editing the same pages; the width change owners may miss (Ruben's walk decides). Spec §13.

## Open questions

None at the decision. The width model stands or moves on Ruben's walk of Phase A.
