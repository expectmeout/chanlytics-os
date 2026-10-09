/**
 * A delivery taken in again changes nobody's consent (00361), on a real Postgres. ingest_inbound wrote a STOP's no and
 * a START's yes before its replay gate (the message's own insert), so a message it already held wrote its answer
 * again: START, STOP, then the START's job run late (a text is taken in twice by design, its door and then the job that
 * answers it) opted the person back in and lifted do-not-contact, and an old STOP taken in again after a START held
 * them out. Now only the call that kept the message writes its answer, and a held one is told the consent that stands.
 * The repository's half (a START's channel, a yes to offers) is run beside this file over a database in memory.
 *
 * Runs against the database `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes customers and their answers"
      : false;

let db;
let T;
let people = 0;
const RUN = Date.now().toString(36);

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("tenants")
    .insert({ slug: `taken-in-again-${RUN}`, name: "Taken in again" })
    .select("id")
    .single();
  assert.equal(error, null, error?.message);
  T = data.id;
});

after(async () => {
  if (skip || !T) return;
  await db.from("tenants").delete().eq("id", T);
});

/** A customer of this workspace, by the number they text from. */
function customer() {
  people += 1;
  return `+1555010${String(people).padStart(4, "0")}`;
}

/** One text taken in, as the door and the job that answers it each take it in: the function's answer. */
async function text(phone, id, words, { optOut = false, optIn = false } = {}) {
  const { data, error } = await db.rpc("ingest_inbound", {
    p_tenant_id: T,
    p_channel: "sms",
    p_identity_external_id: phone,
    p_phone_e164: phone,
    p_wa_profile_name: null,
    p_message_external_id: `${RUN}-${id}`,
    p_type: "text",
    p_body: words,
    p_channel_ts: new Date().toISOString(),
    p_media: null,
    p_meta: {},
    p_opt_out: optOut,
    p_opt_in: optIn,
  });
  assert.equal(error, null, error?.message);
  return data;
}

async function standing(contactId) {
  const { data, error } = await db.from("contacts").select("consent, dnc").eq("id", contactId).single();
  assert.equal(error, null, error?.message);
  return data;
}

async function ledger(contactId) {
  const { data, error } = await db
    .from("events")
    .select("data")
    .eq("tenant_id", T)
    .eq("kind", "contact.consent_changed")
    .eq("subject_id", contactId)
    .order("created_at", { ascending: true });
  assert.equal(error, null, error?.message);
  return data.map((e) => [e.data.consent, e.data.message_external_id]);
}

test("START, STOP, then the START taken in again: they stay stopped, and are told so", { skip }, async () => {
  const phone = customer();
  const start = await text(phone, "start-1", "START", { optIn: true });
  assert.deepEqual([start.is_new, start.consent, start.dnc], [true, "opted_in", false]);
  const stop = await text(phone, "stop-1", "STOP", { optOut: true });
  assert.deepEqual(
    [stop.is_new, stop.consent, stop.dnc],
    [true, "opted_out", true],
    "a new STOP is written, and read back in the same call",
  );

  // The START's job, run late: the whole inbound phase again, with Twilio's own fields.
  const late = await text(phone, "start-1", "START", { optIn: true });
  assert.equal(late.is_new, false, "the function knows the message");
  assert.deepEqual(
    [late.consent, late.dnc],
    ["opted_out", true],
    "the caller is told the consent that stands, not the one the old message carried",
  );
  assert.deepEqual(
    await standing(start.contact_id),
    { consent: "opted_out", dnc: true },
    "REGRESSION: a START taken in again opted the person back in and lifted do-not-contact after their STOP",
  );
  assert.deepEqual(
    await ledger(start.contact_id),
    [
      ["opted_in", `${RUN}-start-1`],
      ["opted_out", `${RUN}-stop-1`],
    ],
    "the ledger holds one answer per message, and none for the one taken in again",
  );
});

test("STOP, START, then the STOP taken in again: they stay in", { skip }, async () => {
  const phone = customer();
  const stop = await text(phone, "stop-2", "STOP", { optOut: true });
  assert.deepEqual([stop.consent, stop.dnc], ["opted_out", true]);
  const start = await text(phone, "start-2", "START", { optIn: true });
  assert.deepEqual([start.consent, start.dnc], ["opted_in", false]);

  const again = await text(phone, "stop-2", "STOP", { optOut: true });
  assert.deepEqual([again.is_new, again.consent, again.dnc], [false, "opted_in", false]);
  assert.deepEqual(
    await standing(stop.contact_id),
    { consent: "opted_in", dnc: false },
    "REGRESSION: an old STOP taken in again held out a person who had said START since",
  );
  assert.deepEqual(await ledger(stop.contact_id), [
    ["opted_out", `${RUN}-stop-2`],
    ["opted_in", `${RUN}-start-2`],
  ]);
});

test("a message taken in twice with nothing in between changes nothing the second time either", { skip }, async () => {
  const phone = customer();
  const first = await text(phone, "stop-3", "STOP", { optOut: true });
  const second = await text(phone, "stop-3", "STOP", { optOut: true });
  assert.deepEqual(
    [first.is_new, second.is_new, second.message_id],
    [true, false, first.message_id],
    "one message, kept once",
  );
  assert.deepEqual([second.consent, second.dnc], ["opted_out", true]);
  assert.deepEqual(await ledger(first.contact_id), [["opted_out", `${RUN}-stop-3`]]);
});
