/**
 * One message re-reads the surfaces that draw messages, and draws the shell once.
 *
 * Measured on main at 1388f2cc6 (29 Sep 2026): a message INSERT re-read seven surfaces (conversations, inbox, today,
 * people, reports, broadcasts, playbooks), People and Broadcasts each reading every page of contacts, on whatever page
 * the owner had open; and each read told every status listener, so LegacyApp drew the whole shell seven times.
 *
 * Run on the real overrides' routing through the real runner, with each read recorded instead of made: a message
 * re-reads the Inbox, Conversations and Today, and the page on screen; a surface that let one pass is read once as its
 * page comes on screen. And the shell (app-shell.jsx on a stub React, over the real signal): the reads of a message
 * move nothing for a page that draws none of them, and one redraw for Today.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { hookFrames } from "../../_hook-frames.mjs";

const heard = new Map();
const win = {
  __ACTIVE_WORKSPACE: "ws-1",
  location: { pathname: "/w/acme", search: "", hash: "#/today", assign() {}, replace() {}, reload() {} },
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
globalThis.window = win;
globalThis.document = { visibilityState: "hidden", title: "", addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent ??= class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n = 10) => {
  for (let i = 0; i < n; i += 1) await tick();
};

const runner = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
const status = await importSrc("apps/dashboard/src/legacy-bridge/surface-status.ts");
const registry = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
const { workspaceOverride } = await importSrc("apps/dashboard/src/legacy-bridge/surface-data.ts");
const S = "apps/dashboard/src/legacy-bridge/surfaces";
const REAL = [
  workspaceOverride,
  (await importSrc(`${S}/conversations.ts`)).conversationsOverride,
  (await importSrc(`${S}/inbox.ts`)).inboxOverride,
  (await importSrc(`${S}/today.ts`)).todayOverride,
  (await importSrc(`${S}/settings.ts`)).settingsOverride,
  (await importSrc(`${S}/people.ts`)).peopleOverride,
  (await importSrc("apps/dashboard/src/legacy-bridge/leads.ts")).leadsOverride,
  (await importSrc(`${S}/reports.ts`)).reportsOverride,
  (await importSrc(`${S}/live.ts`)).liveOverride,
  (await importSrc(`${S}/broadcasts.ts`)).broadcastsOverride,
  (await importSrc(`${S}/playbooks.ts`)).playbooksOverride,
  (await importSrc("apps/dashboard/src/legacy-bridge/reach-out/reach-outs.ts")).reachOutsOverride,
  (await importSrc("apps/dashboard/src/legacy-bridge/reach-out/replies.ts")).repliesOverride,
  (await importSrc("apps/dashboard/src/legacy-bridge/partner.ts")).partnerOverride,
  (await importSrc(`${S}/calendar.ts`)).calendarOverride,
  (await importSrc(`${S}/notifications.ts`)).notificationsOverride,
  (await importSrc("apps/dashboard/src/legacy-bridge/setup.ts")).setupOverride,
  (await importSrc("apps/dashboard/src/legacy-bridge/google.ts")).googleOverride,
  (await importSrc("apps/dashboard/src/legacy-bridge/billing.ts")).billingOverride,
];

/** The real overrides' routing, each read recorded rather than made, through a runner whose live feed this holds. */
async function running() {
  const asked = [];
  const overrides = REAL.map((o) => ({
    ...o,
    debounceMs: 1,
    apply: async () => {
      asked.push(o.key);
    },
  }));
  let feed = null;
  const stop = runner.startSurfaces(overrides, (onChange) => {
    feed = onChange;
    return () => {};
  });
  const offMissed = registry.readWhatWasMissed(
    overrides,
    (keys) => void runner.refreshSurfaces(overrides.filter((o) => keys.includes(o.key))),
    win,
  );
  await settle(20);
  assert.ok(feed, "the feed is joined once the boot is in");
  asked.length = 0;
  const change = async (table, event) => {
    feed({ tenant_id: "ws-1" }, table, event);
    await settle(10);
  };
  return {
    asked,
    change,
    message: () => change("messages", "INSERT"),
    stop: () => {
      stop();
      offMissed();
    },
  };
}

test("a message re-reads the Inbox, Conversations and Today, not the four surfaces nobody is looking at", async () => {
  win.location.hash = "#/today";
  const r = await running();
  try {
    await r.message();
    assert.deepEqual(
      [...r.asked].sort(),
      ["conversations", "inbox", "today"],
      "REGRESSION: seven surfaces per message",
    );
  } finally {
    r.stop();
  }
});

test("the page on screen hears messages too, and a surface that let one pass is read once when its page comes back", async () => {
  win.location.hash = "#/clients";
  const r = await running();
  try {
    await r.message();
    assert.deepEqual([...r.asked].sort(), ["conversations", "inbox", "people", "today"], "People, on screen, follows");
    r.asked.length = 0;

    win.location.hash = "#/inbox";
    win.dispatchEvent({ type: "hashchange" });
    await settle();
    assert.deepEqual(r.asked, [], "nothing was missed");
    await r.message();
    await r.message();
    assert.deepEqual([...new Set(r.asked)].sort(), ["conversations", "inbox", "today"]);
    r.asked.length = 0;

    win.location.hash = "#/reports";
    win.dispatchEvent({ type: "hashchange" });
    await settle();
    assert.deepEqual(r.asked, ["reports"], "Reports let two messages pass, and is read once as it comes on screen");
    r.asked.length = 0;
    win.location.hash = "#/clients/pipeline";
    win.dispatchEvent({ type: "hashchange" });
    await settle();
    assert.deepEqual(r.asked, ["people"], "and People, once, on its Pipeline");
    win.location.hash = "#/today";
    win.dispatchEvent({ type: "hashchange" });
    win.location.hash = "#/clients";
    win.dispatchEvent({ type: "hashchange" });
    await settle();
    assert.deepEqual(r.asked, ["people"], "read once: nothing passed it since");
  } finally {
    r.stop();
    win.location.hash = "#/today";
  }
});

test("a surface's own tables reach it wherever the page is, and a thread's update reaches only the three", async () => {
  win.location.hash = "#/today";
  const r = await running();
  try {
    // A teammate's deal moves People's rows and the Pipeline: People's own table, heard off its page.
    await r.change("deals", "UPDATE");
    assert.deepEqual(r.asked, ["people"]);
    r.asked.length = 0;
    await r.change("conversations", "UPDATE");
    assert.deepEqual([...r.asked].sort(), ["conversations", "inbox", "today"], "a snooze or a pause: the three");
  } finally {
    r.stop();
  }
});

/* ------------------------------- the shell's draws ------------------------------- */

// app-shell.jsx on a stub React that counts what would make React draw it again: a setter that changed its value, or
// a store the component reads that said it moved.
let cells = {};
let redraws = 0;
const frames = hookFrames();
globalThis.Icon = "Icon";
globalThis.React = {
  Fragment: "Fragment",
  Component: class {},
  createElement: (type, p, ...kids) => ({ type, props: { ...(p || {}), children: kids.flat(Infinity) } }),
  useState: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init;
    return [
      cells[k],
      (v) => {
        const was = cells[k];
        cells[k] = typeof v === "function" ? v(was) : v;
        if (!Object.is(was, cells[k])) redraws += 1;
      },
    ];
  },
  useReducer: (red, init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = init;
    return [
      cells[k],
      (a) => {
        const was = cells[k];
        cells[k] = red(was, a);
        if (!Object.is(was, cells[k])) redraws += 1;
      },
    ];
  },
  useRef: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = { current: init };
    return cells[k];
  },
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useEffect: (fn, deps) => {
    const k = frames.key();
    const prev = cells[k];
    if (prev && deps && prev.deps && deps.every((d, i) => Object.is(d, prev.deps[i]))) return;
    if (prev && typeof prev.cleanup === "function") prev.cleanup();
    cells[k] = { deps, cleanup: fn() };
  },
  useSyncExternalStore: (subscribe, snapshot) => {
    const k = frames.key();
    const prev = cells[k];
    if (prev && typeof prev.cleanup === "function") prev.cleanup();
    cells[k] = {
      cleanup: subscribe(() => {
        redraws += 1;
      }),
    };
    return snapshot();
  },
};
globalThis.useSurface = status.surfaceHook(globalThis.React, registry.routeSurfaces);
for (const name of ["Sidebar", "Topbar", "LiveCallBar", "ShellStatusBar", "SurfaceTabs", "AskBar", "ShortcutsSheet"])
  globalThis[name] = name;
registry.installRouteGate();
registry.installSurfaceRegistry();
win.drawRoute = (r) => ({
  activeNav: r.page,
  crumbs: [r.page],
  pane: false,
  primaryAction: null,
  content: null,
  mountKey: r.routeKey,
});
await import("../../../../../apps/dashboard/src/legacy/pages/app-shell.jsx");

/** The shell at `hash`, drawn: the redraws it would ask for from here on are counted. */
function shellAt(hash) {
  // The last shell goes, as React unmounts it: what it heard is let go.
  for (const c of Object.values(cells)) if (c && typeof c.cleanup === "function") c.cleanup();
  cells = {};
  win.location.hash = hash;
  frames.begin();
  win.ChanlyticsApp({ theme: "light", themePref: "light", sidebar: "open", onSidebar() {}, onTheme() {} });
  redraws = 0;
}
/** A read of `key` landing, as the seam lands one: its event, then its status (still live). */
function lands(key) {
  const o = REAL.find((x) => x.key === key);
  for (const e of o.events ?? []) win.dispatchEvent({ type: e });
  status.setStatus(key, "live");
}

test("REGRESSION: the three reads of a message draw the shell once on Today and not at all on a page that draws none of them -- it drew seven times", () => {
  const off = status.hearSurfaces(REAL, win);
  for (const o of REAL) status.setStatus(o.key, "live");
  let told = 0;
  const offStatus = status.onSurfaceStatusChange(() => {
    told += 1;
  });
  try {
    shellAt("#/today");
    for (const key of ["conversations", "inbox", "today"]) lands(key);
    assert.equal(redraws, 1, "Today draws from its own surface; the Inbox's and Conversations' reads are not its");
    assert.equal(told, 0, "a live surface read again and still live tells no status listener: LegacyApp drew on each");

    shellAt("#/calendar");
    for (const key of ["conversations", "inbox", "today"]) lands(key);
    assert.equal(redraws, 0, "the Calendar draws none of them");
    lands("calendar");
    assert.equal(redraws, 1, "its own read draws it");
    lands("people");
    assert.equal(redraws, 2, "and People, which it draws beside it (a peek's deal)");

    shellAt("#/inbox");
    lands("conversations");
    assert.equal(redraws, 1, "the Inbox draws a call from Conversations' read");
    status.setStatus("inbox", "degraded");
    assert.equal(redraws, 2, "a status that changed is news for the route whose surface it is");
    assert.equal(told, 1, "and for the line under the top bar");
    status.setStatus("inbox", "degraded");
    assert.equal(redraws, 2, "the same status again is not");
    status.setStatus("inbox", "live");
  } finally {
    off();
    offStatus();
  }
});

/* ------------------------------- landmarks and where focus goes ------------------------------- */

const nodesOf = (tree, keep, out = []) => {
  if (!tree || typeof tree !== "object") return out;
  if (keep(tree)) out.push(tree);
  for (const k of [tree.props?.children ?? []].flat(Infinity)) nodesOf(k, keep, out);
  return out;
};

test("the page is a main landmark with a way past the bars to it, and a move to another page puts focus on it once it has drawn", () => {
  const off = status.hearSurfaces(REAL, win);
  for (const o of REAL) status.setStatus(o.key, "live");
  const keep = globalThis.document;
  const focused = [];
  const put = (name) => ({
    name,
    attrs: {},
    getAttribute(k) {
      return k in this.attrs ? this.attrs[k] : null;
    },
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    focus() {
      focused.push(name);
    },
  });
  const heading = put("its heading");
  const inside = put("a field on the page");
  const region = {
    ...put("the region"),
    contains: (n) => n === region || n === inside || n === heading,
    querySelector: () => heading,
  };
  globalThis.document = {
    ...keep,
    body: {},
    activeElement: null,
    getElementById: (id) => (id === "main" ? region : null),
  };
  const props = { theme: "light", themePref: "light", sidebar: "open", onSidebar() {}, onTheme() {} };
  const draw = () => {
    frames.begin();
    return win.ChanlyticsApp(props);
  };
  const goTo = (hash) => {
    win.location.hash = hash;
    win.dispatchEvent({ type: "hashchange" });
    return draw();
  };
  try {
    cells = {};
    win.location.hash = "#/today";
    let tree = draw();
    const mains = nodesOf(tree, (n) => n.type === "main");
    assert.equal(mains.length, 1, "one main landmark");
    assert.equal(mains[0].props.id, "main");
    assert.ok(mains[0].props.className.includes("route-view"), "the page's own region, where it always was");
    assert.deepEqual(focused, [], "the page the tab opened on is where focus starts");
    const [skip] = nodesOf(tree, (n) => n.type === "button" && String(n.props.className).includes("skip-link"));
    assert.ok(skip, "a way past the sidebar and the bars, the first thing in the app");
    assert.equal(
      nodesOf(tree, (n) => n.type === "div" && String(n.props.className).includes("app-root"))[0].props.children.flat(
        Infinity,
      )[0],
      skip,
      "the first stop for Tab",
    );

    tree = goTo("#/calendar");
    assert.deepEqual(focused, ["its heading"], "another page: focus goes to its heading, as a page load would");
    assert.equal(heading.attrs.tabindex, "-1", "made focusable for it");

    focused.length = 0;
    globalThis.document.activeElement = inside;
    tree = goTo("#/inbox");
    assert.deepEqual(focused, [], "never from where the person is already working inside the page");

    globalThis.document.activeElement = null;
    tree = goTo("#/inbox");
    assert.deepEqual(focused, [], "the same page again is not a move");
    tree = goTo("#/today");
    assert.deepEqual(focused, ["its heading"], "from the sidebar, or the address, it is");

    focused.length = 0;
    globalThis.document.activeElement = inside;
    const [pressed] = nodesOf(draw(), (n) => n.type === "button" && String(n.props.className).includes("skip-link"));
    pressed.props.onClick();
    assert.deepEqual(
      focused,
      ["its heading"],
      "the skip link is asked for, so it takes focus even from inside the page",
    );
  } finally {
    globalThis.document = keep;
    off();
    win.location.hash = "#/today";
  }
});
