/**
 * A search kept, the finder on a phone, and the strip's controls.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { leadPinTone } from "@chanlytics/contracts";
import {
  Icon,
  L,
  LEAD_COLUMNS,
  LeadHover,
  LeadPlanSheet,
  LeadStrip,
  LeadsRailRows,
  MARK_KEPT,
  PAGE_TWO,
  PLAN,
  PLANNED_THREAD,
  ROWS,
  ROW_DTOS,
  SEARCH_A,
  SEARCH_B,
  Sheet,
  all,
  askCalls,
  asks,
  bar,
  byTestId,
  click,
  confirms,
  draw,
  find,
  flashSaid,
  flashes,
  frames,
  fresh,
  lastWrite,
  ldPlacePop,
  leadRow,
  leadsView,
  mapToggle,
  member,
  menuOf,
  menus,
  minsAgo,
  navigated,
  offering,
  openPlanFrom,
  pageReads,
  panels,
  peeks,
  planChanged,
  press,
  quiesce,
  reads,
  rowOf,
  running,
  search,
  setCells,
  settle,
  sortByHeading,
  strips,
  takeFiles,
  textOf,
  toastAfter,
  waiting,
  went,
  writes,
} from "./_page.mjs";

/* --------------------------------- a search, kept --------------------------------- */

test("a kept search's menu says what was asked and when, and offers Rename, Find new ones, Search again, Export and Remove", async () => {
  await fresh();
  draw();
  const m = menuOf("Personal trainers · Austin");
  assert.ok(m, "every search on the rail has its menu");
  assert.deepEqual(
    m.items.map((i) => i.header || i.label || "—"),
    [
      "You asked on Sep 18: “personal trainers in Austin with a website, about 200”. Leaving out Chain gyms.",
      "Rename",
      "Find new ones",
      "Search again, changed",
      "Export these 161",
      "—",
      "Remove this search",
    ],
  );
  assert.equal(m.items.find((i) => i.label === "Find new ones").meta, "Only places not already in your leads count");
  assert.equal(
    m.items.find((i) => i.label === "Remove this search").meta,
    "Keeps the ones you contacted or are talking to.",
  );
  await toastAfter(() => m.items.find((i) => i.label === "Find new ones").onClick(), "the new round");
  assert.deepEqual(
    lastWrite(),
    { key: `POST /api/v1/lead-searches/${SEARCH_A}/more`, body: { purpose: "renew", plan: search().plan } },
    "the same plan, a new round",
  );
  assert.match(textOf(flashes.at(-1).msg), /Only places not already in your leads count/);
});

test("Search again, changed opens the plan with what was asked; Rename renames through its route; Remove is asked first, keeps the worked leads, and says so", async () => {
  const near = { kind: "zip", label: "near 78660", state: "TX", center: null, radius_m: 8_000, query: "78660" };
  const dry = search({ round: { ...search().round, ending: "searched_everything", nearby: [near] } });
  await fresh({ leads: { searches: [{ ...dry, plan: { ...PLAN, version: 3 } }] } });
  openPlanFrom();
  const again = panels.at(-1);
  assert.deepEqual(
    [again.stage, again.words, again.proposal.purpose],
    ["plan", "personal trainers in Austin with a website, about 200", "renew"],
  );
  assert.equal(again.plan, again.proposal.plan, "the card draws this search's plan, not an earlier one's");
  assert.deepEqual(again.facts.nearby, [near], "and offers where that search's last round said to look next");
  // However far along the search is, its plan opens unchanged, and says changed once the owner changes something.
  assert.deepEqual(planChanged(), [false, false], "at version 3, and nothing on the card has moved it");
  again.onChangePlan({ ...again.plan, version: 4 });
  assert.deepEqual(planChanged(), [true, true]);
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  strips.at(-1).onAction("nearby", { ...again.plan, area: near });
  assert.deepEqual(planChanged({ leadsRoute: `leads:s-${SEARCH_A}` }), [false, false], "a strip's next step, the same");
  // Rename happens where the search is: the rail's row becomes the box.
  await fresh();
  draw();
  menuOf("Personal trainers · Austin")
    .items.find((i) => i.label === "Rename")
    .onClick();
  let tree = draw();
  await toastAfter(
    () => byTestId(tree, "leads-rename-name").props.onKeyDown({ key: "Enter", target: { value: "Trainers, Austin" } }),
    "the rename",
  );
  assert.deepEqual(lastWrite(), {
    key: `PATCH /api/v1/lead-searches/${SEARCH_A}`,
    body: { name: "Trainers, Austin" },
  });
  assert.equal(textOf(flashes.at(-1).msg), "Renamed to Trainers, Austin");
  // Remove asks once, where the search is.
  await fresh();
  draw();
  menuOf("Personal trainers · Austin")
    .items.find((i) => i.label === "Remove this search")
    .onClick();
  draw();
  const asked = confirms.at(-1);
  assert.equal(asked.question, "Remove “Personal trainers · Austin”?");
  assert.equal(asked.detail, "Keeps the ones you contacted or are talking to.");
  await toastAfter(() => asked.onYes(), "the removal");
  assert.deepEqual(lastWrite(), { key: `DELETE /api/v1/lead-searches/${SEARCH_A}` });
  assert.equal(textOf(flashes.at(-1).msg), "Removed. The 18 you contacted or are talking to are kept.");
  assert.deepEqual(went.at(-1), "clients/leads", "the rail lost that row, so the view is every lead again");
});

test("Export these N is a press that POSTs the search's own view to the export route and saves the file", async () => {
  await fresh();
  const m = menuOf("Personal trainers · Austin") || (draw(), menuOf("Personal trainers · Austin"));
  const exportIt = m.items.find((i) => i.label === "Export these 161");
  assert.ok(exportIt, "the menu offers the search's leads as a file");
  const saved = takeFiles();
  try {
    const flashed = flashes.length;
    exportIt.onClick();
    await flashSaid(flashed);
    assert.deepEqual(
      lastWrite(),
      { key: "POST /api/v1/leads/export", body: { search: SEARCH_A, list: "all", sort: "fit", dir: "asc" } },
      "for this search, all of it, in the order the table has by default",
    );
    assert.equal(saved.length, 1, "the file is saved");
    assert.deepEqual(navigated, [], "and the browser is sent nowhere");
  } finally {
    saved.stop();
  }
});

/* ------------------------------------- the phone ------------------------------------- */

test("REGRESSION: on a phone a lead's row is People's row -- one cell of the face, the name and its state where it is not Ready; where it is, what it waits on or what left it out; its rating and when it was found. Leads' cards were their own: a 40px tile, three columns and a 44px Call", async () => {
  await fresh();
  globalThis.__phone = true;
  try {
    let tree = draw();
    const clsOf = (k) => String((k && (k.rendered || k).props?.className) || "");
    const cardOf = (id) => find(rowOf(tree, id), (n) => /\blist-row pl-card\b/.test(String(n.props?.className || "")));
    const tr = rowOf(tree, "l1");
    assert.ok(String(tr.props.className).split(/\s+/).includes("pl-card-row"), "the row People's rows wear");
    assert.deepEqual(
      all(tr, (n) => n.type === "td").map((td) => String(td.props.className)),
      ["dtable-sel", "pl-card-cell"],
      "one cell beside the face's box, as a person's row",
    );
    const card = cardOf("l1");
    // The kit's list row, People's: face, name, what trails it (on one that waits: Ready trails nothing), said, facts.
    const partOf = (c, part) => find(c, (n) => ` ${n.props?.className || ""} `.includes(` ${part} `));
    for (const part of ["list-row-face", "list-row-name", "list-row-said", "list-row-facts"])
      assert.ok(partOf(card, part), `a person's row, part for part: ${part}`);
    assert.ok(partOf(cardOf("l3"), "list-row-end"), "a person's row, part for part: list-row-end");
    const faceOf = (id) => find(cardOf(id), (n) => /\bface\b/.test(String(n.props?.className || "")));
    assert.equal(textOf(faceOf("l1")), ROWS[0].tile.initials, "the face: its initials, under the mark");
    // D6: the mark is the face on a phone too, on its own plate over the photo -- never the photo's circle crop.
    const faceImgs = (id) => all(faceOf(id), (n) => n.type === "img").map((n) => [n.props.className, n.props.src]);
    assert.deepEqual(faceImgs("l1"), [["face-photo face-mark", MARK_KEPT]], "the mark, contained on its plate");
    assert.deepEqual(faceImgs("l2"), [], "and a lead with neither keeps its initials");
    assert.equal(textOf(find(card, (n) => n.props?.className === "list-row-name")), "Zilker Strength Lab");
    // REGRESSION (the phone pass, 3 Nov 2026): "Not contacted" on nearly every row took the names' room.
    assert.equal(byTestId(card, "lead-state"), null, "Ready is the silent default, on a phone too");
    assert.equal(textOf(byTestId(card, "lead-sub")), L().rows[0].sub, "where it is");
    const facts = find(card, (n) => n.props?.className === "list-row-facts");
    assert.equal(
      all(facts, (n) => /\bld-slot-shape\b/.test(String(n.props?.className || ""))).length,
      0,
      "how a phone and a mailbox reach them is the lead's own page's, never two unlabelled circles",
    );
    assert.match(textOf(byTestId(facts, "lead-rated")), /5\.0 · 16/, "how it is rated");
    assert.equal(textOf(byTestId(facts, "lead-found")), L().rows[0].foundLine, "and when it was found, in words");
    // REGRESSION (the live run of 14 Nov 2026): one with no email address says so in words; one with an address says nothing.
    assert.equal(byTestId(facts, "lead-no-email"), null, "an address on file: nothing said");
    const noMail = find(cardOf("l4"), (n) => n.props?.className === "list-row-facts");
    assert.equal(textOf(byTestId(noMail, "lead-no-email")), "No email");
    assert.equal(
      byTestId(tr, "lead-call"),
      null,
      "REGRESSION: a 44px Call on every card; it is the lead's own page's first button now",
    );
    assert.equal(
      find(tr, (n) => /\bcl-actions-cell\b/.test(String(n.props?.className || ""))),
      null,
      "and no column of the desktop's",
    );
    // A lead that waits says on what, in the warn tone; a left-out one says what left it out, and was never checked.
    assert.equal(textOf(byTestId(cardOf("l3"), "lead-sub")), L().rows[2].waitsOn);
    assert.equal(clsOf(byTestId(cardOf("l3"), "lead-state")), "pill pill-warn");
    assert.equal(textOf(byTestId(cardOf("l4"), "lead-sub")), "Chain");
    assert.equal(textOf(byTestId(cardOf("l4"), "lead-state")), L().rows[3].stateTag);
    // The face is the checkbox, and while anyone is selected a tap on a row selects it rather than opening it.
    byTestId(rowOf(tree, "l1"), "row-select").props.onChange();
    tree = draw();
    const before = peeks.length;
    rowOf(tree, "l2").props.onClick();
    tree = draw();
    assert.equal(peeks.length, before, "a tap while selecting does not open the lead");
    assert.equal(byTestId(tree, "leads-bulk-bar").props["aria-label"], "2 leads selected", "it selects it");
  } finally {
    globalThis.__phone = false;
  }
});

test("on a phone the list and search are one top under the frame's strip; Find leads is its last control, the three's mark, a door to Ask; search is the field, on a row of its own", async () => {
  await fresh();
  const opened = [];
  const t = bar({ onFind: () => opened.push("find"), canFind: true });
  assert.equal(
    all(t, (n) => n.props?.role === "tab").length,
    0,
    "the switch is the frame's strip over the bar, not in it",
  );
  // The field from the first draw: a capsule at rest only drew the field on a tap, and a second tap began the typing
  // (Ruben, 11 Oct 2026). It stands under the bar's row, never in it.
  assert.equal(byTestId(t, "leads-phone-search").props["aria-label"], "Search leads");
  assert.equal(byTestId(t, "leads-phone-search-open"), null, "no capsule at rest to press first");
  assert.equal(
    byTestId(
      find(t, (n) => n.props?.className === "pp-bar"),
      "leads-phone-search",
    ),
    null,
    "REGRESSION: the box was 64px wide in the bar's row on a phone and said 'Sear'",
  );
  // The mark is a door to Ask, drawn for the widths where the shell has no ✦ (721-900px; leads.css hides it under
  // 720px, where the ✦ is the door, spec F1). It calls the page's one door with no words, never with its event.
  const door = byTestId(t, "leads-bar-find");
  assert.ok(
    find(door, (n) => n.type === Icon && n.props?.name === "three"),
    "the three's still mark",
  );
  door.props.onClick({ type: "click" });
  assert.deepEqual(opened, ["find"], "Find leads opens Ask");
  // The old coral square is gone: the bar's find glyph is the search's, folded while it holds no words (3 Nov 2026).
  const glyph = byTestId(t, "leads-phone-find");
  assert.equal(glyph.props["aria-label"], "Search leads", "the glyph opens the search, not Ask");
  assert.equal(find(glyph, (n) => n.type === Icon).props.name, "search", "the search's glyph");
  // The gate reads the role, as every gate does (frame-globals gate): an operator meets it at the door.
  await fresh({ role: "operator" });
  const gatedDoor = byTestId(bar({ canFind: false }), "leads-bar-find");
  assert.deepEqual(
    [gatedDoor.props["aria-disabled"], gatedDoor.props["aria-description"]],
    [true, "Only an owner can find businesses for you."],
    "an operator is told at the door, as at the desktop's button",
  );
  // The name gives way before the count: "All leads · 96" was one string, and a 375px phone drew it "All leads · …".
  const pick = byTestId(t, "leads-phone-lists");
  assert.equal(textOf(find(pick, (n) => n.props?.className === "pp-bar-pick-words")), "All leads");
  assert.equal(
    textOf(byTestId(pick, "leads-phone-lists-count")),
    "322",
    "REGRESSION: the count was the part an ellipsis took",
  );
  assert.equal(
    textOf(byTestId(bar({ listCount: 1240 }), "leads-phone-lists-count")),
    "1,240",
    "a count reads as a number",
  );
  assert.equal(
    all(t, (n) => n.props?.["data-testid"] === "leads-phone-bar").length,
    1,
    "one bar, not a row of controls",
  );
  assert.notEqual(
    byTestId(t, "leads-phone-search").props.autoFocus,
    true,
    "nothing takes focus by itself: the field takes the tap that lands on it",
  );
  assert.ok(
    byTestId(t, "leads-phone-lists"),
    "and the list stays over it, as the Inbox's buckets stay over its search",
  );
  const kept = byTestId(bar({ q: "pilates" }), "leads-phone-search");
  assert.equal(kept.props.value, "pilates", "a view's own words are in the field");
  assert.notEqual(kept.props.autoFocus, true, "without taking focus: a view coming back must not pull up the keyboard");
});

test("a phone's bar holds no switch (the frame's strip holds the Pipeline), and Leads keeps its list and its count", async () => {
  await fresh();
  const t = bar();
  assert.equal(all(t, (n) => n.props?.role === "tab").length, 0);
  assert.equal(textOf(byTestId(byTestId(t, "leads-phone-lists"), "leads-phone-lists-count")), "322");
  assert.ok(byTestId(t, "leads-bar-find"), "and the door to Ask is still the bar's last control");
});

test("the plan panel's sheet on a phone is the kit's Sheet in a job's shape: a title, Cancel, and a word's choices with their way back", async () => {
  // It was a dialog of the page's own, with the page's listener owning Esc; the kit's Sheet (Base UI's) owns its own,
  // as every phone sheet does (Ruben, 10 Oct 2026).
  await fresh();
  setCells([]);
  const t = LeadPlanSheet({
    open: true,
    title: "New search",
    onClose() {},
    children: globalThis.React.createElement("div", { "data-testid": "the-plan" }, "The plan"),
  });
  assert.equal(t.type, Sheet, "the kit's Sheet");
  assert.deepEqual(
    [t.props.shape, t.props.testid, t.props.title, t.props.close, t.props.back],
    ["job", "lead-plan-sheet", "New search", { word: "Cancel" }, null],
    "a job's shape, named, closed by a word, with no way back of its own",
  );
  const picking = LeadPlanSheet({ open: true, title: "How many", back: { onBack() {} }, onClose() {} });
  assert.ok(picking.props.back, "a word's picker brings its way back to the plan");
  assert.ok(byTestId(t, "the-plan"), "the panel the page put in it is drawn under its title");
});

test("at a phone's width the page draws the bar instead of the rail and the controls, and nothing else above the rows", async () => {
  await fresh();
  globalThis.__phone = true;
  const t = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  assert.ok(byTestId(t, "leads-phone-bar"), "one bar");
  const scroller = find(t, (n) =>
    String(n.props?.className || "")
      .split(" ")
      .includes("cl-main-scroll"),
  );
  assert.ok(scroller, "the page's scroller");
  assert.equal(
    byTestId(scroller, "leads-phone-bar"),
    null,
    "the bar stands over what scrolls, as the Inbox's strip does",
  );
  const pick = byTestId(t, "leads-phone-lists");
  assert.equal(
    textOf(find(pick, (n) => n.props?.className === "pp-bar-pick-words")),
    "Personal trainers · Austin",
    "the search that is open, by its name",
  );
  assert.equal(byTestId(pick, "leads-phone-lists-count"), null, "its count is the line under the bar, as People's is");
  assert.equal(all(t, (n) => n.props?.className === "cl-controls").length, 0, "no controls row above the rows");
  assert.equal(all(t, (n) => n.props?.className === "cl-rail").length, 0, "no rail");
  // The workspace's count is All leads' (People's line, 12 Nov); a search keeps only another one waiting (16 Nov 2026).
  assert.equal(textOf(byTestId(t, "leads-standing")), "1 search needs you", "in a search: another one waiting");
  assert.equal(all(draw(), (n) => n.props?.["data-testid"] === "leads-standing").length, 1, "All leads: the count");
  assert.equal(byTestId(draw({ leadsRoute: `leads:s-${SEARCH_B}` }), "leads-standing"), null, "its own wait: none");
  const above = all(
    t,
    (n) =>
      n.props?.["data-testid"] === "leads-phone-bar" ||
      n.type === LeadStrip ||
      /\bpl-table-wrap\b/.test(String(n.props?.className || "")),
  );
  assert.deepEqual(
    above.map((n) => n.props["data-testid"] || (n.type === LeadStrip ? "lead-strip" : "table")),
    ["leads-phone-bar", "lead-strip", "table"],
    "the bar, the strip, the work",
  );
  globalThis.__phone = false;
});

test("REGRESSION: past a page of leads, the line under them stands in the scope's gutter on a desktop and on a phone -- its own padding put its words at the pane's edge", async () => {
  for (const phone of [false, true]) {
    await fresh({ leads: { more: PAGE_TWO } });
    globalThis.__phone = phone;
    const tree = draw();
    const more = byTestId(tree, "leads-more");
    assert.ok(more, `more leads than a page: the line is drawn (${phone ? "phone" : "desktop"})`);
    assert.equal(textOf(more), `${ROWS.length} of 322 loaded Show more`, "the count, then the one button");
    assert.equal(more.props.children.at(-1), byTestId(more, "leads-more-btn"), "the button ends the line");
    // The gutter is the scope's (.ld-more reads --gutter-page: 28px, and 16px at 900px and under), and nothing on
    // the line says otherwise.
    assert.ok(String(more.props.className).split(/\s+/).includes("ld-more"), "the line takes the scope's gutter");
    assert.equal(
      more.props.style,
      undefined,
      "REGRESSION: an inline padding of 8px 0 16px set the sides to 0, 28px left of the table on a desktop and 16px on a phone",
    );
  }
  globalThis.__phone = false;
});

test("the strip above the table is a component that exists, with a view model behind it and one seam back to the page", async () => {
  await fresh();
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  const s = strips.at(-1);
  assert.ok(
    s,
    "opening a search draws its strip (LeadStrip, imported by the scope): a name nothing declares would throw here",
  );
  assert.equal(s.vm.title, "Found 161 personal trainers", "the ended round's own sentence, from contracts");
  assert.deepEqual(
    s.vm.parts,
    ["88 you can email", "72 by phone"],
    "what the search set aside is ours, never a number of its ending (decision 0133)",
  );
  assert.equal(typeof s.onAction, "function", "one onAction, and it is the page's");
});

// The phone's sheet is compact (People's RailEmpty): a list with no lead in it is said in a line, not drawn; all leads
// and the one picked always are, and every search is drawn -- each is a thing kept, with its own menu.
test("Leads' rows, compact in a phone's sheet: an empty list is said in a line, all leads, the picked one and every search stay", async () => {
  await fresh();
  const rail = {
    lists: [
      { id: "all", label: "All leads", count: 12 },
      { id: "ready", label: "Not contacted", count: 12 },
      { id: "nurture", label: "Contacted", count: 0 },
      { id: "converted", label: "Talking", count: 0 },
      { id: "not_a_fit", label: "Not a fit", count: 0 },
    ],
    searches: [{ id: SEARCH_B, name: "Chiropractors · Round Rock", count: 0, mark: "question", undoable: false }],
    sequences: [{ id: SEARCH_A, name: "Chiropractors", count: 3, mark: null, undoable: false, list: true }],
  };
  const props = {
    rail,
    list: "not_a_fit",
    searchId: null,
    canFind: true,
    wordsFor: () => ({ askedLine: "", keepsLine: "" }),
    onPickList: () => {},
    onPickSearch: () => {},
    exportFor: () => () => {},
    onNew: () => {},
  };
  const lists = (tree) =>
    [...new Set(all(tree, (n) => String(n.props?.["data-testid"] || "").startsWith("leads-list-")))].map(
      (n) => n.props["data-testid"],
    );
  frames.begin();
  const compact = LeadsRailRows({ ...props, compact: true });
  assert.deepEqual(lists(compact), ["leads-list-all", "leads-list-ready", "leads-list-not_a_fit"]);
  assert.equal(textOf(byTestId(compact, "leads-lists-empty")), "Empty now: Contacted · Talking");
  assert.ok(byTestId(compact, `leads-search-${SEARCH_B}`), "a search with nothing counted yet is still drawn");
  // A sequence's own list is drawn under Sequences, apart from the searches (00496; the walk of 30 Oct 2026).
  assert.ok(byTestId(byTestId(compact, "leads-sequence-lists"), `leads-search-${SEARCH_A}`));
  frames.begin();
  const desk = LeadsRailRows(props);
  assert.equal(lists(desk).length, 5, "a desktop's rail draws every list");
  assert.equal(byTestId(desk, "leads-lists-empty"), null);
});

test("the running strip's Stop reaches the stop route, and the question's Yes and Stop here reach the answer route carrying no plan", async () => {
  await fresh({ leads: { searches: [running(), waiting] } });
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  const strip = strips.at(-1);
  assert.deepEqual(
    strip.vm.actions.map((a) => a.id),
    ["stop"],
    "a running round offers one thing to press",
  );
  await strip.onAction("stop");
  await settle();
  assert.deepEqual(
    lastWrite(),
    { key: `POST /api/v1/lead-searches/${SEARCH_A}/stop` },
    "POST lead-searches/[id]/stop, and nothing else rides with it",
  );
  assert.match(
    textOf(flashes.at(-1).msg),
    /still being checked/,
    "and the page says what is still happening, not that it is done",
  );
  await fresh();
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  const q = strips.at(-1);
  assert.deepEqual(
    q.vm.actions.map((a) => a.id),
    ["keep", "include", "change", "stop_here"],
  );
  await q.onAction("keep");
  await settle();
  assert.deepEqual(
    lastWrite(),
    { key: `POST /api/v1/lead-searches/${SEARCH_B}/answer`, body: { answer: "keep" } },
    "Keep carries no plan (PRD 7.2)",
  );
  await fresh();
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  await strips.at(-1).onAction("stop_here");
  await settle();
  assert.deepEqual(lastWrite(), { key: `POST /api/v1/lead-searches/${SEARCH_B}/answer`, body: { answer: "stop" } });
});

// The door answers with the search the round is on (POST lead-searches/[id]/more). The page used to leave the owner on
// All leads with a live dot in the rail and no strip: the receipt said "Leads shows it", and Leads did not.
test("approving a search's own plan starts a round of it and lands on it, where the strip is; a top-up stays where it is", async () => {
  await fresh();
  // A kept search's Search again, changed opens the plan Claude wrote, and approving it goes to the door Find new ones
  // goes to. It is no Ask card: Ask's door refused it for having no kind, from the first build (#690) to 4 Nov 2026.
  openPlanFrom();
  const f = panels.at(-1);
  assert.deepEqual([f.open, f.stage], [true, "plan"], "the card is up");
  const changed = { ...PLAN, count: 50 };
  await f.onApprove(changed);
  await settle();
  assert.deepEqual(lastWrite(), {
    key: `POST /api/v1/lead-searches/${SEARCH_A}/more`,
    body: { purpose: "renew", plan: changed },
  });
  assert.equal(went.at(-1), `clients/leads:s-${SEARCH_A}`, "straight to the search, its strip and its classes");
  went.length = 0;
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  strips.at(-1).onAction("include", "chain");
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  await panels.at(-1).onApprove(panels.at(-1).plan);
  await settle();
  assert.ok(
    !went.some((w) => w.includes("clients/leads:s-")),
    "an answer on an open search does not move the owner off it",
  );
});

test("Include opens the plan with that exclusion taken back and starts nothing; approving it answers with the version the owner saw", async () => {
  await fresh();
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  strips.at(-1).onAction("include", "chain");
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  assert.deepEqual(writes, [], "a press starts nothing that costs: the owner approves the plan first");
  const f = panels.at(-1);
  assert.equal(f.stage, "plan");
  assert.deepEqual(f.plan.exclusions, [], "the thing it asked about is taken out of the plan");
  assert.equal(f.plan.version, 2, "which is a new version, and that is the one the route is given");
  assert.deepEqual(planChanged({ leadsRoute: `leads:s-${SEARCH_B}` }), [true, true], "it does change what runs");
  assert.equal(f.words, "", "the answer row under it starts empty: the owner's answer, not what they first asked");
  await f.onApprove(f.plan);
  await settle();
  assert.deepEqual(lastWrite(), {
    key: `POST /api/v1/lead-searches/${SEARCH_B}/answer`,
    body: { answer: "include", plan: f.plan },
  });
});

// "What if the answer is no, but I want it to update the search?" Change what I asked opens the plan panel's answer
// row under the question, empty; the turn names the search's id, so Ask's card comes back carrying `amends` at the
// version and count the server set, and approving it commits that card through Ask's door, which answers the
// waiting round (commit.ts, spec G4/G5). A card without `amends` would start a second search while the first waited
// a day and died, so the panel refuses it.
test("Change what I asked opens the answer row under the question, and approving commits the amending card, not a new search", async () => {
  await fresh();
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  strips.at(-1).onAction("change");
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  const f = panels.at(-1);
  assert.deepEqual(
    [
      f.stage,
      f.words,
      f.answering && f.answering.question,
      f.answering && f.answering.searchId,
      f.answering && f.answering.name,
      f.answering && "baseVersion" in f.answering,
    ],
    ["compose", "", waiting.round.question.sentence, SEARCH_B, waiting.name, false],
    "empty, under the question, naming the search; the version and count are the route's",
  );
  assert.deepEqual(writes, [], "nothing is asked or spent by opening it");
  const amends = { search_id: SEARCH_B, name: waiting.name, question: waiting.round.question.sentence };
  const card = {
    id: "p-amend",
    kind: "lead_search",
    needs: "owner",
    title: "Find 200 personal trainers",
    summary: "",
    payload: {
      plan: { ...PLAN, exclusions: [], version: 2, count: 200 },
      view: { title: "Find 200 personal trainers" },
      facts: null,
      amends,
    },
    undo: "Stop the search",
  };
  const sent = [];
  askCalls().send = async (req, on) => {
    sent.push(req);
    on({ t: "final", message: { text: "", proposals: [card] } });
  };
  const committed = [];
  askCalls().commit = async (p) => {
    committed.push(p);
    return { ok: true, receipt: `Answered. ${waiting.name} carries on with your answer; Leads shows it.`, undo: null };
  };
  await f.onAnswer("include the chains too");
  await settle();
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  assert.deepEqual(
    [sent[0].text, sent[0].threadId, sent[0].answering],
    ["include the chains too", PLANNED_THREAD, { searchId: SEARCH_B }],
    "the owner's words, in the conversation the search was planned in, naming the search for the route to read",
  );
  assert.equal(sent[0].surface, "leads", "the amend turn is on the Leads surface (spec F5)");
  const shown = panels.at(-1);
  assert.deepEqual([shown.stage, shown.plan.version, shown.plan.count], ["plan", 2, 200], "the card's own plan");
  assert.deepEqual(planChanged({ leadsRoute: `leads:s-${SEARCH_B}` }), [false, false], "Ask's card counts from itself");
  await shown.onApprove(shown.plan);
  await settle();
  assert.equal(committed.length, 1, "the card commits through Ask's door");
  assert.deepEqual(
    [committed[0].id, committed[0].payload.amends, committed[0].payload.plan],
    ["p-amend", amends, shown.plan],
    "as the card it is, with the plan the owner approved",
  );
  assert.deepEqual(writes, [], "the page posts no answer of its own: the answer went through Ask's door");
  assert.equal(textOf(flashes.at(-1).msg), "Carrying on with your change.");
  assert.ok(
    !went.some((w) => w.includes("clients/leads:s-")),
    "an answer is on the search already open, so the owner stays",
  );
});

test("a fresh Find after an abandoned answer is Ask's, and a plan opened after it is not an answer", async () => {
  await fresh();
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  strips.at(-1).onAction("change");
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  assert.ok(panels.at(-1).answering, "answering");
  // Left half-done: Esc closes the panel and lets the answer go, then F is Ask's (spec F7): it opens no panel, so
  // nothing of the answer can ride on it.
  press("Escape");
  let drawn = panels.length;
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  assert.equal(panels.length, drawn, "closed: the panel is not drawn any more");
  press("f");
  drawn = panels.length;
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  assert.equal(asks.at(-1), "open", "F opens Ask, not a panel");
  assert.equal(panels.length, drawn);
  menuOf("Chiropractors · Round Rock")
    .items.find((i) => i.label === "Search again, changed")
    .onClick();
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  assert.equal(panels.at(-1).stage, "plan");
  assert.equal(panels.at(-1).answering, null, "Search again opens a plan that is not answering anything");
  // Change what I asked on that plan is Ask's too, with what the search asked for in the field: the panel
  // composes nothing (spec F5), so the words go where a fresh Find is written.
  panels.at(-1).onBack();
  drawn = panels.length;
  draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  assert.equal(panels.length, drawn, "the panel closed");
  assert.deepEqual(asks.at(-1), { mode: "compose", prompt: waiting.asked }, "and Ask opened with the words");
});

// The question is only ever about places left out, and while it waits nothing is counted (under an email standard
// nothing counts until the checks): the search's own view was an empty table saying "Describe the businesses you
// want", with the evidence a tab away.
test("a waiting search opens on the places its question is about, and its counted view says it is waiting", async () => {
  await fresh();
  const tree = draw();
  click(byTestId(tree, `leads-search-${SEARCH_B}`));
  assert.equal(went.at(-1), `clients/leads:s-${SEARCH_B}:c-excluded`, "the waiting search opens on its left-out pile");
  click(byTestId(draw(), `leads-search-${SEARCH_A}`));
  assert.equal(went.at(-1), `clients/leads:s-${SEARCH_A}`, "a search that is not waiting opens as it did");
  await fresh({ leads: { rows: [] } });
  const counted = draw({ leadsRoute: `leads:s-${SEARCH_B}` });
  assert.match(textOf(counted), /Nothing is counted yet\./);
  assert.match(textOf(counted), /It is waiting for your answer above\./);
  assert.doesNotMatch(textOf(counted), /Describe the businesses you want/);
});

test("an ending's one next step opens the plan and starts nothing until it is approved; Sort by fit and the new ones go to the surface", async () => {
  const justNow = new Date(Date.now() - 60_000).toISOString();
  const done = {
    ...search(),
    round: {
      ...search().round,
      state: "ended",
      ending: "stopped",
      counted: 61,
      ended_at: justNow,
      undo_op_id: null,
      undo_version: null,
    },
  };
  await fresh({ leads: { searches: [done, waiting] } });
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  const s = strips.at(-1);
  assert.deepEqual(
    s.vm.actions.map((a) => a.id),
    ["carry_on"],
    "one next step, and no pile of ours (decision 0133)",
  );
  s.onAction("carry_on", s.vm.actions[0].arg);
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  assert.deepEqual(writes, [], "Carry on opens the plan; nothing runs until it is approved");
  assert.equal(panels.at(-1).stage, "plan");
  await panels.at(-1).onApprove(panels.at(-1).plan);
  await settle();
  assert.deepEqual(
    lastWrite(),
    { key: `POST /api/v1/lead-searches/${SEARCH_A}/more`, body: { purpose: "topup", plan: search().plan } },
    "and then it is POST lead-searches/[id]/more",
  );
  // A refresh found twelve the view is not showing: offered, never sorted in. The open search holds them.
  await offering({ searchId: SEARCH_A }, 12, { searches: [done, waiting] });
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  await quiesce();
  const off = strips.at(-1);
  assert.equal(off.vm.actions[0].label, "Show 12 new", "what a refresh found is offered, never sorted in");
  reads.length = 0;
  await off.onAction("take_offered");
  await settle();
  assert.deepEqual(
    pageReads().map((q) => [q.search, q.list, q.sort, q.dir]),
    [[SEARCH_A, "all", "stage", "asc"]],
    "the new ones are taken in the order they were read, on the owner's press",
  );
  assert.deepEqual([L().offered, L().rows.length], [0, ROW_DTOS.length + 12], "and they are the rows now");
  // Sort by fit is a new read of the same view, never a re-order of the rows on the page: from another order, it asks.
  sortByHeading(draw({ leadsRoute: `leads:s-${SEARCH_A}` }), "Rated");
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  await quiesce();
  assert.equal(pageReads().at(-1).sort, "rating", "the sort the owner chose was read");
  reads.length = 0;
  off.onAction("sort_fit");
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  await quiesce();
  // The surface's, never a re-order on the page: an order this tab has not read is asked of the server.
  assert.equal(pageReads().at(-1).sort, "fit", "the fit view is read, and the rows stay until it lands");
  assert.deepEqual([L().view.sort, L().view.dir], ["fit", "asc"], "Sort by fit is the surface's view of fit");
});

test("the search menu removes the untouched leads and credits the month, named for what it does, and its toast puts them back", async () => {
  const justNow = new Date(Date.now() - 60_000).toISOString();
  const done = { ...search(), round: { ...search().round, ended_at: justNow, undo_op_id: null, undo_version: null } };
  await fresh({ leads: { searches: [done, waiting] } });
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  // Not on the strip: an "Undo" beside "the 61 found are yours" read as deleting what was just paid for.
  assert.ok(
    !strips.at(-1).vm.actions.some((a) => a.id === "undo"),
    "the strip carries the ending and its next step, never a control that removes leads",
  );
  const menu = menus.find((m) => m.title === `More for ${done.name}`);
  const item = menu.items.find((i) => i.label === "Remove the ones you haven't touched");
  assert.ok(item, "the menu names what it removes");
  assert.match(item.meta, /given back this month/);
  const waitingMenu = menus.find((m) => m.title === `More for ${waiting.name}`);
  assert.ok(
    !waitingMenu.items.some((i) => i.label === "Remove the ones you haven't touched"),
    "a round still running has nothing to remove yet",
  );
  await toastAfter(() => item.onClick(), "the untouched leads removed");
  assert.deepEqual(lastWrite(), { key: `POST /api/v1/lead-searches/${SEARCH_A}/undo` });
  assert.equal(textOf(flashes.at(-1).msg), "Removed 160 · 160 given back");
  await flashes.at(-1).undo();
  assert.deepEqual(
    lastWrite(),
    { key: "POST /api/v1/lead-operations/op-u/undo", body: { version: 2 } },
    "the toast's own Undo names the operation and the version it saw",
  );
});

// D5: every fact on this page is about a place, so the leads can be looked at as places. The picture is made from
// what the search already found -- no tile, and no request to anybody.
test("D5: the same leads, on the ground — a pin per lead the source placed, the pile beside it, and a wider search one press away", async () => {
  await fresh();
  const at = () => draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  let tree = at();
  assert.equal(byTestId(tree, "lead-map"), null, "a page opens on the rows");
  click(mapToggle());
  tree = at();
  const map = byTestId(tree, "lead-map");
  assert.ok(map, "the map stands where the table stood");
  assert.equal(
    find(tree, (n) => n.type === "table"),
    null,
  );
  const pins = all(map, (n) => /^lead-pin-/.test(String(n.props?.["data-testid"] || "")));
  assert.deepEqual(
    pins.map((p) => p.props["data-testid"]),
    ["lead-pin-l1", "lead-pin-l2", "lead-pin-l3", "lead-pin-l4", "lead-pin-l5"],
    "one pin per lead the source placed",
  );
  assert.equal(textOf(byTestId(map, "lead-map-count")), "5 on the map");
  assert.match(
    textOf(byTestId(map, "lead-map-scale")),
    /mi across$/,
    "how wide the square is, in the owner's own unit",
  );
  assert.equal(byTestId(map, "lead-map-ring"), null, "this search named a city and no centre yet, so no area is drawn");
  // One search is open and its plan never measured a centre, so there is no ring: the leads are the picture, and no
  // line says so (Ruben, 10 Oct 2026); the line that said "these searches" read as though several were on screen.
  assert.equal(byTestId(map, "lead-map-note"), null);
  assert.equal(byTestId(map, "lead-map-toowide"), null, "one city's leads are one place, so the square is drawn");
  assert.equal(
    all(map, (n) => n.props?.["data-testid"] === "lead-map-row").length,
    5,
    "the same leads beside it, nearest the middle first",
  );
  assert.match(pins[0].props["aria-label"], /^Zilker Strength Lab — /, "a pin says who it is and what it is");
  assert.match(
    String(pins[0].props.className),
    /tone-plain/,
    "a pin wears its row's state: a lead ready to call is the quiet default, as its row is",
  );
  assert.doesNotMatch(String(pins[0].props.className), /is-out/, "a qualified lead stands at full strength");
  assert.match(String(pins[4].props.className), /is-out/, "a lead that was left out steps back, as its row does");

  pins[0].props.onMouseEnter();
  tree = at();
  assert.match(
    textOf(byTestId(tree, "lead-map-card")),
    /Zilker Strength Lab/,
    "the pin under the pointer names itself",
  );
  // One meaning, said under the map (25 Sep): a pin wears its row's state, and the legend names each state a pin on
  // the map wears, in the row's own words. There is no switch of colourings any more: it had no key, and two of its
  // three repeated the rows.
  assert.equal(all(tree, (n) => /^map-by-/.test(String(n.props?.["data-testid"] || ""))).length, 0, "no colour switch");
  const keys = all(byTestId(tree, "lead-map-legend"), (n) =>
    /^lead-map-key-/.test(String(n.props?.["data-testid"] || "")),
  );
  assert.ok(keys.length > 0, "a legend under the map");
  for (const k of keys) {
    const state = k.props["data-testid"].slice("lead-map-key-".length);
    const dot = find(k, (n) => String(n.props?.className || "").includes("ld-pin-dot"));
    assert.match(
      String(dot.props.className),
      new RegExp(`tone-${leadPinTone({ state })}`),
      `${state}: the pin's own tone`,
    );
  }
  assert.match(
    textOf(byTestId(tree, "lead-map-key-out")),
    /Closed or filtered out/,
    "the row's own words for a lead that left",
  );
  // Filtered out steps back, as its row does.
  assert.match(String(byTestId(tree, "lead-pin-l5").props.className), /is-out/);

  click(byTestId(tree, "lead-pin-l1"));
  tree = at();
  assert.equal(peeks.at(-1).vm.id, "l1", "a pin opens its lead, as a row does");

  click(byTestId(tree, "map-widen"));
  at();
  assert.deepEqual(
    [panels.at(-1).stage, panels.at(-1).plan.area.radius_m],
    ["plan", 50000],
    "Search wider opens the plan with twice the ground, and starts nothing until it is approved",
  );
  click(mapToggle());
  tree = at();
  assert.equal(byTestId(tree, "lead-map"), null, "and the rows come back");
});

// The row's two tags and its Stage column are the app's one StatePill, on the registry's tones. They were a
// hand-styled family of their own (.ld-state-tag, .ld-fit-tag, .ld-dot), and a Contacted tag drew grey while its
// dot, its pin and tone.ts all said info. No test ever drew a fit tag: the fixture search publishes no fits, so
// leadBand never called them mixed. Here a real row in every state is drawn through the whole page.
test("a lead's state and fit are the one StatePill, in the registry's tones -- and Contacted is info, as its dot and its pin are", async () => {
  const dtos = [
    leadRow({ id: "p1", place_id: "ChIJpill1", business_name: "Ready Gym" }),
    leadRow({
      id: "p2",
      place_id: "ChIJpill2",
      business_name: "Contacted Gym",
      stage: "nurture",
      contacted_at: minsAgo(120),
    }),
    leadRow({ id: "p3", place_id: "ChIJpill3", business_name: "Talking Gym", stage: "converted" }),
    leadRow({
      id: "p4",
      place_id: "ChIJpill4",
      business_name: "Review Gym",
      member: member({ class: "review", fit: "look", reason: "Couldn't check the email" }),
    }),
    leadRow({
      id: "p5",
      place_id: "ChIJpill5",
      business_name: "Said No Gym",
      stage: "archived",
      closed_reason: "said_no",
    }),
    leadRow({
      id: "p6",
      place_id: "ChIJpill6",
      business_name: "Chain Gym",
      member: member({ class: "excluded", fit: null, reason: "A chain with 40 locations", excluded_by: "chain" }),
    }),
    leadRow({
      id: "p7",
      place_id: "ChIJpill7",
      business_name: "Maybe Gym",
      member: member({ fit: "look", reason: "Might be a franchise" }),
    }),
  ];
  // A search whose fits differ, which is the only time a row wears its fit at all (leadBand's `mixed`).
  const open = { ...search(), round: { ...search().round, fits: { strong: 5, look: 2, long: 0 } } };
  await fresh({ leads: { searches: [open], rows: dtos } });
  await leadsView({ sort: "fit", dir: "asc" }); // no head to say what a row says
  const rows = L().rows;
  const tree = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  const cls = (n) => String(n?.props?.className || "");
  const tagOf = (id, testid) => byTestId(rowOf(tree, id), testid);

  // One status, in Stage (contracts leadStatusOf): the name wears no tag while the column is drawn.
  assert.equal(tagOf("p1", "lead-state-tag"), null, "the name wears no tag");
  assert.equal(cls(tagOf("p1", "lead-status")), "dim", "Not contacted is the quiet default: a word, and no dot");
  for (const [id, tone, word] of [
    ["p2", "info", "Contacted"],
    ["p3", "ok", "Talking"],
    ["p4", "warn", "Needs review"],
  ]) {
    const pill = tagOf(id, "lead-status");
    assert.equal(cls(pill), `pill pill-${tone}`, `${id}: the shared pill, in the registry's tone`);
    assert.equal(textOf(pill), word, `${id}: one word`);
  }
  assert.match(textOf(tagOf("p2", "lead-stage")), /^Contacted\d+[mhd] ago$/, "and how long ago is the line under it");
  for (const id of ["p5", "p6"])
    assert.equal(cls(tagOf(id, "lead-status")), "pill", `${id}: out is plain, so its pill carries no tone`);

  assert.equal(cls(tagOf("p1", "lead-fit-tag")), "pill pill-ok", "a strong fit is a good outcome, not an urgent one");
  assert.equal(cls(tagOf("p7", "lead-fit-tag")), "pill", "a look is plain");
  assert.equal(textOf(tagOf("p7", "lead-fit-tag")), rows.find((r) => r.id === "p7").fitLabel);

  // Said once: while the Stage column shows a lead's state, the name's tag does not say it again.
  const rowNode = find(
    tree,
    (n) => n.type && (n.type.name === "TableRowView" || (n.type.type && n.type.type.name === "TableRowView")),
  );
  const business = LEAD_COLUMNS.find((c) => c.key === "business");
  const tagIn = (td) => find(td, (n) => n.props?.testid === "lead-state-tag");
  const out = rows.find((r) => r.id === "p5");
  assert.ok(
    tagIn(business.cell(out, { ...rowNode.props.ctx, stageShown: false })),
    "without the column, the name wears it",
  );
  assert.equal(
    tagIn(business.cell(out, { ...rowNode.props.ctx, stageShown: true })),
    null,
    "with the column, only the column says it",
  );
  // The column says every state now (Contacted with how long ago, Needs review, Filtered out with why), so no tag
  // stays beside the name while it is drawn.
  for (const id of ["p2", "p4", "p6"]) {
    const l = rows.find((r) => r.id === id);
    assert.equal(
      tagIn(business.cell(l, { ...rowNode.props.ctx, stageShown: true })),
      null,
      `${id}: said once, by the column`,
    );
  }
  assert.equal(
    tagIn(
      business.cell(
        rows.find((r) => r.id === "p3"),
        { ...rowNode.props.ctx, stageShown: true },
      ),
    ),
    null,
    "Talking is said by the column once",
  );

  // On a phone the row is People's (the phone pass), and its pill is the row's state in the same registry tones. Ready
  // is the silent default there too: "Not contacted" on nearly every row took the names' room (3 Nov 2026).
  await fresh({ leads: { searches: [open], rows: dtos } });
  globalThis.__phone = true;
  const ph = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  globalThis.__phone = false;
  const pillOf = (id) => byTestId(rowOf(ph, id), "lead-state");
  assert.equal(pillOf("p1"), null, "ready wears none");
  assert.deepEqual(
    ["p2", "p3", "p4", "p5", "p6"].map((id) => cls((pillOf(id) || {}).rendered || pillOf(id))),
    ["pill pill-info", "pill pill-ok", "pill pill-warn", "pill", "pill"],
    "contacted, talking, needs review, said no, left out",
  );
  assert.deepEqual(
    ["p4", "p5", "p6"].map((id) => textOf(pillOf(id))),
    [rows[3].stateTag, "Said no", rows[5].stateTag],
    "in the row's own words",
  );

  // And nothing of the private family is left to disagree with it.
  assert.equal(
    find(tree, (n) =>
      cls(n)
        .split(" ")
        .some((c) => c === "ld-state-tag" || c === "ld-fit-tag" || c === "ld-dot"),
    ),
    null,
  );
});

// What opens over the table must be seen whole. Three ways it was not, found on the live page (21 Sep):
//   the name card opened inside the pinned cell, and a pinned cell is sticky, so it is its own stacking context --
//   the next row's pinned cell painted straight over the card (clients.css raises the hovered one);
//   a card on the last row in view hung below the pane's bottom edge and lost 173px of itself;
//   and a search's menu in the rail opened rightward, past the rail's edge, and showed 51px of 194.
// CSS is verified against the real stylesheet over production; what is pinned here is the page's own part of it.
test("a pop hangs above its row when the room is there, every hover asks where it is, and a search's menu opens into the rail", async () => {
  await fresh();
  const tree = draw();
  const place = ldPlacePop;
  assert.equal(typeof place, "function");

  // Every hover on a row asks, on the pointer arriving and on focus arriving alike.
  const row = rowOf(tree, "l1");
  const hovers = [byTestId(row, "lead-slot-phone"), byTestId(row, "lead-slot-mailbox"), byTestId(row, "lead-found")];
  for (const h of hovers) {
    assert.ok(h, "each hover is drawn");
    assert.match(String(h.props.className), /\bld-hover\b/);
    assert.equal(h.props.onMouseEnter, place, `${h.props["data-testid"] || h.props.className}: asks on the pointer`);
    assert.equal(h.props.onFocus, place, "and on focus, so a keyboard gets the same placement");
  }
  // A card's trigger (the name, the rating) is a LeadHover, which asks as a card does, though its card is drawn only
  // once it is reached (cells/hover.tsx).
  const cardHovers = [
    find(row, (n) => n.type === LeadHover && /\bcl-row-name-block\b/.test(String(n.props?.className || ""))),
    find(row, (n) => n.type === LeadHover && n.props?.["data-testid"] === "lead-rated"),
  ];
  for (const h of cardHovers) {
    assert.ok(h, "each card's trigger is a LeadHover");
    assert.match(String(h.props.className), /\bld-hover\b/);
  }

  // The arithmetic, on elements that answer the questions a browser's would. The pane runs 100..700 with a 39px
  // header stuck to its top; a card needs 250px below its row and a tip 56.
  const el = ({ top, bottom, card }) => {
    const classes = new Set();
    const pane = {
      getBoundingClientRect: () => ({ top: 100, bottom: 700 }),
      classList: { contains: (c) => c === "pl-table-scroll" },
      querySelector: (s) => (s === "thead" ? { offsetHeight: 39 } : null),
    };
    return {
      getBoundingClientRect: () => ({ top, bottom }),
      closest: (s) => (s === ".pl-table-scroll" ? pane : null),
      querySelector: (s) => (card && s === ":scope > .ld-card" ? {} : null),
      classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), has: (c) => classes.has(c) },
    };
  };
  const up = (spec) => {
    const target = el(spec);
    place({ currentTarget: target });
    return target.classList.has("ld-up");
  };
  assert.equal(up({ top: 150, bottom: 212, card: true }), false, "a card near the top has its room below");
  {
    // 100px below and 421 above: a tip's room, not a card's. The name's trigger asks as a card, its card not yet drawn.
    const target = el({ top: 560, bottom: 600, card: false });
    cardHovers[0].rendered.props.onMouseEnter({ currentTarget: target });
    assert.ok(target.classList.has("ld-up"), "a card's trigger places a card's height before its card is drawn");
  }
  assert.equal(
    up({ top: 600, bottom: 662, card: true }),
    true,
    "a card on the last row in view hangs above it instead of being cut off",
  );
  assert.equal(up({ top: 520, bottom: 582, card: true }), true, "118px below is not room for a card");
  assert.equal(up({ top: 520, bottom: 582, card: false }), false, "but it is room for a tip");
  assert.equal(
    up({ top: 140, bottom: 202, card: true }),
    false,
    "a row right under the header keeps its card below, where the room is",
  );
  // A pop outside any pane, or an element that cannot be measured, is left where it hangs.
  const loose = {
    getBoundingClientRect: () => ({ top: 0, bottom: 10 }),
    closest: () => null,
    querySelector: () => null,
    classList: {
      toggle: () => {
        throw new Error("no pane, no change");
      },
    },
  };
  place({ currentTarget: loose });
  place({ currentTarget: {} });
  place(null);

  // A search's menu escapes the rail it lives in: held inside the rail it was 196px and broke its words onto three to six
  // lines. It is the kit's Menu (Base UI's), drawn on the body and placed against the window, which the rail's edge cannot
  // cut off or squeeze; it opens rightward, over the table.
  const menu = menus.find((m) => /^More for .+$/.test(m.title || ""));
  assert.ok(menu, "a kept search has its menu");
  assert.ok(menu.trigger, "the kit's Menu, opened by its control, drawn on the body");
  assert.equal(menu.align, "start", "hung from its trigger's start, so it opens over the table");
});
