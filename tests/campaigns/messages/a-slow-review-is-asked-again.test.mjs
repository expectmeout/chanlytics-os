/**
 * A message WhatsApp has been checking for over a day is asked about again, and where WhatsApp still has not decided,
 * Chanlytics' own people are told once (the WhatsApp notices plan, step 4; Ruben chose "ask again, then say so", 16 Nov
 * 2026). WhatsApp's answer can be lost on its way (a webhook that never came): the six-hourly visit to each WhatsApp
 * number (api/cron/channel-quality.ts) asks WhatsApp for each such message by its id, and a decision it has made goes
 * through the webhook's own door (waba-events.ts handleWabaChange): the row takes it and the owner is told as on any
 * day. One still in review is paged to the platform once, in the words Ruben approved; the owner is not emailed, and its
 * pages say "Taking longer than usual" (a-slow-review-says-so.test.mjs). A sample nobody sent, and a review under a day,
 * are not asked. Run over a database in memory, with WhatsApp's answer, the key and the pager in the test's hands.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import { at } from "../../_cron-doors-world.mjs";

for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
const { askSlowReviews } = await import(at("apps/edge/lib/whatsapp/slow-reviews.ts"));

const T = "aaaaaaaa-0000-4000-8000-0000000000c1";
const WABA = "207650000000977";
/** Monday 16 November 2026, 10:00 AM in New York. */
const NOW = Date.parse("2026-11-16T15:00:00Z");
const HOUR = 3_600_000;

const channel = {
  id: "ch-1",
  tenant_id: T,
  kind: "whatsapp",
  external_id: "106540000000971",
  waba_id: WABA,
  status: "active",
  number_e164: "+13055550971",
  config: {},
  created_at: "2026-09-01T09:00:00.000Z",
};
/** A WhatsApp version: the booking follow-up, sent to WhatsApp Saturday 14 Nov at 3:10 PM New York, still in review. */
const template = (over = {}) => ({
  id: "tpl-1",
  tenant_id: T,
  channel: "whatsapp",
  name: "booking_follow_up",
  language: "en_US",
  title: "Booking follow-up",
  meta_status: "pending",
  meta_id: "990001",
  rejected_reason: null,
  hidden_at: null,
  source: "chanlytics",
  created_at: "2026-11-14T20:10:00.000Z",
  updated_at: "2026-11-14T20:10:00.000Z",
  ...over,
});

function world({ meta, rows = [template()], started = NOW, yieldAtMs = 30_000 }) {
  const tables = {
    tenant_channels: [{ ...channel }],
    tenants: [{ id: T, name: "Harbor Salon", timezone: "America/New_York", status: "active", slug: "harbor" }],
    templates: rows,
    events: [],
    operator_pages: [],
  };
  const db = fakeDb(tables);
  const asked = [];
  const pages = [];
  const ports = {
    db,
    log: { info: () => undefined, error: () => undefined, warn: () => undefined },
    now: () => NOW,
    started,
    yieldAtMs,
    credentialsOf: async () => ({ outcome: "present", credentials: { accessToken: "token", phoneId: "p1" } }),
    get: async (token, id) => {
      asked.push(id);
      return meta ? { ok: true, template: { id, ...meta } } : { ok: false, error: "down", status: 0 };
    },
    // The pager keeps its own memory (operator_pages), which "once" is read from.
    page: async (key, subject, body) => {
      pages.push({ key, subject, body });
      tables.operator_pages.push({
        key,
        first_at: new Date(NOW).toISOString(),
        last_at: new Date(NOW).toISOString(),
        count: 1,
        alerted_at: new Date(NOW).toISOString(),
      });
      return "sent";
    },
    loadNotifications: async () => null,
  };
  return { tables, ports, asked, pages };
}

test("a decision WhatsApp made and never sent reaches the row through the webhook's own door, and nobody is paged", async () => {
  const w = world({
    meta: { status: "APPROVED", category: "MARKETING", name: "booking_follow_up", language: "en_US" },
  });
  const tick = await askSlowReviews(w.ports);
  assert.deepEqual(tick, { slow: 1, decided: 1, still: 0, told: 0, unreadable: 0, left: 0 });
  assert.deepEqual(w.asked, ["990001"], "asked by WhatsApp's own id");
  assert.equal(w.tables.templates[0].meta_status, "approved", "the Library says what WhatsApp decided");
  assert.equal(w.pages.length, 0);
  const kept = w.tables.events.filter((e) => e.kind === "channel.message_template_status_update");
  assert.equal(kept.length, 1, "kept as the webhook keeps it");
  assert.equal(kept[0].data.asked_again, true, "and said to be the sweep's asking, not Meta's notice");
});

test("a change WhatsApp asked for, found the same way, goes to the row with its reason", async () => {
  const w = world({ meta: { status: "REJECTED", rejected_reason: "INVALID_FORMAT", category: "UTILITY" } });
  const tick = await askSlowReviews(w.ports);
  assert.equal(tick.decided, 1);
  assert.equal(w.tables.templates[0].meta_status, "rejected");
});

test("still in review past a day: the platform is told once, in the approved words, and the owner is not emailed", async () => {
  const w = world({ meta: { status: "PENDING" } });
  assert.deepEqual(await askSlowReviews(w.ports), { slow: 1, decided: 0, still: 1, told: 1, unreadable: 0, left: 0 });
  assert.deepEqual(w.pages, [
    {
      key: "whatsapp_review_slow:tpl-1",
      subject: "WhatsApp has been checking a message for over a day",
      body: "Harbor Salon · “Booking follow-up” (English). Sent to WhatsApp Nov 14, 3:10 PM, still being checked. Its owner sees “Taking longer than usual”. Ask WhatsApp Manager, or send it again.",
    },
  ]);
  assert.equal(w.tables.templates[0].meta_status, "pending", "nothing decided, nothing written");
  assert.deepEqual(await askSlowReviews(w.ports), { slow: 1, decided: 0, still: 1, told: 0, unreadable: 0, left: 0 });
  assert.equal(w.pages.length, 1, "once: the next visit tells nobody again");
});

test("a word of WhatsApp's the webhook does not take is not a decision: told once, with WhatsApp's word", async () => {
  const w = world({ meta: { status: "IN_APPEAL" } });
  const tick = await askSlowReviews(w.ports);
  assert.deepEqual([tick.decided, tick.still, tick.told], [0, 1, 1]);
  assert.match(w.pages[0].body, /WhatsApp's own word for it now: IN_APPEAL\./);
});

test("not asked: a sample nobody sent, a review under a day, a decided message, and none past the visit's time", async () => {
  const rows = [
    template({ id: "tpl-sample", meta_id: null }),
    template({ id: "tpl-fresh", meta_id: "990002", updated_at: new Date(NOW - 20 * HOUR).toISOString() }),
    template({ id: "tpl-ok", meta_id: "990003", meta_status: "approved" }),
  ];
  const w = world({ meta: { status: "PENDING" }, rows });
  assert.deepEqual(await askSlowReviews(w.ports), { slow: 0, decided: 0, still: 0, told: 0, unreadable: 0, left: 0 });
  assert.deepEqual(w.asked, []);
  const late = world({ meta: { status: "PENDING" }, started: NOW - 40_000 });
  assert.deepEqual(await askSlowReviews(late.ports), {
    slow: 1,
    decided: 0,
    still: 0,
    told: 0,
    unreadable: 0,
    left: 1,
  });
  assert.deepEqual(late.asked, [], "the visit's time is spent: next visit");
});

test("WhatsApp that cannot be asked leaves the message as it is, for the next visit", async () => {
  const w = world({ meta: null });
  assert.deepEqual(await askSlowReviews(w.ports), { slow: 1, decided: 0, still: 0, told: 0, unreadable: 1, left: 0 });
  assert.equal(w.pages.length, 0);
});
