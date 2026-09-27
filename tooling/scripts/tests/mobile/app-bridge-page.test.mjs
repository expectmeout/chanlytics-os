/**
 * The page's side of the bridge to the native shell (legacy-bridge/app-bridge.ts), run against a window of its own:
 * nothing is installed outside the app; inside, the page says its route, that a person is in, and the workspace at
 * install, then every route change, every needs-you count and every workspace change; the shell's navigate sets the
 * hash, its menu and top become the shell's own events, and a message that does not parse does nothing.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { installAppBridge, hashRoute } from "../../../../apps/dashboard/src/legacy-bridge/app-bridge.ts";

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

test("the route is the hash's name, today when there is none", () => {
  assert.equal(hashRoute("#/inbox"), "inbox");
  assert.equal(hashRoute("#/clients/abc"), "clients/abc");
  assert.equal(hashRoute(""), "today");
  assert.equal(hashRoute("#/"), "today");
});

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
  const off = installAppBridge(win);
  assert.deepEqual(posted, [
    { t: "session", state: "in" },
    { t: "theme", theme: "light" },
    { t: "workspace", slug: "acme-plumbing" },
    { t: "route", route: "inbox" },
    { t: "overlay", open: false },
  ]);
  posted.length = 0;
  win.location.hash = "#/clients/abc";
  fire("hashchange");
  fire("inbox:counts", { needs: 3 });
  fire("inbox:counts", {}); // a detail-less count is not a count
  fire("inbox:counts", { needs: 2.7 });
  win.location.pathname = "/w/other-shop";
  fire("workspace:changed");
  assert.deepEqual(posted, [
    { t: "route", route: "clients/abc" },
    { t: "needs", inbox: 3 },
    { t: "needs", inbox: 2 },
    { t: "workspace", slug: "other-shop" },
  ]);
  off();
  fire("hashchange");
  assert.equal(posted.length, 4, "uninstalled: silent");
  assert.equal(win.__appBridge, undefined);
});

test("the shell's navigate sets the hash; menu and top become the shell's events; a bad message does nothing", () => {
  const { win, fire } = windowOf();
  installAppBridge(win);
  const heard = [];
  win.addEventListener("shell:menu", () => heard.push("menu"));
  win.addEventListener("shell:top", () => heard.push("top"));
  win.__appBridge.receive('{"t":"navigate","route":"inbox"}');
  assert.equal(win.location.hash, "/inbox");
  fire("shell:ready");
  win.__appBridge.receive('{"t":"menu"}');
  win.__appBridge.receive('{"t":"top"}');
  win.__appBridge.receive('{"t":"navigate","route":"https://example.com/x"}');
  win.__appBridge.receive("nope");
  assert.deepEqual(heard, ["menu", "top"]);
  assert.equal(win.location.hash, "/inbox");
});

test("a tapped push for another workspace opens that workspace's page; one for this workspace moves the hash", () => {
  const HERE = "11111111-1111-4111-8111-111111111111";
  const THERE = "22222222-2222-4222-8222-222222222222";
  const { win, posted } = windowOf();
  win.__ACTIVE_WORKSPACE = HERE;
  installAppBridge(win);
  win.__appBridge.receive(JSON.stringify({ t: "navigate", route: "inbox/th-1", workspace: HERE }));
  assert.equal(win.location.hash, "/inbox/th-1");
  assert.equal(posted.filter((p) => p.assigned).length, 0, "this workspace: no load");
  win.__appBridge.receive(JSON.stringify({ t: "navigate", route: "inbox/th-2", workspace: THERE }));
  assert.deepEqual(
    posted.filter((p) => p.assigned),
    [{ assigned: `/w/${THERE}#/inbox/th-2` }],
    "REGRESSION: a push for one workspace opened its thread in whichever workspace the phone was showing",
  );
  assert.equal(win.location.hash, "/inbox/th-1", "and this page's hash is not moved under it");
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

test("the bell's number is posted at install and on every change; without a bell, nothing", () => {
  let n = 2;
  let cb = null;
  const bell = { unread: () => n, onChange: (f) => ((cb = f), () => (cb = null)) };
  const { win, posted } = windowOf({ bell });
  const off = installAppBridge(win, doors());
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
      eyebrow: "",
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

test("the Live page's refresh tells the shell how many calls are in progress, so the phone can end the call's activity", () => {
  const { win, posted, fire } = windowOf();
  installAppBridge(win, doors());
  fire("surface:live");
  assert.ok(!posted.some((m) => m.t === "calls"), "no Live yet, nothing to say");
  win.__LIVE = { now: [{ id: "c1" }] };
  fire("surface:live");
  assert.deepEqual(posted.at(-1), { t: "calls", live: 1 });
  win.__LIVE = { now: [] };
  fire("surface:live");
  assert.deepEqual(posted.at(-1), { t: "calls", live: 0 });
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
