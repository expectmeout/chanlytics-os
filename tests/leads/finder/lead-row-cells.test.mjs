/**
 * What a lead's row offers and how its saved view is read (the table review of 5 Nov 2026), drawn from the real cells
 * on the stub React: the row's one act in words, through the page's own doors and its role gate; A on the keyboard's
 * cursor; and a view saved before the cells said two lines, opened in the new layout once. The page's own journey is
 * leads-honest.test.mjs's; this draws the acts' cell by itself, over rows as small as the rule reads.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LEAD_COLUMN_GROUPS, LEAD_RATED_HINT, LEAD_VIEW_SORTS } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, byTestId, find, textOf } from "../../_legacy-react.mjs";
import { importSrc } from "../../_source.mjs";

installLegacyReact();
const { LEAD_COLUMNS, leadViewNow, LEAD_VIEW_EXTRA, mayRowAct } = await importSrc(
  "apps/dashboard/src/surfaces/leads/cells/columns.tsx",
);
const { LEAD_MORE_COLUMNS } = await importSrc("apps/dashboard/src/surfaces/leads/cells/more-columns.tsx");
const { columnGroupsOf, columnOptionsOf, visibilityDefaults, visibilityOf } = await importSrc(
  "apps/dashboard/src/surfaces/kit/table/columns.ts",
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
    {
      business: "asc",
      stage: "asc",
      rating: "desc",
      found: "desc",
      fit: "asc",
      distance: "asc",
      contacted: "desc",
      category: "asc",
      city: "asc",
      region: "asc",
      reviews: "desc",
    },
  );
  const sorts = LEAD_COLUMNS.filter((c) => c.sort && !c.hidden).map((c) => c.key);
  assert.deepEqual(
    sorts.filter((k) => !LEAD_VIEW_SORTS.includes(k)),
    [],
    "every heading that sorts is a sort the read takes",
  );
});

/* -------------------------------------------------------------------------- what a member can turn on (decision 0103) -- */

const FOURTEEN = [
  ["sequence", "Sequence", LEAD_COLUMN_GROUPS.stands],
  ["contacted", "Last contacted", LEAD_COLUMN_GROUPS.stands],
  ["outcome", "Last outcome", LEAD_COLUMN_GROUPS.stands],
  ["category", "Kind", LEAD_COLUMN_GROUPS.who],
  ["contact", "Contact", LEAD_COLUMN_GROUPS.who],
  ["size", "Company size", LEAD_COLUMN_GROUPS.who],
  ["city", "City", LEAD_COLUMN_GROUPS.where],
  ["region", "State", LEAD_COLUMN_GROUPS.where],
  ["phone", "Phone", LEAD_COLUMN_GROUPS.reach],
  ["email", "Email", LEAD_COLUMN_GROUPS.reach],
  ["social", "Social", LEAD_COLUMN_GROUPS.reach],
  ["reviews", "Reviews", LEAD_COLUMN_GROUPS.good],
  ["claimed", "Claimed listing", LEAD_COLUMN_GROUPS.good],
  ["open_now", "Open now", LEAD_COLUMN_GROUPS.good],
];

test("the fourteen are off until asked for, each under its group", () => {
  assert.deepEqual(
    LEAD_MORE_COLUMNS.map((c) => [c.key, c.label, c.group]),
    FOURTEEN,
  );
  for (const c of LEAD_MORE_COLUMNS) assert.equal(c.on, false, `${c.key} is off until asked for`);
  const inTable = LEAD_COLUMNS.map((c) => c.key);
  assert.ok(inTable.indexOf("open_now") < inTable.indexOf("actions"), "the row's acts stay last");
  assert.deepEqual(
    Object.entries(visibilityDefaults(LEAD_COLUMNS))
      .filter(([, on]) => on)
      .map(([k]) => k),
    ["business", "stage", "reach", "rating", "found", "actions"],
    "the same five are on as before",
  );
});

test("the Columns menu reads Business and Stage first, then the six groups in the order a member reads a lead by", () => {
  const options = columnOptionsOf(LEAD_COLUMNS, visibilityOf(LEAD_COLUMNS, {}));
  const sets = columnGroupsOf(LEAD_COLUMNS, options, Object.values(LEAD_COLUMN_GROUPS));
  assert.deepEqual(
    sets.map((s) => [s.group, s.options.map((o) => o.key)]),
    [
      [null, ["business", "stage"]],
      [LEAD_COLUMN_GROUPS.stands, ["sequence", "contacted", "outcome"]],
      [LEAD_COLUMN_GROUPS.who, ["category", "contact", "size"]],
      [LEAD_COLUMN_GROUPS.where, ["distance", "city", "region"]],
      [LEAD_COLUMN_GROUPS.reach, ["reach", "website", "phone", "email", "social"]],
      [LEAD_COLUMN_GROUPS.good, ["rating", "fit", "why", "reviews", "claimed", "open_now"]],
      [LEAD_COLUMN_GROUPS.from, ["found", "source", "search"]],
    ],
  );
  const rated = LEAD_COLUMNS.find((c) => c.key === "rating");
  assert.equal(rated.hint, LEAD_RATED_HINT, "the heading says why 5.0 from one review is not first");
});

/** A lead's row with every fact the columns read. Made up, all of it. */
const WHOLE = {
  id: "l1",
  name: "Quix Plumbing Service",
  cls: "qualified",
  state: "contacted",
  category: "Plumber",
  host: "quix.example",
  card: { today: "Open until 5 PM", site: { label: "quix.example", href: "https://quix.example" } },
  slots: {
    phone: { state: "ok", value: "+17185550142", word: "Checked", tip: "the same number", copy: true },
    mailbox: { state: "part", value: "hello@quix.example", word: "Unconfirmed", tip: "not confirmed", copy: true },
  },
  cols: {
    sequence: SEQ,
    contacted: { label: "3d", at: "Nov 2, 2026 · 10:00 AM" },
    outcome: { word: "Left a voicemail", note: "Call after 3" },
    contact: { name: "Bo Quix", title: "Office manager" },
    size: "11 - 50",
    city: "Queens",
    region: "NY",
    social: [
      { key: "linkedin", word: "LinkedIn", href: "https://linkedin.example/quix" },
      { key: "tiktok", word: "TikTok", href: "https://tiktok.example/quix" },
    ],
    reviews: "1,284",
    claimed: "Yes",
  },
};
/** The same lead with nothing held: what a bare row draws. */
const BARE = {
  ...WHOLE,
  category: "",
  host: "",
  card: { today: null, site: null },
  slots: {
    phone: { state: "none", value: null, word: "Nothing found", tip: "No phone on the listing", copy: false },
    mailbox: { state: "none", value: null, word: "Nothing found", tip: "No email", copy: false },
  },
  cols: {
    sequence: null,
    contacted: null,
    outcome: null,
    contact: null,
    size: null,
    city: null,
    region: null,
    social: [],
    reviews: null,
    claimed: null,
  },
};
const cellOf = (key, l, ctx = ctxOf().ctx) => {
  fresh();
  return again(() => LEAD_COLUMNS.find((c) => c.key === key).cell(l, ctx));
};

test("a column draws from the row it is handed, and an empty value is an empty cell", () => {
  const says = {
    sequence: SEQ,
    contacted: "3d",
    outcome: "Left a voicemailCall after 3",
    category: "Plumber",
    contact: "Bo QuixOffice manager",
    size: "11 - 50",
    city: "Queens",
    region: "NY",
    reviews: "1,284",
    claimed: "Yes",
    open_now: "Open until 5 PM",
  };
  for (const [key, words] of Object.entries(says)) assert.equal(textOf(cellOf(key, WHOLE)), words, key);
  for (const [key] of FOURTEEN) assert.equal(textOf(cellOf(key, BARE)), "", `${key} says nothing of a bare lead`);
  const contacted = find(cellOf("contacted", WHOLE), (n) => n.props?.["data-tip"] !== undefined);
  assert.equal(contacted.props["data-tip"], WHOLE.cols.contacted.at, "the whole date, in the kit's tip");
  assert.equal(
    find(cellOf("contacted", WHOLE), (n) => n.props?.title !== undefined),
    null,
    "never the browser's",
  );
});

test("Phone and Email are Reach's own lines, how each was checked under it, and a press calls or copies", () => {
  const { ctx, went } = ctxOf({ onCall: (id) => went.push(["call", id]) });
  const phone = cellOf("phone", WHOLE, ctx);
  assert.match(textOf(phone), /Checked$/, "how the number was checked, under it");
  find(phone, (n) => n.props?.className === "ld-slot-btn ld-reach-press").props.onClick({ stopPropagation() {} });
  assert.deepEqual(went.at(-1), ["call", "l1"]);
  const email = cellOf("email", WHOLE, ctx);
  assert.match(textOf(email), /^hello@quix\.example/);
  assert.match(textOf(email), /Unconfirmed$/);
  find(email, (n) => n.props?.className === "ld-slot-btn ld-reach-press").props.onClick({ stopPropagation() {} });
  assert.deepEqual(went.at(-1), ["copy", "l1"]);
  assert.equal(
    find(phone, (n) => n.props?.role === "tooltip").props.id,
    "l1-col-phone-tip",
    "named apart from Reach's own tip, which may stand on the same row",
  );
  const left = { ...WHOLE, cls: "excluded" };
  assert.equal(textOf(cellOf("phone", left, ctx)), "Not checked", "left out, as Reach says of it");
  assert.equal(textOf(cellOf("email", left, ctx)), "Not checked");
});

test("Website and Social are links out: a new tab, each only where it is held, and no press of the row", () => {
  const stopped = [];
  const event = { stopPropagation: () => stopped.push(true) };
  const anchors = (tree) => all(tree, (n) => n.type === "a");
  const site = anchors(cellOf("website", WHOLE));
  assert.deepEqual(
    site.map((a) => [a.props.href, a.props.target, a.props.rel, textOf(a)]),
    [["https://quix.example", "_blank", "noreferrer", "quix.example"]],
  );
  site[0].props.onClick(event);
  assert.equal(stopped.length, 1, "the row's own press is not this one");
  assert.deepEqual(anchors(cellOf("website", BARE)), [], "no site, no link");
  const social = anchors(cellOf("social", WHOLE));
  assert.deepEqual(
    social.map((a) => [textOf(a), a.props.href, a.props.target]),
    [
      ["LinkedIn", "https://linkedin.example/quix", "_blank"],
      ["TikTok", "https://tiktok.example/quix", "_blank"],
    ],
  );
  assert.equal(textOf(cellOf("social", WHOLE)), "LinkedIn·TikTok");
});

/** What a business's cell reads of the page, over the acts' context. */
const nameCtx = (over = {}) => {
  const c = ctxOf({
    hrefOf: (id) => `/w/acme/people/leads:p-${id}`,
    onExpand() {},
    peopleRows: [],
    mixedFits: true,
    grouped: false,
    stageShown: true,
    ...over,
  });
  return c;
};
const businessOf = (l, ctx) => cellOf("business", l, ctx);
const NAMED = {
  ...WHOLE,
  state: "ready",
  statusGroup: null,
  fit: "strong",
  fitLabel: "Strong fit",
  places: 1,
  sub: "Plumber · Queens",
  tile: { initials: "QP", image: null, logo: null },
};

test("a business's name is a link: a plain press opens the sheet, a press with a key held is the browser's", () => {
  const { ctx, went } = nameCtx();
  const name = byTestId(businessOf(NAMED, ctx), "lead-name");
  assert.equal(name.type, "a", "a real link");
  assert.equal(name.props.href, "/w/acme/people/leads:p-l1");
  const pressed = (over) => {
    const e = {
      stopped: 0,
      prevented: 0,
      stopPropagation() {
        this.stopped += 1;
      },
      preventDefault() {
        this.prevented += 1;
      },
      ...over,
    };
    name.props.onClick(e);
    return e;
  };
  const plain = pressed({});
  assert.deepEqual(went, [["open", "l1"]], "the sheet, as ever");
  assert.deepEqual([plain.stopped, plain.prevented], [1, 1], "and no press of the row, and no move of the page");
  for (const key of ["metaKey", "ctrlKey", "shiftKey"]) {
    const held = pressed({ [key]: true });
    assert.equal(went.length, 1, `${key}: the sheet is not opened`);
    assert.deepEqual([held.stopped, held.prevented], [1, 0], `${key}: the browser's, and still no press of the row`);
  }
});

test("under a head that says the fit, the name wears no fit pill; a lead with a place, or no head, keeps it", () => {
  const pill = (l, over) => byTestId(businessOf(l, nameCtx(over).ctx), "lead-fit-tag");
  assert.equal(pill(NAMED, { grouped: true }), null, "the Stage cell says it, with why");
  assert.ok(pill(NAMED, { grouped: false }), "no head: the cell says Not contacted, and the pill says the fit");
  assert.ok(pill(NAMED, { grouped: true, stageShown: false }), "no Stage column to say it");
  assert.ok(pill({ ...NAMED, statusGroup: "in" }, { grouped: true }), "a lead with a place says its place there");
  assert.ok(pill({ ...NAMED, state: "contacted" }, { grouped: true }), "a contacted lead says how long ago there");
  assert.equal(pill(NAMED, { mixedFits: false }), null, "every fit alike: nothing to tell apart");
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
