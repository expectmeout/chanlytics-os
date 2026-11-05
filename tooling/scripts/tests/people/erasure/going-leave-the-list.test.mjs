/**
 * Whoever a press of Delete… hands the ledger leaves People at once (surface.ts peopleGoing). The ledger erases them over
 * the next seconds, and until it reaches each one the server still lists them, so every read of the list in that time
 * (a teammate's change, the live feed's) leaves them out in this tab: they do not come back to be taken away a second
 * time, one at a time. Once the server lists fewer of them the ledger has erased some, and the surface says so once it has
 * stopped, for what an erasure moves beside People to be read then, one reading for the press. The real surface module,
 * over a fake of its reads.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { until } from "../../shared/_until.mjs";

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
  await import("../../../../../apps/dashboard/src/surfaces/people/surface.ts");
/** Each time the surface said those going had left the server's list too (peopleGoing's `gone`). */
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
  assert.deepEqual(shown(), ["p1", "p4"], "the server still lists them, and the rows do not");
  assert.equal(total(), 2, "nor does the count");
  assert.deepEqual(gone, [], "and nobody is said gone while the server lists them all");

  const found = await peopleSearch("person");
  assert.deepEqual(
    found.rows.map((r) => r.id),
    ["p1", "p4"],
    "nor does a search",
  );
});

test("once the ledger has reached them the server's count is the count, and their going is said once for the press, not once a person", async () => {
  listed = [person(1), person(3), person(4)];
  await peopleOverride.apply();
  listed = [person(1), person(4)];
  await peopleOverride.apply();
  assert.deepEqual(shown(), ["p1", "p4"]);
  assert.equal(total(), 2, "nobody is taken off the count twice");
  await until(() => gone.length > 0, "their going said, once the server lists none of them");
  assert.deepEqual(gone, ["gone"], "once: the two left a read apart");
  await peopleOverride.apply();
  assert.deepEqual(gone, ["gone"], "and a later read says nothing more");
});

test("nobody going changes nothing and tells nobody", async () => {
  heard.length = 0;
  peopleGoing([], () => gone.push("nobody"));
  assert.deepEqual(heard, []);
  assert.deepEqual(gone, ["gone"]);
});
