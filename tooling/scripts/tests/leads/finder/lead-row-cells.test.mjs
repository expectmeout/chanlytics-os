/**
 * What a lead's row offers and how its saved view is read (the table review of 5 Nov 2026), drawn from the real cells
 * on the stub React: the row's one act in words, through the page's own doors and its role gate; A on the keyboard's
 * cursor; and a view saved before the cells said two lines, opened in the new layout once. The page's own journey is
 * leads-honest.test.mjs's; this draws the acts' cell by itself, over rows as small as the rule reads.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, again, byTestId, find, textOf } from "../../_legacy-react.mjs";
import { importSrc } from "../../_source.mjs";

installLegacyReact();
const { LEAD_COLUMNS, leadViewNow, LEAD_VIEW_EXTRA, mayRowAct } = await importSrc(
  "apps/dashboard/src/surfaces/leads/cells/columns.tsx",
);
const { onPageKey } = await importSrc("apps/dashboard/src/surfaces/people/hooks/keyboard.ts");
const { leadHeadMenus, leadQueueGroupOf, leadStatusGroupMenu, leadsFootOf } = await importSrc(
  "apps/dashboard/src/surfaces/leads/scope/head-menus.tsx",
);

const SEQ = "Local: your receptionist is built";
/** A lead's row, as much of it as the acts' cell reads: ready, with an address and no number, unless said. */
const lead = (over = {}) => ({
  id: "l1",
  name: "Quix Plumbing Service",
  cls: "qualified",
  state: "ready",
  email: "hello@quix.example",
  emailState: "ok",
  phone: null,
  phoneWrong: false,
  ...over,
});
/** The cell's context: the doors a press takes, each recorded, and what the page knows. */
const ctxOf = (over = {}) => {
  const went = [];
  const door = (name) => (id) => went.push([name, id]);
  return {
    went,
    ctx: {
      pickName: SEQ,
      canFind: true,
      callMenu: null,
      onOpen: door("open"),
      onAdd: door("add"),
      onKeep: door("keep"),
      onExclude: door("exclude"),
      onPutBack: door("put_back"),
      onCopy: door("copy"),
      ...over,
    },
  };
};
const acts = LEAD_COLUMNS.find((c) => c.key === "actions");
const drawn = (l, ctx) => {
  fresh();
  return again(() => acts.cell(l, ctx));
};
const press = (node) => node.props.onClick({ stopPropagation() {} });

test("a row not contacted offers its Add in words, to the search's pick, and to the picker where none is chosen", () => {
  const picked = ctxOf();
  const add = byTestId(drawn(lead(), picked.ctx), "lead-add");
  assert.equal(textOf(add), `Add to ${SEQ}`);
  assert.equal(
    add.props["data-tip"],
    `Add to ${SEQ}`,
    "its whole words are its tip: the row's end may cut a long name",
  );
  press(add);
  assert.deepEqual(picked.went, [["add", "l1"]], "the page's Add, for this lead");
  const none = ctxOf({ pickName: null });
  const choose = byTestId(drawn(lead(), none.ctx), "lead-add");
  assert.equal(textOf(choose), "Add to a sequence");
  press(choose);
  assert.deepEqual(none.went, [["open", "l1"]], "no pick: the lead's sheet, whose dock holds the picker");
});

test("what waits on a look is kept or put back from its row, with Exclude beside Keep", () => {
  const review = ctxOf();
  const row = drawn(lead({ cls: "review", state: "review" }), review.ctx);
  assert.equal(textOf(byTestId(row, "lead-keep")), "Keep");
  assert.equal(textOf(byTestId(row, "lead-exclude")), "Exclude");
  press(byTestId(row, "lead-keep"));
  press(byTestId(row, "lead-exclude"));
  assert.deepEqual(review.went, [
    ["keep", "l1"],
    ["exclude", "l1"],
  ]);
  const out = ctxOf();
  const back = byTestId(drawn(lead({ cls: "excluded" }), out.ctx), "lead-put-back");
  assert.equal(textOf(back), "Put back");
  press(back);
  assert.deepEqual(out.went, [["put_back", "l1"]]);
});

test("a row that offers nothing draws no worded act, and still its copy", () => {
  const row = drawn(lead({ state: "contacted" }), ctxOf().ctx);
  for (const id of ["lead-add", "lead-keep", "lead-put-back", "lead-open"]) assert.equal(byTestId(row, id), null, id);
  assert.ok(byTestId(row, "lead-copy"), "the address is still one press away");
  const bare = drawn(lead({ state: "contacted", email: null, emailState: "none" }), ctxOf().ctx);
  assert.deepEqual(
    find(bare, (n) => /\bcl-row-actions\b/.test(String(n.props?.className))).props.children.filter(Boolean),
    [],
    "nothing to press: the capsule holds nothing, and the stylesheet draws none",
  );
});

test("a member who may not press an act is told why at the press: the role gate's props come last", () => {
  const kept = globalThis.window.gate;
  globalThis.window.gate = (action, doing) => ({ "data-gated": `${action}: ${doing}`, onClick: () => undefined });
  try {
    const gated = ctxOf({ canFind: false });
    const add = byTestId(drawn(lead(), gated.ctx), "lead-add");
    assert.equal(add.props["data-gated"], "approve: add this lead to a sequence");
    press(add);
    assert.deepEqual(gated.went, [], "a gated press adds nothing");
    const keep = byTestId(drawn(lead({ cls: "review", state: "review" }), gated.ctx), "lead-keep");
    assert.equal(keep.props["data-gated"], "find: keep this lead");
  } finally {
    globalThis.window.gate = kept;
  }
});

test("REGRESSION: the key is no way round a role -- A may do only what the row's button would let this member press", () => {
  const kept = globalThis.window.canDo;
  try {
    // A viewer: may neither find nor approve.
    globalThis.window.canDo = () => false;
    assert.equal(mayRowAct("keep", false), false, "Keep is the finder's");
    assert.equal(mayRowAct("put_back", false), false, "and so is Put back");
    assert.equal(mayRowAct("add", false), false, "an add is an approval");
    assert.equal(mayRowAct("open", false), true, "opening the lead is anyone's");
    assert.equal(mayRowAct("pick", false), true);
    assert.equal(mayRowAct("call", false), true, "a call is the owner's own phone: no role is asked");
    // A member who may approve but not find, and one who may do both.
    globalThis.window.canDo = (action) => action === "approve";
    assert.equal(mayRowAct("add", false), true);
    assert.equal(mayRowAct("keep", false), false);
    assert.equal(mayRowAct("keep", true), true);
  } finally {
    globalThis.window.canDo = kept;
  }
});

/** A key as the page's one listener hears it, pressed on the page and in no field. */
const key = (k, over = {}) => ({
  key: k,
  target: null,
  defaultPrevented: false,
  preventDefault() {
    this.defaultPrevented = true;
  },
  ...over,
});
/** The listener's doors: the cursor on a row, and each door recorded. */
const doors = (over = {}) => {
  const went = [];
  return {
    went,
    k: {
      ids: ["l1"],
      cursor: "l1",
      move() {},
      toggle() {},
      selected: false,
      clearSel() {},
      focusSearch() {},
      act: (id) => went.push(["act", id]),
      ...over,
    },
  };
};

test("how many rated says its noun apart, so a compact row keeps the number whole", () => {
  const rating = LEAD_COLUMNS.find((c) => c.key === "rating");
  const cellOf = (rated) => {
    fresh();
    return again(() => rating.cell(lead({ rated, spread: null }), ctxOf().ctx));
  };
  const cell = cellOf({ score: "5.0", count: "1,284", reviews: "1,284 reviews" });
  const noun = find(cell, (n) => n.props?.className === "ld-rated-noun");
  assert.equal(textOf(noun), " reviews", "the noun alone is what a compact row hides");
  assert.match(
    textOf(cell),
    /5\.01,284 reviews$/,
    "and the line still reads whole: the score, then the count with its noun",
  );
  // Words that do not open on the count are said as they are, whole.
  const odd = cellOf({ score: "4.0", count: "1", reviews: "One review" });
  assert.equal(
    find(odd, (n) => n.props?.className === "ld-rated-noun"),
    null,
  );
  assert.match(textOf(odd), /4\.0One review$/);
  assert.equal(textOf(cellOf(null)), "", "a source that does not rate says nothing");
});

test("A does what the row under the cursor offers; the pile's own A is taken first, and Shift+A is not this key", () => {
  const keptDoc = globalThis.document;
  globalThis.document = { ...(keptDoc || {}), activeElement: null, querySelector: () => null };
  try {
    const plain = doors();
    const pressed = key("a");
    onPageKey(plain.k, pressed);
    assert.deepEqual(plain.went, [["act", "l1"]]);
    assert.equal(pressed.defaultPrevented, true);
    onPageKey(plain.k, key("A", { shiftKey: true }));
    assert.equal(plain.went.length, 1, "Shift+A is the pile's picker, never the row's act");
    const none = doors({ cursor: null });
    onPageKey(none.k, key("a"));
    assert.deepEqual(none.went, [], "no cursor, no row to act on");
    const piled = [];
    const pile = doors({ pile: { press: (p) => piled.push(p), undo() {}, leave() {} } });
    onPageKey(pile.k, key("a"));
    assert.deepEqual([piled, pile.went], [["a"], []], "while the pile is on, A is its own");
  } finally {
    globalThis.document = keptDoc;
  }
});

test("REGRESSION: a view saved before the cells said two lines opens in the new layout once -- a Stage dragged to 432px still ran past its edge", () => {
  const before = {
    list: "all",
    sortBy: "rating",
    sortDir: "desc",
    columns: { fit: true, why: true, website: true, stage: true },
    widths: { stage: 432, reach: 240 },
    order: ["stage", "reach"],
  };
  assert.deepEqual(leadViewNow(before), {
    list: "all",
    sortBy: "rating",
    sortDir: "desc",
    columns: { website: true, stage: true },
    order: ["stage", "reach"],
  });
  assert.deepEqual(before.widths, { stage: 432, reach: 240 }, "the copy it was read from is left as it was");
  const since = { ...before, ...LEAD_VIEW_EXTRA, widths: { stage: 300 } };
  assert.equal(leadViewNow(since), since, "a view saved since is the member's, whole");
  assert.deepEqual(leadViewNow({}), {}, "a member who changed nothing has nothing to let go of");
  assert.deepEqual(leadViewNow({ columns: null, widths: {} }), { columns: null });
});

/* ------------------------------------------------------------------------------------------- the queue on a desk -- */

const NO_GROUPS = [];
/** What a heading's menu reads of the page, each door recorded. */
const menuPage = (over = {}) => {
  const went = [];
  return {
    went,
    p: {
      table: { toggleColumn: (k) => went.push(["hide", k]) },
      statusGroups: NO_GROUPS,
      onStatusGroup: (g) => went.push(["status", g]),
      statusCounts: { needs: 2, in: 5, none: 20 },
      reach: [],
      onReach: (f) => went.push(["reach", f]),
      ...over,
    },
  };
};
const switchesIn = (menu) => menu.groups.flatMap((g) => g.toggles?.items ?? []);
const itemsIn = (menu) => menu.groups.flatMap((g) => g.items ?? []);

test("a heading's first press puts first what a member sorts by it for", () => {
  // In the read's words: A to Z, what needs you, the best rated, the best fit, the nearest. Found's `desc` is the newest, as
  // the page says a date (surface.ts readDir walks its key the other way; leads-bridge.test.mjs runs it).
  assert.deepEqual(
    Object.fromEntries(LEAD_COLUMNS.filter((c) => c.sort && !c.hidden).map((c) => [c.key, c.sort.first])),
    { business: "asc", stage: "asc", rating: "desc", found: "desc", fit: "asc", distance: "asc" },
  );
});

test("Stage's menu holds three switches with the view's counts and Hide column; Reach's the two the Filter held", () => {
  const { p, went } = menuPage();
  const menus = leadHeadMenus(p);
  assert.deepEqual(Object.keys(menus).sort(), ["reach", "stage"]);
  assert.deepEqual(
    switchesIn(menus.stage).map((t) => [t.value, t.label, t.hint, t.on]),
    [
      ["needs", "Needs you", "2", false],
      ["in", "In a sequence", "5", false],
      ["none", "Not in a sequence", "20", false],
    ],
  );
  assert.match(menus.stage.groups[0].caption, /leads waiting on you/, "Today's Need you counts decisions, this leads");
  assert.deepEqual(
    switchesIn(menus.reach).map((t) => [t.value, t.on]),
    [
      ["email", false],
      ["phone", false],
    ],
  );
  itemsIn(menus.stage)[0].onSelect();
  itemsIn(menus.reach)[0].onSelect();
  menus.stage.groups[0].toggles.onToggle("needs");
  menus.reach.groups[0].toggles.onToggle("phone");
  assert.deepEqual(went, [
    ["hide", "stage"],
    ["hide", "reach"],
    ["status", "needs"],
    ["reach", "phone"],
  ]);
  assert.equal(itemsIn(menus.stage)[0].label, "Hide column");
});

test("a filter on says so at its heading; a count not read is no count", () => {
  const on = leadHeadMenus(menuPage({ statusGroups: ["needs"], reach: ["email"] }).p);
  assert.equal(on.stage.active, true);
  assert.equal(on.reach.active, true);
  assert.equal(switchesIn(on.stage)[0].on, true);
  const off = leadHeadMenus(menuPage().p);
  assert.equal(off.stage.active, false);
  assert.equal(off.reach.active, false);
  const unread = leadHeadMenus(menuPage({ statusCounts: null }).p);
  assert.equal(switchesIn(unread.stage)[0].hint, undefined);
});

test("a phone's Sort sheet takes the three as chips", () => {
  const group = leadStatusGroupMenu(["in"], () => undefined, { needs: 1, in: 2, none: 3 }, true);
  assert.equal(group.toggles.chips, true);
  assert.deepEqual(
    group.toggles.items.map((t) => [t.value, t.on]),
    [
      ["needs", false],
      ["in", true],
      ["none", false],
    ],
  );
});

test("a stage sort draws the queue's heads once it has landed, on a desk's view of the leads alone", () => {
  const surface = (sort, cls = null) => ({
    view: { sort, cls },
    viewCounts: { status_groups: { needs: 3, in: 1, none: 9 } },
  });
  const row = { cls: "qualified", stage: "ready", statusGroup: "needs" };
  const at = leadQueueGroupOf(surface("stage"), { phone: false });
  assert.deepEqual(at(row), { key: "needs", label: "Needs you", count: 3 });
  assert.equal(leadQueueGroupOf(surface("fit"), { phone: false }), null, "any other sort draws none");
  assert.equal(leadQueueGroupOf(surface("stage"), { phone: true }), null, "a phone's cards stay as they are");
  assert.equal(leadQueueGroupOf(surface("stage", "review"), { phone: false }), null, "a review's view is no queue");
  assert.ok(leadQueueGroupOf(surface("stage", "qualified"), { phone: false }), "the qualified, named, still are");
});

test("a filter on shows in the foot with its way out, whatever heading it was set under, and the counts beside it", () => {
  const cleared = [];
  const foot = leadsFootOf({
    surface: { viewCounts: { status_groups: { needs: 2, in: 1, none: 3 }, with_email: 4, with_phone: 1 } },
    statusGroups: ["needs"],
    reach: ["email"],
    onClearHeadings: () => cleared.push(true),
  });
  assert.deepEqual(foot.words, ["2 need you", "4 you can email", "1 by phone"]);
  assert.match(textOf(foot.end), /Checked email · Needs you/);
  find(foot.end, (n) => n.props?.onClick && /Clear filters/.test(textOf(n))).props.onClick();
  assert.deepEqual(cleared, [true]);
  const none = leadsFootOf({ surface: { viewCounts: null }, statusGroups: NO_GROUPS, reach: [], onClearHeadings() {} });
  assert.deepEqual(none, { words: [], end: null }, "nothing read, nothing on: as it was");
});
