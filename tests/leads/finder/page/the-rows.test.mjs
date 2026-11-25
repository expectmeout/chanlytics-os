/**
 * The finder's page as the shell asks it, and its rows: each lead says what was found and checked, in the
 * queue's order, every row's press its own.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { until } from "../../../shared/_until.mjs";
import { LEAD_WORDS, leadsRoute } from "@chanlytics/contracts";
import { lineBox } from "../../../shared/_line.mjs";
import {
  FIRST_DAY,
  Icon,
  L,
  LeadHover,
  LeadImportSheet,
  LeadsPhoneBar,
  LeadsRailRows,
  MARK_KEPT,
  PAGE_TWO,
  PLAN,
  ROWS,
  ROW_DTOS,
  RecordSheet,
  SEARCH_A,
  SEARCH_B,
  SUGGESTIONS,
  all,
  asks,
  byTestId,
  click,
  draw,
  drawsAStrip,
  drawsFrom,
  find,
  flashSaid,
  flashes,
  flipColumn,
  forgetLeadsViews,
  frames,
  fresh,
  headingCells,
  headings,
  holdViewSaves,
  lastWrite,
  listeners,
  menus,
  names,
  navigated,
  offering,
  openSheet,
  opened,
  pageReads,
  panels,
  peeks,
  peopleWith,
  publishPeople,
  quiesce,
  reads,
  rowOf,
  searchBox,
  seen,
  setHoldViewSaves,
  settle,
  sortByHeading,
  standingSaid,
  submitField,
  surfaceValue,
  takeFiles,
  textOf,
  viewSaves,
  went,
  wordsRead,
  writes,
  wrote,
} from "./_page.mjs";

test("Leads draws every row of a list on its first draw where its box cannot be watched", async () => {
  // The window of a long list's rows (kit/rows/shown-rows.ts) is drawn only where the browser can watch the list's box;
  // the table's own staged window (24 rows, then the rest) went with it (the strips review, 18 Oct 2026).
  const rows = Array.from({ length: 40 }, (_, i) => ({ ...ROW_DTOS[0], id: `many-${i}`, place_id: `ChIJmany${i}` }));
  await fresh({ leads: { rows } });
  const rowsOf = (tree) => all(tree, (n) => n.type === "tr" && /^lead-many-/.test(String(n.props?.id || ""))).length;
  assert.equal(rowsOf(draw()), 40, "every row on the first draw");
});

test("Leads' rows swap in with the kit's rise as a view's rows land, as People's and the Inbox's lists do", async () => {
  // A rail pick came in at once while People's lists rose (5 Oct 2026): the page hands its table the swap's ref
  // (kit/motion/use-swap-motion.ts, keyed on the view the surface's rows are of).
  const { DataTable } = await import("../../../../apps/dashboard/src/surfaces/kit/table/data-table.tsx");
  await fresh();
  const table = find(draw(), (n) => n.type === DataTable);
  assert.ok(table, "the Leads scope draws the kit's table");
  assert.ok(table.props.swapRef && "current" in table.props.swapRef, "and hands it the swap's ref");
});

test("the Leads scope draws the rows the surface read, in the order it read them, each email's state a word beside a shape", async () => {
  await fresh();
  const tree = draw();
  assert.deepEqual(
    names(tree),
    ["Zilker Strength Lab", "Barton Creek Coaching", "Lamar Strength Co.", "GigaFit Austin", "Pflugerville Training"],
    "the surface's order; the page never re-sorts what it was given",
  );
  assert.deepEqual(
    headings(tree),
    ["Business", "Stage", "Reach", "Rated", "Found", "Actions"],
    "who, where they stand (on since 5 Nov 2026), how to reach them, how they are rated and when found, then the row's acts (a heading read aloud as Actions, drawn with no words); Fit, Why it fits, Stage, Distance, Source, Website and Search are the Columns menu's, and not drawn",
  );
  // A heading that sorts is a button wearing a quiet idle caret (↕) until it is the order; Reach and the acts do not sort.
  assert.deepEqual(
    headingCells(tree).map((th) => [th.props["data-key"], textOf(th)]),
    [
      [undefined, ""],
      ["business", "Business↕"],
      ["stage", "Stage▲"],
      ["reach", "Reach"],
      ["rating", "Rated↕"],
      ["found", "Found↕"],
      ["actions", "Actions"],
    ],
    "every heading is keyed by its column; the ones that sort say so with their caret",
  );
  assert.deepEqual(
    all(tree, (n) => n.props?.className === "dtable-sort").map(textOf),
    ["Business↕", "Stage▲", "Rated↕", "Found↕"],
    "the headings that sort are buttons",
  );
  // D5: both contacts as two slots, phone then mailbox: the shape carries the state, the control's name carries the
  // word and the value, and the sentence behind the shape is a tip in the DOM the control names.
  const slot = (id, kind) => byTestId(rowOf(tree, id), `lead-slot-${kind}`);
  const labelOf = (n) => (find(n, (x) => x.props && x.props["aria-label"]) || { props: {} }).props["aria-label"];
  const tipOf = (n) => textOf(find(n, (x) => x.props?.role === "tooltip"));
  assert.match(labelOf(slot("l1", "mailbox")), /^Email: Checked, hello@/);
  assert.match(
    labelOf(slot("l2", "mailbox")),
    /^Email: Unconfirmed, /,
    "a catch-all server accepts anything, so the check cannot tell (S12)",
  );
  assert.match(labelOf(slot("l3", "mailbox")), /^Email: Unconfirmed, /);
  assert.match(
    tipOf(slot("l3", "mailbox")),
    /email provider wouldn't answer/,
    "the same shape as a catch-all, its own sentence in the tip",
  );
  assert.ok(
    find(slot("l2", "mailbox"), (n) => /\bld-slot-shape\b/.test(String(n.props?.className || ""))),
    "the state is a shape as well as a word, never colour alone",
  );
  assert.match(
    textOf(byTestId(rowOf(tree, "l4"), "lead-reach")),
    /Not checked/,
    "a left-out place's contacts were never checked, and the row says so",
  );
  assert.match(
    labelOf(slot("l1", "phone")),
    /^Phone: Checked, \(\d{3}\) \d{3}-\d{4}/,
    "Maps and their website agree on the number: Checked, and it is said as a person reads it",
  );
  assert.equal(
    textOf(byTestId(rowOf(tree, "l4"), "lead-stage")),
    "Filtered outChain",
    "Stage says where a lead stands, once: a left-out one, with the criterion that left it out on the line under it",
  );
  // The page asks the band once, at mount, and listens: a phone is a page opened on one.
  await fresh();
  globalThis.__phone = true;
  assert.equal(
    byTestId(rowOf(draw(), "l4"), "lead-stage"),
    null,
    "a phone draws one cell a lead, People's row (the phone pass): no column of the desktop's",
  );
  globalThis.__phone = false;
  assert.equal(
    textOf(find(tree, (n) => n.props?.className === "dtable-foot")).startsWith("322 leads"),
    true,
    "the table calls its rows leads",
  );
  assert.notEqual(
    textOf(byTestId(rowOf(tree, "l4"), "lead-sub")),
    "Chain",
    "said once: the criterion is Stage's line, and the name's line says where the business is",
  );
  assert.ok(byTestId(rowOf(tree, "l1"), "lead-photo"), "the tile is a button that expands the photo");
  // D6: the business own mark sits over the listing photo, so a mark that fails to load uncovers what is under it.
  const tile = byTestId(rowOf(tree, "l1"), "lead-photo");
  assert.deepEqual(
    all(tile, (n) => n.type === "img").map((n) => [n.props.className, n.props.src]),
    [["lg", MARK_KEPT]],
    "the mark, over the tint of its kind",
  );
  assert.equal(
    all(byTestId(rowOf(tree, "l2"), "lead-photo"), (n) => n.type === "img").length,
    0,
    "a lead with neither wears its initials, never a broken frame",
  );
  // The name's card is drawn once a pointer, focus or a finger first reaches the name (cells/hover.tsx LeadHover, its
  // own test below): on every row it was most of a row's DOM, and a second Call menu.
  assert.equal(byTestId(rowOf(tree, "l1"), "lead-card-name"), null, "not drawn before anyone reaches it");
});

test("the desk's map and Export stand beside Columns as two quiet words, each doing its own act, and no button stands between a row and what it holds", async () => {
  await fresh();
  let tree = draw();
  const acts = (t) => find(seen(t), (n) => n.props?.className === "pl-file-acts");
  const ids = ["leads-map-toggle", "leads-export"];
  const word = (id) => textOf(byTestId(acts(tree), id));
  assert.ok(acts(tree), "the file acts stand in the controls row");
  assert.equal(byTestId(tree, "leads-file-menu"), null, "no ⋯ menu folds them away");
  assert.equal(
    menus.some((m) => m.testid === "leads-file-menu"),
    false,
    "and none is drawn for the kit's menu to open",
  );
  assert.deepEqual(ids.map(word), ["Map", "Export"]);
  assert.deepEqual(
    ids.map((id) => byTestId(acts(tree), id).props["data-tip"]),
    ["See these leads on the ground", "Download these leads as a CSV file"],
    "what each does is said under a pointer, where the old menu's items said it in a title",
  );
  // Map: the map stands where the table stood, and the button says Table to go back.
  click(byTestId(acts(tree), "leads-map-toggle"));
  tree = draw();
  assert.ok(byTestId(tree, "lead-map"), "Map opens the map");
  assert.equal(word("leads-map-toggle"), "Table", "and offers the way back");
  click(byTestId(acts(tree), "leads-map-toggle"));
  tree = draw();
  assert.equal(byTestId(tree, "lead-map"), null, "Table puts the rows back");
  assert.equal(word("leads-map-toggle"), "Map");
  // REGRESSION (5 Nov 2026): a Values button wrote the numbers and addresses into the rows, in a column they then ran
  // out of, over the rating. A row's Reach says them itself: the number as a person reads it, over the address.
  assert.equal(byTestId(tree, "leads-values-toggle"), null, "no Values button");
  const reach = byTestId(rowOf(tree, "l1"), "lead-reach");
  const lines = all(reach, (n) => /^dtable-line-(top|sub)$/.test(String(n.props?.className || "")));
  assert.equal(lines.length, 2, "two lines, each cut in its own column");
  const said = lines.map((line) => textOf(find(line, (n) => /\bld-reach-words\b/.test(String(n.props?.className)))));
  assert.match(said[0], /^\(\d{3}\) \d{3}-\d{4}$/, "the number");
  assert.match(said[1], /^hello@/, "over the address");
  // Export: a press that POSTs this view (it marks what it took, so it is no link) and saves the file the answer holds, by the
  // kit's one download: on the phone app the same event reaches the share sheet. The page stays where it is.
  const saved = takeFiles();
  try {
    assert.deepEqual(wrote(), [], "nothing is exported by itself");
    const flashed = flashes.length;
    click(byTestId(acts(tree), "leads-export"));
    await flashSaid(flashed);
    assert.deepEqual(
      lastWrite(),
      { key: "POST /api/v1/leads/export", body: { list: "all", sort: "stage", dir: "asc" } },
      "the whole view, in the order the table has by default",
    );
    assert.deepEqual(
      saved.map((f) => [f.name, f.type, f.text.startsWith("﻿Business,City")]),
      [["leads-Salon-20260908.csv", "text/csv", true]],
      "the file the answer holds, saved once, with the byte-order mark the kit adds",
    );
    assert.equal(textOf(flashes.at(-1).msg), "Exported 161 leads.");
    assert.deepEqual(navigated, [], "and the browser was sent nowhere");
  } finally {
    saved.stop();
  }
});

test("Export, for a role that may not take the file, stays on the page, says why at the button and downloads nothing", async () => {
  await fresh({ role: "operator" });
  const tree = draw();
  const exportIt = byTestId(seen(tree), "leads-export");
  assert.ok(exportIt, "the button stays");
  assert.deepEqual(
    [exportIt.props["aria-disabled"], exportIt.props["data-gated"]],
    [true, ""],
    "gated, and still in the tab order",
  );
  assert.match(String(exportIt.props["aria-description"]), /export these leads/);
  assert.equal(exportIt.props["data-tip"], exportIt.props["aria-description"], "the reason is the tip under a pointer");
  click(exportIt);
  assert.deepEqual(wrote(), [], "a press exports nothing");
  assert.deepEqual(navigated, [], "and sends the browser nowhere");
  // The map is not the file: a role that may not export may still look.
  assert.equal(byTestId(seen(tree), "leads-map-toggle").props["data-gated"], undefined);
});

test("a press on a gated Export shows the reason at the button, as every gate does (a finger has no hover)", async () => {
  await fresh({ role: "operator" });
  const shown = [];
  const keep = globalThis.window.__tip;
  globalThis.window.__tip = { show: (el) => shown.push(el) };
  try {
    const exportIt = byTestId(seen(draw()), "leads-export");
    const pressed = { stopPropagation() {}, preventDefault() {}, currentTarget: { name: "the Export button" } };
    exportIt.props.onClick(pressed);
    assert.deepEqual(shown, [pressed.currentTarget], "the tip is shown at the button that was pressed");
  } finally {
    globalThis.window.__tip = keep;
  }
});

test("a hover's card is drawn once a pointer, focus or a finger first reaches its trigger, and kept from then on", () => {
  frames.reset();
  const card = globalThis.React.createElement("div", { "data-testid": "the-card" });
  const drawHover = () => {
    frames.begin();
    return globalThis.React.createElement(LeadHover, { as: "div", className: "ld-hover", card }, "Sam's Gym");
  };
  const firstDiv = (node) => find(node, (n) => n.type === "div" && n.props?.className === "ld-hover");
  let node = drawHover();
  assert.equal(byTestId(node, "the-card"), null, "not before anyone reaches it");
  assert.equal(textOf(node), "Sam's Gym", "the trigger's own words are there");
  for (const reach of ["onMouseEnter", "onFocus", "onTouchStart"])
    assert.equal(typeof firstDiv(node).props[reach], "function", reach);
  firstDiv(node).props.onFocus({ currentTarget: {} });
  node = drawHover();
  assert.ok(byTestId(node, "the-card"), "focus reached it: drawn");
  node = drawHover();
  assert.ok(byTestId(node, "the-card"), "and kept");
});

test("with no search kept and no lead held the first day stands alone: the question, the door, the ideas, and nothing that acts on a list", async () => {
  await fresh({ leads: { ...FIRST_DAY, suggestions: SUGGESTIONS } });
  const tree = draw();
  const fd = byTestId(tree, "leads-first-day");
  assert.ok(fd, "the first day is drawn");
  assert.equal(
    find(tree, (n) => n.type === "table"),
    null,
    "and the table is not: there is nothing to put in it",
  );
  assert.equal(textOf(find(fd, (n) => n.type === "h1")), LEAD_WORDS.firstDay.title, "the page is its question");

  // Nothing stands round it that acts on a list: no rail (its lists and searches are all empty), no search box, and no
  // act in the head beside the page's own door. The head keeps People's name and says no "0 leads · 0 not contacted · 0 searches".
  assert.equal(
    find(tree, (n) => n.type === LeadsRailRows),
    null,
    "no rail",
  );
  assert.equal(searchBox(tree), null, "no search over no leads");
  // No columns to choose and no file to take. The controls row (Columns, then the map, Values / Signals and Export as words
  // beside it) is drawn with the table and with it alone: the three buttons are always there on a day a table stands (the
  // desk's controls test below), so their being absent here is the first day's, not the buttons'.
  assert.deepEqual(
    ["leads-map-toggle", "leads-export"].map((id) => byTestId(tree, id)),
    [null, null],
    "no map and no Export over no leads",
  );
  assert.equal(
    menus.some((m) => m.title === "Columns"),
    false,
    "and no Columns to choose",
  );
  const said = standingSaid();
  assert.deepEqual(
    [said?.title, said?.sentence, said?.act],
    ["Leads", undefined, undefined],
    "the head says the name alone",
  );
  const scope = find(tree, (n) =>
    String(n.props?.className || "")
      .split(/\s+/)
      .includes("leads-scope"),
  );
  assert.ok(String(scope.props.className).split(/\s+/).includes("no-rail"), "and the page takes the rail's column");
  assert.equal(scope.props["data-first-day"], "", "named for the stylesheet, which draws no pane round it");

  const idea = byTestId(fd, "ld-sug-gym");
  assert.ok(idea, "the idea Claude wrote for this workspace is offered");
  assert.equal(textOf(idea), "gyms in Denver", "by its name alone");
  assert.equal(idea.props["data-tip"], "owners who refer clients out", "who it is for is said under a pointer");
  assert.doesNotMatch(
    textOf(fd),
    /About 6 in 10 have an email/,
    "how reachable its kind is stays Ask's to say, in the plan it writes",
  );
  assert.match(
    textOf(byTestId(fd, "ld-line")),
    /a personal training studio in Denver/,
    "and what they were written from",
  );
  assert.ok(byTestId(fd, "ld-line-edit"), "with the one control that renews them");
  assert.equal(byTestId(fd, "ld-first-day-foot"), null, "no line under them about what the finder does not do");
  assert.equal(
    all(fd, (n) => /^ld-way-/.test(String(n.props?.["data-testid"] || ""))).length,
    0,
    "the ways people arrive are People's subject: they stood over the finder here, and buried it",
  );
});

test("leads held with no search kept are a list to work: the rail and the table stand, never the first day", async () => {
  // A search removed keeps the leads it found. The first day drew over them, with nothing of them in reach.
  await fresh({ leads: { searches: [] } });
  const tree = draw();
  assert.equal(byTestId(tree, "leads-first-day"), null, "not the first day: there are leads to work");
  assert.ok(
    find(tree, (n) => n.type === "table"),
    "the table",
  );
  assert.ok(
    find(tree, (n) => n.type === LeadsRailRows),
    "the rail",
  );
  assert.ok(byTestId(seen(tree), "leads-find"), "and Find leads in the head");
});

test("suggestions the page could not read say so, and both doors are still offered", async () => {
  await fresh({ leads: { ...FIRST_DAY, suggestions: undefined } });
  const fd = byTestId(draw(), "leads-first-day");
  assert.ok(fd, "the first day is still drawn");
  assert.equal(
    textOf(byTestId(fd, "ld-sugs-note")),
    LEAD_WORDS.suggestUnavailable,
    "the space where they go says why it is empty",
  );
  assert.equal(byTestId(fd, "ld-line"), null, "and nothing claims a business line that was never read");
  assert.equal(byTestId(fd, "ld-line-edit"), null, "nor offers to rewrite one");
  assert.ok(
    byTestId(fd, "leads-first-find"),
    "the door is drawn either way: the owner can still describe what they want",
  );
  assert.ok(byTestId(fd, "ld-first-import"), "and so is the door for a list of their own");
});

test("an idea that carries its search opens Ask on its card (Ruben, 23 Oct 2026): its words to the card's door, then Ask on the thread the card waits in, and no panel of the page's own", async () => {
  const withPlan = {
    ...SUGGESTIONS,
    items: [{ ...SUGGESTIONS.items[0], plan: { ...PLAN, count: 50 }, ask: "Find 50 gyms in Denver" }],
  };
  await fresh({ leads: { ...FIRST_DAY, suggestions: withPlan } });
  const before = asks.length;
  click(byTestId(byTestId(draw(), "leads-first-day"), "ld-sug-gym"));
  await until(() => asks.length > before, "Ask opened on the card's conversation");
  assert.deepEqual(
    writes.filter((w) => w.key === "POST /api/v1/ask/idea"),
    [{ key: "POST /api/v1/ask/idea", body: { words: "gyms in Denver" } }],
    "the idea named by its words, never its plan: the server reads its own",
  );
  assert.deepEqual(asks.slice(before), [{ thread: "t-idea" }], "Ask opens on the card's conversation");
  assert.equal(panels.length, 0, "the page draws no card of its own");
  assert.equal(
    writes.some((w) => w.key === "POST /api/v1/lead-searches"),
    false,
    "nothing is searched until the card's Find",
  );
});

test("the first day's field is typed in and sent to Ask; an idea with no plan is asked of Ask at once", async () => {
  await fresh({ leads: { ...FIRST_DAY, suggestions: SUGGESTIONS } });
  const fd = byTestId(draw(), "leads-first-day");
  // The field is Ask's (spec F1): the page draws no composer of its own on the first day, and sends what is typed.
  assert.equal(panels.length, 0, "no composer is drawn: Ask is the finder");
  const field = byTestId(fd, "leads-first-find");
  assert.equal(field.type, "form", "a field typed in (Ruben, 22 Oct 2026: it was a door that only opened Ask)");
  const box = byTestId(field, "leads-first-words");
  assert.deepEqual([box.type, box.props.placeholder], ["input", LEAD_WORDS.firstDay.ask], "saying what to type");
  assert.ok(
    find(field, (n) => n.type === Icon && n.props?.name === "three"),
    "wearing the three's still mark, Ask's face at rest",
  );
  const sent = submitField(field, "  plumbers in Austin  ");
  assert.deepEqual(
    asks.at(-1),
    { prompt: "plumbers in Austin", fresh: true },
    "sent, Ask opens and asks the words as typed, in a conversation of its own",
  );
  assert.equal(sent.reset(), true, "and the field is emptied");
  const before = asks.length;
  const empty = submitField(field, "   ");
  assert.equal(asks.length, before, "nothing typed sends nothing");
  assert.equal(empty.box.focused, true, "the press puts the cursor in the box instead");
  click(byTestId(fd, "ld-sug-gym"));
  assert.deepEqual(
    asks.at(-1),
    { prompt: "gyms in Denver", fresh: true },
    "an idea kept from before ideas were plans is asked at once, in a conversation of its own (Ruben, 23 Oct 2026)",
  );
  assert.equal(panels.length, 0, "and still no composer");
  // Both are gated as the bar's square was: an operator sees each refuse in the gate's sentence.
  await fresh({ role: "operator", leads: { ...FIRST_DAY, suggestions: SUGGESTIONS } });
  const refused = byTestId(draw(), "leads-first-day");
  assert.equal(byTestId(refused, "leads-first-words").props.readOnly, true, "the box is read, never typed in");
  const beforeRefused = asks.length;
  submitField(byTestId(refused, "leads-first-find"), "plumbers");
  assert.equal(asks.length, beforeRefused, "and nothing is sent from it");
  for (const id of ["leads-first-send", "ld-sug-gym"]) {
    const gated = byTestId(refused, id);
    assert.deepEqual(
      [gated.props["aria-disabled"], gated.props["aria-description"]],
      [true, "Only an owner can find businesses for you."],
      id,
    );
  }
  assert.equal(byTestId(refused, "ld-line-edit"), null, "and no control for a line they may not rewrite");
});

test("the first day keeps a door for a list the owner already has: Import it opens the sheet the rail's door opens", async () => {
  await fresh({ leads: { ...FIRST_DAY, suggestions: SUGGESTIONS } });
  let tree = draw();
  assert.equal(byTestId(tree, "leads-import"), null, "the rail's own door is not drawn: there is no rail");
  assert.equal(
    find(tree, (n) => n.type === LeadImportSheet),
    null,
    "nothing is open yet",
  );
  click(byTestId(tree, "ld-first-import"));
  tree = draw();
  assert.ok(
    find(tree, (n) => n.type === LeadImportSheet),
    "the press opens the import sheet",
  );
});

test("Edit opens the business line in a sheet of its own: Cancel closes it, Save sends the owner's words", async () => {
  const held = await fresh({ leads: { ...FIRST_DAY, suggestions: SUGGESTIONS } });
  const day = () => byTestId(draw(), "leads-first-day");
  // The record kit's sheet, as a list is imported in one: it was a one-line field where the sentence stood.
  const sheet = (fd) => find(fd, (n) => n.type === RecordSheet && n.props.testid === "ld-line-sheet");
  let fd = day();
  assert.equal(sheet(fd), null, "no sheet until it is asked for");
  click(byTestId(fd, "ld-line-edit"));
  fd = day();
  assert.equal(sheet(fd).props.title, LEAD_WORDS.firstDay.lineTitle, "the sheet says what it is for");
  assert.equal(
    byTestId(fd, "ld-line-input").props.value,
    "a personal training studio in Denver",
    "its field opens on the line as it stands",
  );
  assert.equal(byTestId(fd, "ld-line-input").type, "textarea", "with room for a few sentences");
  assert.equal(byTestId(fd, "ld-line-input").props.maxLength, 400, "up to the door's own bound (00473)");
  assert.equal(byTestId(fd, "ld-line-count"), null, "and nothing counted under it (Ruben, 22 Oct 2026)");
  assert.ok(byTestId(fd, "ld-line"), "the sentence stays on the page behind it");
  sheet(fd).props.onClose();
  fd = day();
  assert.equal(sheet(fd), null, "Cancel closes it");

  click(byTestId(fd, "ld-line-edit"));
  byTestId(day(), "ld-line-input").props.onChange({ target: { value: "a yoga studio in Boulder" } });
  held.answer = ({ key }) =>
    key === "PUT /api/v1/lead-suggestions"
      ? { ...SUGGESTIONS, business_line: "a yoga studio in Boulder", by_owner: true, items: [] }
      : undefined;
  sheet(day()).props.onSave();
  await settle();
  assert.deepEqual(
    wrote((w) => w.key === "PUT /api/v1/lead-suggestions"),
    [{ key: "PUT /api/v1/lead-suggestions", body: { business_line: "a yoga studio in Boulder" } }],
    "Save sends the owner's own words, once",
  );
  await until(() => sheet(day()) === null, "the sheet closed on the answer");
  assert.equal(sheet(day()), null, "and the sheet closes on the answer");
});

test("on a phone the first day draws no bar, its ideas are rows with a door's mark, and the head holds Import leads", async () => {
  await fresh({ leads: { ...FIRST_DAY, suggestions: SUGGESTIONS } });
  globalThis.__phone = true;
  let tree = draw();
  const fd = byTestId(tree, "leads-first-day");
  assert.ok(fd, "the first day is drawn");
  assert.equal(
    find(tree, (n) => n.type === LeadsPhoneBar),
    null,
    "no bar: there is no list to pick and nothing to search",
  );
  const idea = byTestId(fd, "ld-sug-gym");
  assert.ok(
    find(idea, (n) => n.type === Icon && n.props?.name === "chevron"),
    "an idea is a row that opens",
  );
  assert.equal(idea.props["data-tip"], undefined, "nothing hovers on a phone");
  assert.equal(
    idea.props["aria-description"],
    "owners who refer clients out",
    "a screen reader still hears who it is for",
  );
  assert.match(
    textOf(byTestId(fd, "ld-line")),
    /a personal training studio in Denver/,
    "the line they were written from stays",
  );
  assert.ok(byTestId(fd, "ld-line-edit"), "with its control");
  // On a phone the line is rewritten in the kit's small job, only as tall as what it holds, never the record sheet
  // that rises the whole height of the screen (Ruben, 7 Oct 2026). It is drawn while shut, so it leaves as it came.
  assert.equal(openSheet(tree, "ld-line-sheet"), null, "the line's sheet is shut");
  click(byTestId(fd, "ld-line-edit"));
  tree = draw();
  const lineSheet = openSheet(tree, "ld-line-sheet");
  assert.ok(lineSheet, "Edit opens it");
  assert.equal(lineSheet.props.shape, "job", "a phone's small job");
  lineSheet.props.onClose();
  tree = draw();
  assert.equal(openSheet(tree, "ld-line-sheet"), null, "and Cancel shuts it");
  // The door for a list the owner already has is the head's act on a phone, on the row of views where People's Add a
  // person and the Pipeline's New proposal stand (Ruben, 7 Oct 2026); the page does not say it a second time.
  const said = standingSaid();
  assert.deepEqual([said?.title, said?.sentence], ["Leads", undefined], "the head says the name and no sentence");
  const act = byTestId(said.act, "leads-import-open");
  assert.ok(act, "and holds Import leads");
  assert.equal(byTestId(fd, "ld-first-import"), null, "so the page's own line for it is a desk's");
  act.props.onClick();
  tree = draw();
  assert.ok(
    find(tree, (n) => n.type === LeadImportSheet),
    "the press opens the import sheet",
  );
});

test("on a phone Leads' act is New search, and Import leads is a word on the row of views", async () => {
  // A phone's head holds the coral act every page has: here New search, the first day's question over the leads
  // (Ruben, 10 Oct 2026). The door that brings a list in stands on the row of views with Select and Sort, in a word.
  await fresh();
  globalThis.__phone = true;
  try {
    let tree = draw();
    const said = standingSaid();
    assert.equal(said?.title, "Leads");
    const act = byTestId(said.act, "leads-new-search-act");
    assert.ok(act, "the head holds New search");
    assert.equal(textOf(act).trim(), "New search");
    assert.equal(byTestId(said.act, "leads-import-open"), null, "Import leads is the row's, not the head's");
    assert.equal(byTestId(said.act, "leads-find"), null, "one act in the head: Find leads is Ask's on a phone");
    const bar = byTestId(tree, "leads-phone-bar");
    const word = byTestId(bar, "leads-phone-import");
    assert.equal(textOf(word).trim(), "Import", "the row's word for the same door");
    assert.equal(
      find(tree, (n) => n.type === LeadImportSheet),
      null,
      "nothing is open yet",
    );
    click(word);
    tree = draw();
    assert.ok(
      find(tree, (n) => n.type === LeadImportSheet),
      "the press opens the import sheet",
    );
  } finally {
    globalThis.__phone = false;
  }
});

test("Needs review is a workbench: the pile in the order to work it, the group's own leads as cards, one press per group, and what each press costs", async () => {
  await fresh();
  let tree = draw({ leadsRoute: `leads:s-${SEARCH_A}:c-review` });
  const bench = byTestId(tree, "lead-bench");
  assert.ok(bench, "Needs review stops being a tab on a table");
  assert.equal(
    find(tree, (n) => n.type === "table"),
    null,
    "the table gives way to the bench: the pile is the work",
  );
  const queue = all(byTestId(bench, "lead-bench-queue"), (n) => n.props?.role === "tab");
  assert.deepEqual(
    queue.map((q) => textOf(q)),
    ["1Their email provider wouldn't answerCheck again · Keep · Exclude"],
    "one row per thing that would resolve a pile, with its count and its acts in words",
  );
  assert.equal(textOf(byTestId(bench, "bench-title")), "Their email provider wouldn't answer1");
  assert.match(
    textOf(byTestId(bench, "bench-why")),
    /^Their email provider didn't answer the check/,
    "and a sentence saying what is true of every lead in it",
  );
  assert.deepEqual(
    all(bench, (n) => n.props?.["data-testid"] === "lead-bench-card").map((c) =>
      textOf(byTestId(c, "bench-card-name")),
    ),
    ["Lamar Strength Co."],
    "the group's own leads, as cards",
  );
  assert.ok(
    byTestId(bench, "bench-act-check_again") &&
      byTestId(bench, "bench-act-keep") &&
      byTestId(bench, "bench-act-exclude"),
    "Check again, Keep and Exclude resolve a mail server that would not answer: each has a door, so nothing on the bench is dead",
  );
  assert.match(
    textOf(byTestId(bench, "bench-cost-keep")),
    /count against this month\. 1 of your 238 left\./,
    "what a press costs is the surface's own month, never a number the page made up",
  );
  assert.match(
    textOf(byTestId(bench, "bench-asked")),
    /With a website/,
    "and what the search asked for, in the owner's own words",
  );
  // Check again draws on the bar with its count and its cost.
  assert.equal(textOf(byTestId(tree, "bench-act-check_again")), "Check again 1");
  assert.match(
    textOf(byTestId(tree, "bench-cost-check_again")),
    /About 1¢. Their answer lands here/,
    "the act, and what it costs, side by side",
  );
  const flashedBefore = flashes.length;
  byTestId(tree, "bench-act-check_again").props.onClick();
  await flashSaid(flashedBefore);
  assert.deepEqual(
    lastWrite(),
    { key: "POST /api/v1/leads/check-again", body: { ids: ["l3"] } },
    "the lead whose check did not answer, to the door that checks it again",
  );
  assert.equal(flashes.at(-1).msg, "Checking 1 again.");

  // A card's own Keep is the row's own door, one lead, as it is on a row.
  tree = draw({ leadsRoute: `leads:s-${SEARCH_A}:c-review` });
  byTestId(
    all(byTestId(tree, "lead-bench"), (n) => n.props?.["data-testid"] === "lead-bench-card")[0],
    "bench-card-keep",
  ).props.onClick({ stopPropagation() {} });
  await settle();
  assert.deepEqual(lastWrite(), { key: "POST /api/v1/leads/l3/keep", body: { search_id: SEARCH_A } });
  tree = draw({ leadsRoute: `leads:s-${SEARCH_A}:c-review` });
  assert.equal(byTestId(tree, "lead-bench"), null, "kept, the lead has left the pile on screen at once");

  // The group's Keep is the bulk door the bar presses.
  await fresh();
  tree = draw({ leadsRoute: `leads:s-${SEARCH_A}:c-review` });
  byTestId(tree, "bench-act-keep").props.onClick();
  await flashSaid(0);
  assert.deepEqual(
    lastWrite(),
    { key: "POST /api/v1/leads/bulk", body: { by: "ids", action: "keep", ids: ["l3"], search_id: SEARCH_A } },
    "the bench's Keep is the same bulk door the bar presses",
  );
  assert.equal(flashes.at(-1).msg, "Done.", "the door's own sentence is the flash");

  await fresh({ leads: { rows: [] } }); // the server answered the review view with nothing
  tree = draw({ leadsRoute: `leads:s-${SEARCH_A}:c-review` });
  assert.equal(byTestId(tree, "lead-bench"), null, "no pile, no bench");
  assert.match(textOf(tree), /Nothing needs a look./, "an empty queue says so");
});

test("the rail counts what the lists hold, a waiting search wears a question mark, and the standing line says who needs you", async () => {
  await fresh();
  const tree = draw();
  const rows = all(byTestId(tree, "leads-lists"), (n) => n.type === "button").map((b) => [
    textOf(find(b, (x) => x.props?.className === "label")),
    textOf(find(b, (x) => x.props?.className === "count")),
  ]);
  assert.deepEqual(rows, [
    ["All leads", "322"],
    ["Not contacted", "272"],
    ["Contacted", "31"],
    ["Talking", "9"],
    ["Said no", "6"],
    ["Not a fit", "4"],
  ]);
  assert.ok(
    byTestId(tree, `leads-search-${SEARCH_A}`) && byTestId(tree, `leads-search-${SEARCH_B}`),
    "both searches are on the rail",
  );
  assert.ok(
    find(byTestId(tree, `leads-search-${SEARCH_B}`), (n) => n.props?.className === "rail-q"),
    "the one waiting on an answer wears a ? in the accent",
  );
  assert.equal(
    find(byTestId(tree, `leads-search-${SEARCH_A}`), (n) => n.props?.className === "rail-q"),
    null,
    "the one that ended does not",
  );
  // How many searches there are is the Lists sheet's to show (Ruben, 12 Nov 2026: "searches" stood twice in one line).
  assert.equal(textOf(byTestId(tree, "leads-standing")), "322 leads·272 not contacted·1 search needs you");
  click(byTestId(tree, "leads-standing-needs"));
  assert.deepEqual(
    went,
    [`clients/leads:s-${SEARCH_B}:c-excluded`],
    "and it is the tap that opens the search waiting on you, on the places its question is about",
  );
});

// The rail picks the way People's does (railToggle, surfaces/people/rail/rail-kit.tsx). On production (21 Sep) a list
// pressed while a search was open kept the search in the address and only narrowed inside it: the rail lit neither
// row, and "All leads" changed nothing, which read as a link that went nowhere. A search picked kept the list, so it
// showed fewer leads than its count said.
test("the Leads rail picks one row at a time, as People's does: a list leaves an open search, a search shows all of itself, and the picked row pressed again goes back to all leads", async () => {
  await fresh();
  const pressed = (route, testid) => {
    went.length = 0;
    click(byTestId(draw({ leadsRoute: route }), testid));
    return went.at(-1);
  };
  assert.equal(
    pressed(`leads:s-${SEARCH_A}`, "leads-list-ready"),
    leadsRoute({ list: "ready" }),
    "a list leaves the search that was open",
  );
  assert.equal(
    pressed(`leads:s-${SEARCH_A}`, "leads-list-all"),
    leadsRoute({}),
    "All leads is all of them, from a search too",
  );
  assert.equal(
    pressed("leads:l-ready", `leads-search-${SEARCH_A}`),
    leadsRoute({ searchId: SEARCH_A }),
    "a search shows all of itself, not its Ready ones",
  );
  assert.equal(
    pressed(`leads:s-${SEARCH_B}:c-review`, `leads-search-${SEARCH_A}`),
    leadsRoute({ searchId: SEARCH_A }),
    "and starts on all of its classes",
  );
  assert.equal(
    pressed(`leads:s-${SEARCH_A}:c-review`, `leads-search-${SEARCH_B}`),
    leadsRoute({ searchId: SEARCH_B, cls: "excluded" }),
    "one waiting on its question starts on the places the question is about",
  );
  assert.equal(
    pressed(`leads:s-${SEARCH_A}`, `leads-search-${SEARCH_A}`),
    leadsRoute({}),
    "the open search pressed again: all leads",
  );
  assert.equal(pressed("leads:l-ready", "leads-list-ready"), leadsRoute({}), "the open list pressed again: all leads");
  // Whatever an old address combines, one row is picked, and a screen reader hears which. (The stub tree reaches a
  // row through its parent's children and its parent's drawing both, so rows are counted once each, by identity.)
  const picked = (route) =>
    [...new Set(all(draw({ leadsRoute: route }), (n) => n.props?.["aria-current"] === "true"))].map(
      (n) => n.props["data-testid"],
    );
  assert.deepEqual(picked(`leads:s-${SEARCH_A}:l-ready`), [`leads-search-${SEARCH_A}`]);
  assert.deepEqual(picked("leads:l-ready"), ["leads-list-ready"]);
  assert.deepEqual(picked("leads"), ["leads-list-all"]);
  // The list that is open is named over the table, as People names its list, with the way back to all leads.
  const head = (route) => byTestId(draw({ leadsRoute: route }), "leads-list-head");
  assert.equal(textOf(byTestId(head("leads"), "leads-list-title")), "All leads");
  assert.equal(byTestId(head("leads"), "leads-show-all"), null, "all of them has nowhere to go back to");
  assert.equal(textOf(byTestId(head("leads:l-ready"), "leads-list-title")), "Not contacted");
  went.length = 0;
  click(byTestId(head("leads:l-ready"), "leads-show-all"));
  assert.equal(went.at(-1), leadsRoute({}), "Show all leads goes back to all of them");
  assert.equal(head(`leads:s-${SEARCH_A}`), null, "a search that is open says itself in the strip instead");
  // A search's row is the kit's row with acts: its pick and its menu side by side, never a button in a button.
  const row = find(
    draw(),
    (n) =>
      n.type === "div" &&
      typeof n.props?.className === "string" &&
      n.props.className.split(" ").includes("ld-search-row"),
  );
  assert.ok(row && row.props.className.split(" ").includes("has-acts"), "the row carries its acts beside its pick");
  assert.equal(
    all(byTestId(row, `leads-search-${SEARCH_A}`), (n) => n.type === "button").length,
    1,
    "the pick holds no other button",
  );
  // A name cut off at the rail's width is read whole on hover, with when it was asked: the shared tip (data-tip).
  assert.equal(
    byTestId(row, `leads-search-${SEARCH_A}`).props["data-tip"],
    "You asked on Sep 18: “personal trainers in Austin with a website, about 200”. Leaving out Chain gyms.",
    "contracts' words for when it was asked and what: the row names the whole ask",
  );
});

test("a rail row under the pointer, or reached by Tab, warms the view its press would open, and the press itself warms nothing more", async () => {
  await fresh();
  const tree = draw();
  const rows = all(
    tree,
    (n) =>
      n.type === "button" &&
      String(n.props?.className || "")
        .split(/\s+/)
        .some((c) => c === "cl-rail-row" || c === "cl-rail-pick"),
  );
  const ready = rows.find((b) => b.props["data-testid"] === "leads-list-ready");
  const searchA = rows.find((b) => b.props["data-testid"] === `leads-search-${SEARCH_A}`);
  assert.ok(ready && searchA, "both kinds of row are drawn");
  // What the page itself reads as it opens is its own; what is warmed is what comes after.
  reads.length = 0;
  ready.props.onPointerEnter();
  searchA.props.onFocus();
  assert.deepEqual(
    pageReads().map((q) => [q.list, q.search ?? null]),
    [
      ["ready", null],
      ["all", SEARCH_A],
    ],
    "each reads the view its press goes to, ahead of the press",
  );
  const warmed = reads.length;
  click(ready);
  assert.deepEqual(went.at(-1), "clients/leads:l-ready", "the press goes there");
  assert.equal(reads.length, warmed, "and asks for no warm of its own");
  // The row that is already open warms the view its press shows: back to all leads. (The tab no longer holds it here, or
  // there would be nothing to read -- a view held is not read ahead again.)
  const tree2 = draw({ leadsRoute: "leads:l-ready" });
  const openRow = all(tree2, (n) => n.type === "button" && n.props?.["data-testid"] === "leads-list-ready")[0];
  await quiesce();
  forgetLeadsViews();
  reads.length = 0;
  openRow.props.onPointerEnter();
  assert.deepEqual(
    pageReads().map((q) => [q.list, q.search ?? null]),
    [["all", null]],
    "the row picked again shows all leads, so that is what is warmed",
  );
});

test("a view on its way says so: the rows on screen are the last view's, dimmed and marked busy, until the surface holds the one the address names", async () => {
  await fresh();
  const scopeOf = (tree) =>
    find(
      tree,
      (n) =>
        n.type === "div" &&
        String(n.props?.className || "")
          .split(" ")
          .includes("leads-scope"),
    );
  const tableOf = (tree) => find(tree, (n) => n.props?.["data-testid"] === "people-table-scroll");
  let tree = draw();
  assert.deepEqual(
    [scopeOf(tree).props["data-loading"], tableOf(tree).props["aria-busy"]],
    [undefined, undefined],
    "the view on screen is the one the address names: nothing is said",
  );
  // The address moved to a search the surface does not hold: its rows are still all leads.
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  tree = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  assert.deepEqual(
    [scopeOf(tree).props["data-loading"], tableOf(tree).props["aria-busy"]],
    ["1", "true"],
    "REGRESSION: the old view's rows sat under the new title for up to a second, looking right and being wrong",
  );
  assert.equal(names(tree).length, 5, "and the rows are still drawn: nothing flashes empty");
  // The surface lands the view: the read the page made for it answers.
  await quiesce();
  assert.deepEqual(
    [L().route, L().view.searchId],
    [`clients/leads:s-${SEARCH_A}`, SEARCH_A],
    "the surface holds the view the address names",
  );
  tree = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  assert.deepEqual([scopeOf(tree).props["data-loading"], tableOf(tree).props["aria-busy"]], [undefined, undefined]);
});

test("a sort is a read too: the rows hold their order and say they are on their way, until the surface holds the view in that order", async () => {
  await fresh();
  const scopeOf = (tree) =>
    find(
      tree,
      (n) =>
        n.type === "div" &&
        String(n.props?.className || "")
          .split(" ")
          .includes("leads-scope"),
    );
  let tree = draw();
  assert.equal(scopeOf(tree).props["data-loading"], undefined);
  sortByHeading(tree, "Rated");
  tree = draw();
  assert.deepEqual(
    [scopeOf(tree).props["data-loading"], names(tree)[0]],
    ["1", "Zilker Strength Lab"],
    "the rows hold their order (a sort is the surface's to read, never the page's to re-order), and say so",
  );
  await quiesce();
  assert.deepEqual([L().view.sort, L().view.dir], ["rating", "desc"], "the surface holds the view in that order");
  tree = draw();
  assert.equal(scopeOf(tree).props["data-loading"], undefined, "landed in that order");
});

test("Show more says it is loading while the next page is on its way, takes no second press, and a Keep meanwhile does not make it say so", async () => {
  const held = await fresh({ leads: { more: PAGE_TWO } });
  let freeKeep;
  let freeMore;
  const keepWaits = new Promise((r) => {
    freeKeep = r;
  });
  const moreWaits = new Promise((r) => {
    freeMore = r;
  });
  held.gate = (sent) => (sent.includes("/keep") ? keepWaits : sent.includes("after_key") ? moreWaits : undefined);
  const more = (tree) => find(tree, (n) => n.type === "button" && n.props?.["data-testid"] === "leads-more-btn");
  const pages = () => pageReads().filter((q) => q.after_key).length;
  let tree = draw();
  assert.deepEqual([textOf(more(tree)).trim(), !!more(tree).props.disabled], ["Show more", false]);
  // A Keep in flight is not the next page.
  find(tree, (n) => n.props?.["data-testid"] === "lead-keep").props.onClick({
    stopPropagation() {},
    preventDefault() {},
  });
  tree = draw();
  assert.equal(wrote().length, 1, "the Keep is out");
  assert.equal(textOf(more(tree)).trim(), "Show more");
  freeKeep();
  await settle();
  tree = draw();
  click(more(tree));
  tree = draw();
  assert.deepEqual(
    [textOf(more(tree)).trim(), !!more(tree).props.disabled],
    ["Loading more…", true],
    "REGRESSION: the button read Show more and stayed live while the page loaded, and read Loading… during an unrelated Keep",
  );
  click(more(tree));
  assert.equal(pages(), 1, "a second press while it loads asks for nothing");
  freeMore();
  await settle();
  assert.equal(L().rows.length, ROW_DTOS.length + PAGE_TWO.length, "the next page joined the rows");
  tree = draw();
  assert.equal(more(tree), null, "and that was the last: the line is gone");
});

test("leads a refresh found but did not sort in are offered on all leads too, in the list's head, with the same words and the same door as the strip's", async () => {
  await offering(null, 12);
  assert.equal(L().offered, 12, "the surface holds them back");
  let tree = draw();
  const pill = byTestId(tree, "leads-offered");
  assert.ok(
    pill,
    "REGRESSION: the count was computed and never shown outside an open search, so new leads never appeared on All leads under a fit sort",
  );
  assert.equal(textOf(pill).trim(), "12 new");
  await quiesce();
  reads.length = 0;
  click(pill);
  assert.deepEqual(
    pageReads().map((q) => [q.list, q.sort, q.dir]),
    [["all", "stage", "asc"]],
    "one press reads the view again in its order, as the strip's does",
  );
  await quiesce();
  assert.deepEqual(
    [L().offered, L().rows.length],
    [0, ROW_DTOS.length + 12],
    "and they are in the rows, in the order it read",
  );
  await offering(null, 0);
  assert.equal(byTestId(draw(), "leads-offered"), null, "nothing offered, nothing said");
  await offering({ searchId: SEARCH_A }, 3);
  assert.equal(L().offered, 3);
  tree = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  assert.equal(byTestId(tree, "leads-offered"), null, "an open search says it in its strip, once");
});

test("the People | Leads switch is the frame's strip of views, not the page's: neither scope draws one, deals on or off", async () => {
  // What the strip holds, which is picked and where a press goes are the chrome's (people/moments/people-views.test.mjs).
  await fresh();
  assert.equal(drawsAStrip(draw()), false, "Leads draws none of its own");
  assert.equal(drawsAStrip(draw({ scope: "people", leadsRoute: null })), false, "nor does the rail's page");
  surfaceValue("people").hasDeals = true;
  assert.equal(drawsAStrip(draw()), false, "and a third tab is the frame's to add, not the page's");
});

test("People and Leads are two components: each keeps its own state, and People listens for nothing of Leads'", async () => {
  // They were one component, every hook of both scopes declared in both in one order: the order the stub kept hooks
  // by. Each is its own now (PeopleReal, LeadsReal, over the same two hooks), and the shell mounts them apart.
  await fresh();
  const peopleBox = () => lineBox();
  const leadsBox = () => lineBox();
  peopleBox(draw({ scope: "people", leadsRoute: null })).props.onChange({ target: { value: "zilker" } });
  assert.equal(peopleBox(draw({ scope: "people", leadsRoute: null })).props.value, "zilker");
  assert.equal(listeners["surface:leads"]?.size ?? 0, 0, "a Leads refresh does not draw People again");
  assert.ok(drawsFrom("people"), "People draws from People's surface");
  assert.ok(!drawsFrom("leads"), "and from People's surface alone: Leads' rows landing draw nothing of it");
  assert.equal(listeners.keydown?.size, 1, "one keyboard listener, People's");
  // Leads drawn over the same cells: its words are its own, and People's are where they were.
  assert.equal(leadsBox(draw()).props.value, "", "REGRESSION: one component, so one box for both scopes");
  assert.equal(peopleBox(draw({ scope: "people", leadsRoute: null })).props.value, "zilker");
  await fresh();
  draw();
  assert.ok(drawsFrom("leads"), 'Leads draws from its own surface (useSurface("leads"))');
  assert.ok(drawsFrom("people"), "and from People's, which carries the workspace's copy of its view");
  assert.equal(listeners.keydown?.size, 1, "one keyboard listener, Leads'");
});

test("the Leads view is saved with its list, sort and columns every time, over the wire as PUT views/leads, one save at a time", async () => {
  await fresh({ views: { leads: { list: "all", sortBy: "fit", sortDir: "asc", columns: { website: true } } } });
  // What the page's saves send (People's saveView, over the bridge's client), each held until the test lands it.
  const held = viewSaves;
  setHoldViewSaves(true);
  let tree = draw();
  assert.ok(headings(tree).includes("Website"), "the member's own columns");
  assert.deepEqual(held, [], "the view it already holds is not saved again");
  flipColumn("source");
  tree = draw();
  assert.equal(held.length, 1);
  assert.deepEqual(
    held[0],
    {
      page: "leads",
      view: { list: "all", sortBy: "fit", sortDir: "asc", columns: { website: true, source: true }, cells: 2 },
      land: held[0].land,
    },
    "every key the page owns, the list included",
  );
  // A second change while the first is out waits for it: two in flight could land out of order.
  sortByHeading(tree, "Rated");
  draw();
  assert.equal(held.length, 1, "one save at a time");
  held[0].land({ ok: true });
  await settle();
  assert.equal(held.length, 2);
  assert.deepEqual(
    held[1].view,
    { list: "all", sortBy: "rating", sortDir: "desc", columns: { website: true, source: true }, cells: 2 },
    "the latest view, whole",
  );
  held[1].land({ ok: true });
  await settle();
  assert.equal(held.length, 2, "and nothing after it");
});

test("REGRESSION: a cold open of Leads still takes the view the workspace remembers -- it rides with People, which lands after Leads, and the page had settled for this device's copy and never looked again", async () => {
  // The last read of a view the wire saw: the sort and the order the page asked for.
  const lastRead = () => pageReads().at(-1);
  await fresh({ people: false });
  const held = viewSaves;
  setHoldViewSaves(true);
  let tree = draw();
  // The view the page asks for is the one the boot read, held since with nothing changed: nothing is read again for it.
  assert.deepEqual(
    [L().view.sort, L().view.dir, pageReads().length, headings(tree).includes("Website")],
    ["stage", "asc", 0, false],
    "nothing to go on yet: the page's own defaults, as the boot read them",
  );
  // People lands, carrying what this member chose on another computer.
  publishPeople(peopleWith({ leads: { list: "all", sortBy: "rating", sortDir: "desc", columns: { website: true } } }));
  draw();
  tree = draw();
  assert.deepEqual([lastRead().sort, lastRead().dir], ["rating", "desc"], "the sort they chose is the one read");
  assert.ok(headings(tree).includes("Website"), "and their columns are the ones drawn");
  assert.deepEqual(held, [], "taking the workspace's view is not a change to save back to it");
  // Once they have chosen here, a copy that arrives late does not take the choice back.
  await fresh({ people: false });
  tree = draw();
  sortByHeading(tree, "Found");
  draw();
  publishPeople(peopleWith({ leads: { list: "all", sortBy: "rating", sortDir: "desc", columns: {} } }));
  draw();
  draw();
  assert.equal(lastRead().sort, "found", "what the owner just pressed stands");
});

test("a sort is the surface's to read, not the page's to re-order: the rows hold their order until the read lands", async () => {
  await fresh();
  let tree = draw();
  assert.deepEqual(
    pageReads().length,
    0,
    "nothing read for the view the address names: the boot read it, and nothing has changed since",
  );
  sortByHeading(tree, "Rated");
  tree = draw();
  const views = pageReads();
  assert.equal(views.length, 1, "the new sort is one read, keyed by the whole view");
  assert.deepEqual([views[0].sort, views[0].dir, views[0].list], ["rating", "desc", "all"]);
  assert.deepEqual(
    names(tree),
    ["Zilker Strength Lab", "Barton Creek Coaching", "Lamar Strength Co.", "GigaFit Austin", "Pflugerville Training"],
    "and nothing moved under the owner while it was out",
  );
});

test("REGRESSION: Call asks how, instead of ringing a business the moment a thumb lands on a row -- and the receptionist is not one of the ways, because it never rings a customer", async () => {
  await fresh();
  menus.length = 0;
  draw();
  const ways = menus.find((m) => m.title === `Call ${ROWS[0].name}` && m.testid === "lead-call");
  assert.ok(ways, "REGRESSION: it dialled on press; it opens the ways of calling now");
  assert.equal(ways.testid, "lead-call", "and its button is Call, where it was");
  assert.equal(ways.icon, "phone", "and still looks like calling -- a ⋯ would hide what the button is for");

  const W = LEAD_WORDS.callWays;
  assert.deepEqual(
    ways.items.map((i) => i.header ?? i.label),
    [ways.items[0].header, W.dial.label, W.copy.label, W.log.label],
    "the number you would dial, then the three ways -- the words are contracts'",
  );
  assert.match(String(ways.items[0].header), /512/, "the heading is the number itself");

  // The receptionist answers the line and never rings a customer (business-tab.ts CANNOT_ROWS, "outbound_call"),
  // which the Business page tells the owner in those words. No way here may promise otherwise.
  const said = ways.items.map((i) => `${i.label ?? ""} ${i.meta ?? ""} ${i.header ?? ""}`).join(" ");
  assert.equal(
    /receptionist|assistant|agent|for me|on my behalf|auto/i.test(said),
    false,
    "REGRESSION: a way that promises what the product says two pages away it cannot do",
  );

  // Nothing rang by drawing the menu, and each way does its own thing.
  assert.equal(globalThis.window.location.href, "", "drawing the ways dials nobody");
  const way = (label) => ways.items.find((i) => i.label === label);
  way(W.dial.label).onClick();
  draw();
  assert.match(globalThis.window.location.href, /^tel:/, "Call from your phone dials");
  assert.equal(peeks.at(-1).vm.id, "l1", "and opens the lead, where the six outcomes are asked");

  // A call made from a desk phone: the same sheet, nothing rung. There was no way to record one at all.
  await fresh();
  menus.length = 0;
  draw();
  const again = menus.find((m) => m.title === `Call ${ROWS[0].name}` && m.testid === "lead-call");
  again.items.find((i) => i.label === W.log.label).onClick();
  draw();
  assert.equal(globalThis.window.location.href, "", "REGRESSION: logging a call you already made rang them again");
  assert.equal(peeks.at(-1).vm.id, "l1", "it opens the lead on the same question");
});

test("a click on a lead's row peeks it, as Enter does", async () => {
  await fresh();
  const tree = draw();
  find(tree, (n) => n.type === "tr" && n.props?.id === "lead-l3").props.onClick();
  draw();
  assert.equal(peeks.at(-1).vm.id, "l3", "the row is the peek's way in; the name inside it is the other");
  assert.deepEqual(opened, [], "and a lead is never a profile");
});

test("the search box's words are read, once typing stops, by name, kind and area, over the whole view", async () => {
  await fresh();
  draw();
  const box = lineBox();
  const asked = () =>
    reads.filter((r) => r.startsWith("/api/v1/leads?")).map((r) => new URLSearchParams(r.split("?")[1]).get("q"));
  const before = asked().length;
  // Typed letter by letter: the read waits for quiet, and asks once (decision 0083, Phase B).
  for (const typed of ["l", "la", "lamar"]) {
    box.props.onChange({ target: { value: typed } });
    draw();
  }
  await wordsRead("lamar");
  const tree = draw();
  assert.deepEqual(names(tree), ["Lamar Strength Co."]);
  assert.deepEqual(asked().slice(before), ["lamar"], "one read, for the words typing stopped on");
  box.props.onChange({ target: { value: "78704" } });
  draw();
  await wordsRead("78704");
  assert.deepEqual(names(draw()).length, 5, "the area they are all in");
  box.props.onChange({ target: { value: "gigafit" } });
  draw();
  await wordsRead("gigafit");
  assert.deepEqual(names(draw()), ["GigaFit Austin"]);
  assert.equal(writes.length, 0, "a read, never a write");
  box.props.onChange({ target: { value: "" } });
  draw();
  await wordsRead("");
});
