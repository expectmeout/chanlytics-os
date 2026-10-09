/**
 * The owner's panes gate the way the rest of the app does, and Activity reads like a log.
 *
 * - Settings' owner-only controls were refused in ways of their own (the interface audit's "gated six ways"; A7's
 *   list of hand-rolled checks): Notifications' Add and Remove were disabled with a title no keyboard or finger
 *   reaches; Your data's download and Team's Invite were absent for anyone else, under sentences of the page's own;
 *   Activity asked the signed-in role and ignored an owner's View-as preview. Each primary act is now drawn gated --
 *   focusable, described, inert, saying why when pressed, in contracts' words -- and each pane says why once.
 * - Activity (the wiring audit's S21): its filters had no names, the kind filter read the log on every keystroke and
 *   ate typed spaces, a slow answer could land over a newer one, and the first load showed nothing at all.
 * Run against the Settings page (surfaces/settings/frame/page.tsx), which imports the panes it draws (every one TSX:
 * surfaces/settings), on a stub React, over data-bits' real gate and contracts' role table.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROLE_PERMS,
  roleGate,
  stateOf,
  clockStamp,
  clockTime,
  clockDateYear,
  clockDayLabel,
  zoneDayKey,
  POLICY_MODES,
  POLICY_MODE_WORDS,
  NOTIFICATION_KIND_GROUPS,
  NOTIFICATION_PANE_WORDS,
  ACTIVITY_PAGE_WORDS,
} from "@chanlytics/contracts";
import { useStubHooks, kitPages } from "../_legacy-react.mjs";

const TID = "t-studio";

/* ---------------------------------- the window ---------------------------------- */

const listeners = {};
const tipped = [];
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.document = {
  body: { appendChild() {} },
  activeElement: null,
  addEventListener() {},
  removeEventListener() {},
  getElementById: () => null,
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
globalThis.window = {
  location: {
    pathname: "/w/studio",
    hash: "#/admin/notifications",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  history: { replaceState() {} },
  innerHeight: 800,
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener: (type, fn) => {
    (listeners[type] ||= new Set()).add(fn);
  },
  removeEventListener: (type, fn) => {
    listeners[type]?.delete(fn);
  },
  dispatchEvent: (ev) => {
    for (const fn of [...(listeners[ev.type] || [])]) fn(ev);
    return true;
  },
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: TID,
  // As the bridge publishes them (seed-globals.ts): the role table and the gate's sentence are contracts'.
  ROLE_PERMS,
  __roleGate: roleGate,
};

/* ------------------------------ a stub React ------------------------------ */

// Hooks are kept per component, by the component's place in the tree and its type; memos and callbacks honour their
// inputs, so an effect that depends on a callback runs when React would run it and not on every draw. A setter marks
// the page changed, and `settle` draws again only then.
let cells = new Map();
let frames = [];
let dirty = false;
let lastTree = null;
const slot = () => {
  const f = frames[frames.length - 1];
  return `${f.key}#${f.hook++}`;
};
const same = (a, b) => !!a && !!b && a.length === b.length && a.every((d, i) => Object.is(d, b[i]));
const memo = (make, deps) => {
  const k = slot();
  const was = cells.get(k);
  if (!was || !deps || !same(was.deps, deps)) cells.set(k, { value: make(), deps });
  return cells.get(k).value;
};
globalThis.Icon = "Icon";
globalThis.StatStrip = "StatStrip";
globalThis.StatCell = "StatCell";
globalThis.Sparkline = "Sparkline";
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") {
      const parent = frames[frames.length - 1];
      const name = type.name || "anon";
      parent.kids[name] = (parent.kids[name] || 0) + 1;
      frames.push({ key: `${parent.key}/${name}:${parent.kids[name]}`, hook: 0, kids: {} });
      try {
        node.rendered = type(props);
      } finally {
        frames.pop();
      }
    }
    return node;
  },
  useState: (init) => {
    const k = slot();
    if (!cells.has(k)) cells.set(k, typeof init === "function" ? init() : init);
    return [
      cells.get(k),
      (v) => {
        cells.set(k, typeof v === "function" ? v(cells.get(k)) : v);
        dirty = true;
      },
    ];
  },
  useReducer: (red, init) => {
    const k = slot();
    if (!cells.has(k)) cells.set(k, init);
    return [
      cells.get(k),
      (a) => {
        cells.set(k, red(cells.get(k), a));
        dirty = true;
      },
    ];
  },
  useRef: (init) => {
    const k = slot();
    if (!cells.has(k)) cells.set(k, { current: init });
    return cells.get(k);
  },
  useMemo: (fn, deps) => memo(fn, deps),
  useCallback: (fn, deps) => memo(() => fn, deps),
  // A surface's value through the seam (use-surface.ts): what it holds when the component draws.
  useSyncExternalStore: (subscribe, snapshot) => snapshot(),
  useId: () => `id-${slot()}`,
  useEffect: (fn, deps) => {
    const k = slot();
    const prev = cells.get(k);
    if (prev && deps && same(prev.deps, deps)) return;
    if (prev && typeof prev.cleanup === "function") prev.cleanup();
    const cell = { deps, cleanup: undefined };
    cells.set(k, cell);
    cell.cleanup = fn();
  },
  Children: { map: (kids, fn) => (kids == null ? kids : [].concat(kids).flat(Infinity).map(fn)) },
  isValidElement: (n) => !!n && typeof n === "object" && "type" in n && "props" in n,
  cloneElement: (el, props) => ({ ...el, props: { ...el.props, ...props } }),
};
globalThis.ReactDOM = { createPortal: (node) => node };
await import("../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
// data-bits installs the shell tip on import, so the test tip -- where a pressed gate showed its reason -- goes on after it.
globalThis.window.__tip = { show: (el) => tipped.push(el) };
Object.assign(globalThis.window, kitPages);
useStubHooks();
for (const k of ["EmptyState", "FailedRead", "MoreMenu", "StatePill", "Confirm"]) globalThis[k] = globalThis.window[k];
const saved = [];
Object.assign(globalThis.window, {
  usePPToast: () => [null, () => {}],
  CHANLY: { nav() {}, R: { admin: (pane) => `admin/${pane}` } },
  __chrome: { state: stateOf },
  // The real clock (contracts clock.ts), pinned to a zone and a now, rather
  // than lookalikes: hand-written ones answered three of its methods and the
  // page threw the first time it asked for a fourth.
  __clock: (() => {
    const TZ = "America/New_York";
    const NOW = Date.parse("2026-09-17T18:00:00Z");
    return {
      zone: () => TZ,
      stamp: (ms) => clockStamp(ms, TZ, NOW),
      time: (ms) => clockTime(ms, TZ),
      dayKey: (ms) => zoneDayKey(ms, TZ),
      dateYear: (ms) => clockDateYear(ms, TZ),
      dayLabel: (ms) => clockDayLabel(ms, TZ, NOW),
    };
  })(),
  __href: (key) => `/api/v1/${key.split(" ")[1]}?workspace=studio`,
  __saveSettings: (config, version, accepted) => {
    saved.push({ config, version });
    accepted();
    return Promise.resolve({ ok: true });
  },
  __identity: {
    member: ({ email, display_name }) => ({ name: display_name || email, sub: display_name ? email : null }),
    initials: (name, email) =>
      String(name || email)
        .slice(0, 2)
        .toUpperCase(),
    words: (me) => ({ name: me.display_name || me.email, email: me.email }),
  },
  __inviteState: () => ({ expired: false, words: "invite pending" }),
});
await import("../receptionist/business-tab/_business-parts.mjs");
// The role store the gates ask (window.ST_STORE): the bridge installs it as the app boots (seed-globals), settings.jsx used to.
const { installRoleStore } = await import("../../../../apps/dashboard/src/legacy-bridge/identity.ts");
installRoleStore();
// The page is the TSX module (decision 0015 step 11); it imports every pane it draws. Activity's reads are the bridge's
// `activity` object, which a test stands its own feed in on; Notifications reads the settings read over the seam and
// saves through the bridge's saveSettings; Autonomy's rows are the seam's policies and its one door is a module object a
// test stands a door in on; Team's roster is the seam's settings value.
const { SettingsPage } = await import("../../../../apps/dashboard/src/surfaces/settings/frame/page.tsx");
const { activity } = await import("../../../../apps/dashboard/src/legacy-bridge/activity.ts");
const { pageClock } = await import("../../../../apps/dashboard/src/legacy-bridge/zone.ts");
// The log's lists are the kit's Select (Base UI's, which the suite stands in for): a test finds one by its type. The
// boxes are their own chunk, asked for as the pane is drawn; loaded once here, the pane finds them at its first draw.
const { Select } = await import("../../../../apps/dashboard/src/surfaces/kit/select/select.tsx");
const { loadBoxes } = await import("../../../../apps/dashboard/src/surfaces/settings/activity/narrowing.tsx");
await loadBoxes();
/** The log's reads answered by `f`: the module's object, which the pane imports. */
const stand = (f) => Object.assign(activity, f);
const { setSurfaceValue } = await import("../../../../apps/dashboard/src/surfaces/surface-values.ts");
const { autonomyVerbs } = await import("../../../../apps/dashboard/src/surfaces/settings/autonomy/verbs.ts");
// The Team tab is the Partner pane's Team (settings/partner/team-card.tsx): the roster, then the workspace's partner
// card, an owner's read answered here as refused, so the card stays out of what these tests look at.
const { partnerVerbs } = await import("../../../../apps/dashboard/src/surfaces/settings/partner/surface.ts");
partnerVerbs.team.read = async () => ({ ok: false, code: "forbidden", message: "Only an owner can do this." });

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) {
    for (const k of n) walk(k, fn);
    return;
  }
  fn(n);
  walk(n.props?.children, fn);
  walk(n.rendered, fn);
};
// A drawn component is walked twice, as the children it was given and as what it rendered: each node counts once.
const all = (tree, pred) => {
  const out = [];
  const seen = new Set();
  walk(tree, (n) => {
    if (!seen.has(n) && pred(n)) {
      seen.add(n);
      out.push(n);
    }
  });
  return out;
};
const find = (tree, pred) => all(tree, pred)[0] ?? null;
const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return textOf(n.props?.children);
};
const buttonSaying = (tree, words) => find(tree, (n) => n.type === "button" && textOf(n).trim() === words);
const labelled = (tree, tag, label) => find(tree, (n) => n.type === tag && n.props["aria-label"] === label);
const pressOf = () => ({
  prevented: false,
  stopped: false,
  currentTarget: { control: true },
  preventDefault() {
    this.prevented = true;
  },
  stopPropagation() {
    this.stopped = true;
  },
});
const press = (node) => {
  const e = pressOf();
  node.props.onClick(e);
  return e;
};
const type = (node, value) => node.props.onChange({ target: { value } });
const flush = () => new Promise((r) => setImmediate(r));
const fresh = () => {
  cells = new Map();
  saved.length = 0;
  tipped.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
};
const draw = (tab) => {
  frames = [{ key: "root", hook: 0, kids: {} }];
  dirty = false;
  lastTree = SettingsPage({ tab, onTab() {} });
  return lastTree;
};
const settings = (tab) => {
  fresh();
  return draw(tab);
};
const again = draw;
const settle = (tab) => (dirty ? draw(tab) : lastTree);

/** A real workspace as the settings surface reads it, seen by `role`; no View-as preview. */
const workspace = (role, over = {}) => {
  Object.assign(globalThis.window, {
    __ME: { email: "dana@northside.example", role, display_name: "Dana" },
    __SETTINGS: {
      role,
      version: 3,
      config: {
        brain: { business_name: "Northside Studio", booking_link: "https://book.example/northside" },
        notifications: { escalation_emails: ["dana@northside.example", "desk@northside.example"] },
      },
    },
    __FACTS: {
      facts: {
        business_name: { value: "Northside Studio", source: "typed" },
        voice_line: { value: "+13055550100", source: "provisioned" },
        phone_display: { value: "+1 (305) 555-0100", source: "provisioned" },
        handoff_number: { value: null, source: "absent" },
        address: { value: null, source: "absent" },
      },
      conflicts: [],
    },
    __TEAM: [
      { membershipId: "m-dana", email: "dana@northside.example", displayName: "Dana", role: "owner" },
      { membershipId: "m-lee", email: "lee@northside.example", displayName: "Lee", role: "operator" },
    ],
    __TEAM_INVITES: [],
    ...over,
  });
  // The seam's settings value beside the globals it copies (legacy-bridge/surfaces/settings.ts), for the moved panes.
  setSurfaceValue("settings", {
    settings: globalThis.window.__SETTINGS,
    facts: globalThis.window.__FACTS,
    channels: null,
    templatesAll: null,
    templateUse: null,
    templateSent: null,
    policies: globalThis.window.__POLICIES ?? null,
    team: globalThis.window.__TEAM ?? null,
    invites: globalThis.window.__TEAM_INVITES ?? null,
  });
  globalThis.window.ST_STORE.viewAsRole = null;
};

/** The activity bridge, answering when told to: each read waits for `answer`. */
const feed = (people = []) => {
  const asked = [];
  const waiting = [];
  return {
    asked,
    waiting,
    list: (f) => {
      asked.push(f);
      return new Promise((resolve) => waiting.push(resolve));
    },
    people: async () => people,
  };
};
/** An answer as this tab may still hold one from before the log said names and members: `over` adds them. */
const answer = (resolve, rows, kinds = ["message.sent", "call.ended"], over = {}) =>
  resolve({ ok: true, message: "", data: { rows, actors: {}, kinds, page: { has_more: false }, ...over } });
const entry = (id, text) => ({
  id,
  at: "2026-09-15T14:00:00Z",
  text,
  source: "decision",
  actor_type: "human",
  actor_user_id: null,
  subject_type: null,
  subject_id: null,
});
const rowsOn = (tree) => all(tree, (n) => n.props?.["data-testid"] === "act-row");

/* ------------------------------ one gate ------------------------------ */

test("REGRESSION (one gate): Notifications offers its Add to a role that may not press it, gated, and says why once -- it was disabled with a title", () => {
  const reason = "Only an owner can change who is alerted.";
  workspace("operator");
  const tree = settings("notifications");
  const add = buttonSaying(tree, "Add");
  assert.ok(add, "the pane's act is on the page");
  assert.equal(add.props["aria-disabled"], true, "REGRESSION: it was disabled, and a disabled button takes no focus");
  assert.equal(add.props.disabled, false);
  assert.equal(add.props.title, undefined, "no title that nothing but a mouse reaches");
  assert.equal(add.props["data-tip"], reason);
  const box = labelled(tree, "input", "Add an address to alert");
  assert.equal(box.props["aria-disabled"], true, "the address box says so too");
  assert.equal(box.props["aria-description"], reason);
  assert.equal(buttonSaying(tree, "Remove"), null, "removing an address is not offered to a role that may not");
  assert.equal(textOf(tree).split(reason).length - 1, 1, "and the pane says why, once");
  const e = press(add);
  assert.ok(e.prevented, "pressing it does nothing");
  assert.equal(tipped.length, 1, "but shows the reason where the control is");
  assert.equal(saved.length, 0);

  workspace("owner");
  const own = settings("notifications");
  assert.equal(buttonSaying(own, "Add").props["aria-disabled"], undefined, "an owner's Add is an ordinary button");
  assert.equal(
    all(own, (n) => n.type === "button" && textOf(n).trim() === "Remove").length,
    2,
    "with one Remove per address",
  );
  assert.ok(!textOf(own).includes(reason));
});

test("REGRESSION (one gate): Your data keeps its download on the card for a role that may not take it, gated -- the link was absent", () => {
  workspace("operator");
  const tree = settings("workspace");
  const link = byTestId(tree, "set-export-all");
  assert.ok(link, "REGRESSION: the download was not on the page");
  assert.equal(link.props["aria-disabled"], true);
  assert.equal(link.props["data-tip"], "Only an owner can download the workspace's data.");
  assert.ok(press(link).prevented, "a gated link downloads nothing");

  workspace("owner");
  const own = byTestId(settings("workspace"), "set-export-all");
  assert.equal(own.props["aria-disabled"], undefined);
  assert.equal(own.props.href, "/api/v1/export?workspace=studio");
});

test("REGRESSION (one gate): Team shows Invite to a role that may not invite, gated, and says why in contracts' words -- it hid Invite under a sentence of its own", () => {
  workspace("operator");
  let tree = settings("team");
  const invite = buttonSaying(tree, "Invite");
  assert.ok(invite, "REGRESSION: the card's act was hidden");
  assert.equal(invite.props["aria-disabled"], true);
  assert.equal(invite.props["data-tip"], "Only an owner can invite a teammate.");
  press(invite);
  tree = again("team");
  assert.equal(
    find(tree, (n) => n.type === "input" && n.props.type === "email"),
    null,
    "pressing it opens nothing",
  );
  assert.ok(textOf(tree).includes("Only an owner can change the team."), "the card says why once, as the gate says it");

  // An owner previewing as an operator sees what an operator sees; as themself, an ordinary Invite.
  workspace("owner");
  globalThis.window.ST_STORE.viewAsRole = "operator";
  assert.equal(buttonSaying(settings("team"), "Invite").props["aria-disabled"], true, "View-as narrows the gate");
  globalThis.window.ST_STORE.viewAsRole = null;
  assert.equal(buttonSaying(settings("team"), "Invite").props["aria-disabled"], undefined, "and an owner may");
});

test("REGRESSION (one gate): Activity follows an owner's View-as preview like every other gate -- it asked the signed-in role", () => {
  workspace("owner");
  const A = stand(feed());
  globalThis.window.ST_STORE.viewAsRole = "viewer";
  const tree = settings("activity");
  assert.ok(
    textOf(tree).includes("Only an owner can read the activity log"),
    "REGRESSION: a preview as a viewer read the whole log",
  );
  assert.equal(A.asked.length, 0, "and nothing is read for it");
  globalThis.window.ST_STORE.viewAsRole = null;
});

/* ------------------------------ Activity ------------------------------ */

/** Pick an option of one of the log's lists (the kit's Select, or its Combobox), as a person does. */
const pick = (tree, id, value) => byTestId(tree, id).props.onValueChange(value);
/** Every option a list offers, with its value and its words. */
const optionsOf = (box) => box.props.options.map((o) => [o.value, o.label]);
/** The day picker (the kit's), drawn only while one day is what was asked for. */
const dayPicker = (tree) => find(tree, (n) => n.props?.label === ACTIVITY_PAGE_WORDS.when.pick && !!n.props?.today);

test("REGRESSION (S21): Activity says it is reading and names its filters -- the first load showed nothing, and three filters had no name", async () => {
  workspace("owner");
  const A = stand(feed([{ id: "c-ana", name: "Ana Ruiz", phone: null }]));
  let tree = settings("activity");
  assert.equal(A.asked.length, 1, "the log is read once");
  const reading = () => byTestId(tree, "act-loading");
  const card = () => byTestId(tree, "set-activity");
  assert.equal(textOf(reading()), "Reading the activity log…", "REGRESSION: the pane was blank while it read");
  assert.deepEqual(
    [reading().props.role, reading().props.className],
    ["status", "rec-sr"],
    "REGRESSION (8 Oct): the sentence came and went above the rows and moved every one of them twice; it is said to a screen reader alone",
  );
  assert.equal(card().props["data-loading"], "", "the card says it is reading, and what it marks dims in place");
  assert.equal(byTestId(tree, "act-rows").props["data-dims"], "", "the rows are what dims");
  assert.ok(
    String(card().props.className).split(" ").includes("rec-card"),
    "the kit's record card, as Profile's and Partner's are: it stood on the older flat card",
  );
  for (const id of ["act-area", "act-who", "act-when", "act-person-q"]) {
    assert.ok(String(byTestId(tree, id)?.props.label || "").length > 2, `REGRESSION: ${id} had no name`);
  }
  answer(A.waiting[0], [entry("e1", "Dana changed the business details")]);
  await flush();
  tree = settle("activity");
  assert.equal(textOf(reading()), "", "and stops saying so when the answer lands");
  assert.equal(card().props["data-loading"], undefined);
  assert.equal(rowsOn(tree).length, 1);
  assert.equal(byTestId(tree, "act-clear"), null, "nothing narrows the log, so there is nothing to clear");

  // Narrowed to one person, the way back to everyone is named too. The box is the kit's Combobox, and what it lists
  // is the workspace's answer to the words typed (its onQuery), not the kit's own narrowing of a list it was given.
  byTestId(tree, "act-person-q").props.onQuery("Ana");
  settle("activity");
  await new Promise((r) => setTimeout(r, 300));
  await flush();
  tree = settle("activity");
  assert.deepEqual(optionsOf(byTestId(tree, "act-person-q")), [["c-ana", "Ana Ruiz"]], "who matches, as its list");
  pick(tree, "act-person-q", "c-ana");
  tree = settle("activity");
  assert.equal(A.asked[A.asked.length - 1].person, "c-ana", "and the log is read for them");
  const clear = find(byTestId(tree, "act-person"), (n) => n.type === "button");
  assert.ok(
    String(clear?.props["aria-label"] || "").length > 2,
    "REGRESSION: the chip's clear button had only a title",
  );

  // The way back to the whole log is at the card's head, beside its title, only while something narrows it: under
  // the boxes it wrapped onto a line of its own.
  const head = find(tree, (n) => n.props?.className === "rec-card-head");
  const back = byTestId(head, "act-clear");
  assert.equal(textOf(back), "Clear");
  press(back);
  tree = settle("activity");
  assert.equal(A.asked[A.asked.length - 1].person, undefined, "one press, and the whole log is read again");
  assert.equal(byTestId(tree, "act-clear"), null);
  assert.equal(byTestId(tree, "act-person"), null, "the chip went with it");
});

test("what kind of thing is two short lists -- the part of the product, then its kinds in the rows' words -- and a pick reads the log once", async () => {
  workspace("owner");
  const A = stand(feed());
  settings("activity");
  answer(A.waiting[0], [], ["open_recording", "call.recorded", "message.sent", "appointment.changed"]);
  await flush();
  let tree = settle("activity");
  const area = byTestId(tree, "act-area");
  assert.equal(
    area.type,
    Select,
    "REGRESSION (8 Oct): the kit's Select, its list on the panel's pop as every menu's is; the browser's own list drew itself in the system's colours, whatever the look",
  );
  assert.deepEqual(
    optionsOf(area),
    [
      ["", "All activity"],
      ["only:problems", "What went wrong or was stopped"],
      ["family:conversations", "Conversations"],
      ["family:calls", "Calls"],
      ["family:calendar", "Calendar"],
    ],
    "REGRESSION (8 Oct): one list held every kind of every part, two hundred lines of it; the first holds the parts alone",
  );
  assert.equal(byTestId(tree, "act-kind"), null, "no second box until a part is picked: it would have nothing to list");

  pick(tree, "act-area", "family:calls");
  tree = settle("activity");
  assert.equal(A.asked.length, 2, "a pick asks once");
  assert.deepEqual([A.asked[1].kind, A.asked[1].family], [undefined, "calls"]);
  const kinds = byTestId(tree, "act-kind");
  assert.deepEqual(
    optionsOf(kinds),
    [
      ["family:calls", "All kinds"],
      ["kind:open_recording", "Listened to a call's recording"],
      ["kind:call.recorded", "A call was recorded"],
    ],
    "REGRESSION: the picker listed kinds as the ledgers spell them, in a browser's datalist",
  );
  assert.ok(String(kinds.props.label || "").length > 2, "and the second list has a name of its own");
  pick(tree, "act-kind", "kind:open_recording");
  tree = settle("activity");
  assert.equal(A.asked.length, 3);
  assert.deepEqual([A.asked[2].kind, A.asked[2].family], ["open_recording", undefined]);
  assert.deepEqual(
    [byTestId(tree, "act-area").props.value, byTestId(tree, "act-kind").props.value],
    ["family:calls", "kind:open_recording"],
    "the first box still says the part its kind is in",
  );
  pick(tree, "act-kind", "family:calls");
  tree = settle("activity");
  assert.deepEqual([A.asked[3].kind, A.asked[3].family], [undefined, "calls"], "All kinds is the part whole again");
  pick(tree, "act-area", "only:problems");
  tree = settle("activity");
  assert.deepEqual([A.asked[4].family, A.asked[4].only], [undefined, "problems"]);
  assert.equal(byTestId(tree, "act-kind"), null, "what went wrong is not a part: it has no kinds to list");

  // An empty log says why: narrowed, the filters are, and the way back is offered; whole, nothing has happened yet.
  answer(A.waiting[4], []);
  await flush();
  tree = settle("activity");
  assert.ok(textOf(tree).includes("Nothing here for that."), "narrowed to nothing");
  assert.ok(buttonSaying(tree, "Clear the filters"), "with the way back");
  pick(tree, "act-area", "");
  settle("activity");
  answer(A.waiting[5], []);
  await flush();
  tree = settle("activity");
  assert.ok(
    textOf(tree).includes("Nothing has happened yet."),
    "REGRESSION: a new workspace read 'Nothing here for that'",
  );
  assert.equal(buttonSaying(tree, "Clear the filters"), null, "and nothing to clear");
});

test("the log is narrowed to who did it and to a span of days; one day asks for its day before it narrows", async () => {
  workspace("owner");
  const A = stand(feed());
  settings("activity");
  answer(A.waiting[0], [], undefined, { members: [{ id: "u-lee", name: "Lee" }] });
  await flush();
  let tree = settle("activity");
  assert.deepEqual(optionsOf(byTestId(tree, "act-who")), [
    ["", "Anyone"],
    ["u-lee", "Lee"],
    ["receptionist", "Receptionist"],
    ["system", "System"],
  ]);
  pick(tree, "act-who", "u-lee");
  tree = settle("activity");
  assert.equal(A.asked[1].actor, "u-lee", "REGRESSION: the log named who did it and could not be read for one of them");

  assert.equal(dayPicker(tree), null, "no day picker until one day is what was asked for");
  pick(tree, "act-when", "week");
  tree = settle("activity");
  const { from, to } = A.asked[2];
  assert.match(String(from), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal((Date.parse(to) - Date.parse(from)) / 86_400_000, 6, "seven days, today among them");
  pick(tree, "act-when", "yesterday");
  tree = settle("activity");
  assert.equal(A.asked[3].from, A.asked[3].to, "one day");
  assert.equal((Date.parse(to) - Date.parse(A.asked[3].to)) / 86_400_000, 1, "the one before today");
  pick(tree, "act-when", "day");
  tree = settle("activity");
  assert.deepEqual([A.asked[4].day, A.asked[4].from], [undefined, undefined], "any day, until one is picked");
  assert.ok(
    byTestId(tree, "act-clear"),
    "One day is a narrowing begun: the way back is offered before a day is picked",
  );
  assert.equal(
    dayPicker(tree).props.today,
    pageClock().dayKey(Date.now()),
    "the kit's date picker, told today in the workspace's zone",
  );
  dayPicker(tree).props.onValueChange("2026-09-15");
  settle("activity");
  assert.equal(A.asked[5].day, "2026-09-15");
});

test("REGRESSION (S21): a slow answer never lands over a newer one", async () => {
  workspace("owner");
  const A = stand(feed());
  settings("activity");
  answer(A.waiting[0], [entry("e0", "The first page")]);
  await flush();
  let tree = settle("activity");
  pick(tree, "act-area", "family:conversations");
  tree = settle("activity");
  pick(tree, "act-area", "family:calls");
  settle("activity");
  assert.equal(A.asked.length, 3);
  answer(A.waiting[2], [entry("e2", "A call ended")]);
  await flush();
  settle("activity");
  answer(A.waiting[1], [entry("e1", "A message was sent")]);
  await flush();
  tree = settle("activity");
  assert.deepEqual(
    rowsOn(tree).map((r) => textOf(r).includes("A call ended")),
    [true],
    "REGRESSION: the older answer replaced the newer one",
  );
});

test("REGRESSION (8 Oct): a hundred recordings opened in a minute were a hundred lines -- rows of one kind by one hand on one day are one, and open with a press", async () => {
  workspace("owner");
  const A = stand(feed());
  settings("activity");
  const heard = (i) => ({
    ...entry(`d-${i}`, "Listened to a call's recording"),
    kind: "open_recording",
    at: `2026-09-15T14:0${i}:00Z`,
    actor_type: "user",
    actor_user_id: "u-dana",
    subject_type: "call",
    subject_id: `k${i}`,
  });
  const failed = {
    ...entry("e-9", "A message could not be sent"),
    kind: "message.send_failed",
    source: "event",
    actor_type: null,
    subject_type: "conversation",
    subject_id: "cv9",
  };
  answer(A.waiting[0], [heard(3), heard(2), heard(1), failed], ["open_recording", "message.send_failed"], {
    actors: { "u-dana": "Dana" },
    subjects: { "call:k3": "Ana Ruiz", "call:k2": "Lee Park", "conversation:cv9": "Ana Ruiz" },
  });
  await flush();
  let tree = settle("activity");
  assert.deepEqual(
    rowsOn(tree).map((r) => textOf(find(r, (n) => n.props?.className === "act-what"))),
    [
      `Dana · Listened to 3 calls' recordings · since ${pageClock().time(Date.parse("2026-09-15T14:01:00Z"))}`,
      "A message could not be sent · Ana Ruiz",
    ],
    "one line for the three, in the bell's own way of saying several; a row says who it was about, by name",
  );
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "act-member").length, 0, "shut until asked");
  // A row is one press, as a bell's note is: its door where it has a page, its fold where it stands for several.
  const [foldRow, failedRow] = rowsOn(tree);
  assert.equal(failedRow.type, "a", "a row with a page is its own door, and a door is a link");
  assert.ok(String(failedRow.props.href).endsWith("inbox/th-cv9"), failedRow.props.href);
  assert.deepEqual(
    [foldRow.type, foldRow.props["aria-expanded"], foldRow.props["aria-label"]],
    ["button", false, "Dana · Listened to 3 calls' recordings: show them"],
    "the whole row is the press that shows them, and says so",
  );
  press(foldRow);
  tree = settle("activity");
  assert.deepEqual(
    [rowsOn(tree)[0].props["aria-expanded"], rowsOn(tree)[0].props["aria-label"]],
    [true, "Dana · Listened to 3 calls' recordings: hide them"],
  );
  assert.deepEqual(
    all(tree, (n) => n.props?.["data-testid"] === "act-member").map((m) => [m.type, String(m.props.href ?? "")]),
    [
      ["a", failedRow.props.href.replace("inbox/th-cv9", "conversations/cv-k3")],
      ["a", failedRow.props.href.replace("inbox/th-cv9", "conversations/cv-k2")],
      ["a", failedRow.props.href.replace("inbox/th-cv9", "conversations/cv-k1")],
    ],
    "each row under it opens its own call",
  );
  assert.deepEqual(
    all(tree, (n) => n.props?.["data-testid"] === "act-member").map((m) =>
      textOf(find(m, (n) => n.props?.className === "act-what")),
    ),
    ["Ana Ruiz", "Lee Park", "Listened to a call's recording"],
    "each row under it says what the line has not: whose call, or its own sentence where no name was read",
  );
  assert.equal(
    textOf(find(tree, (n) => n.props?.className === "act-day-n tally")),
    "4",
    "the day says how many things happened, folded or not",
  );

  // Asked for by name, its rows are what the reader came to read: none is folded.
  pick(tree, "act-area", "family:calls");
  tree = settle("activity");
  pick(tree, "act-kind", "kind:open_recording");
  settle("activity");
  answer(A.waiting[2], [heard(3), heard(2), heard(1)]);
  await flush();
  tree = settle("activity");
  assert.equal(rowsOn(tree).length, 3);
});

/* ------------------------------- Autonomy ------------------------------- */
// The matrix's columns were the four words the mode is FILED under -- Auto, Veto,
// Ask, Never -- with the plain sentence for each hidden in a hover the phone
// cannot trigger. And the money row put a tick under one of them, which stops
// being true the moment the headings say what a mode does.

/** The autonomy pane over real policy rows, as the settings read publishes them, seen by `role`. */
const autonomy = (rows, over = {}, role = "owner") => {
  workspace(role, { ...over, __POLICIES: { role, rows } });
  autonomyVerbs.setPolicy = async () => ({ ok: true });
  return settings("autonomy");
};
const headCells = (tree) =>
  all(tree, (n) => n.props?.className === "pol-mode").map((n) => ({
    head: textOf(find(n, (k) => k.props?.className === "pol-mode-head")),
    sub: textOf(find(n, (k) => k.props?.className === "pol-mode-sub")),
  }));

test("on a phone the matrix is one line per class: its mode is a word that opens a menu of the modes it takes, and a locked class says so", () => {
  // 24 Sep: the table of four columns collapsed into four captioned dots under every label on a phone, 107px a row.
  // Settings reads its own breakpoint (useSetPhone, 640px); the desktop keeps the matrix, which the tests above draw.
  const W = globalThis.window;
  const was = W.matchMedia;
  W.matchMedia = (q) => ({ matches: q === "(max-width: 640px)", addEventListener() {}, removeEventListener() {} });
  try {
    let tree = autonomy([{ class: "reply", mode: "veto", limits: {} }]);
    assert.equal(
      find(tree, (n) => n.props?.className === "pol-table"),
      null,
      "no table on a phone",
    );
    // A line per class is the record kit's row, named `pol-phone-<class>` (its mode's trigger is `pol-phone-mode-<class>`).
    const rows = all(
      tree,
      (n) =>
        String(n.props?.className || "").includes("rec-row") &&
        /^pol-phone-(?!mode-)/.test(String(n.props?.["data-testid"] || "")),
    );
    assert.ok(rows.length >= 2, "one line per class");
    const reply = byTestId(tree, "pol-phone-reply");
    assert.match(textOf(reply), /Replies to customers/);
    const trigger = byTestId(tree, "pol-phone-mode-reply");
    assert.equal(trigger.props["aria-haspopup"], "menu", "its mode is a menu");
    assert.match(textOf(trigger), /Holds it/, "the word is the mode's, as the matrix's heading says it");
    assert.equal(all(reply, (n) => n.props?.role === "menuitemradio").length, 0, "closed until pressed");
    press(trigger);
    tree = settle("autonomy");
    const items = all(byTestId(tree, "pol-phone-reply"), (n) => n.props?.role === "menuitemradio");
    assert.deepEqual(
      items.map((i) => [textOf(find(i, (k) => k.props?.className === "more-item-label")), i.props["aria-checked"]]),
      [
        ["Sends it", false],
        ["Holds it", true],
        ["Asks you", false],
        ["Stays quiet", false],
      ],
      "the four modes, the one in force ticked",
    );
    // The locked class is a line that says so, with nothing to press.
    const money = byTestId(tree, "pol-phone-money");
    assert.ok(money, "the charter's row is drawn");
    assert.match(textOf(money), /locked by charter/);
    assert.equal(byTestId(money, "pol-phone-mode-money"), null, "and opens nothing");
  } finally {
    W.matchMedia = was;
  }
});

test("on a phone the reply dials are a word that opens their steps, and a desktop keeps the segmented control", () => {
  // 25 Sep: five dials drew a 50px strip of 44px buttons under every label on a phone, 110px a row.
  const W = globalThis.window;
  const was = W.matchMedia;
  W.matchMedia = (q) => ({ matches: q === "(max-width: 640px)", addEventListener() {}, removeEventListener() {} });
  try {
    let tree = autonomy([{ class: "reply", mode: "veto", limits: { max_replies_day: 20, pause_hours: 4 } }]);
    // The element drawn, not the dial's own element, which carries the same name.
    const drawn = (t) => find(t, (n) => typeof n.type === "string" && n.props?.["data-testid"] === "aut-reply-cap");
    const cap = drawn(tree);
    assert.equal(cap.props["aria-haspopup"], "menu", "the dial is a menu on a phone");
    assert.match(textOf(cap), /20/, "its word is the value in force");
    press(cap);
    tree = settle("autonomy");
    const steps = all(tree, (n) => n.props?.role === "menuitemradio");
    assert.ok(steps.length >= 2, "the steps, as radio items");
    assert.equal(steps.filter((i) => i.props["aria-checked"]).length, 1, "the one in force ticked");
    assert.equal(all(tree, (n) => n.props?.className === "rec-seg").length, 0, "no segmented strip on a phone");
  } finally {
    W.matchMedia = was;
  }
  const desk = autonomy([{ class: "reply", mode: "veto", limits: { max_replies_day: 20, pause_hours: 4 } }]);
  assert.equal(
    find(desk, (n) => typeof n.type === "string" && n.props?.["data-testid"] === "aut-reply-cap").props.role,
    "radiogroup",
    "a desktop keeps the dial",
  );
});

test("the matrix's headings say what the receptionist does, not how the mode is filed", () => {
  const tree = autonomy([{ class: "reply", mode: "veto", limits: {} }]);
  assert.deepEqual(
    headCells(tree).map((c) => c.head),
    ["Sends it", "Holds it", "Asks you", "Stays quiet"],
    "REGRESSION: the columns read Auto · Veto · Ask · Never, and a salon owner does not say veto",
  );
  assert.deepEqual(
    headCells(tree).map((c) => c.sub),
    ["right away", "you can stop it", "nothing sent", "nothing happens"],
  );
  // The words are contracts', said once.
  assert.deepEqual(
    headCells(tree).map((c) => c.head),
    POLICY_MODES.map((m) => POLICY_MODE_WORDS[m].head),
  );
  // No heading names a duration: a reply waits the workspace's hold window and a
  // playbook run waits thirty minutes, so "30s" would be wrong on four rows.
  for (const c of headCells(tree)) assert.ok(!/\d/.test(c.head + c.sub), `"${c.head} ${c.sub}" names a number`);
});

test("a phone names each dot with the same words -- it is a list there, and the headings are hidden", () => {
  const tree = autonomy([{ class: "reply", mode: "veto", limits: {} }]);
  const cells = all(tree, (n) => n.props?.className === "pol-cell");
  const names = [...new Set(cells.map((n) => n.props["data-mode"]))];
  assert.deepEqual(
    names,
    ["Sends it", "Holds it", "Asks you", "Stays quiet"],
    "REGRESSION: .pol-cell::before printed Auto/Veto/Ask/Never on a phone",
  );
});

test("a control says what it will do, in the words above it", () => {
  const tree = autonomy([{ class: "reply", mode: "veto", limits: {} }]);
  const dots = all(tree, (n) => n.type === "button" && /^Replies to customers: /.test(n.props["aria-label"] || ""));
  assert.deepEqual(
    dots.map((d) => d.props["aria-label"]),
    [
      "Replies to customers: Sends it",
      "Replies to customers: Holds it",
      "Replies to customers: Asks you",
      "Replies to customers: Stays quiet",
    ],
    "REGRESSION: a screen reader heard the filing word",
  );
  assert.equal(
    dots[1].props.title,
    POLICY_MODE_WORDS.veto.does,
    "the whole sentence is still there, on the control rather than the heading",
  );
  assert.equal(dots[1].props["aria-pressed"], true, "and the stored mode is still the one shown");
});

test("the row the charter fixes states its rule instead of ticking a column that would misdescribe it", () => {
  const tree = autonomy([{ class: "reply", mode: "auto", limits: {} }]);
  const fixed = find(tree, (n) => n.props?.className === "pol-fixed");
  assert.ok(fixed, "REGRESSION: money was three dashes and a tick under Never");
  assert.equal(fixed.props.colSpan, 4, "across every mode column: there is nothing to pick");
  const words = textOf(fixed);
  assert.match(words, /always goes to you/i, "the charter's own words (POLICY_CLASS_WORDS.money.note)");
  assert.match(words, /locked by charter, enforced in the database/);
  // "Stays quiet · nothing happens" is the one thing money is not: it comes to you.
  assert.ok(!/Stays quiet/.test(words));
  const moneyRow = find(tree, (n) => n.type === "tr" && /Refunds/.test(textOf(n)));
  assert.equal(
    find(moneyRow, (n) => n.props?.className === "set-mark"),
    null,
    "and the note is not also behind an info mark",
  );
  assert.equal(
    all(moneyRow, (n) => n.type === "button" && (n.props.className || "").includes("pol-dot")).length,
    0,
    "nothing to press",
  );
});

test("a class that cannot honour a mode still shows a dash there, and the rest still set", async () => {
  const put = [];
  const tree = autonomy([
    { class: "faq", mode: "auto", limits: {} },
    { class: "reply", mode: "ask", limits: {} },
  ]);
  autonomyVerbs.setPolicy = async (cls, mode) => {
    put.push([cls, mode]);
    return { ok: true };
  };
  const faq = find(tree, (n) => n.type === "tr" && /Service/.test(textOf(n)));
  assert.equal(
    all(faq, (n) => n.props?.className === "pol-dash").length,
    2,
    "Holds it and Stays quiet are not on offer for a question",
  );
  const asks = all(
    faq,
    (n) => n.type === "button" && n.props["aria-label"] === "Service & pricing questions: Asks you",
  );
  press(asks[0]);
  await flush();
  assert.deepEqual(put, [["faq", "ask"]], "REGRESSION: the heading changed and the stored word went with it");
});

test("F50: every dot and dial asks the autonomy gate, and a dial sends itself alone, never the row's mode", async () => {
  // PUT /policies is an operator's or the owner's: the matrix keeps its own gate, where the business form asks
  // settings'. A viewer's dots and steps say why when pressed, and send nothing.
  const sent = [];
  const tree = autonomy([{ class: "reply", mode: "ask", limits: {} }], {}, "viewer");
  autonomyVerbs.setPolicy = async (...args) => {
    sent.push(args);
    return { ok: true };
  };
  const dots = all(tree, (n) => n.type === "button" && String(n.props.className || "").startsWith("pol-dot"));
  assert.ok(dots.length > 0 && dots.every((d) => d.props["aria-disabled"] === true), "a viewer's dots are gated");
  const steps = all(tree, (n) => n.type === "button" && n.props.role === "radio");
  assert.ok(steps.length > 0 && steps.every((b) => b.props["aria-disabled"] === true), "and so are the dials' steps");
  press(dots[0]);
  await flush();
  assert.equal(sent.length, 0, "a gated press sends nothing");

  // An owner's dial edit: the one dial, and no mode with it (a stale tab resent its remembered mode once).
  let own = autonomy([{ class: "reply", mode: "ask", limits: {} }]);
  autonomyVerbs.setPolicy = async (...args) => {
    sent.push(args);
    return { ok: true };
  };
  const step = (t, label, words) => {
    const row = find(t, (n) => String(n.props?.className || "").includes("rec-row") && textOf(n).startsWith(label));
    return find(row, (n) => n.type === "button" && n.props.role === "radio" && textOf(n).trim() === words);
  };
  press(step(own, "Hold window", "1m"));
  await flush();
  own = settle("autonomy");
  press(step(own, "Send on its own only when it's sure", "75%"));
  await flush();
  assert.deepEqual(sent, [
    ["reply", undefined, { replyDelayMs: 60000 }],
    ["reply", undefined, { minConfidence: 0.75 }],
  ]);
});

test("an open invitation's menu offers no role: there is no membership row to change it on, only Revoke", () => {
  // The server looks a role change's id up among members and answers "not on this team" for an invitation; the role
  // was chosen when it was sent.
  workspace("owner", {
    __TEAM_INVITES: [{ id: "inv-sam", email: "sam@northside.example", role: "viewer", expires_at: null }],
  });
  const tree = settings("team");
  const menus = all(tree, (n) => typeof n.type === "function" && Array.isArray(n.props?.items));
  const labels = (m) => m.props.items.map((i) => i.header || i.label || (i.divider ? "—" : "")).filter(Boolean);
  const member = menus.find((m) => labels(m).includes("Remove"));
  const invitation = menus.find((m) => labels(m).includes("Revoke invite"));
  assert.ok(member && invitation, "a member's menu and an invitation's");
  assert.ok(labels(member).includes("Role"), "a member's role can change");
  assert.deepEqual(labels(invitation), ["Revoke invite"], "an invitation's cannot");
});

test("a team read that failed is said, with the server's role kept; a roster read says You by the signed-in email", () => {
  // Only the team read failed: the settings read still gave the caller's role, so an owner keeps View-as, and nobody is
  // invented -- no rows, no menus, no Invite over a roster that could not be read.
  workspace("owner", { __TEAM: null, __TEAM_INVITES: null });
  let tree = settings("team");
  assert.ok(byTestId(tree, "team-failed"), "the one failed read");
  assert.ok(byTestId(tree, "team-viewas"), "an owner, as the server says, keeps View-as");
  assert.equal(
    all(tree, (n) => String(n.props?.className || "").startsWith("set-team-row")).length,
    0,
    "nobody invented",
  );
  assert.equal(buttonSaying(tree, "Invite"), null, "no Invite over a roster that could not be read");
  workspace("operator", { __TEAM: null, __TEAM_INVITES: null });
  tree = settings("team");
  assert.equal(byTestId(tree, "team-viewas"), null, "an operator, as the server says, has none");
  // A roster read: You is the row whose address is the signed-in one, and only that row.
  workspace("owner");
  tree = settings("team");
  const rows = all(tree, (n) => String(n.props?.className || "").startsWith("set-team-row"));
  const you = rows.filter((r) => find(r, (n) => n.props?.className === "chip set-team-you"));
  assert.equal(you.length, 1, "You, once");
  assert.ok(textOf(you[0]).includes("dana@northside.example") || textOf(you[0]).includes("Dana"), textOf(you[0]));
});

test("your name is a row on Profile, never in the Team card", () => {
  // It lived inside the Team card under a roster of other people, while the account menu's "Your name" pointed there.
  workspace("owner");
  assert.ok(byTestId(settings("profile"), "set-you-change"), "Profile says your name, with its Change");
  assert.equal(byTestId(settings("team"), "set-you-change"), null, "the roster is other people");
});

/* ------------------------------ the rail's question ------------------------------ */

test("the rail asks before a pane holding changes goes, and in words that are true of a save that is out", () => {
  // Task 3.2's review: with a row's save out the rail still asked "Leave without saving?", of a change that was being
  // saved, and its yes stopped nothing. The record kit says when a save is out (kit/record/registry.ts saving()), and the
  // page asks the registry itself (it imports recFolds), so an open fold with a dirty test and a save-is-out test is the question.
  const folds = globalThis.window.__recordFolds;
  let unsaved = false;
  let saving = false;
  const unbind = folds.bind(
    "hours",
    () => unsaved,
    () => saving,
  );
  const went = [];
  const drawRail = () => {
    frames = [{ key: "root", hook: 0, kids: {} }];
    dirty = false;
    lastTree = SettingsPage({ tab: "profile", onTab: (id) => went.push(id) });
    return lastTree;
  };
  const railTab = (tree, label) =>
    find(
      tree,
      (n) => n.type === "button" && (n.props.className || "").includes("set-nav-row") && textOf(n).trim() === label,
    );
  try {
    workspace("owner");
    fresh();
    folds.reset();
    unsaved = true;
    saving = false;
    folds.request("hours");
    press(railTab(drawRail(), "Team"));
    let ask = byTestId(drawRail(), "set-leave-confirm");
    assert.match(textOf(ask), /Leave without saving\?/);
    assert.match(textOf(ask), /Nothing you changed on this tab has been saved\./);
    assert.deepEqual(went, [], "nothing goes until it is answered");
    press(byTestId(drawRail(), "set-leave-no"));
    assert.equal(byTestId(drawRail(), "set-leave-confirm"), null);

    // A save is out: the change is on its way, so nothing is "unsaved", and the words say what leaving does.
    unsaved = false;
    saving = true;
    press(railTab(drawRail(), "Team"));
    // The words are kept from the moment it asked: the save landing while the question is up does not turn it into
    // "have not been saved", which by then is the opposite of true.
    saving = false;
    ask = byTestId(drawRail(), "set-leave-confirm");
    assert.match(textOf(ask), /Leave while this saves\?/);
    assert.match(textOf(ask), /on its way and carries on without this page/);
    assert.doesNotMatch(textOf(ask), /has been saved/);
    press(byTestId(drawRail(), "set-leave-yes"));
    assert.deepEqual(went, ["team"]);
  } finally {
    unbind();
    folds.reset();
  }
});

test("F32: a config the parser refuses closes every notifications write, and says why on each", () => {
  // The bridge reads a refused config as its own state: no config, and what was wrong (legacy-bridge/surfaces/settings.ts).
  workspace("owner", {
    __SETTINGS: { role: "owner", version: 3, config: null, broken: { issues: ["brain.business_name"] } },
  });
  const tree = settings("notifications");
  const why = "This workspace's settings can't be read — Chanlytics has to repair them before anything here can change";
  const add = buttonSaying(tree, "Add");
  const box = labelled(tree, "input", "Add an address to alert");
  assert.equal(box.props.disabled, true, "nothing can be typed to save over the broken row");
  assert.equal(box.props.title, why);
  type(box, "new@northside.example");
  const typed = settle("notifications");
  assert.equal(buttonSaying(typed, "Add").props.disabled, true, "and Add stays closed with an address typed");
  assert.equal(add.props.title, why);
  assert.equal(buttonSaying(tree, "Remove"), null, "nothing was read, so there is nothing to remove");
  assert.equal(saved.length, 0);
});

test("Notifications lists what is sent in contracts' groups, the Reach-outs group among them, and offers no switch (N2)", () => {
  workspace("owner");
  const tree = settings("notifications");
  assert.ok(
    textOf(byTestId(tree, "notif-recipients")).includes("except the two marked for Chanlytics"),
    "the recipients' card says which alerts are not theirs (F36)",
  );
  assert.ok(
    textOf(byTestId(tree, "notif-recipients")).includes(NOTIFICATION_PANE_WORDS.recipients),
    "in contracts' words",
  );
  const kinds = byTestId(tree, "notif-kinds");
  assert.ok(
    textOf(kinds).includes("What is not listed here is not emailed."),
    "the list is closed, and says so (B16): every kind the edge emails is in it, and notify() mails no other",
  );
  const groups = all(kinds, (n) => n.props?.["data-testid"] === "notif-group");
  assert.deepEqual(
    groups.map((g) => textOf(find(g, (n) => n.type === "h3"))),
    NOTIFICATION_KIND_GROUPS.map((g) => g.title),
    "every group contracts lists, in its order",
  );
  assert.deepEqual(
    groups.map((g) =>
      all(g, (n) => n.props?.className === "set-row").map((r) =>
        textOf(find(r, (n) => n.props?.className === "set-row-label")).trim(),
      ),
    ),
    // A row for Chanlytics wears the chip "to Chanlytics" in its label.
    NOTIFICATION_KIND_GROUPS.map((g) => g.rows.map((r) => r.title + (r.platform ? "to Chanlytics" : ""))),
    "and every row of each",
  );
  const reach = groups[NOTIFICATION_KIND_GROUPS.findIndex((g) => g.title === "Reach-outs")];
  const rows = all(reach, (n) => n.props?.className === "set-row").map((r) =>
    textOf(find(r, (n) => n.props?.className === "set-row-label")).trim(),
  );
  assert.deepEqual(rows, [
    "They wrote back",
    "A reach-out waits for you",
    "A reach-out holds an email for you",
    "A sending domain is held, and when it sends again",
    "The day's numbers",
  ]);
  assert.equal(
    all(kinds, (n) => n.type === "input" || n.props?.role === "switch").length,
    0,
    "rows that say what is sent, never a switch no code reads",
  );
  assert.equal(
    all(
      groups[NOTIFICATION_KIND_GROUPS.findIndex((g) => g.title === "To Chanlytics")],
      (n) => n.props?.className === "chip set-notif-platform",
    ).length,
    2,
    "to Chanlytics",
  );
});

// B16 (audit, 2 Oct 2026): the pane said "Sent from the Chanlytics alert address until your own sending domain is
// verified". Nothing writes notifications.from, and nothing swaps the sender for a sending domain the workspace verifies
// (the sending domains are for campaigns): the sentence promised a feature there is not. It says where the mail comes from.
test("Notifications says where its mail is sent from, and promises no sending domain that changes it (B16)", () => {
  workspace("owner");
  const bare = textOf(settings("notifications"));
  assert.ok(bare.includes(NOTIFICATION_PANE_WORDS.sentFromPlatform), "no own address: the platform's, said as it is");
  assert.ok(
    !bare.includes("until your own sending domain is verified") && !/sending domain is verified/.test(bare),
    "REGRESSION: promised a switch to the workspace's own sending domain that nothing makes",
  );
  workspace("owner", {
    __SETTINGS: {
      role: "owner",
      version: 3,
      config: {
        brain: { business_name: "Northside Studio" },
        notifications: { escalation_emails: ["dana@northside.example"], from: "Northside <alerts@northside.example>" },
      },
    },
  });
  const own = textOf(settings("notifications"));
  assert.ok(
    own.includes(`${NOTIFICATION_PANE_WORDS.sentFrom} Northside <alerts@northside.example>.`),
    "the config's own",
  );
  assert.ok(!own.includes(NOTIFICATION_PANE_WORDS.sentFromPlatform));
});
