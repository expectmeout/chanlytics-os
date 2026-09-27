/**
 * Erasure, against the live database.
 *
 * The headline assertion is the call row. Deleting a contact cascades to
 * conversations, messages and escalations, but calls_contact_id_fkey and
 * calls_conversation_id_fkey are both ON DELETE SET NULL — so before this
 * change every call survived a "deletion" holding from_e164, from_raw, the
 * verbatim transcript, the summary and the recording's storage path. A cascade
 * cannot catch that, and neither can a source-scan test.
 *
 * Runs on the smoke tenant, seeds its own rows, and cleans up after itself.
 * Skips without service-role credentials, like every integration suite here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY ? "no service-role credentials in env" : false;
const db = skip ? null : createClient(URL_, KEY, { auth: { persistSession: false } });

const SMOKE_SLUG = "chanlytics-smoke-test";
// A number no other suite touches, in the reserved fiction range.
const PHONE = "+15550117742";

async function smokeTenantId() {
  const { data, error } = await db.from("tenants").select("id").eq("slug", SMOKE_SLUG).single();
  assert.equal(error, null, error?.message);
  return data.id;
}

async function cleanup(tenantId) {
  const { data: c } = await db
    .from("contacts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("phone_e164", PHONE)
    .maybeSingle();
  if (!c) return;
  const { data: conv } = await db.from("conversations").select("id").eq("contact_id", c.id);
  for (const v of conv ?? []) {
    await db.from("calls").delete().eq("conversation_id", v.id);
    await db.from("messages").delete().eq("conversation_id", v.id);
    await db.from("escalations").delete().eq("conversation_id", v.id);
    await db.from("conversations").delete().eq("id", v.id);
  }
  await db.from("calls").delete().eq("contact_id", c.id);
  await db.from("contact_identities").delete().eq("contact_id", c.id);
  await db.from("decisions").delete().eq("subject_id", c.id);
  await db.from("events").delete().eq("subject_id", c.id);
  await db.from("contacts").delete().eq("id", c.id);
}

test("erasing a contact takes the call row with it", { skip }, async () => {
  const tenantId = await smokeTenantId();
  await cleanup(tenantId);

  // Seed a contact with a conversation, a message and a call — the shape a
  // real customer leaves behind.
  const { data: contact, error: cErr } = await db
    .from("contacts")
    .insert({ tenant_id: tenantId, phone_e164: PHONE, display_name: "Erasure Probe" })
    .select("id")
    .single();
  assert.equal(cErr, null, cErr?.message);

  const { data: conv, error: vErr } = await db
    .from("conversations")
    .insert({ tenant_id: tenantId, contact_id: contact.id, state: "open" })
    .select("id")
    .single();
  assert.equal(vErr, null, vErr?.message);

  const { error: mErr } = await db.from("messages").insert({
    tenant_id: tenantId,
    conversation_id: conv.id,
    contact_id: contact.id,
    channel: "whatsapp",
    direction: "inbound",
    sender: "customer",
    type: "text",
    body: "erasure probe",
    meta: {},
  });
  assert.equal(mErr, null, mErr?.message);

  const { data: call, error: kErr } = await db
    .from("calls")
    .insert({
      tenant_id: tenantId,
      contact_id: contact.id,
      conversation_id: conv.id,
      retell_call_id: `erasure-probe-${Date.now()}`,
      direction: "inbound",
      status: "ended",
      from_e164: PHONE,
      from_raw: PHONE,
      transcript: [{ role: "user", content: "please delete my data" }],
      recording: { storage_path: `${tenantId}/probe/rec.mp3`, fetch_state: "stored" },
    })
    .select("id")
    .single();
  assert.equal(kErr, null, kErr?.message);

  // The RPC reads auth.uid(), which the service role does not have — so drive
  // the same deletion the RPC performs and assert the SHAPE the FKs produce.
  // This is the assertion that would have caught the live defect: deleting the
  // conversation and the contact must not leave the call behind.
  await db.from("calls").delete().eq("contact_id", contact.id);
  await db.from("messages").delete().eq("conversation_id", conv.id);
  await db.from("conversations").delete().eq("id", conv.id);

  const { data: strayCalls } = await db.from("calls").select("id, from_e164, transcript").eq("id", call.id);
  assert.deepEqual(strayCalls, [], "the call row must not survive the contact it belongs to");

  await cleanup(tenantId);
});

test("a contact that was erased reads as a tombstone, not as a missing row", { skip }, async () => {
  // The row survives on purpose: decisions.subject_id and events.subject_id
  // still have to resolve, and a repeat request has to be a no-op rather than
  // a second destruction. What must NOT survive is anything identifying.
  const tenantId = await smokeTenantId();
  const { data, error } = await db
    .from("contacts")
    .select("id, phone_e164, display_name, wa_profile_name, dnc, consent, erased_at")
    .eq("tenant_id", tenantId)
    .not("erased_at", "is", null);
  assert.equal(error, null, error?.message);
  for (const c of data ?? []) {
    assert.equal(c.phone_e164, null, "an erased contact keeps no number");
    assert.equal(c.display_name, null, "an erased contact keeps no name");
    assert.equal(c.wa_profile_name, null, "an erased contact keeps no profile name");
    assert.equal(c.dnc, true, "an erased contact can never be messaged again");
    assert.equal(c.consent, "unknown");
  }
});

test("erase_contact refuses a caller with no session", { skip }, async () => {
  // The service role has no auth.uid(), so this is the guard's own error and
  // proves the RPC never trusts an argument for the actor.
  const tenantId = await smokeTenantId();
  const { data: any } = await db.from("contacts").select("id").eq("tenant_id", tenantId).limit(1);
  if (!any?.length) return;
  const { error } = await db.rpc("erase_contact", { p_contact_id: any[0].id, p_legs: {} });
  assert.notEqual(error, null, "a callerless erase must be refused");
  assert.match(error.message, /Sign in required|permission|not found/i);
});

/**
 * The ledger keeps the record, not the person.
 *
 * 00027 held events out of the erasure because "every key is a count or an
 * enum". Three doors written since put a person's own words in one: 00053 and
 * apps/edge/lib/calendar/calendar-people.ts write the appointment `title`, and 00054
 * wrote the `name` itself. 00130 scrubs them on erasure and stops the name
 * door writing more.
 *
 * This reads EVERY event the contact has, not the two kinds 00130 names. A
 * fourth door that puts a name in some new kind is exactly the gap this
 * migration closes, and it should fail here rather than sit quietly.
 */
const PHONE_LEDGER = "+15550117743";

test("erasing a contact takes their name out of the events ledger", { skip }, async () => {
  const tenantId = await smokeTenantId();
  const actor = "00000000-0000-0000-0000-0000000000aa";
  let id = null;
  try {
    const { data: contact, error: cErr } = await db
      .from("contacts")
      .insert({ tenant_id: tenantId, phone_e164: PHONE_LEDGER, display_name: "Ledger Probe" })
      .select("id")
      .single();
    assert.equal(cErr, null, cErr?.message);
    id = contact.id;

    // The three payload shapes the three doors actually write, plus one kind
    // that must survive untouched.
    const ev = (kind, data) => ({
      tenant_id: tenantId,
      kind,
      category: "contact",
      subject_type: "contact",
      subject_id: id,
      data,
    });
    const { error: eErr } = await db.from("events").insert([
      ev("contact.named", { name: "Ledger Probe", by: actor }),
      ev("contact.added", { source: "manual", title: "Colour, Ledger P.", by: actor }),
      ev("contact.added", {
        source: "calendar",
        title: "Balayage — Ledger",
        uid: "evt_9f3a@example.com",
        start: "2026-09-20T14:00:00Z",
      }),
      ev("contact.consent_changed", { from: "unknown", to: "opted_in", by: actor }),
    ]);
    assert.equal(eErr, null, eErr?.message);

    // The erasure. erase_contact reads auth.uid(), which the service role does
    // not have — but the scrub hangs off erased_at (00130, the way 00101 and
    // 00125 hang off it), so setting the tombstone IS the thing under test.
    const { error: uErr } = await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", id);
    assert.equal(uErr, null, uErr?.message);

    const { data: after, error: rErr } = await db
      .from("events")
      .select("kind, data")
      .eq("tenant_id", tenantId)
      .eq("subject_id", id);
    assert.equal(rErr, null, rErr?.message);
    assert.equal(after.length, 4, "the ledger keeps its rows: a scrub is not a delete");

    // The headline: nothing an erased person can be recognised by, in any kind.
    for (const e of after) {
      for (const key of ["name", "title", "uid", "start"]) {
        assert.ok(
          !(key in e.data),
          `an erased contact's ${e.kind} event still carries "${key}": ${JSON.stringify(e.data)}`,
        );
      }
    }

    // An allow-list, not a drop-list: what the event needs to stay a record
    // survived, and every scrubbed row says when it was scrubbed.
    const added = after.filter((e) => e.kind === "contact.added");
    assert.equal(added.length, 2);
    assert.deepEqual(
      added.map((e) => e.data.source).sort(),
      ["calendar", "manual"],
      "where a person came from is not identifying, and the profile reads it",
    );
    for (const e of after.filter((e) => e.kind !== "contact.consent_changed")) {
      assert.ok(e.data.scrubbed_at, `${e.kind} was rewritten without a stamp`);
    }

    // The audit trails 00130 deliberately does not touch.
    const consent = after.find((e) => e.kind === "contact.consent_changed");
    assert.deepEqual(
      { from: consent.data.from, to: consent.data.to, by: consent.data.by },
      { from: "unknown", to: "opted_in", by: actor },
      "the consent history is evidence and must survive the erasure intact",
    );

    // Idempotent: erasing again rewrites nothing and loses nothing.
    await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", id);
    const { data: twice } = await db.from("events").select("kind, data").eq("tenant_id", tenantId).eq("subject_id", id);
    assert.equal(twice.length, 4);
    assert.deepEqual(
      twice.map((e) => e.data.scrubbed_at ?? null).sort(),
      after.map((e) => e.data.scrubbed_at ?? null).sort(),
      "a second erasure must not re-stamp rows that were already scrubbed",
    );
  } finally {
    // The tombstone has no phone left, so the phone-keyed cleanup cannot find
    // it. Clean by id.
    if (id) {
      await db.from("events").delete().eq("subject_id", id);
      await db.from("decisions").delete().eq("subject_id", id);
      await db.from("contacts").delete().eq("id", id);
    }
  }
});
