/**
 * A texted answer keeps its evidence -- on a real database.
 *
 * 00110 rewrites the two doors a texted answer goes through: ingest_inbound's
 * consent events carry the channel, the provider's message id and the words;
 * set_marketing_consent takes p_evidence and merges it into its event. A
 * function body is exactly what reading source cannot prove, so these run
 * against Postgres, beside the erasure suite that already touches the same
 * columns. Skipped without a local database; the database workflow has one.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite writes customers"
    : false;

let db;
let tenantId;
let phones = 0;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await db.from("tenants").insert({ slug: `consent-evidence-${Date.now()}`, name: "Consent evidence" }).select("id").single();
  if (error) throw new Error(error.message);
  tenantId = data.id;
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("tenants").delete().eq("id", tenantId);
});

function phone() {
  phones += 1;
  return `+1555${String(phones).padStart(7, "0")}`;
}

async function historyOf(contactId) {
  const { data, error } = await db.from("events").select("data, created_at").eq("tenant_id", tenantId)
    .eq("kind", "contact.consent_changed").eq("subject_id", contactId).order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data.map((e) => e.data);
}

async function inbound(p, over = {}) {
  const { data, error } = await db.rpc("ingest_inbound", {
    p_tenant_id: tenantId, p_channel: "sms", p_identity_external_id: p, p_phone_e164: p, p_wa_profile_name: null,
    p_message_external_id: `SM${Date.now()}${phones}`, p_type: "text", p_body: "hello", p_channel_ts: new Date().toISOString(),
    p_media: null, p_meta: {}, p_opt_out: false, p_opt_in: false, ...over,
  });
  if (error) throw new Error(error.message);
  return data;
}

test("START and STOP by text leave the channel, the message id and the words on the ledger row", { skip }, async () => {
  const p = phone();
  const yes = await inbound(p, { p_body: "START", p_message_external_id: "SM-yes-1", p_opt_in: true });
  const no = await inbound(p, { p_body: "STOP please", p_message_external_id: "SM-no-1", p_opt_out: true });
  assert.equal(yes.consent, "opted_in");
  assert.equal(no.consent, "opted_out");
  const rows = await historyOf(yes.contact_id);
  assert.deepEqual(rows.map((d) => [d.consent, d.source, d.channel, d.message_external_id, d.words]), [
    ["opted_in", "customer_message", "sms", "SM-yes-1", "START"],
    ["opted_out", "customer_message", "sms", "SM-no-1", "STOP please"],
  ]);
  // A long message is kept to eighty characters of evidence, not the whole text.
  const long = "START ".repeat(40);
  const again = await inbound(p, { p_body: long, p_message_external_id: "SM-yes-2", p_opt_in: true });
  const last = (await historyOf(again.contact_id)).at(-1);
  assert.equal(last.words.length, 80);
  assert.equal(last.words, long.slice(0, 80));
});

test("the offers door takes evidence and merges it into its event; without it the event is as it was", { skip }, async () => {
  const p = phone();
  const first = await inbound(p);
  const { error: e1 } = await db.rpc("set_marketing_consent", {
    p_tenant_id: tenantId, p_contact_id: first.contact_id, p_consent: "opted_in", p_source: "customer_message", p_note: null,
    p_evidence: { channel: "whatsapp", message_external_id: "wamid.HBg1", words: "YES OFFERS" },
  });
  assert.equal(e1, null);
  const { error: e2 } = await db.rpc("set_marketing_consent", {
    p_tenant_id: tenantId, p_contact_id: first.contact_id, p_consent: "opted_out", p_source: "phone",
  });
  assert.equal(e2, null, "the five-argument call still resolves: p_note and p_evidence default");
  const rows = await historyOf(first.contact_id);
  assert.deepEqual(rows.map((d) => [d.purpose, d.consent, d.source, d.channel ?? null, d.message_external_id ?? null, d.words ?? null]), [
    ["marketing", "opted_in", "customer_message", "whatsapp", "wamid.HBg1", "YES OFFERS"],
    ["marketing", "opted_out", "phone", null, null, null],
  ]);
  const { data: row, error } = await db.from("contacts").select("marketing_consent, marketing_consent_source, dnc, consent").eq("id", first.contact_id).single();
  assert.equal(error, null);
  assert.deepEqual(row, { marketing_consent: "opted_out", marketing_consent_source: "phone", dnc: false, consent: "unknown" }, "the offers door never touches dnc or the visit answer");
  // The written-yes rule survived the rewrite.
  const { error: spoken } = await db.rpc("set_marketing_consent", { p_tenant_id: tenantId, p_contact_id: first.contact_id, p_consent: "opted_in", p_source: "phone" });
  assert.match(spoken?.message ?? "", /in writing/);
});
