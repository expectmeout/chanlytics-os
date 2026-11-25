/**
 * The order a boot reads Leads in (surfaces/leads/surface.ts applyLeads, last-order.ts), in a module of its own: a boot is
 * a document's first read of Leads, and finder/leads-bridge.test.mjs has made its first long before its last test.
 *
 * Ruben's phone, 22 Nov 2026 (a screen recording read frame by frame): a refresh on People, then the Leads tab. The list
 * came in dimmed in the queue's order, stood 2.3 s, and was replaced by the same leads in his own order. The frame reads
 * Leads on every page, after the page's own surfaces; it read the queue's order, the page asked in his, held nothing under
 * that key, and read the whole first page again under the boot's rows.
 *
 * Run, never read: the surface against a faked `window.fetch` that answers rows of the real shape with fictional values.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bridgeHolds } from "../../shell/_bridge-holds.mjs";

const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
const listeners = {};
globalThis.CustomEvent = class CustomEvent {
  constructor(type) {
    this.type = type;
  }
};
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
bridgeHolds(
  { who: { workspaces: [{ id: "ws-harbor", timezone: "America/Chicago" }], activeWorkspaceId: "ws-harbor" } },
  { fresh: true },
);
globalThis.window = {
  // People's list, a workspace's: Leads is the tab beside it, and no page of its own is on screen.
  location: { pathname: "/w/harbor/people", hash: "", origin: "https://app.chanlytics.com", assign() {}, replace() {} },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener: (type, fn) => {
    (listeners[type] ||= new Set()).add(fn);
  },
  removeEventListener: (type, fn) => {
    listeners[type]?.delete(fn);
  },
  dispatchEvent: (ev) => {
    for (const fn of [...(listeners[ev.type] || [])]) fn(ev);
    return true;
  },
  fetch: async () => {
    throw new Error("no wire");
  },
};
globalThis.document = { addEventListener() {}, removeEventListener() {} };

const { keepLastOrder } = await import("../../../apps/dashboard/src/surfaces/leads/last-order.ts");
const { leadsView } = await import("../../../apps/dashboard/src/surfaces/leads/surface.ts");
const { leadsOverride } = await import("../../../apps/dashboard/src/surfaces/leads/override.ts");
const { surfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");

const SEARCH_ID = "3f8b2c1a-4d5e-4f6a-8b9c-0d1e2f3a4b5c";
/** One row in `leads_page`'s shape, with fictional values: .example domains, 555-01xx, ChIJfixture place ids. */
const leadRow = (n) => ({
  id: `1a2b3c4d-0000-4000-8000-${String(n).padStart(12, "0")}`,
  search_id: SEARCH_ID,
  place_id: `ChIJfixture${String(n).padStart(4, "0")}`,
  business_name: `Harbor Street Fitness ${n}`,
  category: "Personal trainer",
  city: "Austin",
  state: "TX",
  street: `${200 + n} Barton Springs Rd`,
  postal_code: "78704",
  search_name: "Personal trainers · Austin",
  phone: `+1512555${String(100 + n).padStart(4, "0")}`,
  phone_agrees: true,
  phone_wrong: false,
  email: `hello@harborstreet${n}.example`,
  email_state: "ok",
  email_checked_at: "2026-09-18T14:40:00.000Z",
  website: `https://harborstreet${n}.example`,
  instagram: null,
  rating: 4.8,
  reviews: 21,
  stage: "ready",
  closed_reason: null,
  contact_id: null,
  last_outcome: null,
  last_note: null,
  contacted_at: null,
  converted_at: null,
  places: 1,
  found_at: "2026-09-18T14:32:00.000Z",
  exported_at: null,
  version: 1,
  member: {
    class: "qualified",
    fit: "strong",
    reason: "Trains one to one, own studio",
    excluded_by: null,
    distance_m: 2400,
    counted: true,
    checks: [],
    other_emails: [],
  },
});
const ROWS = [leadRow(1), leadRow(2), leadRow(3)];
const SEARCH = {
  id: SEARCH_ID,
  name: "Personal trainers · Austin",
  asked: "personal trainers in Austin who train people one to one",
  asked_on: "2026-09-18T14:10:00.000Z",
  plan: null,
  plan_version: 1,
  round: null,
};
const COUNTS = { all: 3, ready: 3, nurture: 0, converted: 0, said_no: 0, not_a_fit: 0 };

const json = (body) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

/** A fake `window.fetch` answering Leads' two reads; every read asked is kept, as the address it went to. */
function wire() {
  const reads = [];
  globalThis.window.fetch = async (url) => {
    reads.push(String(url));
    const path = String(url).split("?")[0];
    if (path === "/api/v1/lead-searches") return json({ ok: true, data: { searches: [SEARCH], counts: COUNTS } });
    if (path === "/api/v1/leads") return json({ ok: true, data: { rows: ROWS, next: null, counts: COUNTS } });
    return new Response(JSON.stringify({ ok: false, error: { code: "not_found", message: "no" } }), { status: 404 });
  };
  return { reads, pages: () => reads.filter((u) => u.startsWith("/api/v1/leads?")) };
}

/** What a read of Leads' rows asked for. */
const askedOf = (url) => Object.fromEntries(new URLSearchParams(url.split("?")[1] ?? ""));

test("REGRESSION: a boot off the page reads Leads in the order the page last asked for, so the tab's press draws what the boot read and reads nothing more", async () => {
  // An earlier visit to Leads on this phone: the page asked in the member's own order, and the surface kept it (leadsView).
  keepLastOrder("harbor", { sort: "contacted", dir: "desc" });
  const w = wire();
  // A new document on People. The frame reads Leads after the page's own surfaces, the tab's cache holding nothing of it.
  await leadsOverride.apply();
  assert.equal(w.pages().length, 1, "the boot read one page of Leads");
  const asked = askedOf(w.pages()[0]);
  assert.deepEqual(
    [asked.list, asked.sort, asked.dir],
    ["all", "contacted", "desc"],
    "REGRESSION: the boot read the queue's order, which the page was not going to ask for",
  );
  // The Leads tab, pressed: the page asks for its view as it mounts (page/reads.ts useLeadsRead).
  const before = w.reads.length;
  const press = leadsView({
    searchId: null,
    list: "all",
    cls: null,
    chips: {},
    q: "",
    sort: "contacted",
    dir: "desc",
    pileList: null,
  });
  const drawn = surfaceValue("leads");
  // What the page holds its rows to (page/reads.ts viewLanded): the view it asked for, so nothing of it dims.
  assert.deepEqual(
    [drawn.route, drawn.view.sort, drawn.view.dir, drawn.rows.length],
    ["clients/leads", "contacted", "desc", ROWS.length],
    "the rows the boot read stand as the view asked for, in the draw the press makes",
  );
  await press;
  assert.equal(w.reads.length, before, "REGRESSION: the page read the first page again, 2.3 s under the boot's rows");
});
