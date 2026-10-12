/**
 * The page's side of the bridge to the native shell (legacy-bridge/app-bridge.ts), run against a window of its own:
 * nothing is installed outside the app; inside, the page says its route, that a person is in, and the workspace at
 * install, then every route change, every needs-you count and every workspace change; the shell's navigate moves the
 * route (a path in a workspace, decision 0015), its menu and top become the shell's own events, and a message that
 * does not parse does nothing.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { installAppBridge } from "../../../../apps/dashboard/src/legacy-bridge/app-bridge.ts";

globalThis.CustomEvent ??= class CustomEvent extends Event {
  constructor(type, init) {
    super(type);
    this.detail = init?.detail;
  }
};

function windowOf({
  inApp = true,
  native = true,
  hash = "#/today",
  pathname = "/w/acme-plumbing",
  bell = null,
  theme = "dark",
  overlays = null,
} = {}) {
  const listeners = new Map();
  const posted = [];
  const moved = (url) => {
    if (url.startsWith("#")) win.location.hash = url;
    else win.location.pathname = url;
  };
  const win = {
    ...(bell ? { __notifs: bell } : {}),
    document: {
      documentElement: {
        classList: { contains: (c) => inApp && c === "in-app" },
        getAttribute: (n) => (n === "data-theme" ? theme : null),
      },
      // The page's dialogs in the document's order; one that closed has left the document.
      ...(overlays ? { querySelectorAll: () => overlays.filter((n) => n.isConnected), activeElement: null } : {}),
    },
    location: {
      hash,
      pathname,
      assign(url) {
        posted.push({ assigned: url });
      },
    },
    // What the App Router's patched history does to the address, for the route the page pushes.
    history: {
      pushState: (_data, _unused, url) => moved(url),
      replaceState: (_data, _unused, url) => moved(url),
    },
    ...(native ? { ReactNativeWebView: { postMessage: (s) => posted.push(JSON.parse(s)) } } : {}),
    addEventListener: (t, fn) => listeners.set(t, [...(listeners.get(t) ?? []), fn]),
    removeEventListener: (t, fn) =>
      listeners.set(
        t,
        (listeners.get(t) ?? []).filter((f) => f !== fn),
      ),
    dispatchEvent: (e) => {
      (listeners.get(e.type) ?? []).forEach((fn) => fn(e));
      return !e.defaultPrevented;
    },
  };
  return { win, posted, fire: (type, detail) => win.dispatchEvent(new CustomEvent(type, { detail })) };
}

/**
 * The count of what needs you as the bridge asks for it (app-bridge.ts NeedsSource): a number now, null before the Inbox has
 * been read, and the page's hearing of it move. `set` is the selector's number changing, and tells whoever listens.
 */
function needsOf(first = null) {
  let value = first;
  const heard = new Set();
  return {
    source: { now: () => value, hear: (fn) => (heard.add(fn), () => heard.delete(fn)) },
    set(next) {
      value = next;
      for (const fn of [...heard]) fn();
    },
    get listeners() {
      return heard.size;
    },
  };
}

test("outside the app, or without the shell's wire, nothing is installed", () => {
  for (const opts of [{ inApp: false }, { native: false }]) {
    const { win, posted } = windowOf(opts);
    installAppBridge(win);
    assert.deepEqual(posted, []);
    assert.equal(win.__appBridge, undefined);
  }
});

test("at install the page says a person is in, its theme, the workspace and the route; then every change", () => {
  const { win, posted, fire } = windowOf({ hash: "#/inbox", theme: "light" });
  const needs = needsOf();
  const off = installAppBridge(win, undefined, needs.source);
  assert.deepEqual(posted, [
    { t: "session", state: "in" },
    { t: "theme", theme: "light" },
    { t: "workspace", slug: "acme-plumbing" },
    { t: "route", route: "inbox" },
    { t: "overlay", open: false },
  ]);
  posted.length = 0;
  // Back to a page of its own: the address moved, and the browser said so.
  win.location.pathname = "/w/acme-plumbing/clients/abc";
  fire("popstate");
  needs.set(3);
  needs.set(3); // the same number again is not news
  needs.set(null); // a count not read is not a count
  needs.set(2.7);
  win.location.pathname = "/w/other-shop";
  fire("workspace:changed");
  assert.deepEqual(posted, [
    { t: "route", route: "clients/abc" },
    { t: "needs", inbox: 3 },
    { t: "needs", inbox: 2 },
    { t: "workspace", slug: "other-shop" },
  ]);
  assert.equal(needs.listeners, 1, "the one count is heard once");
  off();
  assert.equal(needs.listeners, 0, "and let go");
  win.location.pathname = "/w/acme-plumbing/today";
  fire("popstate");
  needs.set(9);
  assert.equal(posted.length, 4, "uninstalled: silent");
  assert.equal(win.__appBridge, undefined);
});

test("the native Inbox tab is told what needs you at install when the Inbox has been read, and never the same number twice", () => {
  const { win, posted } = windowOf();
  const needs = needsOf(4);
  installAppBridge(win, undefined, needs.source);
  assert.deepEqual(
    posted.filter((m) => m.t === "needs"),
    [{ t: "needs", inbox: 4 }],
    "a page that loads with the count known (the tab's cache) says it at once",
  );
  needs.set(4);
  needs.set(0);
  assert.deepEqual(
    posted.filter((m) => m.t === "needs").map((m) => m.inbox),
    [4, 0],
    "and a count that falls to nothing clears the badge",
  );
});

test("the shell's navigate moves the route, as a path; menu and top become the shell's events; a bad message does nothing", () => {
  const { win, fire } = windowOf();
  installAppBridge(win);
  const heard = [];
  win.addEventListener("shell:menu", () => heard.push("menu"));
  win.addEventListener("shell:top", () => heard.push("top"));
  win.__appBridge.receive('{"t":"navigate","route":"inbox"}');
  assert.equal(win.location.pathname, "/w/acme-plumbing/inbox");
  fire("shell:ready");
  win.__appBridge.receive('{"t":"menu"}');
  win.__appBridge.receive('{"t":"top"}');
  win.__appBridge.receive('{"t":"navigate","route":"https://example.com/x"}');
  win.__appBridge.receive("nope");
  assert.deepEqual(heard, ["menu", "top"]);
  assert.equal(win.location.pathname, "/w/acme-plumbing/inbox");
});

test("a tapped push for another workspace opens that workspace's page, sealing what this tab kept of this one; one for this workspace moves the route", async () => {
  const HERE = "11111111-1111-4111-8111-111111111111";
  const THERE = "22222222-2222-4222-8222-222222222222";
  const { win, posted } = windowOf();
  win.__ACTIVE_WORKSPACE = HERE;
  // The tab's cache, which this page's reads go into (surface-cache.ts reads the page's window and storage).
  const kept = new Map();
  const was = { window: globalThis.window, sessionStorage: globalThis.sessionStorage };
  globalThis.sessionStorage = {
    getItem: (k) => (kept.has(k) ? kept.get(k) : null),
    setItem: (k, v) => kept.set(k, String(v)),
    removeItem: (k) => kept.delete(k),
  };
  globalThis.window = win;
  const cache = await import("../../../../apps/dashboard/src/legacy-bridge/surface-cache.ts");
  const CACHE = "chanlytics.surfaces.v1";
  try {
    installAppBridge(win);
    win.__appBridge.receive(JSON.stringify({ t: "navigate", route: "inbox/th-1", workspace: HERE }));
    assert.equal(win.location.pathname, "/w/acme-plumbing/inbox/th-1");
    assert.equal(posted.filter((p) => p.assigned).length, 0, "this workspace: no load");
    win.INBOX_PROBE = { threads: ["acme-plumbing's"] };
    cache.snapshotSurface("inbox", ["INBOX_PROBE"], HERE);
    cache.flushSurfaceCache();
    assert.ok(kept.get(CACHE), "this workspace's rows, cached, as a reload would paint them");
    win.__appBridge.receive(JSON.stringify({ t: "navigate", route: "inbox/th-2", workspace: THERE }));
    assert.deepEqual(
      posted.filter((p) => p.assigned),
      [{ assigned: `/w/${THERE}/inbox/th-2` }],
      "REGRESSION: a push for one workspace opened its thread in whichever workspace the phone was showing",
    );
    assert.equal(win.location.pathname, "/w/acme-plumbing/inbox/th-1", "and this page's route is not moved under it");
    assert.equal(kept.get(CACHE), undefined, "REGRESSION: the other workspace's address loaded with this one's rows");
    // A read lands before the page unloads: persisted as every read is, and written by the page's hide.
    cache.snapshotSurface("inbox", ["INBOX_PROBE"], HERE);
    cache.flushSurfaceCache();
    assert.equal(kept.get(CACHE), undefined, "REGRESSION: written back into the tab the other workspace loads in");
  } finally {
    Object.assign(globalThis, was);
  }
});

// After the test above, which seals the cache module for this file's life: a seal is seen here as the tab's slot
// emptied, which every seal does.
test("REGRESSION: a push that arrives before the workspaces read lands leaves the page only for another workspace -- one for this workspace sealed the tab's cache and loaded the page again", () => {
  const HERE = "11111111-1111-4111-8111-111111111111";
  const THERE = "22222222-2222-4222-8222-222222222222";
  const CACHE = "chanlytics.surfaces.v1";
  const ROWS = "this workspace's rows";
  const kept = new Map();
  const was = { window: globalThis.window, sessionStorage: globalThis.sessionStorage };
  globalThis.sessionStorage = {
    getItem: (k) => (kept.has(k) ? kept.get(k) : null),
    setItem: (k, v) => kept.set(k, String(v)),
    removeItem: (k) => kept.delete(k),
  };
  // A page just loaded: its tab's cache in the slot, and no workspaces read landed yet (no __ACTIVE_WORKSPACE).
  const cold = (pathname) => {
    const page = windowOf({ pathname, hash: "" });
    globalThis.window = page.win;
    kept.set(CACHE, ROWS);
    return { ...page, off: installAppBridge(page.win) };
  };
  const push = (win, route, workspace) => win.__appBridge.receive(JSON.stringify({ t: "navigate", route, workspace }));
  const loads = (posted) => posted.filter((p) => p.assigned);
  try {
    // A page a push opened by its id (workspaceHref): the address names the push's workspace.
    let page = cold(`/w/${HERE}/today`);
    push(page.win, "inbox/th-1", HERE);
    assert.deepEqual(loads(page.posted), [], "REGRESSION: loaded again for the workspace it was already in");
    assert.equal(page.win.location.pathname, `/w/${HERE}/inbox/th-1`, "the route moved");
    assert.equal(kept.get(CACHE), ROWS, "REGRESSION: the tab's cache sealed for its own workspace");
    push(page.win, "inbox/th-2", THERE);
    assert.deepEqual(loads(page.posted), [{ assigned: `/w/${THERE}/inbox/th-2` }], "another id is another workspace");
    assert.equal(kept.get(CACHE), undefined, "and leaving for it seals");

    // A page at its slug, which says nothing of an id: the push waits for the read, and moves the route when the read
    // says the workspace is this one.
    page = cold("/w/acme-plumbing/today");
    push(page.win, "inbox/th-1", HERE);
    assert.deepEqual(loads(page.posted), [], "REGRESSION: loaded at once, whatever the push named");
    assert.equal(page.win.location.pathname, "/w/acme-plumbing/today", "nor moved under a workspace it cannot name");
    assert.equal(kept.get(CACHE), ROWS);
    page.win.__ACTIVE_WORKSPACE = HERE;
    page.fire("surface:workspace");
    assert.deepEqual(loads(page.posted), [], "this workspace: no load");
    assert.equal(page.win.location.pathname, "/w/acme-plumbing/inbox/th-1", "the route moved");
    assert.equal(kept.get(CACHE), ROWS, "the tab's cache kept");
    page.fire("surface:workspace");
    assert.deepEqual(loads(page.posted), [], "answered once");

    // The read names another workspace than the push's: that one's page, sealed; of two taps, the latest.
    page = cold("/w/acme-plumbing");
    push(page.win, "inbox/th-1", HERE);
    push(page.win, "inbox/th-2", THERE);
    page.win.__ACTIVE_WORKSPACE = HERE;
    page.fire("surface:workspace");
    assert.deepEqual(loads(page.posted), [{ assigned: `/w/${THERE}/inbox/th-2` }]);
    assert.equal(page.win.location.pathname, "/w/acme-plumbing", "the earlier tap is not opened under it");
    assert.equal(kept.get(CACHE), undefined);

    // Off a workspace page (the home), nothing is this page's: the push's workspace opens at once.
    page = cold("/");
    push(page.win, "inbox/th-1", HERE);
    assert.deepEqual(loads(page.posted), [{ assigned: `/w/${HERE}/inbox/th-1` }]);

    // Uninstalled while one waits: nothing opens.
    page = cold("/w/acme-plumbing");
    push(page.win, "inbox/th-1", THERE);
    page.off();
    page.win.__ACTIVE_WORKSPACE = HERE;
    page.fire("surface:workspace");
    assert.deepEqual(loads(page.posted), []);
    assert.equal(kept.get(CACHE), ROWS);

    // No read lands: past the wait, the push opens its workspace's page as it did, never under this one's slug.
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      page = cold("/w/acme-plumbing");
      push(page.win, "inbox/th-1", HERE);
      mock.timers.tick(1000);
      assert.deepEqual(loads(page.posted), [], "a second in, it still waits");
      mock.timers.tick(60_000);
      assert.deepEqual(loads(page.posted), [{ assigned: `/w/${HERE}/inbox/th-1` }]);
      assert.equal(page.win.location.pathname, "/w/acme-plumbing");
      assert.equal(kept.get(CACHE), undefined);
    } finally {
      mock.timers.reset();
    }
  } finally {
    Object.assign(globalThis, was);
  }
});

test("a menu ask that arrives before the shell has mounted waits for it; a scroll to the top of nothing is dropped", () => {
  // The bridge is installed as the page's script loads, seconds before app-shell.jsx mounts and listens: the More
  // tab's one ask used to arrive with nobody listening, and the drawer never opened.
  const { win, fire } = windowOf();
  const off = installAppBridge(win);
  const heard = [];
  win.addEventListener("shell:menu", () => heard.push("menu"));
  win.addEventListener("shell:top", () => heard.push("top"));
  win.__appBridge.receive('{"t":"menu"}');
  win.__appBridge.receive('{"t":"top"}');
  assert.deepEqual(heard, [], "nothing is said before the shell is ready");
  fire("shell:ready");
  assert.deepEqual(heard, ["menu"], "the menu ask is replayed once the shell listens; the early top is dropped");
  win.__appBridge.receive('{"t":"menu"}');
  assert.deepEqual(heard, ["menu", "menu"], "after that, at once");
  off();
});

const doors = (answer = true) => {
  const calls = [];
  return {
    calls,
    register: async (d) => {
      calls.push(["register", d]);
      if (answer instanceof Error) throw answer;
      return answer;
    },
    forget: async (t) => {
      calls.push(["forget", t]);
      return answer;
    },
  };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

test("the shell's device ask goes through the page's own doors, and the page says what became of it", async () => {
  const { win, posted } = windowOf();
  const d = doors(true);
  installAppBridge(win, d);
  win.__appBridge.receive('{"t":"device","token":"ExponentPushToken[abc]","platform":"ios","version":"1.0.0"}');
  await tick();
  assert.deepEqual(d.calls, [["register", { token: "ExponentPushToken[abc]", platform: "ios", app_version: "1.0.0" }]]);
  assert.deepEqual(posted.at(-1), { t: "device", state: "registered" });
  // Before a sign-out the page forgets the phone it registered, on its own (shell.ts signOut); once is enough.
  await win.__appBridge.forgetPhone();
  assert.deepEqual(d.calls.at(-1), ["forget", "ExponentPushToken[abc]"]);
  assert.deepEqual(posted.at(-1), { t: "device", state: "forgotten" });
  const calls = d.calls.length;
  await win.__appBridge.forgetPhone();
  assert.equal(d.calls.length, calls, "nothing registered any more: nothing to forget");
  const refused = doors(false);
  const w2 = windowOf();
  installAppBridge(w2.win, refused);
  w2.win.__appBridge.receive('{"t":"device","token":"tok","platform":"android","version":""}');
  await tick();
  assert.deepEqual(refused.calls, [["register", { token: "tok", platform: "android" }]], "no version, no field");
  assert.deepEqual(w2.posted.at(-1), { t: "device", state: "refused" });
  const thrown = doors(new Error("offline"));
  const w3 = windowOf();
  installAppBridge(w3.win, thrown);
  w3.win.__appBridge.receive('{"t":"device","token":"tok","platform":"ios","version":"1"}');
  await tick();
  assert.deepEqual(
    w3.posted.at(-1),
    { t: "device", state: "refused" },
    "a door that throws is a refusal, never silence",
  );
});

test("the icon's number is the bell's kept rows' unread count, posted at install and on every change; without a bell, nothing", () => {
  let n = 2;
  let cb = null;
  // The bell also counts the rows the page derives itself (`unread`), which the edge cannot count before a push: the icon is
  // the number the edge counts, so the page asks for the kept rows' alone (D1-phone-badge).
  const bell = { unread: () => n + 3, keptUnread: () => n, onChange: (f) => ((cb = f), () => (cb = null)) };
  const { win, posted } = windowOf({ bell });
  const off = installAppBridge(win, doors(), needsOf().source);
  assert.deepEqual(posted.at(-1), { t: "badge", n: 2 });
  n = 0;
  cb();
  assert.deepEqual(posted.at(-1), { t: "badge", n: 0 });
  off();
  assert.equal(cb, null, "uninstalled: the bell is let go");
  const bare = windowOf();
  installAppBridge(bare.win, doors());
  assert.ok(!bare.posted.some((m) => m.t === "badge"));
});

test("Today is handed to the widget at install and on every refresh, in the snapshot's shape", () => {
  const vm = {
    standing: {
      headline: "Quiet so far",
      chips: [],
      lines: { text: "", down: false },
      alert: null,
      detail: null,
      tone: "calm",
    },
    needsYou: null,
    figures: [{ id: "messages", label: "messages", value: 4, meta: "", receipt: null }],
    queue: { rows: [], more: 0, parts: [], empty: { headline: "", sub: "" }, waiting: 0 },
  };
  const { win, posted, fire } = windowOf();
  win.TODAY_DATA = vm;
  installAppBridge(win, doors());
  const first = posted.find((m) => m.t === "today");
  assert.equal(first.snapshot.headline, "Quiet so far");
  assert.deepEqual(first.snapshot.figures, [{ label: "messages", value: 4 }]);
  win.TODAY_DATA = { ...vm, standing: { ...vm.standing, headline: "1 person needs you" } };
  fire("surface:today");
  assert.equal(posted.at(-1).snapshot.headline, "1 person needs you");
  const bare = windowOf();
  installAppBridge(bare.win, doors());
  assert.ok(!bare.posted.some((m) => m.t === "today"), "no Today yet, nothing to hand over");
});

test("the Live page's refresh tells the shell how many calls are still up, so the phone can end the call's activity", () => {
  const { win, posted, fire } = windowOf();
  installAppBridge(win, doors());
  fire("surface:live");
  assert.ok(!posted.some((m) => m.t === "calls"), "no Live yet, nothing to say");
  // A call as Live reads it, and the heartbeat the read carries (liveStillUp's rule: the provider's last word is newer than it).
  const at = Date.now();
  const call = (over = {}) => ({
    callId: "c1",
    live: true,
    startedAtMs: at - 60_000,
    heartbeatAtMs: at - 5_000,
    ...over,
  });
  const live = (...now) => {
    win.__LIVE = { heartbeatMs: 90_000, now };
    fire("surface:live");
    return posted.at(-1);
  };
  assert.deepEqual(live(call()), { t: "calls", live: 1 });
  assert.deepEqual(live(), { t: "calls", live: 0 });
  // Marked live, and the provider has not been heard from for longer than the heartbeat: not up, and not counted. It
  // counted `live` alone, so the Lock Screen's activity stayed lit for a call nobody had heard from.
  assert.deepEqual(live(call({ heartbeatAtMs: at - 10 * 60_000 })), { t: "calls", live: 0 });
  assert.deepEqual(live(call(), call({ callId: "c2", heartbeatAtMs: at - 10 * 60_000 })), { t: "calls", live: 1 });
  // One with no word from the provider yet is judged by when it started; one not marked live is never up.
  assert.deepEqual(live(call({ heartbeatAtMs: null })), { t: "calls", live: 1 });
  assert.deepEqual(live(call({ heartbeatAtMs: null, startedAtMs: at - 10 * 60_000 })), { t: "calls", live: 0 });
  assert.deepEqual(live(call({ live: false })), { t: "calls", live: 0 });
});

test("a device ask with an activity token registers both", async () => {
  const { win } = windowOf();
  const d = doors(true);
  installAppBridge(win, d);
  win.__appBridge.receive('{"t":"device","token":"tok","platform":"ios","version":"1.0.0","activity":"act"}');
  await tick();
  assert.deepEqual(d.calls.at(-1), [
    "register",
    { token: "tok", platform: "ios", app_version: "1.0.0", activity_token: "act" },
  ]);
});

/** A dialog as the page holds it: shown until Escape takes it away, unless it keeps itself open. */
function dialog({ closes = true } = {}) {
  const field = { name: "field inside" };
  const node = {
    isConnected: true,
    keys: [],
    field,
    getClientRects: () => ({ length: node.isConnected ? 1 : 0 }),
    contains: (other) => other === node || other === field,
    dispatchEvent(e) {
      node.keys.push(e.key);
      if (closes && e.key === "Escape") node.isConnected = false;
      return true;
    },
  };
  field.dispatchEvent = (e) => node.dispatchEvent(e);
  return node;
}
const overlayPosts = (posted) => posted.filter((m) => m.t === "overlay");

test("Back closes what stands over the page: the topmost dialog hears Escape, and the page says when none is left", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const under = dialog();
    const over = dialog();
    const overlays = [under, over];
    const { win, posted } = windowOf({ overlays });
    installAppBridge(win);
    assert.deepEqual(overlayPosts(posted), [{ t: "overlay", open: true }], "said at install");
    win.__appBridge.receive(JSON.stringify({ t: "close" }));
    assert.deepEqual(over.keys, ["Escape"], "the one on top");
    assert.deepEqual(under.keys, [], "never the one beneath it");
    mock.timers.tick(250);
    assert.equal(overlayPosts(posted).length, 1, "one still stands: nothing new to say");
    win.__appBridge.receive(JSON.stringify({ t: "close" }));
    assert.deepEqual(under.keys, ["Escape"]);
    mock.timers.tick(250);
    assert.deepEqual(overlayPosts(posted).at(-1), { t: "overlay", open: false });
    // Nothing standing: a close is only a fresh look.
    win.__appBridge.receive(JSON.stringify({ t: "close" }));
    mock.timers.tick(250);
    assert.equal(overlayPosts(posted).length, 2);
  } finally {
    mock.timers.reset();
  }
});

test("the Escape goes to what has the focus inside the dialog, so a field's own Escape answers first", () => {
  const d = dialog();
  const { win } = windowOf({ overlays: [d] });
  installAppBridge(win);
  const seen = [];
  d.field.dispatchEvent = (e) => seen.push(["field", e.key, e.bubbles, e.cancelable]);
  win.document.activeElement = d.field;
  win.__appBridge.receive(JSON.stringify({ t: "close" }));
  assert.deepEqual(seen, [["field", "Escape", true, true]], "bubbling and cancelable, as a keyboard's");
  assert.deepEqual(d.keys, []);
});

test("a dialog Escape leaves standing twice running is not asked again: Back walks the history past it", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const stuck = dialog({ closes: false });
    const { win, posted } = windowOf({ overlays: [stuck] });
    installAppBridge(win);
    const close = () => {
      win.__appBridge.receive(JSON.stringify({ t: "close" }));
      mock.timers.tick(250);
    };
    close(); // a sheet mid-save keeps itself open: that Back does nothing
    assert.deepEqual(overlayPosts(posted), [{ t: "overlay", open: true }]);
    close(); // twice running: it is left to its own close
    assert.deepEqual(overlayPosts(posted).at(-1), { t: "overlay", open: false });
    close();
    assert.deepEqual(stuck.keys, ["Escape", "Escape"], "not asked a third time");
  } finally {
    mock.timers.reset();
  }
});

test("the page hands the app a file it made (a chart's CSV): posted as the app parses it and the ask cancelled; no such file is left to the page", () => {
  const { win, posted } = windowOf();
  installAppBridge(win);
  posted.length = 0;
  const ask = (detail) => win.dispatchEvent(new CustomEvent("app:file", { cancelable: true, detail }));
  assert.equal(ask({ name: "calls-by-day.csv", type: "text/csv", text: "day,calls" }), false, "cancelled: taken");
  assert.deepEqual(posted, [{ t: "file", name: "calls-by-day.csv", type: "text/csv", text: "day,calls" }]);
  assert.equal(
    ask({ name: "page.html", type: "text/html", text: "<script>" }),
    true,
    "the page falls back to its own download",
  );
  assert.equal(posted.length, 1, "and nothing is posted");
});
