/**
 * The kit's table (decision 0083): `DataTable` over a table from `useDataTable` and the state from `useTableState`, and
 * the rules over its columns (kit/table/columns.ts). Moved from people/people-table.test.mjs with the table it held: what
 * the table says its rows are, its headings, the window of a long list's rows, its groups, a phone's cards, a desk's
 * widths and edges, and how its rows arrive. Drawn on the shared stub React (_legacy-react.mjs) over the real TSX; the
 * widths a desk draws are written by the table's layout effect onto its elements, which the stub has none of, so their
 * sums and the writer are table-widths.test.mjs's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, again, all, find, byTestId, textOf } from "../_legacy-react.mjs";
import { importSrc } from "../_source.mjs";

installLegacyReact();
const { DataTable } = await importSrc("apps/dashboard/src/surfaces/kit/table/data-table.tsx");
const { useTableState } = await importSrc("apps/dashboard/src/surfaces/kit/table/state.ts");
const { useDataTable } = await importSrc("apps/dashboard/src/surfaces/kit/table/use-data-table.ts");
const {
  choicesFrom,
  choicesOf,
  columnOptionsOf,
  columnsIn,
  firstDirOf,
  shownColumnsOf,
  sortKeysOf,
  sortShownOf,
  visibilityOf,
} = await importSrc("apps/dashboard/src/surfaces/kit/table/columns.ts");
const { useShownRows } = await importSrc("apps/dashboard/src/surfaces/kit/rows/shown-rows.ts");

const h = (...a) => globalThis.React.createElement(...a);

/** A browser that can watch a list's box (the window is drawn only there): a ResizeObserver that never says anything. */
const watching = (run) => {
  const kept = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  try {
    return run();
  } finally {
    globalThis.ResizeObserver = kept;
  }
};

/* --------------------------------- the columns --------------------------------- */

const td = (key, text) => (p) => h("td", { key }, text(p));
const COLS = [
  { key: "name", label: "Person", sort: { first: "asc" }, fill: true, cell: td("name", (p) => p.name) },
  {
    key: "state",
    label: "State",
    sort: { first: "desc" },
    hint: "Where they stand",
    cell: td("state", (p) => p.state),
  },
  {
    key: "visits",
    label: "Visits",
    sort: { first: "asc" },
    needs: (x) => x.withCalendar,
    cell: td("visits", () => ""),
  },
  { key: "receptionist", label: "Receptionist", on: false, cell: td("receptionist", () => "") },
  { key: "email", label: "Email", on: false, cell: td("email", (p) => p.email || "") },
  { key: "actions", label: "", fixed: true, cell: td("actions", () => "") },
  { key: "f_hidden", label: "", hidden: true, filter: () => true },
];
const ROWS = [
  { id: "a1", name: "Ada Example", state: "new" },
  { id: "b2", name: "Bo Example", state: "quiet" },
];

test("the rules take the column list: sort keys, the columns a workspace declares and a desk draws, first ways, choices and options", () => {
  assert.deepEqual(sortKeysOf(COLS), ["name", "state", "visits"], "a hidden column is never a heading to sort by");
  const bare = columnsIn(COLS, { withCalendar: false });
  assert.deepEqual(
    bare.map((c) => c.key),
    ["name", "state", "receptionist", "email", "actions", "f_hidden"],
    "a column the workspace cannot show (Visits needs a calendar) is not declared at all",
  );
  const defaults = visibilityOf(COLS, {});
  assert.deepEqual(
    shownColumnsOf(bare, defaults, []).map((c) => c.key),
    ["name", "state", "actions"],
    "a desk draws the columns that show, and a hidden one never",
  );
  assert.deepEqual(
    shownColumnsOf(columnsIn(COLS, { withCalendar: true }), visibilityOf(COLS, { email: true }), []).map((c) => c.key),
    ["name", "state", "visits", "email", "actions"],
    "a calendar brings Visits; the member's own choice brings Email",
  );
  assert.deepEqual(
    shownColumnsOf(bare, visibilityOf(COLS, { state: false, name: false, actions: false }), []).map((c) => c.key),
    ["name", "actions"],
    "a member turns off what they like, but never Person or the row's actions",
  );
  assert.deepEqual(
    ["name", "state", "receptionist", "nope"].map((k) => firstDirOf(COLS, k)),
    ["asc", "desc", "desc", "desc"],
    "a first press goes the column's own way, else the most first",
  );
  assert.deepEqual(
    choicesOf(COLS, { name: false, actions: false, email: true, state: "yes", f_hidden: true, junk: 1 }),
    { email: true },
    "only the columns a member may hide, and only booleans",
  );
  assert.deepEqual(
    choicesFrom(COLS, visibilityOf(COLS, { email: true, state: true, receptionist: false })),
    { email: true },
    "a choice the way its default has it is no choice: it follows the default again",
  );
  assert.deepEqual(
    columnOptionsOf(columnsIn(COLS, { withCalendar: true }), defaults).map((o) => [o.key, o.on, o.locked]),
    [
      ["name", true, true],
      ["state", true, false],
      ["visits", true, false],
      ["receptionist", false, false],
      ["email", false, false],
    ],
    "the fixed column and a hidden one are not offered; the fill column is locked",
  );
  assert.deepEqual(
    columnsIn([{ key: "visits", label: "Visits", labelOf: (x) => x.word }], { word: "Sessions" }).map((c) => c.label),
    ["Sessions"],
    "a heading in the workspace's word",
  );
});

test("REGRESSION: a sort by a column turned off gives way on a desk -- People read Sorted by next step over a table with no Next step", () => {
  const declared = columnsIn(COLS, { withCalendar: true });
  const shown = shownColumnsOf(declared, visibilityOf(COLS, { state: false }), []);
  const chosen = { by: "state", dir: "asc" };
  assert.deepEqual(sortShownOf(shown, chosen, { by: "visits", dir: "desc" }), { by: "visits", dir: "desc" });
  const back = shownColumnsOf(declared, visibilityOf(COLS, {}), []);
  assert.deepEqual(sortShownOf(back, chosen, { by: "visits", dir: "desc" }), chosen, "it comes back with its column");
});

test("REGRESSION: the page's first sort stands with its column off -- a desk's Leads, Best fit first, opened Z to A by name", () => {
  const shown = shownColumnsOf(
    columnsIn(COLS, { withCalendar: true }),
    visibilityOf(COLS, { state: false, visits: false }),
    [],
  );
  const first = { by: "state", dir: "asc" };
  assert.deepEqual(sortShownOf(shown, first, first), first, "the page's own order, though no heading shows it");
  assert.deepEqual(sortShownOf(shown, { by: "state", dir: "desc" }, first), { by: "state", dir: "desc" });
  assert.deepEqual(sortShownOf(shown, { by: "visits", dir: "desc" }, first), first, "not the first column shown");
});

/* --------------------------------- the table --------------------------------- */

const STORE = { load: () => ({}), save() {}, saver: () => () => {} };
/** The words a row is found by here: its name. */
const NAMED = (q) => (q.trim() ? (r) => r.name.toLowerCase().includes(q.trim().toLowerCase()) : null);
let held = null;

/** A page: the table's state, the table over its rows, and the kit's table drawn from them. */
function Page(p) {
  const state = useTableState({
    scope: "people",
    columns: COLS,
    first: { by: "name", dir: "asc" },
    saved: null,
    landed: true,
    store: STORE,
  });
  const declared = columnsIn(COLS, { withCalendar: !!p.withCalendar });
  const model = useDataTable({ state, columns: declared, data: p.rows, words: NAMED, server: { sorting: true } });
  held = { state, model };
  return h(DataTable, {
    ctx: {},
    total: 2,
    sortBy: "name",
    sortDir: "asc",
    onSort() {},
    onOpen() {},
    filtered: false,
    onClearFilters() {},
    ...p,
    // The table's own: its rows are the row model's, narrowed and in order, never the page's rows as handed in.
    table: model.table,
    rows: model.rows,
    state,
    columns: p.columns ?? shownColumnsOf(declared, state.visibility, state.order),
  });
}
const table = (over = {}) => {
  fresh();
  return again(() => h(Page, { rows: ROWS, ...over }));
};

test("the table says its noun: the foot, the select-all label and the row ids follow it", () => {
  const leads = table({ selectable: true, noun: "lead" });
  assert.equal(textOf(find(leads, (n) => n.props?.className === "dtable-foot")).startsWith("2 leads"), true);
  assert.equal(byTestId(leads, "select-all").props["aria-label"], "Select every lead shown");
  assert.equal(
    find(leads, (n) => n.type === "table").props["aria-label"],
    "Leads",
    "and the table is named for a screen reader",
  );
  assert.deepEqual(
    all(leads, (n) => n.type === "tr" && n.props?.id).map((n) => n.props.id),
    ["lead-a1", "lead-b2"],
  );
  const one = table({ rows: [ROWS[0]], total: 1 });
  assert.equal(
    textOf(find(one, (n) => n.props?.className === "dtable-foot")).startsWith("1 person"),
    true,
    "person is the default",
  );
  assert.equal(find(one, (n) => n.type === "table").props["aria-label"], "People");
  const deals = table({ noun: "deal" });
  assert.deepEqual(
    all(deals, (n) => n.type === "tr" && n.props?.id).map((n) => n.props.id),
    ["person-a1", "person-b2"],
    "a deal's row is named for its person's (the Pipeline's focus and board look it up)",
  );
});

test("a heading that sorts is a button with aria-sort on its th and its arrow; one that does not is plain words; a phone draws one card cell a row", () => {
  const t = table({
    sortBy: "state",
    sortDir: "desc",
    columns: COLS.filter((c) => ["name", "state", "receptionist", "actions"].includes(c.key)),
  });
  const ths = all(t, (n) => n.type === "th");
  const head = (key) => ths.find((n) => n.props["data-key"] === key);
  assert.equal(head("state").props["aria-sort"], "descending");
  assert.equal(head("name").props["aria-sort"], undefined, "only the column sorted by says so");
  assert.equal(all(t, (n) => n.props?.className === "dtable-sort").length, 2, "Person and State sort");
  const arrow = (key) => find(head(key), (n) => n.props?.className === "dtable-arrow");
  assert.deepEqual([textOf(arrow("state")), arrow("state").props["data-idle"]], ["▼", undefined]);
  assert.deepEqual([textOf(arrow("name")), arrow("name").props["data-idle"]], ["↕", "true"], "Person sorts, at rest");
  assert.equal(arrow("name").props["aria-hidden"], "true", "the arrow is for the eye");
  const up = table({ sortBy: "state", sortDir: "asc" });
  assert.equal(textOf(find(up, (n) => n.type === "th" && n.props["data-key"] === "state")), "State▲", "ascending is ▲");
  const stateButton = find(head("state"), (n) => n.type === "button");
  assert.equal(textOf(stateButton), "State▼");
  assert.equal(stateButton.props["data-tip"], "Where they stand");
  assert.equal(find(head("name"), (n) => n.type === "button").props["data-tip"], undefined);
  const receptionist = head("receptionist");
  assert.equal(
    find(receptionist, (n) => n.type === "button"),
    null,
  );
  assert.equal(textOf(find(receptionist, (n) => n.props?.className === "dtable-words")), "Receptionist");
  assert.equal(
    find(receptionist, (n) => n.props?.className === "dtable-arrow"),
    null,
    "no caret on a heading that never sorts",
  );
  assert.deepEqual(
    ths.map((n) => textOf(n).replace(/[▲▼↕]/g, "")),
    ["Person", "State", "Receptionist", "Actions"],
    "the row-acts column, headed by no words, is named for a screen reader alone",
  );
  assert.equal(head("name").props["data-pin"], "start", "the fill column's heading stands pinned at the left edge");
  // The table draws the columns it is given, and only those: a column turned off is not built at all.
  const drawn = table();
  assert.deepEqual(
    all(drawn, (n) => n.type === "th").map((n) => n.props["data-key"]),
    ["name", "state", "actions"],
  );
  const cells = all(drawn, (n) => n.type === "td");
  assert.equal(cells.length, 3 * ROWS.length, "three cells a row");
  assert.deepEqual(
    cells.slice(0, 3).map((c) => [c.props["data-col"], c.props["data-pin"]]),
    [
      ["name", "start"],
      ["state", undefined],
      ["actions", "end"],
    ],
    "each cell is marked with its column, the fill column pinned at the left and the row's acts at the right",
  );
  // A phone draws one card a row, whatever the desk's columns: the columns stay declared, so a sort by one it never draws
  // still sorts.
  const card = { label: "Person", cell: (p) => h("td", { key: "card" }, p.name), rowClass: "pl-card-row" };
  const ph = table({ card, sortBy: "state", sortDir: "desc" });
  assert.deepEqual(
    all(ph, (n) => n.type === "th").map((n) => n.props["data-key"]),
    ["card"],
  );
  assert.equal(all(ph, (n) => n.type === "td").length, ROWS.length, "one cell a row");
  assert.ok(all(ph, (n) => n.type === "tr" && n.props?.id).every((r) => /\bpl-card-row\b/.test(r.props.className)));
  assert.equal(
    find(ph, (n) => n.type === "colgroup"),
    null,
    "a phone's cards have no widths",
  );
  assert.equal(find(ph, (n) => n.type === "table").props["data-fixed"], undefined);
  assert.deepEqual(
    all(ph, (n) => n.props?.role === "slider"),
    [],
    "and no edge on any heading",
  );
});

test("a desk is a fixed layout: a col for the box and each column drawn, and an edge on each column that can be sized", () => {
  const element = (text) => h("span", {}, text);
  const SIZED = [
    {
      key: "name",
      label: "Person",
      sort: { first: "asc" },
      fill: true,
      width: { base: 300, min: 240 },
      cell: td("name", (p) => p.name),
    },
    { key: "state", label: "State", sort: { first: "desc" }, width: { base: 120 }, cell: td("state", (p) => p.state) },
    // A heading that is more than words has no edge: the edge is named by the words (`Width of Person`).
    { key: "lists", label: element("Lists"), width: { base: 120 }, cell: td("lists", () => "") },
    { key: "actions", label: "", fixed: true, width: { base: 84 }, cell: td("actions", () => "") },
  ];
  const t = table({ columns: SIZED, selectable: true });
  assert.equal(find(t, (n) => n.type === "table").props["data-fixed"], "true");
  const cols = all(
    find(t, (n) => n.type === "colgroup"),
    (n) => n.type === "col",
  );
  assert.deepEqual(
    cols.map((c) => [c.props["data-col"], c.props.width]),
    [
      [undefined, 42],
      ["name", undefined],
      ["state", undefined],
      ["lists", undefined],
      ["actions", undefined],
    ],
    "the box's col is 42; each column's width is written from the sizing atom as it moves, never drawn",
  );
  const edges = all(t, (n) => n.props?.role === "slider");
  assert.deepEqual(
    edges.map((n) => [n.props["aria-label"], n.props["data-edge"], n.props["aria-valuenow"]]),
    [
      ["Width of Person", "name", 300],
      ["Width of State", "state", 120],
    ],
    "one slider per column that is not fixed and has words for a heading, saying where it starts until it is written",
  );
  assert.equal(find(t, (n) => n.props?.className?.startsWith?.("dtable-wrap")).props["data-density"], "comfortable");
  held.state.setDensity("compact");
  const compact = again(() => h(Page, { rows: ROWS, columns: SIZED }));
  assert.equal(find(compact, (n) => n.props?.className?.startsWith?.("dtable-wrap")).props["data-density"], "compact");
});

test("a long list draws its first screen and the cursor's row, with the room of the others held; a short list, or one no browser can watch, draws every row", () => {
  const many = Array.from({ length: 100 }, (_, i) => ({ id: `m${i}`, name: `Person ${i}`, state: "new" }));
  const drawn = (tree) => all(tree, (n) => n.type === "tr" && /^person-m/.test(String(n.props?.id || "")));
  const gaps = (tree) => all(tree, (n) => n.type === "tr" && /\bdtable-gap\b/.test(String(n.props?.className || "")));
  watching(() => {
    const tree = table({ rows: many, total: 100, cursor: "m80" });
    assert.equal(drawn(tree).length, 41, "the first screen and the cursor's row, not a hundred");
    assert.ok(
      drawn(tree).some((r) => r.props.id === "person-m80"),
      "the cursor's row is drawn where it is",
    );
    assert.equal(gaps(tree).length, 2, "the room before the cursor's row and after it");
    assert.ok(gaps(tree).every((g) => g.props["aria-hidden"] === "true"));
    assert.match(textOf(tree), /100 people/, "the foot counts every row");
    assert.equal(find(tree, (n) => n.type === "table").props["aria-rowcount"], 101, "a hundred rows and the heads");
    assert.equal(
      find(tree, (n) => n.type === "tr" && n.props?.["aria-rowindex"] === 1)?.type,
      "tr",
      "the heads are row 1",
    );
    assert.equal(drawn(tree)[0].props["aria-rowindex"], 2);
    assert.equal(drawn(tree).find((r) => r.props.id === "person-m80").props["aria-rowindex"], 82);
    assert.equal(drawn(table({ rows: many.slice(0, 25), total: 25 })).length, 25, "a short list is drawn whole");
  });
  assert.equal(
    drawn(table({ rows: many, total: 100 })).length,
    100,
    "a browser that cannot watch a box draws every row",
  );
});

test("a row's box selects through the table: a row a filter hides stays selected, and Shift selects the range from the last one picked", () => {
  const many = Array.from({ length: 6 }, (_, i) => ({
    id: `r${i}`,
    name: `Person ${i}`,
    state: i % 2 ? "quiet" : "new",
  }));
  const t = table({ rows: many, total: 6, selectable: true });
  const box = (tree, id) =>
    find(
      find(tree, (n) => n.type === "tr" && n.props?.id === `person-${id}`),
      (n) => n.props?.["data-testid"] === "row-select",
    );
  // What is selected now, out of the atom (a draw's own reading is the one it drew with).
  const selectedNow = () => Object.keys(held.state.atoms.rowSelection.get()).sort();
  box(t, "r1").props.onChange({ target: { checked: true } });
  box(t, "r4").props.onChange({ target: { checked: true }, nativeEvent: { shiftKey: true } });
  assert.deepEqual(selectedNow(), ["r1", "r2", "r3", "r4"], "the range between the last pick and this one");
  const after = again(() => h(Page, { rows: many, total: 6, selectable: true }));
  assert.equal(box(after, "r2").props.checked, true, "and the table draws it");
  // A narrowing keeps the selection: the rows it hides stay selected, and the bars act on the rows shown.
  held.state.setFilter("f_hidden", "x");
  held.state.setWords("Person 1");
  const narrowed = again(() => h(Page, { rows: many, total: 6, selectable: true }));
  assert.equal(held.state.narrowed, true);
  assert.deepEqual(selectedNow(), ["r1", "r2", "r3", "r4"], "the rows the words hide stay selected");
  assert.deepEqual(
    all(narrowed, (n) => n.type === "tr" && n.props?.id).map((n) => n.props.id),
    ["person-r1"],
    "and the table draws the rows the words leave",
  );
  held.state.clearFilters();
  held.state.setSelected(new Set());
  assert.deepEqual(selectedNow(), []);
  held.state.toggleSelected("r5");
  assert.deepEqual(selectedNow(), ["r5"]);
});

/* ------------------------------------------------------------------------------------------------ in sections */

const SECTIONED = [
  { id: "c1", name: "Cy Example", state: "new" },
  { id: "c2", name: "Cam Example", state: "quiet" },
  { id: "d1", name: "Di Example", state: "quiet" },
];
const bodies = (tree) => all(tree, (n) => n.type === "tbody");
const heads = (tree) => all(tree, (n) => n.type === "tr" && /\bdtable-group\b/.test(String(n.props?.className || "")));
const idsIn = (tree) => all(tree, (n) => n.type === "tr" && n.props?.id).map((n) => n.props.id);

test("without sections the table is one body: no head rows, every row in it", () => {
  const t = table();
  assert.equal(bodies(t).length, 1);
  assert.equal(heads(t).length, 0);
  assert.equal(bodies(t)[0].props["data-dims"], true, "what a view on its way dims");
  assert.deepEqual(idsIn(t), ["person-a1", "person-b2"]);
  const none = table({ rows: [], total: 0 });
  assert.equal(bodies(none).length, 1);
  assert.match(textOf(bodies(none)[0]), /Nobody has written or phoned yet\./);
});

test("sections: one body each, under a head row with no id that names it, counts it and says its meta across every column", () => {
  let toggled = 0;
  const t = table({
    selectable: true,
    rows: SECTIONED.slice(0, 2),
    total: 3,
    sections: [
      {
        key: "one",
        label: "Consultations",
        meta: "1 ended in the last week, no proposal yet",
        rows: SECTIONED.slice(0, 2),
        collapsed: false,
      },
      {
        key: "two",
        label: "Passed or ended",
        meta: null,
        rows: SECTIONED.slice(2),
        collapsed: true,
        onToggle: () => {
          toggled += 1;
        },
        toggle: "Show",
      },
    ],
  });
  const b = bodies(t);
  assert.deepEqual(
    b.map((x) => x.props["data-section"]),
    ["one", "two"],
  );
  for (const x of b) assert.equal(x.props["data-dims"], true);
  const [h1, h2] = heads(t);
  assert.equal(h1.props.id, undefined, "the cursor and select-all go by ids: a head has none");
  const th = find(h1, (n) => n.type === "th");
  assert.deepEqual([th.props.scope, th.props.colSpan], ["rowgroup", 4], "every column drawn (three here) and the box");
  assert.equal(textOf(find(h1, (n) => n.props?.className === "dtable-group-label")), "Consultations");
  assert.equal(textOf(find(h1, (n) => n.props?.className === "tally")), "2");
  assert.equal(textOf(byTestId(h1, "table-section-meta")), "1 ended in the last week, no proposal yet");
  assert.equal(byTestId(h1, "table-section-toggle"), null);
  assert.deepEqual(idsIn(t), ["person-c1", "person-c2"], "a collapsed section is its head alone");
  assert.match(h2.props.className, /\bis-folded\b/);
  const toggle = byTestId(h2, "table-section-toggle");
  assert.deepEqual([textOf(toggle), toggle.props["aria-expanded"]], ["Show", false]);
  toggle.props.onClick();
  assert.equal(toggled, 1);
  assert.equal(byTestId(t, "select-all").props.checked, false);
  assert.match(textOf(find(t, (n) => n.props?.className === "dtable-foot")), /^3 people/);
});

test("in sections every row is drawn, each section a body of its own, and the first row drawn is the tab stop", () => {
  const many = (p, n) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, name: `${p} ${i}`, state: "new" }));
  const s = (key, rows, collapsed = false) => ({ key, label: key, meta: null, rows, collapsed });
  const first = many("a", 20);
  const second = many("b", 10);
  const third = many("c", 5);
  const all35 = watching(() =>
    table({
      rows: [...first, ...second, ...third],
      total: 35,
      sections: [s("a", first), s("b", second), s("c", third)],
    }),
  );
  assert.equal(idsIn(all35).length, 35);
  assert.deepEqual(
    bodies(all35).map((x) => x.props["data-section"]),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    all(all35, (n) => n.type === "tr" && n.props?.tabIndex === 0).map((n) => n.props.id),
    ["person-a0"],
    "one tab stop: the first row, until there is a cursor",
  );
  const cursorOn = table({
    rows: [...first, ...second],
    total: 30,
    cursor: "b3",
    sections: [s("a", first), s("b", second)],
  });
  assert.deepEqual(
    all(cursorOn, (n) => n.type === "tr" && n.props?.tabIndex === 0).map((n) => n.props.id),
    ["person-b3"],
  );
  const folded = table({ rows: first, total: 30, sections: [s("a", first), s("b", second, true)] });
  assert.deepEqual(
    bodies(folded).map((x) => x.props["data-section"]),
    ["a", "b"],
  );
  assert.equal(idsIn(folded).length, 20, "a folded section costs nothing but its head");
});

test("sections with nobody in them are the one body with the page's empty words", () => {
  const t = table({
    rows: [],
    total: 0,
    empty: { title: "No deals yet.", body: "Start a proposal from someone's page." },
    sections: [],
  });
  assert.equal(bodies(t).length, 1);
  assert.equal(heads(t).length, 0);
  assert.match(textOf(t), /No deals yet\.Start a proposal from someone's page\./);
});

test("words that find nobody say the page's own empty words, and a narrowed view offers Clear filters", () => {
  let cleared = 0;
  const own = table({
    rows: [],
    filtered: true,
    empty: { title: "Nobody matches “zzqx”", action: { label: "Clear search", onClick: () => cleared++ } },
  });
  assert.match(textOf(own), /Nobody matches “zzqx”/);
  find(own, (n) => n.type === "button" && textOf(n) === "Clear search").props.onClick();
  assert.equal(cleared, 1);
  let filters = 0;
  const narrowed = table({ rows: [], total: 5, filtered: true, onClearFilters: () => filters++ });
  assert.match(textOf(narrowed), /No one matches this view\./);
  find(narrowed, (n) => n.type === "button" && textOf(n) === "Clear filters").props.onClick();
  assert.equal(filters, 1);
  assert.match(textOf(find(narrowed, (n) => n.props?.className === "dtable-foot")), /Showing 0 of 5/);
});

/* ------------------------------------- how the rows move ------------------------------------- */

// By their paths, so the dead-export check sees who reads them (an importSrc string is not an import it can follow).
const { fadeRowsIn, useRowsArrive } =
  await import("../../../../apps/dashboard/src/surfaces/kit/motion/use-rows-arrive.ts");
const { swapFade } = await import("../../../../apps/dashboard/src/surfaces/kit/motion/use-swap-motion.ts");

/** An element that records what it was asked to animate. */
const moving = (name) => {
  const runs = [];
  return {
    name,
    runs,
    animate(frames, timing) {
      runs.push({ frames, timing });
      return { cancel() {} };
    },
    getAnimations: () => [],
  };
};
const inPlace = (el) => el.runs.every((run) => run.frames.every((f) => !("transform" in f) && !("translate" in f)));
const withMotion = (reduce, fn) => {
  const keep = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({ matches: reduce && q.includes("reduce") });
  try {
    return fn();
  } finally {
    globalThis.matchMedia = keep;
  }
};

test("a table's first twelve rows fade in where they stand as it arrives, a beat apart; the rest come as they are", () => {
  const rows = Array.from({ length: 20 }, (_, i) => moving(`row-${i}`));
  const asked = [];
  const tableEl = {
    querySelectorAll: (sel) => {
      asked.push(sel);
      return rows;
    },
  };
  assert.equal(
    withMotion(false, () => fadeRowsIn(tableEl)),
    12,
  );
  assert.deepEqual(asked, [":scope > tbody > tr"], "the rows of the table's own groups, never a nested table's");
  assert.deepEqual(
    rows.slice(0, 12).map((r) => r.runs[0].timing.delay),
    [0, 30, 60, 90, 120, 150, 180, 210, 240, 240, 240, 240],
  );
  assert.equal(rows[0].runs[0].timing.fill, "backwards");
  assert.deepEqual(rows[0].runs[0].frames[0], { opacity: 0 });
  assert.ok(rows.slice(0, 12).every(inPlace), "every row arrives where it stands: nothing rises");
  assert.ok(rows.slice(12).every((r) => r.runs.length === 0));
  const still = Array.from({ length: 3 }, (_, i) => moving(`still-${i}`));
  assert.equal(
    withMotion(true, () => fadeRowsIn({ querySelectorAll: () => still })),
    0,
  );
  assert.ok(
    still.every((r) => r.runs.length === 0),
    "nothing moves where less motion is asked",
  );
});

test("a list's own rows arrive as a table's do, and the ref that brings them in does it once", () => {
  const asked = [];
  const rows = Array.from({ length: 3 }, (_, i) => moving(`row-${i}`));
  assert.equal(
    withMotion(false, () =>
      fadeRowsIn(
        {
          querySelectorAll: (sel) => {
            asked.push(sel);
            return rows;
          },
        },
        ":scope > .ix-thread",
      ),
    ),
    3,
  );
  assert.deepEqual(asked, [":scope > .ix-thread"]);
  fresh();
  let ref = null;
  const Probe = () => {
    ref = useRowsArrive(":scope > .ix-thread");
    return null;
  };
  again(() => h(Probe, {}));
  const first = Array.from({ length: 2 }, (_, i) => moving(`first-${i}`));
  const later = Array.from({ length: 2 }, (_, i) => moving(`later-${i}`));
  withMotion(false, () => {
    ref(null);
    ref({ querySelectorAll: () => first });
    ref(null);
    ref({ querySelectorAll: () => later });
  });
  assert.deepEqual(
    first.map((r) => r.runs.length),
    [1, 1],
  );
  assert.ok(first.every(inPlace));
  assert.deepEqual(
    later.map((r) => r.runs.length),
    [0, 0],
    "an element given later comes as it is",
  );
});

test("a list drawn in groups answers group by group as its view changes, and the table with its heads holds still", () => {
  const groups = [moving("tbody-1"), moving("tbody-2")];
  const tableEl = { ...moving("table"), querySelectorAll: (sel) => (sel === ":scope > tbody" ? groups : []) };
  assert.equal(
    withMotion(false, () => swapFade(tableEl, ":scope > tbody")),
    2,
  );
  assert.equal(tableEl.runs.length, 0, "the table itself holds still");
  assert.ok(groups.every((g) => g.runs.length === 1 && inPlace(g)));
  const list = moving("list");
  assert.equal(
    withMotion(false, () => swapFade(list)),
    1,
  );
  assert.equal(
    withMotion(true, () => swapFade(list)),
    0,
  );
});

test("the window's first draw: its first screen, the rows it keeps wherever they are, and the room between at the guessed height", () => {
  fresh();
  let parts = null;
  const Probe = ({ count, keep }) => {
    parts = useShownRows({ count, estimate: 40, keep }).parts;
    return null;
  };
  const draw = (count, keep) => again(() => h(Probe, { count, keep }));
  watching(() => {
    draw(500, [450]);
    assert.deepEqual(
      parts.slice(38).map((p) => (p.kind === "row" ? p.index : `gap ${p.height}`)),
      [38, 39, `gap ${410 * 40}`, 450, `gap ${49 * 40}`],
    );
    draw(30, [12]);
    assert.equal(parts.length, 30, "under forty rows: every row, nothing held");
  });
  draw(500, [450]);
  assert.equal(parts.length, 500, "no way to watch the list: every row");
});
