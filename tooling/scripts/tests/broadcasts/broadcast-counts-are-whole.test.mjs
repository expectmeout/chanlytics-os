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
import { fakeDb } from "../_fake-db.mjs";

const TID = "t-salon";

/* ----------------------------- the route's fifty ----------------------------- */

const { listBroadcasts } = await import("../../../../apps/dashboard/src/server/campaigns/broadcasts.ts");

const bRow = (i) => ({
  id: `b${String(i).padStart(3, "0")}`,
  tenant_id: TID,
  name: `Run ${i}`,
  template_id: "tp1",
  template_name: "offer",
  template_language: "en_US",
  params: [],
  audience: { kind: "everyone", id: null, label: "Everyone who said yes" },
  state: "sent",
  scheduled_for: null,
  started_at: null,
  finished_at: null,
  recipient_count: 1,
  failure: null,
  created_at: new Date(Date.UTC(2026, 7, 1) + i * 3_600_000).toISOString(),
  playbook_id: null,
  run_for: null,
});
const world = (n) => ({
  broadcasts: Array.from({ length: n }, (_, i) => bRow(i)),
  broadcast_recipients: [],
  messages: [],
});

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
  id: "c1",
  display_name: "Daniela R.",
  wa_profile_name: "Dani",
  phone_e164: "+17865550181",
  consent: "opted_in",
  consent_source: "in_person",
  consent_updated_at: iso(D),
  marketing_consent: "opted_in",
  marketing_consent_source: "in_person",
  marketing_consent_updated_at: iso(D),
  dnc: false,
  channels: ["whatsapp"],
  conversation_count: 1,
  escalation_count: 0,
  needs_human: false,
  open_escalation_reason: null,
  open_escalation_since: null,
  latest_conversation_id: "cv1",
  latest_state: "open",
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: iso(2 * H),
  last_message_at: iso(2 * H),
  last_message_direction: "inbound",
  last_message_sender: "customer",
  last_inbound_text: "Can I move Saturday to 11?",
  last_inbound_at: iso(2 * H),
  last_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: iso(60 * D),
  earliest_row_at: iso(60 * D),
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
  ...over,
});

globalThis.document = {
  body: {},
  addEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.window = {
  location: {
    pathname: "/w/salon",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
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
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const realConsoleError = console.error;
console.error = () => {};
const { broadcastsOverride } = await import("../../../../apps/dashboard/src/surfaces/campaigns/broadcasts/surface.ts");
const { surfaceValue } = await import("../../../../apps/dashboard/src/surfaces/surface-values.ts");
console.error = realConsoleError;

/**
 * Everyone the People read holds, one person a page -- two by default -- and the lists kept by hand; the route's word
 * on whether more than fifty broadcasts exist.
 */
const wire = ({
  more = false,
  people = [row({ id: "p1" }), row({ id: "p2", phone_e164: "+17865550182" })],
  lists = [],
} = {}) => {
  const offsets = [];
  globalThis.window.fetch = async (url) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    if (u.pathname === "/api/v1/broadcasts") return json(200, { ok: true, data: { broadcasts: [], more } });
    if (u.pathname === "/api/v1/contacts") {
      const offset = Number(u.searchParams.get("offset") || 0);
      offsets.push(offset);
      return json(200, {
        ok: true,
        data: {
          people: people.slice(offset, offset + 1),
          page: { q: "", offset, limit: 1, total: people.length, has_more: offset + 1 < people.length },
          calendar: { state: "none" },
        },
      });
    }
    if (u.pathname === "/api/v1/segments") return json(200, { ok: true, data: { lists } });
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
  const everyone = surfaceValue("broadcasts").audiences.find((a) => a.kind === "everyone");
  assert.equal(everyone.counts.marketing, 2, JSON.stringify(everyone.counts));
});

test("the surface carries the route's word that more than fifty broadcasts exist", async () => {
  wire({ more: true });
  await broadcastsOverride.apply();
  assert.equal(surfaceValue("broadcasts").more, true);
  wire({ more: false });
  await broadcastsOverride.apply();
  assert.equal(surfaceValue("broadcasts").more, false);
});

test("the surface says where a yes is got, in contracts' one spelling -- the send screen's 'nobody has said yes' is a door there", async () => {
  const { GET_YES_ROUTE } = await import("@chanlytics/contracts");
  wire();
  await broadcastsOverride.apply();
  assert.equal(surfaceValue("broadcasts").getYes, GET_YES_ROUTE);
});

test("REGRESSION: an audience says, per purpose, how many on it said yes, a number or not -- the send screen read a yes with no number as nobody having said yes", async () => {
  wire({
    people: [
      row({ id: "p1" }),
      // Wrote in by email and said yes to both there: an address, and no number.
      row({
        id: "p2",
        display_name: "Ana Reyes",
        wa_profile_name: null,
        phone_e164: null,
        email: "ana@example.com",
        channels: ["email"],
        consent_source: "customer_message",
        marketing_consent_source: "customer_message",
      }),
      // A number, and a yes to messages only.
      row({
        id: "p3",
        display_name: "Luis Mora",
        wa_profile_name: "Luis",
        phone_e164: "+17865550183",
        marketing_consent: "unknown",
        marketing_consent_source: null,
        marketing_consent_updated_at: null,
      }),
    ],
    lists: [
      { id: "s1", name: "Regulars", ids: ["p2", "p3"] },
      { id: "s2", name: "Walk-ins", ids: ["p3"] },
    ],
  });
  await broadcastsOverride.apply();
  const { audiences } = surfaceValue("broadcasts");
  const option = (id) => audiences.find((a) => a.id === id);
  /** For one purpose: how many the send reaches (the chip), and how many said yes to what it needs. */
  const sizes = (a, purpose) => [a.counts[purpose], a.preview[purpose].saidYes];
  assert.deepEqual(
    sizes(option(null), "marketing"),
    [1, 2],
    "Dani can be sent an offer; Ana said yes to one too, and has no number to send it to",
  );
  assert.deepEqual(sizes(option(null), "conversational"), [2, 3]);
  assert.deepEqual(
    sizes(option("s1"), "marketing"),
    [0, 1],
    "REGRESSION: nobody on it can be sent an offer, and somebody said yes",
  );
  assert.deepEqual(sizes(option("s1"), "conversational"), [1, 2]);
  assert.deepEqual(
    sizes(option("s2"), "marketing"),
    [0, 0],
    "nobody on it said yes to offers: the one case the door is for",
  );
});

test("an archived list is offered to no new broadcast: it is off People's rail, and the send refuses it (00169)", async () => {
  wire({
    lists: [
      { id: "s1", name: "Regulars", ids: ["p1"], rule: null, archived_at: null },
      { id: "s2", name: "VIP", ids: ["p2"], rule: null, archived_at: "2026-09-20T12:00:00.000Z" },
    ],
  });
  await broadcastsOverride.apply();
  assert.deepEqual(
    surfaceValue("broadcasts")
      .audiences.filter((a) => a.kind === "saved")
      .map((a) => a.id),
    ["s1"],
  );
});

test("the verbs publish the words for a list whose yeses have no number to send to -- People's, from contracts (#663)", async () => {
  const { broadcasts } = await import("../../../../apps/dashboard/src/surfaces/campaigns/broadcasts/verbs.ts");
  assert.equal(typeof broadcasts.noNumberWords, "function", "the send screen's words for it");
  assert.equal(
    broadcasts.noNumberWords("“Regulars”", "marketing"),
    "Nobody on “Regulars” can be sent an offer yet — a broadcast reaches only a recorded yes with a number to send to.",
  );
  assert.equal(
    broadcasts.noNumberWords("“Regulars”", "conversational"),
    "Nobody on “Regulars” can be sent a message yet — a broadcast reaches only a recorded yes with a number to send to.",
  );
});

test("the verbs publish how many on an audience said yes, as the line under it says it: the reach, and who said yes when nobody can be sent it", async () => {
  const { broadcasts } = await import("../../../../apps/dashboard/src/surfaces/campaigns/broadcasts/verbs.ts");
  assert.equal(typeof broadcasts.saidYesWords, "function", "the send screen's words for it");
  assert.equal(
    broadcasts.saidYesWords("“Regulars”", "marketing", 0, 1),
    "1 person on “Regulars” said yes to offers, with no number to send to",
  );
  assert.equal(broadcasts.saidYesWords("“Regulars”", "marketing", 3, 5), "3 people on “Regulars” said yes to offers");
});

/* ------------------------- a list past a thousand ------------------------- */

test("REGRESSION: a send to a list past a thousand people enrols every one of them -- its members were one select, which answers at most 1000 rows", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
  const { createBroadcastPorts } = await import("../../../../apps/dashboard/src/server/ports/campaign-ports.ts");
  const S = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
  const ids = Array.from({ length: 1500 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  // Everyone, as people_list pages them (a thousand at a time): a list kept by hand is its people who are people here.
  const people = ids.map((id) => ({ id, display_name: null, phone_e164: null, consent: "opted_in", dnc: false }));
  const db = fakeDb(
    {
      tenants: [{ id: TID, timezone: "America/New_York" }],
      tenant_config: [],
      segments: [{ id: S, tenant_id: TID, name: "Regulars" }],
      segment_members: ids.map((contact_id) => ({ segment_id: S, contact_id, tenant_id: TID })),
    },
    {},
    {
      people_list: (args) =>
        args.p_tenant_id === TID ? people.slice(args.p_offset ?? 0, (args.p_offset ?? 0) + (args.p_limit ?? 1000)) : [],
    },
    { maxRows: 1000 },
  );
  const now = new Date("2026-09-20T15:00:00Z");
  const seg = await createBroadcastPorts({ supabase: db }, TID).list({ kind: "saved", id: S }, now);
  assert.equal(seg.label, "Regulars");
  assert.equal(seg.memberIds.length, 1500, "REGRESSION: the send enrolled 1000 of 1500");
  assert.equal(
    await createBroadcastPorts({ supabase: db }, "t-other").list({ kind: "saved", id: S }, now),
    null,
    "another workspace's list is no list",
  );
});
