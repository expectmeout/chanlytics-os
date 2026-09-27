/**
 * The page's side of the bridge to the native shell (legacy-bridge/app-bridge.ts), run against a window of its own:
 * nothing is installed outside the app; inside, the page says its route, that a person is in, and the workspace at
 * install, then every route change, every needs-you count and every workspace change; the shell's navigate sets the
 * hash, its menu and top become the shell's own events, and a message that does not parse does nothing.
 */
import { test } from "node:test";
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
    },
    location: { hash, pathname },
    ...(native ? { ReactNativeWebView: { postMessage: (s) => posted.push(JSON.parse(s)) } } : {}),
    addEventListener: (t, fn) => listeners.set(t, [...(listeners.get(t) ?? []), fn]),
    removeEventListener: (t, fn) =>
      listeners.set(
        t,
        (listeners.get(t) ?? []).filter((f) => f !== fn),
      ),
    dispatchEvent: (e) => {
      (listeners.get(e.type) ?? []).forEach((fn) => fn(e));
      return true;
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
  win.__appBridge.receive('{"t":"menu"}');
  win.__appBridge.receive('{"t":"top"}');
  win.__appBridge.receive('{"t":"navigate","route":"https://example.com/x"}');
  win.__appBridge.receive("nope");
  assert.deepEqual(heard, ["menu", "top"]);
  assert.equal(win.location.hash, "/inbox");
  void fire;
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
    token: async () => {
      calls.push(["token"]);
      if (answer instanceof Error) throw answer;
      return answer ? { access: "tok", expires: 1800000000 } : null;
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
  win.__appBridge.receive('{"t":"forget","token":"ExponentPushToken[abc]"}');
  await tick();
  assert.deepEqual(d.calls.at(-1), ["forget", "ExponentPushToken[abc]"]);
  assert.deepEqual(posted.at(-1), { t: "device", state: "forgotten" });
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

test("the shell's token ask is answered from the page's own session, and with nothing when there is none", async () => {
  const { win, posted } = windowOf();
  const d = doors(true);
  installAppBridge(win, d);
  win.__appBridge.receive('{"t":"token"}');
  await tick();
  assert.deepEqual(d.calls.at(-1), ["token"]);
  assert.deepEqual(posted.at(-1), { t: "token", access: "tok", expires: 1800000000 });
  const none = windowOf();
  installAppBridge(none.win, doors(false));
  none.win.__appBridge.receive('{"t":"token"}');
  await tick();
  assert.deepEqual(none.posted.at(-1), { t: "token", access: null, expires: 0 });
  const broken = windowOf();
  installAppBridge(broken.win, doors(new Error("no client")));
  broken.win.__appBridge.receive('{"t":"token"}');
  await tick();
  assert.deepEqual(broken.posted.at(-1), { t: "token", access: null, expires: 0 });
});
