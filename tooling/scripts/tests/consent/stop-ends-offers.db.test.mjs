/**
 * A stop ends the yes to offers -- on a real database (00322; the 4 Oct wiring review, decision D3).
 *
 * The rule is a trigger on the change itself, so it is proved where it lives: each of the four doors that record a no
 * to every message (their own STOP through ingest_inbound, the unsubscribe page's stop_all_messages, a member's
 * set_contact_consent, the carrier's report through packages/db recordCarrierOptOut) leaves the answer about offers at
 * not asked, with the source contracts names, the channels the yes covered emptied and one ledger entry that says so.
 * A START after it restores messages about their visit and nothing more; a no to offers stays a no; a person never
 * asked is left alone; and the migration's last statement does the same for a stop already on record. A trigger's body
 * is exactly what reading source cannot prove, so these run against Postgres. Skipped without a local database (the
 * member's door also needs SUPABASE_ANON_KEY); never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { STOP_ENDED_OFFERS_SOURCE } from "../../../../packages/contracts/src/people/person-consent.ts";
import { recordCarrierOptOut } from "../../../../packages/db/src/repositories/ingest.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const MIGRATION = path.join(ROOT, "supabase", "migrations", "00322_a_stop_ends_the_yes_to_offers.sql");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces and customers"
      : false;
const skipMember = skip || (!ANON ? "no SUPABASE_ANON_KEY in env: the member's session needs it" : false);

/** One statement through `supabase db query --local`. */
function run(sql) {
  const r = spawnSync(CLI, ["db", "query", "--local", "--output-format", "json", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  if (r.status !== 0) throw new Error(`supabase db query exited ${r.status}: ${(r.stderr || r.stdout).slice(-800)}`);
}

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

let db;
let tenantId;
let owner;
const users = [];
let messages = 0;
let phones = 0;
/** A made-up number (555-01xx), fresh in this workspace. */
const phone = () => `+15125550${100 + ++phones}`;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `stop-ends-offers-${Date.now()}`, name: "Stop ends offers" })
      .select("id")
      .single(),
  ).id;
  if (skipMember) return;
  const email = `stop-ends-offers-${Date.now()}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenantId, user_id: made.data.user.id, role: "owner" }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  owner = client;
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("events").delete().eq("tenant_id", tenantId);
  await db.from("tenants").delete().eq("id", tenantId);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

/** A customer's message through the inbound door (the edge's): the person, their thread and the message. */
async function inbound(p, over = {}) {
  messages += 1;
  return ok(
    await db.rpc("ingest_inbound", {
      p_tenant_id: tenantId,
      p_channel: "whatsapp",
      p_identity_external_id: p,
      p_phone_e164: p,
      p_wa_profile_name: null,
      p_message_external_id: `wamid.stop-ends-offers-${Date.now()}-${messages}`,
      p_type: "text",
      p_body: "hello",
      p_channel_ts: new Date().toISOString(),
      p_media: null,
      p_meta: {},
      p_opt_out: false,
      p_opt_in: false,
      ...over,
    }),
  );
}

/** Their own YES OFFERS, as the edge records it. */
const yesToOffers = async (contactId) =>
  ok(
    await db.rpc("set_marketing_consent", {
      p_tenant_id: tenantId,
      p_contact_id: contactId,
      p_consent: "opted_in",
      p_source: "customer_message",
      p_note: null,
      p_evidence: { channel: "whatsapp", words: "YES OFFERS" },
    }),
  );

/** A person who wrote in, said yes to messages and yes to offers: the phone and the row's id. */
async function subscriber() {
  const p = phone();
  const id = (await inbound(p, { p_body: "START", p_opt_in: true })).contact_id;
  await yesToOffers(id);
  const row = await answers(id);
  assert.deepEqual(
    [row.consent, row.marketing_consent, row.marketing_channels],
    ["opted_in", "opted_in", ["whatsapp"]],
    "the person starts with both yeses",
  );
  return { p, id };
}

const answers = async (contactId) =>
  ok(
    await db
      .from("contacts")
      .select("consent, dnc, consent_source, marketing_consent, marketing_consent_source, marketing_channels")
      .eq("id", contactId)
      .single(),
  );

/** The ledger's entries that say a stop ended this person's yes to offers. */
const endings = async (contactId) =>
  ok(
    await db
      .from("events")
      .select("data")
      .eq("tenant_id", tenantId)
      .eq("kind", "contact.consent_changed")
      .eq("subject_id", contactId),
  )
    .map((e) => e.data)
    .filter((d) => d.purpose === "marketing" && d.source === STOP_ENDED_OFFERS_SOURCE);

/** The yes is gone, the stop stands, and the ledger says both once. */
async function assertEnded(contactId, stoppedBy) {
  const row = await answers(contactId);
  assert.deepEqual(
    [row.consent, row.dnc, row.marketing_consent, row.marketing_consent_source, row.marketing_channels],
    ["opted_out", true, "unknown", STOP_ENDED_OFFERS_SOURCE, []],
    "the stop stands, the answer about offers is back to not asked, and the yes covers no channel",
  );
  const said = await endings(contactId);
  assert.equal(said.length, 1, "one ledger entry says the yes ended");
  assert.deepEqual(
    [said[0].consent, said[0].previous, said[0].stopped_by],
    ["unknown", "opted_in", stoppedBy],
    "what it was, what it is, and which stop ended it",
  );
}

test(
  "their own STOP ends the yes to offers, and a START brings back messages about their visit alone",
  { skip },
  async () => {
    const { p, id } = await subscriber();
    await inbound(p, { p_body: "STOP", p_opt_out: true });
    await assertEnded(id, "customer_message");

    // A second STOP is no second ending.
    await inbound(p, { p_body: "STOP", p_opt_out: true });
    assert.equal((await endings(id)).length, 1);

    await inbound(p, { p_body: "START", p_opt_in: true });
    const back = await answers(id);
    assert.deepEqual(
      [back.consent, back.dnc, back.marketing_consent, back.marketing_consent_source, back.marketing_channels],
      ["opted_in", false, "unknown", STOP_ENDED_OFFERS_SOURCE, []],
      "a START is a yes to messages about their visit: the yes to offers does not come back with it",
    );

    // Only a new yes of their own turns offers on again.
    await yesToOffers(id);
    const again = await answers(id);
    assert.deepEqual(
      [again.marketing_consent, again.marketing_consent_source, again.marketing_channels],
      ["opted_in", "customer_message", ["whatsapp"]],
    );
  },
);

test("a no to offers stays a no, and a person never asked is left as they are", { skip }, async () => {
  const p = phone();
  const said = (await inbound(p)).contact_id;
  ok(
    await db.rpc("set_marketing_consent", {
      p_tenant_id: tenantId,
      p_contact_id: said,
      p_consent: "opted_out",
      p_source: "customer_message",
      p_evidence: { channel: "whatsapp", words: "no offers please" },
    }),
  );
  await inbound(p, { p_body: "STOP", p_opt_out: true });
  const no = await answers(said);
  assert.deepEqual(
    [no.consent, no.marketing_consent, no.marketing_consent_source],
    ["opted_out", "opted_out", "customer_message"],
    "their no to offers is theirs, and is not reset by a later stop",
  );
  assert.equal((await endings(said)).length, 0);

  const q = phone();
  const never = (await inbound(q)).contact_id;
  await inbound(q, { p_body: "STOP", p_opt_out: true });
  const row = await answers(never);
  assert.deepEqual([row.consent, row.marketing_consent, row.marketing_consent_source], ["opted_out", "unknown", null]);
  assert.equal((await endings(never)).length, 0);
});

test("the unsubscribe page's stop for everything ends it", { skip }, async () => {
  const { id } = await subscriber();
  ok(await db.rpc("stop_all_messages", { p_tenant_id: tenantId, p_contact_id: id, p_message_id: null }));
  await assertEnded(id, "customer_message");
});

test("the carrier's report of a STOP we never heard ends it", { skip }, async () => {
  const { id } = await subscriber();
  assert.equal(
    await recordCarrierOptOut(db, { tenantId, contactId: id, channel: "sms", previous: "opted_in" }),
    true,
    "the report is recorded",
  );
  await assertEnded(id, "carrier");
});

test("a no a member records ends it, and their reset to not asked does not", { skip: skipMember }, async () => {
  const { id } = await subscriber();
  ok(await owner.rpc("set_contact_consent", { p_contact_id: id, p_consent: "unknown", p_source: "operator" }));
  assert.equal((await answers(id)).marketing_consent, "opted_in", "a reset of the other answer is not a stop");

  ok(await owner.rpc("set_contact_consent", { p_contact_id: id, p_consent: "opted_out", p_source: "phone" }));
  await assertEnded(id, "phone");
});

test(
  "a stop already on record when the rule arrived: the migration's last statement ends that yes too",
  { skip },
  async () => {
    // The state from before the rule, made the two ways the trigger does not see: the stop first, while there is no yes
    // to end, then the yes written onto the row without a change of consent.
    const p = phone();
    const id = (await inbound(p)).contact_id;
    await inbound(p, { p_body: "STOP", p_opt_out: true });
    ok(
      await db
        .from("contacts")
        .update({ marketing_consent: "opted_in", marketing_consent_source: "form", marketing_channels: ["whatsapp"] })
        .eq("id", id),
    );
    assert.equal((await endings(id)).length, 0);

    const text = fs.readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n");
    const from = text.indexOf("with ended as (");
    assert.ok(from > 0, "the statement for the stops already on record is in the migration");
    const statement = text.slice(from).trim().replace(/;\s*$/, "");
    run(statement);
    const row = await answers(id);
    assert.deepEqual(
      [row.consent, row.marketing_consent, row.marketing_consent_source, row.marketing_channels],
      ["opted_out", "unknown", STOP_ENDED_OFFERS_SOURCE, []],
    );
    const said = await endings(id);
    assert.equal(said.length, 1);
    assert.equal(said[0].via, "migration_00322");

    // Re-runnable: a second run finds nobody.
    run(statement);
    assert.equal((await endings(id)).length, 1);
  },
);
