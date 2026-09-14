/**
 * The shell says where you are and how fresh it is.
 *
 * Every tab read "Chanlytics OS", whichever page, person or pane it held, so a
 * row of them could not be told apart. What the shell knew about freshness sat
 * in one line at the sidebar's foot, which a phone keeps inside its drawer and
 * the rail cuts to an icon, and it knew less than there was to say: a device
 * gone offline was never mentioned, a live feed that dropped was written to the
 * console and nowhere else, and a surface that stopped refreshing offered
 * nothing to press. A session that ended mid-page went to /login without the
 * page, so signing in again landed on Today.
 *
 * Now the tab is named from the crumbs the shell draws, most particular first,
 * with what needs you counted in front; one line under the top bar says the one
 * thing that is wrong, on every screen size, with the one press that helps; and
 * the page's hash rides to /login and back. Run without a browser: the words
 * from contracts, the bridge over a window that keeps its listeners, the shell
 * and the line mounted on a stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pageTitle, shellStatusLine, toBillingVM } from "@chanlytics/contracts";
import { importSrc } from "./_source.mjs";

const tick = () => new Promise((r) => setTimeout(r, 0));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = async (n = 8) => { for (let i = 0; i < n; i += 1) await tick(); };

/* ---------------------------------- the words ---------------------------------- */

test("the tab is named from where you are, most particular first, with what needs you counted in front", () => {
  assert.equal(pageTitle(["Today"]), "Today · Chanlytics");
  assert.equal(pageTitle([{ label: "Inbox", to: "inbox" }, "Rosa"]), "Rosa · Inbox · Chanlytics", "a narrow tab keeps the first words, so those are the ones that tell tabs apart");
  assert.equal(pageTitle([{ label: "Settings", to: "admin" }, "Billing"], 3), "(3) Billing · Settings · Chanlytics", "a tab in the background still says someone is waiting");
  for (const none of [0, -2, Number.NaN, undefined]) assert.equal(pageTitle(["Today"], none), "Today · Chanlytics", `${none} counts nothing`);
  assert.equal(pageTitle(["  ", { label: "" }, "Reports"]), "Reports · Chanlytics", "an empty crumb is not a word");
  assert.equal(pageTitle(null), "Chanlytics");
});

test("the shell's one line says the one thing that is wrong, what it means for you, and the one press that helps", () => {
  const fine = { stale: false, degraded: [] };
  assert.equal(shellStatusLine(null), null);
  assert.equal(shellStatusLine(fine), null, "nothing wrong says nothing");
  assert.deepEqual(shellStatusLine({ ...fine, offline: true }), {
    kind: "offline", tone: "warn", text: "You're offline",
    detail: "What's on screen may be out of date. It catches up when you're back online.",
    action: null, cta: null, busy: null,
  }, "nothing to press: coming back reads everything again by itself");
  assert.deepEqual(shellStatusLine({ ...fine, paused: true }), {
    kind: "paused", tone: "danger", text: "Your receptionist is paused",
    detail: "New messages still land in the Inbox, for you to answer.",
    action: "billing", cta: "Billing", busy: null,
  });
  assert.deepEqual(shellStatusLine({ ...fine, stale: true }), {
    kind: "stale", tone: "info", text: "A newer version is ready",
    detail: null,
    action: "reload", cta: "Reload", busy: null,
  });
  assert.deepEqual(shellStatusLine({ ...fine, degraded: ["Inbox"] }), {
    kind: "degraded", tone: "warn", text: "Inbox stopped refreshing",
    detail: "You're seeing what was last loaded.",
    action: "retry", cta: "Retry", busy: "Retrying…",
  });
  assert.equal(shellStatusLine({ ...fine, degraded: ["Inbox", "Calendar"] }).text, "Inbox and Calendar stopped refreshing");
  assert.equal(shellStatusLine({ ...fine, degraded: ["Inbox", "Calendar", "Calls"] }).text, "Inbox, Calendar and Calls stopped refreshing");
  assert.deepEqual(shellStatusLine({ ...fine, disconnected: true }), {
    kind: "disconnected", tone: "info", text: "Live updates aren't coming through",
    detail: "Reconnecting. Until then, refresh to see anything new.",
    action: "retry", cta: "Refresh now", busy: "Refreshing…",
  });
});

test("one line at a time, in the order that matters: offline, a pause, a newer build, what stopped refreshing, the live feed", () => {
  let s = { stale: true, degraded: ["Inbox"], paused: true, offline: true, disconnected: true };
  const said = [];
  for (const cleared of ["offline", "paused", "stale", "degraded", "disconnected"]) {
    said.push(shellStatusLine(s).kind);
    s = { ...s, [cleared]: cleared === "degraded" ? [] : false };
  }
  assert.deepEqual(said, ["offline", "paused", "stale", "degraded", "disconnected"]);
  assert.equal(shellStatusLine(s), null);
});

/* ---------------------------- a browser, kept small ---------------------------- */

const heard = new Map();
const win = {
  location: {
    pathname: "/w/acme",
    search: "",
    hash: "#/inbox/th-1",
    assigned: [],
    reloads: 0,
    assign(url) { win.location.assigned.push(url); },
    replace() {},
    reload() { win.location.reloads += 1; },
  },
  addEventListener(type, fn) { if (!heard.has(type)) heard.set(type, new Set()); heard.get(type).add(fn); },
  removeEventListener(type, fn) { heard.get(type)?.delete(fn); },
  dispatchEvent(ev) { for (const fn of [...(heard.get(ev.type) ?? [])]) fn(ev); return true; },
};
/** What the browser would fire. */
const fire = (type) => win.dispatchEvent({ type });
globalThis.window = win;
globalThis.document = { title: "Chanlytics OS", visibilityState: "hidden", body: { style: {} }, addEventListener() {}, removeEventListener() {} };

const status = await importSrc("apps/dashboard/src/legacy-bridge/surface-status.ts");
const realtime = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");
const runner = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
const shell = await importSrc("apps/dashboard/src/legacy-bridge/shell.ts");
const workspace = await importSrc("apps/dashboard/src/legacy-bridge/workspace.ts");
const bridgeApi = await importSrc("apps/dashboard/src/legacy-bridge/api.ts");
const { ApiError } = await importSrc("apps/dashboard/src/client/api.ts");

/** Surfaces that record each read. */
const surfaces = (...keys) => {
  const asked = [];
  return { asked, overrides: keys.map((key) => ({ key, debounceMs: 1, apply: async () => { asked.push(key); } })) };
};

/* --------------------------------- the bridge --------------------------------- */

test("the connection is one fact the shell listens to, and each change is said once", () => {
  let told = 0;
  const off = status.onSurfaceStatusChange(() => { told += 1; });
  status.setConnection({ offline: true });
  status.setConnection({ offline: true });
  assert.deepEqual(status.getConnection(), { offline: true, realtimeDown: false });
  assert.equal(told, 1, "the same fact twice is not news");
  status.setConnection({ offline: false, realtimeDown: true });
  assert.equal(told, 2, "two parts changing at once is one change");
  status.setConnection({ realtimeDown: false });
  off();
  assert.deepEqual(status.getConnection(), { offline: false, realtimeDown: false });
});

test("offline is said the moment the browser says so, and back online every surface is read again at once", async () => {
  const { asked, overrides } = surfaces("inbox", "calendar");
  const stop = runner.startSurfaces(overrides);
  await settle();
  asked.length = 0;
  fire("offline");
  assert.equal(status.getConnection().offline, true);
  fire("online");
  assert.equal(status.getConnection().offline, false);
  await sleep(20);
  assert.deepEqual([...asked].sort(), ["calendar", "inbox"], "what changed while away is read now, not at the next focus");
  fire("offline");
  stop();
  assert.equal(status.getConnection().offline, false, "a runner that stopped leaves nothing said");
  fire("offline");
  assert.equal(status.getConnection().offline, false, "and listens to nothing");
});

test("the live feed: a blip it rejoins is not news, a drop that outlasts the grace is, and every rejoin reads what it missed", async () => {
  const said = [];
  let reads = 0;
  const feed = realtime.feedWatch({ graceMs: 15, onDown: (down) => said.push(down), onReconnect: () => { reads += 1; } });
  feed.onStatus("SUBSCRIBED");
  assert.equal(reads, 0, "the first join is not a reconnect");
  feed.onStatus("CHANNEL_ERROR");
  await sleep(4);
  feed.onStatus("SUBSCRIBED");
  await sleep(30);
  assert.deepEqual(said, [], "rejoined inside the grace: never shown");
  assert.equal(reads, 1, "but the gap is read: postgres changes carry no backfill");
  feed.onStatus("TIMED_OUT");
  feed.onStatus("CHANNEL_ERROR");
  await sleep(30);
  assert.deepEqual(said, [true], "still down after the grace, and said once however many errors");
  feed.onStatus("SUBSCRIBED");
  assert.deepEqual(said, [true, false], "back, and said at once");
  assert.equal(reads, 2);
  feed.onStatus("CLOSED");
  feed.stop();
  await sleep(30);
  assert.deepEqual(said, [true, false], "the runner's own teardown closes the channel, and a stopped watch says nothing");
});

test("Retry reads every surface again, through the runner that is running", async () => {
  shell.installShell(win);
  const { asked, overrides } = surfaces("inbox", "today");
  await win.__shell.retry();
  assert.deepEqual(asked, [], "no runner, nothing to read");
  const stop = runner.startSurfaces(overrides);
  await settle();
  asked.length = 0;
  await win.__shell.retry();
  assert.deepEqual([...asked].sort(), ["inbox", "today"]);
  stop();
});

test("the status is published whenever any part of it changes, and only then", () => {
  const page = { dispatched: 0, dispatchEvent() { page.dispatched += 1; return true; } };
  shell.publishShellStatus({ stale: false, degraded: [] }, page);
  shell.publishShellStatus({ stale: false, degraded: [] }, page);
  assert.equal(page.dispatched, 1);
  shell.publishShellStatus({ stale: false, degraded: [], offline: true }, page);
  assert.equal(page.dispatched, 2, "going offline is news: the old comparison looked at the build and the surfaces only");
  shell.publishShellStatus({ stale: false, degraded: [], offline: true, disconnected: true }, page);
  assert.equal(page.dispatched, 3, "so is the live feed dropping");
  const labels = { inbox: "Inbox", today: "Today", calendar: "Calendar", people: "People" };
  const statuses = new Map([["inbox", "degraded"], ["today", "live"], ["calendar", "degraded"], ["people", "seeded"]]);
  assert.deepEqual(
    shell.shellStatusOf(statuses, { offline: false, realtimeDown: true }, true, labels),
    { stale: true, degraded: ["Inbox", "Calendar"], offline: false, disconnected: true },
    "a surface that never loaded is its page's to say, not the line's",
  );
});

test("a session that ends mid-page signs in again to the same page: the hash rides to /login and back", async () => {
  assert.equal(workspace.signInHref("#/inbox/th-1"), "/login#/inbox/th-1");
  for (const none of ["", "#", undefined, null, "#access_token=abc"]) assert.equal(workspace.signInHref(none), "/login", `${none} is not a page`);

  // The client's 401, on any read or write.
  const page = {
    location: { hash: "#/clients/p-9", assigned: [], assign(url) { page.location.assigned.push(url); } },
    fetch: async () => new Response(JSON.stringify({ ok: false, error: { code: "unauthorized" } }), { status: 401 }),
  };
  await bridgeApi.apiFor(page)("GET workspaces");
  assert.deepEqual(page.location.assigned, ["/login#/clients/p-9"]);

  // The runner's, when a surface's own read is refused.
  win.location.hash = "#/calendar";
  win.location.assigned = [];
  const stop = runner.startSurfaces([{ key: "inbox", apply: async () => { throw new ApiError("unauthorized", 401, "signed out"); } }]);
  await settle();
  stop();
  assert.deepEqual(win.location.assigned, ["/login#/calendar"]);
  win.location.hash = "#/inbox/th-1";
});

/* ---------------------------------- the page ---------------------------------- */

let cells = [];
let seq = 0;
/** Deep for the line, which is all in one file; shallow for the shell, whose children are other files' pages. */
let deep = true;
globalThis.Icon = "Icon";
globalThis.React = {
  Fragment: "Fragment",
  Component: class {},
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (deep && typeof type === "function") node.rendered = type(props);
    return node;
  },
  useState: (init) => { const k = seq++; if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init; return [cells[k], (v) => { cells[k] = typeof v === "function" ? v(cells[k]) : v; }]; },
  useReducer: (red, init) => { const k = seq++; if (!(k in cells)) cells[k] = init; return [cells[k], (a) => { cells[k] = red(cells[k], a); }]; },
  useRef: (init) => { const k = seq++; if (!(k in cells)) cells[k] = { current: init }; return cells[k]; },
  useMemo: (fn) => { const k = seq++; if (!(k in cells)) cells[k] = fn(); return cells[k]; },
  useEffect: (fn) => { const k = seq++; if (!(k in cells)) { cells[k] = true; fn(); } },
  useCallback: (fn) => fn,
};
await import("../../../apps/dashboard/src/legacy/components/topbar.jsx");
await import("../../../apps/dashboard/src/legacy/pages/settings.jsx");
await import("../../../apps/dashboard/src/legacy/pages/app-shell.jsx");

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) { for (const k of n) walk(k, fn); return; }
  fn(n);
  walk(n.props?.children, fn);
  walk(n.rendered, fn);
};
const find = (tree, pred) => { let hit; walk(tree, (n) => { if (hit === undefined && pred(n)) hit = n; }); return hit; };
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  return textOf(n.props?.children) + textOf(n.rendered);
};

test("the line under the top bar: a live region that is always there, the words, and the one press", async () => {
  const kept = win.__shell;
  deep = true;
  cells = [];
  const bar = () => { seq = 0; return win.ShellStatusBar({}); };
  const cta = (tree) => find(tree, (n) => n.props?.["data-testid"] === "shell-status-cta");
  win.__chrome = { statusLine: shellStatusLine };

  win.__SHELL_STATUS = { stale: false, degraded: [] };
  let tree = bar();
  assert.equal(tree.props.role, "status");
  assert.equal(tree.props["aria-live"], "polite", "mounted while all is well, so the next change is announced");
  assert.equal(find(tree, (n) => n.props?.["data-testid"] === "shell-status"), undefined, "and empty");

  win.__SHELL_STATUS = { stale: false, degraded: [], offline: true };
  tree = bar();
  assert.match(textOf(tree), /You're offline/);
  assert.equal(cta(tree), undefined, "nothing to press without a connection to press it with");

  let retried = 0;
  let finish = () => {};
  win.__shell = { retry: () => { retried += 1; return new Promise((r) => { finish = r; }); } };
  win.__SHELL_STATUS = { stale: false, degraded: ["Inbox", "Calendar"] };
  tree = bar();
  assert.match(textOf(tree), /Inbox and Calendar stopped refreshing/);
  assert.match(textOf(tree), /You're seeing what was last loaded\./);
  assert.equal(textOf(cta(tree)), "Retry");
  cta(tree).props.onClick();
  tree = bar();
  assert.equal(textOf(cta(tree)), "Retrying…", "the press is answered where it was made");
  assert.equal(cta(tree).props["aria-busy"], true);
  assert.notEqual(cta(tree).props.disabled, true, "busy, not disabled: the focus stays on the button");
  cta(tree).props.onClick();
  assert.equal(retried, 1, "a second press while it reads is not a second read");
  finish();
  await settle();
  tree = bar();
  assert.equal(textOf(cta(tree)), "Retry");

  // The pause rides with the billing surface, in the shape the billing read keeps.
  const price = { id: "price_1", currency: "usd", unit_amount: 4900, interval: "month", product_name: "Chanlytics OS" };
  const account = { mode: "stripe", status: "paused", price_id: "price_1", current_period_end: null, trial_end: null, cancel_at: null, cancel_at_period_end: false, card_brand: null, card_last4: null, last_payment_failed_at: null, last_paid_at: null, updated_at: "2026-09-07T14:00:00Z" };
  const dto = { ready: true, account, price, trial_days: 14, role: "owner" };
  assert.equal(toBillingVM(dto).paused, true, "the fixture is a paused account");
  win.__BILLING_ACCOUNT = { dto, fetchedAt: Date.now() };
  win.__billing = { vm: (d, nowMs) => toBillingVM(d, nowMs) };
  const went = [];
  win.CHANLY = { nav: (to) => went.push(to) };
  win.__SHELL_STATUS = { stale: true, degraded: [] };
  tree = bar();
  assert.match(textOf(tree), /Your receptionist is paused/, "and outranks a newer build");
  cta(tree).props.onClick();
  assert.deepEqual(went, ["admin/billing"]);

  delete win.__BILLING_ACCOUNT;
  tree = bar();
  assert.equal(textOf(cta(tree)), "Reload");
  cta(tree).props.onClick();
  assert.equal(win.location.reloads, 1);
  win.__shell = kept;
});

for (const name of ["Sidebar", "Topbar", "SurfaceTabs", "AskBar", "ShortcutsSheet", "Inbox", "ClientsA", "ClientProfile", "CalendarPage", "BroadcastsPage", "SettingsPage", "DashboardA"]) globalThis[name] = name;

/** The shell at `hash`, freshly mounted: its tree and the tab's name it left. */
const mount = (hash) => {
  deep = false;
  cells = [];
  seq = 0;
  win.location.hash = hash;
  globalThis.document.title = "Chanlytics OS";
  globalThis.ShellStatusBar = win.ShellStatusBar;
  const tree = win.ChanlyticsApp({ theme: "dark", themePref: "dark", sidebar: "open", onSidebar() {}, onTheme() {} });
  deep = true;
  return { tree, title: globalThis.document.title };
};

test("the shell names the tab from the crumbs it draws, counts what needs you, and puts the line directly under the top bar", () => {
  shell.installShell(win);
  win.ixRouteThread = (id) => ({ id, who: "Rosa" });
  win.INBOX_DATA = { THREADS: [{ id: "th-9", state: "needs" }, { id: "th-2", state: "escalated" }, { id: "th-3", state: "done" }] };
  const { tree, title } = mount("#/inbox/th-9");
  assert.equal(title, "(2) Rosa · Inbox · Chanlytics");
  const main = find(tree, (n) => n.props?.className === "main");
  const kids = main.props.children.filter((k) => k && typeof k === "object");
  const at = (type) => kids.findIndex((k) => k.type === type);
  assert.ok(at("Topbar") >= 0, "the top bar");
  assert.equal(at(win.ShellStatusBar), at("Topbar") + 1, "the line under it, above the page, on a phone as on a desk");
  win.INBOX_DATA = { THREADS: [] };
});

test("on a real workspace a crumb, and so the tab, never names the demo's people or lists", () => {
  win.CALENDAR_DATA = { CAL_WEEK: [{ appts: [{ id: "a-1", who: "Jordan Blake" }] }] };
  assert.equal(mount("#/calendar/a-1").title, "Jordan Blake · Calendar · Chanlytics", "the demo keeps its own");
  win.__CALENDAR = { vm: { bookingLink: null } };
  assert.equal(mount("#/calendar/a-1").title, "Calendar · Chanlytics", "a real calendar is not named from the seeds");

  win.CLIENT_SEGMENTS = [{ id: "lapsed-60", label: "Lapsed 60 days" }];
  win.__BROADCASTS = { rows: [], audiences: [{ kind: "list", id: "lapsed", label: "Lapsed", counts: null, hint: "" }] };
  assert.equal(mount("#/broadcasts/lapsed").title, "Lapsed · Broadcasts · Campaigns · Chanlytics", "a real audience by its own name");
  assert.equal(mount("#/broadcasts/lapsed-60").title, "Broadcasts · Campaigns · Chanlytics");

  win.__PEOPLE = { rows: [], lists: [{ id: "opted_in", label: "Opted in" }], saved: [] };
  assert.equal(mount("#/clients/seg:opted_in").title, "Opted in · People · Chanlytics");
  assert.equal(mount("#/clients/seg:lapsed-60").title, "List · People · Chanlytics");

  assert.equal(mount("#/admin").title, "Business · Settings · Chanlytics", "the pane the bare route opens, by name");
  assert.equal(mount("#/admin/memory").title, "AI memory · Settings · Chanlytics", "a retired route still answers, and says which");
  assert.equal(mount("#/admin/platform").title, "Profile · Settings · Chanlytics", "the back office is not named to a customer: the pane lands on Profile, and so does the crumb");
  win.__ME = { platform_admin: true };
  assert.equal(mount("#/admin/platform").title, "Back office · Settings · Chanlytics", "and for the people it is for, the crumb names it");
  delete win.__ME;
  for (const k of ["CALENDAR_DATA", "__CALENDAR", "CLIENT_SEGMENTS", "__BROADCASTS", "__PEOPLE"]) delete win[k];
});

test("the tab counts a real thread only when it needs you: one a teammate is answering, or one you have, is not waiting on you", () => {
  shell.installShell(win);
  win.ixRouteThread = (id) => ({ id, who: null });
  win.INBOX_DATA = {
    THREADS: [
      { id: "th-1", real: true, state: "escalated", needsYou: true, takenOver: false, claimedByOther: false },
      { id: "th-2", real: true, state: "escalated", needsYou: false, takenOver: false, claimedByOther: true },
      { id: "th-3", real: true, state: "escalated", needsYou: false, takenOver: true, claimedByOther: false },
    ],
  };
  assert.equal(mount("#/inbox").title, "(1) Inbox · Chanlytics", "REGRESSION: a teammate's thread was counted as needing you until the Inbox itself mounted");
  win.INBOX_DATA = { THREADS: [] };
});
