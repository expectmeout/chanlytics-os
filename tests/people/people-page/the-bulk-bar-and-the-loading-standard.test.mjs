/**
 * The bulk bar on the people shown (Phase 0), the table after its review (18 September), and the loading
 * standard: People's rows, place and search.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { until } from "../../shared/_until.mjs";
import { lineBox } from "../../shared/_line.mjs";
import {
  H,
  PersonLists,
  all,
  barMenuOf,
  byTestId,
  catchExports,
  clearTabMemory,
  drained,
  draw,
  exportedNames,
  find,
  flashes,
  frames,
  freshPage,
  headings,
  installTabMemory,
  iso,
  itemOf,
  onPhone,
  opened,
  peeked,
  peopleOverride,
  person,
  press,
  quietly,
  rowOf,
  searchAnswered,
  searchLanded,
  setCells,
  sortByHeading,
  textOf,
  toastAfter,
  watchingBoxes,
  wire,
  wrote,
} from "./_people-page.mjs";
import { bridgeHolds, surfaceValue, whoIsLooking, provided } from "../../shell/_bridge-holds.mjs";

test("REGRESSION: the bulk bar acts on the people shown -- a person a refresh moved out of the view stayed counted, and was written to", async () => {
  const needs = (i) =>
    person(i, {
      needs_human: true,
      open_escalation_reason: "human_token",
      open_escalation_since: iso(H),
      latest_state: "needs_human",
    });
  const kept = [{ id: "s1", name: "Regulars", ids: [] }];
  await freshPage({ people: [needs(1), needs(2), person(3)], lists: kept });
  const { blobs, restore } = catchExports();
  try {
    let tree = draw({ initialState: "needs_you" });
    byTestId(tree, "select-all").props.onChange();
    tree = draw({ initialState: "needs_you" });
    assert.match(textOf(byTestId(tree, "bulk-bar")), /2 selected/);
    // A refresh: Person 2's escalation was resolved on another device, so they leave Needs you.
    const seen = wire({ people: [needs(1), person(2), person(3)], lists: kept });
    await quietly(() => peopleOverride.apply());
    tree = draw({ initialState: "needs_you" });
    assert.deepEqual(
      all(tree, (n) => n.props?.["data-testid"] === "row-select").map((n) => n.props["aria-label"]),
      ["Select Person 1"],
      "the view shows one",
    );
    assert.match(
      textOf(byTestId(tree, "bulk-bar")),
      /1 selected/,
      "REGRESSION: the bar counted a person who is not on screen",
    );
    await toastAfter(() => itemOf(barMenuOf(tree, "Add to list"), "Regulars").onClick(), "who was added");
    assert.deepEqual(
      wrote(seen),
      [["PUT", "segments/s1", { add: ["p1"] }]],
      "REGRESSION: the add wrote to a person the view no longer shows",
    );
    // The doors that take fifty at a time (a yes, the receptionist, a note, Take off) share one batch; a yes stands for them.
    await toastAfter(
      () => itemOf(barMenuOf(draw({ initialState: "needs_you" }), "Messages"), "In person").onClick(),
      "the spoken yes",
    );
    assert.deepEqual(
      wrote(seen).at(-1),
      ["PUT", "contacts/consent", { ids: ["p1"], consent: "opted_in", source: "in_person" }],
      "REGRESSION: the yes went to a person the view no longer shows",
    );
    byTestId(draw({ initialState: "needs_you" }), "bulk-export").props.onClick();
    assert.equal(textOf(flashes.at(-1).msg), "1 exported as a CSV");
    assert.deepEqual(
      await exportedNames(blobs.at(-1)),
      ["Person 1"],
      "REGRESSION: the file held a person the view no longer shows",
    );
  } finally {
    restore();
  }
});

test("REGRESSION: a search match past the people loaded is exported with the rest -- the bar counted it and wrote to it, and left it out of the file", async () => {
  // Past everyone loaded, the server finds Saturday Jones; Person 2 matches by their last words ("Can I move Saturday to 11?").
  const seen = await freshPage({
    people: [person(1, { display_name: "Saturday Smith" }), person(2)],
    lists: [{ id: "s1", name: "Regulars", ids: [] }],
    search: () => ({ people: [person(99, { display_name: "Saturday Jones" })], total: 1, has_more: false }),
  });
  surfaceValue("people").page = { ...surfaceValue("people").page, total: 60000, has_more: true };
  const { blobs, restore } = catchExports();
  try {
    (draw(), lineBox()).props.onChange({
      target: { value: "saturday" },
    });
    draw();
    await searchLanded(seen, 0);
    byTestId(draw(), "select-all").props.onChange();
    const tree = draw();
    assert.match(textOf(byTestId(tree, "bulk-bar")), /3 selected/, "the two loaded and the one found");
    byTestId(tree, "bulk-export").props.onClick();
    assert.equal(
      textOf(flashes.at(-1).msg),
      "3 exported as a CSV",
      "REGRESSION: the file counted only the people loaded",
    );
    assert.deepEqual(
      (await exportedNames(blobs.at(-1))).sort(),
      ["Person 2", "Saturday Jones", "Saturday Smith"],
      "REGRESSION: the person found past the loaded rows was left out of the file",
    );
    await toastAfter(() => itemOf(barMenuOf(tree, "Add to list"), "Regulars").onClick(), "who was added");
    assert.deepEqual(
      wrote(seen).map(([method, route, { add }]) => [method, route, [...add].sort()]),
      [["PUT", "segments/s1", ["p1", "p2", "p99"]]],
      "and written to with the rest",
    );
  } finally {
    restore();
  }
});

test("the table is selecting only while a row it shows is selected -- a selection a refresh took off the screen shows no row's box, and draws no bar", async () => {
  const needs = (i) =>
    person(i, {
      needs_human: true,
      open_escalation_reason: "human_token",
      open_escalation_since: iso(H),
      latest_state: "needs_human",
    });
  // `selecting` on the table's wrap is what shows every row's box (clients.css).
  const selecting = (tree) =>
    /\bselecting\b/.test(
      String(find(tree, (n) => /\bpl-table-wrap\b/.test(String(n.props?.className || ""))).props.className),
    );
  await freshPage({ people: [needs(1), needs(2), person(3)] });
  let tree = draw({ initialState: "needs_you" });
  assert.equal(selecting(tree), false, "nobody selected");
  byTestId(rowOf(tree, "p2"), "row-select").props.onChange();
  tree = draw({ initialState: "needs_you" });
  assert.equal(selecting(tree), true, "Person 2 is shown and selected");
  // A refresh: Person 2's escalation was resolved on another device, so they leave Needs you, and the one person
  // selected is not on screen.
  wire({ people: [needs(1), person(2), person(3)] });
  await quietly(() => peopleOverride.apply());
  tree = draw({ initialState: "needs_you" });
  assert.deepEqual(
    all(tree, (n) => n.props?.["data-testid"] === "row-select").map((n) => n.props["aria-label"]),
    ["Select Person 1"],
    "the view shows one",
  );
  assert.equal(selecting(tree), false, "a selection nobody can see does not put the table in selecting mode");
  assert.equal(byTestId(tree, "bulk-bar"), null, "nor draws a bar with nobody on screen to act on");
  byTestId(rowOf(tree, "p1"), "row-select").props.onChange();
  tree = draw({ initialState: "needs_you" });
  assert.equal(selecting(tree), true, "a shown row selected: selecting again");
  assert.match(textOf(byTestId(tree, "bulk-bar")), /1 selected/, "and the bar counts the one shown");
});

test("on a desktop the table scrolls in its own box, Person pinned, and the hairline beside it shows once it has scrolled sideways", async () => {
  await freshPage({ people: [person(1)] });
  let tree = draw();
  assert.ok(
    find(tree, (n) => /\bcl-main-scroll\b/.test(n.props?.className || "") && /\bpl-main\b/.test(n.props.className)),
    "the page's column is the layout that gives the table its own box",
  );
  const scroller = (t) => byTestId(t, "people-table-scroll");
  assert.equal(scroller(tree).props["data-scrolled"], undefined, "no hairline at rest");
  // The box says it has scrolled on itself, as it scrolls (kit/table/data-table.tsx): no draw of the page for a scroll.
  const box = (scrollLeft, on = new Set()) => ({
    on,
    scrollLeft,
    clientWidth: 600,
    scrollWidth: 900,
    toggleAttribute: (name, yes) => (yes ? on.add(name) : on.delete(name)),
  });
  const away = box(120);
  scroller(tree).props.onScroll({ currentTarget: away });
  assert.ok(away.on.has("data-scrolled"), "scrolled sideways: the hairline");
  const back = box(0, new Set(["data-scrolled"]));
  scroller(tree).props.onScroll({ currentTarget: back });
  assert.ok(!back.on.has("data-scrolled"), "back at the start: none");
  tree = draw();
  assert.equal(
    find(tree, (n) => n.type === "th" && textOf(n).startsWith("Person")).props["data-pin"],
    "start",
    "Person's heading is pinned",
  );
  assert.equal(
    find(rowOf(tree, "p1"), (n) => n.type === "td" && /\bcl-name-cell\b/.test(n.props?.className || "")).props[
      "data-pin"
    ],
    "start",
    "and so are its cells",
  );
});

test("Person is the cell right after the checkbox, in the header and in every row -- its pin sits at the checkbox's width, 28px, beside it", async () => {
  // The kit pins Person with `.dtable-sel + [data-pin="start"] { left: 28px }`: that holds only while Person follows the
  // checkbox.
  const cells = (tr) => tr.props.children.filter((k) => k && (k.type === "th" || k.type === "td"));
  const lines = (tree) =>
    [
      find(
        find(tree, (n) => n.type === "thead"),
        (n) => n.type === "tr",
      ),
      ...all(
        find(tree, (n) => n.type === "tbody"),
        (n) => n.type === "tr",
      ),
    ].map(cells);
  const is = (cell, cls) => new RegExp(`\\b${cls}\\b`).test(String(cell.props.className || ""));
  const pinned = (cell) => cell.props["data-pin"] === "start";
  for (const calendar of ["none", "ok"]) {
    await freshPage({ people: [person(1), person(2), person(3)], calendar });
    const drawn = lines(draw());
    assert.equal(drawn.length, 4, "the header and three rows");
    for (const line of drawn) {
      assert.ok(is(line[0], "dtable-sel"), `the checkbox first (calendar ${calendar})`);
      assert.ok(pinned(line[1]), `then Person, pinned beside it (calendar ${calendar})`);
      assert.equal(line.filter(pinned).length, 1, "and nothing else pinned at the left");
    }
  }
  // A member who can neither edit lists nor export has no checkbox: Person is the first cell, pinned at 0.
  await freshPage({ people: [person(1), person(2)] });
  const me = whoIsLooking().me;
  bridgeHolds({ who: { me: { role: "viewer" } } });
  try {
    for (const line of lines(draw())) {
      assert.ok(pinned(line[0]), "Person first");
      assert.ok(!line.some((c) => is(c, "dtable-sel")), "and no checkbox before it");
    }
  } finally {
    bridgeHolds({ who: { me: me } });
  }
});

test("REGRESSION: a desktop builds no cell of a column the member turned off -- four hidden cells were built, cloned and inserted per row for a desktop to hide", async () => {
  const needsYou = person(1, {
    needs_human: true,
    open_escalation_reason: "human_token",
    open_escalation_since: iso(H),
    latest_state: "needs_human",
  });
  await freshPage({
    people: [needsYou, person(2)],
    views: { people: { sortBy: "last", sortDir: "desc", columns: { state: false, offers: false } } },
  });
  const desk = draw();
  const row = rowOf(desk, "p1");
  // A cell under each heading and no more (the checkbox's and the actions' count as headings here): a column turned off is
  // not built at all, hidden or not, and the stylesheet has nothing to hide.
  const heads = all(
    find(desk, (n) => n.type === "thead"),
    (n) => n.type === "th",
  ).length;
  assert.equal(
    row.props.children.filter((k) => k && k.type === "td").length,
    heads,
    "REGRESSION: a cell was built for a column that is not shown",
  );
  assert.equal(
    find(row, (n) => n.type === "td" && /\bcl-state-cell\b/.test(String(n.props?.className || ""))),
    null,
    "the State the member turned off is not in the row at all",
  );
  for (const id of ["row-offers", "row-reach", "row-email", "row-lists", "row-came-from", "row-since", "row-phone"])
    assert.equal(byTestId(row, id), null, `${id}: off by default, so not in the row at all`);
  assert.deepEqual(headings(desk), ["Person", "Next step", "Last contact"]);
});

test("REGRESSION: a phone row is one cell -- the face, the name and the state; why they need a person, or their own words; the visit and the last contact -- and the member's desktop columns never reach it", () =>
  onPhone(async () => {
    const needs = person(1, {
      display_name: "Zoe M.",
      needs_human: true,
      open_escalation_reason: "human_token",
      open_escalation_since: iso(H),
      latest_state: "needs_human",
    });
    await freshPage({
      people: [needs, person(2)],
      views: { people: { sortBy: "last", sortDir: "desc", columns: { state: false, offers: false } } },
    });
    const tree = draw();
    const row = rowOf(tree, "p1");
    assert.match(row.props.className, /\bpl-item-row\b/);
    const tds = row.props.children.filter((k) => k && k.type === "td");
    assert.deepEqual(
      tds.map((td) => String(td.props.className)),
      ["dtable-sel", "pl-item-cell"],
      "REGRESSION: the desktop's cells re-gridded into a box, 119 to 168px a person",
    );
    const card = tds[1];
    const pill = find(card, (n) => /\bpill\b/.test(String(n.props?.className || "")));
    assert.equal(pill.props["data-state"], "needs_you", "the state, whatever the member hid on a desktop");
    assert.ok(byTestId(card, "row-state-detail"), "why they need a person");
    assert.equal(byTestId(card, "row-offers"), null, "the answer to offers is on their page (Ruben, 22 Sep)");
    assert.ok(
      find(card, (n) => /\bface\b/.test(String(n.props?.className || ""))),
      "their face, the kit's",
    );
    assert.match(
      textOf(byTestId(rowOf(tree, "p2"), "row-words")),
      /Saturday/,
      "a person who needs nobody says their own words",
    );
    assert.match(textOf(card), /Zoe M\./, "and their name");
  }));

/* ------------------------- the table, after its review (18 September) ------------------------- */

test("REGRESSION: By state puts who needs a person first -- the ranks ran the other way, so the first press put Active first and Needs you last", async () => {
  const needsOne = (i) =>
    person(i, {
      needs_human: true,
      open_escalation_reason: "human_token",
      open_escalation_since: iso(H),
      latest_state: "needs_human",
    });
  await freshPage({ people: [person(1), needsOne(2), person(3)] });
  let tree = draw();
  const ids = (t) => all(t, (n) => n.type === "tr" && n.props?.id).map((n) => n.props.id);
  assert.deepEqual(ids(tree), ["person-p1", "person-p2", "person-p3"], "by last contact they tie, in the order read");
  sortByHeading(tree, "State");
  tree = draw();
  assert.equal(ids(tree)[0], "person-p2", `REGRESSION: the person who needs someone came last: ${ids(tree)}`);
  // The heading says it, and says it alone: a "By state" button beside the headings repeated what the arrow on State
  // already shows, and was taken away.
  const stateTh = find(tree, (n) => n.type === "th" && textOf(n).includes("State"));
  assert.match(
    String(stateTh?.props?.["aria-sort"]),
    /ascending|descending/,
    "and the State heading says the table is sorted by it",
  );
  assert.equal(
    all(tree, (n) => n.type === "button" && /^(By state|Z → A|A → Z)/.test(textOf(n).trim())).length,
    0,
    "with no second button saying it again",
  );
});

test("REGRESSION: a selection's file spells a cell as the route's export does -- a name a spreadsheet reads as a formula ran in whoever opened it, and a number lost its plus", async () => {
  await freshPage({ people: [person(1, { display_name: '=HYPERLINK("http://x")' }), person(2)] });
  const { blobs, restore } = catchExports();
  try {
    byTestId(draw(), "select-all").props.onChange();
    byTestId(draw(), "bulk-export").props.onClick();
    const lines = (await blobs.at(-1).text()).replace(/^\ufeff/, "").split("\r\n");
    assert.equal(
      lines[0],
      "Name,Phone,Email,Consent,Offers,State,Next step,Last contact",
      "a heading is quoted only when it must be, and the file follows the columns shown",
    );
    const hyper = lines.find((l) => l.includes("HYPERLINK"));
    assert.ok(
      hyper && hyper.startsWith(`"'=HYPERLINK(""http://x"")",'+1 (786) 555-1001,`),
      `REGRESSION: the formula was quoted and nothing more: ${hyper}`,
    );
    assert.deepEqual((await exportedNames(blobs.at(-1))).sort(), ['\'=HYPERLINK("http://x")', "Person 2"]);
    // A column the member shows joins the file, in the table's order, and one they hide leaves it: Reach and Offers were
    // asked for, the visit comes with a calendar, and First contact joins at the table's end.
    await freshPage({
      people: [person(1, { display_name: '=HYPERLINK("http://x")' }), person(2)],
      calendar: "ok",
      views: {
        people: { sortBy: "last", sortDir: "desc", columns: { reach: true, offers: true, since: true, state: false } },
      },
    });
    byTestId(draw(), "select-all").props.onChange();
    byTestId(draw(), "bulk-export").props.onClick();
    const wider = (await blobs.at(-1).text()).replace(/^\ufeff/, "").split("\r\n");
    assert.equal(
      wider[0],
      "Name,Phone,Email,Consent,Offers,Next step,Reach,Last contact,Next appointment,First contact",
      "the file follows the table: the columns shown, in the table's order, and not the State that was hidden",
    );
    assert.ok(
      wider.find((l) => l.includes("HYPERLINK")).startsWith(`"'=HYPERLINK(""http://x"")",'+1 (786) 555-1001,`),
      "and a cell is spelled the same under it",
    );
  } finally {
    restore();
  }
});

test("REGRESSION: a person's cell is who they are and what they said -- the channels, the number, their WhatsApp name, the counts and the first-contact date were one crowded line under every name", async () => {
  await freshPage({
    people: [
      person(1, { wa_profile_name: "zoë" }),
      person(2, {
        needs_human: true,
        open_escalation_reason: "human_token",
        open_escalation_since: iso(3 * H),
        latest_state: "needs_human",
      }),
      person(3, { queued_reply_at: iso(H) }),
    ],
    // Reach waits in the Columns menu (9 Oct 2026): the member has shown it.
    views: { people: { sortBy: "last", sortDir: "desc", columns: { reach: true } } },
  });
  const tree = draw();
  const cls = (n) => String(n.props?.className || "");
  const nameCell = (id) => find(rowOf(tree, id), (n) => n.type === "td" && /\bcl-name-cell\b/.test(cls(n)));
  const cell = nameCell("p1");
  assert.ok(!find(cell, (n) => /\bcl-row-meta\b/.test(cls(n))), "REGRESSION: a line of five facts under the name");
  assert.doesNotMatch(textOf(cell), /thread|call|since|on WhatsApp|786/, "none of those facts is left in the cell");
  assert.ok(
    find(cell, (n) => n.type === "span" && n.props?.["data-tip"] === "zoë on WhatsApp"),
    "their WhatsApp name, where it differs, is the name's tip",
  );

  // Each has a column of its own, which waits to be asked for: the number and the channels are Reach; when they first wrote
  // is First contact.
  assert.ok(headings(tree).includes("Reach"), "Reach is a column");
  assert.match(textOf(byTestId(rowOf(tree, "p1"), "row-reach")), /786/, "and it holds the number");
  assert.match(
    textOf(byTestId(rowOf(tree, "p1"), "row-reach")),
    /WhatsApp/,
    "and names the wire a reply goes on, in words",
  );
  assert.ok(
    !headings(tree).includes("First contact"),
    "First contact is in the Columns menu, not on screen by default",
  );

  // The receptionist's word beside the state says only what the pill does not.
  const stateCell = (id) => find(rowOf(tree, id), (n) => n.type === "td" && /\bcl-state-cell\b/.test(cls(n)));
  const mark = (id) => find(stateCell(id), (n) => /\bcl-row-recept-sign\b/.test(cls(n)));
  assert.equal(
    mark("p2"),
    null,
    'REGRESSION: "Needs you  escalated" -- the escalation is why they need you, said twice',
  );
  assert.equal(
    mark("p3") && textOf(mark("p3")),
    "reply waiting to go",
    "a reply waiting to go is news the pill does not carry",
  );
});

test("a heading that sorts is a button a keyboard reaches; one that does not is words", async () => {
  await freshPage({
    people: [person(1)],
    views: { people: { sortBy: "last", sortDir: "desc", columns: { came_from: true, offers: true } } },
  });
  const tree = draw();
  const ths = all(
    find(tree, (n) => n.type === "thead"),
    (n) => n.type === "th",
  );
  const isSort = (n) => n.type === "button" && /\bdtable-sort\b/.test(String(n.props?.className || ""));
  const withButton = ths.filter((th) => find(th, isSort));
  assert.deepEqual(
    withButton.map((th) => textOf(th).replace(/[▲▼↕]/g, "").trim()),
    ["Person", "State", "Next step", "Last contact", "Offers"],
    "REGRESSION: the sort was the cell's own click, which Tab never found",
  );
  for (const th of withButton) assert.equal(find(th, isSort).props.type, "button", "a button, not a form's submit");
  const cameFrom = ths.find((th) => th.props["data-key"] === "came_from");
  assert.ok(cameFrom, "Came from is drawn, the member having shown it");
  assert.equal(
    find(cameFrom, (n) => n.type === "button"),
    null,
    "Came from does not sort, so it is words",
  );
  assert.equal(
    textOf(find(cameFrom, (n) => /\bdtable-words\b/.test(String(n.props?.className || "")))).trim(),
    "Came from",
    "in a span of their own",
  );
  // Each heading that sorts carries a caret: the arrow for the sort the table is in (Last contact, most recent first), and a
  // quiet idle one on the others, so the ones that sort can be told from the ones that do not. Both are for the eye alone.
  const caret = (th) => find(th, (n) => /\bdtable-arrow\b/.test(String(n.props?.className || "")));
  const sorted = withButton.find((th) => th.props["data-key"] === "last");
  assert.equal(textOf(caret(sorted)), "▼", "the sorted heading says which way");
  assert.equal(caret(sorted).props["data-idle"], undefined, "and is not idle");
  for (const th of withButton.filter((x) => x !== sorted)) {
    assert.equal(textOf(caret(th)), "↕", `${th.props["data-key"]}: an idle caret`);
    assert.equal(caret(th).props["data-idle"], "true");
  }
  for (const th of withButton) assert.equal(caret(th).props["aria-hidden"], "true", "a caret is not read out");
  // The row's actions have no words of their own; a screen reader is given one.
  const actions = ths.find((th) => th.props["data-key"] === "actions");
  assert.equal(textOf(actions).trim(), "Actions", "the actions heading is read, not drawn");
  assert.ok(
    find(actions, (n) => /\brec-sr\b/.test(String(n.props?.className || ""))),
    "in the kit's screen-reader-only class",
  );
});

test("focusing a row puts the cursor on it, and the cursor's row is the table's tab stop -- J and K carry on from where a person tabbed or clicked", async () => {
  await freshPage({ people: [person(1), person(2), person(3)] });
  let tree = draw();
  const rows = (t) => all(t, (n) => n.type === "tr" && n.props?.id);
  assert.deepEqual(
    rows(tree).map((r) => r.props.tabIndex),
    [0, -1, -1],
    "with no cursor the first row is the tab stop",
  );
  rows(tree)[1].props.onFocus();
  tree = draw();
  assert.deepEqual(
    rows(tree).map((r) => /\bfocused\b/.test(r.props.className)),
    [false, true, false],
    "REGRESSION: a row focused by Tab or a click was not the cursor's",
  );
  assert.deepEqual(
    rows(tree).map((r) => r.props.tabIndex),
    [-1, 0, -1],
    "and it is the tab stop",
  );
  press("ArrowDown");
  tree = draw();
  assert.deepEqual(
    rows(tree).map((r) => /\bfocused\b/.test(r.props.className)),
    [false, false, true],
    "the keys carry on from it",
  );
  assert.equal(press("Enter", { tagName: "TR", isContentEditable: false, closest: () => null }), true);
  assert.equal(peeked(), "Preview of Person 3", "Enter on the focused row opens it");
});

/* ------------------------------ the loading standard: People's rows, place and search ------------------------------ */

test("a People row is drawn from what is its own: every prop is a primitive or the same object as last time -- the cell context was made new on every draw, so every row redrew on every keystroke", async () => {
  await freshPage({
    people: [person(1), person(2), person(3), person(4), person(5)],
    lists: [{ id: "s1", name: "Regulars", ids: ["p1"] }],
  });
  const rowsOf = (tree) =>
    all(
      tree,
      (n) =>
        (n.type && n.type.name === "TableRowView") || (n.type && n.type.type && n.type.type.name === "TableRowView"),
    );
  let tree = draw();
  const a = rowsOf(tree);
  assert.ok(a.length >= 5, "the table draws its rows as the kit's TableRowView");
  tree = draw();
  const b = rowsOf(tree);
  // (Not the columns, the toggle or the cursor setter: this stub's useMemo, useCallback and useState hand out new ones on
  // every draw, where React's hold; leads-honest's stub proves those.)
  for (const k of ["ctx", "onOpen", "rowClass", "words"])
    assert.ok(Object.is(a[0].props[k], b[0].props[k]), `${k} is the same object on a draw that changed nothing`);
  // A keystroke in the box is not a row's own either.
  lineBox().props.onChange({
    target: { value: "p" },
  });
  tree = draw();
  const c = rowsOf(tree);
  assert.ok(
    Object.is(a[0].props.ctx, c[0].props.ctx),
    "REGRESSION: the context was a new object on every draw, and the kit's row memo compares it by identity",
  );
  // The doors inside it are still the page's latest.
  a[0].props.ctx.onOpen("p1");
  assert.deepEqual(opened.slice(-1), ["p1"], "the row's Open reaches the page's own handler");
  // A kept list opened is a change of what a cell needs (its drop door), so the context changes once.
  draw({ initialSaved: "s1" });
  tree = draw({ initialSaved: "s1" });
  const d = rowsOf(tree);
  assert.ok(
    !Object.is(a[0].props.ctx, d[0].props.ctx),
    "a list opened gives the cells a drop door: a new context, once",
  );
  assert.ok(d[0].props.ctx.drop && d[0].props.ctx.drop.list.id === "s1");
  tree = draw({ initialSaved: "s1" });
  assert.ok(Object.is(d[0].props.ctx, rowsOf(tree)[0].props.ctx), "and it holds still again");
});

test("People keeps its place per view in the tab: the words in the box and the cursor on everyone, a kept list and a state each their own, and back after the page is left", async () => {
  installTabMemory(globalThis.window);
  clearTabMemory();
  const TM = provided("tabMemory");
  try {
    await freshPage({
      people: [person(1), person(2), person(3)],
      lists: [{ id: "s1", name: "Regulars", ids: ["p1", "p2"] }],
    });
    const box = () => lineBox();
    draw();
    let tree = draw();
    assert.equal(box(tree).props.value, "", "nothing kept yet");
    box(tree).props.onChange({ target: { value: "person 2" } });
    tree = draw();
    assert.equal(box(tree).props.value, "person 2");
    assert.deepEqual(
      TM.place("people", "all"),
      { q: "person 2", cursor: null, top: 0 },
      "kept as typed, under People's everyone view",
    );
    // The cursor with it: a row focused is the cursor (onFocus -> onCursor).
    const row = find(tree, (n) => n.type === "tr" && typeof n.props?.onFocus === "function");
    row.props.onFocus();
    tree = draw();
    assert.equal(TM.place("people", "all").cursor, row.props.id.replace(/^person-/, ""), "the cursor's row too");
    // A kept list opened is its own view: its own words (none yet), and its own place once typed into.
    draw({ initialSaved: "s1" });
    draw({ initialSaved: "s1" });
    tree = draw({ initialSaved: "s1" });
    assert.equal(box(tree).props.value, "", "REGRESSION: the list opened with everyone's words in the box");
    box(tree).props.onChange({ target: { value: "regular" } });
    tree = draw({ initialSaved: "s1" });
    assert.deepEqual(TM.place("people", "list:s1").q, "regular");
    assert.equal(TM.place("people", "all").q, "person 2", "everyone's words are still everyone's");
    // Back to everyone: its words and its cursor are put back.
    draw({ initialSaved: null });
    draw({ initialSaved: null });
    tree = draw({ initialSaved: null });
    assert.equal(box(tree).props.value, "person 2");
    // The page left (a profile, Today) and come back to: a fresh mount reads the place.
    setCells([]);
    draw();
    tree = draw();
    assert.equal(
      box(tree).props.value,
      "person 2",
      "REGRESSION: a search typed on People was gone after a trip to a profile",
    );
    // Cleared, the view is forgotten; signed out, everything is.
    box(tree).props.onChange({ target: { value: "" } });
    draw();
    assert.deepEqual(
      TM.place("people", "all"),
      { q: "", cursor: "p2", top: 0 },
      "no words: the cursor still keeps the view",
    );
    clearTabMemory();
    assert.equal(TM.place("people", "list:s1"), null);
  } finally {
    bridgeHolds({ parts: { tabMemory: undefined } });
  }
});

test("where a list's box cannot be watched, every row is drawn on the first draw, and so it is with a place to put back", async () => {
  // The window of a long list's rows is drawn only where the browser can watch the list's box (kit/rows/shown-rows.ts):
  // anywhere else the table is drawn whole, at once, as it always could be.
  const rowsOf = (tree) => all(tree, (n) => n.type === "tr" && /^person-/.test(String(n.props?.id || ""))).length;
  await freshPage({ people: Array.from({ length: 60 }, (_, i) => person(i)) });
  assert.equal(rowsOf(draw()), 60, "every row on the first draw");
  installTabMemory(globalThis.window);
  clearTabMemory();
  try {
    provided("tabMemory").keepPlace("people", "all", { q: "", cursor: null, top: 300 });
    setCells([]);
    assert.equal(rowsOf(draw()), 60, "a scroll to put back: every row on the first draw");
  } finally {
    clearTabMemory();
    bridgeHolds({ parts: { tabMemory: undefined } });
  }
});

test("a long list draws a window of its rows, and the cursor's row wherever the cursor walks or a sort carries it -- a thousand people were a thousand rows on every press of the tab", async () => {
  // Every row was built on each press of People's tab, and taken down on the way out (the strips review, 18 Oct 2026). Where
  // the browser can watch the list's box the table draws the rows on screen (here, before it has found where it scrolls: its
  // first screen), and the cursor's row wherever it is, so J and K, and a sort that keeps the cursor, always find it.
  const rowsOf = (tree) => all(tree, (n) => n.type === "tr" && /^person-/.test(String(n.props?.id || ""))).length;
  const focusedOf = (tree) => find(tree, (n) => n.type === "tr" && /\bfocused\b/.test(n.props?.className || ""));
  const everyone = Array.from({ length: 1000 }, (_, i) => person(i + 1));
  const done = watchingBoxes();
  try {
    await freshPage({ people: everyone });
    let tree = draw();
    assert.equal(rowsOf(tree), 40, "a window of the rows, not a thousand");
    const past = 45;
    for (let i = 0; i < past; i += 1) press("j");
    tree = draw();
    assert.equal(focusedOf(tree)?.props.id, `person-p${past}`, "the row the cursor walked to past the window is there");
    assert.equal(rowsOf(tree), 41, "the window and the cursor's row, still not a thousand");
    // A sort that carries the cursor's row to the foot of the list keeps it drawn there. Names sort as words, so
    // "Person 1" is first ascending and last descending.
    await freshPage({ people: everyone });
    draw();
    press("j");
    tree = draw();
    const isPerson = (n) =>
      n.type === "button" && /\bdtable-sort\b/.test(String(n.props?.className || "")) && textOf(n).startsWith("Person");
    find(tree, isPerson).props.onClick();
    find(draw(), isPerson).props.onClick();
    tree = draw();
    tree = draw();
    assert.equal(focusedOf(tree)?.props.id, "person-p1", "the cursor's row is drawn where the sort moved it");
  } finally {
    done();
  }
  await freshPage({ people: everyone });
  assert.equal(rowsOf(draw()), 1000, "a browser that cannot watch a box draws every row");
});

test("past everyone loaded, the line under the table says the server is being searched while it is, and the table is busy -- the search was silent until its rows landed", async () => {
  // The server's answer to the search is held on the wire until the test lands it.
  let answer = null;
  const seen = await freshPage({
    people: [person(1), person(2)],
    search: () =>
      new Promise((r) => {
        answer = r;
      }),
  });
  surfaceValue("people").page = { ...surfaceValue("people").page, total: 60000, has_more: true };
  draw();
  lineBox().props.onChange({
    target: { value: "person" },
  });
  let tree = draw();
  assert.ok(
    !/searching everyone/.test(textOf(byTestId(tree, "people-more"))),
    "not yet: the box waits a moment before asking",
  );
  await until(() => seen.queries.length === 1, "the box asked the server");
  tree = draw();
  assert.match(textOf(byTestId(tree, "people-more")), /searching everyone…/, "asked: said on the line");
  assert.equal(
    byTestId(tree, "people-table-scroll").props["aria-busy"],
    "true",
    "and the table is busy, for a screen reader",
  );
  assert.equal(
    all(tree, (n) => n.props?.["data-testid"] === "row-select").length,
    2,
    "the loaded rows its words match stay",
  );
  answer({ people: [], total: 0, has_more: false });
  await drained();
  await searchAnswered();
  tree = draw();
  assert.match(
    textOf(byTestId(tree, "people-more")),
    /names and numbers searched across everyone/,
    "answered: the words as before",
  );
  assert.equal(byTestId(tree, "people-table-scroll").props["aria-busy"], undefined);
});

test("a person's lists are chips: a list is a name, at the pill's size and in no state's colour", async () => {
  await freshPage({ people: [person(1)], lists: [{ id: "s1", name: "Regulars", ids: ["p1"] }] });
  setCells([]);
  frames.begin();
  const tree = PersonLists({ personId: "p1", canEdit: true, first: "Person", flash: () => {} });
  const chip = byTestId(tree, "person-list-chip");
  const cls = String(chip.props.className || "").split(" ");
  assert.ok(cls.includes("chip"), "the one chip");
  assert.ok(!cls.includes("seg-chip"), "not the blue 10px chip People kept for itself");
  const x = find(
    chip,
    (n) =>
      n.type === "button" &&
      String(n.props?.className || "")
        .split(" ")
        .includes("chip-x"),
  );
  assert.ok(x, "the chip's × takes them off");
  assert.equal(x.props["aria-label"], "Take Person off Regulars");
});

test("each row's standing with the proposal follow-up (0006): worked out where the rows are held, from the first page's facts, by the run's own rules, and only where they were read", async () => {
  const now = Date.now();
  const DAY = 86_400_000;
  const iso = (ms) => new Date(ms).toISOString();
  const out = (n, over = {}) =>
    person(n, {
      phone_e164: `+1917555020${n}`,
      consent: "opted_in",
      last_inbound_at: iso(now - 40 * DAY),
      latest_wa_inbound_at: iso(now - 40 * DAY),
      last_inbound_call_at: null,
      deal_id: `d${n}`,
      deal_stage: "proposed",
      deal_proposed_at: iso(now - 10 * DAY),
      deal_proposal_url: `https://docs.example.com/proposal/${n}`,
      ...over,
    });
  const facts = {
    run_hour: 10,
    last_run_for: null,
    asks: true,
    purpose: "conversational",
    had: { p2: iso(now - DAY) },
    queued: {},
    held: {},
    heard: {},
  };
  const people = [out(1), out(2), out(3, { deal_proposal_url: null })];
  wire({ people, per: 2, hasDeals: true, followUp: facts });
  await peopleOverride.apply();
  const by = Object.fromEntries(surfaceValue("people").rows.map((r) => [r.id, r.followUp]));
  assert.deepEqual([by.p1?.kind, by.p1?.asks], ["will", true], "waiting, with its link and a yes: in a run to come");
  assert.equal(by.p2?.kind, "had", "its one nudge went");
  assert.equal(by.p3, null, "no link: the follow-up does not reach them");
  // No facts read (no deal on file, or a run that would send nothing): no standing.
  wire({ people, followUp: null });
  await peopleOverride.apply();
  assert.ok(surfaceValue("people").rows.every((r) => r.followUp === null));
});
