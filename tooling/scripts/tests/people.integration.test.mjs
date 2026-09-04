/**
 * people_list, against the live schema.
 *
 * The unit tests pin what the view model does with a row; this pins what the
 * ROW says. Both matter: the evidence rule for first contact, the "last word"
 * rule that ignores a reply still in its cancel window, the counts, and the
 * two exclusions (erased, narrowed by contact) are SQL, and only SQL can prove
 * them. Runs on the smoke tenant with throwaway rows; skips without
 * credentials so CI stays secret-free.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY ? "no service-role credentials in env" : false;
const db = skip ? null : createClient(URL_, KEY, { auth: { persistSession: false } });

const SMOKE_SLUG = "chanlytics-smoke-test";
const PHONE = "+15550117743";

async function smokeTenantId() {
  const { data, error } = await db.from("tenants").select("id").eq("slug", SMOKE_SLUG).single();
  assert.equal(error, null, error?.message);
  return data.id;
}

async function cleanup(tenantId) {
  const { data: rows } = await db.from("contacts").select("id").eq("tenant_id", tenantId).eq("phone_e164", PHONE);
  for (const c of rows ?? []) {
    const { data: conv } = await db.from("conversations").select("id").eq("contact_id", c.id);
    for (const v of conv ?? []) {
      await db.from("messages").delete().eq("conversation_id", v.id);
      await db.from("escalations").delete().eq("conversation_id", v.id);
      await db.from("decisions").delete().eq("subject_id", v.id);
      await db.from("conversations").delete().eq("id", v.id);
    }
    await db.from("calls").delete().eq("contact_id", c.id);
    await db.from("contact_identities").delete().eq("contact_id", c.id);
    await db.from("events").delete().eq("subject_id", c.id);
    await db.from("contacts").delete().eq("id", c.id);
  }
}

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

test("people_list reports one person's facts by the same rules the rest of the app uses", { skip }, async () => {
  const tenantId = await smokeTenantId();
  await cleanup(tenantId);
  try {
    const contact = ok(await db.from("contacts").insert({ tenant_id: tenantId, phone_e164: PHONE, display_name: "People Probe" }).select("id").single());
    ok(await db.from("contact_identities").insert({ tenant_id: tenantId, contact_id: contact.id, channel: "whatsapp", external_id: PHONE.slice(1) }));
    const conv = ok(await db.from("conversations").insert({ tenant_id: tenantId, contact_id: contact.id, state: "needs_human", last_message_at: "2026-09-01T12:00:00Z" }).select("id").single());
    const base = { tenant_id: tenantId, conversation_id: conv.id, contact_id: contact.id, channel: "whatsapp", type: "text", meta: {} };
    ok(await db.from("messages").insert([
      // An undated import: contributes no time, marks the person as pre-existing.
      { ...base, direction: "inbound", sender: "customer", status: "received", body: "old imported line", channel_ts: null, meta: { backfill: "true" } },
      { ...base, direction: "inbound", sender: "customer", status: "received", body: "hola", channel_ts: "2026-08-01T12:00:00Z" },
      { ...base, direction: "outbound", sender: "ai", status: "delivered", body: "hi there", channel_ts: "2026-08-01T12:00:30Z" },
      { ...base, direction: "inbound", sender: "customer", status: "received", body: "can I book?", channel_ts: "2026-09-01T12:00:00Z" },
      // A reply still in its cancel window: not yet "the last word".
      { ...base, direction: "outbound", sender: "ai", status: "queued", body: "of course", channel_ts: null },
    ]));
    ok(await db.from("escalations").insert({ tenant_id: tenantId, conversation_id: conv.id, reason: "human_token", state: "open" }));

    const rows = ok(await db.rpc("people_list", { p_tenant_id: tenantId }));
    const r = rows.find((x) => x.id === contact.id);
    assert.ok(r, "the probe is listed");

    assert.equal(r.display_name, "People Probe");
    assert.deepEqual(r.channels, ["whatsapp"]);
    assert.equal(r.conversation_count, 1);
    assert.equal(r.escalation_count, 1);
    assert.equal(r.needs_human, true);
    assert.equal(r.open_escalation_reason, "human_token");
    assert.equal(r.latest_conversation_id, conv.id);
    assert.equal(r.latest_state, "needs_human");

    // Evidence: the earliest DATED message, never the import's created_at.
    assert.equal(r.has_backfill, true);
    assert.equal(new Date(r.first_contact_at).toISOString(), "2026-08-01T12:00:00.000Z");
    assert.ok(new Date(r.earliest_row_at).getTime() > Date.now() - 60_000, "earliest row is the import moment (now)");

    // The last word is the customer's, not the queued reply.
    assert.equal(r.last_message_direction, "inbound");
    assert.equal(r.last_message_sender, "customer");
    assert.equal(new Date(r.last_message_at).toISOString(), "2026-09-01T12:00:00.000Z");
    assert.equal(r.last_inbound_text, "can I book?");
    assert.ok(r.queued_reply_at, "the queued reply is visible as a fact of its own");
    assert.equal(r.has_chat, true);
    assert.equal(r.call_count, 0);
    assert.equal(r.last_call_at, null);

    // Narrowed to one contact, and nothing for a tenant that does not exist.
    const one = ok(await db.rpc("people_list", { p_tenant_id: tenantId, p_contact_id: contact.id }));
    assert.deepEqual(one.map((x) => x.id), [contact.id]);
    const none = ok(await db.rpc("people_list", { p_tenant_id: "00000000-0000-4000-8000-000000000000" }));
    assert.deepEqual(none, []);

    // Erased people never appear — the promise the erasure route makes.
    ok(await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", contact.id));
    const after = ok(await db.rpc("people_list", { p_tenant_id: tenantId }));
    assert.equal(after.some((x) => x.id === contact.id), false);
  } finally {
    await cleanup(tenantId);
  }
});

test("a person who only ever phoned has no chat, a voice channel, and the call as first contact", { skip }, async () => {
  const tenantId = await smokeTenantId();
  await cleanup(tenantId);
  try {
    const contact = ok(await db.from("contacts").insert({ tenant_id: tenantId, phone_e164: PHONE, display_name: null }).select("id").single());
    ok(await db.from("contact_identities").insert({ tenant_id: tenantId, contact_id: contact.id, channel: "voice", external_id: PHONE }));
    const conv = ok(await db.from("conversations").insert({ tenant_id: tenantId, contact_id: contact.id, state: "open" }).select("id").single());
    ok(await db.from("calls").insert({
      tenant_id: tenantId, contact_id: contact.id, conversation_id: conv.id,
      retell_call_id: `people-probe-${Date.now()}`, direction: "inbound", status: "ended",
      from_e164: PHONE, started_at: "2026-08-20T15:00:00Z", ended_at: "2026-08-20T15:01:52Z", duration_ms: 112000,
      raw: {},
    }));
    const rows = ok(await db.rpc("people_list", { p_tenant_id: tenantId, p_contact_id: contact.id }));
    assert.equal(rows.length, 1);
    const r = rows[0];
    assert.equal(r.has_chat, false);
    assert.deepEqual(r.channels, ["voice"]);
    assert.equal(r.call_count, 1);
    assert.equal(r.call_seconds, 112);
    assert.equal(new Date(r.first_contact_at).toISOString(), "2026-08-20T15:00:00.000Z");
    assert.equal(new Date(r.last_call_at).toISOString(), "2026-08-20T15:00:00.000Z");
    assert.equal(r.last_message_at, null);
    assert.equal(r.has_backfill, false);
  } finally {
    await cleanup(tenantId);
  }
});
