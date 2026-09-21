/**
 * Broadcasts count what they say they count.
 *
 * Two numbers on the Broadcasts page were not what they said they were:
 *
 * - the header's Sent, Delivered and Replies summed the newest fifty broadcasts
 *   the route returns, and read as everything (the 12 September audit's D12);
 * - an audience's "N people said yes" was counted over the first thousand
 *   people the People read returns, while the send enrols everyone.
 *
 * The route now says when more than fifty exist, and the surface reads every
 * page of people before it counts. Both run here: the route's list over a
 * database double, the surface over a fake wire.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./_fake-db.mjs";

const TID = "t-salon";

/* ----------------------------- the route's fifty ----------------------------- */

const { listBroadcasts } = await import("../../../apps/dashboard/src/server/broadcasts.ts");

const bRow = (i) => ({
  id: `b${String(i).padStart(3, "0")}`, tenant_id: TID, name: `Run ${i}`,
  template_id: "tp1", template_name: "offer", template_language: "en_US", params: [],
  audience: { kind: "everyone", id: null, label: "Everyone who said yes" }, state: "sent",
  scheduled_for: null, started_at: null, finished_at: null, recipient_count: 1, failure: null,
  created_at: new Date(Date.UTC(2026, 7, 1) + i * 3_600_000).toISOString(), playbook_id: null, run_for: null,
});
const world = (n) => ({ broadcasts: Array.from({ length: n }, (_, i) => bRow(i)), broadcast_recipients: [], messages: [] });

test("REGRESSION (D12): past fifty broadcasts the list says more exist -- the page summed the newest fifty and called it everything", async () => {
  const many = await listBroadcasts({ supabase: fakeDb(world(51)) }, TID);
  assert.ok(many && Array.isArray(many.broadcasts), "the list, and whether more follow it");
  assert.equal(many.broadcasts.length, 50);
  assert.equal(many.more, true);
  assert.equal(many.broadcasts[0].id, "b050", "newest first");
  const few = await listBroadcasts({ supabase: fakeDb(world(3)) }, TID);
  assert.equal(few.broadcasts.length, 3);
  assert.equal(few.more, false);
});

/* ------------------------ the surface's people, every page ------------------------ */

const H = 3_600_000;
const D = 24 * H;
const NOW = Date.now();
const iso = (ms) => new Date(NOW - ms).toISOString();

/** A person the People read returns, the shape people-vm.test.mjs pins, with a yes to both. */
const row = (over = {}) => ({
  id: "c1", display_name: "Daniela R.", wa_profile_name: "Dani", phone_e164: "+17865550181",
  consent: "opted_in", consent_source: "in_person", consent_updated_at: iso(D),
  marketing_consent: "opted_in", marketing_consent_source: "in_person", marketing_consent_updated_at: iso(D),
  dnc: false, channels: ["whatsapp"], conversation_count: 1, escalation_count: 0, needs_human: false,
  open_escalation_reason: null, open_escalation_since: null, latest_conversation_id: "cv1", latest_state: "open",
  latest_paused_until: null, latest_assignee_user_id: null, latest_snooze_until: null,
  latest_wa_inbound_at: iso(2 * H), last_message_at: iso(2 * H), last_message_direction: "inbound", last_message_sender: "customer",
  last_inbound_text: "Can I move Saturday to 11?", last_inbound_at: iso(2 * H), last_call_at: null, call_count: 0, call_seconds: 0,
  first_contact_at: iso(60 * D), earliest_row_at: iso(60 * D), has_backfill: false, has_chat: true, queued_reply_at: null,
  ...over,
});

globalThis.document = { body: {}, addEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }) };
const storage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.window = {
  location: { pathname: "/w/salon", hash: "", origin: "https://app.chanlytics.com", assign() {}, replace() {}, reload() {} },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  setTimeout: () => 1,
  clearTimeout() {},
  // The workspace, as its own surface publishes it: the rows say their times by its clock (legacy-bridge/zone.ts).
  __WORKSPACES: [{ id: TID, slug: "salon", name: "Salon", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: TID,
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const realConsoleError = console.error;
console.error = () => {};
const { broadcastsOverride } = await import("../../../apps/dashboard/src/legacy-bridge/surface-data.ts");
console.error = realConsoleError;

/** Two people over two pages of one each; the route's word on whether more than fifty broadcasts exist. */
const wire = ({ more = false } = {}) => {
  const offsets = [];
  globalThis.window.fetch = async (url) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    if (u.pathname === "/api/v1/broadcasts") return json(200, { ok: true, data: { broadcasts: [], more } });
    if (u.pathname === "/api/v1/contacts") {
      const offset = Number(u.searchParams.get("offset") || 0);
      offsets.push(offset);
      const people = offset === 0 ? [row({ id: "p1" })] : [row({ id: "p2", phone_e164: "+17865550182" })];
      return json(200, { ok: true, data: { people, page: { q: "", offset, limit: 1, total: 2, has_more: offset === 0 }, calendar: { state: "none" } } });
    }
    if (u.pathname === "/api/v1/segments") return json(200, { ok: true, data: { lists: [] } });
    if (u.pathname === "/api/v1/templates") return json(200, { ok: true, data: { templates: [] } });
    if (u.pathname === "/api/v1/channels") return json(200, { ok: true, data: { channels: [] } });
    if (u.pathname === "/api/v1/settings") return json(200, { ok: true, data: { config: { brain: {} }, version: 1 } });
    return json(404, { ok: false, error: { code: "not_found", message: `no ${u.pathname}` } });
  };
  return offsets;
};

test("REGRESSION: an audience counts every page of people -- it counted the first page while the send enrols everyone", async () => {
  const offsets = wire();
  await broadcastsOverride.apply();
  assert.deepEqual(offsets, [0, 1], "the second page of people was read before counting");
  const everyone = globalThis.window.__BROADCASTS.audiences.find((a) => a.kind === "everyone");
  assert.equal(everyone.counts.marketing, 2, JSON.stringify(everyone.counts));
});

test("the surface carries the route's word that more than fifty broadcasts exist", async () => {
  wire({ more: true });
  await broadcastsOverride.apply();
  assert.equal(globalThis.window.__BROADCASTS.more, true);
  wire({ more: false });
  await broadcastsOverride.apply();
  assert.equal(globalThis.window.__BROADCASTS.more, false);
});

test("the surface says where a yes is got, in contracts' one spelling -- the send screen's 'nobody has said yes' is a door there", async () => {
  const { GET_YES_ROUTE } = await import("@chanlytics/contracts");
  wire();
  await broadcastsOverride.apply();
  assert.equal(globalThis.window.__BROADCASTS.getYes, GET_YES_ROUTE);
});
