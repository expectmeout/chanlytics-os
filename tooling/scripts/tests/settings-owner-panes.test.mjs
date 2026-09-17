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
 * Run against settings.jsx and activity.jsx on a stub React, over data-bits' real gate and contracts' role table.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLE_PERMS, roleGate, stateOf, clockStamp, clockTime, clockDateYear, clockDayLabel, zoneDayKey } from "@chanlytics/contracts";

const TID = "t-studio";

/* ---------------------------------- the window ---------------------------------- */

const listeners = {};
const tipped = [];
const storage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.document = {
  body: { appendChild() {} }, activeElement: null, addEventListener() {}, removeEventListener() {}, getElementById: () => null,
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
globalThis.window = {
  location: { pathname: "/w/studio", hash: "#/admin/notifications", origin: "https://app.chanlytics.com", assign() {}, replace() {}, reload() {} },
  history: { replaceState() {} },
  innerHeight: 800,
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener: (type, fn) => { (listeners[type] ||= new Set()).add(fn); },
  removeEventListener: (type, fn) => { listeners[type]?.delete(fn); },
  dispatchEvent: (ev) => { for (const fn of [...(listeners[ev.type] || [])]) fn(ev); return true; },
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
const slot = () => { const f = frames[frames.length - 1]; return `${f.key}#${f.hook++}`; };
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
      try { node.rendered = type(props); } finally { frames.pop(); }
    }
    return node;
  },
  useState: (init) => {
    const k = slot();
    if (!cells.has(k)) cells.set(k, typeof init === "function" ? init() : init);
    return [cells.get(k), (v) => { cells.set(k, typeof v === "function" ? v(cells.get(k)) : v); dirty = true; }];
  },
  useReducer: (red, init) => { const k = slot(); if (!cells.has(k)) cells.set(k, init); return [cells.get(k), (a) => { cells.set(k, red(cells.get(k), a)); dirty = true; }]; },
  useRef: (init) => { const k = slot(); if (!cells.has(k)) cells.set(k, { current: init }); return cells.get(k); },
  useMemo: (fn, deps) => memo(fn, deps),
  useCallback: (fn, deps) => memo(() => fn, deps),
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
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
// data-bits installs the shell tip on import, so the test tip -- where a pressed gate showed its reason -- goes on after it.
globalThis.window.__tip = { show: (el) => tipped.push(el) };
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
  __saveSettings: (config, version, accepted) => { saved.push({ config, version }); accepted(); return Promise.resolve({ ok: true }); },
  __identity: {
    member: ({ email, display_name }) => ({ name: display_name || email, sub: display_name ? email : null }),
    initials: (name, email) => String(name || email).slice(0, 2).toUpperCase(),
    words: (me) => ({ name: me.display_name || me.email, email: me.email }),
  },
  __inviteState: () => ({ expired: false, words: "invite pending" }),
});
await import("../../../apps/dashboard/src/legacy/pages/settings.jsx");
await import("../../../apps/dashboard/src/legacy/pages/activity.jsx");

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) { for (const k of n) walk(k, fn); return; }
  fn(n);
  walk(n.props?.children, fn);
  walk(n.rendered, fn);
};
// A drawn component is walked twice, as the children it was given and as what it rendered: each node counts once.
const all = (tree, pred) => { const out = []; const seen = new Set(); walk(tree, (n) => { if (!seen.has(n) && pred(n)) { seen.add(n); out.push(n); } }); return out; };
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
const pressOf = () => ({ prevented: false, stopped: false, currentTarget: { control: true }, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } });
const press = (node) => { const e = pressOf(); node.props.onClick(e); return e; };
const type = (node, value) => node.props.onChange({ target: { value } });
const flush = () => new Promise((r) => setImmediate(r));
const fresh = () => { cells = new Map(); saved.length = 0; tipped.length = 0; for (const k of Object.keys(listeners)) delete listeners[k]; };
const draw = (tab) => { frames = [{ key: "root", hook: 0, kids: {} }]; dirty = false; lastTree = globalThis.window.SettingsPage({ tab, onTab() {} }); return lastTree; };
const settings = (tab) => { fresh(); return draw(tab); };
const again = draw;
const settle = (tab) => (dirty ? draw(tab) : lastTree);

/** A real workspace as the settings surface reads it, seen by `role`; no View-as preview. */
const workspace = (role, over = {}) => {
  Object.assign(globalThis.window, {
    __ME: { email: "dana@northside.example", role, display_name: "Dana" },
    __SETTINGS: {
      role, version: 3,
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
  globalThis.window.ST_STORE.viewAsRole = null;
};

/** The activity bridge, answering when told to: each read waits for `answer`. */
const feed = (people = []) => {
  const asked = [];
  const waiting = [];
  return {
    asked,
    waiting,
    list: (f) => { asked.push(f); return new Promise((resolve) => waiting.push(resolve)); },
    people: async () => people,
  };
};
const answer = (resolve, rows, kinds = ["message.sent", "call.ended"]) => resolve({ ok: true, message: "", data: { rows, actors: {}, kinds, page: { has_more: false } } });
const entry = (id, text) => ({ id, at: "2026-09-15T14:00:00Z", text, source: "decision", actor_type: "human", actor_user_id: null, subject_type: null, subject_id: null });
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
  assert.equal(all(own, (n) => n.type === "button" && textOf(n).trim() === "Remove").length, 2, "with one Remove per address");
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
  assert.equal(find(tree, (n) => n.type === "input" && n.props.type === "email"), null, "pressing it opens nothing");
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
  const A = (globalThis.window.__activity = feed());
  globalThis.window.ST_STORE.viewAsRole = "viewer";
  const tree = settings("activity");
  assert.ok(textOf(tree).includes("Only an owner can read the activity log"), "REGRESSION: a preview as a viewer read the whole log");
  assert.equal(A.asked.length, 0, "and nothing is read for it");
  globalThis.window.ST_STORE.viewAsRole = null;
});

/* ------------------------------ Activity ------------------------------ */

test("REGRESSION (S21): Activity says it is reading and names its filters -- the first load showed nothing, and three filters had no name", async () => {
  workspace("owner");
  const A = (globalThis.window.__activity = feed([{ id: "c-ana", name: "Ana Ruiz", phone: null }]));
  let tree = settings("activity");
  assert.equal(A.asked.length, 1, "the log is read once");
  assert.ok(byTestId(tree, "act-loading"), "REGRESSION: the pane was blank while it read");
  for (const id of ["act-kind", "act-day", "act-person-q"]) {
    assert.ok(String(byTestId(tree, id)?.props["aria-label"] || "").length > 2, `REGRESSION: ${id} had no name`);
  }
  answer(A.waiting[0], [entry("e1", "Dana changed the business details")]);
  await flush();
  tree = settle("activity");
  assert.equal(byTestId(tree, "act-loading"), null, "and stops saying so when the answer lands");
  assert.equal(rowsOn(tree).length, 1);

  // Narrowed to one person, the way back to everyone is named too.
  type(byTestId(tree, "act-person-q"), "Ana");
  tree = settle("activity");
  await new Promise((r) => setTimeout(r, 300));
  await flush();
  tree = settle("activity");
  press(buttonSaying(tree, "Ana Ruiz"));
  tree = settle("activity");
  const clear = find(byTestId(tree, "act-person"), (n) => n.type === "button");
  assert.ok(String(clear?.props["aria-label"] || "").length > 2, "REGRESSION: the chip's clear button had only a title");
});

test("REGRESSION (S21): the kind filter asks when a kind is chosen, not on every keystroke, and keeps what was typed", async () => {
  workspace("owner");
  const A = (globalThis.window.__activity = feed());
  let tree = settings("activity");
  answer(A.waiting[0], []);
  await flush();
  tree = settle("activity");
  for (const v of ["c", "ca", "call ", "call e"]) {
    type(byTestId(tree, "act-kind"), v);
    tree = settle("activity");
  }
  assert.equal(A.asked.length, 1, "REGRESSION: every keystroke read the log again");
  assert.equal(byTestId(tree, "act-kind").props.value, "call e", "REGRESSION: a typed space was eaten");
  byTestId(tree, "act-kind").props.onKeyDown({ key: "Enter", preventDefault() {} });
  tree = settle("activity");
  assert.equal(A.asked.length, 2, "Enter asks");
  assert.equal(A.asked[1].kind, "call e");
  type(byTestId(tree, "act-kind"), "call.ended");
  tree = settle("activity");
  assert.equal(A.asked.length, 3, "a kind the log offers asks as soon as it is picked");
  assert.equal(A.asked[2].kind, "call.ended");
});

test("REGRESSION (S21): a slow answer never lands over a newer one", async () => {
  workspace("owner");
  const A = (globalThis.window.__activity = feed());
  let tree = settings("activity");
  answer(A.waiting[0], [entry("e0", "The first page")]);
  await flush();
  tree = settle("activity");
  type(byTestId(tree, "act-kind"), "message.sent");
  tree = settle("activity");
  type(byTestId(tree, "act-kind"), "call.ended");
  tree = settle("activity");
  assert.equal(A.asked.length, 3);
  answer(A.waiting[2], [entry("e2", "A call ended")]);
  await flush();
  tree = settle("activity");
  answer(A.waiting[1], [entry("e1", "A message was sent")]);
  await flush();
  tree = settle("activity");
  assert.deepEqual(rowsOn(tree).map((r) => textOf(r).includes("A call ended")), [true], "REGRESSION: the older answer replaced the newer one");
});

test("Activity without its bridge says it cannot be read here, instead of reading for ever", () => {
  workspace("owner");
  delete globalThis.window.__activity;
  const tree = settings("activity");
  assert.equal(byTestId(tree, "act-loading"), null, "REGRESSION: it read for ever");
  assert.ok(byTestId(tree, "act-missing"));
});
