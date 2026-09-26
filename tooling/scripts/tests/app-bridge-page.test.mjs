/**
 * The page's side of the bridge to the native shell (legacy-bridge/app-bridge.ts), run against a window of its own:
 * nothing is installed outside the app; inside, the page says its route, that a person is in, and the workspace at
 * install, then every route change, every needs-you count and every workspace change; the shell's navigate sets the
 * hash, its menu and top become the shell's own events, and a message that does not parse does nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installAppBridge, hashRoute } from "../../../apps/dashboard/src/legacy-bridge/app-bridge.ts";

globalThis.CustomEvent ??= class CustomEvent extends Event {
  constructor(type, init) {
    super(type);
    this.detail = init?.detail;
  }
};

function windowOf({ inApp = true, native = true, hash = "#/today", pathname = "/w/acme-plumbing" } = {}) {
  const listeners = new Map();
  const posted = [];
  const win = {
    document: { documentElement: { classList: { contains: (c) => inApp && c === "in-app" } } },
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

test("at install the page says a person is in, the workspace and the route; then every change", () => {
  const { win, posted, fire } = windowOf({ hash: "#/inbox" });
  const off = installAppBridge(win);
  assert.deepEqual(posted, [
    { t: "session", state: "in" },
    { t: "workspace", slug: "acme-plumbing" },
    { t: "route", route: "inbox" },
  ]);
  win.location.hash = "#/clients/abc";
  fire("hashchange");
  fire("inbox:counts", { needs: 3 });
  fire("inbox:counts", {}); // a detail-less count is not a count
  fire("inbox:counts", { needs: 2.7 });
  win.location.pathname = "/w/other-shop";
  fire("workspace:changed");
  assert.deepEqual(posted.slice(3), [
    { t: "route", route: "clients/abc" },
    { t: "needs", inbox: 3 },
    { t: "needs", inbox: 2 },
    { t: "workspace", slug: "other-shop" },
  ]);
  off();
  fire("hashchange");
  assert.equal(posted.length, 7, "uninstalled: silent");
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
