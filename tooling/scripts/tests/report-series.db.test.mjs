/**
 * report_series v3 (the Reports redesign), proved on a real Postgres: where people reached the business
 * (inbound customer messages by their own channel, connected calls as voice), when (7 rows of 24 hours in the
 * tenant's zone, Monday first), and every receptionist first reply with the day it was asked. Every field the
 * function already returned stays as it was.
 *
 * Runs the way notifications.db.test.mjs does: against the database `supabase start` builds on this machine,
 * never production. The tenant lives in UTC so the hours are the fixture's own.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine"
    : false;

let db;
let tenantId;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const ago = (min) => new Date(Date.now() - min * 60_000);
const utcDay = (d) => d.toISOString().slice(0, 10);
/** ISO weekday, Monday 1 to Sunday 7, in UTC. */
const isoDow = (d) => ((d.getUTCDay() + 6) % 7) + 1;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(await db.from("tenants").insert({ slug: `report-v3-${Date.now()}`, name: "Report v3", timezone: "UTC" }).select("id").single()).id;
});

after(async () => {
  if (skip) return;
  if (tenantId) await db.from("tenants").delete().eq("id", tenantId);
});

test("v3 says where, when and how fast, and every older field is as it was", { skip }, async () => {
  const contact = ok(await db.from("contacts").insert({ tenant_id: tenantId, phone_e164: "+15550139001", display_name: "Where When" }).select("id").single());
  const conv = ok(await db.from("conversations").insert({ tenant_id: tenantId, contact_id: contact.id, state: "open", last_message_at: ago(1).toISOString() }).select("id").single());
  const base = { tenant_id: tenantId, conversation_id: conv.id, contact_id: contact.id, type: "text", meta: {} };
  const asks = [
    { channel: "whatsapp", at: ago(180), replyAfter: 30 },
    { channel: "whatsapp", at: ago(120), replyAfter: 90 },
    { channel: "email", at: ago(60), replyAfter: null },
    { channel: "sms", at: ago(30), replyAfter: null },
  ];
  const rows = [];
  for (const a of asks) {
    rows.push({ ...base, channel: a.channel, direction: "inbound", sender: "customer", status: "received", body: "hi", created_at: a.at.toISOString() });
    if (a.replyAfter != null) {
      rows.push({ ...base, channel: a.channel, direction: "outbound", sender: "ai", status: "sent", body: "hello", created_at: new Date(a.at.getTime() + a.replyAfter * 1000).toISOString() });
    }
  }
  // Excluded everywhere in this function: an imported message.
  rows.push({ ...base, channel: "whatsapp", direction: "inbound", sender: "customer", status: "received", body: "old", created_at: ago(90).toISOString(), meta: { backfill: "true" } });
  ok(await db.from("messages").insert(rows));
  const callAt = ago(45);
  ok(await db.from("calls").insert([
    { tenant_id: tenantId, retell_call_id: `v3-${Date.now()}-a`, contact_id: contact.id, status: "ended", started_at: callAt.toISOString(), duration_ms: 60_000 },
    { tenant_id: tenantId, retell_call_id: `v3-${Date.now()}-b`, contact_id: contact.id, status: "not_connected", started_at: ago(40).toISOString() },
  ]));

  const r = ok(await db.rpc("report_series", { p_tenant_id: tenantId, p_days: 7 }));

  // Where: a message counts on its own channel, a connected call as voice; the import and the dial that never
  // connected are not there.
  assert.deepEqual(r.channels.current, { whatsapp: 2, sms: 1, email: 1, instagram: 0, voice: 1 });
  assert.deepEqual(r.channels.previous, { whatsapp: 0, sms: 0, email: 0, instagram: 0, voice: 0 });

  // When: 7 rows of 24, Monday first, each message and the one connected call in the hour it happened.
  assert.equal(r.hours.length, 7);
  for (const row of r.hours) assert.equal(row.length, 24);
  const want = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const t of [...asks.map((a) => a.at), callAt]) want[isoDow(t) - 1][t.getUTCHours()] += 1;
  assert.deepEqual(r.hours, want);

  // How fast: each receptionist first reply, with the day it was asked, oldest first.
  assert.deepEqual(r.replies, [
    { day: utcDay(asks[0].at), s: 30 },
    { day: utcDay(asks[1].at), s: 90 },
  ]);

  // Unchanged: two periods of days, the same four messages and one call, the same reply seconds.
  assert.equal(r.series.length, 14);
  const sum = (k) => r.series.reduce((s, d) => s + Number(d[k]), 0);
  assert.equal(sum("messages_in"), 4);
  assert.equal(sum("calls"), 1);
  assert.deepEqual([...r.reply_seconds].sort((a, b) => a - b), [30, 90]);
});
