/**
 * The Pipeline's rail, People's keys, one clock with the rows, the address and its peek, a phone's bar, Mark as
 * passed, and the deal sheet beside the rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { until } from "../../shared/_until.mjs";
import {
  proposalMessage,
  DEAL_ACT_WORDS,
  DEAL_LOST_REASON_WORDS,
  PIPELINE_WORDS,
  pipelineOf,
  repliesWords,
  toPersonRowVM,
} from "@chanlytics/contracts";
import {
  PIPELINE_BOARD_CAP,
  PIPELINE_PASS_MAX,
  PIPELINE_SORTS,
  pipelineBoardMore,
  pipelineMove,
  pipelinePassDone,
  pipelinePassMany,
  pipelineSorted,
} from "../../../apps/dashboard/src/surfaces/people/pipeline/board-view.ts";
import { pipelinePeekOf, pipelineSheetOf } from "../../../apps/dashboard/src/surfaces/people/pipeline/peek-view.ts";
import { EVERY_EVENT, changesOf, toldFor } from "../../_live-feed.mjs";
import { lineBox } from "../../shared/_line.mjs";
import {
  DAY,
  Menu,
  NOW,
  PipelineRailRows,
  Sheet,
  TID,
  TZ,
  ZONE,
  all,
  backs,
  byClass,
  byKey,
  byTestId,
  click,
  deal,
  detailOf,
  draw,
  drawsAStrip,
  find,
  fixture,
  fresh,
  heads,
  lineParts,
  listOf,
  newOpen,
  ny,
  onPhone,
  opened,
  peekOf,
  peopleOverride,
  personDetail,
  personRow,
  plLoadedWords,
  press,
  replaced,
  rowIds,
  rowOf,
  setSurfaceValue,
  settled,
  standingSaid,
  surfaceValue,
  textOf,
  tick,
  visit,
  visits,
  went,
  withHead,
} from "./_pipeline.mjs";
import { bridgeHolds, provided } from "../../shell/_bridge-holds.mjs";

test("the Pipeline has its own rail under People's switch (the frame's strip), the line, and the table in sections -- every word contracts'", async () => {
  await fresh();
  const tree = draw();
  assert.ok(byTestId(tree, "pipeline"), "the Pipeline, not People");
  assert.equal(
    drawsAStrip(tree),
    false,
    "the switch is the frame's strip over the page (people/moments/people-views.test.mjs)",
  );
  const vm = pipelineOf(surfaceValue("people").rows, Date.now(), ZONE, null);
  assert.deepEqual(lineParts(tree), vm.summary);
  assert.deepEqual(vm.summary, ["2 proposals out", "2 waiting over a week", "1 client"]);
  // The part that counts what waits on the owner is a press; the other counts are words.
  const waiting = byTestId(tree, "pipeline-line-waiting");
  assert.deepEqual([waiting.type, waiting.props["aria-pressed"]], ["button", false]);
  // The rail is the Pipeline's own: its groups, what waits, its services. People's lists stay on People.
  const rail = byTestId(tree, "pipeline-rail");
  assert.deepEqual(
    // Each row once: the kit's section draws its children, and the walk meets them there and in the section's props.
    [
      ...new Set(
        all(rail, (n) => /^pipeline-rail-row-/.test(n.props?.["data-testid"] || "")).map((n) =>
          n.props["data-testid"].slice(18),
        ),
      ),
    ],
    ["all", "consultations", "proposals", "clients", "closed", "waiting", "svc:Color correction"],
  );
  assert.equal(
    byTestId(rail, "pipeline-rail-row-all").props["aria-current"],
    "true",
    "All deals, until another is picked",
  );
  assert.equal(
    find(tree, (n) => typeof n.props?.onPickSaved === "function"),
    null,
    "no People's rail here",
  );
  assert.deepEqual(heads(tree), [
    { label: "Consultations", count: "2", meta: "1 ended in the last week, nothing since", toggle: null },
    { label: "Proposal out", count: "2", meta: null, toggle: null },
    { label: "Clients", count: "1", meta: null, toggle: null },
    { label: "Passed or ended", count: "2", meta: null, toggle: "Show" },
  ]);
  // The rows under the heads, in the Pipeline's order; Passed or ended folded; Nobody, with nothing to follow, absent.
  assert.deepEqual(rowIds(tree), ["hana", "sara", "wes", "nia", "cat"]);
  // A head is a row of its own across every column, with no id: the cursor and select-all go by rows' ids.
  const head = find(tree, (n) => n.type === "tr" && String(n.props?.className || "").includes("dtable-group"));
  assert.equal(head.props.id, undefined);
  const th = find(head, (n) => n.type === "th");
  assert.deepEqual([th.props.scope, th.props.colSpan], ["rowgroup", 6]);
  // The headings are contracts', after the selection's box, People's person cell first, the service under the name (canvas
  // D1); where it stands is the order it opens in. Came from and Valid until are the member's to show (Columns).
  assert.deepEqual(
    all(
      find(tree, (n) => n.type === "thead"),
      (n) => n.type === "th",
    ).map((n) => textOf(n)),
    // A heading that sorts wears an arrow at its end: the sort's own (▲) once it is the order, else a quiet idle caret (↕) so
    // the ones that sort can be told from More, which does not (a span, no caret).
    ["", "Person↕", "Value↕", "Where it stands▲", "Next step↕", "More"],
  );
  assert.deepEqual(
    all(tree, (n) => n.props?.className === "dtable-sort").map(textOf),
    ["Person↕", "Value↕", "Where it stands▲", "Next step↕"],
    "the headings that sort are buttons, and where it stands is the order it opens in",
  );
  assert.deepEqual(
    all(tree, (n) => n.props?.className === "dtable-arrow").map((n) => [textOf(n), n.props["data-idle"]]),
    [
      ["↕", "true"],
      ["↕", "true"],
      ["▲", undefined],
      ["↕", "true"],
    ],
    "the caret is idle on the headings that are not the order, and the arrow of the one that is is not",
  );
  assert.equal(
    all(tree, (n) => n.props?.className === "dtable-words")
      .map(textOf)
      .join("|"),
    "More",
    "a heading that does not sort is a span of words, not a button",
  );
  // Each row: People's own person cell with the service under the name, the value, the time in stage, and the chip in its tone.
  const wes = find(tree, (n) => n.type === "tr" && n.props?.id === "person-wes");
  assert.ok(
    find(wes, (n) => String(n.props?.className || "").includes("cl-name-cell")),
    "People's person cell",
  );
  assert.deepEqual(
    ["row-words", "pipe-value", "pipe-in-stage"].map((id) => textOf(byTestId(wes, id))),
    ["Color correction", "$1,200", "11 d"],
  );
  const chip = byTestId(wes, "pipe-chip");
  assert.deepEqual([textOf(chip), chip.props["data-tone"]], ["Nothing back", "warn"]);
  const nia = byTestId(
    find(tree, (n) => n.type === "tr" && n.props?.id === "person-nia"),
    "pipe-chip",
  );
  assert.deepEqual([textOf(nia), nia.props["data-tone"]], ["Nothing back", "warn"]);
  assert.equal(
    textOf(
      byTestId(
        find(tree, (n) => n.type === "tr" && n.props?.id === "person-sara"),
        "pipe-chip",
      ),
    ),
    rowOf(vm, "sara").chip.words,
  );
  // The foot counts every deal in the Pipeline, the folded included (Ruben, 10 Oct 2026: a row is a deal).
  assert.match(textOf(find(tree, (n) => n.props?.className === "dtable-foot")), /^7 deals/);
});

test("Passed or ended opens with its Show, folds again with Hide, and a row opens its peek, not the person's page", async () => {
  await fresh();
  let tree = draw();
  const toggle = byTestId(tree, "table-section-toggle");
  assert.equal(toggle.props["aria-expanded"], false);
  click(toggle);
  tree = draw();
  assert.deepEqual(rowIds(tree), ["hana", "sara", "wes", "nia", "cat", "ed", "dan"], "the newest first");
  assert.equal(textOf(byTestId(tree, "table-section-toggle")), "Hide");
  assert.equal(byTestId(tree, "table-section-toggle").props["aria-expanded"], true);
  const dan = find(tree, (n) => n.type === "tr" && n.props?.id === "person-dan");
  assert.match(textOf(byTestId(dan, "pipe-chip")), /^Price · /);
  dan.props.onClick();
  tree = draw();
  assert.deepEqual(opened, [], "the page stays: the row opens its peek");
  assert.equal(textOf(byTestId(byTestId(tree, "pipeline-peek"), "pipeline-peek-name")), "Dan");
  click(byTestId(tree, "table-section-toggle"));
  tree = draw();
  assert.deepEqual(rowIds(tree), ["hana", "sara", "wes", "nia", "cat"]);
});

test("the Pipeline reads the people it shows ahead, in their order, so a row's peek opens on what the tab holds", async () => {
  const seen = await fresh();
  const tree = draw();
  await settled();
  assert.ok(seen.reads.length, "the rows on screen went to the courier");
  assert.deepEqual(seen.reads, rowIds(tree).slice(0, 12), "the ones drawn, first to last");
});

test("the keys are People's: J walks the rows shown, Enter opens the peek, Esc closes it, and a folded group is passed by", async () => {
  await fresh();
  let tree = draw();
  for (let i = 0; i < 6; i += 1) {
    assert.equal(press("j"), true);
    tree = draw();
  }
  assert.equal(byTestId(tree, "pipeline-peek"), null, "walking opens nothing");
  assert.equal(press("Enter"), true);
  tree = draw();
  assert.equal(
    textOf(byTestId(byTestId(tree, "pipeline-peek"), "pipeline-peek-name")),
    "Cat",
    "the last row shown: Passed or ended is folded, and J stops at Cat",
  );
  assert.deepEqual(opened, [], "Enter opens the peek, never the page");
  // K walks on behind the peek, and the peek follows the cursor (an effect, so the draw after the cursor's).
  assert.equal(press("k"), true);
  draw();
  tree = draw();
  assert.equal(textOf(byTestId(byTestId(tree, "pipeline-peek"), "pipeline-peek-name")), "Nia");
  assert.equal(press("Escape"), true);
  tree = draw();
  assert.equal(byTestId(tree, "pipeline-peek"), null, "Esc closes the peek");
  // x selects the row under the cursor, as on People: a selection is what Mark as passed and the lists act on.
  assert.equal(press("x"), true);
  tree = draw();
  assert.ok(byTestId(tree, "bulk-bar"), "and the bar says what is selected");
});

test("the words in the box find people in every group, the folded one opened, and the line stays the whole Pipeline's", async () => {
  await fresh();
  draw();
  lineBox().props.onChange({ target: { value: "dan" } });
  let tree = draw();
  assert.deepEqual(rowIds(tree), ["dan"]);
  assert.deepEqual(heads(tree), [{ label: "Passed or ended", count: "1", meta: null, toggle: null }]);
  assert.match(textOf(find(tree, (n) => n.props?.className === "dtable-foot")), /^Showing 1 of 7/);
  assert.match(textOf(byTestId(tree, "pipeline-summary")), /^2 proposals out/);
  lineBox().props.onChange({ target: { value: "zed" } });
  tree = draw();
  assert.match(textOf(tree), /No one matches this view\./);
  click(find(tree, (n) => n.type === "button" && textOf(n).includes("Clear filters")));
  tree = draw();
  assert.deepEqual(rowIds(tree), ["hana", "sara", "wes", "nia", "cat"]);
});

test("the Pipeline keeps a view of its own, apart from People's and Leads': the layout is the member's", async () => {
  const seen = await fresh();
  draw();
  lineBox().props.onChange({ target: { value: "wes" } });
  let tree = draw();
  draw();
  assert.deepEqual(seen.viewSaves, [], "words in the box are not a view");
  // #941 kept List | Board in this browser; it is the member's saved view now, beside People's and Leads'.
  click(byTestId(withHead(tree), "pipeline-view-board"));
  draw();
  assert.deepEqual(
    seen.viewSaves.map((v) => [v.page, v.view.layout]),
    [["pipeline", "board"]],
    "saved through the one saver, as the Pipeline's",
  );
  assert.equal(
    JSON.parse(globalThis.localStorage.getItem("chanlytics-pipeline-view")).layout,
    "board",
    "with this device's copy",
  );
  assert.equal(
    globalThis.localStorage.getItem("chanlytics-people-view"),
    null,
    "People's saved view is People's alone",
  );
  assert.equal(globalThis.localStorage.getItem("chanlytics-leads-view"), null);
  assert.equal(globalThis.localStorage.getItem("pipeline.view"), null, "#941's key is never written again");
});

test("one clock with the rows: the Pipeline counts at the moment the surface published them, not at the draw", async () => {
  await fresh();
  const published = surfaceValue("people").fetchedAt;
  // The rows were said at `published`; a page that grouped them at the draw's own moment could say a consultation
  // held two days ago beside a proposal's wait said the day before. Moved back a day, the Pipeline's own counts move
  // with the surface's clock, and never with the wall's.
  setSurfaceValue("people", { ...surfaceValue("people"), fetchedAt: published - DAY });
  const tree = draw();
  const hana = find(tree, (n) => n.type === "tr" && n.props?.id === "person-hana");
  assert.equal(
    textOf(byTestId(hana, "pipe-in-stage")),
    "1 d",
    "held two days before the wall's now: one before the surface's",
  );
});

test("past the people People has loaded, the line says it counts only them, in People's own words", async () => {
  await fresh({ total: 1400, hasMore: true });
  const people = surfaceValue("people");
  assert.equal(people.page.has_more, true, "the surface stopped with more to follow");
  const tree = draw();
  const parts = lineParts(tree);
  assert.equal(parts.at(-1), plLoadedWords(people.rows.length, 1400));
  assert.equal(parts.at(-1), `${people.rows.length} of 1,400 loaded`, "People's words: N of M loaded");
  assert.deepEqual(parts.slice(0, -1), pipelineOf(people.rows, people.fetchedAt, ZONE, null).summary);
});

test("with nobody to follow, the table says so in contracts' words", async () => {
  await fresh({ people: [personRow(Date.now(), "nobody", "Nobody")] });
  const tree = draw();
  assert.equal(byTestId(tree, "pipeline-summary"), null, "a line with nothing in it is not drawn");
  assert.match(textOf(tree), /No deals yet\./);
  assert.match(textOf(tree), /Proposals you start show here\./);
  assert.match(textOf(find(tree, (n) => n.props?.className === "dtable-foot")), /^0 deals/);
});

test("the Pipeline's address draws the Pipeline in every workspace, with no deal on file too (0008, amended 18 Oct 2026)", async () => {
  await fresh({ hasDeals: false, people: [personRow(Date.now(), "nobody", "Nobody")] });
  globalThis.window.location.hash = "#/clients/pipeline";
  const tree = draw();
  assert.equal(globalThis.window.location.hash, "#/clients/pipeline", "the address stays the Pipeline's");
  assert.ok(byTestId(tree, "pipeline"), "the Pipeline");
  assert.match(textOf(tree), /No deals yet./, "with its empty state, in contracts' words");
});

test("the rail's rows go to the Pipeline's own views (the switch to each scope is the frame's)", async () => {
  await fresh();
  const tree = draw();
  // Its rail picks a view of the Pipeline, a new entry each; People's lists open on People, from People.
  for (const id of ["proposals", "waiting", "svc:Color correction", "all"])
    click(byTestId(tree, `pipeline-rail-row-${id}`));
  assert.deepEqual(went, [
    "clients/pipeline:v-proposals",
    "clients/pipeline:v-waiting",
    "clients/pipeline:v-s.Color%20correction",
    "clients/pipeline",
  ]);
  assert.deepEqual(replaced, [], "a view is a place of its own: pushed");
});

test("a view in the address holds its rows alone; the line's press opens it, and pressed again goes back to all deals", async () => {
  await fresh();
  let tree = draw();
  click(byTestId(tree, "pipeline-line-waiting"));
  assert.equal(went.at(-1), "clients/pipeline:v-waiting");
  // The shell follows the address (surfaces/frame/app-shell.tsx), handing the page its param.
  tree = draw({ pipelineRoute: "pipeline:v-waiting" });
  assert.equal(byTestId(tree, "pipeline-line-waiting").props["aria-pressed"], true);
  assert.equal(
    byTestId(tree, "pipeline-rail-row-waiting").props["aria-current"],
    "true",
    "the rail says the same view",
  );
  assert.deepEqual(rowIds(tree), ["wes", "nia"], "the view's rows alone");
  assert.match(textOf(find(tree, (n) => n.props?.className === "dtable-foot")), /^2 deals/, "the foot counts the view");
  assert.deepEqual(
    lineParts(tree),
    pipelineOf(surfaceValue("people").rows, surfaceValue("people").fetchedAt, ZONE, null).summary,
    "the line stays the whole Pipeline's",
  );
  click(byTestId(tree, "pipeline-line-waiting"));
  assert.equal(went.at(-1), "clients/pipeline", "pressed again: all deals");
  // A view with nobody in it says so, with the way back.
  tree = draw({ pipelineRoute: "pipeline:v-s.Nothing%20here" });
  assert.match(textOf(tree), /Nobody here/);
  click(find(tree, (n) => n.type === "button" && textOf(n).includes("All deals") && !n.props?.["data-testid"]));
  assert.equal(went.at(-1), "clients/pipeline");
});

test("the peek is in the address: opening pushes it, the cursor walking it replaces it, Esc goes back, and a link opens it", async () => {
  await fresh();
  let tree = draw();
  find(tree, (n) => n.type === "tr" && n.props?.id === "person-wes").props.onClick();
  draw();
  assert.deepEqual(went, ["clients/pipeline:p-wes"], "opened: a new entry, so Back closes it");
  draw({ pipelineRoute: "pipeline:p-wes" });
  tree = draw({ pipelineRoute: "pipeline:p-wes" });
  assert.equal(went.length, 1, "the address and the page agree: nothing more is asked");
  assert.ok(byTestId(tree, "pipeline-peek"));
  assert.equal(press("j"), true);
  for (let i = 0; i < 3; i += 1) tree = draw({ pipelineRoute: "pipeline:p-wes" });
  assert.deepEqual(replaced, ["clients/pipeline:p-nia"], "the cursor walked it on: the same entry, replaced");
  for (let i = 0; i < 2; i += 1) tree = draw({ pipelineRoute: "pipeline:p-nia" });
  assert.equal(press("Escape"), true);
  for (let i = 0; i < 3; i += 1) tree = draw({ pipelineRoute: "pipeline:p-nia" });
  assert.equal(backs.length, 1, "closed: back to the entry the opening made");
  assert.equal(byTestId(tree, "pipeline-peek"), null);
  // A link that names a person opens their peek as it lands, and closes by replacing: Back would leave the Pipeline.
  await fresh();
  for (let i = 0; i < 3; i += 1) tree = draw({ pipelineRoute: "pipeline:v-proposals:p-nia" });
  assert.equal(textOf(byTestId(byTestId(tree, "pipeline-peek"), "pipeline-peek-name")), "Nia");
  assert.deepEqual(went, [], "the address already says so");
  click(byTestId(byTestId(tree, "pipeline-peek"), "pipeline-peek-close"));
  for (let i = 0; i < 3; i += 1) tree = draw({ pipelineRoute: "pipeline:v-proposals:p-nia" });
  assert.deepEqual(
    replaced,
    ["clients/pipeline:v-proposals"],
    "closed where the link opened it: replaced, the view kept",
  );
  assert.deepEqual(backs, []);
  // Someone the address names who is not in the Pipeline: nothing opens.
  await fresh();
  for (let i = 0; i < 3; i += 1) tree = draw({ pipelineRoute: "pipeline:p-nobody" });
  assert.equal(byTestId(tree, "pipeline-peek"), null);
});

test("New proposal: pick someone, and the one deal sheet opens to propose", async () => {
  await fresh();
  const asked = [];
  bridgeHolds({
    parts: {
      sheets: {
        ...provided("sheets"),
        openDeal: (a) => {
          asked.push(a);
          return true;
        },
      },
    },
  });
  let tree = draw();
  const open = newOpen(tree);
  assert.deepEqual(
    [open.props.variant, textOf(open).trim()],
    ["primary", "New proposal"],
    "the page's one filled button: the kit's primary",
  );
  click(open);
  tree = draw();
  assert.ok(byTestId(tree, "pipeline-new"), "the picker");
  // Focus goes by the record sheet's own rule (focusOn): the sheet keeps New proposal as what opened it, and gives
  // focus back to it as it closes. An autoFocus ran before the sheet did and took the search box for the opener.
  const sheetOf = (t) => find(t, (n) => n.type === globalThis.window.RecordSheet);
  assert.deepEqual(sheetOf(tree).props.focusOn, { row: "search" });
  assert.equal(byTestId(tree, "pipeline-new-search").props.autoFocus, false);
  assert.ok(
    find(tree, (n) => n.props?.["data-rec-row"] === "search"),
    "the field it names",
  );
  byTestId(tree, "pipeline-new-search").props.onChange({ target: { value: "wes" } });
  tree = draw();
  const picks = all(byTestId(tree, "pipeline-new-list"), (n) => n.props?.["data-testid"] === "pipeline-new-pick");
  assert.deepEqual(
    picks.map((n) => textOf(byClass(n, "person-pick-name"))),
    ["Wes"],
    "People's own rule finds them",
  );
  byTestId(tree, "pipeline-new-search").props.onChange({ target: { value: "zed" } });
  tree = draw();
  assert.match(textOf(byTestId(tree, "pipeline-new")), /No one matches\./);
  byTestId(tree, "pipeline-new-search").props.onChange({ target: { value: "wes" } });
  tree = draw();
  click(all(byTestId(tree, "pipeline-new-list"), (n) => n.props?.["data-testid"] === "pipeline-new-pick")[0]);
  tree = draw();
  assert.deepEqual(asked, [{ personId: "wes", mode: "propose" }]);
  assert.equal(byTestId(tree, "pipeline-new"), null, "the picker closes as the sheet opens");
});

// The phone's sheet is compact (People's RailEmpty): a view with no deal in it is said in its section's one quiet line,
// not drawn; all deals and the one picked always are. A desktop's rail draws every row.
test("the Pipeline's rows, compact in a phone's sheet: an empty view is said in a line, all deals and the picked one stay", () => {
  const sections = [
    {
      key: "deals",
      label: "Deals",
      rows: [
        { view: "all", label: "All deals", count: 0, tone: null },
        { view: "consultations", label: "Consultations", count: 3, tone: null },
        { view: "proposals", label: "Proposal out", count: 0, tone: null },
        { view: "clients", label: "Clients", count: 0, tone: null },
        { view: "ended", label: "Passed or ended", count: 0, tone: null },
      ],
    },
  ];
  const ids = (tree) =>
    all(tree, (n) => String(n.props?.["data-testid"] || "").startsWith("pipeline-rail-row-")).map((n) =>
      n.props["data-testid"].slice("pipeline-rail-row-".length),
    );
  // The stub tree reaches a node through its parent's children and its own drawing both: each is counted once.
  const said = (tree) => [...new Set(all(tree, (n) => n.props?.className === "cl-rail-empty"))].map(textOf);
  const Rows = PipelineRailRows;
  const compact = Rows({ sections, view: "clients", onPick: () => {}, compact: true });
  assert.deepEqual([...new Set(ids(compact))], ["all", "consultations", "clients"]);
  assert.deepEqual(said(compact), ["Empty now: Proposal out · Passed or ended"]);
  const rail = Rows({ sections, view: "clients", onPick: () => {} });
  assert.deepEqual([...new Set(ids(rail))], ["all", "consultations", "proposals", "clients", "ended"]);
  assert.deepEqual(said(rail), []);
});

test("on a phone: one bar with the view's list button and search, New proposal in the head on the row of views, then the line and People's cards", () =>
  onPhone(async () => {
    await fresh();
    const tree = draw();
    assert.equal(byClass(tree, "cl-rail"), null, "no rail: the view is the bar's list button");
    assert.equal(byClass(tree, "cl-controls"), null, "no controls row");
    const bar = byTestId(tree, "pipeline-phone-bar");
    const scroller = byClass(tree, "cl-main-scroll");
    assert.ok(scroller, "the page's scroller");
    assert.equal(
      byTestId(scroller, "pipeline-phone-bar"),
      null,
      "the bar stands over what scrolls, as the Inbox's strip does",
    );
    assert.equal(all(bar, (n) => n.props?.role === "tab").length, 0, "the switch is the frame's strip over the bar");
    // The view is the bar's list button, its rows the rail's, in a sheet: no row of chips above the work.
    const lists = byTestId(bar, "pipeline-phone-lists");
    assert.deepEqual(
      [textOf(byClass(lists, "pp-bar-pick-words")), textOf(byClass(lists, "pp-bar-pick-count"))],
      ["All deals", "7"],
    );
    // New proposal is the head's act, with its words: the bar drew it as a bare + (Ruben, 7 Oct 2026).
    assert.equal(byTestId(bar, "pipeline-new-open"), null, "the bar draws no + of its own");
    const headAct = find(standingSaid()?.act ?? null, (n) => n.props?.["data-testid"] === "pipeline-new-open");
    assert.ok(headAct, "the head holds New proposal");
    assert.match(textOf(headAct), /New proposal/);
    // Beside three scopes a narrow phone has room for one word: the act says "New" with its mark, and the rest gives way.
    assert.equal(textOf(find(headAct, (n) => n.props?.className === "pg-act-keep")), "New");
    assert.equal(textOf(find(headAct, (n) => n.props?.className === "pg-act-rest")), " proposal");
    assert.equal(byTestId(bar, "pipeline-phone-find").props["aria-label"], "Search names, numbers and emails");
    assert.ok(byTestId(tree, "pipeline-summary"));
    const card = find(tree, (n) => n.type === "tr" && n.props?.id === "person-wes");
    assert.match(card.props.className, /\bpl-card-row\b/);
    assert.equal(textOf(find(card, (n) => n.props?.className === "list-row-name")), "Wes");
    assert.equal(textOf(byTestId(card, "pipe-chip")), "Nothing back");
    assert.equal(textOf(byTestId(card, "pipe-service")), "Color correction");
    assert.deepEqual(
      ["pipe-value", "pipe-in-stage"].map((id) => textOf(byTestId(card, id))),
      ["$1,200", "11 d"],
    );
    // The section heads stand on a phone too, above their cards.
    assert.deepEqual(
      heads(tree).map((h) => h.label),
      ["Consultations", "Proposal out", "Clients", "Passed or ended"],
    );
    click(lists);
    const sheetTree = draw();
    // The kit's Sheet (kit/sheet/sheet.tsx), read by what the page hands it while it is open: its title names it.
    const sheet = find(sheetTree, (n) => n.type === Sheet && n.props.testid === "people-lists-sheet" && n.props.open);
    assert.ok(sheet, "the rail's rows, as a sheet");
    assert.equal(sheet.props.title, "Views", "named for what it holds: the Pipeline's views, not People's lists");
    click(byTestId(sheet, "pipeline-rail-row-clients"));
    assert.equal(went.at(-1), "clients/pipeline:v-clients");
    assert.equal(
      find(draw(), (n) => n.type === Sheet && n.props.testid === "people-lists-sheet" && n.props.open),
      null,
      "a pick closes it",
    );
    // New proposal's picker is a phone's sheet, whose search takes focus as it opens: that sheet has no focus rule.
    click(newOpen(draw()));
    const picker = draw();
    assert.ok(byTestId(picker, "pipeline-new-sheet"));
    assert.equal(byTestId(picker, "pipeline-new-search").props.autoFocus, true);
  }));

/* ------------------------------------------------------------------------------ the row carries the deal */

test("each row wears its deal's steps: a consultation where one was held or is coming, the proposal, the client; a pass has none", () => {
  const vm = pipelineOf(fixture(), NOW, TZ, null);
  const track = (id) => rowOf(vm, id).track.map((s) => `${s.key}:${s.at}${s.tone === "plain" ? "" : `:${s.tone}`}`);
  // Held, no proposal since: the proposal is the step now, waiting on the owner, as the chip says.
  assert.deepEqual(track("hana"), ["consultation:done", "proposal:current:warn", "client:ahead"]);
  // Coming up: the consultation is where it stands.
  assert.deepEqual(track("sara"), ["consultation:current:info", "proposal:ahead", "client:ahead"]);
  // A proposal out: waiting on the owner in warn, heard back in info; no consultation held, no step for one.
  assert.deepEqual(track("wes"), ["proposal:current:warn", "client:ahead"]);
  assert.deepEqual(track("will"), ["proposal:current:info", "client:ahead"]);
  // The colour says who it waits on, one rule for the row, the deal sheet and the person page's card (proposalTone):
  // the follow-up has Wes in hand, so it is not the owner's to chase; a proposal past its valid-until day is the
  // owner's however young.
  const inHand = fixture().map((r) =>
    r.id === "wes" ? { ...r, followUp: { kind: "will", atMs: NOW + DAY, asks: false } } : r,
  );
  assert.deepEqual(
    rowOf(pipelineOf(inHand, NOW, TZ, null), "wes").track.map((s) => `${s.key}:${s.at}:${s.tone}`),
    ["proposal:current:info", "client:ahead:plain"],
  );
  const lapsed = toPersonRowVM(
    personRow(NOW, "lia", "Lia", deal(NOW, "proposed", { proposed: 2, validUntil: "2026-09-20" })),
    TZ,
    new Date(NOW),
  );
  assert.equal(pipelineOf([lapsed], NOW, TZ, null).groups[0].rows[0].track[0].tone, "warn", "past its day");
  assert.deepEqual(
    track("val"),
    ["proposal:current:info", "client:ahead"],
    "a consultation ahead of a proposal is not a step behind it",
  );
  // A client has come through both.
  assert.deepEqual(track("cat"), ["proposal:done", "client:current:ok"]);
  // A pass or an end: the chip says it, and there is no track.
  for (const id of ["ed", "dan", "eve"]) assert.deepEqual(rowOf(vm, id).track, [], id);
  // A proposal after a consultation held: three steps, the first done.
  const consulted = pipelineOf(
    [
      toPersonRowVM(
        personRow(NOW, "ivy", "Ivy", {
          ...deal(NOW, "proposed", { proposed: 2 }),
          visits: visits(null, visit(ny("09-18", 10))),
        }),
        TZ,
        new Date(NOW),
      ),
    ],
    NOW,
    TZ,
    null,
  );
  assert.deepEqual(
    consulted.groups[0].rows[0].track.map((s) => `${s.key}:${s.at}`),
    ["consultation:done", "proposal:current", "client:ahead"],
  );
});

test("the rows order by the member's pick within each group: value over a year with none last, name, or the Pipeline's own reversed", () => {
  const vm = pipelineOf(fixture(), NOW, TZ, null);
  const order = (v, key) => byKey(v)[key].rows.map((r) => r.id);
  assert.deepEqual(PIPELINE_SORTS, ["stage", "value", "name", "next"]);
  // The Pipeline's own order is the table as it opens, and an order it does not know is that one.
  assert.equal(pipelineSorted(vm, "stage", "asc"), vm);
  assert.deepEqual(order(pipelineSorted(vm, "nonsense", "asc"), "proposals"), order(vm, "proposals"));
  assert.deepEqual(order(pipelineSorted(vm, "stage", "desc"), "proposals"), [...order(vm, "proposals")].reverse());
  // Value: Nia's $3,050 over Wes's $1,200; the ones with no amount last, in the Pipeline's order, either way.
  const none = order(vm, "proposals").filter((id) => !["wes", "nia"].includes(id));
  assert.deepEqual(order(pipelineSorted(vm, "value", "desc"), "proposals"), ["nia", "wes", ...none]);
  assert.deepEqual(order(pipelineSorted(vm, "value", "asc"), "proposals"), ["wes", "nia", ...none]);
  // A month counts twelve times over a year: Cat's $1,000 a month over Cy's $340 a month.
  assert.deepEqual(order(pipelineSorted(vm, "value", "desc"), "clients").slice(0, 2), ["cat", "cy"]);
  // Name, either way; the groups themselves never move.
  assert.deepEqual(order(pipelineSorted(vm, "name", "asc"), "proposals"), ["fay", "lars", "nia", "val", "wes", "will"]);
  assert.deepEqual(order(pipelineSorted(vm, "name", "desc"), "proposals"), [
    "will",
    "wes",
    "val",
    "nia",
    "lars",
    "fay",
  ]);
  assert.deepEqual(
    pipelineSorted(vm, "name", "asc").groups.map((g) => g.key),
    vm.groups.map((g) => g.key),
  );
  // Bea passed on $9,000 and came back for a consultation: her row shows no value, and sorts with those that have none.
  const bea = pipelineOf(
    [
      ...fixture(),
      toPersonRowVM(
        personRow(NOW, "bea2", "Bea", {
          ...deal(NOW, "lost", { proposed: 40, decided: 30, cents: 900_000, per: "once" }),
          visits: visits(null, visit(ny("09-22", 10))),
        }),
        TZ,
        new Date(NOW),
      ),
    ],
    NOW,
    TZ,
    null,
  );
  const held = (v) => byKey(v).consultations.rows.map((r) => r.id);
  assert.equal(rowOf(bea, "bea2").value, null);
  assert.deepEqual(held(pipelineSorted(bea, "value", "desc")), held(bea), "no value, the Pipeline's own order");
  assert.deepEqual(held(pipelineSorted(bea, "value", "asc")), held(bea));
});

test("Mark as passed for a selection: only the proposals out pass, the rest are said and left, and why is asked once", () => {
  const rows = fixture();
  const pick = (...want) => rows.filter((r) => want.includes(r.id));
  const vm = pipelinePassMany(pick("wes", "nia", "cat"));
  assert.deepEqual(
    vm.deals.map((d) => d.personId),
    ["wes", "nia"],
  );
  assert.ok(vm.deals.every((d) => typeof d.dealId === "string" && d.dealId));
  assert.deepEqual(
    [vm.button, vm.words, vm.rest, vm.more],
    ["Mark as passed · 2", "Mark 2 as passed", "1 is not a proposal out and stays as it is", null],
  );
  assert.deepEqual(
    vm.reasons.map((r) => r.words),
    Object.values(DEAL_LOST_REASON_WORDS),
    "the deal sheet's own reasons, in its order",
  );
  assert.deepEqual(
    [pipelinePassMany(pick("wes")).words, pipelinePassMany(pick("wes")).rest],
    ["Mark 1 as passed", null],
  );
  const none = pipelinePassMany(pick("cat", "hana"));
  assert.deepEqual([none.deals, none.words, none.rest], [[], null, "2 are not proposals out and stay as they are"]);
  // What it came to.
  assert.deepEqual(pipelinePassDone(2, 0), { words: "2 marked as passed", tone: "ok" });
  assert.deepEqual(pipelinePassDone(1, 1), {
    words: "1 marked as passed · 1 had changed, and was left as it is",
    tone: "warn",
  });
  assert.deepEqual(pipelinePassDone(0, 2), { words: "2 had changed, and were left as they are", tone: "warn" });
  // One that could not be recorded at all (offline, a refusal of another kind) is not one that had changed.
  assert.deepEqual(pipelinePassDone(1, 0, 1), { words: "1 marked as passed · 1 couldn't be marked", tone: "warn" });
  assert.deepEqual(pipelinePassDone(0, 0, 2), { words: "2 couldn't be marked", tone: "danger" });
  // Fifty at a press, as People's bar writes: the rest stay selected, and say so.
  const many = Array.from({ length: PIPELINE_PASS_MAX + 3 }, (_, i) =>
    toPersonRowVM(
      personRow(NOW, `m${i}`, `M${i}`, deal(NOW, "proposed", { proposed: 2 + (i % 5) })),
      TZ,
      new Date(NOW),
    ),
  );
  const capped = pipelinePassMany(many);
  assert.deepEqual(
    [capped.deals.length, capped.button, capped.more],
    [50, "Mark as passed · 50", "3 more stay selected, fifty at a time"],
  );
});

test("what a reply may be is the person page's one sentence, which the sheet leaves to their page; a board column holds twenty", () => {
  // What a reply may be, one sentence for the person page (the compact sheet says it no more: their page, a press away).
  assert.equal(repliesWords("Email", null, { optedOut: false, who: "Wes", emailStopped: false }), "Any time, by email");
  assert.equal(repliesWords("Text", null, { optedOut: false, who: "Wes", emailStopped: false }), "Any time, by text");
  assert.equal(
    repliesWords("WhatsApp", { open: false, hoursLeft: 0 }, { optedOut: false, who: "Wes", emailStopped: false }),
    "Approved messages only, until they write again",
  );
  assert.equal(
    repliesWords("WhatsApp", { open: true, hoursLeft: 1 }, { optedOut: false, who: "Wes", emailStopped: false }),
    "Any message, for 1 more hour",
  );
  assert.equal(
    repliesWords("WhatsApp", { open: true, hoursLeft: 0 }, { optedOut: false, who: "Wes", emailStopped: false }),
    "Any message, for less than an hour",
  );
  assert.equal(repliesWords(null, null, { optedOut: false, who: "Wes", emailStopped: false }), null);
  // A board column holds twenty, then says how many more.
  assert.deepEqual([PIPELINE_BOARD_CAP, pipelineBoardMore(4)], [20, "Show 4 more"]);
});

/* ------------------------------------------------------------------------------ the Pipeline as a workspace */

test("a card dropped in another column asks for the sheet in the mode the move needs, and nothing else moves", () => {
  const vm = pipelineOf(fixture(), NOW, TZ, null);
  const row = (id) => rowOf(vm, id);
  assert.deepEqual(pipelineMove("consultations", "proposals", row("hana")), { mode: "propose", dealId: null });
  assert.deepEqual(pipelineMove("proposals", "clients", row("wes")), { mode: "won", dealId: "d-proposed-11" });
  assert.deepEqual(pipelineMove("proposals", "closed", row("wes")), { mode: "lost", dealId: "d-proposed-11" });
  assert.deepEqual(pipelineMove("clients", "closed", row("cat")), { mode: "ended", dealId: "d-won-12" });
  assert.deepEqual(pipelineMove("closed", "proposals", row("dan")), { mode: "again", dealId: "d-lost-8" });
  assert.deepEqual(
    pipelineMove("closed", "proposals", row("ed")),
    { mode: "propose", dealId: null },
    "an ended engagement begins a new proposal, never the old one again",
  );
  // A consultation after a pass or an end begins something new: Bea's and Rae's rows sit among the consultations.
  assert.deepEqual(pipelineMove("consultations", "proposals", row("bea")), { mode: "propose", dealId: null });
  assert.deepEqual(pipelineMove("consultations", "proposals", row("rae")), { mode: "propose", dealId: null });
  for (const [from, to, id] of [
    ["proposals", "consultations", "wes"],
    ["clients", "proposals", "cat"],
    ["clients", "consultations", "cat"],
    ["closed", "clients", "dan"],
    ["closed", "consultations", "dan"],
    ["consultations", "clients", "hana"],
    ["consultations", "closed", "hana"],
    ["proposals", "proposals", "wes"],
  ])
    assert.equal(pipelineMove(from, to, row(id)), null, `${from} into ${to} means nothing`);
  // A row whose deal is not the stage the column assumes asks for nothing rather than a wrong move.
  assert.equal(pipelineMove("proposals", "clients", row("cat")), null);
  assert.equal(pipelineMove("clients", "closed", row("wes")), null);
});

test("the sheet's head and facts are the row's: who, the deal's service and value, what is coming up", () => {
  const vm = pipelineOf(fixture(), NOW, TZ, null);
  const wes = pipelinePeekOf(rowOf(vm, "wes"), "proposals");
  // Where the deal stands is the steps' to say, under it: the head says what the deal is.
  assert.deepEqual(
    [wes.id, wes.name, wes.initials, wes.numeric, wes.sub, wes.group, wes.dealId],
    ["wes", "Wes", "WE", false, "Color correction · $1,200", "proposals", "d-proposed-11"],
  );
  // When they were heard and their words are their last words' (the person page's own), once they are read.
  assert.deepEqual(wes.facts, [], "nothing the row carries that the sheet does not say");
  const sara = pipelinePeekOf(rowOf(vm, "sara"), "consultations");
  assert.deepEqual([sara.sub, sara.dealId], ["Consultation", null], "no deal yet: the consultation");
  const next = sara.facts.find((f) => f.id === "next");
  assert.ok(next && next.words.startsWith("Coming up · "), "her consultation, as People's row says it");
  assert.deepEqual(pipelinePeekOf(rowOf(vm, "cleo"), "clients").sub, "Clients", "a client with no service named");
  // A number for a name is drawn in figures.
  const num = toPersonRowVM(
    personRow(NOW, "n1", "+1 555 000 1234", deal(NOW, "proposed", { proposed: 2 })),
    TZ,
    new Date(NOW),
  );
  assert.equal(pipelinePeekOf(pipelineOf([num], NOW, TZ, null).groups[0].rows[0], "proposals").numeric, true);
  // The head's face and name are the door to their page, named by their name; how to reach them is that page's.
  const { open, ...peekWords } = PIPELINE_WORDS.peek;
  assert.deepEqual(peekWords, { close: "Close", reading: "Reading…", what: "this person" });
  assert.equal(open("Wes"), "Open Wes's page");
});

test("the sheet says a closed deal when, then why, and a consultation's head and its new proposal name the service it was for", () => {
  const vm = pipelineOf(fixture(), NOW, TZ, null);
  assert.match(pipelineSheetOf(rowOf(vm, "dan"), null, NOW, TZ).stand.words, /^Passed [A-Z][a-z]{2} \d{1,2} · Price$/);
  const consulted = {
    consultationTitle: "Consultation · Brand identity",
    services: ["Brand identity"],
    consultFirst: ["Brand identity"],
    deals: [],
    deal: null,
    consultedMs: null,
  };
  const sheet = pipelineSheetOf(rowOf(vm, "hana"), consulted, NOW, TZ);
  assert.deepEqual([sheet.sub, sheet.lead.act.service], ["Consultation · Brand identity", "Brand identity"]);
  assert.equal(pipelineSheetOf(rowOf(vm, "hana"), null, NOW, TZ).sub, null, "before the read, the row's own line");
});

test("People repaints on a teammate's deal: the surface asks for the deals table, and the database tells the workspace of it", async () => {
  const { wantsRefresh } = await import("../../../apps/dashboard/src/bridge/surface-realtime.ts");
  assert.equal(wantsRefresh(peopleOverride, "deals"), true);
  assert.equal(wantsRefresh(peopleOverride, "messages"), true, "the default trio still");
  // A call's start and end move a row's last contact and call count (people_list's last call): People hears the calls on its
  // page (reads-not-heard's owed, closed), and never a live call's transcript turn, which changes none of its rows.
  assert.equal(wantsRefresh(peopleOverride, "calls"), true, "a call starting or ending is People's");
  assert.equal(
    wantsRefresh(peopleOverride, "calls", {
      table: "calls",
      event: "UPDATE",
      row: { tenant_id: TID, status: "ongoing" },
    }),
    false,
    "a live call's turns are not People's",
  );
  // The live feed (packages/db realtime.ts) must be told of the table, or a surface asking for it hears nothing: the
  // database tells every event on deals (00265), and a notice of one reaches the runner as the deals table's change.
  assert.deepEqual(toldFor("deals"), EVERY_EVENT, "every deal event");
  const heard = await changesOf({ event: "UPDATE", payload: { table: "deals", op: "UPDATE" } }, TID);
  assert.deepEqual(
    heard.map((c) => [c.table, c.event, c.row.tenant_id, wantsRefresh(peopleOverride, c.table, c)]),
    [["deals", "UPDATE", TID, true]],
    "this workspace's deal, as the deals table's change: People repaints",
  );
});

test("a row opens its deal sheet beside the rows: the head at once (its name the door to their page), the deal's steps and line as they land, one act and its caret, Message and Call", async () => {
  const seen = await fresh();
  const asked = [];
  // The read is on its way until the test says: the sheet is drawn at once, and says so.
  let release = () => {};
  seen.hold = new Promise((r) => (release = r));
  bridgeHolds({
    parts: {
      sheets: {
        ...provided("sheets"),
        openDeal: (ask) => {
          asked.push(ask);
          return true;
        },
      },
    },
  });
  let tree = draw();
  find(tree, (n) => n.type === "tr" && n.props?.id === "person-wes").props.onClick();
  tree = draw();
  const peek = peekOf(tree);
  assert.ok(peek, "the sheet, beside the rows");
  assert.deepEqual([peek.props.role, peek.props["aria-label"]], ["dialog", "Wes"]);
  assert.deepEqual(opened, [], "the page stays");
  assert.equal(textOf(byTestId(peek, "pipeline-peek-name")), "Wes");
  assert.equal(textOf(byTestId(peek, "pipeline-peek-sub")), "Color correction · $1,200");
  // The row's steps at once, in the tone of who each waits on (eleven days with nothing back: the owner's to chase).
  const steps = (t) =>
    all(peekOf(t), (n) => n.props?.["data-testid"] === "person-deal-step").map((n) => [
      n.props["data-at"],
      n.props["data-tone"] ?? null,
    ]);
  assert.deepEqual(steps(tree), [
    ["current", "warn"],
    ["ahead", null],
  ]);
  assert.ok(byTestId(peek, "pipeline-peek-reading"), "the person is still on their way: said, never a blank");
  assert.equal(byTestId(peek, "pipeline-peek-bar"), null, "nothing to press before the card reads them");
  await tick();
  assert.ok(seen.reads.includes("wes"), "read through the profile's own courier");
  release();
  await settled();
  tree = draw();
  // One line of where it stands (whether it went); the proposal's link is the caret's to open and their page's to copy
  // (the compact sheet: the sheet acts, their page records), and so are their words and how to reach them.
  assert.equal(byTestId(peekOf(tree), "person-deal-line"), null);
  assert.ok(byTestId(byTestId(peekOf(tree), "pipeline-peek-stand"), "pipeline-peek-fact"), "a fact beside the flags");
  for (const gone of ["pipeline-peek-proposal", "pipeline-peek-reach", "pipeline-peek-others", "pipeline-peek-page"])
    assert.equal(byTestId(peekOf(tree), gone), null, `${gone} is their page's`);
  assert.equal(byTestId(peekOf(tree), "pipeline-peek-reading"), null);
  // The foot: the card's one next act, its caret in the same pill, then Message and Call.
  const lead = byTestId(peekOf(tree), "pipeline-peek-bar-act");
  assert.equal(textOf(lead), "Send proposal", "the card's one next act");
  assert.ok(byTestId(peekOf(tree), "pipeline-peek-message"));
  assert.ok(
    find(peekOf(tree), (n) => n.props?.trigger?.props?.["data-testid"] === "person-call"),
    "their page's own Call, which rings and asks how it went",
  );
  // A send opens their thread with the words in the box, the person page's own way.
  click(lead);
  const threadId = surfaceValue("people").rows.find((r) => r.id === "wes").threadId;
  assert.equal(went.at(-1), `inbox/${threadId}`);
  const carried = JSON.parse(globalThis.sessionStorage.getItem("chanlytics-compose"));
  assert.equal(carried.threadId, threadId);
  assert.ok(carried.text.includes("docs.example.com/proposal"), "the proposal's link, in the words");
  // The caret holds the deal's other moves, the proposal where it lives, and a new proposal; each move asks the one
  // sheet, and the proposal opens in a new tab, its host said at the item's end.
  const caret = find(byTestId(peekOf(tree), "pipeline-peek-bar"), (n) => n.type === Menu);
  assert.deepEqual(
    listOf(caret).map((it) => (it.divider ? "—" : it.label)),
    [DEAL_ACT_WORDS.won, DEAL_ACT_WORDS.lost, DEAL_ACT_WORDS.edit, "Open the proposal", "—", "Start another proposal"],
    "the deal's moves and its proposal, then a new proposal apart: it moves no deal of these",
  );
  const proposal = listOf(caret)[3];
  assert.deepEqual([proposal.hint, proposal.title], ["docs.example.com", "https://docs.example.com/proposal"]);
  const tabs = [];
  const open = globalThis.window.open;
  globalThis.window.open = (...args) => {
    tabs.push(args);
    return null;
  };
  proposal.onClick();
  globalThis.window.open = open;
  assert.deepEqual(tabs, [["https://docs.example.com/proposal", "_blank", "noopener,noreferrer"]]);
  listOf(caret)[0].onClick();
  assert.deepEqual(asked, [{ personId: "wes", mode: "won", dealId: "d-proposed-11" }]);
  listOf(caret)[5].onClick();
  assert.deepEqual(asked.at(-1), { personId: "wes", mode: "propose", dealId: null });
  // Message: their thread, the box empty.
  click(byTestId(peekOf(tree), "pipeline-peek-message"));
  assert.equal(went.at(-1), `inbox/${threadId}`);
  // Their page: the head's name, named for where it goes.
  const name = byTestId(peekOf(tree), "pipeline-peek-opens");
  assert.equal(name.props["aria-label"], "Open Wes's page");
  click(name);
  assert.deepEqual(opened, ["wes"]);
  // Close puts the sheet away and leaves the rows as they were.
  click(byTestId(peekOf(tree), "pipeline-peek-close"));
  tree = draw();
  assert.equal(peekOf(tree), null);
  assert.deepEqual(rowIds(tree), ["hana", "sara", "wes", "nia", "cat"]);
});

test("a proposal waiting with nothing back asks whether they said yes, a pass asks why in the foot, and each kind of row says where it stands and leads with its one act", async () => {
  const seen = await fresh();
  // Wes's proposal went eleven days ago with its link, and nothing back: Follow up is the card's next act.
  seen.person = (id) => {
    const d = detailOf(seen.rawOf(id));
    if (id !== "wes") return d;
    const sent = {
      id: "m-sent",
      conversation_id: d.conversations[0].id,
      direction: "outbound",
      sender: "human",
      type: "text",
      body: proposalMessage(d.deals[0].proposal_url),
      media: null,
      meta: null,
      status: "sent",
      channel: "whatsapp",
      created_at: new Date(Date.now() - 11 * 86_400_000).toISOString(),
    };
    return { ...d, conversations: [{ ...d.conversations[0], messages: [sent] }] };
  };
  const asked = [];
  bridgeHolds({
    parts: {
      sheets: {
        ...provided("sheets"),
        openDeal: (a) => {
          asked.push(a);
          return true;
        },
      },
    },
  });
  const open = async (id) => {
    find(draw(), (n) => n.type === "tr" && n.props?.id === `person-${id}`).props.onClick();
    draw();
    await settled();
    return peekOf(draw());
  };
  let peek = await open("wes");
  assert.equal(textOf(byTestId(peek, "pipeline-peek-bar-act")), "Follow up");
  const ask = byTestId(peek, "pipeline-peek-ask");
  const answer = (sheet, id) =>
    find(byTestId(sheet, "pipeline-peek-ask"), (n) => n.type === "button" && n.props?.["data-testid"] === id);
  assert.equal(textOf(byClass(ask, "pipe-deal-ask-q")), "Did Wes say yes?");
  // Its two answers are the yes and the pass, so the caret does not offer them again; the proposal is still a door.
  assert.deepEqual(
    listOf(find(byTestId(peek, "pipeline-peek-bar"), (n) => n.type === Menu)).map((it) =>
      it.divider ? "—" : it.label,
    ),
    [DEAL_ACT_WORDS.edit, "Open the proposal", "—", "Start another proposal"],
  );
  click(answer(peek, "pipeline-peek-ask-yes"));
  assert.deepEqual(asked.at(-1), { personId: "wes", mode: "won", dealId: "d-proposed-11" });
  // They passed: why is asked in the foot's place, the selection's reasons, and the question above steps aside.
  click(answer(peek, "pipeline-peek-ask-no"));
  peek = peekOf(draw());
  assert.equal(byTestId(peek, "pipeline-peek-ask"), null, "nothing asked twice");
  assert.equal(byTestId(peek, "pipeline-peek-bar"), null);
  const pass = byTestId(peek, "pipeline-peek-pass");
  assert.equal(textOf(byClass(pass, "pipe-deal-pass-q")), "Why did Wes pass?");
  assert.deepEqual(
    all(pass, (n) => n.type === "button" && /^pipeline-peek-pass-(?!cancel)/.test(n.props?.["data-testid"] || "")).map(
      textOf,
    ),
    Object.values(DEAL_LOST_REASON_WORDS),
  );
  // Cancel puts the foot back as it was.
  click(find(pass, (n) => n.type === "button" && n.props?.["data-testid"] === "pipeline-peek-pass-cancel"));
  peek = peekOf(draw());
  assert.equal(textOf(byTestId(peek, "pipeline-peek-bar-act")), "Follow up");
  // A reason is one press: the Pipeline's own pass records it (read afresh, at its version).
  click(answer(peek, "pipeline-peek-ask-no"));
  peek = peekOf(draw());
  byTestId(peek, "pipeline-peek-pass-price").props.onClick();
  await until(() => !byTestId(peekOf(draw()), "pipeline-peek-pass"), "the pass answered: the foot is the deal's again");
  assert.deepEqual(
    seen.posted.map((x) => [x.id, x.body.stage, x.body.deal_id, x.body.lost_reason]),
    [["wes", "lost", "d-proposed-11", "price"]],
  );
  // A consultation held: nothing proposed yet, said once under its step, and a proposal is the act.
  peek = await open("hana");
  assert.equal(textOf(byTestId(peek, "pipeline-peek-sub")), "Consultation");
  // Its step says how the visit stands and when, on one line under its name ("Past · Sep 21").
  const held = find(peek, (n) => n.props?.["data-testid"] === "person-deal-step" && n.props["data-at"] === "done");
  assert.match(textOf(byClass(held, "cl-prof-deal-step-day")), /^Past\u00a0· [A-Z][a-z]{2} \d{1,2}$/);
  assert.equal(textOf(byTestId(peek, "pipeline-peek-stand-word")), "No proposal yet");
  click(byTestId(peek, "pipeline-peek-bar-act"));
  assert.deepEqual(asked.at(-1), { personId: "hana", mode: "propose", dealId: null });
  // A consultation ahead: when it is, said once, by the fact under it.
  peek = await open("sara");
  assert.equal(byTestId(peek, "pipeline-peek-stand-word"), null);
  assert.match(textOf(byTestId(peek, "pipeline-peek-next")), /^Coming up · /);
  // A viewer reads the sheet and is offered nothing to press.
  bridgeHolds({ who: { me: { role: "viewer" } } });
  try {
    assert.equal(byTestId(peekOf(draw()), "pipeline-peek-bar"), null);
  } finally {
    bridgeHolds({ who: { me: { role: "owner" } } });
  }
});

test("the sheet reads the person again when People lands or changes (a deal recorded or a step saved is read with it), opens on the tab's copy where there is one, and says a read that failed", async () => {
  const seen = await fresh();
  seen.person = (id) => (id === "nia" ? new Error("no route") : detailOf(seen.rawOf(id)));
  // The tab read them a moment ago: that is the copy the sheet opens on.
  await personDetail("cat");
  let tree = draw();
  await settled();
  seen.reads.length = 0;
  find(tree, (n) => n.type === "tr" && n.props?.id === "person-cat").props.onClick();
  tree = draw();
  // The foot is the card's (what to press reads them): there as the sheet opens, and nothing said of a read.
  assert.ok(byTestId(peekOf(tree), "pipeline-peek-bar"), "the tab's copy: the deal is there as the sheet opens");
  assert.equal(byTestId(peekOf(tree), "pipeline-peek-reading"), null);
  await settled();
  assert.deepEqual(seen.reads, ["cat"], "and the read goes out behind it");
  // The sheets say nothing of their own that reads it (0047): `deal:recorded` gives the focus back to the row and does no more.
  globalThis.window.dispatchEvent({ type: "deal:recorded", detail: { personId: "cat" } });
  globalThis.window.dispatchEvent({ type: "note:saved", detail: { personId: "cat" } });
  await settled();
  assert.deepEqual(seen.reads, ["cat"], "neither a deal's event nor a note's reads the sheet's person again");
  // People landing or changing does: a deal recorded on them or a step set, changed or done on them (the sheet draws
  // their next step) is read with People behind the write, and a teammate's through the live feed.
  globalThis.window.dispatchEvent({ type: "surface:clients" });
  await settled();
  assert.deepEqual(seen.reads, ["cat", "cat"], "People changing reads them again");
  globalThis.window.dispatchEvent({ type: "surface:clients" });
  await settled();
  assert.deepEqual(seen.reads, ["cat", "cat", "cat"], "and again for the next");
  // A read that failed, with nothing held: said, with Retry.
  find(tree, (n) => n.type === "tr" && n.props?.id === "person-nia").props.onClick();
  draw();
  await settled();
  tree = draw();
  const failed = byTestId(peekOf(tree), "pipeline-peek-failed");
  assert.ok(failed, "the house's FailedRead");
  assert.equal(byTestId(peekOf(tree), "pipeline-peek-bar"), null, "nothing to press without the read");
  const retry = find(failed, (n) => n.type === "button" && /again|retry/i.test(textOf(n)));
  assert.ok(retry, "with its Retry");
  click(retry);
  draw();
  await settled();
  assert.deepEqual(seen.reads, ["cat", "cat", "cat", "nia", "nia"]);
});

test("on a desk the rows can be a board: every group a column, the cards, a drop that asks the sheet, a refused one that asks nothing, and the choice kept", async () => {
  const seen = await fresh();
  const asked = [];
  bridgeHolds({
    parts: {
      sheets: {
        ...provided("sheets"),
        openDeal: (ask) => {
          asked.push(ask);
          return true;
        },
      },
    },
  });
  globalThis.localStorage.removeItem("pipeline.view");
  let tree = draw();
  const views = byTestId(withHead(tree), "pipeline-views");
  assert.deepEqual(
    all(views, (n) => n.type === "button").map((n) => [textOf(n), n.props["aria-pressed"]]),
    [
      ["List", true],
      ["Board", false],
    ],
  );
  assert.ok(
    find(tree, (n) => n.type === "table"),
    "the list first",
  );
  click(byTestId(withHead(tree), "pipeline-view-board"));
  tree = draw();
  assert.equal(seen.viewSaves.at(-1).view.layout, "board", "kept in the member's view");
  assert.equal(
    find(tree, (n) => n.type === "table"),
    null,
    "the board in the table's place",
  );
  const board = byTestId(tree, "pipeline-board");
  const cols = all(board, (n) => n.type === "section" && n.props?.["data-group"]);
  assert.deepEqual(
    cols.map((c) => [
      c.props["data-group"],
      textOf(byClass(c, "dtable-group-label")),
      textOf(byClass(c, "tally")),
      all(c, (n) => n.props?.["data-testid"] === "pipeline-card").length,
    ]),
    [
      ["consultations", "Consultations", "2", 2],
      ["proposals", "Proposal out", "2", 2],
      ["clients", "Clients", "1", 1],
      ["closed", "Passed or ended", "2", 0],
    ],
    "every group a column, in order; Passed or ended folded, its head counting for it",
  );
  assert.equal(textOf(byTestId(cols[3], "pipeline-col-toggle")), "Show");
  // A card is the row: its facts, its id for the cursor, a button for a keyboard, and draggable for an owner.
  const wes = find(board, (n) => n.props?.id === "person-wes");
  assert.deepEqual(
    [
      wes.props.role,
      wes.props.draggable,
      textOf(byTestId(wes, "pipe-service")),
      textOf(byTestId(wes, "pipe-value")),
      textOf(byTestId(wes, "pipe-in-stage")),
      textOf(byTestId(wes, "pipe-chip")),
    ],
    ["button", true, "Color correction", "$1,200", "11 d", "Nothing back"],
  );
  wes.props.onKeyDown({ key: "Enter", preventDefault() {} });
  tree = draw();
  assert.equal(textOf(byTestId(peekOf(tree), "pipeline-peek-name")), "Wes", "Enter on a card opens its peek");
  click(byTestId(peekOf(tree), "pipeline-peek-close"));
  tree = draw();
  // Wes into Clients: the column takes the drag, says so, and the drop asks the sheet for a yes.
  const cardOf = (t, id) => find(byTestId(t, "pipeline-board"), (n) => n.props?.id === `person-${id}`);
  const colOf = (t, key) => byTestId(t, `pipeline-col-${key}`);
  cardOf(tree, "wes").props.onDragStart({ dataTransfer: { setData() {} } });
  tree = draw();
  assert.match(cardOf(tree, "wes").props.className, /is-dragging/);
  const over = {
    taken: false,
    dataTransfer: {},
    preventDefault() {
      over.taken = true;
    },
  };
  colOf(tree, "clients").props.onDragOver(over);
  assert.equal(over.taken, true, "a column the card may drop into takes the drag");
  tree = draw();
  assert.match(colOf(tree, "clients").props.className, /is-over/);
  assert.match(colOf(tree, "consultations").props.className, /is-refused/, "one it may not dims");
  assert.doesNotMatch(colOf(tree, "proposals").props.className, /is-refused/, "its own column is neither");
  colOf(tree, "clients").props.onDrop({ preventDefault() {} });
  assert.deepEqual(asked, [{ personId: "wes", mode: "won", dealId: "d-proposed-11" }], "the sheet, for a yes");
  tree = draw();
  assert.equal(
    find(tree, (n) => /is-over|is-dragging/.test(n.props?.className || "")),
    null,
    "the drag is over",
  );
  // Wes into Consultations: the column refuses the drag, and the drop asks nothing.
  cardOf(tree, "wes").props.onDragStart({ dataTransfer: { setData() {} } });
  tree = draw();
  const refused = {
    taken: false,
    dataTransfer: {},
    preventDefault() {
      refused.taken = true;
    },
  };
  colOf(tree, "consultations").props.onDragOver(refused);
  assert.equal(refused.taken, false);
  colOf(tree, "consultations").props.onDrop({ preventDefault() {} });
  assert.equal(asked.length, 1, "nothing asked");
  // A pass proposed again, a client ended: each its own mode.
  tree = draw();
  click(byTestId(colOf(tree, "closed"), "pipeline-col-toggle"));
  tree = draw();
  cardOf(tree, "dan").props.onDragStart({ dataTransfer: { setData() {} } });
  tree = draw();
  colOf(tree, "proposals").props.onDrop({ preventDefault() {} });
  assert.deepEqual(asked.at(-1), { personId: "dan", mode: "again", dealId: "d-lost-8" });
  tree = draw();
  cardOf(tree, "cat").props.onDragStart({ dataTransfer: { setData() {} } });
  tree = draw();
  colOf(tree, "closed").props.onDrop({ preventDefault() {} });
  assert.deepEqual(asked.at(-1), { personId: "cat", mode: "ended", dealId: "d-won-12" });
  // Back to the list.
  tree = draw();
  click(byTestId(withHead(tree), "pipeline-view-list"));
  tree = draw();
  assert.ok(find(tree, (n) => n.type === "table"));
  // Saves go one at a time (clients-a.jsx plViewSaver): the list waits for the board's to land.
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(seen.viewSaves.at(-1).view.layout, "list");
});
