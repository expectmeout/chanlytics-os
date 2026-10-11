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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
/** A migration's text, by its number, its lines ended as git keeps them (a Windows checkout ends them in CRLF). */
const migration = (n) => {
  const dir = path.join(ROOT, "supabase/migrations");
  const file = path.join(
    dir,
    fs.readdirSync(dir).find((f) => f.startsWith(`${n}_`)),
  );
  return fs.readFileSync(file, "utf8").split("\r\n").join("\n");
};
/** A function's body as a migration writes it: from `as $$` after its header to the next `$$`, as pg_proc keeps it. */
const bodyIn = (src, header) => {
  const at = src.indexOf(header);
  assert.ok(at >= 0, `no ${header}`);
  const open = src.indexOf("as $$", at) + "as $$".length;
  return src.slice(open, src.indexOf("$$", open));
};

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

test("00361 re-creates ingest_inbound whole: 00344's body with the replay gate moved above the answers, and nothing else", () => {
  // The database runs 00361's body (reach-out-replies/never-again.db.test.mjs, LATER); this holds it to 00344's.
  const header = "create or replace function public.ingest_inbound(";
  const now = bodyIn(migration("00361"), header);
  const once = (text, what) => assert.equal(now.split(text).length, 2, `00361 says this once: ${what}`);
  // The person's row is locked where the answer used to be written, so the locks keep their order.
  const lock =
    "  -- A STOP or a START is written below, once the message is known to be new (00361). The person's row is locked\n" +
    "  -- here, where that write used to be, so the person, the thread and the message are still locked in that order.\n" +
    "  if p_opt_out or p_opt_in then\n" +
    "    perform 1 from contacts where id = v_contact_id for no key update;\n" +
    "  end if;\n\n";
  once(lock, "the lock");
  // The thread's recency and the message's own insert, the replay gate, now stand before the answers.
  const gate = now.slice(now.indexOf("  -- monotone recency"), now.indexOf("  if p_opt_out then\n"));
  once(gate, "the gate");
  once(lock + gate, "the lock, then the gate");
  // A message held already is told the consent that stands, as it was told it after the answers before.
  const told =
    "    -- Held already: its answer was written when it was kept, and whatever the person has said since stands. What\n" +
    "    -- the caller is told is their consent as it is now.\n" +
    "    select consent, dnc into v_consent, v_dnc from contacts where id = v_contact_id;\n";
  assert.equal(gate.split(told).length, 2, "the held message is told its consent once");
  const gateWas = gate
    .replace(told, "")
    .replace("short-circuits BEFORE any\n  -- consent/window/", "short-circuits BEFORE any\n  -- window/");
  const answered = "  select consent, dnc into v_consent, v_dnc from contacts where id = v_contact_id;\n\n";
  const without = now.replace(lock + gate, "");
  assert.equal(without.split(answered).length, 2, "00361 tells the caller their consent once after the answers");
  assert.equal(without.replace(answered, answered + gateWas), bodyIn(migration("00344"), header));
});
