/**
 * The card's settings, one line each with Change under its row, and a person's page opened as quickly as the tab
 * can make it: read ahead from People, never the name first and the rest after, a kept copy said for what it is.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { all, byTestId, find, press, textOf } from "../../_stub-react.mjs";
import {
  D,
  H,
  NEXT,
  NOW,
  SubTabs,
  VISITS,
  ZONE,
  cardOf,
  dealRow,
  detail,
  holdRead,
  iso,
  movesOf,
  newTree,
  openedRow,
  pageFor,
  peoplePage,
  personDetail,
  personReads,
  profile,
  recFolds,
  refused,
  row,
  serve,
  setSurfaceValue,
  settle,
  sheetAsks,
  staleReadCaches,
  surfaceValue,
  toPersonVM,
  took,
  withDeals,
  world,
} from "./_person-page.mjs";
import { bridgeHolds, whoIsLooking } from "../../shell/_bridge-holds.mjs";

/* ------------------------------ the card's settings, one line each (canvas A, step 2) ------------------------------ */

test("the card's settings are one line each, and Change opens the editor under its row: the record kit's row and fold", async () => {
  recFolds.reset();
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  const draw = await profile(vm);
  let tree = draw();
  const cls = (n) => String(n.props?.className || "");
  const settings = byTestId(tree, "person-settings");
  const rows = all(settings, (n) => cls(n).split(" ").includes("rec-row"));
  assert.deepEqual(
    rows.map((r) => textOf(find(r, (n) => cls(n) === "rec-row-key"))),
    ["AI", "Messages", "Offers & news"],
    "REGRESSION: three stacked controls with a paragraph under each were 1,249px of rail (canvas A: the key over its answer)",
  );
  assert.ok(
    rows.every((r) => cls(r).split(" ").includes("rec-row-stacked")),
    "each row stacks its key over its answer: the rail's width squeezed them a letter a line",
  );
  assert.deepEqual(
    rows.slice(1, 3).map((r) => textOf(find(r, (n) => cls(n) === "rec-row-value"))),
    [vm.consent.answerLabel, vm.consent.marketingLabel],
    "each answer in its control's own words, from contracts",
  );
  // Closed, each editor is on the page and hidden, whole; Change opens it and the row gives it its place.
  assert.equal(byTestId(tree, "rec-fold-person-visit").props.hidden, true);
  press(byTestId(tree, "rec-row-act-person-visit"));
  tree = draw();
  const fold = byTestId(tree, "rec-fold-person-visit");
  assert.equal(fold.props["data-open"], "true", "Change opens the fold");
  assert.equal(byTestId(tree, "rec-row-person-visit"), null, "and the row gives it its place");
  assert.ok(byTestId(fold, "consent-control"), "the ask is inside it");
  assert.equal(byTestId(fold, "rec-fold-save-person-visit"), null, "an answer is recorded as it is chosen: no Save");
  press(byTestId(tree, "rec-fold-close-person-visit"));
  tree = draw();
  assert.ok(byTestId(tree, "rec-row-person-visit"), "Close puts the row back");

  // Someone who may only read sees the answers and no Change.
  const me = whoIsLooking().me;
  bridgeHolds({ who: { me: { role: "viewer" } } });
  try {
    tree = (await profile(vm))();
    assert.deepEqual(
      all(byTestId(tree, "person-settings"), (n) => /^rec-row-act-/.test(String(n.props?.["data-testid"] || ""))),
      [],
      "nothing to press for a viewer",
    );
  } finally {
    bridgeHolds({ who: { me: me } });
  }
});

test("REGRESSION: on a phone a deal's row folds open as a desk's does -- its press opened the deal sheet to edit the proposal, which a client's deal cannot take (the sheet said only that the deal had moved on), and its moves and next step were out of reach (census, 13 Oct 2026)", async () => {
  recFolds.reset();
  const asked = sheetAsks();
  const mm = globalThis.window.matchMedia;
  globalThis.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  try {
    const client = withDeals([dealRow({ stage: "won", decided_at: iso(2 * D), per: "month", amount_cents: 250_000 })]);
    let tree = await openedRow(client);
    assert.deepEqual(asked, [], "the row opens no sheet");
    assert.equal(byTestId(cardOf(tree), "person-deal-title").props["aria-expanded"], true, "it folds open");
    assert.deepEqual(movesOf(tree).map(textOf), ["End the engagement"], "a client's one move, under its row");
    tree = await openedRow(withDeals([dealRow()]));
    assert.deepEqual(asked, []);
    const acts = movesOf(tree).map(textOf);
    assert.deepEqual(
      acts,
      ["Mark as client", "Mark as passed"],
      "a proposal's moves, which the sheet's edit never offered",
    );
  } finally {
    globalThis.window.matchMedia = mm;
    delete globalThis.window.openDealSheet;
  }
});

test("REGRESSION: on a phone a row stays in the card behind its sheet -- taken out, the card was a row shorter under the wash, and everything under it moved up and back down", async () => {
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  const mm = globalThis.window.matchMedia;
  // The record kit's phone (record.css, 900px and under): a fold is a sheet over the page.
  globalThis.window.matchMedia = (q) => ({ matches: /900px/.test(q), addEventListener() {}, removeEventListener() {} });
  try {
    const draw = await profile(vm);
    press(byTestId(draw(), "rec-row-act-person-visit"));
    const tree = draw();
    const sheet = byTestId(tree, "rec-fold-person-visit");
    assert.equal(sheet.props.role, "dialog", "on a phone the editor is a sheet");
    const behind = find(tree, (n) => n.props?.className === "rec-fold-behind");
    assert.ok(behind, "the row it opened from is drawn in the card behind it");
    assert.ok(byTestId(behind, "rec-row-person-visit"), "the same row, where it stood");
    assert.equal(behind.props["aria-hidden"], "true", "a picture of the row: nothing in it can be pressed or read out");
  } finally {
    globalThis.window.matchMedia = mm;
  }
});

test("REGRESSION: a History filter holds still -- on a phone a shorter list made the page shorter, and the strip jumped 328px down the screen under the thumb", async () => {
  const PAST = { ...NEXT, id: "b0:1", start: iso(10 * D), end: iso(10 * D - 2 * H) };
  const vm = toPersonVM(detail({ visits: { ...VISITS, all: [PAST, NEXT] } }), ZONE, new Date(NOW));
  const draw = await profile(vm, "history");
  const held = [];
  const hold = globalThis.window.holdStill;
  globalThis.window.holdStill = (control, change) => {
    held.push(control);
    change();
  };
  try {
    // History's filters, not the page's tabs beside them (0052).
    find(
      draw(),
      (n) => n.type === SubTabs && n.props.tabs.some((x) => x.testid === "timeline-filter-all"),
    ).props.onSelect("visits");
    assert.equal(held.length, 1, "the switch runs through holdStill, from the tab pressed");
    const timeline = find(draw(), (n) => typeof n.type === "function" && n.type.name === "PersonTimeline");
    assert.equal(timeline.props.filter, "visits", "and History shows the visits");
  } finally {
    globalThis.window.holdStill = hold;
  }
});

test("History names who added a person, by the door that did: the calendar, the lead finder, or you -- every one read Calendar, and a lead read Added by hand", async () => {
  const added = (source, title = null) =>
    toPersonVM(detail({ added: { at: iso(8 * D), source, title } }), ZONE, new Date(NOW));
  const entry = (vm) => {
    const e = vm.timeline.find((i) => i.id === "added");
    return e && [e.who, e.text];
  };
  assert.deepEqual(entry(added("calendar", "Balayage")), ["Calendar", "Added from the calendar (Balayage)"]);
  assert.deepEqual(entry(added("calendar")), ["Calendar", "Added from the calendar"]);
  assert.deepEqual(
    entry(added("lead")),
    ["Leads", "Added from a lead you found"],
    "REGRESSION: Calendar · Added by hand, for a lead the finder found",
  );
  assert.deepEqual(entry(added("manual")), ["You", "Added by hand"], "REGRESSION: Calendar · Added by hand");
  // Any other source POST contacts was given is a hand, as people_list's came_from reads it (00138).
  assert.deepEqual(entry(added("walk_in")), ["You", "Added by hand"]);
  // A client list the owner brought in is theirs, from a file: People's column says Imported, and so does this.
  assert.deepEqual(
    entry(added("import")),
    ["You", "Added from a spreadsheet"],
    "REGRESSION: Imported on People, Added by hand here",
  );
  // About says the same door in the same words.
  for (const [source, how] of [
    ["calendar", "from the calendar"],
    ["lead", "from a lead you found"],
    ["import", "from a spreadsheet"],
    ["manual", "by hand"],
  ])
    assert.ok(
      added(source)
        .about.find((a) => a.k === "Added")
        .v.endsWith(`· ${how}`),
      source,
    );
  // The page draws who above what: "You", then "Added by hand".
  const draw = await profile(added("manual"), "history");
  const row = find(
    draw(),
    (n) =>
      String(n.props?.className || "").includes("cl-tl-row") &&
      textOf(find(n, (m) => String(m.props?.className || "").startsWith("cl-tl-text"))) === "Added by hand",
  );
  assert.ok(row, "the added row is on the page");
  assert.equal(textOf(find(row, (m) => m.props?.className === "cl-tl-who")), "You", "REGRESSION: Calendar");
});

test("a People row reads its person as a pointer reaches it or the cursor lands on it, so the page opens on what the tab holds", async (t) => {
  // The courier to read ahead (people-detail.ts warmPerson) was called by the retired demo page's rows alone: every
  // open from People waited on the wire behind "Loading…". Two people, so a read that one arrival started is not
  // taken for the other's (the client shares an identical read in flight: warming twice costs one request). The tab
  // read both before and a write since has made those copies old: the page's own read ahead leaves what the tab holds
  // be, and a copy from before is read again as a pointer reaches it.
  const draw = await peoplePage([
    row({ id: "w1", display_name: "Wren One" }),
    row({ id: "w2", display_name: "Wren Two", phone_e164: "+17865550182" }),
  ]);
  const reads = personReads(t);
  await personDetail("w1");
  await personDetail("w2");
  staleReadCaches();
  reads.length = 0;
  const tree = draw();
  await settle();
  assert.deepEqual(reads, [], "the rows on screen are read ahead only where the tab holds nothing of them");
  find(tree, (n) => n.type === "tr" && n.props?.id === "person-w1").props.onPointerEnter();
  await settle();
  assert.deepEqual(reads, ["w1"], "a pointer arriving");
  find(tree, (n) => n.type === "tr" && n.props?.id === "person-w2").props.onFocus();
  await settle();
  assert.deepEqual(reads, ["w1", "w2"], "and the cursor landing");
});

test("People reads the people it shows ahead, so a press opens a page the tab already holds", async (t) => {
  const draw = await peoplePage([
    row({ id: "a1", display_name: "Ana One" }),
    row({ id: "a2", display_name: "Ana Two", phone_e164: "+17865550182" }),
  ]);
  const reads = personReads(t);
  draw();
  await settle();
  assert.deepEqual([...reads].sort(), ["a1", "a2"], "the rows on screen, read by the courier");
});

test("a person not read yet is nothing of theirs until their whole page is in: never the name first and the rest after", async () => {
  // Ruben, 24 Sep 2026: "the person name the header part still loads first for a split second". The page drew their
  // People row's name and number over Reading…, and the rest landed under it a moment later.
  await peoplePage([row()]);
  // Their page is on its way: the wire has it, and holds it until the test lets it go.
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  await newTree();
  serve(vm);
  const hold = holdRead("p1");
  pageFor("p1");
  let tree = pageFor("p1");
  const reading = byTestId(tree, "person-reading");
  assert.ok(reading, "the pane any page on its way draws");
  assert.equal(reading.props["aria-busy"], "true");
  assert.ok(String(reading.props.className).includes("route-reading"), "Reading…, after the standard's beat");
  assert.equal(
    find(tree, (n) => n.type === "h1"),
    null,
    "REGRESSION: their name drawn before their page",
  );
  assert.ok(!textOf(tree).includes("Daniela Reyes"), "nothing of theirs at all");
  assert.ok(!textOf(tree).includes("Loading…"), "REGRESSION: a bare Loading… at once");

  // Their page lands whole: the head, where they stand and the Overview (0052) in the same draw.
  hold.release();
  await settle();
  tree = pageFor("p1");
  assert.ok(byTestId(tree, "person-now"), "where they stand");
  assert.ok(
    find(tree, (n) => n.type === "h1"),
    "their name",
  );
  assert.ok(
    find(tree, (n) => typeof n.type === "function" && n.type.name === "StoryParts"),
    "and their story, together",
  );
  assert.equal(byTestId(tree, "person-reading"), null);
});

test("a kept copy whose read again failed says so, quietly, and stays: never taken for now", async () => {
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  // The tab read them earlier and keeps the copy; the read it makes now fails.
  await newTree();
  serve(vm);
  await personDetail(vm.id);
  world.answers[`GET /api/v1/contacts/${vm.id}`] = () => refused(500, "Couldn't be read right now", "internal");
  pageFor(vm.id);
  await settle();
  const tree = pageFor(vm.id);
  assert.ok(byTestId(tree, "person-now"), "the page they already had");
  const stale = byTestId(tree, "person-stale");
  assert.ok(stale, "REGRESSION: a copy from before the reload was shown as current, the failed read unsaid");
  assert.match(textOf(stale), /from earlier/);
});

test("a person this tab holds is the first draw, not the second, and is read again behind it", async () => {
  // The tab keeps the people it opened (people-detail.ts), so a reload has them before the first frame. Seeded in the
  // load effect, the page drew one frame of the head alone before the page it already had.
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  await newTree();
  serve(vm);
  await personDetail(vm.id);
  const reads = () => took("GET", `/api/v1/contacts/${vm.id}`).length;
  const held = reads();
  const first = pageFor(vm.id);
  assert.ok(byTestId(first, "person-now"), "REGRESSION: the first frame was the head alone");
  assert.equal(byTestId(first, "person-known"), null, "and never the head over Reading…");
  await settle();
  assert.equal(reads() - held, 1, "what the tab held is read again behind the paint");
});

test("on a real workspace a person's page is read from the workspace before People's rows land: never the sample a demo draws", async () => {
  // A person's page no longer waits for the list (surface-registry.ts routeSurfaceFor): the workspace is real, and the
  // page reads its own person. Asked for a person the sample also has (c-aisha, the mockup's own id), it is the wire that
  // answers, and the wire says who is in the workspace.
  const keep = surfaceValue("people");
  setSurfaceValue("people", undefined);
  try {
    await newTree();
    const hold = holdRead("c-aisha");
    const tree = pageFor("c-aisha");
    assert.ok(byTestId(tree, "person-reading"), "the real page, reading their record, never the sample");
    assert.equal(took("GET", "/api/v1/contacts/c-aisha").length, 1, "and it asked the workspace for the person");
    hold.release(null);
    await settle();
    const gone = pageFor("c-aisha");
    assert.match(textOf(gone), /This person is not in your workspace/);
    assert.ok(!textOf(gone).includes("Aisha"), "nothing of the sample's person");
  } finally {
    setSurfaceValue("people", keep);
  }
});
