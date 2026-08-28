/**
 * The database half of opt-out, against REAL Postgres (throwaway contact,
 * self-cleaning, skips without service credentials — same contract as the
 * other integration tests here).
 *
 * The unit tests cover classification and the view-model boundary. What only
 * the database can answer is whether the state actually PERSISTS: that an
 * ordinary message after a STOP does not quietly clear the flag, that START
 * releases it, and that consent comes back on the RPC's return at all — which
 * is the whole mechanism the edge's gate depends on.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { resolveOutboundTarget } from "@chanlytics/db";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY ? "no service-role credentials in env" : false;

let db;
let tenantId;
let contactId;
let conversationId;
const stamp = String(Date.now());
const phone = `+1999555${stamp.slice(-4)}`;
const ext = `optout-probe-${stamp}`;
let seq = 0;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data: ts } = await db.from("tenants").select("id, slug");
  tenantId = (ts.find((t) => t.slug === "chanlytics-smoke-test") ?? ts[0]).id;
});

after(async () => {
  if (skip || !contactId) return;
  if (conversationId) {
    await db.from("escalations").delete().eq("conversation_id", conversationId);
    await db.from("messages").delete().eq("conversation_id", conversationId);
    await db.from("conversations").delete().eq("id", conversationId);
  }
  await db.from("events").delete().eq("subject_id", contactId);
  await db.from("contact_identities").delete().eq("contact_id", contactId);
  await db.from("contacts").delete().eq("id", contactId);
});

async function ingest(body, optOut = false, optIn = false) {
  const { data, error } = await db.rpc("ingest_inbound", {
    p_tenant_id: tenantId, p_channel: "whatsapp", p_identity_external_id: ext,
    p_phone_e164: phone, p_wa_profile_name: "Opt-out probe",
    p_message_external_id: `${ext}-${++seq}`, p_type: "text", p_body: body,
    p_channel_ts: new Date().toISOString(), p_media: null, p_meta: {},
    p_opt_out: optOut, p_opt_in: optIn,
  });
  if (error) throw new Error(`ingest_inbound: ${error.message}`);
  contactId ??= data.contact_id;
  conversationId ??= data.conversation_id;
  return data;
}

test("consent comes back on the RPC return", { skip }, async () => {
  // The edge's gate reads this. If it stops being returned, the gate silently
  // sees undefined and every opt-out stops being enforced.
  const r = await ingest("hi there");
  assert.equal(r.consent, "unknown");
  assert.equal(r.dnc, false);
});

test("STOP opts out, and the next ordinary message stays opted out", { skip }, async () => {
  const stop = await ingest("STOP", true);
  assert.equal(stop.consent, "opted_out");
  assert.equal(stop.dnc, true);

  // The one that matters: an ordinary message must not clear the flag.
  // Anything looser than an explicit START and the block releases itself.
  const after_ = await ingest("are you there?");
  assert.equal(after_.consent, "opted_out", "an ordinary message released the opt-out");
  assert.equal(after_.dnc, true);
});

test("START opts back in", { skip }, async () => {
  const r = await ingest("START", false, true);
  assert.equal(r.consent, "opted_in");
  assert.equal(r.dnc, false, "dnc must clear too, or the send gates still block");
});

test("consent events record transitions, not every message", { skip }, async () => {
  const { data } = await db
    .from("events")
    .select("data")
    .eq("tenant_id", tenantId)
    .eq("subject_id", contactId)
    .eq("kind", "contact.consent_changed");
  assert.deepEqual(
    data.map((e) => e.data.consent),
    ["opted_out", "opted_in"],
    "five messages produced these events — only the two transitions should appear",
  );
});

/* ------------------- the primitive every send path now uses ------------------ */

test("resolveOutboundTarget hands back consent with the target", { skip }, async () => {
  // The voice booking-link function used to text a raw phone number with no row
  // behind it and no consent read at all. It now resolves through this, so the
  // consent state must travel WITH the target — a caller that has to ask for it
  // separately is a caller that can forget to.
  const t = await resolveOutboundTarget(db, { tenantId, phoneE164: phone, create: false });
  assert.ok(t, "an existing contact must resolve");
  assert.equal(t.contactId, contactId);
  assert.equal(t.conversationId, conversationId);
  assert.equal(t.consent, "opted_in", "consent must come back, not be left for the caller to fetch");
  assert.equal(t.dnc, false);
});

test("resolveOutboundTarget refuses to invent a contact when create is false", { skip }, async () => {
  // This is the anti-abuse guard: a caller can ask the voice agent to text a
  // number that is not theirs. A number we were GIVEN only qualifies if that
  // person already belongs to this business.
  const stranger = `+1999555${String(Date.now()).slice(-4)}0`.slice(0, 15);
  const t = await resolveOutboundTarget(db, { tenantId, phoneE164: stranger, create: false });
  assert.equal(t, null, "a stranger's number must not resolve to a sendable target");

  const { data: leaked } = await db
    .from("contacts").select("id").eq("tenant_id", tenantId).eq("phone_e164", stranger);
  assert.equal(leaked.length, 0, "a refused lookup must not create a contact row");
});

test("resolveOutboundTarget CREATES a first-time caller's contact", { skip }, async () => {
  // The path that had never been exercised. The first version used
  // `.upsert(..., { onConflict: "tenant_id,phone_e164" })`, but that index is
  // PARTIAL (`where phone_e164 is not null`) and PostgREST cannot target a
  // partial index — so this threw for every genuinely new contact, and the
  // earlier tests all passed because their contact already existed.
  const fresh = `+1999557${String(Date.now()).slice(-4)}`;
  const t = await resolveOutboundTarget(db, { tenantId, phoneE164: fresh, create: true });
  assert.ok(t, "a first-time caller must get a contact and a conversation");
  assert.equal(t.consent, "unknown", "a new contact is not opted out");
  assert.equal(t.dnc, false);

  // Idempotent: calling again returns the SAME rows, never a duplicate contact.
  const again = await resolveOutboundTarget(db, { tenantId, phoneE164: fresh, create: true });
  assert.equal(again.contactId, t.contactId);
  assert.equal(again.conversationId, t.conversationId);

  await db.from("conversations").delete().eq("id", t.conversationId);
  await db.from("contacts").delete().eq("id", t.contactId);
});

test("resolveOutboundTarget finds a contact from a NATIONAL-format number", { skip }, async () => {
  // The voice agent fills `phone_number` from whatever the caller says aloud,
  // so it arrives as bare national digits ("six four six, …") while contacts
  // are keyed on full international digits. Comparing raw digits missed the
  // row and refused a real client their booking link.
  const national = phone.replace(/^\+1/, "");
  assert.notEqual(national, phone, "fixture must be a +1 number for this to mean anything");

  const t = await resolveOutboundTarget(db, { tenantId, phoneE164: national, create: false });
  assert.ok(t, "a national-format number must resolve to the SAME contact");
  assert.equal(t.contactId, contactId);

  // ...and formatting noise must not matter either.
  const messy = ` ${phone.slice(2, 5)}-${phone.slice(5, 8)}.${phone.slice(8)} `;
  const t2 = await resolveOutboundTarget(db, { tenantId, phoneE164: messy, create: false });
  assert.equal(t2?.contactId, contactId, "punctuation changed the identity");
});

test("resolveOutboundTarget refuses a number that cannot be a phone number", { skip }, async () => {
  assert.equal(await resolveOutboundTarget(db, { tenantId, phoneE164: "123", create: true }), null);
  assert.equal(await resolveOutboundTarget(db, { tenantId, phoneE164: "", create: true }), null);
});

test("resolveOutboundTarget reports an opt-out rather than hiding it", { skip }, async () => {
  await db.from("contacts")
    .update({ consent: "opted_out", dnc: true })
    .eq("id", contactId);
  const t = await resolveOutboundTarget(db, { tenantId, phoneE164: phone, create: true });
  assert.equal(t.consent, "opted_out");
  assert.equal(t.dnc, true);
  // Restored so the escalation test below sees the state it expects.
  await db.from("contacts").update({ consent: "opted_in", dnc: false }).eq("id", contactId);
});

test("'opt_out' is an accepted escalation reason", { skip }, async () => {
  // The edge raises this one; a CHECK violation would make the escalation fail
  // silently inside pgSafe and the owner would never be told.
  const { error } = await db.from("escalations").insert({
    tenant_id: tenantId, conversation_id: conversationId,
    reason: "opt_out", details: "probe", state: "open",
  });
  assert.equal(error, null, error?.message);
});
