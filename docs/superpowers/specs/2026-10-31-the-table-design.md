# The table is TanStack Table v9 — design

**Status:** Approved by Ruben on 31 October 2026 with §16's three calls as written ("Approve, start A"). Decision
`docs/decisions/0083-the-table-is-tanstack-table.md`; lane `kit/the-table-is-tanstack-table`, from main's `1225c6a4b`.
Written against `06951a961` and checked there; step 0 (§18) ran on `1225c6a4b` and changed the dependency and the
binding (§2.1, §5.3). §17 is the review that preceded approval.

**One sentence:** People, Leads and the Pipeline's list stop drawing their rows through a table engine of our own and
draw them through one kit component, `DataTable`, whose state — sorting, filters, column visibility, order, sizing,
pinning and selection — is TanStack Table v9's, and the engine we wrote leaves in the same change.

---

## 1. Why

### 1.1 What there is today

| Part | Where | Size |
| --- | --- | --- |
| The renderer | `surfaces/people/table/table.tsx` | 690 lines |
| The width model (base, min, max, a share of spare room; `fit`/`sized` modes) | `people/table/layout.ts` | 296 |
| The room's measure, live widths, drag and fit acts | `people/table/use-layout.ts` | 150 |
| The resize edge (pointer, keyboard slider, fit, reset) | `people/table/edge.tsx` | 181 |
| Column visibility helpers | `people/table/columns.ts` | 97 |
| The Columns menu | `people/table/columns-menu.tsx` | 98 |
| Sort, columns, layout, selection and saved-view state | `people/hooks/use-controls.ts` | 378 |
| People's filter and sort in the browser | `people/page/shown.ts` | ~70 |
| Leads' narrowing (words, chip, fit, reach) | `leads/page/reads.ts`, `leads/page/state.ts`, `leads/page/props.tsx` | ~120 across three |
| The window of rows (kept: it is TanStack Virtual's) | `kit/rows/shown-rows.ts`, `row-gap.tsx` | 319 |
| The table's styles | `legacy/styles/clients.css` (235), `leads.css` (25), `mobile.css` (7), `people.css` (2), three more (3) | ~272 selector lines |
| Column declarations | People 16 columns (681 lines), Leads 11 (409), Pipeline 9 + 2 phone (255) | 1,345 lines |

**Cost so far:** 22 merged changes touched the engine's files between 15 September and 31 October, the column widths
were rebuilt three times (#1519 drag, move and fit; #1868 fits every screen; #1873 spreadsheet-style edge), and a class
of bugs comes from state spread across hooks. The latest, fixed by #1978: "Select all N that match" survived a fit chip
that narrowed the rows, because the four ways a Leads view narrows (the box's words, the left-out chip, the fit, the
Filter) were four separate pieces of state with no one place that knew the rows were narrowed.

### 1.2 Where the data is sorted and filtered today

| Page | Read | Sorted | Filtered |
| --- | --- | --- | --- |
| People | `people_list`, 1,000 rows a page (`PEOPLE_PAGE`), keyset by last activity; a search past the first page asks the server and merges what it found (`plWithFound`) | **Browser**, over the loaded page (`plPeopleShown` + each column's `sortValue`) | **Browser**: state tab, smart list (a rule in contracts, `people/lists/builtin-lists.ts`, computed over the loaded rows), kept list (ids), words (`plMatcher`) |
| Leads | `leads_page`, 500 rows a page, keyset | **Server** (SQL sort key, seven sorts incl. `pile`) | Server: search, list, class. **Browser**: words, left-out chip, fit, the Filter's reach |
| Pipeline (list) | People's rows | **Contracts** (`P.sorted` over `P.of`'s groups) | Browser: words; the view (`P.of`) |

Two rules of the repository are bent by this: "Nothing in the UI states a fact the database cannot support" (a sort or a
filter over a partial page says something about the loaded rows, not the workspace), and "one derivation per fact"
(People's order is a browser derivation, Leads' is SQL's, the Pipeline's is contracts').

### 1.3 The rule this follows

Ruben, 31 October 2026: a capability that is not Chanlytics' core is bought, never built (memory
`feedback_buy_non_core_dont_build`; repository decision 0054). A table's state machine — sorting, filtering, column
visibility, order, sizing, resizing, pinning, selection — is commodity. What a row says, what a press does, how a phone
draws it, and which server read is the truth are Chanlytics'.

---

## 2. Decision

1. **TanStack Table v9 owns the table's state.** `@tanstack/table-core` 9.3.1 and `@tanstack/store` 0.11.2 (MIT, the
   core published 12 October 2026; the store has no dependencies), pinned exactly in `apps/dashboard/package.json` as
   `@tanstack/react-virtual` is (the pnpm catalog is for the tools every package shares). **Not `@tanstack/react-table`**
   (step 0, §18): its adapter names React's client hooks in an ESM import, which the suite's react-server React cannot
   link, so the kit carries the adapter's few lines itself (`kit/table/use-table.ts`, §5.3) over the core's own
   exported reactivity functions, and the app and its node tests run one binding. One feature set for the whole app.
   Taken under decision 0054's rule: the job's standard, one per job, and the code it replaces leaves in the change that
   takes it.
2. **One kit component draws every operational table:** `DataTable` in `apps/dashboard/src/surfaces/kit/table/`, a
   family of the kit with its gallery entries, its type test and its rules in `kit.css`. People, Leads and the
   Pipeline's list are column declarations, a row's cells, a card for a phone, and a page's filters over it — nothing
   more.
3. **TanStack Virtual stays the window of rows** (`kit/rows/shown-rows.ts`, taken 18 October 2026), fed by
   `table.getRowModel().rows`.
4. **Base UI and the kit stay the controls:** the Columns menu, the phone's sort sheet, the bulk bars, the Filter menu.
5. **The server is the authority wherever a read is paged.** Phase B moves Leads' narrowing into `leads_page`; Phase C
   moves People's sort, state and words into `people_list`. The component does not change between phases: a slice of
   state is applied by the browser or handed to the read (`manualSorting`, `manualFiltering`), and the read key carries
   it.
6. **No second engine, no flag.** The old engine is deleted in the change that adds the new one. The saved view's wire
   shape does not change, so either deploy order and a revert are both safe.
7. **Not taken:** AG Grid (368 KB gzip for Community 36.2; its server-side row model is Enterprise, $999–$1,498 a
   developer), MUI X Data Grid (124 KB gzip, Emotion and MUI theming beside our tokens), React Aria's Table (a second
   primitives system beside Base UI, arrow-key cell navigation, no filter state), Glide (canvas; no phone cards).
   Revisit only if Chanlytics becomes a spreadsheet product (inline editing, pivoting, cell-level keyboard).

---

## 3. Goals and non-goals

### Goals

- Every behaviour in §4 holds, proved equal before the old engine is deleted.
- **Table state lives in one place, TanStack's store, and nowhere else.** The seven slices — `sorting`,
  `columnFilters`, `globalFilter`, `columnVisibility`, `columnOrder`, `columnSizing`, `columnPinning`, `rowSelection`
  — have no shadow: no `sortBy`/`sortDir`/`colChoices`/`layoutChoices`/`q`/`chip`/`fitChip`/`reach` beside them. A test
  holds it (§11.2).
- Net code falls by at least 800 lines, stylesheets included (≈2,100 out, ≈1,100 in; §9).
- The table's styles become the kit's (`kit.css`), and the page stylesheets lose theirs (the `kit-primitives` and
  `style-values` measures fall, `inline-styles` does not rise).
- A column resize commits no row component; a sort press paints within the baseline.
- New for owners, at no extra code of ours: Shift-click selects a range of rows; in Phase B, "Select all N that match"
  works with a filter on.

### Non-goals

- The Inbox's and Conversations' lists (listboxes, not tables), the Pipeline's board, Reports' and Settings' read-only
  tables (§10), Ask's answer tables, the phone app.
- Inline editing, cell-by-cell arrow-key navigation, pivoting, row grouping by the library, column virtualization.
- Changing what any row says, any cell's words, or any press's act.
- Showing new counts anywhere (faceting is registered for Leads' existing chip counts, which are facets already; no
  new count is drawn).

---

## 4. What must still be true — the parity list

Each line is a check in the proof (§11). "Owner after" says who does it once this ships: **T** = TanStack Table,
**K** = the kit's `DataTable`, **P** = the page.

### 4.1 Columns

| Behaviour today | Where today | Owner after |
| --- | --- | --- |
| A column declared once: heading, sort, width, visibility default, cell, file words | `TableColumn` (`people/types.ts`) | **T** column def via `columnsFor<Row>()`, Chanlytics' extras in typed `meta` |
| A heading that is the workspace's word (Visits says the appointment word) | `labelOf(ColCtx)` | **P** header function reading `table.options.meta.ctx` |
| Default visibility by what the workspace is (`on`, `needs`: Visits with a calendar, Receptionist without) | `columns.ts` `plShows`, `plShownColumns` | **K** `visibilityOf(columns, ctx)` → `columnVisibility`; a column whose `needs` is false is not declared at all. **When `ctx` changes** (a calendar connects), the hook re-derives `visibility = defaults(ctx) ⊕ diff` and sets the atom, so an untouched Receptionist gives way to Visits as it does today |
| Person and the row's acts can't be hidden | `plLocked` | **T** `enableHiding: false` |
| A column put back to its default is no longer a choice (it follows the default again) | `pickColumn` | **K** the saved view stores the visibility **diff** against the defaults (§7); the absolute map is derived |
| Columns menu: row height, Fit all columns, Reset widths and order, the switches | `columns-menu.tsx` | **K** (moved), reading `table.getAllLeafColumns()`; a column with `meta.hidden` is never listed |
| Drag a heading to move a column; Alt+←/→ on its sort button or edge | `table.tsx` `headingDrag`, `shift` | **T** `columnOrder` + `setColumnOrder`; **K** keeps native drag (no new dependency) and the keys. Pinned columns sit outside `columnOrder` (the library's order of operations: pinning, then order) |
| Person stays at the left edge while the table scrolls sideways, with a hairline once it has | `pinned`, `scrolledX`, CSS | **T** `columnPinning.start = ['select', 'name']` (`'business'` on Leads) and `column.getStart('start')`; **K** sticky offsets and the hairline |
| The select column holds at 42px | `SELECT_COLUMN` | **K** a display column `select`, `enableResizing: false`, `enableHiding: false`, size 42 |
| **A phone draws one card a row whatever the desk's columns** | `phoneCols` swapped for `cols` | **K** the `columns` array is **never swapped by device**: on a phone the body draws `card(row)` and ignores visibility, and the declared columns keep sorting and filtering (a sort by a column the phone does not draw must still sort, which it could not if the columns were gone) |

### 4.2 Widths

| Behaviour today | Owner after |
| --- | --- |
| Drag an edge with mouse, finger or pen; the drag holds past the heading | **T** `header.getResizeHandler()` (mouse and touch; a pen is a mouse to the browser), `columnResizeMode: 'onChange'` |
| Keyboard: the edge is a slider; arrows step 16px, Shift 64px; Enter fits; Delete/Backspace resets | **K** `table.setColumnSizing`; a reset removes the column's key (back to its declared size, or to fill) |
| Double press on an edge fits the column to every row it holds (by its file words, so undrawn rows count), never past its max | **K** `widths.ts` (moved `fitWidthOf`/`plFitWidth`) → `setColumnSizing` |
| Fit all columns | **K** the same, for every resizable column |
| Least 56px, most 1,200px | **T** `minSize: 56`, `maxSize: 1200` as `defaultColumn`; the fill column alone has no `maxSize` (§5.4) |
| **Two modes.** `fit`: nobody sized a column, the columns share the box by their `grow` shares. `sized`: a member has, every width is theirs or the column's base, and the table is as wide as its columns with room after the last | **Replaced — product call §6.1, two modes kept but simpler:** **fill**: no member width on the table's one fill column (Person, Business, Name) → the table is its box's width and the fill column takes the room left. **sized**: the member has sized the fill column → the table is the sum of its widths, room after the last. The share model (`grow`, the first-drag freeze of every other column) goes |
| A drag changes a live width; the saved view gets it when the drag ends | **T** `columnSizing` live; **K** persists on the drag's end (`columnResizing.isResizingColumn` back to false), never mid-drag |
| **A first drag on the fill column starts from where it stands** (today: the frozen widths) | **K** on pointer-down on the fill column's edge, seed `columnSizing[fill] = its rendered width` before the library's handler runs, so the column does not jump to its declared size at the first pixel |

### 4.3 Sorting

| Behaviour today | Owner after |
| --- | --- |
| A heading that sorts is a button; quiet caret at rest, arrow once sorted; `aria-sort` | **K** head, reading `column.getIsSorted()` and drawing the arrow **only at `getSortIndex() === 0`** (the tiebreak entry never shows) |
| First press goes the column's way (`sortFirst`: names A→Z, soonest first; most first by default) | **T** `sortDescFirst` **set explicitly on every sortable column** (the library otherwise guesses from the data's type, `getAutoSortDir`, and its own note says to set it on nullable columns); a test holds that every sortable column declares it |
| A press on the sorted heading turns it round | **K** `sortBy(id)` on the hook (never `header.getToggleSortingHandler()`, which would add Shift multi-sort) → `table.setSorting([{ id, desc }, ...tiebreak])`; `enableSortingRemoval: false`, `enableMultiSort: false` |
| People: rows with nothing (no visit, no next step, no deal, unnamed) last whichever way | **T** accessor returns `undefined` for nothing + `sortUndefined: 'last'` (replaces the `dir` argument of `plVisitsSort`, `plSinceSort`, `plDealSort`, `plNextSort`, and `sortLast`) |
| People: ties fall to the most recent contact, whichever way | **K** the hook's `tiebreak: [{ id: 'last', desc: true }]` option, appended to every sorting it writes and applied only when the browser sorts; the library sorts by the entries in order, so it decides ties alone. Offers' own tie rule is the same mechanism |
| Leads: every sort is the server's (`leads_page`, seven sorts incl. `pile`) | **T** `manualSorting: true`; the sorting state is the read's key, as today; `pile` is a sort id with no column, which manual mode allows |
| A phone sorts from a sheet (Best fit first, Highest rated…, Nearest only with a centre) | **P** the sheet calls the hook's `sortBy(id, dir)` |
| The order a desk's table shows is one its member can see (a sort by a hidden column falls back to the page's first) | **K** `sortShownOf(table, first)` (today's `plSortShown` rule, unchanged), used for the head and for a server read's key |

### 4.4 Filters

| Page | Today | After (Phase A) | After (B / C) |
| --- | --- | --- | --- |
| People | state tab, smart list ids, kept list ids, words (`plMatcher`) in `plPeopleShown` | **T** `columnFilters` on the `state` column (`equals`) and on a hidden accessor column `lists` (accessor `p => p.id`, filter `ids.has`); `globalFilter` = the words, `globalFilterFn` reading `row.original` through `plMatcher` | **C:** `manualFiltering`; `people_list` takes state and words; lists stay the browser's (§8) |
| Leads | words (name, kind, area), left-out chip (`excludedBy`), fit, reach (`leadReaches`) | **T** `globalFilter` for the words; `columnFilters` on `fit` (a declared column), and on hidden accessor columns `excludedBy` and `reach` (accessor `l => l.slots`, filter `leadReaches`) | **B:** `manualFiltering`; `leads_page` takes `p_filters` |
| Pipeline | words; the view (`P.of`) | **T** `globalFilter`; the view stays contracts' | — |

- **A filter is a function**, never a registered name: a name (`"equals"`) is found only in the feature set's
  `filterFns` slot, and an unknown one filters nothing (step 0). Each filter column declares `filterFn: (row, id, value)
  => …`; the words' `globalFilterFn` is a function too.
- **A filter needs an accessor.** A filtered column is an accessor column, never a display column; a filter the table
  has no heading for lives on a hidden accessor column (`meta.hidden: true`: never in the Columns menu, never drawn,
  `columnVisibility[id] = false` fixed).
- **The words run once per row:** `enableGlobalFilter: false` on every column but the fill column, whose
  `globalFilterFn` reads `row.original`; the library otherwise runs the function per column and ORs the answers.
- **Narrowed** (a loaded row hidden by the page) is one expression: `columnFilters.length > 0 || globalFilter !== ''`.
  It replaces `narrowed`, `filtered`'s first half, and the four separate states.
- **Clear filters** is `table.resetColumnFilters(); table.resetGlobalFilter()` plus the page's own view reset.
- Filters live in the view's **place** (this tab, per view: restored on Back, gone in another view), never in the
  saved view — as the box's words and the Filter do today. `initialState` seeds them from the place; the place is
  written from the store.
- People's **"Save shown as a list"** rule (`viewRule`, `list-acts.tsx`) is derived from the filter state (the state
  filter → the rule), the same rule as today.
- People's server search (`found`) is merged into the table's `data` (`plWithFound(rows, found)`), as today.

### 4.5 Selection

| Behaviour today | Owner after |
| --- | --- |
| A box per row; select-all of the rows shown; indeterminate when some | **T** `rowSelection`, `getRowId: r => r.id`; indeterminate = `getIsSomeRowsSelected() && !getIsAllRowsSelected()` (v9's "some" means at least one) |
| Select-all: every row shown; pressed again with every shown row selected, **everything** clears (hidden selected rows too) | **K** `toggleAllRowsSelected(true)` over the filtered rows, else `resetRowSelection()`; the library's own deselect would leave hidden rows selected, which is not today's rule |
| The selection goes with the view, not the words: rows a filter hides stay selected, and the bars act on the rows shown | **T** keeps hidden rows' keys; bars read `getFilteredSelectedRowModel()`; "N more not shown" = selected − filtered selected |
| Cleared when the view changes (search, list, class) | **K** `resetRowSelection()` on the view's route key. **Product call §6.8:** the Excluded view's chip no longer clears it (today it does, through `selectionOf`), since a chip is a filter like the Filter and the fit, and every narrowing keeps the selection |
| "Select all N that match": a claim about the server's view, sent as the view's filters | **P/K** an `allMatching` flag beside `rowSelection`, dropped whenever the rows are narrowed (one effect, as #1978 has it) |
| A phone's Select: the face is the checkbox; while selecting, a tap selects | **K** phone card + `row.toggleSelected()` |
| x / Space selects the row under the cursor | **P** keyboard listener calls `row.toggleSelected()` |
| **New:** Shift-click selects the range between the last pick and this one | **T** `enableRowRangeSelection` (on by default) via `row.getToggleSelectedHandler()` on the box's `onChange` (React hands the Shift key through `nativeEvent`) |

### 4.6 Rows, keys, motion, phone

All **K** unless said; none of these is a library's job and each stays as it behaves today.

- Click opens the row, except when the press ended a text selection inside the row.
- A pointer resting on a row warms it (`warmsOnReach`), never a finger.
- The cursor: J/K or ↑/↓ move it, Enter opens, x/Space selects, `/` searches, Esc closes overlays then clears the
  selection (**P**, `use-place.ts`'s one listener — unchanged). The cursor's row is the one tab stop; a row focused by
  Tab or click takes the cursor.
- The window draws the rows on screen and a few either side, the cursor's always; `aria-rowcount` / `aria-rowindex`
  count the rows the filters leave, heads as row 1.
- Rows rise in on arrival and swap on a view change (`useRowsArrive`, `TABLE_BODIES`); `busy` dims the rows, never the
  heads.
- Groups (the Pipeline's stages): a `<tbody>` each under a header row with its count, meta and fold toggle; every row
  drawn; folding holds the head still (`holdStill`).
- Phone (≤900px): one cell a row, drawn by the page's `card(row)` prop (`phoneCols`/`rowClass` today), in the same
  `<table>` so the card rules hold; the columns stay declared (§4.1).
- Empty states are the page's; the foot says "N people" or "Showing N of M"; Load more is the page's.
- **Untouched, by name:** `kit/rows/shown-rows.ts`, `kit/motion/held-list.ts`, `people/hooks/use-place.ts`'s place
  keeping and scroll restore, `people/hooks/scroller.ts`. These hold the iPhone behaviour Ruben signed off in #1811.

### 4.7 Saved views and files

- The workspace keeps each member's view per scope (`memberships.views` through `member_view_set`, 00113, the route
  capped at 2,000 characters); the device keeps a copy (`chanlytics-{people,leads,pipeline}-view`); the server's copy
  wins once read; nothing is written back until the server's copy is known unless the member changed something here.
  **K** keeps every one of these rules (§7).
- People's file of the people shown follows the desk's columns and their order: **T** `getVisibleLeafColumns()` over
  the filtered, sorted rows.
- Leads' export is the server's, with the Filter's reach (#1954): unchanged in Phase A; in Phase B it takes every filter.

### 4.8 Every reader of "the rows shown" (so none is missed)

Each reads `table.getRowModel().rows` (or their ids) after the change; none reads a page-kept list:

- **People:** `shownIds` (the place's cursor list, Save shown as a list), `shown` (the phone menu's counts), the file.
- **Leads:** `shownIds` and `leadShown` for the peek's deck (prev/next), `leadMapPlot(leadShown)`, `chosen` for Add N,
  `selectedTitle`, `newSequenceFor`, `useLeadCells` (the photo warm), the place. The **pile** reads `leads.rows`
  (every lead of the search, on purpose, #1978) and stays so.
- **Pipeline:** `shown` and `ids` (the keys walk them), the board's cap.

---

## 5. Architecture

```
Postgres (people_list, leads_page, …)        authorized reads; Phase B/C: sort and filter keys
  ↓ readers (apps/dashboard/src/server/readers) → GET routes
  ↓ surfaces (useSurface, the surface seam)    one read per view key; the key carries server-applied state
Page (People / Leads / Pipeline)                columns, cells, card, filters, groups, bulk bars, keys
  ↓ useDataTable(...)                           kit/table: the one feature set, defaults, saved view, place
TanStack table-core v9 (kit/table/use-table)   state: sorting, filters, visibility, order, sizing, pinning, selection
  ↓ DataTable                                   kit/table: <table>, heads, edges, rows, groups, phone cards
TanStack Virtual (kit/rows/shown-rows.ts)       the window of rows
Base UI + kit                                   menus, sheets, buttons, the Filter
```

### 5.1 The one feature set

`kit/table/features.ts` — the only `tableFeatures` call in the app. A page that needs a slice not listed adds it here,
in review. Each row-model slot follows its feature in the call, as v9 requires.

```ts
import {
  tableFeatures,
  columnVisibilityFeature, columnOrderingFeature, columnPinningFeature,
  columnSizingFeature, columnResizingFeature,
  rowSortingFeature, createSortedRowModel,
  columnFilteringFeature, globalFilteringFeature, createFilteredRowModel,
  columnFacetingFeature, createFacetedRowModel, createFacetedUniqueValues,
  rowSelectionFeature,
  metaHelper,
} from "@tanstack/table-core";
import type { ChanlyticsColumnMeta, ChanlyticsTableMeta } from "./meta";

export const tableFeatureSet = tableFeatures({
  columnVisibilityFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnSizingFeature,
  columnResizingFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  columnFacetingFeature,
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  rowSelectionFeature,
  columnMeta: metaHelper<ChanlyticsColumnMeta>(),
  tableMeta: metaHelper<ChanlyticsTableMeta>(),
});
export type AppFeatures = typeof tableFeatureSet;
```

Not registered: pagination (the keyset "Load more" is the server's), grouping, expanding and aggregation (the
Pipeline's groups are contracts'), row pinning, cell selection, cell spanning.

### 5.2 A column

`ChanlyticsColumnMeta`: `label` (the Columns menu's word), `hint`, `align`, `fill` (this table's one fill column),
`fixed` (holds still: no resize, no move, no hide), `hidden` (a filter's column: never drawn, never listed),
`defaultOn` (`boolean | (ctx) => boolean`), `csv` (`{ head, headOf?, cell }`), `cellClass` (the `<td>`'s class for the
page's cell styles).

```ts
const col = columnsFor<PersonRowVM>(); // createColumnHelper<AppFeatures, PersonRowVM>()

export const peopleColumns = (ctx: ColCtx) => col.columns([
  col.accessor((p) => p.name || undefined, {          // unnamed: undefined, so it sorts last both ways
    id: "name",
    header: "Person",
    sortDescFirst: false,
    sortUndefined: "last",
    size: 260, minSize: 180,                          // no maxSize: the fill column may stand as wide as its box
    enableHiding: false,
    enableGlobalFilter: true,                         // the one column the words run on
    meta: { label: "Person", fill: true, csv: { head: "Name", cell: (p) => p.name } },
    cell: ({ row, table }) => <PersonCell p={row.original} x={table.options.meta.ctx} />,
  }),
  col.accessor((p) => p.nextStep ? dayNumber(p.nextStep) : undefined, {
    id: "next",
    header: "Next",
    sortDescFirst: false,
    sortUndefined: "last",
    size: 150,
    enableGlobalFilter: false,
    meta: { label: "Next step", defaultOn: true },
    cell: ({ row }) => <NextCell p={row.original} />,
  }),
  col.accessor((p) => p.id, {                         // a filter's column: lists
    id: "lists",
    enableSorting: false,
    enableGlobalFilter: false,
    filterFn: (row, _id, ids: ReadonlySet<string>) => ids.has(row.original.id),
    meta: { hidden: true },
  }),
  ...ctx.withCalendar ? [visitsColumn(ctx)] : [],      // `needs`: not declared where it can't apply
  // …
]);
```

The kit draws every `<td>` (its column id, alignment, sticky offset, class); a cell renders what is inside it. Today a
cell returns its whole `<td>`; that moves into the kit, so pinning and widths are the kit's in one place.

### 5.3 The hook

```ts
const table = useDataTable({
  scope: "people",                   // the saved view's key (§7)
  columns,                           // stable reference (useMemo on ctx)
  data: rows,                        // stable reference
  ctx: cellCtx,                      // the cells' doors, on table.options.meta
  defaults: { sorting: [{ id: "last", desc: true }], pinned: ["select", "name"] },
  tiebreak: [{ id: "last", desc: true }],        // People only; applied when the browser sorts
  server: { sorting: false, filtering: false },  // Leads in Phase A: { sorting: true }
  place,                             // this view's place: globalFilter, columnFilters, restored and written
  saved,                             // the workspace's copy of the view, once read
});
```

**The binding** (`kit/table/use-table.ts`, built in step 0): `useTable(options)` is the official adapter's `useTable`
line for line — `constructTable` with `renderPhaseReactivity({ createAtom, batch })` from `@tanstack/store`,
`table_setOptions` on every draw, `createRenderPhaseSource(table.store, shallow)` marked committed and
`table_publishExternalState` after the commit — and reads no state into its component. `useSlice(source, select)` is the
adapter's `Subscribe`/`useSelector`: `useSyncExternalStore` over a source (the table's store or one atom), kept by
reference while it compares equal shallowly. Every part that follows a slice reads it with `useSlice` where it is drawn.
An upgrade of table-core re-reads the adapter's `dist/useTable.js` and `dist/Subscribe.js` and keeps the binding equal.

Inside, in v9's own terms:

- **Persisted slices are external atoms** (`createAtom` from `@tanstack/store`, made once in a `useState` initialiser
  as the adapter's `useCreateAtom` does, passed as `atoms:`):
  `sorting`, `columnVisibility`, `columnOrder`, `columnSizing`. The guide recommends this for state you persist; it is
  what lets the hook set the server's copy when it lands (the atoms' `set`) and re-derive visibility when `ctx`
  changes. v9 has no `table.setState`; a slice is set through its atom or its own setter, never through the internal
  base atoms. A slice is owned in exactly one place (the guide: never both `atoms` and `state` for one slice).
- **Place slices are `initialState`** (`columnFilters`, `globalFilter`, from the place) and are written back to the
  place from the store's subscription. `rowSelection` and `columnPinning` are internal (`initialState` for pinning).
- `useTable({ features: tableFeatureSet, columns, data, getRowId: (r) => r.id, enableSortingRemoval: false,
  enableMultiSort: false, columnResizeMode: 'onChange', manualSorting, manualFiltering, defaultColumn: { minSize: 56,
  maxSize: 1200 }, initialState, atoms, meta: { ctx } })`.
- The component that holds the table reads no state (the binding subscribes to nothing by itself). The parts that must
  follow state read their own slice with `useSlice`:
  - the head: `sorting`, `columnOrder`, `columnVisibility`, `columnPinning`, `columnResizing` (the active edge);
  - the body: `sorting`, `columnFilters`, `globalFilter`, `columnVisibility`, `columnOrder`, `columnPinning`,
    `rowSelection`, and it calls `table.getRowModel()` inside its render; **a row is memoised on `row.original`,
    `row.id`, its selected flag, the cursor flag and the visible columns' signature — never on the `row` object, which
    the row model makes anew**;
  - widths render nothing: a layout effect subscribes to `table.atoms.columnSizing` and writes `--col-<id>` custom
    properties on the `<table>` and the `<col>` widths imperatively (the band's `--mark-x` is the precedent; no
    `style` prop, so the `inline-styles` measure stays where it is);
  - the bulk bars: `rowSelection`, `columnFilters`, `globalFilter`.
- Outside the table but beside it, by name, the four pieces of page state that are not table state: `density` (a
  look, kept in the saved view), `allMatching` (a claim about the server's view), the cursor (focus), and a phone's
  `selectMode`/`bulkSheet` (its sheet's step). §14 rule 1 names them so nothing else joins them.

### 5.4 Layout

- `<table>` with `table-layout: fixed`. In **fill** mode its `width` is 100% and its `min-width` is the sum of the other
  columns' widths plus the fill column's `minSize` (CSS fixed layout makes a table the greater of its `width` and its
  columns' sum, and a column with no width gets what is left; without the `min-width` the fill column would get zero
  in a narrow box). In **sized** mode its `width` is the sum of every column's width, and the room after the last
  column stays empty. The `<colgroup>` carries each sized column's width; the fill column's `<col>` has none in fill
  mode.
- Pinned start columns are `position: sticky` with `left: var(--pin-<id>)` from `column.getStart('start')`.
- Heads stick to the top (as today, `--pl-head` 39px), the row a key moves to stops below them (`scroll-padding-top`).
- Phone: no colgroup, one card cell a row; the kit's card rules.
- `kit.css` reads tokens for colour, type, radius, shadow and blur; the table's own lengths (39, 42, 49, 37, 84, 56,
  1200, 16, 64) are layout values and stay as the kit's own, under one `--tbl-*` name each so the component and the
  stylesheet read one number.

---

## 6. Product calls (made; each with its undo)

1. **Widths: declared size, one fill column, two modes.** The share-of-spare-room model (`grow`, the first-drag freeze
   of every other column) goes. Each column has a size; the table's fill column takes what is left until the member
   sizes it, after which the table is the sum of its widths with room after the last (today's `sized` mode, kept
   because a fixed-layout table that is narrower than its box would otherwise stretch every column); drag, fit, Fit
   all, Reset and reorder stay. *Why:* it is the part that was rebuilt three times, owners work on phones where the
   card draws, and a desk table that fills its box with one stretching column is how every CRM reads. *Undo:* a share
   pass in `widths.ts` that spreads free room by declared shares before the effect writes.
2. **Shift-click range selection is on** (the library's default). *Undo:* `enableRowRangeSelection: false`.
3. **Filters stay in the view's place, not the saved view.** *Undo:* add the slice to `toView`.
4. **No cell-by-cell arrow navigation.** Rows are records; J/K and the cursor stay. *Undo:* none needed; it is not
   built.
5. **The Pipeline's groups and order stay contracts'**, one derivation for the board and the list (`P.of`, `P.sorted`):
   the list's table runs `manualSorting`, holds the heading's sort state for its arrows, and draws contracts' groups in
   contracts' order (§19).
6. **Column reorder keeps native drag**, not dnd-kit: one way to drag is already in the app and works with `<table>`.
7. **The table's styles move into `kit.css`** under the kit's own names (`.tbl`, `.tbl-wrap`, `.tbl-scroll`,
   `.tbl-head`, `.tbl-sort`, `.tbl-edge`, `.tbl-row`, `.tbl-group`, `.tbl-foot`, `.tbl-card`), registered in
   `classes.json`; page stylesheets keep only their cells' own classes.
8. **A narrowing never clears the selection.** Today the Excluded view's chip clears it (`selectionOf` names the chip)
   while the words, the fit and the Filter keep it. After: every filter keeps it and the bars act on the rows shown;
   only a change of view (route) clears it. *Undo:* add the chip's filter to the selection's key.

---

## 7. Saved views and places

The wire shape does not change: `{ sortBy, sortDir, columns: { [id]: boolean }, widths?, order?, density?, list?,
…extra }` (`list` is Leads' rail row; `extra` is a page's own keys, the Pipeline's `{ layout }`). Two pure functions in
`kit/table/view.ts` translate:

- `fromView(view, defaults) → { sorting, columnVisibility, columnOrder, columnSizing }`: `sorting = [{ id: sortBy,
  desc: sortDir === 'desc' }]` (a column this page can't sort falls back to the page's first); `columnVisibility =
  defaults(ctx) ⊕ view.columns`; `columnOrder = view.order` (unknown ids dropped, new columns after); `columnSizing =
  view.widths` clamped to each column's bounds.
- `toView(state, defaults) → View`: the inverse, writing a key only where it differs from the default (`columns` is
  the diff, `widths` only where set, `order` only when moved, `density` only when compact), so a view nobody changed
  stays as small as today and under the route's 2,000 characters (a test holds the largest possible view under it).

`useSavedView(atoms, scope, saved)` keeps today's rules over the atoms: subscribe to the four persisted atoms → `toView`
→ the device copy on every change → the server copy once per change, one save at a time (`plViewSaver`), never before
the server's copy is known unless the member touched the view here (`viewTouched`); when the server's copy lands the
first time, the atoms take it once (`atom.set`) and nothing is written back for it. `density`, `list` and `extra` ride
in the same object from their own state.

The place (per tab, per view: `usePlPlace`) keeps the words, the filters (`columnFilters`, `globalFilter`), the cursor,
the scroll, the map — the same `extra` mechanism the Filter uses today — and seeds `initialState` when a view is
opened again.

Because the wire shape is unchanged, an old tab and a new tab read and write each other's views, and reverting the pull
request loses no member's view.

---

## 8. The server as the authority (Phases B and C)

### Phase B — Leads' narrowing in SQL

- Migration: `leads_page` is made again (its parameter list grows, so `drop function` then `create`, as 00430 did)
  with `p_filters jsonb` (`{ words?, excluded_by?, fit?, reach?: ['email'|'phone'] }`), applied in the `base` CTE with
  the same predicates the contracts hold (`leadReaches` over `email_state`, `phone_sources`, `phone_wrong`).
- Its callers take the same object: `server/readers/leads.ts`, `server/leads/lead-page.ts`, `lead-export.ts`, the bulk
  act by view, Ask's read tool (`ask/tools/read/leads.ts`), the typed client, `route-policy.json`, `docs/api.md`, and
  the pins (`reads-never-write`, `refresh-coverage`).
- The read key and the route carry the filters (release C's chip grammar, `docs/plans/2026-09-19-lead-finder-C-extras.md`
  item 2: `clients/leads:…:email-checked:fit-strong`), so a filtered view is a citable, saved, shareable address.
- The table runs `manualFiltering: true`; "Showing N of M" is the server's count; **"Select all N that match" works
  with a filter on** (today it is hidden while narrowed, because the server did not know the filter).
- Applied to production before the merge, on Ruben's word (the repository's road for a migration).

### Phase C — People's sort, state and words in SQL

- Migration: `people_list` is made again with `p_sort`, `p_dir`, `p_state`, `p_saved_id` and a keyset per sort key (the
  pattern `leads_page` uses: one packed sort key, the row's id as the tiebreak). A kept list (`p_saved_id`) is a
  membership the database holds, so it joins in SQL.
- **Smart lists stay the browser's in Phase C.** Their rules live in contracts (`people/lists/builtin-lists.ts`) and
  run over the loaded rows; moving them to SQL is a decision of its own (one rule per list, held equal to contracts'),
  and until then a smart list over a workspace past 1,000 people is a browser filter over the first page, as today.
- Each column's `sortValue` becomes the SQL key and leaves the browser (one derivation); `sortUndefined: 'last'` becomes
  `NULLS LAST` both ways; the words become the server's search (`p_query`, which exists).
- `manualSorting` and `manualFiltering` on People; the 1,000-row page stops mattering to sort, state and words.
- Schedule: before any workspace passes 1,000 people. First measure the largest workspace's count on production.

Neither phase changes `DataTable`, the column declarations or the bulk bars: only the page's `server` flags and the read.

---

## 9. What leaves (deleted in Phase A), and what arrives

| Leaves | Lines | Replaced by |
| --- | --- | --- |
| `people/table/table.tsx` | 690 | `kit/table/data-table.tsx`, `head.tsx`, `rows.tsx`, `groups.tsx` |
| `people/table/layout.ts` | 296 | TanStack sizing + `kit/table/widths.ts` (the two modes, fit measure, the CSS-var writer, fill seeding) |
| `people/table/use-layout.ts` | 150 | TanStack `columnSizing`/`columnResizing`; the room's measure is no longer needed |
| `people/table/edge.tsx` | 181 | `kit/table/edge.tsx` over `getResizeHandler()` (keyboard, fit and seeding only) |
| `people/table/columns.ts` | 97 | TanStack visibility + `visibilityOf` + `sortShownOf` |
| `people/table/columns-menu.tsx` | 98 | moved, not deleted: `kit/table/columns-menu.tsx` |
| `use-controls.ts`'s sort, columns, layout and saved-view state | ~250 of 378 | `useDataTable` + `useSavedView` |
| `people/page/shown.ts` filter and sort | ~60 | TanStack filters and sort functions |
| `cells/sorts.ts` direction arguments, `sortLast` | ~20 | `sortUndefined: 'last'` + accessors |
| Leads' `chip`, `fitChip`, `reach` state, `useLeadRows` narrowing, `narrowed` | ~120 | `columnFilters` + `globalFilter` |
| (`P.sorted` stays: it orders the board and the list alike, §19) | 0 | — |
| Table selectors in page stylesheets | ~272 | `kit.css` rules under `.tbl*` (~200) |
| `TableColumn`, `TableCtx`, `ColCtx`'s table use (`people/types.ts`) | ~60 | TanStack `ColumnDef<AppFeatures, R>` + `ChanlyticsColumnMeta` |
| **Total out** | **≈2,100** | **In: ≈900 TSX in `kit/table/` + ≈200 CSS = ≈1,100** |

Net ≈ −1,000 with the stylesheets, ≈ −700 without; the gate is −800 (§11.3). The number is a check, not the point:
the point is that no table state exists outside the store.

---

## 10. Scope of "a table" from here on

- **Operational lists** (records a member sorts, filters, selects, acts on): `DataTable`, always. Today: People,
  Leads, the Pipeline's list. Candidates when they next change: a sequence's leads, and Conversations if it ever
  becomes a table.
- **Read-only tables** (a few rows, nothing to sort or pick): semantic HTML, no engine. Today: Reports' lenses
  (`blocks.tsx`, `campaigns-reach-outs.tsx`, `ads-cards.tsx`), Settings' roles, notifications and autonomy grids, the
  import preview, the charts' data table, Ads results, Ask's answer tables.
- **Rule for review:** no table state outside TanStack. A pull request that adds sorting, filtering, visibility,
  ordering, sizing or selection state for a list anywhere else is refused.

---

## 11. Proof

### 11.1 Before anything changes (baselines)

1. **Goldens:** run today's code over fixtures and save the answers as JSON in the lane: `plPeopleShown` for every sort
   key × direction × state tab × list × words; Leads' narrowing for every combination of words, chip, fit and reach;
   (the Pipeline's order stays contracts', §19, so it needs no golden). The new table must give the same ids in the
   same order for every one.
2. **Screens:** the reach rig pattern (a local `next dev`, writes answered locally, made-up rows over the e2e
   workspace): People, Leads and the Pipeline at 1440, 1280, 1024 and 390, light and dark, Glass — rest, sorted,
   selecting, a column dragged, the fill column dragged, a section folded, empty, loading. Saved as before shots.
3. **Performance** (median of 10, same machine, production build): People's tab switch desk and phone; Leads' 500-row
   view switch; a sort press to the next paint on 1,000 rows; a 200px column drag (frame times, and how many row
   components commit during it); memory after 20 view switches.
4. **Bundle:** the dashboard route's JS and each page's own JS, from a CI-placeholder build (`check:bundle`).

### 11.2 Tests

- **Node, pure:** `fromView`/`toView` round trips, defaults, unknown ids, the 2,000-character bound; the visibility
  re-derivation when `ctx` changes; every sort function against the goldens, and every sortable column declaring
  `sortDescFirst`; every filter against the goldens; selection rules (cleared on the route, kept through a filter, the
  claim dropped on narrowing, the hidden count, select-all clearing everything); width bounds, fit, keyboard steps,
  reorder, the two modes, fill seeding.
- **The one-place test:** a source-tree test (AST, as the measures read it) that no module under `surfaces/people`,
  `surfaces/leads` or `surfaces/kit/table` keeps a `useState`/`useReducer` whose name says sort, column, width, order,
  filter, chip or selection. It is the rule of §14.1, held.
- **Node, drawn:** `DataTable` on the shared stub React (`_legacy-react.mjs`): heads, rows, groups, phone cards, empty,
  busy, `aria-*`. The kit's binding reads only hooks the stub has (`useState`, `useRef`, `useCallback`,
  `useLayoutEffect`, `useSyncExternalStore`), so the stub takes no change (step 0; the `useDebugValue` this paragraph
  once asked for was the React adapter's shim's, which the lane does not take).
- **The 14 node test files that import the engine** are re-pointed: `people/people-table.test.mjs` and
  `people/table-layout.test.mjs` are rewritten for the kit; `people/people-honest`, `leads/finder/leads-honest`,
  `deals/pipeline`, `people/lists/saved-lists`, `calendar/calendar-people`, `consent/marketing-consent`,
  `conversations/inbox/inbox-list-honest`, `shell/state-pill`, `shell/words/one-word-for-one-thing`,
  `shell/views/a-list-that-scrolls-itself…`, `repo/settings/changed-tests` keep their assertions over the new modules;
  `repo/legacy-harness.test.mjs`'s list of names that must not be drawn by a legacy page (`PeopleTable`,
  `usePlControls`, `plSortKeys`…) is updated to the names that remain.
- **Kit:** the gallery family "Table" (desk rest, sorted, selecting, focused, grouped, folded, empty, loading, phone
  card, phone selecting), `kit-components.test.mjs` pins, `kit-css.test.mjs`, `kit-gallery.test.mjs`, the type test,
  and `e2e/kit/kit.spec.ts --scenario=kit` (`DataTable` is not on Base UI, so `kit-behaves` is not involved; the
  Columns menu already is).
- **Browser (Playwright):** the 13 specs that name the table today pass, `e2e/signals.ts` among the helpers; the class
  selectors among them (`cl-table`, `pl-table`, `cl-th-sort`…) move to test ids, and `people-table-scroll`,
  `select-all`, `row-select`, `table-section`, `people-columns` keep their ids. New: resize, reorder and hide survive a
  reload and arrive on a second device (the server's copy); the fill column dragged then reset; Shift-click selects a
  range; Filter + select all + Add to a sequence; a phone card selects by its face. `@axe-core/playwright` on People,
  Leads and the Pipeline (decision 0054 already takes it "with the next change to the browser journeys").
- **CI:** the pull request carries the `suite` label (both time-zone legs), since every People surface moves.

### 11.3 Acceptance (all required before the old engine is deleted)

- Every golden equal.
- Every §4 line checked in the running app, desk and phone, and the after shots reviewed against the before shots
  (differences listed: the width model is the one expected change).
- A 200px drag commits **zero** row components; frame times at or under the baseline.
- Tab switch, view switch and sort press at or under their baselines.
- Net lines removed ≥ 800 (stylesheets included); the one-place test green; no measure rises without a `Debt:` line
  that argues it.
- **Bundle:** table-core, the store and the kit's binding cost **18.8 KB gzip** for exactly §5.1's imports (measured in
  step 0: esbuild, minified, React external; table-core 63.5 KB of the 69.0 KB minified, the store 4.4 KB, the binding
  1.1 KB); our own table code in the page shrinks by an estimated 6–8 KB. Gate: the People page's own JS grows by **no
  more than 20 KB gzip**, measured again at step 7 from a production build, argued in the PR's `Bundle:` line.
- e2e and axe green; the full suite green on both legs.

---

## 12. Plan (Phase A, one lane, one pull request)

Lane `cm-the-table`, branch `kit/the-table-is-tanstack-table`, from main. Nothing pushed until it is whole and Ruben
says so; one PR (his rules).

| Step | Work | Exit |
| --- | --- | --- |
| 0. Spike (½–1 day) — **done, GO (§18)** | Pin the library in the dashboard's `package.json`; draw People's real columns through a bare `useTable` in the kit; prove the stub React hosts it (`useDebugValue`); the CSS-variable width writer under `table-layout: fixed` in both modes, in Glass; seed the fill column on a drag; a first bundle reading | Go/no-go numbers written into the spec: stub OK, zero row commits on a drag, the fill column does not jump, bundle within gate. **No-go stops the lane and reports.** |
| 1. Baselines | §11.1 goldens, shots, performance, bundle | Saved in the lane; numbers in the spec |
| 2. The kit family | `kit/table/`: `features.ts`, `meta.ts`, `columns.ts` (`columnsFor`, `visibilityOf`, `sortShownOf`), `use-data-table.ts`, `view.ts` (+ `useSavedView`), `data-table.tsx`, `head.tsx`, `edge.tsx`, `widths.ts`, `rows.tsx`, `groups.tsx`, `columns-menu.tsx`, the type test (13 modules, under the folder's 20); `kit.css` rules + `classes.json`; gallery family; kit tests; the one-place test | Kit tests and gallery spec green |
| 3. People | Columns to `columnsFor`; filters, sorts and the tiebreak to TanStack; `viewRule` from the filter state; `use-controls.ts` reduced to phone, toast, the claim and search refs; delete `people/table/*`, `shown.ts`'s filter/sort, `sorts.ts`'s `dir` | People's goldens equal; People's specs green |
| 4. Leads | Columns; `manualSorting` with `pile`; words, chip, fit, reach as filters; every reader of §4.8 re-pointed; bulk bars over the filtered selected rows; delete the four states | Leads' goldens equal; Leads' specs green; the Filter and #1978's rules hold; §6.8 checked |
| 5. Pipeline list | Columns; `manualSorting` (contracts' `P.sorted` orders board and list alike); `globalFilter`; groups and their order from contracts | The list's rows equal contracts' groups in contracts' order; board untouched |
| 6. Styles | The ~272 selector lines move to `kit.css` under `.tbl*`; page stylesheets keep their cells' classes | `kit-primitives` and `style-values` fall; shots reviewed |
| 7. Proof | §11.3 in full; the after shots and numbers in the PR | All acceptance lines met |
| 8. Docs | Decision 0083 + README row; 0054's table gains the TanStack Table row; `legacy/CLAUDE.md`'s table lines (its `people-globals.ts` line is already stale); `docs/system-prd.md`'s People/Leads/Pipeline rows; `CLAUDE.md`'s canonical-example table gains "An operational table → `kit/table/`" | Docs tests green |
| 9. Ship | `land.mjs` (main merged once, right before the push); merge on green; smoke; Ruben's look | On production |

Phase B and Phase C are lanes of their own after Phase A lands, each one PR with its migration applied to production
before its merge.

**Effort (honest):** Phase A four to six working days of build (the review added the two width modes, the fill seeding,
the atoms-based view and the one-place test), plus Ruben's walk of People, Leads and the Pipeline on a desk and a
phone. Phase B one to two days. Phase C two to three days.

---

## 13. Risks

| Risk | Mitigation |
| --- | --- |
| v9 is new (9.3.1, 12 October 2026) | Exact pin; only core features; step 0's spike; read the open issues for the features registered before the lane |
| The stub React can't host the adapter | **Met in step 0:** it cannot ("does not provide an export named 'createContext'"); the kit's binding over table-core replaced it (§5.3), and the stub hosts that with no change to the stub |
| The kit's binding drifts from the adapter's | Pinned versions; an upgrade re-reads the adapter's `useTable.js` and `Subscribe.js` and keeps `use-table.ts` equal; the binding's test (`tooling/scripts/tests/table/table-binding.test.mjs`) runs sort, filters, words and selection through it |
| Redraw storms (v9's default selector redraws on any state) | The kit's binding subscribes its holder to nothing; parts read their slices with `useSlice`; rows memoised on values, not on `row`; the zero-commit drag gate (met in step 0) |
| The fill column jumps at the first drag, or every column stretches once it is sized | The two modes (§4.2, §5.4) and the seed at pointer-down, proved in step 0 and shot in step 1 |
| A slice owned twice (`atoms` and `state`) behaves oddly | §5.3 names one owner per slice; a test asserts the hook passes each slice once |
| The iPhone behaviour signed off in #1811 | Its modules are untouched by name (§4.6); phone shots before and after |
| Other lanes editing People, Leads or the Pipeline meanwhile | Announce the lane; merge main daily; the column files are the conflict surface, and their cells' contents don't move |
| Saved views written by an old tab | The wire shape is unchanged; `fromView` drops what it doesn't know |
| Bundle growth | 22.9 KB measured; gated at step 0 and step 7 (§11.3); the deleted code offsets part of it |
| The CSS move changes a pixel somewhere | Before/after shots at four widths, two themes; computed styles compared for the table's elements |
| A width model owners miss | Product call §6.1 states the undo; Ruben's walk decides |
| Phase C's smart lists | Scoped out of C on purpose (§8); their move to SQL is its own decision |

---

## 14. Engineering rules from here on

1. **No table state outside TanStack Table.** Sorting, filters, visibility, order, sizing, pinning and selection for a
   list are its slices or they are not built. The named exceptions, and the only ones: `density` (a look), the
   `allMatching` claim, the cursor, and a phone's `selectMode`/`bulkSheet`. The one-place test holds it.
2. One feature set (`kit/table/features.ts`); a new slice is added there, in review.
3. A column is declared once, with `columnsFor<Row>()`; Chanlytics' extras live in typed `meta`; every sortable column
   declares `sortDescFirst`; a filtered column is an accessor column.
4. The kit draws every `<td>` and `<th>`; a cell draws its content; a phone draws the page's card.
5. Widths are written imperatively from the store; no `style` prop.
6. A sort or filter over a paged read is the server's (Phases B and C); the browser filters only rows it holds whole.
7. Read-only tables are semantic HTML.
8. Every table change proves itself by goldens (order and membership), shots (four widths, two themes) and the drag
   gate.

---

## 15. What Ruben checks on production

1. People: sort by each heading both ways; unnamed and "nothing scheduled" rows stay last; ties are most recent first.
2. Drag Person wider: nothing else moves; reload, open on the phone and a second computer: the width is kept; Reset
   widths puts it back and Person fills the box again.
3. Move a column by dragging its heading; hide one from Columns; reload.
4. Select three, Shift-click a fourth further down: the range is selected.
5. Leads: the Filter (Checked email), select all, Add to a sequence: only the email list goes.
6. Leads: a fit chip after "Select all N that match": the bar counts the rows shown. The Excluded view's chip keeps
   what was selected (§6.8).
7. Pipeline: fold and open a stage; sort within stages; the board unchanged.
8. Phone: People and Leads cards, Select, Sort sheet (a sort by a column the phone never draws still sorts), the
   Filter's chips, Back lands where you were.
9. Nothing looks different except the width behaviour (§6.1).

---

## 16. Open for Ruben's word

1. §6.1 the width model (declared sizes, one fill column, two modes).
2. §6.8 a chip no longer clears the selection.
3. Phase C without smart lists in SQL, and its timing (before any workspace passes 1,000 people).

---

## 17. Review log (second pass, 31 October 2026)

What the line-by-line review against v9's guides and main's code changed from v1:

- **`table.setState` does not exist in v9.** Persisted slices are now external atoms (`useCreateAtom`, `atoms:`), set
  through the atoms when the server's copy lands; place slices are `initialState`. One owner per slice (§5.3, §7).
- **`sortDescFirst` is now explicit on every sortable column**: the library guesses direction from the data's type
  otherwise, and its own guide says to set it on nullable columns (§4.3).
- **The tiebreak** ("most recent first whichever way") cannot be a plain sort function, because the library negates a
  function's answer for a descending sort. It is a second sorting entry the hook appends and the head never shows
  (`getSortIndex() === 0`); `enableMultiSort: false`; the head never uses `getToggleSortingHandler` (§4.3).
- **A filter needs an accessor**: the lists, `excludedBy` and reach filters are hidden accessor columns, not display
  columns (§4.4, §5.2).
- **The words run once per row**: global filtering is enabled on one column only (§4.4).
- **Phone columns are never swapped for the desk's**: a sort by a column the phone does not draw would otherwise stop
  sorting, since the library drops a sort whose column is gone. The phone draws a `card` and keeps the columns (§4.1).
- **Select-all's clear** is `resetRowSelection()`, not the library's deselect, which would leave hidden selected rows
  selected (§4.5).
- **The width model needs two modes after all** (fill and sized), or a fixed-layout table narrower than its box would
  stretch every column once the fill column is sized; and the fill column must be seeded with its rendered width at
  the first drag or it jumps (§4.2, §5.4, §6.1).
- **The Excluded chip clears the selection today** and no other narrowing does: made a product call (§6.8).
- **Visibility is re-derived when `ctx` changes** (a calendar connects), as today (§4.1, §7).
- **Phase C cannot move smart lists to SQL**: their rules are contracts', run in the browser; scoped out (§8).
- **The dependency tree is five packages, all MIT** (`react-table`, `table-core`, `react-store`, `store`,
  `use-sync-external-store`); pinned in the dashboard's `package.json`, not the pnpm catalog, which is for shared
  tools (§2.1, §12 step 0).
- **The stub React needs `useDebugValue`**, named from `react-store`'s source, not guessed (§11.2).
- **The bundle cost is measured, not estimated**: 22.9 KB gzip tree-shaken; the gate is +20 KB on the People page
  (§11.3).
- **The line count was wrong in v1** ("≥1,000 net" with 1,500 out and 900 in). Recounted with stylesheets: ≈2,100
  out, ≈1,100 in, gate −800; the real gate is the one-place test (§3, §9, §11.2).
- **Every reader of the shown rows is listed** (§4.8) so the pile, the deck, the map, the bulk adds and the places are
  re-pointed on purpose.
- **Phase B's callers are listed** (§8), and `leads_page` is made again, not altered.
- Effort raised from three–five to four–six days for Phase A.

---

## 18. Step 0 — the spike (31 October 2026, on `1225c6a4b`): GO

| Gate | Result |
| --- | --- |
| The suite's stub React hosts the table | **The adapter does not:** `@tanstack/react-table` fails to link under the react-server condition (`The requested module 'react' does not provide an export named 'createContext'`), as Base UI does (`tooling/scripts/tests/shared/_stand-in-base-ui.mjs`). **table-core does**, with every feature and row model. The kit's binding over it (`use-table.ts`) draws on the stub with no change to the stub: `tooling/scripts/tests/table/table-binding.test.mjs` passes — sort A→Z and Z→A with the unnamed last both ways (`sortUndefined: 'last'`), most calls first (`sortDescFirst`), a column filter, the words through one column, a row a filter hides staying selected and out of the filtered selected rows. |
| A drag commits no row | People's real columns and rows through the binding, in the real app (local `next dev`, the e2e workspace, 1440 wide), widths written from the `columnSizing` atom into the `<colgroup>` and the table's attributes: **0 row commits** dragging State +80 and Person +200. Today's table under the same harness: also 0 (its rows are memoised). |
| Frame times at or under the baseline | Same drags, same harness: mean frame gap 65 / 58 ms (spike) against 67 / 59 ms (today); max 167 / 83 against 150 / 117. Equal within the headless harness's noise (it has no vsync); the real reading is step 1's and step 7's, at scale, from a production build. |
| The fill column does not jump | Fill mode: the table is its box (898 of 898 px) and State +80 takes its room from Person (380 → 300). Person's first drag step: 300 → 310, exactly the pointer's 10 px (seeded at its rendered width), then sized mode with the table the sum of its columns (1,098 px). Today the first drag of any column switches the whole table to sized and it grows past its box (978 px): the intended change (§6.1). |
| Bundle within the gate | 18.8 KB gzip for core, store and binding (§11.3), under the +20 KB gate before the deleted code is counted. |

What step 0 changed in this design: the dependency (table-core and the store, not the React adapter; §2.1), the binding
(§5.3), filters as functions (§4.4), the measured bundle (§11.3), and the architecture's read layer (the surface seam,
not TanStack Query, which no package of main takes).

## 19. Step 1 — the baselines (31 October 2026, on `1225c6a4b`)

- **Goldens** (`tooling/scripts/tests/table/goldens/`, recorded by `record-goldens.test.mjs` from the engine that
  leaves, over `_fixtures.mjs`): `people-shown.json`, 1,120 cases — `plPeopleShown` over every sortable heading and an
  unknown one × both ways × four state tabs × with and without a list × six words, and with the server's found rows;
  `leads-shown.json`, 240 cases — `useLeadRows` over five words × three left-out chips (the reason's words, as a row
  holds them) × four fits × four reaches, with whether the rows are narrowed. What the goldens pin that the design must
  meet: names compare in the reader's order (`Intl.Collator`, numeric, base: "house 2" before "house 10", "Élodie" beside
  "Elodie"); a name that is only a number or an address sorts last both ways; no last contact sorts first ascending and
  last descending (`-Infinity`, not undefined); Offers' ties fall to the last contact in the sort's own way, every other
  tie to the most recent contact whichever way; the found rows follow the loaded ones.
- **Shots** (24, the rig's `table` scenario: 30 made-up people with deals, 12 leads of every reach): People, Leads and the
  Pipeline at 1440, 1024 and 390, dark and light, at rest; People sorted by Person and selecting three; Leads with the
  Filter's Checked email. In the session's scratchpad (`shots/before/`); the after shots land beside them.
- **Performance** (production build of `1225c6a4b` with the lane's environment, behind the rig, `table-1000`: 1,000
  people, 16 rows drawn by the window; medians of 7): switch to People 48 ms desk / 37 ms phone; to Leads 52 / 41 ms; a
  sort press to the new order painted 32 ms; a 200px drag of State 0 ms of long tasks, mean frame 17–26 ms, max 33–50 ms;
  heap after 20 switches 40 MB.
- **Bundle** (the same build, `check:bundle --record`): route JS 747,467 bytes gzipped; People's page (People, Leads and
  the Pipeline) 127,823. Step 7 builds the lane the same way and is compared with `--against` this record.
- **Corrections the baselines forced on the design:** the Pipeline's sort stays contracts' (`pipelineSorted` sorts the
  board's groups and the list's alike, so the list's table runs `manualSorting` as Leads' does: one order for both
  views); People's Person sorts with its own collator, not the library's text sort; People's tiebreak is per column
  (Offers' follows the sort's way); the filter columns' ids are `f_in_list`, `f_excluded` and `f_reach` (People already
  has a `lists` column and Leads a `reach` column).

## 20. Phase A as built (31 October 2026)

What was built, measured against the plan, and every place it departs from it.

**The kit's family** (`apps/dashboard/src/surfaces/kit/table/`, 14 modules and the type test): `features.ts`, `meta.ts`,
`use-table.ts` (the binding), `columns.ts`, `state.ts`, `view.ts`, `use-data-table.ts`, `widths.ts`, `edge.tsx`,
`head.tsx`, `rows.tsx`, `groups.tsx`, `data-table.tsx`, `columns-menu.tsx`, `table.type-test.ts`.

- **The seam is the kit's column, not TanStack's.** A page declares a column once as a `DataColumn` (its heading, its
  sort as `{ first, value }`, its width, `fill` or `fixed`, a hidden column's `filter`, its file words, its cell), and
  the kit makes table-core's definitions from it (`use-data-table.ts`). A cell still draws its own `<td>`; the row marks
  it with its column and its pin (`data-col`, `data-pin`), so where a column stands is the kit's in one place.
- **The state is the page's atoms, handed to table-core** (`useTableState`, table-core's `atoms` option). The heads show
  the member's sort; the table applies it as controlled state with the page's tiebreak after it (`sortThen`): People's
  Person ties fall to `f_name`, a hidden column of the name's words, then the last contact; Offers' to the last contact
  in the sort's own way; every other column's to the most recent contact. The goldens hold all of it.
- **One place narrows and sorts.** The words are the table's global filter, run once a row on the fill column through
  the page's matcher; Leads' left-out chip, Fit and reach are the filter columns `f_excluded`, `fit` and `f_reach`. A
  paged read's order is the server's (Leads) or contracts' (the Pipeline), drawn as it comes. `table-one-place.test.mjs`
  refuses a page that narrows or sorts anywhere else.
- **The saved view** keeps its wire shape: the sort, the columns, the widths, the order, the row height and a page's own
  keys. The words, the filters and the selection are the view's place and its moment, never saved. A save is made as an
  atom moves, at once (no batching on a microtask), and none while a width is being dragged; the workspace's copy is
  taken once, as it lands; a column put back to its default drops its key.
- **The edge is the kit's own**, not table-core's resize handler: it holds the floor at the heading's words, a press that
  moved nothing keeps no width, and it is the keyboard's slider (arrows, Enter fits, Delete resets, Alt moves).
- **Not registered:** faceting, column pinning and table meta. The two pins are the kit's marks (the fill column at the
  left, the row's acts at the right).
- **The classes are `dtable*`, not `.tbl*`:** `.tbl` is already the house's read-only table (components.css). The box's
  sideways scroll is said as `data-scrolled`, beside `data-more`, so every mark the table sets as it is used is an
  attribute.
- **The index names the table's types alone.** Its component is imported from its own module: exported from the index it
  rode into every page that takes a Button from there, the table and its window of rows with it (19 KB on the route).

**People, Leads and the Pipeline's list** are column declarations, cells, a phone's card and a page's filters over the
kit's table; `usePlControls` keeps the phone, the toast, the selection's claim and the search's refs. The old engine
(`surfaces/people/table/`, six modules, and `people/table-layout.test.mjs`) is deleted. The Pipeline's board draws its
column heads' name and fold in the kit's group words.

**The styles.** The table's rules moved from clients.css into kit.css's Table section; the pages keep their cells and the
box's place, under the classes they hand the table (`classNames`). Proof by computed style: 22 views (People, Leads and
the Pipeline at 1440, 1024 and 390, both themes, at rest, sorted, selecting, scrolled) of 5,044 elements each, recorded
on the new engine before and after the move, equal in every box and every property but one pair: a phone row's box
cell lost its `grid-area` and `align-self`, which placed nothing, since a phone's row is a card drawn as a block.

**The gallery.** A Table family of eight entries (a desk's table at rest, some picked with the box scrolled and an edge in
a drag, everyone picked at the compact height in a member's widths, nobody to show, the stages, a long list drawn in
part; a phone's cards, and its stages) and the Columns menu's box. `kit-components.test.mjs` draws each entry with
`DataTable` itself and holds the two equal. The gallery's browser spec, run on this machine's headless Chromium (build
1243, through a config that points at it): every class drawn, every token read, every control's ring, every word's
contrast, green. Its selector check names three rules no entry draws, all from main before this lane (#1825, #1841): a
panel and a record card holding a menu, and a fitted sheet on a desk.

**Proof against §11.3:**

| Line | Result |
| --- | --- |
| Goldens equal | 1,120 People cases and 240 Leads cases, equal |
| The after shots | 24 against the 24 before: the desk's column widths moved by the width model (§6.1, the expected change), and the relative times ("Found 1h ago") moved with the clock; nothing else |
| A drag draws no row | 0 rows drawn over a 200px drag of State and of Person (a production build, 1,000 people, React's commits read through its devtools hook); the one commit is the Columns menu's way back, the first time a width is set |
| Switches and the sort | At or under the base build in each of three rounds, the two builds served alternately on one port (medians of 7, desk): People 90, 43, 70 ms against 137, 60, 85; Leads 100, 53, 98 against 139, 71, 98; the sort 45, 30, 54 against 98, 41, 55; a phone's within the noise. This morning's single reading (§19) is not comparable: the base build reads 60 to 137 ms against it now |
| Drags | No long task in either build; mean frame gaps 26, 19, 32 ms against 67, 27, 35 |
| Bundle | The route's JavaScript +42 bytes and its CSS −105 gzipped; People's page +17,916 bytes gzipped, under the 20 KB line |
| Lines | App code +2,665 −2,016 (+649), stylesheets +804 −410 (+394): the −800 line is missed. The kit's table is about 2,290 lines against the ≈900 estimated, most of it the house's comments, and kit.css writes a declaration a line where clients.css wrote a rule a line |
| The one-place test | Green |
| A member's widths short of the box | Found by the new browser journey: sized narrower than its box, the table spread the room left over every column a member had sized (Person stood at 329 for its 300), because the stylesheet's `width: 100%` outranks a width attribute. The writer now says the width as `--tbl-width`, which a kit rule reads, and the table ends after its last column (Person 300, then 260, as the pointer left it) |
| Measures | Lint clean but one warning that was on main; across the changed stylesheets the literal type sizes fall by one and radii, shadows and colours hold, while kit.css alone rises by what it took from clients.css (a type size, two radii, two shadows): the pull request's `Debt:` line. Page selectors over primitives 206 → 195 |

**The browser journeys**, run against the lane's production build on this machine, signed in to the e2e workspace (the
harness's standalone shell draws no People, which left the shell; the nightly runs them against production):

- **People's spec** (16): 15 pass and one skips (the workspace has no deal to record). Its width journey asserted the old
  model (the columns' declared widths summing to the box, Person holding still) and now asserts this one: the table its
  box's width with Person filling, State grown by its keys and Person giving up that room, a press that moved nothing
  saving nothing.
- **Leads' spec** (14), lists, loading and the phone's shell (33): 48 pass, 4 skip for want of the data they need, and
  one fails, Leads' "Not a fit, then Undo", which
  writes to the workspace: after the lead sheet's Undo (sent with the versions the server answered, never the table's),
  the reloaded list did not hold the lead, and the rail counted it Not a fit. The page reloads as the Undo's request is
  sent, which over this machine's link to production may cut it short; it passed on main's nightly the night before, and
  the nightly's seed puts the workspace's leads back each morning. It is watched on the pull request's run.
- **New, `e2e/people/people-table.spec.ts`** (9, all pass): Person dragged narrower sizes the table to its columns and
  leaves its box room, dragged far wider stops at 45% of the box, and the way back fills the box again; a column moved by
  Alt and an arrow keeps the keyboard and the view's order, and goes home on the way back; Shift picks the range; a width
  outlives a reload through the device's view; the Leads Filter with select-all picks the rows it shows, and taking it off
  keeps them picked (§6.8), the bar offering its act for them alone; a phone's card picked by its face; and axe (WCAG 2 A
  and AA) on People's, Leads' and the Pipeline's tables, `@axe-core/playwright` 4.14.0 taken for it (decision 0054).
- **Not covered here:** a view arriving on a second device (the server's copy), which only a run against production can
  show, and Add to a sequence pressed, which writes.

**The node suite**, whole, in UTC (14,228 tests, coverage above every floor): eight failures, seven of them this change's
to finish and now fixed (the decisions index's status, the barrels' order, the hearing record without `people/table`, the
touch-hover rules' row tables, one heading test, and the canonical example's paths, which pass once the new files are
tracked), and an Inbox swipe test this change does not reach, which passes alone and failed under the run's load.

## Sources

- TanStack Table v9 guides (React), read from the repository's `docs/framework/react/guide/`: column sizing, column
  resizing (incl. the performant pattern), row selection (`enableRowRangeSelection`, `getFilteredSelectedRowModel`),
  sorting (`sortUndefined`, `sortDescFirst`, `getAutoSortDir`, `enableSortingRemoval`, `enableMultiSort`,
  `getSortIndex`), column visibility, ordering (pinning → order → grouping), column filtering, global filtering,
  faceting, table state (atoms, `useCreateAtom`, `table.Subscribe`, one owner per slice), virtualization, React
  Compiler — https://github.com/TanStack/table/tree/main/docs/framework/react/guide
- Migrating to v9 (React): https://tanstack.com/table/v9/docs/framework/react/guide/migrating.md
- Features: https://tanstack.com/table/v9/docs/guide/features
- `@tanstack/react-table` 9.3.1 on npm (MIT; deps `@tanstack/table-core` 9.3.1, `@tanstack/react-store` ^0.11.2):
  https://registry.npmjs.org/@tanstack/react-table/latest; `@tanstack/react-store` 0.11.2 (deps `@tanstack/store`
  0.11.2, `use-sync-external-store` ^1.6.0): https://registry.npmjs.org/@tanstack/react-store/0.11.2;
  `@tanstack/store` 0.11.2 (no dependencies): https://registry.npmjs.org/@tanstack/store/0.11.2
- `@tanstack/react-store` source (`useSelector` over `use-sync-external-store/shim/with-selector`):
  https://github.com/TanStack/store/tree/main/packages/react-store/src
- Tree-shaken size for §5.1's imports, 22.9 KB gzip:
  https://deno.bundlejs.com/?q=@tanstack/react-table@9.3.1&treeshake=[{useTable,tableFeatures,createColumnHelper,columnVisibilityFeature,columnOrderingFeature,columnPinningFeature,columnSizingFeature,columnResizingFeature,rowSortingFeature,createSortedRowModel,columnFilteringFeature,globalFilteringFeature,createFilteredRowModel,columnFacetingFeature,createFacetedRowModel,createFacetedUniqueValues,rowSelectionFeature,metaHelper,flexRender}]
  (whole package 36.3 KB: https://deno.bundlejs.com/?q=@tanstack/react-table)
- AG Grid Community 36.2, 368 KB gzip: https://bundlephobia.com/api/size?package=ag-grid-community; Enterprise-only
  features: https://www.ag-grid.com/javascript-data-grid/community-vs-enterprise.md; pricing:
  https://ag-grid.com/license-pricing/
- MUI X Data Grid 9.17, 124 KB gzip: https://bundlephobia.com/api/size?package=@mui/x-data-grid
- React Aria Components 1.22, 273 KB gzip package: https://bundlephobia.com/api/size?package=react-aria-components;
  Table: https://react-aria.adobe.com/Table
- Repository at `06951a961`: the files named in §1.1, §4, §8 and §9; decisions 0015, 0053, 0054; `CLAUDE.md`;
  `.claude/skills/chanlytics-interface/SKILL.md`; `tooling/scripts/checks/licences.mjs`; `pnpm-workspace.yaml`.
