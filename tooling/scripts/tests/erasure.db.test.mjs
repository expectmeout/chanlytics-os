/**
 * An erased row holds no answer about anybody.
 *
 * erase_contact marks a customer's row rather than deleting it. 00095 wrote the
 * function that clears their answer about offers from that row, and nothing
 * called it, so every tombstone kept the answer, where it came from and when.
 * 00101 hangs it on the erasure itself, the way 00044 takes an erased person
 * out of every list. A trigger is exactly what reading source cannot see, so
 * these run against a real database.
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
  const { data, error } = await db.from("tenants").insert({ slug: `erasure-${Date.now()}`, name: "Erasure" }).select("id").single();
  if (error) throw new Error(error.message);
  tenantId = data.id;
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("tenants").delete().eq("id", tenantId);
});

async function customer(fields) {
  phones += 1;
  const { data, error } = await db.from("contacts")
    .insert({ tenant_id: tenantId, phone_e164: `+1555${String(phones).padStart(7, "0")}`, ...fields })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function answerOf(id) {
  const { data, error } = await db.from("contacts")
    .select("marketing_consent, marketing_consent_source, marketing_consent_updated_at")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

test("erasing a customer who said yes to offers leaves no answer on the row", { skip }, async () => {
  const saidYesAt = new Date(Date.now() - 86_400_000).toISOString();
  const id = await customer({ marketing_consent: "opted_in", marketing_consent_source: "form", marketing_consent_updated_at: saidYesAt });

  const { error } = await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", id);
  assert.equal(error, null);

  const left = await answerOf(id);
  assert.equal(left.marketing_consent, "unknown", "the yes is gone");
  assert.equal(left.marketing_consent_source, "erasure", "and the row says what took it, not where it came from");
  assert.notEqual(left.marketing_consent_updated_at, saidYesAt, "nor when it was given");
});

test("a customer who is not erased keeps their answer through any other change", { skip }, async () => {
  const id = await customer({ marketing_consent: "opted_in", marketing_consent_source: "form" });
  const { error } = await db.from("contacts").update({ display_name: "Renamed" }).eq("id", id);
  assert.equal(error, null);
  const kept = await answerOf(id);
  assert.equal(kept.marketing_consent, "opted_in");
  assert.equal(kept.marketing_consent_source, "form");
});
