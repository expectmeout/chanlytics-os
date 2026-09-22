/**
 * The Leads surface's first read after a refresh, in a module nobody has read with yet.
 *
 * Measured on the salon's workspace, 21 Sep: a refresh on a search's Needs review read ALL leads first (500 rows,
 * list=all, no search), drew them dimmed over the rows the tab's cache had put back -- the view the owner was on --
 * and only then read that view, because the bridge started from its own default rather than the address. Its own
 * file, so the bridge is fresh (leads-bridge.test.mjs has read a dozen views by the time a test there could run).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const SEARCH_ID = "3f8b2c1a-4d5e-4f6a-8b9c-0d1e2f3a4b5c";
const PEEK = "1a2b3c4d-0000-4000-8000-000000000001";
const storage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const reads = [];
const json = (data) => new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });
globalThis.CustomEvent = class CustomEvent { constructor(type) { this.type = type; } };
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.window = {
  location: { pathname: "/w/harbor", hash: `#/clients/leads:s-${SEARCH_ID}:c-review:p-${PEEK}`, origin: "https://app.chanlytics.com", assign() {}, replace() {} },
  __WORKSPACES: [{ id: "ws-harbor", timezone: "America/Chicago" }],
  __ACTIVE_WORKSPACE: "ws-harbor",
  // What the surface cache put back before anything mounted: the view this tab read last, in its order.
  __LEADS: { route: `clients/leads:s-${SEARCH_ID}:c-review`, rows: [], view: { searchId: SEARCH_ID, list: "all", cls: "review", chips: {}, sort: "rating", dir: "desc" } },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return true; },
  // No row is drawn, so the one search is only ever looked up by id; having one keeps the first day's suggestions unread.
  fetch: async (url) => {
    reads.push(String(url));
    if (String(url).startsWith("/api/v1/lead-searches")) return json({ searches: [{ id: SEARCH_ID }], counts: null });
    return json({ rows: [], next: null, counts: null });
  },
};
globalThis.document = { addEventListener() {}, removeEventListener() {} };

const { leadsOverride, leadsView } = await import("../../../apps/dashboard/src/legacy-bridge/leads.ts");

test("a refresh on a view reads that view, in the order the tab last read it: the page's own read, never all leads first", async () => {
  await leadsOverride.apply();
  const view = `/api/v1/leads?list=all&sort=rating&dir=desc&limit=500&search=${SEARCH_ID}&class=review&workspace=harbor`;
  assert.deepEqual(reads, ["/api/v1/lead-searches?workspace=harbor", view], "one read, of the view on screen; the lead open over it is no part of the view");
  assert.equal(globalThis.window.__LEADS.route, `clients/leads:s-${SEARCH_ID}:c-review`);
  // The page's ask as it mounts is the same view: painted from what the boot read and re-read behind (a request the
  // runner's held answers share at boot) -- never a read of another view.
  await leadsView({ searchId: SEARCH_ID, list: "all", cls: "review", chips: {}, sort: "rating", dir: "desc" });
  const leads = reads.filter((u) => u.startsWith("/api/v1/leads?"));
  assert.ok(leads.length >= 1 && leads.every((u) => u === view), leads.join("\n"));
});
