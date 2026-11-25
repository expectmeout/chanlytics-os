/**
 * A lead that became a client, and a phone's search view, quieter (Ruben, 25 Sep).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LEAD_WORDS, leadsRoute } from "@chanlytics/contracts";
import {
  L,
  LEAD_CARD,
  LEAD_COLUMNS,
  LeadsPhoneBar,
  ROW_DTOS,
  SEARCH_A,
  UA,
  UB,
  addressed,
  all,
  byTestId,
  click,
  draw,
  find,
  fresh,
  lastWrite,
  leadRow,
  mapToggle,
  menuOf,
  openSheet,
  rowOf,
  search,
  settle,
  strips,
  surfaceValue,
  tabMemoryFor,
  textOf,
  went,
} from "./_page.mjs";

/* ------------------------------ a lead that became a client ------------------------------ */

test("a converted lead whose person became a client reads Client, on the desktop's row and on a phone's card; a proposal out or no deal keeps Converted", async () => {
  // Nothing stored on the lead (0004): the row reads People's row for the person it converted into, and only a deal
  // won says Client, in the deal pill's own tone. A proposal still out, or no deal at all, is the lead's own word.
  const dtos = [
    leadRow({ id: "c1", place_id: "ChIJclient1", business_name: "Client Gym", stage: "converted", contact_id: "k1" }),
    leadRow({ id: "c2", place_id: "ChIJclient2", business_name: "Proposal Gym", stage: "converted", contact_id: "k2" }),
    leadRow({ id: "c3", place_id: "ChIJclient3", business_name: "Nobody Gym", stage: "converted", contact_id: null }),
  ];
  const people = [
    { id: "k1", deal: { stage: "won", brief: "Client · Ad management" } },
    { id: "k2", deal: { stage: "proposed", brief: "Proposal out · 3 d" } },
  ];
  const cls = (n) => String(n?.props?.className || "");
  await fresh({ leads: { searches: [search()], rows: dtos } });
  // The rows the surface published for them: the page's own view of each (contracts' toLeadRowVM, the search beside it).
  const rows = L().rows;
  surfaceValue("people").rows = people;
  let tree = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  const tagOf = (id) => byTestId(rowOf(tree, id), "lead-state-tag");
  assert.equal(textOf(tagOf("c1")), "Client", "the stage word of the deal, never a word for a person");
  assert.equal(cls(tagOf("c1")), "pill pill-ok", "the deal pill's own tone");
  const statusOf = (id) => byTestId(rowOf(tree, id), "lead-status");
  assert.equal(textOf(statusOf("c2")), rows[1].stateTag, "a proposal still out is not a client: the lead's own word");
  assert.equal(textOf(statusOf("c3")), rows[2].stateTag, "no person, no deal: the lead's own word");
  // The rows reach the cell through its context, not the global. The page's rows are memoised (React.memo, which
  // this stub React lacks, so every row is drawn each time here) and the context is what they compare: on a cold
  // load of Leads the rows paint before the people land, and a cell that read window.__PEOPLE kept saying Converted
  // until a sort or a search drew it again. So: the page hands People's rows to the context, and the cell reads them
  // from there -- with the global emptied, a context carrying the rows still says Client, and one without them does not.
  const rowNode = find(
    tree,
    (n) => n.type && (n.type.name === "TableRowView" || (n.type.type && n.type.type.name === "TableRowView")),
  );
  assert.ok(rowNode, "the table draws its rows as the kit's TableRowView");
  assert.equal(rowNode.props.ctx.peopleRows, people, "REGRESSION: the cell context carried nothing from People");
  // The Stage column's cell: where a lead stands is said there, a client's door with it (5 Nov 2026).
  const business = LEAD_COLUMNS.find((c) => c.key === "stage");
  const pillOf = (td, testid) => find(td, (n) => n.props?.testid === testid);
  surfaceValue("people").rows = [];
  const withRows = pillOf(business.cell(rows[0], { ...rowNode.props.ctx, peopleRows: people }), "lead-state-tag");
  assert.deepEqual([withRows.props.kind, withRows.props.value], ["deal", "won"], "the context's rows say Client");
  const withCard = pillOf(LEAD_CARD.cell(rows[0], { ...rowNode.props.ctx, peopleRows: people }), "lead-state");
  assert.deepEqual([withCard.props.kind, withCard.props.value], ["deal", "won"], "and so does the phone's card");
  // D1-lead-person-door: the Client pill is the way to the person, through the cell context's own door (the page's
  // onOpenProfile); a proposal out has no Client pill, and so no door, and neither has a row whose people are not read.
  const went = [];
  const doorOf = (td) => find(td, (n) => n.props?.["data-testid"] === "lead-client-door");
  const door = doorOf(
    business.cell(rows[0], { ...rowNode.props.ctx, peopleRows: people, onOpenPerson: (id) => went.push(id) }),
  );
  assert.ok(door, "the Client pill is a door");
  assert.equal(door.props.title, LEAD_WORDS.openPerson);
  door.props.onClick({ stopPropagation() {} });
  assert.deepEqual(went, ["k1"], "it opens the person the lead converted into");
  assert.equal(doorOf(business.cell(rows[1], { ...rowNode.props.ctx, peopleRows: people })), null);
  assert.equal(doorOf(business.cell(rows[0], { ...rowNode.props.ctx, peopleRows: [] })), null);
  surfaceValue("people").rows = people;
  const without = pillOf(business.cell(rows[0], { ...rowNode.props.ctx, peopleRows: [] }), "lead-status");
  assert.equal(
    without.props.kind,
    "lead_stage",
    "REGRESSION: the cell read the global, so a context without the rows said Client",
  );

  await fresh({ leads: { searches: [search()], rows: dtos } });
  surfaceValue("people").rows = people;
  globalThis.__phone = true;
  try {
    tree = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
    const cardOf = (id) => find(rowOf(tree, id), (n) => n.props?.className === "pl-card");
    assert.equal(textOf(byTestId(cardOf("c1"), "lead-state")), "Client");
    assert.equal(cls(byTestId(cardOf("c1"), "lead-state")), "pill pill-ok");
    assert.equal(textOf(byTestId(cardOf("c2"), "lead-state")), rows[1].stateTag);
  } finally {
    globalThis.__phone = false;
  }
});

test("a lead a link names stays open where this tab kept a cursor in that view: the address's lead takes the cursor", async () => {
  const { navs, at, openPeek } = await addressed();
  // The tab's place for Leads (usePlPlace): the cursor was left on the first lead, in the view the link opens over.
  tabMemoryFor(globalThis.window).keepPlace("leads", leadsRoute({ searchId: null, list: "all", cls: null }), {
    q: "",
    cursor: UA,
    top: 0,
  });
  for (let i = 0; i < 4; i += 1) at(`leads:p-${UB}`);
  assert.equal(openPeek().vm.id, UB, "the link's lead, not the kept cursor's");
  assert.deepEqual(navs, [], "and the address is left as the link said it");
});

/* ------------------------------ a phone's search view, quieter (Ruben, 25 Sep) ------------------------------ */
// Needs review on a phone was the desktop's workbench squeezed in: a card restating the group's reason, its two
// buttons, then each row again with the reason a third time and a Keep and an Exclude of its own -- one group cost
// 430px before its second row. Now it is rows in groups, each group's acts on its line, and a row slides over Keep
// and Exclude; and the map, whose toggle stood in a controls row a phone never draws, opens from the bar's pin.

test("at a phone's width Needs review is rows in groups: the group's acts on its line, the reason on the row, a slide for its own act, and no bench", async () => {
  await fresh();
  globalThis.__phone = true;
  try {
    const tree = draw({ leadsRoute: `leads:s-${SEARCH_A}:c-review` });
    assert.equal(byTestId(tree, "lead-bench"), null, "no bench on a phone");
    assert.equal(all(tree, (n) => n.props?.["data-testid"] === "bench-card-keep").length, 0, "and no buttons on rows");
    const heads = all(tree, (n) => n.props?.["data-testid"] === "table-section");
    assert.ok(heads.length >= 1, "the groups, as the table's sections");
    const keepAll = byTestId(heads[0], "review-sec-keep");
    assert.ok(keepAll, "the group's Keep on its line");
    assert.equal(textOf(keepAll), "Keep all");
    const rows = all(tree, (n) => /\bpl-card-row\b/.test(String(n.props?.className || "")));
    assert.ok(rows.length >= 1, "the same cards as every other list");
    const first = rows[0];
    const id = String(first.props.id).replace(/^lead-/, "");
    assert.equal(id, "l3", "the review pile's one row");
    assert.equal(
      textOf(heads[0]),
      "Their email provider wouldn't answer1·Check againKeep allExclude all",
      "the group's words, its count, its acts (Check again has its door: the surface's own)",
    );
    assert.equal(
      textOf(byTestId(first, "lead-sub")),
      L().rows[2].sub,
      "the reason is said once, on the group's line; the row says where it is",
    );
    const card = find(first, (n) => n.props?.className === "pl-card");
    assert.equal(typeof card.props.onTouchStart, "function", "a thumb has the row");
    // The row takes its own touch, so a slide on it never walks the strip of views over the page as well: a slide right
    // kept the lead and moved to People in one stroke (5 Oct 2026; frame/surface-tabs.tsx).
    assert.equal(
      find(first, (n) => n.props?.className === "pl-card-cell").props["data-own-drag"],
      "",
      "the sliding row is marked as taking its own touch",
    );
    assert.deepEqual(
      all(first, (n) => /pl-card-ground/.test(String(n.props?.className || ""))).map(textOf),
      ["Keep", "Exclude"],
      "over the act's word on either side",
    );
    click(keepAll);
    await settle();
    assert.deepEqual(
      lastWrite(),
      { key: "POST /api/v1/leads/bulk", body: { by: "ids", action: "keep", ids: ["l3"], search_id: SEARCH_A } },
      "the line's Keep is the bulk door the bench and the bar press",
    );
    // A slide right past a third keeps the row: the kit leaves it and then presses the row's own door.
    const el = {
      style: {},
      offsetWidth: 343,
      offsetHeight: 84,
      scrollHeight: 84,
      clientHeight: 84,
      scrollWidth: 343,
      clientWidth: 343,
      scrollTop: 0,
      parentElement: null,
      isConnected: true,
      getClientRects: () => [1],
      matches: () => false,
    };
    card.props.onTouchStart({ touches: [{ clientX: 100, clientY: 300 }], currentTarget: el, target: el });
    card.props.onTouchMove({ touches: [{ clientX: 180, clientY: 302 }], currentTarget: el });
    card.props.onTouchEnd({ changedTouches: [{ clientX: 260, clientY: 304 }], currentTarget: el });
    assert.equal(el.style.transform, "translate3d(100%, 0, 0)", "180px of 343: gone right");
    // The kit leaves (180ms), presses the door, then settles the still-drawn row (60ms on) and clears its inline
    // styles once settled (240ms more): watched for, never read at a fixed moment, since a Linux timer lands these to
    // the millisecond and a Windows one ~15ms late.
    const until = async (f) => {
      for (const t0 = Date.now(); !f();) {
        if (Date.now() - t0 > 2000) return false;
        await new Promise((r) => setTimeout(r, 20));
      }
      return true;
    };
    assert.ok(
      await until(() => lastWrite()?.key === `POST /api/v1/leads/${id}/keep`),
      "slid right past a third: the row's own Keep",
    );
    assert.deepEqual(lastWrite(), { key: `POST /api/v1/leads/${id}/keep`, body: { search_id: SEARCH_A } });
    assert.ok(
      await until(() => el.style.transform === "" || el.style.transform === "translate3d(0, 0, 0)"),
      "and the row, still in the pile until the surface says, settles back",
    );
    await settle();
  } finally {
    globalThis.__phone = false;
  }
});

test("at a phone's width the bar's switch is one word, the view it opens, and the leads under the map are the list's own rows", async () => {
  // 25 Sep: the pin read as a hammer and said neither which view this was nor what it opened; under the map stood a
  // boxed list of its own (numbered rows, square tiles) that looked like no other list.
  await fresh();
  globalThis.__phone = true;
  try {
    let tree = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
    const bar = byTestId(tree, "leads-phone-bar");
    const sw = byTestId(bar, "leads-view-switch");
    assert.equal(
      textOf(sw).trim(),
      "Map",
      "one word, the view it opens: the list is the view shown (Ruben, 10 Oct 2026)",
    );
    assert.equal(sw.props["aria-label"], "Show the map");
    click(sw);
    tree = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
    const map = byTestId(tree, "lead-map");
    assert.ok(map);
    assert.equal(all(map, (n) => n.props?.["data-testid"] === "lead-map-row").length, 0, "no list of the map's own");
    assert.equal(all(map, (n) => n.props?.className === "ld-map-side").length, 0);
    assert.ok(
      all(tree, (n) => n.type === "tr" && String(n.props?.className || "").includes("pl-card-row")).length > 0,
      "the list's rows under it",
    );
    assert.ok(byTestId(map, "lead-map-count"), "how many are on it, in a line under the map");
    assert.equal(textOf(byTestId(byTestId(tree, "leads-phone-bar"), "leads-view-switch")).trim(), "List");
    click(byTestId(byTestId(tree, "leads-phone-bar"), "leads-view-switch"));
    tree = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
    assert.equal(byTestId(tree, "lead-map"), null, "and the list again");
  } finally {
    globalThis.__phone = false;
  }
});

test("at a phone's width a list picked in the Lists sheet opens and the sheet closes; picked again it stays open", async () => {
  // 25 Sep: the sheet stood open over the page it had opened, and a second press on the same row went back to all
  // leads, so an owner could not tell what their press had done.
  await fresh();
  globalThis.__phone = true;
  try {
    let tree = draw({ leadsRoute: "leads" });
    click(byTestId(tree, "leads-phone-lists"));
    tree = draw({ leadsRoute: "leads" });
    assert.ok(openSheet(tree, "people-lists-sheet"), "the sheet is open");
    click(byTestId(openSheet(tree, "people-lists-sheet"), "leads-list-ready"));
    assert.equal(went.at(-1), leadsRoute({ list: "ready" }), "the list opens");
    tree = draw({ leadsRoute: "leads:l-ready" });
    assert.equal(openSheet(tree, "people-lists-sheet"), null, "and the sheet has closed on it");
    click(byTestId(tree, "leads-phone-lists"));
    tree = draw({ leadsRoute: "leads:l-ready" });
    click(byTestId(openSheet(tree, "people-lists-sheet"), "leads-list-ready"));
    assert.equal(went.at(-1), leadsRoute({ list: "ready" }), "pressed again, it stays that list, never all leads");
  } finally {
    globalThis.__phone = false;
  }
});

test("at a phone's width the bar has the Map word where the rows have places, and it opens the map where the rows were", async () => {
  await fresh();
  globalThis.__phone = true;
  try {
    let tree = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
    const pin = byTestId(byTestId(tree, "leads-phone-bar"), "leads-view-switch");
    assert.ok(pin, "the word in the bar");
    assert.equal(textOf(pin).trim(), "Map");
    assert.equal(byTestId(tree, "lead-map"), null, "the rows first");
    click(pin);
    tree = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
    assert.ok(byTestId(tree, "lead-map"), "the map where the rows were");
    assert.equal(textOf(byTestId(byTestId(tree, "leads-phone-bar"), "leads-view-switch")).trim(), "List");
    assert.equal(all(tree, (n) => n.props?.className === "cl-controls").length, 0, "still no controls row");
  } finally {
    globalThis.__phone = false;
  }
});

// A list of your own (Reach out Part 7, J8): a search with no round and a plan with no area, drawn where the bridge's
// lists are not (the finder's strip is never asked for it), and its menu offering nothing that searches again.
test("a list of your own draws with no round and no area, reaches no finder strip, and its menu never searches again", async () => {
  const LIST = "5e000000-0000-4000-8000-000000000071";
  const list = search({
    id: LIST,
    name: "Expo gyms",
    asked: "gyms I met at the expo",
    via: "import",
    plan: {
      version: 1,
      card: "local_businesses",
      list: "import",
      name: "Expo gyms",
      asked: "gyms I met at the expo",
      terms: [],
      count: 3,
      contact: "email",
      criteria: [],
      exclusions: [],
    },
    round: null,
  });
  await fresh({ leads: { searches: [list, search()] } });
  draw({ leadsRoute: `leads:s-${LIST}` });
  assert.ok(
    strips.length > 0 &&
      strips.every((s) => s.vm.title === "0 of 0 on your list are ready" && s.vm.actions.length === 0),
    "the strip is the list's own (J8), never the finder's: a list has no round to narrate, and nothing on it searches again",
  );
  // No map: a list has no area to draw or to widen, though its leads were placed.
  draw({ leadsRoute: `leads:s-${LIST}` });
  click(mapToggle());
  assert.equal(byTestId(draw({ leadsRoute: `leads:s-${LIST}` }), "lead-map"), null);
  const items = menuOf("Expo gyms")
    .items.filter((i) => i.label)
    .map((i) => i.label);
  // A list has no round, so no count of one: Export names none rather than a 0 its rows would contradict.
  assert.deepEqual(items, ["Rename", "Export these", "Remove this search"]);
  const found = menuOf("Personal trainers · Austin")
    .items.filter((i) => i.label)
    .map((i) => i.label);
  assert.ok(found.includes("Find new ones") && found.includes("Search again, changed"), "a found search keeps both");
});

test("a lead in a sequence wears one status, its place there, with the step and the sequence under its name (the phone walk of 3 Nov 2026: Ready beside Waits for your OK read as two answers)", async () => {
  const placed = (group, extra = {}) => ({
    lead_id: "",
    sequence_id: "seq-1",
    name: "Bookstore intro",
    state: "on",
    group,
    place: 1,
    at: null,
    why: null,
    ...extra,
  });
  const rows = ROW_DTOS.map((r) =>
    r.id === "l1"
      ? { ...r, place: placed("waiting", { lead_id: r.id }) }
      : r.id === "l2"
        ? { ...r, place: placed("left", { lead_id: r.id, why: "removed" }) }
        : r.id === "l4"
          ? { ...r, place: placed("waiting", { lead_id: r.id }) }
          : r,
  );
  await fresh({ leads: { rows } });
  globalThis.__phone = true;
  try {
    const tree = draw();
    const cardOf = (id) => find(rowOf(tree, id), (n) => /\blist-row pl-card\b/.test(String(n.props?.className || "")));
    const pill = (id) => byTestId(cardOf(id), "lead-state");
    assert.equal(textOf(pill("l1")), "Waits for your approval", "the place, never Not contacted beside it");
    assert.equal(String(pill("l1").rendered?.props?.className ?? pill("l1").props?.className), "pill pill-warn");
    assert.equal(textOf(byTestId(cardOf("l1"), "lead-sub")), "Step 1 · Bookstore intro", "the step and the sequence");
    assert.equal(textOf(pill("l2")), "Taken out", "why it left, never Left beside the finder's Filtered out");
    assert.equal(textOf(byTestId(cardOf("l2"), "lead-sub")), "Bookstore intro");
    assert.equal(textOf(pill("l4")), "Filtered out", "a lead the finder filtered out says that, whatever its place");
  } finally {
    globalThis.__phone = false;
  }
  // A desk's name tag says the same, while the Stage column is not drawn to say it; with it, only the column does.
  const desk = draw();
  const rowNode = find(
    desk,
    (n) => n.type && (n.type.name === "TableRowView" || (n.type.type && n.type.type.name === "TableRowView")),
  );
  const business = LEAD_COLUMNS.find((c) => c.key === "business");
  const tagOf = (id, stageShown) =>
    find(
      business.cell(
        L().rows.find((r) => r.id === id),
        { ...rowNode.props.ctx, stageShown },
      ),
      (n) => n.props?.testid === "lead-state-tag",
    );
  assert.equal(tagOf("l1", false)?.props.label, "Waits for your approval");
  assert.equal(tagOf("l2", false)?.props.label, "Taken out");
  assert.equal(tagOf("l1", true), null, "the Stage column says it");
});

test("REGRESSION (the live run of 14 Nov 2026): while a selection is on, a phone's bar is Select's alone: no Sort, Import or Map beside its Cancel", () => {
  const base = {
    q: "",
    onQ() {},
    searchRef: null,
    canMap: true,
    sortItems: [{ id: "name", label: "Name", on: false }],
  };
  // Sort is a menu, found by its label; Import and Map are the bar's own words.
  const sortOf = (tree) => find(tree, (n) => n.props?.label === "Sort");
  const idle = LeadsPhoneBar({ ...base, select: { word: "Select", press() {} } });
  assert.ok(sortOf(idle), "Sort: there with nothing selected");
  for (const id of ["leads-phone-import", "leads-view-switch"])
    assert.ok(byTestId(idle, id), `${id}: there with nothing selected`);
  const picking = LeadsPhoneBar({ ...base, title: "35 selected", select: { word: "Cancel", press() {} } });
  assert.equal(sortOf(picking), null, "Sort: gone while 35 are selected");
  for (const id of ["leads-phone-import", "leads-view-switch"])
    assert.equal(byTestId(picking, id), null, `${id}: gone while 35 are selected`);
  assert.ok(byTestId(picking, "leads-phone-select"), "and its Cancel stays");
});
