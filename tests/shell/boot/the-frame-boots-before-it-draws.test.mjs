/**
 * FrameApp drew "Chanlytics didn't finish loading" until the window held `CHANLY` and `POLICY`, which the frame's globals
 * published as their modules loaded; decision 0151 took both off the window. What the gate waited for, the workspace's
 * role store (who is acting, which every gate asks) and its charter (what the approval chips read), is the boot's now:
 * FrameApp's module runs `bootFrame()` as it loads (bridge/boot/installs.ts), before its component exists, so no page
 * can draw before either is in. `CHANLY` is an import of the pages (surfaces/frame/constants.ts), there or not at all.
 * EXECUTED: the frame's module loaded over a bare window, as frame-boot.test.mjs runs the boot, with nothing held before.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { useStubHooks } from "../../_stub-react.mjs";
import { bridgeHolds, provided } from "../_bridge-holds.mjs";
import { fromDashboard } from "./_frame-boot.mjs";

/** A bare window, as a tab is before the frame's module loads: an address, a history, its listeners, a document. */
const heard = new Map();
const doc = {
  visibilityState: "visible",
  title: "",
  addEventListener() {},
  removeEventListener() {},
  documentElement: { classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, dataset: {} },
};
globalThis.window = {
  location: { pathname: "/w/acme/today", search: "", hash: "", assign() {}, replace() {}, reload() {} },
  history: { replaceState() {}, pushState() {}, state: null, length: 1 },
  navigator: { userAgent: "node" },
  document: doc,
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
globalThis.document = doc;
if (typeof globalThis.navigator === "undefined")
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: "node" }, configurable: true });
// What the frame's modules draw with as they load (a status bar's waves are drawn at its module's top, and the frame's
// error edge is a class): a React that makes elements, set on the react module the TSX imports (_stub-react.mjs).
globalThis.React = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  Fragment: "Fragment",
  Component: class {},
};
useStubHooks(globalThis.React);
bridgeHolds({ who: { activeWorkspaceId: "ws-1" } }, { fresh: true });

test("the role store and the charter are in as FrameApp's module loads, before its component can draw a page", () => {
  assert.equal(provided("roles"), undefined, "nothing is in before the frame's module loads");
  assert.equal(provided("policy"), undefined);
  const frame = fromDashboard("bridge/FrameApp.tsx");
  assert.equal(typeof frame.default, "function", "the component, which exists only once its module has run the boot");
  assert.equal(typeof provided("roles")?.can, "function", "who is acting, which every gate asks from the first draw");
  assert.equal(
    typeof provided("policy")?.modeOf,
    "function",
    "the charter the approval chips read from the first paint",
  );
  assert.equal(globalThis.window.CHANLY, undefined, "and nothing on the window for a page to wait on");
  assert.equal(globalThis.window.POLICY, undefined);
});
