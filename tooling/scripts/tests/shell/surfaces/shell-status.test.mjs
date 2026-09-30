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
 * the page's route rides to /login and back. Run without a browser: the words
 * from contracts, the bridge over a window that keeps its listeners, the shell
 * and the line mounted on a stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pageTitle,
  parsePipelineRoute,
  pipelineViewLabel,
  shellStatusLine,
  toBillingVM,
  toLiveVM,
  LOOK_OPTIONS,
  LOOK_OFFERED,
} from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";
import { hookFrames } from "../../_hook-frames.mjs";
import { keysDrawn } from "../../_keys.mjs";
import { historyOf, legacyAddress } from "../address/_address.mjs";

const tick = () => new Promise((r) => setTimeout(r, 0));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = async (n = 8) => {
  for (let i = 0; i < n; i += 1) await tick();
};

/* ---------------------------------- the words ---------------------------------- */

test("the tab is named from where you are, most particular first, with what needs you counted in front", () => {
  assert.equal(pageTitle(["Today"]), "Today · Chanlytics");
  assert.equal(
    pageTitle([{ label: "Inbox", to: "inbox" }, "Rosa"]),
    "Rosa · Inbox · Chanlytics",
    "a narrow tab keeps the first words, so those are the ones that tell tabs apart",
  );
  assert.equal(
    pageTitle([{ label: "Settings", to: "admin" }, "Billing"], 3),
    "(3) Billing · Settings · Chanlytics",
    "a tab in the background still says someone is waiting",
  );
  for (const none of [0, -2, Number.NaN, undefined])
    assert.equal(pageTitle(["Today"], none), "Today · Chanlytics", `${none} counts nothing`);
  assert.equal(pageTitle(["  ", { label: "" }, "Reports"]), "Reports · Chanlytics", "an empty crumb is not a word");
  assert.equal(pageTitle(null), "Chanlytics");
});

test("the shell's one line says the one thing that is wrong, what it means for you, and the one press that helps", () => {
  const fine = { stale: false, degraded: [] };
  assert.equal(shellStatusLine(null), null);
  assert.equal(shellStatusLine(fine), null, "nothing wrong says nothing");
  assert.deepEqual(
    shellStatusLine({ ...fine, offline: true }),
    {
      kind: "offline",
      tone: "warn",
      text: "You're offline",
      detail: "What's on screen may be out of date. It catches up when you're back online.",
      action: null,
      cta: null,
      busy: null,
    },
    "nothing to press: coming back reads everything again by itself",
  );
  assert.deepEqual(shellStatusLine({ ...fine, paused: true }), {
    kind: "paused",
    tone: "danger",
    text: "Your receptionist is paused",
    detail: "Calls are answered only to take a message, and new messages wait in the Inbox for you to answer.",
    action: "billing",
    cta: "Billing",
    busy: null,
  });
  assert.deepEqual(shellStatusLine({ ...fine, stale: true }), {
    kind: "stale",
    tone: "info",
    text: "A newer version is ready",
    detail: null,
    action: "reload",
    cta: "Reload",
    busy: null,
  });
  assert.deepEqual(shellStatusLine({ ...fine, degraded: ["Inbox"] }), {
    kind: "degraded",
    tone: "warn",
    text: "Inbox stopped refreshing",
    detail: "You're seeing what was last loaded.",
    action: "retry",
    cta: "Retry",
    busy: "Retrying…",
  });
  assert.equal(
    shellStatusLine({ ...fine, degraded: ["Inbox", "Calendar"] }).text,
    "Inbox and Calendar stopped refreshing",
  );
  assert.equal(
    shellStatusLine({ ...fine, degraded: ["Inbox", "Calendar", "Calls"] }).text,
    "Inbox, Calendar and Calls stopped refreshing",
  );
  assert.deepEqual(shellStatusLine({ ...fine, disconnected: true }), {
    kind: "disconnected",
    tone: "info",
    text: "Live updates aren't coming through",
    detail: "Reconnecting. Until then, refresh to see anything new.",
    action: "retry",
    cta: "Refresh now",
    busy: "Refreshing…",
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
    assign(url) {
      win.location.assigned.push(url);
    },
    replace() {},
    reload() {
      win.location.reloads += 1;
    },
  },
  addEventListener(type, fn) {
    if (!heard.has(type)) heard.set(type, new Set());
    heard.get(type).add(fn);
  },
  removeEventListener(type, fn) {
    heard.get(type)?.delete(fn);
  },
  dispatchEvent(ev) {
    for (const fn of [...(heard.get(ev.type) ?? [])]) fn(ev);
    return true;
  },
};
/** What the browser would fire. */
const fire = (type) => win.dispatchEvent({ type });
globalThis.window = win;
/** The address moves as the App Router's History leaves it: a push or a replace writes the path and fires nothing. */
const history = historyOf(win);
/** What a page reads the address through (data/constants.jsx), and what these tests' own `CHANLY` keeps of it. */
const address = await legacyAddress();
win.CHANLY = { nav() {}, address };
globalThis.document = {
  title: "Chanlytics OS",
  visibilityState: "hidden",
  body: { style: {} },
  addEventListener() {},
  removeEventListener() {},
};
win.document = globalThis.document;

const status = await importSrc("apps/dashboard/src/legacy-bridge/surface-status.ts");
const realtime = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");
const runner = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
const shell = await importSrc("apps/dashboard/src/legacy-bridge/shell.ts");
const workspace = await importSrc("apps/dashboard/src/legacy-bridge/workspace.ts");
const bridgeApi = await importSrc("apps/dashboard/src/legacy-bridge/api.ts");
const { ApiError } = await importSrc("apps/dashboard/src/client/api.ts");
// The Inbox and Conversations are TSX surfaces (surfaces/inbox), and Campaigns and Live (surfaces/campaigns, surfaces/live),
// on routes of their own: the frame wraps the page the layout gives it as surfaces/routes.ts says, and reads what the
// surfaces hold through the seam. Their overrides declare the windows the shell's count still reads (INBOX_DATA,
// CONVERSATIONS_DATA, and the playbooks', broadcasts' and Live's), which the seam mirrors.
await importSrc("apps/dashboard/src/surfaces/inbox/surface.ts");
await importSrc("apps/dashboard/src/surfaces/inbox/conversations-surface.ts");
await importSrc("apps/dashboard/src/surfaces/campaigns/playbooks/surface.ts");
await importSrc("apps/dashboard/src/surfaces/campaigns/broadcasts/surface.ts");
await importSrc("apps/dashboard/src/surfaces/live/surface.ts");
const { setSurfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
const { SURFACE_ROUTES } = await importSrc("apps/dashboard/src/surfaces/routes.ts");
const { cvRoute } = await importSrc("apps/dashboard/src/surfaces/inbox/cv-rules.ts");

/** Surfaces that record each read. */
const surfaces = (...keys) => {
  const asked = [];
  return {
    asked,
    overrides: keys.map((key) => ({
      key,
      debounceMs: 1,
      apply: async () => {
        asked.push(key);
      },
    })),
  };
};

/* --------------------------------- the bridge --------------------------------- */

test("the connection is one fact the shell listens to, and each change is said once", () => {
  let told = 0;
  const off = status.onSurfaceStatusChange(() => {
    told += 1;
  });
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
  assert.deepEqual(
    [...asked].sort(),
    ["calendar", "inbox"],
    "what changed while away is read now, not at the next focus",
  );
  fire("offline");
  stop();
  assert.equal(status.getConnection().offline, false, "a runner that stopped leaves nothing said");
  fire("offline");
  assert.equal(status.getConnection().offline, false, "and listens to nothing");
});

test("the live feed: a blip it rejoins is not news, a drop that outlasts the grace is, and every rejoin reads what it missed", async () => {
  const said = [];
  let reads = 0;
  const feed = realtime.feedWatch({
    graceMs: 15,
    onDown: (down) => said.push(down),
    onReconnect: () => {
      reads += 1;
    },
  });
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
  assert.deepEqual(
    said,
    [true, false],
    "the runner's own teardown closes the channel, and a stopped watch says nothing",
  );
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
  const page = {
    dispatched: 0,
    dispatchEvent() {
      page.dispatched += 1;
      return true;
    },
  };
  shell.publishShellStatus({ stale: false, degraded: [] }, page);
  shell.publishShellStatus({ stale: false, degraded: [] }, page);
  assert.equal(page.dispatched, 1);
  shell.publishShellStatus({ stale: false, degraded: [], offline: true }, page);
  assert.equal(
    page.dispatched,
    2,
    "going offline is news: the old comparison looked at the build and the surfaces only",
  );
  shell.publishShellStatus({ stale: false, degraded: [], offline: true, disconnected: true }, page);
  assert.equal(page.dispatched, 3, "so is the live feed dropping");
  const labels = { inbox: "Inbox", today: "Today", calendar: "Calendar", people: "People" };
  const statuses = new Map([
    ["inbox", "degraded"],
    ["today", "live"],
    ["calendar", "degraded"],
    ["people", "seeded"],
  ]);
  assert.deepEqual(
    shell.shellStatusOf(statuses, { offline: false, realtimeDown: true }, true, labels),
    { stale: true, degraded: ["Inbox", "Calendar"], offline: false, disconnected: true },
    "a surface that never loaded is its page's to say, not the line's",
  );
});

test("a session that ends mid-page signs in again to the same page: the route rides to /login and back", async () => {
  assert.equal(workspace.signInHref({ hash: "#/inbox/th-1" }), "/login#/inbox/th-1");
  assert.equal(workspace.signInHref({ pathname: "/w/acme/inbox/th-1", hash: "" }), "/login#/inbox/th-1", "from a path");
  for (const none of ["", "#", undefined, null, "#access_token=abc"])
    assert.equal(workspace.signInHref({ pathname: "/w/acme", hash: none }), "/login", `${none} is not a page`);

  // The client's 401, on any read or write.
  const page = {
    location: {
      hash: "#/clients/p-9",
      assigned: [],
      assign(url) {
        page.location.assigned.push(url);
      },
    },
    fetch: async () => new Response(JSON.stringify({ ok: false, error: { code: "unauthorized" } }), { status: 401 }),
  };
  await bridgeApi.apiFor(page)("GET workspaces");
  assert.deepEqual(page.location.assigned, ["/login#/clients/p-9"]);

  // The runner's, when a surface's own read is refused.
  win.location.hash = "#/calendar";
  win.location.assigned = [];
  const stop = runner.startSurfaces([
    {
      key: "inbox",
      apply: async () => {
        throw new ApiError("unauthorized", 401, "signed out");
      },
    },
  ]);
  await settle();
  stop();
  assert.deepEqual(win.location.assigned, ["/login#/calendar"]);
  win.location.hash = "#/inbox/th-1";
});

/* ---------------------------------- the page ---------------------------------- */

let cells = [];
// Where each hook keeps its state: by the component that calls it, as React keeps it (_hook-frames.mjs).
const frames = hookFrames();
/** Deep for the line, which is all in one file; shallow for the shell, whose children are other files' pages. */
let deep = true;
globalThis.Icon = "Icon";
globalThis.React = {
  Fragment: "Fragment",
  Component: class {},
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (deep && typeof type === "function") node.rendered = frames.render(type, props);
    return node;
  },
  useState: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init;
    return [
      cells[k],
      (v) => {
        cells[k] = typeof v === "function" ? v(cells[k]) : v;
      },
    ];
  },
  useReducer: (red, init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = init;
    return [
      cells[k],
      (a) => {
        cells[k] = red(cells[k], a);
      },
    ];
  },
  useRef: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = { current: init };
    return cells[k];
  },
  useMemo: (fn) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = fn();
    return cells[k];
  },
  useEffect: (fn) => {
    const k = frames.key();
    if (!(k in cells)) {
      cells[k] = true;
      fn();
    }
  },
  useCallback: (fn) => fn,
  useSyncExternalStore: (subscribe, snapshot) => {
    const k = frames.key();
    if (!(k in cells)) {
      cells[k] = true;
      subscribe(() => {});
    }
    return snapshot();
  },
};
// The bridge's hook the shell redraws on (surface-status.ts), over this React.
globalThis.useSurface = (await importSrc("apps/dashboard/src/legacy-bridge/surface-status.ts")).surfaceHook(
  globalThis.React,
);
await import("../../../../../apps/dashboard/src/legacy/components/topbar.jsx");
await import("../../../../../apps/dashboard/src/legacy/pages/settings.jsx");
// The route table the shell reads (SHELL_ROUTES, drawRoute), loaded where both lists load it: just before the shell.
await import("../../../../../apps/dashboard/src/legacy/pages/app-routes.jsx");
await import("../../../../../apps/dashboard/src/legacy/pages/app-shell.jsx");

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
const find = (tree, pred) => {
  let hit;
  walk(tree, (n) => {
    if (hit === undefined && pred(n)) hit = n;
  });
  return hit;
};
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
  const bar = () => {
    frames.begin();
    return win.ShellStatusBar({});
  };
  const cta = (tree) => find(tree, (n) => n.props?.["data-testid"] === "shell-status-cta");
  win.__chrome = { statusLine: shellStatusLine };

  win.__SHELL_STATUS = { stale: false, degraded: [] };
  let tree = bar();
  assert.equal(tree.props.role, "status");
  assert.equal(tree.props["aria-live"], "polite", "mounted while all is well, so the next change is announced");
  assert.equal(
    find(tree, (n) => n.props?.["data-testid"] === "shell-status"),
    undefined,
    "and empty",
  );

  win.__SHELL_STATUS = { stale: false, degraded: [], offline: true };
  tree = bar();
  assert.match(textOf(tree), /You're offline/);
  assert.equal(cta(tree), undefined, "nothing to press without a connection to press it with");

  let retried = 0;
  let finish = () => {};
  win.__shell = {
    retry: () => {
      retried += 1;
      return new Promise((r) => {
        finish = r;
      });
    },
  };
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
  const account = {
    mode: "stripe",
    status: "paused",
    price_id: "price_1",
    current_period_end: null,
    trial_end: null,
    cancel_at: null,
    cancel_at_period_end: false,
    card_brand: null,
    card_last4: null,
    last_payment_failed_at: null,
    last_paid_at: null,
    updated_at: "2026-09-07T14:00:00Z",
  };
  const dto = { ready: true, account, price, trial_days: 14, role: "owner" };
  assert.equal(toBillingVM(dto).paused, true, "the fixture is a paused account");
  win.__BILLING_ACCOUNT = { dto, fetchedAt: Date.now() };
  win.__billing = { vm: (d, nowMs) => toBillingVM(d, nowMs) };
  const went = [];
  win.CHANLY = { nav: (to) => went.push(to), address };
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

for (const name of [
  "Sidebar",
  "Topbar",
  "LiveCallBar",
  "SurfaceTabs",
  "AskBar",
  "ShortcutsSheet",
  "ClientsA",
  "ClientProfile",
  "CalendarPage",
  "BroadcastsPage",
  "SettingsPage",
])
  globalThis[name] = name;

/** The window at an address (`#/inbox`, as the pages name one), placed at its path, where the frame leaves a route. */
const placeAt = (hash) => {
  win.location.pathname = `/w/acme/${hash.replace(/^#\//, "")}`;
  win.location.hash = "";
};

/** The page the layout hands the frame for a route that has left it (the surface's own page, a stand-in here). */
const routePage = { type: "RoutePage", props: { children: [] } };

/** The shell at an address, freshly mounted at its path: its tree and the tab's name it left. */
const mount = (hash) => {
  deep = false;
  cells = [];
  frames.begin();
  placeAt(hash);
  globalThis.document.title = "Chanlytics OS";
  globalThis.ShellStatusBar = win.ShellStatusBar;
  const tree = win.ChanlyticsApp({
    theme: "dark",
    themePref: "dark",
    sidebar: "open",
    onSidebar() {},
    onTheme() {},
    routePage,
    surfaceRoutes: SURFACE_ROUTES,
  });
  deep = true;
  return { tree, title: globalThis.document.title };
};

test("the shell names the tab from the crumbs it draws, counts what needs you, and puts the line directly under the top bar", () => {
  shell.installShell(win);
  setSurfaceValue("inbox", {
    THREADS: [
      { id: "th-9", who: "Rosa", state: "needs" },
      { id: "th-2", state: "escalated" },
      { id: "th-3", state: "done" },
    ],
  });
  const { tree, title } = mount("#/inbox/th-9");
  assert.equal(title, "(2) Rosa · Inbox · Chanlytics");
  const main = find(tree, (n) => n.props?.className === "main");
  const kids = main.props.children.filter((k) => k && typeof k === "object");
  const at = (type) => kids.findIndex((k) => k.type === type);
  assert.ok(at("Topbar") >= 0, "the top bar");
  // A call happening right now is the one thing on this line that stops being
  // true by itself, so it sits above the status line; both are above the page,
  // on a phone as on a desk, and each draws nothing when it has nothing to say.
  assert.equal(at("LiveCallBar"), at("Topbar") + 1, "a call in progress, first");
  assert.equal(at(win.ShellStatusBar), at("Topbar") + 2, "then the line, above the page, on a phone as on a desk");
  setSurfaceValue("inbox", { THREADS: [] });
});

test("on a real workspace a crumb, and so the tab, never names the demo's people or lists", () => {
  win.CALENDAR_DATA = { CAL_WEEK: [{ appts: [{ id: "a-1", who: "Jordan Blake" }] }] };
  assert.equal(mount("#/calendar/a-1").title, "Jordan Blake · Calendar · Chanlytics", "the demo keeps its own");
  win.__CALENDAR = { vm: { bookingLink: null } };
  assert.equal(mount("#/calendar/a-1").title, "Calendar · Chanlytics", "a real calendar is not named from the seeds");

  win.CLIENT_SEGMENTS = [{ id: "lapsed-60", label: "Lapsed 60 days" }];
  setSurfaceValue("broadcasts", {
    rows: [],
    audiences: [{ kind: "list", id: "lapsed", label: "Lapsed", counts: null, hint: "" }],
  });
  assert.equal(
    mount("#/broadcasts/lapsed").title,
    "Lapsed · Broadcasts · Campaigns · Chanlytics",
    "a real audience by its own name",
  );
  assert.equal(mount("#/broadcasts/lapsed-60").title, "Broadcasts · Campaigns · Chanlytics");

  win.__PEOPLE = { rows: [], lists: [{ id: "opted_in", label: "Opted in" }], saved: [] };
  assert.equal(mount("#/clients/seg:opted_in").title, "Opted in · People · Chanlytics");
  assert.equal(mount("#/clients/seg:lapsed-60").title, "List · People · Chanlytics");

  assert.equal(mount("#/admin").title, "Business · Settings · Chanlytics", "the pane the bare route opens, by name");
  assert.equal(
    mount("#/admin/memory").title,
    "AI memory · Settings · Chanlytics",
    "a retired route still answers, and says which",
  );
  assert.equal(
    mount("#/admin/platform").title,
    "Profile · Settings · Chanlytics",
    "the back office is not named to a customer: the pane lands on Profile, and so does the crumb",
  );
  win.__ME = { platform_admin: true };
  assert.equal(
    mount("#/admin/platform").title,
    "Back office · Settings · Chanlytics",
    "and for the people it is for, the crumb names it",
  );
  delete win.__ME;
  for (const k of ["CALENDAR_DATA", "__CALENDAR", "CLIENT_SEGMENTS", "__PEOPLE"]) delete win[k];
  setSurfaceValue("broadcasts", undefined);
});

test("the tab counts a real thread only when it needs you: one a teammate is answering, or one you have, is not waiting on you", () => {
  shell.installShell(win);
  setSurfaceValue("inbox", {
    THREADS: [
      { id: "th-1", real: true, state: "escalated", needsYou: true, takenOver: false, claimedByOther: false },
      { id: "th-2", real: true, state: "escalated", needsYou: false, takenOver: false, claimedByOther: true },
      { id: "th-3", real: true, state: "escalated", needsYou: false, takenOver: true, claimedByOther: false },
    ],
  });
  assert.equal(
    mount("#/inbox").title,
    "(1) Inbox · Chanlytics",
    "REGRESSION: a teammate's thread was counted as needing you until the Inbox itself mounted",
  );
  setSurfaceValue("inbox", { THREADS: [] });
});

test("REGRESSION: the tab keeps its name when the layout's own title lands after the shell's -- a page loaded cold said 'Chanlytics OS' until something it counted changed", () => {
  shell.installShell(win);
  const watches = [];
  win.MutationObserver = class {
    constructor(fn) {
      this.fn = fn;
      this.on = false;
      watches.push(this);
    }
    observe(target, opts) {
      this.on = target === globalThis.document.head && !!opts.childList && !!opts.subtree && !!opts.characterData;
    }
    disconnect() {
      this.on = false;
    }
  };
  globalThis.document.head = {};
  try {
    const { title } = mount("#/admin/autonomy");
    assert.equal(title, "Autonomy · Settings · Chanlytics");
    // What the layout's metadata does when it lands after the shell's first paint: its own title, over the shell's.
    globalThis.document.title = "Chanlytics OS";
    for (const w of watches) if (w.on) w.fn([]);
    assert.equal(
      globalThis.document.title,
      "Autonomy · Settings · Chanlytics",
      "REGRESSION: the layout's title stayed, and nothing on the page wrote the name again",
    );
    assert.equal(watches.filter((w) => w.on).length, 1, "one watch on the head, for the one name");
  } finally {
    delete win.MutationObserver;
    delete globalThis.document.head;
  }
});

test("REGRESSION (A7): a link to a chat opens that chat -- the shell handed the page only call ids, so a person's profile opened the first conversation in the list", () => {
  shell.installShell(win);
  setSurfaceValue("conversations", {
    CONVERSATIONS: [
      { id: "c-9", who: "Rosa Díaz" },
      { id: "cv-4", who: "Emily Chen" },
    ],
  });
  // The frame names the trail and lights the nav; the page's own props are what the route hands it by the page's one
  // rule (conversations-route.tsx, cvRoute), which the address's word is read by.
  const pageAt = (hash) => {
    const { title } = mount(hash);
    const cv = cvRoute(hash.split("/").slice(2).join("/") || null);
    return { props: { channel: cv.channel, initialId: cv.id }, title };
  };
  try {
    const chat = pageAt("#/conversations/c-9");
    assert.equal(
      chat.props.initialId,
      "c-9",
      "REGRESSION: a chat's id was dropped, and the page opened someone else's",
    );
    assert.equal(
      chat.title,
      "Rosa Díaz · Conversations · Inbox · Chanlytics",
      "Conversations is a view of the Inbox, so the trail says so",
    );
    assert.equal(pageAt("#/conversations/cv-4").props.initialId, "cv-4", "a call's id still opens it");
    const phone = pageAt("#/conversations/phone").props;
    assert.deepEqual([phone.channel, phone.initialId], ["phone", null], "a channel is a filter, not an id");
    const on = pageAt("#/conversations/phone:cv-4");
    assert.deepEqual(
      [on.props.channel, on.props.initialId],
      ["phone", "cv-4"],
      "a row on its tab, as the page writes it when a row opens",
    );
    assert.equal(on.title, "Emily Chen · Conversations · Inbox · Chanlytics", "named in the trail");
    assert.equal(
      find(mount("#/conversations/phone:cv-4").tree, (n) => n.type === "Sidebar").props.active,
      "calls",
      "and the nav lights the tab, not the raw word",
    );
  } finally {
    setSurfaceValue("conversations", undefined);
  }
});

test("REGRESSION: a real workspace's WhatsApp and Email tabs filter the list -- the shell knew only the mockup's three, so it opened 'whatsapp' as a conversation nobody could find", async () => {
  shell.installShell(win);
  const { conversationTabs } = await importSrc("apps/dashboard/src/surfaces/inbox/conversations-surface.ts");
  // The strip the surface's override draws for a workspace on the phone, WhatsApp, texts and email.
  const CV_CHANNELS = conversationTabs(true, ["whatsapp", "sms", "email"]);
  setSurfaceValue("conversations", { CONVERSATIONS: [{ id: "c-9", who: "Rosa Díaz" }], CV_CHANNELS });
  const pageAt = (hash) => {
    const { title } = mount(hash);
    const cv = cvRoute(hash.split("/").slice(2).join("/") || null);
    return { props: { channel: cv.channel, initialId: cv.id }, title };
  };
  try {
    for (const tab of CV_CHANNELS.filter((t) => t.id !== "all")) {
      const { props, title } = pageAt(`#/conversations/${tab.id}`);
      assert.deepEqual(
        [props.channel, props.initialId],
        [tab.id, null],
        `REGRESSION: "${tab.id}" was read as a conversation's id`,
      );
      assert.equal(
        title,
        `${tab.label} · Conversations · Inbox · Chanlytics`,
        "the trail names the tab in its chip's words",
      );
    }
    assert.deepEqual(
      [pageAt("#/conversations").props.channel, pageAt("#/conversations").props.initialId],
      ["all", null],
    );
    assert.equal(pageAt("#/conversations/c-9").props.initialId, "c-9", "and a row's id still opens its row");
  } finally {
    setSurfaceValue("conversations", undefined);
  }
});

test("a link to a call opens that call on Live, named in the crumbs -- the route had no place for its id, so Today's door could only open the list", () => {
  shell.installShell(win);
  setSurfaceValue("live", { now: [{ callId: "c-9", who: "Rosa Díaz" }], recent: [], fetchedAtMs: 1 });
  try {
    const crumbs = (hash) => find(mount(hash).tree, (n) => n.type === "Topbar").props.crumbs;
    assert.equal(
      crumbs("#/live/c-9").at(-1),
      "Rosa Díaz",
      "REGRESSION: the route dropped the call's id, so nothing named the call",
    );
    assert.deepEqual(crumbs("#/live"), [{ label: "Inbox", to: "inbox" }, "Live"]);
    // Every call is the Live page already on screen: a row writes the address it opens (replaced), so each call
    // being its own mount would tear the page down on every click.
    const key = (hash) =>
      find(mount(hash).tree, (n) => String(n.props?.className || "").includes("main-scroll")).props.key;
    assert.equal(key("#/live/c-9"), key("#/live"), "one mount across its calls");
    assert.equal(key("#/live/c-1"), key("#/live/c-9"));
  } finally {
    setSurfaceValue("live", undefined);
  }
});

test("a page that follows its own address is one mount across it -- Settings' panes, the Inbox's threads, Broadcasts' runs, Live's calls -- and every other page's param is its own mount, the safe default", () => {
  // Run, where chrome.test.mjs used to match the Set's source text: the shell as drawn is what decides.
  shell.installShell(win);
  globalThis.LiveMonitorPage = "LiveMonitorPage";
  try {
    const key = (hash) =>
      find(mount(hash).tree, (n) => String(n.props?.className || "").includes("main-scroll")).props.key;
    const one = (...hashes) => assert.equal(new Set(hashes.map(key)).size, 1, `one mount: ${hashes.join(", ")}`);
    one("#/admin/workspace", "#/admin/billing", "#/admin/team");
    one("#/inbox", "#/inbox/th-1", "#/inbox/th-2");
    one("#/broadcasts", "#/broadcasts/run:r-1");
    one("#/live", "#/live/c-1", "#/live/c-2");
    one("#/conversations", "#/conversations/phone", "#/conversations/phone:cv-1", "#/conversations/cv-2");
    // Not following its param: showing another entity in a surface built for the last one is the danger, so the
    // default is a new mount.
    assert.notEqual(
      key("#/calendar/2026-10-01"),
      key("#/calendar/2026-10-02"),
      "the Calendar's days are their own mounts",
    );
  } finally {
    delete globalThis.LiveMonitorPage;
  }
});

test("a link to a day opens that day on the Calendar -- the route read only a demo appointment's id, so nothing could link to a day", () => {
  shell.installShell(win);
  const at = (hash) => find(mount(hash).tree, (n) => n.type === "CalendarPage").props;
  assert.equal(at("#/calendar/2026-09-10").initialDay, "2026-09-10");
  assert.equal(at("#/calendar/a-1").initialDay, null, "an appointment's id is not a day");
  assert.equal(at("#/calendar/2026-9-10").initialDay, null, "only a whole date names a day");
  assert.equal(at("#/calendar").initialDay, null);
});

test("REGRESSION (C9): a link to a run opens that broadcast, named in the crumbs, on the page already open -- Broadcasts read every param as a list's id", () => {
  shell.installShell(win);
  setSurfaceValue("broadcasts", {
    audiences: [{ kind: "saved", id: "s1", label: "Regulars" }],
    rows: [{ id: "b-1", name: "Win-back · 2026-09-10" }],
  });
  try {
    // What the page is handed for each address is the route's (campaigns-routes.test.mjs, broadcastsProps); the frame
    // names the trail and keeps one mount for the page.
    const at = (hash) => {
      const { tree } = mount(hash);
      return {
        crumbs: find(tree, (n) => n.type === "Topbar").props.crumbs,
        key: find(tree, (n) => String(n.props?.className || "").includes("main-scroll")).props.key,
      };
    };
    const run = at("#/broadcasts/run:b-1");
    assert.equal(run.crumbs.at(-1), "Win-back · 2026-09-10");
    const list = at("#/broadcasts/s1");
    assert.equal(list.crumbs.at(-1), "Regulars");
    assert.equal(
      at("#/broadcasts/run:b-older").crumbs.at(-1),
      "Broadcast",
      "a run past the newest fifty is still named for what it is",
    );
    assert.equal(run.key, list.key, "one mount for the page, so a run opened from it keeps a half-typed broadcast");
  } finally {
    setSurfaceValue("broadcasts", undefined);
  }
});

test("every view of Leads is one mount: a search, a list, a class or an open lead keeps the page that is there -- each rail pick tore it down, and the search box, the scroll and a half-typed Find went with it", () => {
  shell.installShell(win);
  const SEARCH = "5e000000-0000-4000-8000-000000000001";
  const LEAD = "1ead0000-0000-4000-8000-000000000001";
  const at = (hash) => {
    const { tree } = mount(hash);
    return {
      key: find(tree, (n) => String(n.props?.className || "").includes("main-scroll")).props.key,
      page: find(tree, (n) => n.type === "ClientsA" || n.type === "ClientProfile"),
    };
  };
  const all = at("#/clients/leads");
  assert.equal(all.page.props.scope, "leads");
  for (const param of [
    `leads:s-${SEARCH}`,
    "leads:l-ready",
    `leads:s-${SEARCH}:c-review`,
    `leads:p-${LEAD}`,
    `leads:s-${SEARCH}:l-nurture:p-${LEAD}`,
  ]) {
    const view = at(`#/clients/${param}`);
    assert.equal(view.key, all.key, `${param} is the Leads page already on screen`);
    assert.equal(view.page.props.leadsRoute, param, "and the page is handed the address to follow");
  }
  assert.notEqual(
    at("#/clients").key,
    all.key,
    "People and Leads are two pages: each starts from its own sort and columns",
  );
  assert.notEqual(at("#/clients/c-1").key, at("#/clients/c-2").key, "two profiles are still two mounts");
  assert.notEqual(at("#/clients/seg:opted_in").key, at("#/clients").key, "People's own views keep the rule they had");
});

test("a page can say the same place more exactly: a replaced address makes no entry, and the shell follows it at once, with nothing to wait for", () => {
  shell.installShell(win);
  const LEAD = "1ead0000-0000-4000-8000-000000000001";
  const before = { pushed: history.pushed.length, replaced: history.replaced.length };
  try {
    const { tree } = mount("#/clients/leads");
    const page = (t) => find(t, (n) => n.type === "ClientsA");
    page(tree).props.onNavigate(`clients/leads:p-${LEAD}`, { replace: true });
    assert.deepEqual(
      history.replaced.slice(before.replaced),
      [`/w/acme/people/leads:p-${LEAD}`],
      "replaced, not pushed: Back must not replay every lead the peek walked through",
    );
    assert.equal(history.pushed.length, before.pushed, "no entry");
    // Drawn again with the state it kept, as React would after the shell's own setRoute.
    deep = false;
    frames.begin();
    const again = win.ChanlyticsApp({
      theme: "dark",
      themePref: "dark",
      sidebar: "open",
      onSidebar() {},
      onTheme() {},
    });
    deep = true;
    assert.equal(
      page(again).props.leadsRoute,
      `leads:p-${LEAD}`,
      "the page is handed the address it asked for without waiting for an event that never comes",
    );
    page(again).props.onNavigate("clients/leads");
    assert.equal(win.location.pathname, "/w/acme/people/leads", "and a plain navigation is still pushed");
    assert.equal(history.pushed.at(-1), "/w/acme/people/leads");
    assert.equal(history.replaced.length, before.replaced + 1);
  } finally {
    win.location.pathname = "/w/acme";
  }
});

test("REGRESSION: a person's Back returns to the list they were opened from -- it pushed plain People, and the list, its scroll and its words went", () => {
  shell.installShell(win);
  const keepHistory = win.history;
  const keepPeople = win.__PEOPLE;
  // Back is the browser's; the shell never writes history.state (Next reloads on a Back to an entry it did not mark).
  const h = {
    backs: 0,
    back() {
      h.backs += 1;
    },
  };
  win.history = { ...keepHistory, back: () => h.back() };
  win.__PEOPLE = { rows: [{ id: "p-1", name: "Rosa Díaz" }] };
  // The shell drawn again with the state it kept, after the browser moved its address (popstate), as React would.
  const arrive = (hash) => {
    win.location.pathname = `/w/acme/${hash.replace(/^#\//, "")}`;
    fire("popstate");
    deep = false;
    frames.begin();
    const t = win.ChanlyticsApp({ theme: "dark", themePref: "dark", sidebar: "open", onSidebar() {}, onTheme() {} });
    deep = true;
    return t;
  };
  const profileBack = (tree) => find(tree, (n) => n.type === "ClientProfile").props.onBack();
  try {
    find(mount("#/clients/list:L1").tree, (n) => n.type === "ClientsA").props.onOpenProfile("p-1");
    assert.equal(win.location.pathname, "/w/acme/people/p-1", "the profile is a new entry");
    profileBack(arrive("#/clients/p-1"));
    assert.equal(h.backs, 1, "REGRESSION: Back pushed /clients, a second entry, and the list they came from was gone");
    assert.equal(win.location.pathname, "/w/acme/clients/p-1", "nothing pushed: the browser's Back is what returns");

    // Reached by a link or a reload: People itself, pushed.
    h.backs = 0;
    profileBack(mount("#/clients/p-1").tree);
    assert.deepEqual([h.backs, win.location.pathname], [0, "/w/acme/people"], "by a link: People");
    // Opened from another page's door: People, never a Back out to the Inbox.
    mount("#/inbox/th-1");
    win.appNavigate("clients/p-1");
    profileBack(arrive("#/clients/p-1"));
    assert.deepEqual([h.backs, win.location.pathname], [0, "/w/acme/people"], "from the Inbox: People");
    // Back to the profile from somewhere else: the entry before it is not known to be the list, so People.
    find(mount("#/clients/list:L1").tree, (n) => n.type === "ClientsA").props.onOpenProfile("p-1");
    arrive("#/clients/p-1");
    win.appNavigate("calendar");
    profileBack(arrive("#/clients/p-1"));
    assert.deepEqual(
      [h.backs, win.location.pathname],
      [0, "/w/acme/people"],
      "Back from the Calendar, then Back to People: People",
    );
  } finally {
    win.history = keepHistory;
    win.__PEOPLE = keepPeople;
  }
});

test("REGRESSION (C13): a link to a playbook opens Playbooks on its card, named in the crumbs -- the route dropped the id", () => {
  shell.installShell(win);
  const keepGate = win.gate;
  win.gate = win.gate || (() => ({}));
  setSurfaceValue("playbooks", { rows: [{ id: "pb-1", name: "Win-back" }] });
  try {
    const crumbs = (hash) => find(mount(hash).tree, (n) => n.type === "Topbar").props.crumbs;
    assert.equal(crumbs("#/outbound/pb-1").at(-1), "Win-back", "REGRESSION: the route dropped the playbook's id");
    assert.deepEqual(crumbs("#/outbound"), ["Campaigns", "Playbooks"]);
    assert.equal(
      crumbs("#/outbound/pb-gone").at(-1),
      "Playbook",
      "a playbook since deleted is still named for what it was",
    );
  } finally {
    setSurfaceValue("playbooks", undefined);
    win.gate = keepGate;
  }
});

/* ------------------------------ the shell's own doors (B6a-2) ------------------------------ */

test("REGRESSION (N10): a real workspace's Calendar and Playbooks offer no primary act until the page is ready -- Book and New campaign opened Ask over the skeleton or the failure pane", () => {
  shell.installShell(win);
  const keepGate = win.gate;
  win.gate = () => ({});
  const right = (hash) => find(mount(hash).tree, (n) => n.type === "Topbar").props.right;
  try {
    assert.equal(
      right("#/calendar"),
      null,
      "REGRESSION: a Calendar still loading, or failed, offered Book, which opened Ask",
    );
    assert.equal(
      right("#/outbound"),
      null,
      "REGRESSION: Playbooks still loading, or failed, offered New campaign, which opened Ask",
    );
    win.__DEMO_MODE = true;
    assert.equal(textOf(right("#/calendar")).trim(), "Book", "the demo keeps its detour");
    assert.equal(textOf(right("#/outbound")).trim(), "New campaign");
    delete win.__DEMO_MODE;
    win.__CALENDAR = { vm: { bookingLink: "https://book.example/luna" } };
    assert.equal(
      right("#/calendar").props.href,
      "https://book.example/luna",
      "a ready Calendar books through its own link",
    );
    // Ready, New playbook is the page's own, at the right of its one line beside Broadcasts' and Templates' acts
    // (outbound-real.jsx pb-new), and the top bar carries none: the page draws only once the playbooks are read.
    setSurfaceValue("playbooks", { rows: [] });
    assert.equal(right("#/outbound"), null, "ready Playbooks keep their act on the page, not in the top bar");
  } finally {
    for (const k of ["__DEMO_MODE", "__CALENDAR"]) delete win[k];
    setSurfaceValue("playbooks", undefined);
    win.gate = keepGate;
  }
});

test("REGRESSION (N16): an address under soon/ opens a page that has shipped, and a name nothing answers to is not found -- #/soon/calendar said the Calendar was not in this release", async () => {
  shell.installShell(win);
  const reg = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
  const from = history.replaced.length;
  const replaced = () => history.replaced.slice(from);
  win.__surfaceState = reg.surfaceStateFor;
  const shows = (tree, name) =>
    find(tree, (n) => n.type === name || (typeof n.type === "function" && n.type.name === name)) !== undefined;
  try {
    let tree = mount("#/soon/calendar").tree;
    assert.ok(
      shows(tree, "CalendarPage") && !shows(tree, "ComingSoon"),
      "REGRESSION: a shipped page answered that it was not in this release",
    );
    assert.deepEqual(
      replaced(),
      ["/w/acme/calendar"],
      "and the address becomes the page's own, in place, so Back does not land on it again",
    );
    assert.ok(shows(mount("#/soon/fleet").tree, "ComingSoon"), "a page kept for the demo still says so");
    tree = mount("#/soon/nope").tree;
    assert.ok(
      shows(tree, "NotFound") && !shows(tree, "ComingSoon"),
      "a name nothing answers to is not found, rather than promised",
    );
    const now = history.replaced.length;
    delete win.__surfaceState;
    assert.ok(
      shows(mount("#/soon/calendar").tree, "ComingSoon") && history.replaced.length === now,
      "the standalone mockup, with no registry, keeps its landings",
    );
  } finally {
    for (const k of ["__surfaceState", "__DEMO_MODE"]) delete win[k];
  }
});

test("REGRESSION (N19): the top bar's theme button steps through Light, Dark and System and says which is on -- it flipped light and dark and dropped System", () => {
  shell.installShell(win);
  globalThis.usePPToast = () => [null, () => {}];
  const chosen = [];
  const themeButton = (themePref, theme) => {
    deep = true;
    cells = [];
    frames.begin();
    const tree = win.Topbar({
      crumbs: ["Today"],
      theme,
      themePref,
      onTheme: (v) => chosen.push(v),
      onAsk() {},
      onMenu() {},
    });
    return find(tree, (n) => String(n.props?.className || "").includes("tb-theme"));
  };
  try {
    const dark = themeButton("dark", "dark");
    dark.props.onClick();
    assert.equal(
      chosen.at(-1),
      "system",
      "REGRESSION: from Dark the button went to Light, and System could not be reached from the top bar",
    );
    assert.equal(dark.props["aria-label"], "Theme: Dark. Switch to System");
    assert.equal(dark.props.title, "Theme: Dark. Switch to System");
    themeButton("system", "dark").props.onClick();
    assert.equal(chosen.at(-1), "light", "System, whatever it shows, goes on to Light");
    themeButton("light", "light").props.onClick();
    assert.equal(chosen.at(-1), "dark");

    // The shell hands the top bar the preference, not only the theme it resolves to.
    deep = false;
    cells = [];
    frames.begin();
    placeAt("#/today");
    globalThis.ShellStatusBar = win.ShellStatusBar;
    const shellTree = win.ChanlyticsApp({
      theme: "dark",
      themePref: "system",
      sidebar: "open",
      onSidebar() {},
      onTheme() {},
    });
    assert.equal(
      find(shellTree, (n) => n.type === "Topbar").props.themePref,
      "system",
      "REGRESSION: the top bar was handed only the resolved theme",
    );
  } finally {
    deep = true;
    delete globalThis.usePPToast;
  }
});

test("REGRESSION: the top bar's Ask button says Ask Chanlytics and draws no key -- ⌘K stood in it and in its tip, beside the ? sheet that lists it", () => {
  shell.installShell(win);
  globalThis.usePPToast = () => [null, () => {}];
  try {
    deep = true;
    cells = [];
    frames.begin();
    const tree = win.Topbar({
      crumbs: ["Today"],
      theme: "dark",
      themePref: "dark",
      onTheme() {},
      onAsk() {},
      onMenu() {},
    });
    const ask = find(tree, (n) => n.props?.["data-testid"] === "tb-ask");
    assert.equal(textOf(ask), "Ask Chanlytics");
    assert.equal(ask.props.title, "Ask Chanlytics");
    assert.deepEqual(keysDrawn(ask), []);
  } finally {
    delete globalThis.usePPToast;
  }
});

test("the look travels as the theme does: stamped beside it on every root the shell draws, handed to the account menu, and its words published by the bridge", () => {
  shell.installShell(win);
  assert.deepEqual(win.__chrome.looks, LOOK_OPTIONS, "the looks beside the themes");
  assert.equal(win.__chrome.lookOffered, LOOK_OFFERED, "and whether the account menu offers them, as contracts says");
  const onLook = () => {};
  const drawAt = (hash) => {
    deep = false;
    cells = [];
    frames.begin();
    placeAt(hash);
    globalThis.ShellStatusBar = win.ShellStatusBar;
    const theme = { theme: "light", themePref: "light", onTheme() {} };
    return win.ChanlyticsApp({ ...theme, look: "glass", onLook, sidebar: "open", onSidebar() {} });
  };
  // The first run and the shared viewer are drawn instead of the chrome, each on a root of its own that carries the
  // theme; a [data-look] rule has to find the look on every one of them.
  const keptState = win.__surfaceState;
  delete win.__surfaceState;
  win.FirstRun = "FirstRun";
  try {
    for (const [hash, root] of [
      ["#/today", "app-root"],
      ["#/start", "fr-shell"],
      ["#/shared", "shared-root"],
    ]) {
      const drawn = drawAt(hash);
      assert.equal(drawn.props.className, root, `${hash} is drawn on its own root`);
      assert.deepEqual(
        [drawn.props["data-theme"], drawn.props["data-look"]],
        ["light", "glass"],
        `${hash}: the look beside the theme`,
      );
    }
    const sidebar = find(drawAt("#/today"), (n) => n.type === "Sidebar");
    assert.equal(sidebar.props.look, "glass", "the account menu is handed the look in force");
    assert.equal(sidebar.props.onLook, onLook, "and changes it through the shell's own prop, as the theme");
  } finally {
    deep = true;
    delete win.FirstRun;
    if (keptState !== undefined) win.__surfaceState = keptState;
  }
});

test("the first run keeps Ask: the palette is drawn over the step, closed, and the shell's ⌘K and appAsk open it and its close closes it; nothing else of the chrome, no door (Ask Rewired, Phase 7)", () => {
  shell.installShell(win);
  const keptState = win.__surfaceState;
  delete win.__surfaceState;
  win.FirstRun = "FirstRun";
  const draw = () => {
    frames.begin();
    globalThis.ShellStatusBar = win.ShellStatusBar;
    return win.ChanlyticsApp({ theme: "dark", themePref: "dark", sidebar: "open", onSidebar() {}, onTheme() {} });
  };
  const bars = (tree) => {
    const out = [];
    walk(tree, (n) => {
      if (n.type === "AskBar") out.push(n);
    });
    return out;
  };
  try {
    deep = false;
    cells = [];
    placeAt("#/start/phone");
    // The shell's own keys, as this draw installs them (an earlier draw's handlers are its own).
    const before = new Set(heard.get("keydown") ?? []);
    let tree = draw();
    const keys = [...(heard.get("keydown") ?? [])].filter((fn) => !before.has(fn));
    assert.equal(tree.props.className, "fr-shell", "the first run, full screen");
    const kids = tree.props.children.filter((k) => k && typeof k === "object");
    assert.deepEqual(
      kids.map((k) => k.type),
      ["FirstRun", "AskBar"],
      "the step, then the palette over it",
    );
    assert.equal(kids[0].props.param, "phone");
    assert.equal(kids[1].props.open, false, "closed until asked");
    for (const fn of keys) fn({ type: "keydown", key: "k", metaKey: true, target: null, preventDefault() {} });
    tree = draw();
    assert.deepEqual(
      bars(tree).map((b) => b.props.open),
      [true],
      "⌘K opens the Line over the step",
    );
    assert.equal(tree.props.className, "fr-shell", "and the first run stays under it");
    bars(tree)[0].props.onClose();
    tree = draw();
    assert.equal(bars(tree)[0].props.open, false, "its close closes it");
    win.appAsk();
    assert.equal(bars(draw())[0].props.open, true, "askAbout's door (appAsk) opens it too");
    for (const type of ["Sidebar", "Topbar", "ShortcutsSheet"])
      assert.equal(
        find(tree, (n) => n.type === type),
        undefined,
        `no ${type} on the first run`,
      );
    assert.equal(
      find(tree, (n) => n.props?.["data-testid"] === "phone-ask"),
      undefined,
      "no door: the first run draws no chrome, and no key is drawn outside the ? sheet",
    );
    // Everywhere else the chrome draws it once, as it always has.
    cells = [];
    placeAt("#/today");
    assert.equal(bars(draw()).length, 1, "Today: the one palette, in the chrome");
  } finally {
    deep = true;
    delete win.FirstRun;
    if (keptState !== undefined) win.__surfaceState = keptState;
  }
});

test("People has no tab strip on a real workspace -- its one real tab is People, and Lists and Leads are views of it; the demo keeps its seeded Deal board, over every view (N24)", async () => {
  await import("../../../../../apps/dashboard/src/legacy/components/surface-tabs.jsx");
  const tabsAt = (param) => {
    deep = true;
    cells = [];
    frames.begin();
    return win.SurfaceTabs({ page: "clients", param, onNavigate() {} });
  };
  const labels = (tree) => (tree ? tree.props.children.map((b) => textOf(b).trim()) : null);
  for (const param of [null, "seg:opted_in", "list:regulars", "state:needs", "p-9"])
    assert.equal(tabsAt(param), null, `nothing to switch to at ${param}: one real tab is no strip`);
  win.__DEMO_MODE = true;
  try {
    // No Leads tab, in a demo either: the seeded Leads page is retired and Leads
    // is a SCOPE of People (clients/leads), switched by the rail's own
    // People | Leads. The Deal board is the one seeded page left to switch to,
    // which is exactly two tabs -- the bar's own floor.
    assert.deepEqual(
      labels(tabsAt(null)),
      ["People", "Deal board"],
      "the demo's seeded tabs, and no Lists or Leads among them",
    );
    assert.deepEqual(
      labels(tabsAt("list:regulars")),
      ["People", "Deal board"],
      "REGRESSION (N24): a list you keep lost the tabs",
    );
    assert.deepEqual(
      labels(tabsAt("state:needs")),
      ["People", "Deal board"],
      "REGRESSION (N24): a state lost the tabs",
    );
    assert.equal(tabsAt("p-9"), null, "a person's profile keeps its focus");
  } finally {
    delete win.__DEMO_MODE;
  }
});

/* ------------------------------ the live-call bar ------------------------------ */

test("the live bar names who is on the line and opens that call; with nobody on it, it draws nothing", () => {
  shell.installShell(win);
  // The bar reads the wall clock, like the Live page's own ticker, so the
  // fixture is "a call that started ninety seconds ago, right now".
  const NOW = Date.now();
  const iso = (ago) => new Date(NOW - ago).toISOString();
  const ongoing = (over = {}) => ({
    id: "c-live",
    retell_call_id: "call_1",
    direction: "inbound",
    call_type: "phone_call",
    status: "ongoing",
    from_e164: "+16465550123",
    from_raw: null,
    to_e164: "+13055550100",
    started_at: iso(90_000),
    ended_at: null,
    duration_ms: null,
    disconnection_reason: null,
    sentiment: null,
    call_successful: null,
    in_voicemail: null,
    summary: null,
    wanted: null,
    outcome: null,
    follow_up: null,
    caller_name: null,
    transcript_object: [],
    recording: null,
    conversation_id: "cv1",
    contact_id: "k1",
    message_id: null,
    created_at: iso(90_000),
    updated_at: iso(2_000),
    contact: { display_name: "Rosa Díaz", wa_profile_name: null, phone_e164: "+16465550123" },
    ...over,
  });
  // The bar runs a one-second clock while a call is up, and only then.
  let clocks = 0;
  win.setInterval = () => {
    clocks += 1;
    return 1;
  };
  win.clearInterval = () => {};
  const drawn = () => {
    cells = [];
    frames.begin();
    return win.LiveCallBar({});
  };

  win.__LIVE = undefined;
  assert.equal(drawn(), null, "no live surface yet: nothing to say");
  win.__LIVE = toLiveVM([], null, "America/New_York", new Date(NOW));
  assert.equal(drawn(), null, "REGRESSION: an empty line still drew a bar");
  assert.equal(clocks, 0, "REGRESSION (defect 29): the clock ticked every second of every session, with no call up");

  win.__LIVE = toLiveVM([ongoing()], null, "America/New_York", new Date(NOW));
  const bar = drawn();
  assert.ok(bar, "someone is on the phone");
  assert.equal(clocks, 1, "a call up: the clock runs");
  assert.match(textOf(bar), /On the phone now · Rosa/);
  const went = [];
  win.CHANLY = { nav: (to) => went.push(to), address };
  bar.props.onClick();
  assert.deepEqual(went, ["live/c-live"], "REGRESSION: it opened the list, so a second call would be a guess");

  // The two controls a call has -- handing it over and ending it -- ask before
  // they act, and they stay on Live. A global bar is a door, not a trigger.
  assert.equal(
    find(bar, (n) => n.type === "button" && n !== bar),
    undefined,
    "nothing to press inside it",
  );

  win.__LIVE = undefined;
});

test("Conversations and Live are views of the Inbox: the strip is drawn over all three, the rail lights one item, and the trail starts at the Inbox", () => {
  setSurfaceValue("inbox", { THREADS: [] });
  globalThis.LiveMonitorPage = "LiveMonitorPage";
  const at = (hash) => {
    const { tree, title } = mount(hash);
    return {
      title,
      tabs: find(tree, (n) => n.type === "SurfaceTabs"),
      nav: find(tree, (n) => n.type === "Sidebar").props.active,
    };
  };

  const inbox = at("#/inbox");
  assert.equal(inbox.nav, "inbox");
  assert.equal(
    inbox.tabs.props.page,
    "inbox",
    "REGRESSION: the strip skipped the Inbox, so its views had no way back to it",
  );

  const all = at("#/conversations");
  assert.equal(all.nav, "conversations", "the shell still names the route");
  assert.equal(all.tabs.props.page, "conversations");
  assert.equal(
    all.title,
    "Conversations · Inbox · Chanlytics",
    "REGRESSION: the trail led with Conversations, a place the nav no longer has",
  );

  // The trail names a tab as its chip does, from the strip the page draws (always there: the seed's, or the read's).
  setSurfaceValue("conversations", {
    CONVERSATIONS: [],
    CV_CHANNELS: [
      { id: "all", label: "All" },
      { id: "phone", label: "Calls" },
    ],
  });
  const calls = at("#/conversations/phone");
  assert.equal(calls.title, "Calls · Conversations · Inbox · Chanlytics", "a channel is a view of a view");
  setSurfaceValue("conversations", undefined);

  const live = at("#/live");
  assert.equal(live.nav, "live");
  assert.equal(live.tabs.props.page, "live");
  assert.equal(live.title, "Live · Inbox · Chanlytics", "REGRESSION: Live hung off a nav item that is gone");

  delete globalThis.LiveMonitorPage;
});

test("Campaigns' third door is Templates, on the route that is still `messages` -- the word `message` meant three things across one nav", () => {
  const { tree, title } = mount("#/messages");
  assert.equal(
    title,
    "Templates · Campaigns · Chanlytics",
    "REGRESSION: the trail said Messages, beside an Inbox full of them",
  );
  const strip = find(tree, (n) => n.type === "SurfaceTabs");
  assert.equal(strip.props.page, "messages", "the route is untouched: every deep link still works");
  assert.ok(
    find(tree, (n) => n.type === "RoutePage"),
    "and the same page draws (the layout's, in the frame)",
  );
});

test("a list's own route lands on People with that list picked, and the address is replaced so Back leaves People -- the Lists page folded into People", () => {
  // The People page's rule, as it publishes it (people-honest.test.mjs runs the real one).
  win.__PEOPLE = {
    rows: [],
    lists: [{ id: "needs_you", label: "Needs you", ids: [] }],
    saved: [{ id: "s1", name: "Regulars", ids: [] }],
  };
  win.__listRoute = (id) =>
    id === "s1" ? "clients/list:s1" : id === "needs_you" ? "clients/seg:needs_you" : "clients";
  const from = history.replaced.length;
  const replaced = history.replaced;
  try {
    const kept = mount("#/segments/s1");
    const page = find(kept.tree, (n) => n.type === "ClientsA");
    assert.ok(page, "People is what draws");
    assert.deepEqual([page.props.initialSaved, page.props.initialSegment], ["s1", null], "with the kept list picked");
    assert.equal(kept.title, "Regulars · People · Chanlytics", "named for the list, under People");
    assert.deepEqual(replaced.slice(from), ["/w/acme/people/list:s1"], "the address says where it landed");
    const smart = mount("#/segments/needs_you");
    assert.deepEqual(
      [find(smart.tree, (n) => n.type === "ClientsA").props.initialSegment, replaced.at(-1)],
      ["needs_you", "/w/acme/people/seg:needs_you"],
      "a smart list too",
    );
    const gone = mount("#/segments/nope");
    assert.equal(
      find(gone.tree, (n) => n.type === "ClientsA").props.initialSaved,
      null,
      "a list that is not here is People itself",
    );
    assert.equal(replaced.at(-1), "/w/acme/people");
    assert.ok(!find(gone.tree, (n) => n.type === "SegmentsPage"), "never the seeded Segments page on a real workspace");
  } finally {
    delete win.__PEOPLE;
    delete win.__listRoute;
  }
});

test("the old route on a cold load: the People surface is still on its way, so the redirect waits for it instead of running once and never again", () => {
  // The nightly found it: /#/segments loaded cold stayed at #/segments in production. The effect ran before the
  // surface had landed, found no window.__PEOPLE, returned, and had no reason to run again.
  win.__listRoute = (id) => (id === "s1" && win.__PEOPLE ? "clients/list:s1" : "clients");
  win.__surfaceState = () => "real";
  const from = history.replaced.length;
  const replaced = () => history.replaced.slice(from);
  try {
    const cold = mount("#/segments/s1");
    assert.ok(
      find(cold.tree, (n) => n.type === "ClientsA"),
      "People draws from the first frame on a real workspace",
    );
    assert.ok(
      !find(cold.tree, (n) => n.type === "SegmentsPage"),
      "never the seeded Segments page while the surface is on its way",
    );
    assert.deepEqual(replaced(), [], "nothing to land on yet: which list s1 names is the surface's to say");
    win.__PEOPLE = { rows: [], lists: [], saved: [{ id: "s1", name: "Regulars", ids: [] }] };
    fire("surface:clients");
    assert.deepEqual(
      replaced(),
      ["/w/acme/people/list:s1"],
      "the moment the surface lands, the address says where it landed",
    );
    fire("surface:clients");
    fire("surface:people");
    assert.deepEqual(
      replaced(),
      ["/w/acme/people/list:s1"],
      "once: a later page of People, or its refresh, does not replace the address again",
    );
  } finally {
    delete win.__PEOPLE;
    delete win.__listRoute;
    delete win.__surfaceState;
  }
});

test("a person's page on a cold load draws the real profile before People lands, named from the copy the tab holds", () => {
  // Measured on production (23 Sep 2026): a new tab held Reading… until People's whole list was in (0.87 s) and only
  // then asked for the person. The page reads its own person now; the shell must still draw the REAL page (the seeded
  // one is what a workspace with no People rows used to get) and name them where it can.
  const ID = "ed2244f3-9f88-49c5-863e-fbdea4b60e12";
  win.__surfaceState = () => "real";
  win.__peekPerson = (id) => (id === ID ? { name: "Zoe Martin" } : null);
  try {
    const held = mount(`#/clients/${ID}`);
    const page = find(held.tree, (n) => n.type === "ClientProfile");
    assert.ok(page, "REGRESSION: a real person with no People rows yet was 'not found'");
    assert.equal(page.props.id, ID);
    assert.equal(page.props.real, true, "the real page, never the seeded profile");
    assert.match(held.title, /Zoe Martin/, "named from the copy the tab kept of them");

    win.__peekPerson = () => null;
    const cold = mount(`#/clients/${ID}`);
    assert.ok(
      find(cold.tree, (n) => n.type === "ClientProfile"),
      "a person nobody has read yet: still their page",
    );
    assert.match(cold.title, /Profile/, "and a plain crumb until someone can name them");
  } finally {
    delete win.__surfaceState;
    delete win.__peekPerson;
  }
});

test("REGRESSION: the phone's drawer is a dialog while it is open, named Navigation -- with no role, the Esc that closed it cleared People's selection", () => {
  // Drawn again with the state the last draw left, as React draws after a press.
  const redraw = () => {
    deep = false;
    frames.begin();
    const tree = win.ChanlyticsApp({ theme: "dark", themePref: "dark", sidebar: "open", onSidebar() {}, onTheme() {} });
    deep = true;
    return tree;
  };
  const wrap = (tree) => find(tree, (n) => /\bside-wrap\b/.test(String(n.props?.className || "")));
  const closed = mount("#/clients").tree;
  assert.equal(wrap(closed).props.role, undefined, "the sidebar on a desk, or the drawer shut, is no dialog");
  assert.equal(wrap(closed).props["aria-label"], undefined);
  find(closed, (n) => n.type === "Topbar").props.onMenu();
  const open = redraw();
  assert.match(String(wrap(open).props.className), /\bopen\b/, "the drawer is open");
  assert.equal(
    wrap(open).props.role,
    "dialog",
    "REGRESSION: open, it had no role, so People's keys did not hold still behind it",
  );
  assert.equal(wrap(open).props["aria-label"], "Navigation");
  assert.equal(wrap(open).props["aria-modal"], undefined, "not modal: it does not move focus into itself");
});

test("a route whose surface has not landed is an empty pane that says it is reading, never a skeleton, and the page fades in as it lands", () => {
  // The skeleton that stood here was the mockup's page anatomy and matched no real page, so every page jumped when
  // it left (layout-measure.test.mjs says what was measured). Now the pane the page will fill is empty and busy, one
  // status line says it is reading, and the route view is keyed on readiness so the route-in fade plays on the page
  // as it lands, not on the empty pane.
  const timers = [];
  const keepTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => {
    timers.push(ms);
    return 0;
  };
  const byClass = (tree, has) =>
    find(tree, (n) => typeof n.props?.className === "string" && n.props.className.includes(has));
  win.__surfaceGate = () => false;
  try {
    const { tree } = mount("#/inbox");
    assert.ok(!byClass(tree, "skel"), "no skeleton");
    assert.ok(!find(tree, (n) => n.type === "RoutePage"), "the page is not drawn before its surface lands");
    const view = byClass(tree, "route-view");
    assert.equal(view.props["aria-busy"], "true", "the pane the page will fill is busy");
    const reading = byClass(tree, "route-reading");
    assert.ok(reading, "one line says it is reading");
    assert.equal(reading.props.role, "status", "as a status, for a screen reader");
    assert.equal(textOf(reading).trim(), "Reading…");
    // The stub draws the shell shallow, so a component returned here would hide its own markup from byClass: the
    // pane is proven empty by what the boundary holds, which is that one line and nothing else.
    const boundary = view.props.children.find((k) => k && typeof k === "object");
    const inside = boundary.props.children.filter((k) => k != null && typeof k === "object");
    assert.equal(inside.length, 1, "the pane holds the one line and nothing else: no skeleton, no page");
    assert.equal(inside[0], reading);
    assert.ok(timers.includes(8000), "the unavailable pane still comes after eight seconds");
    win.__surfaceGate = () => true;
    const landed = mount("#/inbox");
    const viewLanded = byClass(landed.tree, "route-view");
    assert.notEqual(viewLanded.props.key, view.props.key, "keyed on readiness: the page fades in as it lands");
    assert.equal(viewLanded.props["aria-busy"], undefined, "and is no longer busy");
    assert.ok(!byClass(landed.tree, "route-reading"), "the line goes with the wait");
    assert.ok(
      find(landed.tree, (n) => n.type === "RoutePage"),
      "the page is there",
    );
  } finally {
    globalThis.setTimeout = keepTimeout;
    delete win.__surfaceGate;
  }
});

test("Today waits for the card it draws above its queue, and once its own read is in, only for so long", () => {
  // The card that says what is left to set up sits above the queue: landing after it, it pushed the queue down. The
  // gate holds Today for it (surface-registry ROUTE_WAITS); once Today's own surface is in, past the wait it draws.
  const due = new Map();
  const keepTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => {
    due.set(ms, fn);
    return 0;
  };
  const redraw = () => {
    deep = false;
    frames.begin();
    const tree = win.ChanlyticsApp({
      theme: "dark",
      themePref: "dark",
      sidebar: "open",
      onSidebar() {},
      onTheme() {},
      routePage,
      surfaceRoutes: SURFACE_ROUTES,
    });
    deep = true;
    return tree;
  };
  win.__routeWaitMs = 3000;
  win.__surfaceGate = (page, param, own) => !!own;
  try {
    const held = mount("#/today");
    assert.ok(!find(held.tree, (n) => n.type === "RoutePage"), "the queue is not drawn under a card still on its way");
    assert.ok(due.has(3000), "and waits the registry's time, no longer");
    due.get(3000)();
    assert.ok(
      find(redraw(), (n) => n.type === "RoutePage"),
      "past the wait, the page draws with what it has",
    );

    // The wait counts from Today's own surface landing, not from arriving: a slow own read that used the whole wait
    // would draw the moment it landed, and the card would still push the queue down.
    const told = [];
    win.__onSurfaceReady = (fn) => {
      told.push(fn);
      return () => {};
    };
    win.__surfaceGate = () => false;
    due.clear();
    mount("#/today");
    assert.ok(!due.has(3000), "REGRESSION: the wait ran from arriving, before Today's own surface was in");
    assert.ok(!find(redraw(), (n) => n.type === "RoutePage"), "a page whose own surface is not in keeps reading");
    win.__surfaceGate = (page, param, own) => !!own;
    for (const fn of told) fn();
    assert.ok(due.has(3000), "armed as Today's own surface lands");
    due.get(3000)();
    assert.ok(
      find(redraw(), (n) => n.type === "RoutePage"),
      "and past it, Today draws",
    );
  } finally {
    globalThis.setTimeout = keepTimeout;
    delete win.__surfaceGate;
    delete win.__onSurfaceReady;
    delete win.__routeWaitMs;
  }
});

test("a move that stays on the page -- People to Leads and back -- draws without the route fade; a move to another page keeps it", () => {
  // The two scopes are two mounts, and the shell's 240ms route fade played on every switch between them, on top of
  // the rows' own draw: the switch read as a wait. The fade is for arriving somewhere else.
  shell.installShell(win);
  const view = (t) =>
    find(t, (n) => typeof n.props?.className === "string" && n.props.className.includes("route-view"));
  const stays = (t) => view(t).props.className.split(/\s+/).includes("route-stay");
  const go = (hash) => {
    placeAt(hash);
    fire("popstate");
    deep = false;
    frames.begin();
    const t = win.ChanlyticsApp({ theme: "dark", themePref: "dark", sidebar: "open", onSidebar() {}, onTheme() {} });
    deep = true;
    return t;
  };
  const { tree } = mount("#/clients");
  assert.equal(stays(tree), false, "a page opened cold fades in");
  assert.equal(stays(go("#/clients/leads")), true, "Leads beside People is the same page: no fade");
  assert.equal(stays(go("#/clients")), true, "and back");
  assert.equal(
    stays(go("#/clients/c-aisha")),
    false,
    "a person's profile is somewhere else, though its route starts with the list's word",
  );
  assert.equal(stays(go("#/clients")), false, "and so is the list, coming back from it");
  assert.equal(stays(go("#/inbox")), false, "another page fades in");
  // A page landing where the reading pane stood fades in, even on the page the reading pane was for.
  win.__surfaceGate = () => false;
  try {
    assert.equal(stays(go("#/clients/leads")), false, "the reading pane never stays");
    win.__surfaceGate = () => true;
    assert.equal(stays(go("#/clients/leads")), false, "the page that lands where it stood fades in");
  } finally {
    delete win.__surfaceGate;
  }
});

test("People › Pipeline is the page's third scope at clients/pipeline: its crumbs, a mount of its own, no fade beside People and Leads -- and People where deals are off", () => {
  shell.installShell(win);
  const keepPeople = win.__PEOPLE;
  const view = (t) =>
    find(t, (n) => typeof n.props?.className === "string" && n.props.className.includes("route-view"));
  const stays = (t) => view(t).props.className.split(/\s+/).includes("route-stay");
  const go = (hash) => {
    placeAt(hash);
    fire("popstate");
    deep = false;
    frames.begin();
    const t = win.ChanlyticsApp({ theme: "dark", themePref: "dark", sidebar: "open", onSidebar() {}, onTheme() {} });
    deep = true;
    return t;
  };
  const page = (t) => find(t, (n) => n.type === "ClientsA");
  const crumbs = (t) => find(t, (n) => n.type === "Topbar").props.crumbs;
  const mountKey = (t) => find(t, (n) => String(n.props?.className || "").includes("main-scroll")).props.key;
  try {
    win.__PEOPLE = { rows: [], lists: [], saved: [], dealsOn: true };
    const { tree } = mount("#/clients/pipeline");
    assert.deepEqual([page(tree).props.scope, page(tree).props.key], ["pipeline", "pipeline"]);
    assert.deepEqual(crumbs(tree), [{ label: "People", to: "clients" }, "Pipeline"]);
    page(tree).props.onOpenProfile("p-1");
    assert.equal(win.location.pathname, "/w/acme/people/p-1", "a row opens its person");
    const people = mount("#/clients");
    assert.notEqual(mountKey(tree), mountKey(people.tree), "the Pipeline and People are two mounts, as Leads is");
    // One page, three scopes: moving between them draws at once, as People and Leads do.
    assert.equal(stays(go("#/clients")), false, "a page opened cold fades in");
    assert.equal(stays(go("#/clients/pipeline")), true, "the Pipeline beside People is the same page: no fade");
    assert.equal(stays(go("#/clients/leads")), true, "and beside Leads");
    assert.equal(stays(go("#/clients/pipeline")), true);
    assert.equal(stays(go("#/clients")), true, "and back");
    assert.equal(stays(go("#/clients/c-aisha")), false, "a person is somewhere else");
    // Every view of the Pipeline, and a person open over one, is the page already there: it follows its address as a
    // prop (contracts pipelineRoute), and the crumbs name the view.
    const keepPipeline = win.__pipeline;
    win.__pipeline = { parse: parsePipelineRoute, viewLabel: pipelineViewLabel };
    try {
      const viewed = mount("#/clients/pipeline:v-proposals:p-5b3c1a2e");
      assert.equal(mountKey(viewed.tree), mountKey(tree), "one mount for the whole address family");
      assert.deepEqual(
        [page(viewed.tree).props.scope, page(viewed.tree).props.pipelineRoute],
        ["pipeline", "pipeline:v-proposals:p-5b3c1a2e"],
      );
      assert.deepEqual(crumbs(viewed.tree), [
        { label: "People", to: "clients" },
        { label: "Pipeline", to: "clients/pipeline" },
        "Proposal out",
      ]);
      // What waits on the owner is named by the workspace's pace, as the rail names it (0008, amended).
      const keepPeople = win.__PEOPLE;
      win.__PEOPLE = {
        ...keepPeople,
        dealPace: { medianDays: 8, yeses: 6, waitDays: 10, longerThanUsual: true, words: "Usually 8 days to a yes" },
      };
      assert.equal(crumbs(mount("#/clients/pipeline:v-waiting").tree).at(-1), "Nothing back in 10 days");
      win.__PEOPLE = keepPeople;
      assert.equal(crumbs(mount("#/clients/pipeline:v-waiting").tree).at(-1), "Nothing back in a week");
    } finally {
      win.__pipeline = keepPipeline;
    }
    // Where deals are off the address draws People, and says People.
    win.__PEOPLE = { rows: [], lists: [], saved: [], dealsOn: false };
    const off = mount("#/clients/pipeline");
    assert.deepEqual([page(off.tree).props.scope, page(off.tree).props.key], ["people", "people"]);
    assert.deepEqual(crumbs(off.tree), ["People"]);
    const offView = mount("#/clients/pipeline:v-proposals");
    assert.deepEqual(
      [page(offView.tree).props.scope, page(offView.tree).props.pipelineRoute],
      ["people", null],
      "every view of it too",
    );
  } finally {
    win.__PEOPLE = keepPeople;
  }
});
