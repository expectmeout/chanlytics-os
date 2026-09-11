/**
 * The runner's boot, run: which surface asks first, and what the others see.
 *
 * No browser: a window with the three things the runner touches, a document
 * that never becomes visible, and overrides whose apply() records what the
 * page named for the workspace at the moment they asked. The workspace is
 * the address (plan 3.5): /w/<slug> names it, the home names none.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "./_source.mjs";

const win = {
  __ACTIVE_WORKSPACE: undefined,
  location: { pathname: "/", search: "", hash: "", reload() { win.reloads += 1; }, assign(url) { win.assigned = url; }, replace(url) { win.replaced = url; } },
  reloads: 0,
  assigned: null,
  replaced: null,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return true; },
};
globalThis.window = win;
globalThis.document = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
const { startSurfaces } = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
const { getActiveWorkspace } = await importSrc("apps/dashboard/src/legacy-bridge/workspace.ts");

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n) => { for (let i = 0; i < n; i += 1) await tick(); };

/** The page at `pathname`; the workspace surface answers after two ticks; the others record what the page named when they asked. */
function world({ pathname }) {
  win.location.pathname = pathname;
  win.__ACTIVE_WORKSPACE = undefined;
  const log = [];
  const workspace = {
    key: "workspace",
    apply: async () => {
      log.push(["workspace:asked", getActiveWorkspace()]);
      await tick(); await tick();
      win.__ACTIVE_WORKSPACE = "id-a";
      log.push(["workspace:answered", "id-a"]);
    },
  };
  const other = (key) => ({ key, debounceMs: 1, apply: async () => { log.push([key, getActiveWorkspace()]); } });
  return { log, overrides: [workspace, other("inbox"), other("people")] };
}

test("off a workspace page, the workspace surface asks first and the others ask only once it has answered", async () => {
  const { log, overrides } = world({ pathname: "/" });
  const stop = startSurfaces(overrides);
  await settle(12);
  stop();
  assert.deepEqual(log.slice(0, 2), [["workspace:asked", null], ["workspace:answered", "id-a"]], "one request before every other");
  assert.deepEqual(log.slice(2).map((l) => l[0]).sort(), ["inbox", "people"], "then the rest");
});

test("on a workspace page, every surface fires at once with the address's workspace on each, and nothing asks twice", async () => {
  const { log, overrides } = world({ pathname: "/w/acme" });
  const stop = startSurfaces(overrides);
  await settle(12);
  stop();
  assert.deepEqual(log.map((l) => l[0]).slice(0, 3).sort(), ["inbox", "people", "workspace:asked"], "all three asked before the workspace surface answered");
  assert.ok(log.filter((l) => l[0] === "inbox" || l[0] === "people").every((l) => l[1] === "acme"), "each carried the workspace the address names");
  assert.equal(log.filter((l) => l[0] === "inbox").length, 1);
  assert.equal(win.reloads + (win.assigned ? 1 : 0) + (win.replaced ? 1 : 0), 0, "a boot never navigates");
});
