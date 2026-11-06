/**
 * Whoever a press of Delete… hands the ledger leaves People at once (surface.ts peopleGoing). The server leaves them out
 * of its list from then on (00547), and a read already under way when the door answered may still name them, so every
 * read in this tab leaves them out too. The ledger erases them over the next seconds or minutes, each erasure a notice
 * that has People read again, and once those reads have stopped the surface says so, for what an erasure moves beside
 * People to be read then, one reading for the press. The real surface module, over a fake of its reads.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
const json = (body) =>
  new Response(JSON.stringify({ ok: true, data: body }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
const person = (i) => ({
  id: `p${i}`,
  display_name: `Person ${i}`,
  consent: "unknown",
  created_at: "2026-10-01T00:00:00Z",
});
/** Who the server lists: the ledger takes them off this as it reaches them. */
let listed = [];
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.document ??= {
  body: {},
  addEventListener() {},
  removeEventListener() {},
  getElementById: () => null,
  querySelector: () => null,
};
const heard = [];
globalThis.window = {
  location: { pathname: "/w/harbor", hash: "#/clients", origin: "https://app.chanlytics.com" },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: (e) => {
    heard.push(e.type);
    return true;
  },
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
  __WORKSPACES: [{ id: "t-harbor", slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t-harbor",
  fetch: async (url) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    if (u.pathname === "/api/v1/contacts")
      return json({
        people: listed,
        page: { q: u.searchParams.get("q"), offset: 0, limit: 1000, total: listed.length, has_more: false },
        calendar: { state: "none", source: "your calendar" },
        booking_link: null,
        has_deals: false,
      });
    if (u.pathname === "/api/v1/segments") return json({ lists: [] });
    if (u.pathname === "/api/v1/views") return json({ views: {} });
    return new Response(JSON.stringify({ ok: false, error: { code: "not_found" } }), { status: 404 });
  },
};
globalThis.fetch = (...a) => globalThis.window.fetch(...a);

const { peopleGoing, peopleOverride, peopleSearch } =
  await import("../../../apps/dashboard/src/surfaces/people/surface.ts");
const { ERASURES_LONGEST_WAIT_MS } = await import("../../../apps/dashboard/src/legacy-bridge/surface-realtime.ts");
/** Past the half minute a stream of erasures is waited out (ERASURES_LONGEST_WAIT_MS), or a long press says it early. */
const GONE_QUIET_MS = 35_000;
/** Each time the surface said the reads had stopped behind a press (peopleGoing's `gone`). */
const gone = [];
const shown = () => globalThis.window.__PEOPLE.rows.map((r) => r.id);
const total = () => globalThis.window.__PEOPLE.aggregates.total;

test("whoever a press hands the ledger leaves the rows and the count at once, and a read while the ledger works does not bring them back", async () => {
  listed = [person(1), person(2), person(3), person(4)];
  await peopleOverride.apply();
  assert.deepEqual(shown(), ["p1", "p2", "p3", "p4"]);
  assert.equal(total(), 4);

  heard.length = 0;
  peopleGoing(["p2", "p3"], () => gone.push("gone"));
  assert.deepEqual(shown(), ["p1", "p4"], "gone as the press answers, with no read");
  assert.equal(total(), 2);
  assert.ok(heard.includes("surface:clients"), "and the page told");

  await peopleOverride.apply();
  assert.deepEqual(shown(), ["p1", "p4"], "a read that still names them does not bring them back");
  assert.equal(total(), 2, "nor does the count");

  const found = await peopleSearch("person");
  assert.deepEqual(
    found.rows.map((r) => r.id),
    ["p1", "p4"],
    "nor does a search",
  );
});

test("REGRESSION: their going is said once, when People's reads have stopped behind the press, however long the ledger takes (5 Nov 2026: a press of thousands is on the ledger for minutes, and the server's list no longer shows its progress)", async () => {
  listed = [person(1), person(4)];
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    gone.length = 0;
    peopleGoing(["p2"], () => gone.push("gone"));
    // As far apart as a stream of erasures has People's reads (a press of 5,000 runs for 25 minutes).
    for (let reads = 0; reads < 5; reads++) {
      mock.timers.tick(ERASURES_LONGEST_WAIT_MS);
      await peopleOverride.apply();
    }
    assert.deepEqual(gone, [], "the ledger still at work: its stream has People read every half a minute");
    mock.timers.tick(GONE_QUIET_MS);
    assert.deepEqual(gone, ["gone"], "the reads have stopped: said once");
    await peopleOverride.apply();
    mock.timers.tick(GONE_QUIET_MS);
    assert.deepEqual(gone, ["gone"], "and a later read says nothing more");
  } finally {
    mock.timers.reset();
  }
  assert.equal(total(), 2, "nobody is taken off the count twice");
});

test("a press with no read behind it is still said", () => {
  gone.length = 0;
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    peopleGoing(["p3"], () => gone.push("alone"));
    mock.timers.tick(GONE_QUIET_MS);
    assert.deepEqual(gone, ["alone"]);
  } finally {
    mock.timers.reset();
  }
});

test("nobody going changes nothing and tells nobody", async () => {
  heard.length = 0;
  peopleGoing([], () => gone.push("nobody"));
  assert.deepEqual(heard, []);
  assert.deepEqual(gone, ["alone"], "and nothing is said for them");
});
