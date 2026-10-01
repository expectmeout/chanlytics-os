/**
 * The People table, lifted out of clients-a.jsx and given its columns.
 *
 * Four of its helpers closed over People's own PL_COLUMNS, so the Leads scope could not draw the table with columns
 * of its own; every one of them now takes the column list, and the table says what it calls its rows (the foot's
 * count, the select-all label, and the row id the page's cursor effect looks up). Drawn on the shared stub React
 * (_legacy-react.mjs), over the real TSX: surfaces/people/table/table.tsx (the table), columns.ts (the helpers) and
 * row-window.ts (the first draw's budget).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, again, all, find, byTestId, textOf } from "../_legacy-react.mjs";
import { importSrc } from "../_source.mjs";

// The table has no hook of its own; its rows' memo is the identity here (_react-memo.mjs) and its empty state is the kit's,
// both taken from the modules it imports, so the stub's hooks go on the react module first (installLegacyReact does it).
installLegacyReact();
const { PeopleTable } = await importSrc("apps/dashboard/src/surfaces/people/table/table.tsx");
const { plColumnChoices, plColumnOptions, plDrawnColumns, plShownColumns, plSortKeys } = await importSrc(
  "apps/dashboard/src/surfaces/people/table/columns.ts",
);
const { PL_FIRST_ROWS } = await importSrc("apps/dashboard/src/surfaces/people/table/row-window.ts");

/* --------------------------------- the table --------------------------------- */

const td = (key, text) => (p) => globalThis.React.createElement("td", { key }, text(p));
const COLS = [
  { key: "name", label: "Person", sortable: true, pinned: true, cell: td("name", (p) => p.name) },
  { key: "state", label: "State", sortable: true, cell: td("state", (p) => p.state) },
  { key: "visits", label: "Visits", sortable: true, needs: (x) => x.withCalendar, cell: td("visits", () => "") },
  {
    key: "receptionist",
    label: "Receptionist",
    sortable: false,
    on: (x) => !x.withCalendar,
    cell: td("receptionist", () => ""),
  },
  { key: "email", label: "Email", sortable: false, on: false, cell: td("email", (p) => p.email || "") },
  { key: "actions", label: "", sortable: false, fixed: true, cell: td("actions", () => "") },
];
const ROWS = [
  { id: "a1", name: "Ada Example", state: "new" },
  { id: "b2", name: "Bo Example", state: "quiet" },
];
const table = ({ phone = false, ...over } = {}) => {
  fresh();
  return again(() =>
    PeopleTable({
      columns: plShownColumns(plDrawnColumns(COLS, {}, { withCalendar: false }), phone),
      ctx: {},
      rows: ROWS,
      total: 2,
      sortBy: "name",
      sortDir: "asc",
      onSort() {},
      onOpen() {},
      filtered: false,
      onClearFilters() {},
      ...over,
    }),
  );
};

test("the helpers take the column list: sort keys, drawn columns, choices and options come from it", () => {
  assert.deepEqual(plSortKeys(COLS), ["name", "state", "visits"]);
  assert.deepEqual(
    plDrawnColumns(COLS, {}, { withCalendar: false }).map((c) => [c.key, !!c.off]),
    [
      ["name", false],
      ["state", false],
      ["receptionist", false],
      ["email", true],
      ["actions", false],
    ],
  );
  assert.deepEqual(
    plDrawnColumns(COLS, { email: true }, { withCalendar: true }).map((c) => [c.key, !!c.off]),
    [
      ["name", false],
      ["state", false],
      ["visits", false],
      ["receptionist", true],
      ["email", false],
      ["actions", false],
    ],
  );
  assert.deepEqual(
    plColumnChoices(COLS, { name: false, actions: false, email: true, state: "yes", junk: 1 }),
    { email: true },
    "only the columns a member may hide, and only booleans",
  );
  assert.deepEqual(
    plColumnOptions(COLS, {}, { withCalendar: true }).map((o) => [o.key, o.on, o.locked]),
    [
      ["name", true, true],
      ["state", true, false],
      ["visits", true, false],
      ["receptionist", false, false],
      ["email", false, false],
    ],
    "the fixed column is not offered; the pinned one is locked",
  );
});

test("the table says its noun: the foot, the select-all label and the row ids follow it", () => {
  const leads = table({ selectable: true, noun: "lead" });
  assert.equal(textOf(find(leads, (n) => n.props?.className === "cl-table-foot")).startsWith("2 leads"), true);
  assert.equal(byTestId(leads, "select-all").props["aria-label"], "Select every lead shown");
  assert.deepEqual(
    all(leads, (n) => n.type === "tr" && n.props?.id).map((n) => n.props.id),
    ["lead-a1", "lead-b2"],
  );
  const one = table({ rows: [ROWS[0]], total: 1 });
  assert.equal(
    textOf(find(one, (n) => n.props?.className === "cl-table-foot")).startsWith("1 person"),
    true,
    "person is the default",
  );
  assert.deepEqual(
    all(one, (n) => n.type === "tr" && n.props?.id).map((n) => n.props.id),
    ["person-a1"],
  );
});

test("a heading that sorts is a button with aria-sort on its th; a column turned off is not built at all on a desktop, and on a phone it is drawn with pl-col-off for the cards", () => {
  const t = table({ sortBy: "state", sortDir: "desc" });
  const ths = all(t, (n) => n.type === "th");
  assert.equal(ths.find((n) => textOf(n).startsWith("State")).props["aria-sort"], "descending");
  assert.equal(
    all(t, (n) => n.props?.className === "cl-th-sort").length,
    2,
    "Person and State sort; Visits is not drawn without a calendar",
  );
  // A desktop hides an off column with CSS, so every cell of it was built, cloned and inserted for nothing: seven of
  // twelve Leads columns, on every row, on every draw.
  assert.equal(
    all(t, (n) => /pl-col-off/.test(n.props?.className || "")).length,
    0,
    "REGRESSION: the Email heading and its two cells were built and hidden",
  );
  assert.deepEqual(
    ths.map(textOf).map((x) => x.replace(/[▲▼]/g, "").trim()),
    ["Person", "State", "Receptionist", ""],
    "the columns shown, and only those",
  );
  assert.equal(all(t, (n) => n.type === "td").length, 4 * ROWS.length, "four cells a row");
  // A phone draws every column: its cards keep the facts they draw by default (#789), and pl-col-off is how the
  // card rules tell one the member turned off.
  const ph = table({ sortBy: "state", sortDir: "desc", phone: true });
  assert.equal(
    all(ph, (n) => /pl-col-off/.test(n.props?.className || "")).length,
    1 + ROWS.length,
    "on a phone: the Email heading and its two cells, marked",
  );
  assert.equal(all(ph, (n) => n.type === "td").length, 5 * ROWS.length);
});

test("a budget draws that many rows and no more; a budget past the rows, or none, draws them all", () => {
  // The page's first draw on a fresh mount (row-window.ts usePlRowWindow) hands the table PL_FIRST_ROWS; the rest come a
  // frame later. The foot's count and the select-all still read every row.
  const many = Array.from({ length: 25 }, (_, i) => ({ id: `m${i}`, name: `Person ${i}`, state: "new" }));
  const drawn = (tree) => all(tree, (n) => n.type === "tr" && /^person-m/.test(String(n.props?.id || ""))).length;
  assert.equal(drawn(table({ rows: many, total: 25, budget: 24 })), 24, "the first 24");
  assert.equal(drawn(table({ rows: many, total: 25, budget: 25 })), 25, "a budget the rows fit in");
  assert.equal(drawn(table({ rows: many, total: 25 })), 25, "no budget: every row");
  assert.match(textOf(table({ rows: many, total: 25, budget: 24 })), /25 people/, "the foot counts every row");
  assert.equal(PL_FIRST_ROWS, 24, "the first draw's budget, published for the page");
});

/* ------------------------------------------------------------------------------------------------ in sections */

const SECTIONED = [
  { id: "c1", name: "Cy Example", state: "new" },
  { id: "c2", name: "Cam Example", state: "quiet" },
  { id: "d1", name: "Di Example", state: "quiet" },
];
const bodies = (tree) => all(tree, (n) => n.type === "tbody");
const heads = (tree) => all(tree, (n) => n.type === "tr" && /\bpl-sec-head\b/.test(String(n.props?.className || "")));
const idsIn = (tree) => all(tree, (n) => n.type === "tr" && n.props?.id).map((n) => n.props.id);

test("without sections the table is one body, as it always was: no head rows, every row in it", () => {
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
        meta: "1 held in the last week, no proposal yet",
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
  assert.deepEqual(
    [th.props.scope, th.props.colSpan],
    ["rowgroup", 5],
    "every column the table draws (four here), the checkbox's included",
  );
  assert.equal(textOf(find(h1, (n) => n.props?.className === "pl-sec-label")), "Consultations");
  assert.equal(textOf(find(h1, (n) => n.props?.className === "tally")), "2", "the count is the one count, a tally");
  assert.equal(textOf(byTestId(h1, "table-section-meta")), "1 held in the last week, no proposal yet");
  assert.equal(byTestId(h1, "table-section-toggle"), null, "a section that does not fold has nothing to press");
  // A collapsed section is its head alone, whose toggle says what opens it and presses the page's fold.
  assert.deepEqual(idsIn(t), ["person-c1", "person-c2"]);
  assert.equal(byTestId(h2, "table-section-meta"), null);
  assert.match(h2.props.className, /\bis-folded\b/);
  const toggle = byTestId(h2, "table-section-toggle");
  assert.deepEqual([textOf(toggle), toggle.props["aria-expanded"]], ["Show", false]);
  toggle.props.onClick();
  assert.equal(toggled, 1);
  // Select-all takes the rows shown, and the foot counts every row the page has.
  assert.equal(byTestId(t, "select-all").props.checked, false);
  assert.match(textOf(find(t, (n) => n.props?.className === "cl-table-foot")), /^3 people/);
});

test("in sections the first row drawn is the tab stop, and a first draw's budget runs across them in turn", () => {
  const many = (p, n) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, name: `${p} ${i}`, state: "new" }));
  const s = (key, rows, collapsed = false) => ({ key, label: key, meta: null, rows, collapsed });
  const first = many("a", 20);
  const second = many("b", 10);
  const third = many("c", 5);
  const drawn = (tree) => idsIn(tree).length;
  const t = table({
    rows: [...first, ...second, ...third],
    total: 35,
    budget: 24,
    sections: [s("a", first), s("b", second), s("c", third)],
  });
  assert.equal(drawn(t), 24, "twenty from the first, four from the second");
  assert.deepEqual(
    bodies(t).map((x) => x.props["data-section"]),
    ["a", "b"],
    "a section the budget cannot reach waits for the next draw, head and all",
  );
  const all35 = table({
    rows: [...first, ...second, ...third],
    total: 35,
    sections: [s("a", first), s("b", second), s("c", third)],
  });
  assert.equal(drawn(all35), 35);
  const stops = all(all35, (n) => n.type === "tr" && n.props?.tabIndex === 0).map((n) => n.props.id);
  assert.deepEqual(stops, ["person-a0"], "one tab stop: the first row, until there is a cursor");
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
  // A folded section costs nothing but its head, even past the budget's reach.
  const folded = table({ rows: first, total: 30, budget: 24, sections: [s("a", first), s("b", second, true)] });
  assert.deepEqual(
    bodies(folded).map((x) => x.props["data-section"]),
    ["a", "b"],
  );
  assert.equal(drawn(folded), 20);
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
