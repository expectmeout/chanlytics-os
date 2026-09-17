/**
 * One door over one table: Conversations and Live are views of the Inbox, not places of their own.
 *
 * Read in the code, 17 Sep 2026: surface-data.ts inboxOverride (:261) and conversationsOverride (:400) each
 * await read("GET conversations") -- the Inbox joins escalations and keeps the subset that waits on a decision,
 * Conversations joins calls and keeps all of them. Two nav items over one dataset asked an owner who could not
 * tell them apart to check both, every time.
 *
 * The nav loses Conversations; the SurfaceTabs strip gains Needs you · Conversations · Live, the pattern that
 * already carries Campaigns' three tabs. Every route is unchanged, and so is every read.
 *
 * The pages are drawn LOADED, on a stub React -- lint and the build never run this tree.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

/* -------------------------------- a browser -------------------------------- */

let cells = [];
let seq = 0;
globalThis.Icon = "Icon";
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") node.rendered = type(props);
    return node;
  },
  useState: (init) => { const k = seq++; if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init; return [cells[k], (v) => { cells[k] = typeof v === "function" ? v(cells[k]) : v; }]; },
  useReducer: (red, init) => { const k = seq++; if (!(k in cells)) cells[k] = init; return [cells[k], (a) => { cells[k] = red(cells[k], a); }]; },
  useRef: (init) => { const k = seq++; if (!(k in cells)) cells[k] = { current: init }; return cells[k]; },
  useMemo: (fn) => { const k = seq++; if (!(k in cells)) cells[k] = fn(); return cells[k]; },
  useEffect: (fn) => { const k = seq++; if (!(k in cells)) { cells[k] = true; fn(); } },
  useCallback: (fn) => fn,
};
globalThis.window = {
  location: { hash: "", pathname: "/w/melanys", origin: "https://app.chanlytics.com" },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  CHANLY: { nav() {}, agentIdFor: (n) => String(n).toLowerCase().replace(/ /g, "-") },
  usePPToast: () => [null, () => {}],
  gate: () => ({}),
  canDo: () => true,
  gateTitle: () => null,
  __DEMO_MODE: false,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return true; },
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
};
globalThis.document = { addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } };

const win = globalThis.window;
await import("../../../apps/dashboard/src/legacy/components/sidebar.jsx");
await import("../../../apps/dashboard/src/legacy/components/surface-tabs.jsx");

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) { for (const k of n) walk(k, fn); return; }
  fn(n);
  walk(n.props?.children, fn);
  walk(n.rendered, fn);
};
const findAll = (tree, pred) => { const out = []; walk(tree, (n) => { if (pred(n)) out.push(n); }); return out; };
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  return n.rendered !== undefined ? textOf(n.rendered) : textOf(n.props?.children);
};
const hasClass = (n, cls) => typeof n.props?.className === "string" && n.props.className.split(" ").includes(cls);

/** The real sidebar, drawn with `active` as the shell reports it. */
const nav = (active) => {
  cells = [];
  seq = 0;
  const tree = win.Sidebar({ active, onNavigate() {} });
  return findAll(tree, (n) => hasClass(n, "nav-item")).map((n) => ({
    label: textOf(n.props.children.find((c) => c && c.type === "span")),
    active: hasClass(n, "active"),
  }));
};

/** The tab strip at a route, as the shell renders it above the pane. */
const strip = (page, param = null) => {
  cells = [];
  seq = 0;
  const tree = win.SurfaceTabs({ page, param, onNavigate() {} });
  if (!tree) return null;
  return tree.props.children.map((b) => ({
    label: textOf(b.props.children.filter((c) => typeof c === "string")).trim(),
    active: hasClass(b, "active"),
    badge: textOf(findAll(b, (n) => hasClass(n, "stabs-badge"))[0]) || null,
  }));
};

/* ------------------------------- the nav rail ------------------------------- */

test("the nav is seven places, and Conversations is not one of them", () => {
  assert.deepEqual(
    nav("home").map((i) => i.label),
    ["Today", "Inbox", "People", "Calendar", "Campaigns", "Reports", "Settings"],
    "REGRESSION: Conversations was a second nav item over the table the Inbox already reads",
  );
});

test("every conversation route highlights the Inbox -- its views never light a place of their own", () => {
  for (const at of ["inbox", "conversations", "live", "calls", "chats", "email"]) {
    const lit = nav(at).filter((i) => i.active).map((i) => i.label);
    assert.deepEqual(lit, ["Inbox"], `at ${at}: one item lit, and it is the Inbox`);
  }
});

test("the other merged surfaces keep their own item", () => {
  assert.deepEqual(nav("clients").filter((i) => i.active).map((i) => i.label), ["People"]);
  assert.deepEqual(nav("broadcasts").filter((i) => i.active).map((i) => i.label), ["Campaigns"]);
  assert.deepEqual(nav("calendar").filter((i) => i.active).map((i) => i.label), ["Calendar"]);
});

/* ------------------------------- the tab strip ------------------------------- */

test("the Inbox strip offers the three views, and says which one you are on", () => {
  win.INBOX_DATA = { THREADS: [] };
  const labels = ["Needs you", "Conversations", "Live"];
  assert.deepEqual(strip("inbox").map((t) => t.label), labels);
  assert.deepEqual(strip("inbox").filter((t) => t.active).map((t) => t.label), ["Needs you"]);
  assert.deepEqual(strip("conversations").filter((t) => t.active).map((t) => t.label), ["Conversations"]);
  assert.deepEqual(strip("live").filter((t) => t.active).map((t) => t.label), ["Live"]);
  // A channel filter is the page's own control (conversations.jsx `.cv-filters`), never a second copy up here.
  assert.deepEqual(strip("conversations", "phone").map((t) => t.label), labels, "the strip does not change with the channel");
});

test("the strip's badge is the count that already exists, not a second reading of it", () => {
  win.ixWaitsOnYou = (t) => !!t.needsYou;
  win.INBOX_DATA = { THREADS: [
    { id: "c1", real: true, needsYou: true },
    { id: "c2", real: true, needsYou: true },
    { id: "c3", real: true, needsYou: false },
  ] };
  assert.equal(win.sbNeedsCount(), 2, "the fixture holds two that wait on you");
  assert.equal(strip("inbox")[0].badge, "2", "REGRESSION: the tab counted rows of its own");
  win.INBOX_DATA = { THREADS: [{ id: "c3", real: true, needsYou: false }] };
  assert.equal(strip("inbox")[0].badge, null, "nothing waiting draws no badge");
  delete win.ixWaitsOnYou;
});

test("the strip is not drawn on a surface that has no second view", () => {
  for (const page of ["today", "calendar", "reports", "admin"]) {
    assert.equal(strip(page), null, `${page} is one place`);
  }
});
