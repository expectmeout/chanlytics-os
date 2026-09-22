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
const { read } = await importSrc("apps/dashboard/src/legacy-bridge/api.ts");

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

/** Overrides that record when they start and finish, so the test can watch how many run at once. */
function crowd(keys, { hash = "" } = {}) {
  win.location.pathname = "/w/acme";
  win.location.hash = hash;
  win.__ACTIVE_WORKSPACE = "id-a";
  const order = [];
  let live = 0;
  let peak = 0;
  const overrides = keys.map((key) => ({
    key,
    debounceMs: 1,
    apply: async () => {
      order.push(key);
      live += 1;
      peak = Math.max(peak, live);
      await tick(); await tick();
      live -= 1;
    },
  }));
  return { order, overrides, peak: () => peak };
}

test("boot runs in lanes rather than all at once: twenty-three requests in one millisecond is what made a cold load take 7.8s", async () => {
  const keys = ["today", "inbox", "people", "calendar", "reports", "settings", "broadcasts", "playbooks", "conversations", "notifications"];
  const { overrides, peak } = crowd(keys);
  const stop = startSurfaces(overrides);
  await settle(60);
  stop();
  assert.ok(peak() <= 4, `at most four surfaces boot at once, saw ${peak()}`);
  assert.ok(peak() > 1, "and more than one, or a cold load is ten round trips end to end");
});

test("the surface the address is asking for takes the first lane", async () => {
  // Landing on Reports and loading eleven surfaces ahead of it is backwards.
  const keys = ["today", "inbox", "people", "calendar", "reports", "settings", "broadcasts", "playbooks"];
  const { order, overrides } = crowd(keys, { hash: "#/reports" });
  const stop = startSurfaces(overrides);
  await settle(60);
  stop();
  assert.equal(order[0], "reports", "the one on screen asks first");
  assert.equal(new Set(order).size, keys.length, "and every other surface still boots");
});

test("a route with no surface of its own changes nothing: the order is only a preference", async () => {
  const keys = ["today", "inbox", "people", "calendar"];
  const { order, overrides } = crowd(keys, { hash: "#/nothing-here" });
  const stop = startSurfaces(overrides);
  await settle(40);
  stop();
  assert.deepEqual([...order].sort(), [...keys].sort(), "all of them, and none twice");
});

test("the boot holds every answer until its last surface is in: two surfaces reading one list ask the server once", async () => {
  // Measured on the salon's Leads page: 31 reads at boot, 20 distinct. A surface in the second lane asked for a list
  // a surface in the first had been answered a moment before, because a settled read was dropped as it settled.
  win.location.pathname = "/w/acme";
  win.location.hash = "";
  win.__ACTIVE_WORKSPACE = "id-a";
  const sent = [];
  win.fetch = async (url) => { sent.push(url); await tick(); return new Response(JSON.stringify({ ok: true, data: { templates: [] } }), { status: 200 }); };
  let firstIn = () => {};
  const first = new Promise((r) => { firstIn = r; });
  const overrides = [
    { key: "inbox", apply: async () => { await read("GET templates"); firstIn(); } },
    { key: "people", apply: async () => { await first; await tick(); await read("GET templates"); } },
  ];
  const stop = startSurfaces(overrides);
  await settle(20);
  const asked = () => sent.filter((u) => u.startsWith("/api/v1/templates")).length;
  assert.equal(asked(), 1, "the second surface read the answer the first had just been given");
  await read("GET templates");
  assert.equal(asked(), 2, "once the boot is in, a read asks the server: what follows is the live feed's and a write's to refresh");
  stop();
});

/** A document that becomes visible when the test says, with its listeners by type. */
function returnable() {
  const on = {};
  const doc = { visibilityState: "hidden", addEventListener: (t, f) => { (on[t] ||= []).push(f); }, removeEventListener: (t, f) => { on[t] = (on[t] || []).filter((g) => g !== f); } };
  const back = () => { doc.visibilityState = "visible"; for (const f of on.visibilitychange || []) f(); };
  return { doc, back };
}

test("a return to the tab reads the surface on screen first and the rest behind it in lanes, never every surface at once", async () => {
  // Every surface was scheduled at once on a return -- twenty surfaces, thirty reads in one burst, the page's own
  // among them and no sooner than a stranger's: the burst the boot's lanes exist to prevent.
  const keys = ["today", "inbox", "people", "calendar", "reports", "settings", "broadcasts", "playbooks", "conversations", "notifications"];
  const { doc, back } = returnable();
  globalThis.document = doc;
  const { order, overrides } = crowd(keys, { hash: "#/reports" });
  let live = 0;
  let peak = 0;
  const measured = overrides.map((o) => ({ ...o, apply: async () => { live += 1; peak = Math.max(peak, live); await o.apply(); live -= 1; } }));
  const stop = startSurfaces(measured);
  try {
    await settle(60);
    order.length = 0;
    peak = 0;
    back();
    await settle(60);
    assert.equal(order[0], "reports", "the one on screen is read first");
    assert.equal(new Set(order).size, keys.length, "and every other surface is still read");
    assert.equal(order.length, keys.length, "each once");
    assert.ok(peak <= 4 && peak > 1, `through the boot's lanes, saw ${peak} at once`);
    order.length = 0;
    back();
    back();
    await settle(60);
    assert.equal(order.length, keys.length, "two returns in quick succession are one pass, not two");
  } finally {
    stop();
    globalThis.document = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
  }
});

test("identity leads even on a workspace page, where nothing waits for it", async () => {
  // The shell reads __ME to decide what a role may see. Queued behind three
  // strangers it would draw the nav for the wrong role and then correct it.
  const keys = ["today", "inbox", "people", "calendar", "reports", "workspace", "settings"];
  const { order, overrides } = crowd(keys, { hash: "#/reports" });
  const stop = startSurfaces(overrides);
  await settle(60);
  stop();
  assert.equal(order[0], "workspace", "who you are, first");
  assert.equal(order[1], "reports", "then what you are looking at");
  assert.equal(new Set(order).size, keys.length, "and the rest still boot");
});
