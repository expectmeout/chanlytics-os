/**
 * A surface marked `onDemand` (surface-data.ts) is read where it is drawn and nowhere else: the boot's two passes leave it alone unless
 * the page on screen draws it, a return to the tab and the shell's Retry-all read only what is drawn here, and a page that draws it
 * has it read as it comes on screen: once, and again when it says it has aged. Run on the real runner and the real routes' registry
 * (`reports` is Reports' own surface; `reports_headline` is one Today draws), the way LegacyApp wires them, each read recorded
 * rather than made. A surface not marked behaves as it always did.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { historyOf, legacyAddress } from "../../shell/address/_address.mjs";

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
historyOf(win);
const docHeard = new Map();
globalThis.document = {
  visibilityState: "visible",
  title: "",
  addEventListener: (type, fn) => docHeard.set(type, fn),
  removeEventListener: (type) => docHeard.delete(type),
};
globalThis.CustomEvent ??= class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n = 14) => {
  for (let i = 0; i < n; i += 1) await tick();
};
win.__shell = (await importSrc("apps/dashboard/src/legacy-bridge/workspace.ts")).addressApi(win);
win.CHANLY = { nav() {}, address: await legacyAddress() };
const runner = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
const status = await importSrc("apps/dashboard/src/legacy-bridge/surface-status.ts");
const registry = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
const { reportsOverride } = await importSrc("apps/dashboard/src/surfaces/reports/surface.ts");
const { reportsHeadlineOverride } = await importSrc("apps/dashboard/src/surfaces/reports/headline.ts");

let aged = false;
/** The real keys, so the registry's own routes decide what a page draws: the page's own, one it draws, and two it does not. */
const world = (asked) => {
  const read = (key, extra = {}) => ({ key, apply: async () => void asked.push(key), ...extra });
  return [
    read("workspace"),
    read("today"),
    read("inbox"),
    read("reports", { onDemand: true }),
    read("reports_headline", { onDemand: true, isStale: () => aged }),
  ];
};
/** A runner over them, wired as LegacyApp wires it; `go` moves the address as Back does, `away` leaves the tab and comes back. */
async function running(hash) {
  win.location.hash = hash;
  const asked = [];
  const overrides = world(asked);
  const stop = runner.startSurfaces(overrides, () => () => {});
  const off = registry.readWhatWasMissed(
    overrides,
    (keys) => void runner.refreshSurfaces(overrides.filter((o) => keys.includes(o.key))),
    win,
  );
  await settle(30);
  return {
    asked,
    overrides,
    take: () => asked.splice(0).sort(),
    go: async (to) => {
      win.location.hash = to;
      win.dispatchEvent({ type: "popstate" });
      await settle();
    },
    away: async (ms) => {
      const on = docHeard.get("visibilitychange");
      globalThis.document.visibilityState = "hidden";
      on();
      const real = Date.now;
      Date.now = () => real() + ms;
      globalThis.document.visibilityState = "visible";
      on();
      Date.now = real;
      await settle();
    },
    stop: () => {
      stop();
      off();
    },
  };
}

test("on Today neither pass reads Reports' three routes: what Today draws, and the strangers not marked, are read as ever", async () => {
  const r = await running("#/today");
  try {
    assert.deepEqual(
      r.take(),
      ["inbox", "reports_headline", "today", "workspace"],
      "REGRESSION: every page's boot read the report beside its own (and `reports` is Reports' own surface: three routes)",
    );
    assert.equal(status.isSurfaceReady("reports"), false, "never read: nothing of it is held");
    // A quick return reads nothing while every surface that ought to be live is: an unread on-demand surface must not defeat that.
    await r.away(1_000);
    assert.deepEqual(r.take(), [], "REGRESSION: one unread surface made every return read every surface again");
    // A long absence reads what is drawn here, and still not what is not.
    await r.away(10 * 60_000);
    assert.deepEqual(r.take(), ["inbox", "reports_headline", "today", "workspace"], "a return reads what Today draws");
    // The shell's Retry-all, the same.
    await runner.refreshAllSurfaces();
    assert.deepEqual(
      r.take(),
      ["inbox", "reports_headline", "today", "workspace"],
      "Retry-all on Today does not read Reports",
    );
  } finally {
    r.stop();
  }
});

test("moving to Reports reads its surface once and its gate opens; moving back to Today reads nothing new", async () => {
  const r = await running("#/today");
  try {
    r.take();
    assert.equal(status.isSurfaceReady("reports"), false);
    await r.go("#/reports");
    assert.deepEqual(r.take(), ["reports"], "read as its page comes on screen, once");
    assert.equal(
      status.isSurfaceReady("reports"),
      true,
      "the gate (`__surfaceGate`) opens when the read lands: no page waits for ever",
    );
    await r.go("#/reports/people");
    assert.deepEqual(r.take(), [], "a move between its lenses reads nothing");
    await r.go("#/today");
    assert.deepEqual(r.take(), [], "back on Today: the headline is held and fresh, and Reports is not read");
    // The headline aged while away: coming back to Today reads it again, once. Reports is not Today's, and is left.
    aged = true;
    await r.go("#/reports");
    r.take();
    await r.go("#/today");
    assert.deepEqual(r.take(), ["reports_headline"], "an aged headline is read again as Today comes back");
    aged = false;
    // What is asked for by name is made wherever the page is: a zone saved reads the report.
    await runner.refreshSurfaces([r.overrides.find((o) => o.key === "reports")]);
    assert.deepEqual(r.take(), ["reports"], "a named refresh is a request: the caller knows");
  } finally {
    r.stop();
  }
});

test("a page that opens on Reports reads its surface in its own pass, and neither the headline nor an unmarked stranger is mistaken for it", async () => {
  const r = await running("#/reports");
  try {
    assert.deepEqual(
      r.take(),
      ["inbox", "reports", "today", "workspace"],
      "Reports' own, and the unmarked strangers: not the headline Today draws",
    );
  } finally {
    r.stop();
  }
});

test("the two overrides that read Reports are the two marked, and nothing else in this part is", () => {
  assert.equal(reportsOverride.onDemand, true, "the whole report, its campaigns and its reach-outs");
  assert.equal(reportsHeadlineOverride.onDemand, true);
  assert.equal(typeof reportsHeadlineOverride.isStale, "function", "a headline ages: the page that draws it asks");
  assert.equal(
    reportsOverride.isStale,
    undefined,
    "Reports' own is kept current by its live-feed rule and by its page's arrival",
  );
});

test("a return that leaves Reports out keeps it for its page: after a long absence on Today, Reports is read once as it comes on screen", async () => {
  const r = await running("#/today");
  try {
    await r.go("#/reports");
    await r.go("#/today");
    r.take();
    // Away for long: the return reads what Today draws and leaves Reports, which it would have read, for its page.
    await r.away(10 * 60_000);
    assert.equal(r.take().includes("reports"), false, "Today's return does not read Reports");
    await r.go("#/reports");
    assert.deepEqual(
      r.take(),
      ["reports"],
      "REGRESSION: Reports came on screen with what it held from before the absence, and was never read again",
    );
    await r.go("#/today");
    r.take();
    await r.go("#/reports");
    assert.deepEqual(r.take(), [], "kept once: the next arrival reads nothing new");
  } finally {
    r.stop();
  }
});

test("a rejoin of the live feed reads the gap of what is drawn here, and keeps Reports for its page", async () => {
  win.location.hash = "#/today";
  const asked = [];
  // The feed's statuses, as the runner's join hears them.
  let onStatus = () => {};
  const read = (key, extra = {}) => ({ key, debounceMs: 0, apply: async () => void asked.push(key), ...extra });
  const overrides = [
    read("workspace"),
    read("today", { refreshOnMessageInserts: true }),
    read("inbox", { refreshOnMessageInserts: true }),
    read("reports", { onDemand: true, refreshOnMessageInserts: true }),
  ];
  const stop = runner.startSurfaces(overrides, (_onChange, opts) => {
    onStatus = opts.onStatus;
    return () => {};
  });
  const off = registry.readWhatWasMissed(
    overrides,
    (keys) => void runner.refreshSurfaces(overrides.filter((o) => keys.includes(o.key))),
    win,
  );
  try {
    await settle(30);
    asked.length = 0;
    onStatus("SUBSCRIBED");
    onStatus("CHANNEL_ERROR");
    onStatus("SUBSCRIBED");
    await settle(30);
    assert.deepEqual(
      asked.splice(0).sort(),
      ["inbox", "today"],
      "REGRESSION: every rejoin of the feed read Reports' three routes on whatever page was on screen",
    );
    win.location.hash = "#/reports";
    win.dispatchEvent({ type: "popstate" });
    await settle();
    assert.deepEqual(asked.splice(0), ["reports"], "the gap is read where Reports is drawn, as it comes on screen");
  } finally {
    stop();
    off();
  }
});
