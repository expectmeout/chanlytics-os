/**
 * metrics_summary and report_series, against the live schema, on one fixture.
 *
 * The two functions disagreed about the same day: Today counted any later AI
 * reply and any later human reply (not exclusively), Reports took the first
 * replier; both timed the receptionist from its draft. 00035 gave them one
 * shared definition, measured from the send. This proves it on real rows.
 * Skips without credentials so CI stays secret-free.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY ? "no service-role credentials in env" : false;
const db = skip ? null : createClient(URL_, KEY, { auth: { persistSession: false } });

const SMOKE_SLUG = "chanlytics-smoke-test";
const PHONE = "+15550117745";

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

async function smokeTenantId() {
  return ok(await db.from("tenants").select("id").eq("slug", SMOKE_SLUG).single()).id;
}

async function cleanup(tenantId) {
  const { data: rows } = await db.from("contacts").select("id").eq("tenant_id", tenantId).eq("phone_e164", PHONE);
  for (const c of rows ?? []) {
    const { data: conv } = await db.from("conversations").select("id").eq("contact_id", c.id);
    for (const v of conv ?? []) {
      const { data: msgs } = await db.from("messages").select("id").eq("conversation_id", v.id);
      for (const m of msgs ?? []) await db.from("events").delete().eq("subject_id", m.id);
      await db.from("messages").delete().eq("conversation_id", v.id);
      await db.from("escalations").delete().eq("conversation_id", v.id);
      await db.from("conversations").delete().eq("id", v.id);
    }
    await db.from("contact_identities").delete().eq("contact_id", c.id);
    await db.from("events").delete().eq("subject_id", c.id);
    await db.from("contacts").delete().eq("id", c.id);
  }
}

async function both(tenantId) {
  const m = ok(await db.rpc("metrics_summary", { p_tenant_id: tenantId, p_days: 1 }));
  const r = ok(await db.rpc("report_series", { p_tenant_id: tenantId, p_days: 1 }));
  const today = r.series[r.series.length - 1];
  return { m, r, today };
}

test("Today and Reports agree on who answered, and the first replier wins", { skip }, async () => {
  const tenantId = await smokeTenantId();
  await cleanup(tenantId);
  try {
    const before = await both(tenantId);
    const contact = ok(await db.from("contacts").insert({ tenant_id: tenantId, phone_e164: PHONE, display_name: "Metrics Probe" }).select("id").single());
    const conv = ok(await db.from("conversations").insert({ tenant_id: tenantId, contact_id: contact.id, state: "open", last_message_at: minutesAgo(1) }).select("id").single());
    const base = { tenant_id: tenantId, conversation_id: conv.id, contact_id: contact.id, channel: "whatsapp", type: "text", meta: {} };

    // The take-over / hand-back loop: the customer asks, YOU answer at +2 min,
    // the receptionist answers at +5 min. Before 00035 Today counted both.
    ok(await db.from("messages").insert([
      { ...base, direction: "inbound", sender: "customer", status: "received", body: "hola", created_at: minutesAgo(6) },
      { ...base, direction: "outbound", sender: "human", status: "sent", body: "hi, Melany here", created_at: minutesAgo(4) },
      { ...base, direction: "outbound", sender: "ai", status: "sent", body: "we open at 9:30", created_at: minutesAgo(1) },
    ]));

    const after = await both(tenantId);
    assert.equal(after.m.period.answered_by_you - before.m.period.answered_by_you, 1, "you answered first");
    assert.equal(after.m.period.answered_by_ai - before.m.period.answered_by_ai, 0, "REGRESSION: the later AI reply counted too");
    assert.equal(after.m.period.answered_by_ai, after.today.answered_ai, "Today and Reports: same number for the same day");
    assert.equal(after.m.period.answered_by_you, after.today.answered_you);
    assert.equal(after.m.period.unanswered_in_window, after.today.unanswered);
  } finally {
    await cleanup(tenantId);
  }
});

test("reply time runs from the moment the reply left, not from the draft", { skip }, async () => {
  const tenantId = await smokeTenantId();
  await cleanup(tenantId);
  try {
    const contact = ok(await db.from("contacts").insert({ tenant_id: tenantId, phone_e164: PHONE, display_name: "Metrics Probe" }).select("id").single());
    const conv = ok(await db.from("conversations").insert({ tenant_id: tenantId, contact_id: contact.id, state: "open", last_message_at: minutesAgo(1) }).select("id").single());
    const base = { tenant_id: tenantId, conversation_id: conv.id, contact_id: contact.id, channel: "whatsapp", type: "text", meta: {} };
    ok(await db.from("messages").insert({ ...base, direction: "inbound", sender: "customer", status: "received", body: "hola", created_at: minutesAgo(10) }));
    // A veto-window reply: drafted at +1 min (the row), sent at +7 min (the event).
    const ai = ok(await db.from("messages").insert({ ...base, direction: "outbound", sender: "ai", status: "sent", body: "we open at 9:30", created_at: minutesAgo(9) }).select("id").single());
    ok(await db.from("events").insert({ tenant_id: tenantId, kind: "message.sent", category: "message", subject_type: "message", subject_id: ai.id, data: { sender: "ai" }, created_at: minutesAgo(3) }));

    const { r } = await both(tenantId);
    const secs = r.reply_seconds.map(Number);
    assert.ok(secs.some((s) => Math.abs(s - 420) <= 5), `REGRESSION: expected ~420 s (the send), got ${JSON.stringify(secs)} (60 s would be the draft)`);
    assert.ok(!secs.some((s) => Math.abs(s - 60) <= 5), "the draft moment must not be timed");
  } finally {
    await cleanup(tenantId);
  }
});
