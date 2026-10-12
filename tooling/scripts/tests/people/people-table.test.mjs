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
const { plColumnChoices, plColumnOptions, plFirstDir, plShownColumns, plSortKeys } = await importSrc(
  "apps/dashboard/src/surfaces/people/table/columns.ts",
);
const { resolveColumnWidths } = await importSrc("apps/dashboard/src/surfaces/people/table/layout.ts");
const { PL_FIRST_ROWS, PL_WINDOW_ROWS, usePlRowWindow } = await importSrc(
  "apps/dashboard/src/surfaces/people/table/row-window.ts",
);

/* --------------------------------- the table --------------------------------- */

const td = (key, text) => (p) => globalThis.React.createElement("td", { key }, text(p));
const COLS = [
  { key: "name", label: "Person", sortable: true, pinned: true, cell: td("name", (p) => p.name) },
  { key: "state", label: "State", sortable: true, hint: "Where they stand", cell: td("state", (p) => p.state) },
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
const table = (over = {}) => {
  fresh();
  return again(() =>
    PeopleTable({
      columns: plShownColumns(COLS, {}, { withCalendar: false }),
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

test("the helpers take the column list: sort keys, shown columns, first directions, choices and options come from it", () => {
  assert.deepEqual(plSortKeys(COLS), ["name", "state", "visits"]);
  // A column that is off, or that the workspace cannot show (Visits needs a calendar), is not in the list at all: the table
  // is handed only what it draws, and no column wears an `off` mark for the stylesheet to hide.
  const bare = plShownColumns(COLS, {}, { withCalendar: false });
  assert.deepEqual(
    bare.map((c) => c.key),
    ["name", "state", "receptionist", "actions"],
  );
  assert.deepEqual(
    bare,
    [COLS[0], COLS[1], COLS[3], COLS[5]],
    "the columns themselves, as declared, in the order declared",
  );
  assert.equal(
    bare.some((c) => "off" in c),
    false,
    "REGRESSION: a column marked off and drawn anyway",
  );
  assert.deepEqual(
    plShownColumns(COLS, { email: true }, { withCalendar: true }).map((c) => c.key),
    ["name", "state", "visits", "email", "actions"],
    "a calendar brings Visits and takes the receptionist off its default; the member's own choice brings Email",
  );
  assert.deepEqual(
    plShownColumns(
      COLS,
      { state: false, receptionist: false, name: false, actions: false },
      { withCalendar: false },
    ).map((c) => c.key),
    ["name", "actions"],
    "a member turns off what they like, but never Person or the row's actions",
  );
  const ordered = [{ key: "a", sortFirst: "asc" }, { key: "b", sortFirst: "desc" }, { key: "c" }];
  assert.deepEqual(
    ["a", "b", "c", "nope"].map((k) => plFirstDir(ordered, k)),
    ["asc", "desc", "desc", "desc"],
    "a first press goes the column's own way, else the most first",
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
    textOf(find(one, (n) => n.props?.className === "cl-table-foot")).startsWith("1 person"),
    true,
    "person is the default",
  );
  assert.equal(find(one, (n) => n.type === "table").props["aria-label"], "People");
  assert.deepEqual(
    all(one, (n) => n.type === "tr" && n.props?.id).map((n) => n.props.id),
    ["person-a1"],
  );
});

test("a heading that sorts is a button with aria-sort on its th and its arrow; one that does not is plain words; a column turned off is not built at all, and a phone draws one card cell a row, never the desk's columns", async () => {
  const t = table({ sortBy: "state", sortDir: "desc" });
  const ths = all(t, (n) => n.type === "th");
  const head = (key) => ths.find((n) => n.props["data-key"] === key);
  assert.equal(head("state").props["aria-sort"], "descending");
  assert.equal(head("name").props["aria-sort"], undefined, "only the column sorted by says so");
  assert.equal(
    all(t, (n) => n.props?.className === "cl-th-sort").length,
    2,
    "Person and State sort; Visits is not drawn without a calendar",
  );
  // The sorted column's arrow says which way; a heading that sorts but is not the sort shows an idle caret, so the ones
  // that sort can be told from the ones that do not.
  const arrow = (key) => find(head(key), (n) => n.props?.className === "sort-arr");
  assert.deepEqual(
    [textOf(arrow("state")), arrow("state").props["data-idle"]],
    ["▼", undefined],
    "State is the sort, descending",
  );
  assert.deepEqual([textOf(arrow("name")), arrow("name").props["data-idle"]], ["↕", "true"], "Person sorts, at rest");
  assert.equal(
    arrow("name").props["aria-hidden"],
    "true",
    "the arrow is for the eye: the heading's words name the button",
  );
  const up = table({ sortBy: "state", sortDir: "asc" });
  assert.equal(textOf(find(up, (n) => n.type === "th" && n.props["data-key"] === "state")), "State▲", "ascending is ▲");
  // The button holds the column's own words and then the arrow, and the column's hint is its tip.
  const stateButton = find(head("state"), (n) => n.type === "button");
  assert.equal(textOf(stateButton), "State▼");
  assert.equal(stateButton.props["data-tip"], "Where they stand");
  assert.equal(
    find(head("name"), (n) => n.type === "button").props["data-tip"],
    undefined,
    "a column with no hint has no tip",
  );
  // Words only, no button, for a heading that does not sort: nothing to press, nothing to tell apart.
  const receptionist = head("receptionist");
  assert.equal(
    find(receptionist, (n) => n.type === "button"),
    null,
  );
  assert.equal(textOf(find(receptionist, (n) => n.props?.className === "cl-th-text")), "Receptionist");
  assert.equal(
    find(receptionist, (n) => n.props?.className === "sort-arr"),
    null,
    "no caret on a heading that never sorts",
  );
  // A desktop used to hide an off column with CSS, so every cell of it was built, cloned and inserted for nothing: seven of
  // twelve Leads columns, on every row, on every draw. A column that is off is not in the list the table is given.
  assert.equal(
    all(t, (n) => /pl-col-off/.test(n.props?.className || "")).length,
    0,
    "REGRESSION: the Email heading and its cells were built, marked, and left for CSS to hide",
  );
  assert.deepEqual(
    ths.map((n) => n.props["data-key"]),
    ["name", "state", "receptionist", "actions"],
    "the columns shown, and only those: every heading says which column it is",
  );
  assert.deepEqual(
    ths.map((n) => textOf(n).replace(/[▲▼↕]/g, "")),
    ["Person", "State", "Receptionist", "Actions"],
    "the row-acts column, headed by no words, is named for a screen reader alone",
  );
  assert.equal(all(t, (n) => n.type === "td").length, 4 * ROWS.length, "four cells a row");
  // A phone draws one card a row from its own list, whatever the member chose for the desk (use-controls.ts: `phone ?
  // phoneCols : deskColumns`). Its column shares no key with the desk's, so no choice reaches it, and none of the desk's
  // headings or cells is drawn there, hidden or not.
  const { PL_COLUMNS, PL_PHONE_COLUMNS } = await importSrc("apps/dashboard/src/surfaces/people/cells/columns.tsx");
  assert.deepEqual(
    PL_PHONE_COLUMNS.map((c) => [c.key, c.sortable, !!c.pinned]),
    [["card", false, true]],
    "a phone has the one card cell",
  );
  assert.equal(
    PL_PHONE_COLUMNS.some((c) => PL_COLUMNS.some((d) => d.key === c.key)),
    false,
    "and it is no column of the desk's",
  );
  const card = [{ ...PL_PHONE_COLUMNS[0], cell: td("card", (p) => p.name) }];
  const ph = table({ columns: card, sortBy: "state", sortDir: "desc" });
  assert.deepEqual(
    all(ph, (n) => n.type === "th").map((n) => n.props["data-key"]),
    ["card"],
  );
  assert.equal(all(ph, (n) => n.type === "td").length, ROWS.length, "one cell a row");
  assert.equal(
    all(ph, (n) => /pl-col-off/.test(n.props?.className || "")).length,
    0,
    "REGRESSION: a phone's table marked a column off for its cards to hide",
  );
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
  assert.deepEqual(
    [th.props.scope, th.props.colSpan],
    ["rowgroup", 5],
    "every column the table draws (four here), the checkbox's included",
  );
  assert.equal(textOf(find(h1, (n) => n.props?.className === "pl-sec-label")), "Consultations");
  assert.equal(textOf(find(h1, (n) => n.props?.className === "tally")), "2", "the count is the one count, a tally");
  assert.equal(textOf(byTestId(h1, "table-section-meta")), "1 ended in the last week, no proposal yet");
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

/* ------------------------------------ a desktop's layout ------------------------------------ */

test("given a layout the table is a fixed layout of whole-pixel widths that add up to its room, with an edge on each column that can be sized; given none it draws none of that", () => {
  const cell = (key) => td(key, (p) => p[key] ?? "");
  const element = (text) => globalThis.React.createElement("span", {}, text);
  const SIZED = [
    {
      key: "name",
      label: "Person",
      sortable: true,
      pinned: true,
      width: { base: 300, min: 240, grow: 3 },
      cell: cell("name"),
    },
    { key: "state", label: "State", sortable: true, width: { base: 120 }, cell: cell("state") },
    // A heading that is more than words has no edge: the edge is named by the words (`Width of Person`).
    { key: "lists", label: element("Lists"), sortable: false, width: { base: 120 }, cell: cell("lists") },
    { key: "actions", label: "", sortable: false, fixed: true, width: { base: 84 }, cell: cell("actions") },
  ];
  const layout = {
    available: 700,
    widths: {},
    density: "comfortable",
    scrollRef() {},
    onSize() {},
    onReset() {},
    onMove() {},
    onMoveTo() {},
    onDensity() {},
    changed: false,
    onResetAll() {},
  };
  const widthsOf = (tree) =>
    all(
      find(tree, (n) => n.type === "colgroup"),
      (n) => n.type === "col",
    ).map((n) => n.props.width);
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);

  // Selectable: the select column's 42 is part of the room, drawn first, and the columns share what is left. Person is
  // the only column that asks for a share (grow), so it takes the 34px the others leave: 700 - (42 + 300 + 120 + 120 + 84).
  const t = table({ columns: SIZED, selectable: true, layout });
  const grid = find(t, (n) => n.type === "table");
  assert.equal(grid.props["data-fixed"], "true", "a fixed layout, so the widths below are the widths drawn");
  const cols = widthsOf(t);
  assert.deepEqual(cols, [42, 334, 120, 120, 84], "the checkbox, then one width a column in the order drawn");
  assert.ok(cols.every(Number.isInteger), "whole pixels: the browser has nothing fractional to spread");
  assert.equal(sum(cols), 700, "together exactly the room the table has");
  assert.deepEqual(
    cols,
    resolveColumnWidths([{ key: "sel", width: { base: 42 } }, ...SIZED], {}, 700).widths,
    "and they are the layout module's own sums over the columns' declarations",
  );
  assert.equal(
    all(
      find(t, (n) => n.type === "colgroup"),
      (n) => n.type === "col",
    ).length,
    SIZED.length + 1,
    "a col for each column and one for the select box",
  );
  assert.equal(find(t, (n) => n.props?.className?.startsWith?.("cl-table-wrap")).props["data-density"], "comfortable");
  // An edge for each heading that can be sized: not the row's own acts (fixed), not a heading that is not words.
  const edges = all(t, (n) => n.props?.role === "slider");
  assert.deepEqual(
    edges.map((n) => n.props["aria-label"]),
    ["Width of Person", "Width of State"],
    "one slider (the edge) per column that is not fixed and has a string for a heading",
  );
  assert.deepEqual(
    edges.map((n) => n.props["aria-valuenow"]),
    [334, 120],
    "each says the width its column is drawn at, the select box's column left out of the count",
  );
  assert.ok(edges.every((n) => typeof n.props["aria-label"] === "string"));

  // Not selectable: no box, no col for it, and the columns have the whole room.
  const bare = table({ columns: SIZED, layout });
  assert.deepEqual(widthsOf(bare), [376, 120, 120, 84]);
  assert.equal(sum(widthsOf(bare)), 700);
  assert.deepEqual(
    all(bare, (n) => n.props?.role === "slider").map((n) => n.props["aria-valuenow"]),
    [376, 120],
  );

  // A width the member dragged to is theirs and does not give or take: Person takes the rest of the room, still 700.
  const dragged = widthsOf(table({ columns: SIZED, selectable: true, layout: { ...layout, widths: { state: 200 } } }));
  assert.deepEqual(dragged, [42, 254, 200, 120, 84]);
  assert.equal(sum(dragged), 700);
  // A narrower room squeezes the column that asked for a share, down to its least (here 240) and no further: the rest is
  // the table's to scroll sideways, so these widths add up to more than the room.
  const cramped = widthsOf(table({ columns: SIZED, layout: { ...layout, available: 500 } }));
  assert.deepEqual(cramped, [240, 120, 120, 84]);
  assert.ok(sum(cramped) > 500);

  // With no layout the table is as the browser sizes it: none of it is drawn, and a phone's cards are the same.
  const none = table({ columns: SIZED, selectable: true });
  assert.equal(find(none, (n) => n.type === "table").props["data-fixed"], undefined);
  assert.equal(
    find(none, (n) => n.type === "colgroup"),
    null,
    "no colgroup",
  );
  assert.deepEqual(
    all(none, (n) => n.props?.role === "slider"),
    [],
    "and no edge on any heading",
  );
  assert.equal(find(none, (n) => n.props?.className?.startsWith?.("cl-table-wrap")).props["data-density"], undefined);
});

test("Came from waits in the Columns menu (canvas P1: with it the table outgrew the pane at 1440)", async () => {
  const { PL_COLUMNS } = await importSrc("apps/dashboard/src/surfaces/people/cells/columns.tsx");
  const { plShows } = await importSrc("apps/dashboard/src/surfaces/people/table/columns.ts");
  const came = PL_COLUMNS.find((c) => c.key === "came_from");
  const x = { withCalendar: false };
  assert.equal(plShows(came, {}, x), false, "off until asked for");
  assert.equal(plShows(came, { came_from: true }, x), true, "and the member's own choice stands");
});

test("the list's head says how it is ordered: the sortable column's own words, and nothing for a key it has none for", async () => {
  const { plSortedBy } = await importSrc("apps/dashboard/src/surfaces/people/words.ts");
  assert.equal(plSortedBy("last"), "Sorted by last contact");
  assert.equal(plSortedBy("name"), "Sorted by name");
  assert.equal(plSortedBy("bogus"), "");
});

test("a visit's hours say their start alone in the Visits cell, with the meridiem the range gave it", async () => {
  const { plVisitStart } = await importSrc("apps/dashboard/src/surfaces/people/words.ts");
  assert.equal(plVisitStart("2:00 – 3:00 PM"), "2:00 PM");
  assert.equal(plVisitStart("11:00 AM – 12:00 PM"), "11:00 AM");
  assert.equal(plVisitStart("10:30 AM"), "10:30 AM", "one time is said as it came");
  assert.equal(plVisitStart(""), "");
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

/* ------------------------------------- how the rows move ------------------------------------- */

// By their paths, so the dead-export check sees who reads them (an importSrc string is not an import it can follow).
const { riseRows } = await import("../../../../apps/dashboard/src/surfaces/kit/motion/use-rows-arrive.ts");
const { swapRise } = await import("../../../../apps/dashboard/src/surfaces/kit/motion/use-swap-motion.ts");

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
/** The browser's answer to `prefers-reduced-motion`, for the length of `fn`. */
const withMotion = (reduce, fn) => {
  const keep = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({ matches: reduce && q.includes("reduce") });
  try {
    return fn();
  } finally {
    globalThis.matchMedia = keep;
  }
};

test("a table's first twelve rows rise in as it arrives, a beat apart, as the Inbox's rows do; the rest come as they are", () => {
  // People's, Leads' and the Pipeline's rows came in at once while the Inbox's tabs drew theirs in (5 Oct 2026).
  const rows = Array.from({ length: 20 }, (_, i) => moving(`row-${i}`));
  const asked = [];
  const table = {
    querySelectorAll: (sel) => {
      asked.push(sel);
      return rows;
    },
  };
  assert.equal(
    withMotion(false, () => riseRows(table)),
    12,
  );
  assert.deepEqual(asked, [":scope > tbody > tr"], "the rows of the table's own groups, never a nested table's");
  assert.deepEqual(
    rows.slice(0, 12).map((r) => r.runs[0].timing.delay),
    [0, 30, 60, 90, 120, 150, 180, 210, 240, 240, 240, 240],
  );
  assert.equal(rows[0].runs[0].timing.fill, "backwards", "a row waits unseen for its turn and keeps nothing after");
  assert.deepEqual(rows[0].runs[0].frames[0], { opacity: 0, transform: "translateY(4px)" });
  assert.ok(
    rows.slice(12).every((r) => r.runs.length === 0),
    "rows past the twelfth come as they are",
  );
  const still = Array.from({ length: 3 }, (_, i) => moving(`still-${i}`));
  assert.equal(
    withMotion(true, () => riseRows({ querySelectorAll: () => still })),
    0,
  );
  assert.ok(
    still.every((r) => r.runs.length === 0),
    "nothing moves where less motion is asked",
  );
});

test("a list drawn in groups rises group by group as its view changes, and the table with its heads holds still", () => {
  const groups = [moving("tbody-1"), moving("tbody-2")];
  const table = { ...moving("table"), querySelectorAll: (sel) => (sel === ":scope > tbody" ? groups : []) };
  assert.equal(
    withMotion(false, () => swapRise(table, ":scope > tbody")),
    2,
  );
  assert.equal(table.runs.length, 0, "the table itself holds still");
  assert.ok(groups.every((g) => g.runs.length === 1));
  const list = moving("list");
  assert.equal(
    withMotion(false, () => swapRise(list)),
    1,
    "a list in one piece rises whole, as it always did",
  );
  assert.equal(
    withMotion(true, () => swapRise(list)),
    0,
  );
});

test("a long list draws its first rows, a few screens the next frame, and the rest of its window once the page is idle", () => {
  // At 200 rows a switch to Leads spent 0.7 s of a 4x-slowed CPU on style and layout drawing the whole window after its
  // first paint (5 Oct 2026): the rest waits for an idle moment, where nobody waits on it.
  const frames = [];
  const idles = [];
  const kept = ["requestAnimationFrame", "cancelAnimationFrame", "requestIdleCallback", "cancelIdleCallback"].map(
    (k) => [k, globalThis[k]],
  );
  globalThis.requestAnimationFrame = (fn) => frames.push(fn);
  globalThis.cancelAnimationFrame = () => undefined;
  globalThis.requestIdleCallback = (fn) => idles.push(fn);
  globalThis.cancelIdleCallback = () => undefined;
  try {
    fresh();
    const ids = Array.from({ length: 500 }, (_, i) => `p${i}`);
    let budget = null;
    const Probe = () => {
      budget = usePlRowWindow({ place: null, windowed: true, ids, cursor: null }).budget;
      return null;
    };
    const draw = () => again(() => globalThis.React.createElement(Probe, {}));
    draw();
    assert.equal(budget, PL_FIRST_ROWS, "the first rows, painted at once");
    assert.equal(idles.length, 0, "nothing waits for idle before the first frame");
    frames.splice(0).forEach((fn) => fn());
    draw();
    assert.ok(budget > PL_FIRST_ROWS && budget < PL_WINDOW_ROWS, `a few screens, the next frame (${budget})`);
    idles.splice(0).forEach((fn) => fn());
    draw();
    assert.equal(budget, PL_WINDOW_ROWS, "the rest of the window, once the page is idle");
  } finally {
    for (const [k, v] of kept) globalThis[k] = v;
  }
});
