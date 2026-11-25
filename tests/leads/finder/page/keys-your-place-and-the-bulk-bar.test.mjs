/**
 * The finder's keys, the lead that is open and its address, the page keeping your place, the bulk bar, the words,
 * and the classes with their acts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { until } from "../../../shared/_until.mjs";
import { LEAD_WORDS, toPersonRowVM } from "@chanlytics/contracts";
import { keysDrawn } from "../../../_keys.mjs";
import {
  ENTER_ON_ROW,
  FIRST_DAY,
  ID_DTOS,
  ID_ROWS,
  Icon,
  Menu,
  NOW,
  PipelineScope,
  ROW_HELD,
  SEARCH_A,
  SEARCH_B,
  SUGGESTIONS,
  TZ,
  UA,
  UB,
  UC,
  addressed,
  all,
  asks,
  byTestId,
  click,
  comeBack,
  cursorRow,
  draw,
  find,
  flashes,
  frames,
  fresh,
  lastWrite,
  leadRow,
  leadsView,
  listeners,
  mapToggle,
  member,
  menuOf,
  menus,
  names,
  openSheet,
  opened,
  pageReads,
  paned,
  panels,
  peeks,
  press,
  quiesce,
  reads,
  rowOf,
  searchBox,
  seen,
  setCells,
  setOverlayOpen,
  setSurfaceValue,
  settle,
  standingSaid,
  surfaceValue,
  tableRowsOf,
  textOf,
  toastAfter,
  walk,
  went,
  wordsRead,
  writes,
} from "./_page.mjs";

test("the keys: J and K move, Enter peeks, x selects, C calls, F opens Ask; one listener before and after the scope draws", async () => {
  await fresh();
  draw();
  assert.equal(listeners.keydown?.size, 1, "one listener for the page's life");
  const [only] = listeners.keydown;
  draw();
  draw();
  assert.equal(listeners.keydown.size, 1);
  assert.ok(listeners.keydown.has(only), "a draw does not put a new listener in its place");
  press("j");
  assert.equal(cursorRow(draw()), "lead-l1");
  press("j");
  assert.equal(cursorRow(draw()), "lead-l2");
  press("k");
  assert.equal(cursorRow(draw()), "lead-l1");
  assert.equal(press("x"), true);
  assert.match(textOf(byTestId(draw(), "leads-bulk-bar")), /1 selected/, "x selects the lead under the cursor");
  assert.equal(press("Enter", { tagName: "TR", isContentEditable: false, closest: () => null }), true);
  assert.ok(byTestId(draw(), "leads-bulk-bar"), "the selection is still there");
  assert.equal(peeks.at(-1).vm.id, "l1", "Enter peeks the lead under the cursor, and never opens a profile");
  assert.deepEqual(opened, []);
  assert.equal(press("c"), true);
  assert.equal(
    globalThis.window.location.href,
    "tel:+15125550101",
    "C dials the lead under the cursor from the owner's own phone",
  );
  assert.equal(press("f"), true);
  assert.equal(asks.at(-1), "open", "F opens Ask as ⌘K does, the finder on this page (spec F7)");
  assert.equal(panels.length, 0, "and no panel of the page's own: nothing on it composes");
  // The button is the same door, wearing the three's mark; its click event is not words.
  const door = byTestId(seen(draw()), "leads-find");
  assert.ok(
    find(door, (n) => n.type === Icon && n.props?.name === "three"),
    "the mark",
  );
  click(door);
  assert.equal(asks.at(-1), "open", "a click event is not words: the plain open, nothing seeded");
});

test("on a desk Find leads is the page's act, at the right of the strip over the list, and not in the controls row", async () => {
  await fresh();
  const tree = draw();
  assert.ok(byTestId(standingSaid()?.act, "leads-find"), "said to the frame's head, which draws it beside the strip");
  assert.equal(
    byTestId(tree, "leads-find"),
    null,
    "REGRESSION: Find leads stood in the controls row, inside the list's pane",
  );
  assert.match(
    String(byTestId(standingSaid().act, "leads-find").props.className),
    /\bbtn-primary\b/,
    "the page's accent",
  );
});

test("the first day's door is a button of its own, never the setup's find step (fr-find, a grid)", async () => {
  await fresh({ leads: { ...FIRST_DAY, suggestions: SUGGESTIONS } });
  const door = byTestId(byTestId(draw(), "leads-first-day"), "leads-first-find");
  assert.ok(door, "the first day's door");
  assert.ok(
    !String(door.props.className).split(/\s+/).includes("fr-find"),
    "REGRESSION: the setup's grid stood the glyph over the words, outside the button",
  );
});

test("REGRESSION: Leads draws no key -- its search box drew a / and Find leads an F, beside the ? sheet that lists them", async () => {
  await fresh();
  const tree = draw();
  assert.equal(textOf(byTestId(seen(tree), "leads-find")).trim(), "Find leads");
  assert.deepEqual(keysDrawn(seen(tree)), []);
  assert.equal(press("f"), true, "F still finds");
  assert.equal(asks.at(-1), "open");
});

// The Columns menu is the kit's, which keeps its own Esc while it is open (PL_OVERLAY): no step of the page's order.
test("Esc closes the peek, then the plan panel, then the selection -- one press each, in that order", async () => {
  await fresh();
  byTestId(draw(), "select-all").props.onChange();
  draw();
  press("j");
  draw();
  press("Enter", { tagName: "TR", isContentEditable: false, closest: () => null });
  draw();
  // The plan panel's door on the page: a kept search's Search again, changed (F is Ask's, spec F7).
  menuOf("Personal trainers · Austin")
    .items.find((i) => i.label === "Search again, changed")
    .onClick();
  // Everything of the page's own that can be open at once, opened: the peek, the plan panel and a selection.
  draw();
  const drawn = { peeks: peeks.length, panels: panels.length };
  assert.equal(peeks.at(-1).vm.id, "l1", "the peek is open");
  assert.equal(panels.at(-1).open, true, "and the plan panel");
  assert.equal(press("j"), false, "the plan panel holds every key while it is open");
  assert.equal(press("Escape"), true);
  draw();
  assert.equal(peeks.length, drawn.peeks, "the peek went first: it is not drawn any more");
  assert.equal(panels.length, drawn.panels + 1, "and the plan panel is still open");
  assert.equal(press("Escape"), true);
  const tree = draw();
  assert.equal(panels.length, drawn.panels + 1, "the plan panel went second");
  assert.match(textOf(byTestId(tree, "leads-bulk-bar")), /5 selected/, "and the selection is still there");
  assert.equal(press("Escape"), true);
  assert.equal(byTestId(draw(), "leads-bulk-bar"), null, "the selection goes last");
});

test("the peek is the page's own overlay: J and K keep walking the rows behind it, and a menu over the page still silences them", async () => {
  await fresh();
  draw();
  press("j");
  draw();
  press("Enter", { tagName: "TR", isContentEditable: false, closest: () => null });
  draw();
  // The peek is a dialog with .pl-peek, which PL_OVERLAY leaves out.
  setOverlayOpen({ role: "dialog", className: "pl-peek" });
  assert.equal(press("j"), true, "the rows walk on under the peek");
  assert.equal(cursorRow(draw()), "lead-l2");
  draw();
  assert.equal(peeks.at(-1).vm.id, "l2", "and the peek follows the cursor while it is just showing the lead");
  // A question or a draft holds it on its own lead (leadPeekFollows, Task 12). The question is armed the way the
  // owner arms it -- C dials the lead under the cursor from their own phone -- and asked when the tab is theirs
  // again (leadArmOnReturn, Task 13), never while they are away.
  press("c");
  draw();
  assert.equal(globalThis.window.location.href, "tel:+15125550102", "C dialled the lead the peek is showing");
  globalThis.window.dispatchEvent({ type: "focus" });
  draw();
  press("j");
  draw();
  assert.equal(peeks.at(-1).vm.id, "l2", "the peek asked something, so it stays on the lead it asked about");
  assert.equal(press("Escape"), true);
  draw();
  assert.equal(peeks.at(-1).armed, null, "and Esc backs out the question first, not the peek");
  setOverlayOpen({ role: "menu" });
  assert.equal(press("j"), false, "anything else open over the page has the keys");
});

// PR 9: the peek drew only a lead on a page loaded, so a link to a lead further down -- or one Ask named -- opened on
// nothing. The surface reads it on its own now (leads-bridge.test.mjs); the page draws what it answers, keeps the
// address, and its acts find the lead where the surface holds it (`peeked`).
test("a lead the address names that is on no page loaded opens once the bridge has read it, keeps its address, and its acts act on it", async () => {
  const FAR = "1ead0000-0000-4000-8000-0000000000ff";
  const far = leadRow({
    id: FAR,
    search_id: SEARCH_B,
    place_id: "ChIJfixture00ff",
    business_name: "Far Down The List",
  });
  // GET leads/[id] answers it: the surface reads it on its own, since no page loaded holds it.
  const { navs, at, openPeek } = await addressed({ one: { [FAR]: far } });
  at(`leads:p-${FAR}`);
  at(`leads:p-${FAR}`);
  assert.equal(openPeek(), null, "nothing drawn while its read is out, and never another lead in its place");
  assert.deepEqual(
    reads.filter((r) => r.startsWith(`/api/v1/leads/${FAR}`)),
    [`/api/v1/leads/${FAR}?workspace=salon`],
    "asked once, however many draws pass before it answers",
  );
  await quiesce();
  at(`leads:p-${FAR}`);
  assert.equal(openPeek().vm.id, FAR, "drawn once it lands");
  assert.deepEqual(navs, [], "the address is left as the link said it");
  openPeek().onKeep(FAR);
  await settle();
  assert.deepEqual(
    lastWrite(),
    { key: `POST /api/v1/leads/${FAR}/keep`, body: { search_id: SEARCH_B } },
    "Keep from its peek names its own search: the page found the lead beside the rows",
  );
});

test("the page hands the peek its ⋯ as contracts says for the member: Erase for the owner, which closes the lead through the one door; nothing for an operator (PR 9)", async () => {
  const { at, openPeek } = await addressed();
  at(`leads:p-${UA}`);
  at(`leads:p-${UA}`);
  assert.deepEqual(
    openPeek().menu.map((m) => [m.id, m.label]),
    [["erase", LEAD_WORDS.erase.act]],
    "the owner's peek offers Erase",
  );
  openPeek().onEraseAsk();
  at(`leads:p-${UA}`);
  assert.equal(openPeek().mode, "erase", "asked in the peek first");
  await openPeek().onErase();
  at(`leads:p-${UA}`);
  assert.deepEqual(lastWrite(), { key: `DELETE /api/v1/leads/${UA}` });
  assert.equal(flashes.at(-1).msg, LEAD_WORDS.erase.done(ID_ROWS[0].name), "a toast says it is gone");
  await fresh({ leads: { rows: ID_DTOS }, role: "operator" });
  draw({ leadsRoute: `leads:p-${UA}` });
  draw({ leadsRoute: `leads:p-${UA}` });
  assert.deepEqual(peeks.at(-1).menu, [], "an operator's peek is offered no ⋯: the door is the owner's");
});

test("the lead that is open is in the address: opening pushes it, the cursor walking the peek on replaces it, and closing goes back to the entry the opening made", async () => {
  const { navs, backs, at } = await addressed();
  at("leads");
  press("j");
  at("leads");
  press("Enter", ENTER_ON_ROW);
  at("leads");
  assert.deepEqual(
    navs,
    [[`clients/leads:p-${UA}`, "push"]],
    "an entry of its own, so Back closes the lead instead of leaving Leads",
  );
  at("leads");
  assert.equal(navs.length, 1, "said once, however many draws pass before the address answers");
  at(`leads:p-${UA}`);
  assert.equal(navs.length, 1, "and the address answering is not news");
  press("j");
  at(`leads:p-${UA}`);
  at(`leads:p-${UA}`);
  assert.deepEqual(
    navs.at(-1),
    [`clients/leads:p-${UB}`, "replace"],
    "walking on is the same place said more exactly: Back must not replay every lead passed",
  );
  at(`leads:p-${UB}`);
  const drawn = peeks.length;
  assert.equal(press("Escape"), true);
  at(`leads:p-${UB}`);
  assert.deepEqual(
    [backs.length, navs.length],
    [1, 2],
    "closing goes back to the entry the opening made, and writes nothing over it",
  );
  at("leads");
  at("leads");
  assert.deepEqual(
    [backs.length, navs.length, peeks.length > drawn + 1],
    [1, 2, false],
    "and the address answering that is not news either",
  );
});

test("the address opens the lead: a refresh, a link or Forward draws the peek, Back closes it, and a lead that came with the address closes by replacing", async () => {
  const { navs, backs, at, openPeek } = await addressed();
  at(`leads:p-${UB}`);
  at(`leads:p-${UB}`);
  assert.equal(openPeek().vm.id, UB, "the lead the address names is open, with nothing pressed");
  assert.deepEqual(navs, [], "and the page says nothing the address already says");
  // The draw that hears the address still holds the lead it had; the one after it is the page having followed.
  at("leads");
  const drawn = peeks.length;
  at("leads");
  assert.equal(peeks.length, drawn, "Back took the lead off the address, and the peek went with it");
  at(`leads:p-${UC}`);
  at(`leads:p-${UC}`);
  assert.equal(openPeek().vm.id, UC, "Forward, or another link, opens that one");
  assert.equal(press("Escape"), true);
  at(`leads:p-${UC}`);
  assert.deepEqual(
    [navs, backs.length],
    [[["clients/leads", "replace"]], 0],
    "no entry of the page's own to go back to: going back would leave Leads",
  );
});

test("a lead opened over a view is not a new view: nothing is read again, the selection stays, and a rail pick closes the lead rather than carrying it along", async () => {
  const { navs, at } = await addressed();
  byTestId(at("leads"), "select-all").props.onChange();
  at("leads");
  press("j");
  at("leads");
  press("Enter", ENTER_ON_ROW);
  at("leads");
  at(`leads:p-${UA}`);
  const tree = at(`leads:p-${UA}`);
  assert.equal(
    pageReads().length,
    0,
    "nothing read for the view (held since the last change), however many leads are opened over it",
  );
  assert.match(textOf(byTestId(tree, "leads-bulk-bar")), /3 selected/, "and the selection is still there");
  const said = navs.length;
  at(`leads:s-${SEARCH_A}`);
  const drawn = peeks.length;
  at(`leads:s-${SEARCH_A}`);
  assert.equal(peeks.length, drawn, "the view changed under the lead, so the lead is closed");
  assert.equal(
    byTestId(draw({ leadsRoute: `leads:s-${SEARCH_A}` }), "leads-bulk-bar"),
    null,
    "and a selection never outlives its view",
  );
  assert.equal(navs.length, said, "and the old view's lead is not written onto the new view's address");
  assert.equal(pageReads().length, 1, "the new view is read, once");
});

test("the search box's words, the row the cursor was on and the map come back with the view: after a refresh, and after leaving and coming back", async () => {
  await fresh();
  let tree = draw();
  searchBox(tree).props.onChange({ target: { value: "strength" } });
  draw();
  await wordsRead("strength");
  draw();
  press("j");
  draw();
  press("j");
  tree = draw();
  assert.deepEqual([names(tree), cursorRow(tree)], [["Zilker Strength Lab", "Lamar Strength Co."], "lead-l3"]);
  tree = comeBack();
  assert.equal(searchBox(tree).props.value, "strength", "the words are in the box again");
  await wordsRead("strength");
  tree = draw();
  assert.deepEqual(names(tree), ["Zilker Strength Lab", "Lamar Strength Co."], "and the rows are the ones they found");
  assert.equal(cursorRow(tree), "lead-l3", "the cursor is on the row it was on");
  // The map stands where the table stood, so it is its own trip: left open, it is open on the way back.
  click(mapToggle());
  draw();
  tree = comeBack();
  assert.ok(byTestId(tree, "lead-map"), "the map is open, as it was left");
  assert.equal(searchBox(tree).props.value, "strength", "with the words still in the box");
});

test("REGRESSION: the list is put back only once the rows on screen are the ones the view's own words leave -- put back a draw sooner, over every row, the browser re-anchored it as the words shrank the list (500 became 122 on production)", async () => {
  let drawing = 0;
  const putBack = [];
  const table = {
    scrollHeight: 6000,
    clientHeight: 600,
    top: 0,
    get scrollTop() {
      return this.top;
    },
    set scrollTop(v) {
      this.top = v;
      putBack.push({ to: v, duringDraw: drawing });
    },
  };
  // The shared pane (paned, below the place's tests): a scroll reaches every capture listener the pane has, as a
  // browser delivers it. This test picked "the" listener by its place in a list, and the pane has two.
  const { mount, scrolls } = await paned(table);
  const mounted = () => {
    putBack.length = 0;
    return mount(undefined, (n) => {
      drawing = n;
    });
  };
  const settled = () => new Promise((r) => setTimeout(r, 260));
  let tree = mounted();
  searchBox(tree).props.onChange({ target: { value: "strength" } });
  draw();
  // The words are a read (00500): the list scrolled is the one they found.
  await wordsRead("strength");
  table.top = 500;
  scrolls(table);
  await settled();
  tree = mounted();
  assert.equal(searchBox(tree).props.value, "strength");
  assert.deepEqual(
    putBack,
    [{ to: 500, duringDraw: 2 }],
    "after the draw that put the words back, not during the one that still drew every row",
  );
  // A view with no words of its own has nothing to wait for.
  searchBox(tree).props.onChange({ target: { value: "" } });
  draw();
  await wordsRead("");
  table.top = 300;
  scrolls(table);
  await settled();
  mounted();
  assert.deepEqual(putBack, [{ to: 300, duringDraw: 1 }]);
});

test("a cursor that came back with the view marks its row and takes nothing: not the focus, and not the scroll the list was just put back to", async () => {
  await fresh();
  const took = [];
  const row = { focus: () => took.push("focus"), scrollIntoView: () => took.push("scroll"), contains: () => false };
  const keep = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) => (/^lead-/.test(id) ? row : null);
  try {
    draw();
    press("j");
    draw();
    assert.deepEqual(
      took,
      ["focus", "scroll"],
      "a key that moves the cursor takes focus to its row and keeps it in sight, as ever",
    );
    took.length = 0;
    const tree = comeBack();
    assert.equal(cursorRow(tree), "lead-l1", "the row is marked");
    assert.deepEqual(
      took,
      [],
      "REGRESSION: the row's scrollIntoView ran after the list was put back, and moved it 37px on (seen in a browser)",
    );
    press("j");
    draw();
    assert.deepEqual(took, ["focus", "scroll"], "and the next key moves on from it");
  } finally {
    globalThis.document.getElementById = keep;
  }
});

test("each view keeps its own place: what was typed over one search is not the next one's, and is there again on the way back", async () => {
  await fresh();
  const at = (route) => {
    draw({ leadsRoute: route });
    return draw({ leadsRoute: route });
  };
  searchBox(at("leads")).props.onChange({ target: { value: "lamar" } });
  at("leads");
  let tree = at(`leads:s-${SEARCH_A}`);
  assert.equal(
    searchBox(tree).props.value,
    "",
    "a search opened from the rail starts with an empty box: the page stayed, its words did not follow",
  );
  assert.equal(names(tree).length, 5);
  searchBox(tree).props.onChange({ target: { value: "zilker" } });
  at(`leads:s-${SEARCH_A}`);
  assert.equal(searchBox(at("leads")).props.value, "lamar", "back on all leads, with what was typed there");
  assert.equal(searchBox(at(`leads:s-${SEARCH_A}`)).props.value, "zilker", "and the search has its own");
});

test("a view starts clean of the view before it: its fit filter and its open map do not follow the owner down the rail", async () => {
  await fresh();
  // The surface holds the search's view already: the page opens on it.
  await leadsView({ searchId: SEARCH_A });
  const at = (route) => {
    draw({ leadsRoute: route });
    return draw({ leadsRoute: route });
  };
  at(`leads:s-${SEARCH_A}`);
  click(mapToggle());
  let tree = at(`leads:s-${SEARCH_A}`);
  assert.ok(byTestId(tree, "lead-map"));
  tree = at("leads:l-ready");
  assert.equal(byTestId(tree, "lead-map"), null, "the list picked next draws its table");
  assert.equal(searchBox(tree).props.value, "");
});

test("the list is scrolled back to where it was once the view's rows are the ones on screen -- never over the rows of the view before", async () => {
  // A desktop: the rows overflow the table's own box inside the pane, and that is the box that scrolls.
  const table = { scrollTop: 0, scrollHeight: 6000, clientHeight: 600 };
  const { mount: mountWithPane, scrolls } = await paned(table);
  mountWithPane();
  table.scrollTop = 1380;
  scrolls(table);
  await new Promise((r) => setTimeout(r, 260));
  table.scrollTop = 0;
  mountWithPane();
  assert.equal(table.scrollTop, 1380, "a refresh puts the list back where it was");
  // The address names a search whose rows have not landed: the surface still holds all leads.
  table.scrollTop = 0;
  mountWithPane({ leadsRoute: "leads" });
  table.scrollTop = 700;
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  assert.equal(table.scrollTop, 700, "the old view's rows are not scrolled for the new view");
  // The read the page made for the search lands: the surface holds the view the address names.
  await quiesce();
  draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  assert.equal(table.scrollTop, 0, "the new view's rows start at their top");
});

test("a list that is moving shows no hover, on a desktop too: the pane is marked while the table's own box scrolls, for that box alone, and its listener comes down with the page", async () => {
  const table = { scrollTop: 0, scrollHeight: 6000, clientHeight: 600 };
  const { pane, heard, attrs, mount, scrolls } = await paned(table);
  const still = () => new Promise((r) => setTimeout(r, 200));
  mount();
  // A desktop: the rows overflow the table's own box, and that is the box that moves.
  scrolls(table);
  assert.equal(
    attrs["data-scrolling"],
    "1",
    "REGRESSION: the pane listened for its own scroll only, and on a desktop it never scrolls -- the cards stayed up over a moving list (seen in a browser)",
  );
  scrolls(table);
  await still();
  assert.equal(attrs["data-scrolling"], undefined, "still again: they may show");
  // Some other box inside the pane (a menu's list, a card's text) is not the list moving.
  scrolls({ scrollTop: 40, scrollHeight: 900, clientHeight: 300 });
  assert.equal(attrs["data-scrolling"], undefined, "a box that is not the list's marks nothing");
  // A phone: the table's box holds every row, and the pane is what scrolls.
  table.scrollHeight = 600;
  scrolls(table);
  assert.equal(attrs["data-scrolling"], undefined, "the table's box is not the scroller when nothing overflows it");
  scrolls(pane);
  assert.equal(attrs["data-scrolling"], "1", "on a phone the pane moves, and is marked as it always was");
  await still();
  assert.equal(attrs["data-scrolling"], undefined);
  // The page turns to People: what it put on the pane for Leads comes down in the phase it went up in (a browser
  // removes a capture listener only when told it is one), and the one a moving list needs goes up again.
  assert.deepEqual(
    heard.map((h) => h.capture),
    [true, true],
    "on Leads: this listener, and the one that keeps the place",
  );
  draw({ scope: "people", leadsRoute: null });
  assert.deepEqual(
    heard.map((h) => h.capture),
    [true, true],
    "on People too: the moving-list listener, and the one that keeps the place -- People keeps its place as Leads does (the loading standard's F)",
  );
});

test("typing in the box keeps the selection: leads the words hide are still selected when the box is cleared, and the bar says how many it is not showing", async () => {
  await fresh();
  let tree = draw();
  byTestId(tree, "select-all").props.onChange();
  tree = draw();
  assert.match(textOf(byTestId(tree, "leads-bulk-bar")), /5 selected/);
  searchBox(tree).props.onChange({ target: { value: "lamar" } });
  draw();
  await wordsRead("lamar");
  tree = draw();
  const bar = byTestId(tree, "leads-bulk-bar");
  assert.ok(bar, "REGRESSION: one letter in the box dropped everything selected");
  assert.match(textOf(bar), /1 selected/, "the bar still counts, and acts on, only what it shows");
  assert.match(textOf(byTestId(bar, "leads-bulk-hidden")), /4 more not shown/, "and says the rest are there");
  searchBox(tree).props.onChange({ target: { value: "" } });
  draw();
  await wordsRead("");
  tree = draw();
  assert.match(textOf(byTestId(tree, "leads-bulk-bar")), /5 selected/, "the box cleared, they are all back");
  assert.equal(byTestId(tree, "leads-bulk-hidden"), null, "with nothing hidden, nothing is said about it");
});

test("a row is drawn from what is its own, so a draw that changed nothing of a row can leave it alone: every prop is a primitive or the same object as last time", async () => {
  await fresh();
  const rowsOf = tableRowsOf;
  // A page that opens reads its view again behind the rows it holds, and the surface publishes them anew as it does (a view
  // held paints at once and is patched, surface.ts readView): the draw after that is the one that holds still.
  draw();
  let tree = draw();
  const a = rowsOf(tree);
  assert.ok(a.length >= 5, "the table draws its rows as the kit's TableRowView");
  tree = draw();
  const b = rowsOf(tree);
  const stable = ROW_HELD;
  for (const k of stable)
    assert.ok(Object.is(a[0].props[k], b[0].props[k]), `${k} is the same object on a draw that changed nothing`);
  for (const k of ["selected", "focused", "tabStop", "selectable"])
    assert.equal(typeof a[0].props[k], "boolean", `${k} is a boolean, never the whole selection or the cursor`);
  assert.ok(
    Object.is(a[0].props.row, b[0].props.row),
    "and the row's own view model, which the surface rebuilds only when it publishes",
  );
  // What a press changes is the pressed row's alone.
  press("j");
  tree = draw();
  const c = rowsOf(tree);
  assert.deepEqual(
    c.map((r) => r.props.focused),
    [true, false, false, false, false],
  );
  for (const k of stable) assert.ok(Object.is(c[1].props[k], b[1].props[k]), `${k} held through a key`);
  press("x");
  tree = draw();
  const d = rowsOf(tree);
  assert.deepEqual(
    d.map((r) => r.props.selected),
    [true, false, false, false, false],
  );
  for (const k of stable) assert.ok(Object.is(d[1].props[k], b[1].props[k]), `${k} held through a tick`);
});

test("REGRESSION: the Pipeline's rows too -- a draw that changed nothing of a row hands it the same objects, the table's own default for a door the page does not pass among them", async () => {
  // The Pipeline selects nobody, so it passes no onToggle, and the table's default was written in its parameter list:
  // a new function on every draw, which every memoised row compared and drew again for, on each key, fold and toast.
  await fresh();
  const day = 86_400_000;
  const at = (days) => new Date(NOW.getTime() - days * day).toISOString();
  const person = (id, name, deal) => ({
    id,
    display_name: name,
    phone_e164: `+1512555${id.length}${name.length}00`,
    consent: "opted_in",
    channels: ["whatsapp"],
    conversation_count: 1,
    latest_conversation_id: `cv-${id}`,
    last_message_at: at(30),
    last_inbound_at: at(30),
    first_contact_at: at(60),
    has_chat: true,
    ...deal,
  });
  const proposed = (days) => ({ deal_id: `d${days}`, deal_stage: "proposed", deal_proposed_at: at(days) });
  const rows = [
    person("k1", "Ana", proposed(9)),
    person("k2", "Ben", proposed(3)),
    person("k3", "Cy", proposed(1)),
  ].map((r) => toPersonRowVM(r, TZ, NOW));
  // What the Pipeline reads through the seam (useSurface("people")): the rows over the surface this world holds.
  setSurfaceValue("people", { ...surfaceValue("people"), rows, hasDeals: true, fetchedAt: NOW.getTime() });
  const drawPipeline = () => {
    frames.begin();
    return PipelineScope({ onNavigate: (to) => went.push(to), onOpenProfile: (id) => opened.push(id) });
  };
  try {
    const a = tableRowsOf(drawPipeline());
    assert.deepEqual(
      a.map((r) => r.props.row.name),
      ["Ana", "Ben", "Cy"],
      "the Pipeline draws People's table",
    );
    const b = tableRowsOf(drawPipeline());
    for (const k of ROW_HELD)
      assert.ok(Object.is(a[0].props[k], b[0].props[k]), `${k} is the same object on a draw that changed nothing`);
    assert.ok(Object.is(a[0].props.row, b[0].props.row), "and the row's own view model: one clock, the surface's");
    press("j");
    const c = tableRowsOf(drawPipeline());
    assert.deepEqual(
      c.map((r) => r.props.focused),
      [true, false, false],
    );
    for (const k of ROW_HELD) assert.ok(Object.is(c[1].props[k], b[1].props[k]), `${k} held through a key`);
    assert.ok(Object.is(c[1].props.row, b[1].props.row), "a row the key did not touch keeps its view model");
  } finally {
    setSurfaceValue("people", undefined);
  }
});

test("the peek is handed acts, not setters: every control it draws has a function behind it, and each one moves the page's own state", async () => {
  await fresh();
  draw();
  press("j");
  draw();
  press("Enter", { tagName: "TR", isContentEditable: false, closest: () => null });
  draw();
  const peek = peeks.at(-1);
  assert.equal(peek.vm.id, "l1", "the peek is open on the lead under the cursor");
  // What the peek (surfaces/leads/peek) reads off its props as `on.<name>`: the stage, Not a fit, Draft and its tones, the
  // call's outcome and note, the way back and the way out. Handed the page's raw
  // setters instead, every one of them is undefined -- a pane of dead controls that the peek's own unit tests
  // never see, because those build the acts themselves and this page did not.
  const dead = [
    "onStage",
    "onNotAFit",
    "onWhy",
    "onDraft",
    "onTone",
    "onOutcome",
    "onNote",
    "onSaveCall",
    "onCancelCall",
    "onBack",
    "onClose",
    "onKeep",
    "onExclude",
    "onPutBack",
    "onCopy",
    "onCall",
  ].filter((k) => typeof peek[k] !== "function");
  assert.deepEqual(dead, [], "every act the peek draws a control for");
  // And they are built from the page's own state, not from any function that would do: Not a fit turns the
  // peek's pane, and the way back brings it home.
  peek.onNotAFit();
  draw();
  assert.equal(peeks.at(-1).mode, "why", "an act writes the page's own peekMode");
  peeks.at(-1).onBack();
  draw();
  assert.equal(peeks.at(-1).mode, "info");
  // The setters are what the acts were built from; the peek is not handed them.
  assert.deepEqual(
    ["onMode", "onArmed", "onDraftState", "onPeekId"].filter((k) => peek[k] !== undefined),
    [],
    "the acts, not the setters",
  );
});

/* ------------------------------------ the bulk bar ------------------------------------ */

test("the bulk bar acts on the leads loaded and selected: Add them, Not a fit, Copy and Export under More; Select all N that match hands the view to the server", async () => {
  await fresh();
  byTestId(draw(), "select-all").props.onChange();
  let tree = draw();
  assert.match(textOf(byTestId(tree, "leads-bulk-bar")), /5 selected/);
  assert.ok(
    find(tree, (n) => typeof n.type === "function" && n.type.name === "BulkAddDesk"),
    "Add them to a sequence, the same picker one lead's sheet opens (the lead-to-sequence canvas's DeskBulk)",
  );
  assert.equal(
    byTestId(tree, "leads-bulk-contacted"),
    null,
    "Contacted went with the stage's menu: a sequence sets it",
  );
  assert.equal(byTestId(tree, "leads-bulk-write"), null, "Write to them went with the composer: Add is the one road");
  click(byTestId(draw(), "leads-select-matching"));
  tree = draw();
  assert.match(textOf(byTestId(tree, "leads-bulk-bar")), /322 selected/, "every lead the view matches, not every id");
  click(byTestId(tree, "leads-bulk-not-a-fit"));
  tree = draw();
  assert.equal(
    byTestId(tree, "peek-why").props.role,
    "menu",
    "the same five whys the peek asks, asked once for the whole selection",
  );
  click(byTestId(tree, "peek-why-chain"));
  await settle();
  assert.deepEqual(
    lastWrite(),
    {
      key: "POST /api/v1/leads/bulk",
      body: { by: "view", action: "not_a_fit", view: { list: "all", sort: "stage", dir: "asc" } },
    },
    "the view's filters go to the server, never 1,240 ids",
  );
  assert.equal(byTestId(draw(), "peek-why"), null, "the list closes on the pick");
  const more = find(draw(), (n) => n.type === Menu && n.props.trigger?.props?.["data-testid"] === "leads-bulk-more");
  more.props.groups
    .flatMap((g) => g.items ?? [])
    .find((i) => i.label === "Copy emails")
    .onSelect();
  assert.equal(
    textOf(flashes.at(-1).msg),
    "Copied 3 emails; 2 had none you can use",
    "what was copied, and what couldn't be",
  );
});

test("REGRESSION: Esc after Select all N that match lets go of the view too -- the next lead selected was counted, and acted on, as the whole view", async () => {
  await fresh();
  byTestId(draw(), "select-all").props.onChange();
  click(byTestId(draw(), "leads-select-matching"));
  assert.match(textOf(byTestId(draw(), "leads-bulk-bar")), /322 selected/);
  assert.equal(press("Escape"), true);
  assert.equal(byTestId(draw(), "leads-bulk-bar"), null, "Esc cleared the selection");
  press("j");
  draw();
  assert.equal(press("x"), true, "x selects the lead under the cursor");
  const bar = byTestId(draw(), "leads-bulk-bar");
  assert.match(textOf(bar), /^1 selected/, "REGRESSION: 322 selected -- the view Esc should have let go of");
});

test("REGRESSION: the bulk bar draws Check N again for a lead to check again, with its cost -- it read V, which nothing in its scope defines, and the page threw", async () => {
  await fresh();
  byTestId(rowOf(draw(), "l3"), "row-select").props.onChange();
  const tree = draw();
  const again = byTestId(tree, "leads-bulk-check-again");
  assert.ok(again, "Check again, for the lead whose mail server would not answer");
  assert.match(textOf(again), /Check 1 again · about 1¢/, "with what it costs");
  click(again);
  await settle();
  assert.deepEqual(
    lastWrite(),
    { key: "POST /api/v1/leads/check-again", body: { ids: ["l3"] } },
    "and the press asks the door that checks it again",
  );
});

// Find an email had no door (Reach out Part 4, PR 9): its buttons waited on a courier nothing installed, but the bench's
// pile still named it beside Keep and Exclude and priced it in its column. Nothing on the page says it now.
test("a pile of leads with no address, or one that bounces, is offered Keep and Exclude, and nothing on the bench, the bar or a phone offers to find an email", async () => {
  const noAddress = (id, state, reason) =>
    leadRow({
      id,
      place_id: `ChIJfixture0${id}`,
      email: state === "none" ? null : `hi@${id}.example`,
      email_state: state,
      member: member({ class: "review", fit: "look", reason: "An address to look at", reasons: [reason] }),
    });
  const rows = [noAddress("b1", "invalid", "email:invalid"), noAddress("n1", "none", "email:none")];
  await fresh({ leads: { rows } });
  try {
    const route = `leads:s-${SEARCH_A}:c-review`;
    let tree = draw({ leadsRoute: route });
    const bench = byTestId(tree, "lead-bench");
    assert.deepEqual(
      all(byTestId(bench, "lead-bench-queue"), (n) => n.props?.role === "tab").map((q) => textOf(q)),
      ["1Their email bouncesKeep · Exclude", "1No email on their siteKeep · Exclude"],
      "each pile's acts in words, and finding an email is not one",
    );
    assert.doesNotMatch(
      textOf(bench),
      /[Ff]ind (an|\d+) emails?|reads their pages again/,
      "nor a press, nor its price",
    );
    for (const id of ["b1", "n1"]) byTestId(rowOf(draw({ leadsRoute: route }), id), "row-select")?.props.onChange();
    tree = draw({ leadsRoute: route });
    assert.equal(byTestId(tree, "leads-bulk-find-email"), null, "the bar offers no such act");
    globalThis.__phone = true;
    tree = draw({ leadsRoute: route });
    assert.doesNotMatch(textOf(tree), /[Ff]ind (an|\d+) emails?/, "nor does a phone's pile");
  } finally {
    globalThis.__phone = false;
  }
});

test("REGRESSION: on a phone Leads' selection is the dock -- Clear, Not a fit, Add, More -- and Not a fit asks its five whys in the sheet; the why list was the peek's, drawn full screen", async () => {
  await fresh();
  globalThis.__phone = true;
  try {
    byTestId(draw(), "select-all").props.onChange();
    let tree = draw();
    const bar = byTestId(tree, "leads-bulk-bar");
    assert.ok(String(bar.props.className).split(/\s+/).includes("pp-bulk"), "the phone's dock");
    assert.equal(bar.props["aria-label"], "5 leads selected", "the count is the toolbar's name (Ruben, 10 Oct 2026)");
    // Each act once: the kit's Button is walked as the element it was given and as what it drew.
    assert.deepEqual(
      [
        ...new Set(
          all(bar, (n) =>
            String(n.props?.className || "")
              .split(/\s+/)
              .includes("pp-bulk-act"),
          ).map((n) => n.props["data-testid"]),
        ),
      ],
      ["leads-bulk-clear", "leads-bulk-not-a-fit", "leads-bulk-add", "leads-bulk-more"],
      "four acts, each a glyph over its word, Clear first; Add opens the picker for them all (18 Oct 2026)",
    );
    assert.equal(byTestId(bar, "leads-bulk-copy"), null, "the rest are the sheet's");
    click(byTestId(tree, "leads-bulk-more"));
    tree = draw();
    const sheet = openSheet(tree, "leads-bulk-sheet");
    assert.equal(sheet.props.title, "5 selected");
    const rows = all(
      sheet,
      (n) =>
        (n.type === "button" || n.type === "a") &&
        String(n.props?.className || "")
          .split(/\s+/)
          .includes("pp-sheet-row"),
    ).map((n) => n.props["data-testid"]);
    // Not a fit and Add are the dock's own, so More holds what is left (Later too, where a search holds them).
    assert.deepEqual(rows, ["leads-select-matching", "leads-bulk-copy", "leads-bulk-export"]);
    sheet.props.onClose();
    tree = draw();
    click(byTestId(tree, "leads-bulk-not-a-fit"));
    tree = draw();
    assert.equal(byTestId(tree, "peek-why"), null, "REGRESSION: the peek's own list, which a phone draws full screen");
    const whys = openSheet(tree, "leads-bulk-why");
    assert.ok(whys, "the five whys, as the sheet's step");
    assert.equal(whys.props.back, null, "the dock's own step walks back to nothing");
    await toastAfter(() => click(byTestId(whys, "leads-bulk-why-chain")), "not a fit, for the five");
    // bulkNotAFit sends LeadsBulkSchema's body, which carries no reason: the ids shown and selected.
    assert.deepEqual(lastWrite(), {
      key: "POST /api/v1/leads/bulk",
      body: { by: "ids", action: "not_a_fit", ids: ["l1", "l2", "l3", "l4", "l5"] },
    });
    assert.equal(openSheet(draw(), "leads-bulk-why"), null, "the sheet shuts on the pick");
    // Esc is the sheet's own (Base UI's), which asks; the page holds still behind it, and the selection stays.
    click(byTestId(draw(), "leads-bulk-more"));
    const more = openSheet(draw(), "leads-bulk-sheet");
    assert.ok(more);
    setOverlayOpen({ role: "dialog", inApp: false, className: "sheet" });
    assert.equal(press("Escape"), false, "its Esc is its own");
    setOverlayOpen(null);
    more.props.onClose();
    tree = draw();
    assert.equal(openSheet(tree, "leads-bulk-sheet"), null);
    assert.ok(byTestId(tree, "leads-bulk-bar"), "the selection stays");
  } finally {
    globalThis.__phone = false;
  }
});

/* ------------------------------------ the words ------------------------------------ */

test("no word the Leads scope says names the vendor, and no number on it is a dollar amount", async () => {
  await fresh();
  const said = [];
  for (const route of ["leads", `leads:s-${SEARCH_A}`, `leads:s-${SEARCH_A}:c-excluded`, "leads:l-ready"]) {
    setCells([]);
    walk(draw({ leadsRoute: route }), (n) => {
      for (const kid of n.props?.children ?? []) if (typeof kid === "string") said.push(kid);
      for (const key of ["title", "aria-label", "placeholder", "aria-description", "data-tip"])
        if (typeof n.props?.[key] === "string") said.push(n.props[key]);
    });
    for (const m of menus) for (const i of m.items || []) said.push(i.header || "", i.label || "", i.meta || "");
  }
  const bad = said.filter((s) => /apify|compass|bounceverify|\$\d/i.test(s));
  assert.deepEqual(bad, [], "the owner sees Claude finding businesses, and one unit: leads");
});

/* ---------------------------- the classes, and their acts ---------------------------- */

test("a Needs review row offers Keep and Exclude, an Excluded row offers Put back, and each toasts with Undo through its operation", async () => {
  await fresh();
  let tree = draw();
  // The page opens and reads its view behind the rows it holds; the owner presses once that has landed.
  await quiesce();
  const review = rowOf(tree, "l3");
  assert.ok(byTestId(review, "lead-keep") && byTestId(review, "lead-exclude"), "Keep counts it; Exclude is free");
  assert.equal(byTestId(review, "lead-put-back"), null);
  const excluded = rowOf(tree, "l4");
  assert.ok(byTestId(excluded, "lead-put-back"), "Put back is the owner's override");
  assert.equal(byTestId(excluded, "lead-keep"), null);
  click(byTestId(review, "lead-keep"));
  await settle();
  assert.deepEqual(
    lastWrite(),
    { key: "POST /api/v1/leads/l3/keep", body: { search_id: SEARCH_A } },
    "the lead names the search whose class it is in",
  );
  assert.equal(textOf(flashes.at(-1).msg), "Kept. It counts as a lead this month.");
  assert.equal(
    byTestId(rowOf(draw(), "l3"), "lead-keep"),
    null,
    "and the row shows it at once: it is kept, no longer a lead to decide",
  );
  await flashes.at(-1).undo();
  assert.deepEqual(
    lastWrite(),
    { key: "POST /api/v1/lead-operations/op-k/undo", body: { version: 4 } },
    "Undo names the operation and the version it saw, never rows",
  );
  click(byTestId(rowOf(draw(), "l4"), "lead-put-back"));
  await settle();
  assert.deepEqual(lastWrite(), { key: "POST /api/v1/leads/l4/put-back", body: { search_id: SEARCH_A } });
  assert.equal(textOf(flashes.at(-1).msg), "Put back. It counts as a lead now.");
  // Exclude is the other thing a lead to decide takes (one already kept is no longer one): a page of its own.
  await fresh();
  click(byTestId(rowOf(draw(), "l3"), "lead-exclude"));
  await settle();
  assert.deepEqual(lastWrite(), { key: "POST /api/v1/leads/l3/exclude", body: { search_id: SEARCH_A } });
  assert.equal(textOf(flashes.at(-1).msg), "Excluded. Nothing counted.");
});

test("a refused Keep is the route's sentence, and nothing says it was kept", async () => {
  await fresh({
    refuse: {
      status: 409,
      code: "conflict",
      message: "This place is hidden: it is already a customer, or was erased.",
    },
  });
  click(byTestId(rowOf(draw(), "l3"), "lead-keep"));
  await settle();
  assert.equal(writes.length, 1, "the door was asked");
  assert.equal(flashes.at(-1).tone, "danger");
  assert.match(textOf(flashes.at(-1).msg), /already a customer/);
  assert.ok(
    byTestId(rowOf(draw(), "l3"), "lead-keep"),
    "and the row is as it was: the surface took back what it had shown, so nothing says it was kept",
  );
});

test("an operator sees Find leads, Keep, Exclude and Put back refusing in the gate's sentence, and F does nothing for them", async () => {
  await fresh({ role: "operator" });
  const tree = draw();
  const gated = (n) => [n.props["aria-disabled"], n.props["aria-description"]];
  assert.deepEqual(gated(byTestId(seen(tree), "leads-find")), [true, "Only an owner can find leads."]);
  assert.deepEqual(gated(byTestId(rowOf(tree, "l3"), "lead-keep")), [true, "Only an owner can keep this lead."]);
  assert.deepEqual(gated(byTestId(rowOf(tree, "l3"), "lead-exclude")), [true, "Only an owner can exclude this lead."]);
  assert.deepEqual(gated(byTestId(rowOf(tree, "l4"), "lead-put-back")), [
    true,
    "Only an owner can put this lead back.",
  ]);
  assert.equal(press("f"), false, "and the key is not theirs either");
  assert.equal(panels.length, 0);
  assert.equal(asks.length, 0, "Ask is not opened for them");
});

test("the Excluded view's chips count by criterion, and each narrows the rows", async () => {
  await fresh();
  let tree = draw({ leadsRoute: `leads:s-${SEARCH_A}:c-excluded` });
  const chips = all(byTestId(tree, "lead-excluded-chips"), (n) =>
    n.props?.["data-testid"]?.startsWith("lead-chip-"),
  ).map((n) => textOf(n).trim());
  assert.deepEqual(chips, ["Chain 1", "Wrong kind 1"]);
  click(byTestId(tree, "lead-chip-Chain"));
  // The chip is a read (00500): the view, narrowed to the criterion's key, and its route says the chip.
  await until(() => {
    draw({ leadsRoute: `leads:s-${SEARCH_A}:c-excluded` });
    return surfaceValue("leads")?.view?.chips?.excluded_by === "chain";
  }, "the chip's read");
  tree = draw({ leadsRoute: `leads:s-${SEARCH_A}:c-excluded` });
  assert.deepEqual(names(tree), ["GigaFit Austin"]);
  assert.equal(went.at(-1), `clients/leads:s-${SEARCH_A}:c-excluded:x-chain`, "the address says the chip");
  assert.equal(
    byTestId(tree, "lead-classes"),
    null,
    "a search's band is its finished leads alone (decision 0133), and one tab narrows nothing, so none is drawn (16 Nov " +
      "2026): the Excluded view is its question's, by its address",
  );
});
