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
  // Two days, with the series' last two rows summed. A fixture written ten
  // minutes ago lands on "yesterday" in the tenant's zone once the clock
  // passes midnight in New York, and a one-day window then hides it — this
  // file went red at 00:03 ET with nothing changed. The agreement under test
  // is the same: the period's totals against the series' rows for the same
  // days.
  const m = ok(await db.rpc("metrics_summary", { p_tenant_id: tenantId, p_days: 2 }));
  const r = ok(await db.rpc("report_series", { p_tenant_id: tenantId, p_days: 2 }));
  const rows = r.series.slice(-2);
  const sum = (k) => rows.reduce((a, x) => a + Number(x[k] ?? 0), 0);
  const today = { answered_ai: sum("answered_ai"), answered_you: sum("answered_you"), unanswered: sum("unanswered") };
  return { m, r, today };
}

test("Today and Reports agree on who answered, and the first replier wins", { skip }, async () => {
  const tenantId = await smokeTenantId();
  await cleanup(tenantId);
  try {
    const contact = ok(
      await db
        .from("contacts")
        .insert({ tenant_id: tenantId, phone_e164: PHONE, display_name: "Metrics Probe" })
        .select("id")
        .single(),
    );
    const conv = ok(
      await db
        .from("conversations")
        .insert({ tenant_id: tenantId, contact_id: contact.id, state: "open", last_message_at: minutesAgo(1) })
        .select("id")
        .single(),
    );
    const base = {
      tenant_id: tenantId,
      conversation_id: conv.id,
      contact_id: contact.id,
      channel: "whatsapp",
      type: "text",
      meta: {},
    };

    // The take-over / hand-back loop: the customer asks, YOU answer at +2 min,
    // the receptionist answers at +5 min. Before 00035 Today counted both.
    ok(
      await db.from("messages").insert([
        {
          ...base,
          direction: "inbound",
          sender: "customer",
          status: "received",
          body: "hola",
          created_at: minutesAgo(6),
        },
        {
          ...base,
          direction: "outbound",
          sender: "human",
          status: "sent",
          body: "hi, Marisa here",
          created_at: minutesAgo(4),
        },
        {
          ...base,
          direction: "outbound",
          sender: "ai",
          status: "sent",
          body: "we open at 9:30",
          created_at: minutesAgo(1),
        },
      ]),
    );

    // The shared rule, asked about THIS conversation: other integration files
    // run against the same smoke tenant at the same time, so tenant-wide
    // deltas are not a fixture of ours.
    const mine = ok(await db.rpc("first_replies", { p_tenant_id: tenantId, p_start: minutesAgo(30) })).filter(
      (r) => r.conversation_id === conv.id,
    );
    assert.equal(mine.length, 1);
    assert.equal(mine[0].who, "you", "REGRESSION: the later AI reply counted too — the first replier wins");
    assert.equal(mine[0].ai_seconds, null, "an AI reply that came second is not timed");

    // And the two functions read that rule identically for the same day.
    // Read back-to-back; a concurrent test's fixture can still land between
    // the two calls (the integration files share this tenant and run at the
    // same time), so a disagreement earns a few more looks before it counts.
    let after = await both(tenantId);
    for (let attempt = 0; attempt < 4; attempt++) {
      if (
        after.m.period.answered_by_you === after.today.answered_you &&
        after.m.period.answered_by_ai === after.today.answered_ai &&
        after.m.period.unanswered_in_window === after.today.unanswered
      )
        break;
      await new Promise((r) => setTimeout(r, 400));
      after = await both(tenantId);
    }
    assert.equal(
      after.m.period.answered_by_ai,
      after.today.answered_ai,
      "Today and Reports: same number for the same day",
    );
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
    const contact = ok(
      await db
        .from("contacts")
        .insert({ tenant_id: tenantId, phone_e164: PHONE, display_name: "Metrics Probe" })
        .select("id")
        .single(),
    );
    const conv = ok(
      await db
        .from("conversations")
        .insert({ tenant_id: tenantId, contact_id: contact.id, state: "open", last_message_at: minutesAgo(1) })
        .select("id")
        .single(),
    );
    const base = {
      tenant_id: tenantId,
      conversation_id: conv.id,
      contact_id: contact.id,
      channel: "whatsapp",
      type: "text",
      meta: {},
    };
    ok(
      await db.from("messages").insert({
        ...base,
        direction: "inbound",
        sender: "customer",
        status: "received",
        body: "hola",
        created_at: minutesAgo(10),
      }),
    );
    // A veto-window reply: drafted at +1 min (the row), sent at +7 min (the event).
    const ai = ok(
      await db
        .from("messages")
        .insert({
          ...base,
          direction: "outbound",
          sender: "ai",
          status: "sent",
          body: "we open at 9:30",
          created_at: minutesAgo(9),
        })
        .select("id")
        .single(),
    );
    ok(
      await db.from("events").insert({
        tenant_id: tenantId,
        kind: "message.sent",
        category: "message",
        subject_type: "message",
        subject_id: ai.id,
        data: { sender: "ai" },
        created_at: minutesAgo(3),
      }),
    );

    // Asked about THIS conversation, so other files' fixtures cannot interfere.
    const mine = ok(await db.rpc("first_replies", { p_tenant_id: tenantId, p_start: minutesAgo(30) })).filter(
      (r) => r.conversation_id === conv.id,
    );
    assert.equal(mine.length, 1);
    assert.equal(mine[0].who, "ai");
    const secs = Number(mine[0].ai_seconds);
    assert.ok(
      Math.abs(secs - 420) <= 5,
      `REGRESSION: expected ~420 s (the send), got ${secs} (60 s would be the draft)`,
    );
    // And it reaches Reports' raw list for the median.
    const { r } = await both(tenantId);
    assert.ok(r.reply_seconds.map(Number).some((s) => Math.abs(s - 420) <= 5));
  } finally {
    await cleanup(tenantId);
  }
});
