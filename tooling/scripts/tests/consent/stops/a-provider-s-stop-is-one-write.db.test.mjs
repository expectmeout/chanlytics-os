/**
 * A provider's stop and its event are one write, on a real database (record_provider_stop, 00380).
 *
 * The carrier's 21610 on a text (at the wire, core deliver.ts; told late, the status door) and WhatsApp's 131050 on an
 * offer (the receipts door) were recorded as a row and then an event through emitEvent, which logs a lost write and
 * carries on: an event that was lost left the history silent and the channels the answer covered (00297's trigger
 * reads the event) stale. The three repository functions call the one door now, and what only Postgres can prove is
 * held here: the row and its event land together, in the shape every consent change has; a second report of the same
 * stop changes nothing and writes no event; the channels the yes covered are emptied by the same write; a person
 * already stopped, or erased, is left as they are; and the door is the service role's alone. The in-memory model the
 * doors' own suites run over (_fake-db.mjs) is held to these cases. Skipped without a local database; never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  CARRIER_CONSENT_SOURCE,
  WHATSAPP_CONSENT_SOURCE,
} from "../../../../../packages/contracts/src/people/person-consent.ts";
import { ingestInbound, recordCarrierOptOut } from "../../../../../packages/db/src/repositories/ingest.ts";
import {
  recordLateCarrierOptOut,
  recordWhatsAppOffersStop,
} from "../../../../../packages/db/src/repositories/campaigns/offers-answer.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
// The database the CLI is pointed at: the one the environment names when it is on this machine, else the stack
// `supabase start` runs here. psql, with no CLI, takes the same database.
const DB_URL = process.env.SUPABASE_DB_URL;
const LOCAL_DB = DB_URL && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/.test(DB_URL) ? DB_URL : null;
const CLI_TARGET = LOCAL_DB
  ? ["--db-url", `${LOCAL_DB}${LOCAL_DB.includes("?") ? "&" : "?"}sslmode=disable`]
  : ["--local"];
const PSQL_TARGET = LOCAL_DB ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces and customers"
      : false;

const ok = (res, what = "query") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};

let db;
let tenantId;
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let serial = 0;
/** A made-up number (555-01xx), fresh in this workspace. */
const phone = () => `+1555010${String(++serial).padStart(4, "0")}`;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `provider-stop-${RUN}`, name: "Provider stop" })
      .select("id")
      .single(),
    "workspace",
  ).id;
});

after(async () => {
  if (skip || !tenantId) return;
  // events has no foreign key to tenants (it is partitioned), so the workspace's rows go first or they outlive it.
  await db.from("events").delete().eq("tenant_id", tenantId);
  await db.from("tenants").delete().eq("id", tenantId);
});

/** A customer's START through the inbound door, on a wire: the person, with their yes covering that wire. */
async function started(channel) {
  const p = phone();
  const out = await ingestInbound(db, {
    tenantId,
    channel,
    identityExternalId: channel === "whatsapp" ? p.slice(1) : p,
    phoneE164: p,
    waProfileName: null,
    messageExternalId: `stop-${RUN}-${++serial}`,
    type: "text",
    body: "START",
    channelTs: new Date().toISOString(),
    meta: {},
    optOut: false,
    optIn: true,
  });
  return { phone: p, contactId: out.contact_id, conversationId: out.conversation_id };
}

/** A text of ours to the person, as the send door leaves it: the row the carrier's callback names. */
async function textOf(person, over = {}) {
  const external = `SM${RUN}${++serial}`;
  ok(
    await db.from("messages").insert({
      tenant_id: tenantId,
      conversation_id: person.conversationId,
      contact_id: person.contactId,
      channel: "sms",
      direction: "outbound",
      sender: "ai",
      type: "text",
      body: "We open at 9",
      external_id: external,
      status: "sent",
      ...over,
    }),
    "text",
  );
  return external;
}

const answers = async (contactId) =>
  ok(
    await db
      .from("contacts")
      .select(
        "consent, dnc, consent_source, consent_updated_at, consent_channels, marketing_consent, marketing_consent_source, marketing_consent_updated_at, marketing_channels",
      )
      .eq("id", contactId)
      .single(),
    "contact",
  );

/** The ledger's consent rows about the person, oldest first. */
const changes = async (contactId) =>
  ok(
    await db
      .from("events")
      .select("category, version, subject_type, subject_id, data")
      .eq("tenant_id", tenantId)
      .eq("kind", "contact.consent_changed")
      .eq("subject_id", contactId)
      .order("created_at"),
    "events",
  );

test(
  "the carrier's stop at the wire: the row and its event land together, the channels the yes covered go with them, and a second report writes nothing",
  { skip },
  async () => {
    const who = await started("sms");
    const before = await answers(who.contactId);
    assert.deepEqual([before.consent, before.consent_channels], ["opted_in", ["sms"]], "their yes, by text");

    assert.equal(await recordCarrierOptOut(db, { tenantId, contactId: who.contactId, channel: "sms" }), true);
    const row = await answers(who.contactId);
    assert.deepEqual(
      [row.consent, row.dnc, row.consent_source, row.consent_channels],
      ["opted_out", true, CARRIER_CONSENT_SOURCE, []],
      "the three consent columns and do-not-contact, as ingest_inbound writes a STOP it heard; the yes covers no channel",
    );
    assert.ok(row.consent_updated_at, "stamped");
    const said = (await changes(who.contactId)).filter((e) => e.data.source === CARRIER_CONSENT_SOURCE);
    assert.deepEqual(
      said.map((e) => [e.category, e.version, e.subject_type, e.subject_id, e.data]),
      [
        [
          "contact",
          1,
          "contact",
          who.contactId,
          { consent: "opted_out", previous: "opted_in", source: CARRIER_CONSENT_SOURCE, channel: "sms" },
        ],
      ],
      "one ledger row, in the shape every consent change has, with the row's own previous answer",
    );

    // The same report again (the wire's refusal, then the callback's): the person is left as they are.
    assert.equal(await recordCarrierOptOut(db, { tenantId, contactId: who.contactId, channel: "sms" }), false);
    assert.equal(
      (await changes(who.contactId)).filter((e) => e.data.source === CARRIER_CONSENT_SOURCE).length,
      1,
      "no second row",
    );
  },
);

test(
  "told late by the status callback: the same record for the text the callback names, once, and never over a newer answer or an erased person",
  { skip },
  async () => {
    const who = await started("sms");
    const text = await textOf(who);
    assert.equal(await recordLateCarrierOptOut(db, { tenantId, externalId: text }), "recorded");
    const row = await answers(who.contactId);
    assert.deepEqual([row.consent, row.dnc, row.consent_source], ["opted_out", true, CARRIER_CONSENT_SOURCE]);
    assert.deepEqual(
      (await changes(who.contactId)).filter((e) => e.data.source === CARRIER_CONSENT_SOURCE).map((e) => e.data),
      [{ consent: "opted_out", previous: "opted_in", source: CARRIER_CONSENT_SOURCE, channel: "sms" }],
      "the shape the send door's row has",
    );
    assert.equal(await recordLateCarrierOptOut(db, { tenantId, externalId: text }), "already_stopped");
    assert.equal(await recordLateCarrierOptOut(db, { tenantId, externalId: "SM-nobody-knows" }), "not_our_text");

    // They sent START after the text was written: a report said again must not stop them a second time.
    const back = await started("sms");
    const older = await textOf(back, { created_at: new Date(Date.now() - 60_000).toISOString() });
    assert.equal(await recordLateCarrierOptOut(db, { tenantId, externalId: older }), "newer_answer");
    assert.equal((await answers(back.contactId)).consent, "opted_in");

    // A person who was erased is left as they are, and the door writes nothing for them either way.
    const gone = await started("sms");
    const theirs = await textOf(gone);
    ok(await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", gone.contactId), "erase");
    assert.equal(await recordLateCarrierOptOut(db, { tenantId, externalId: theirs }), "no_person");
    assert.equal(await recordCarrierOptOut(db, { tenantId, contactId: gone.contactId, channel: "sms" }), false);
    assert.deepEqual(
      (await changes(gone.contactId)).filter((e) => e.data.source === CARRIER_CONSENT_SOURCE),
      [],
    );
  },
);

test(
  "WhatsApp's refusal of an offer is their no to offers: the answer, its channels and its event in one write, with the message named, once",
  { skip },
  async () => {
    const who = await started("whatsapp");
    ok(
      await db.rpc("set_marketing_consent", {
        p_tenant_id: tenantId,
        p_contact_id: who.contactId,
        p_consent: "opted_in",
        p_source: "customer_message",
        p_note: null,
        p_evidence: { channel: "whatsapp", words: "YES OFFERS" },
      }),
      "yes to offers",
    );
    assert.deepEqual([(await answers(who.contactId)).marketing_channels], [["whatsapp"]]);
    const offer = `wamid.offer-${RUN}-${++serial}`;
    ok(
      await db.from("messages").insert({
        tenant_id: tenantId,
        conversation_id: who.conversationId,
        contact_id: who.contactId,
        channel: "whatsapp",
        direction: "outbound",
        sender: "system",
        type: "template",
        body: "This month's offer",
        external_id: offer,
        status: "sent",
      }),
      "offer",
    );

    assert.equal(await recordWhatsAppOffersStop(db, { tenantId, externalId: offer }), true);
    const row = await answers(who.contactId);
    assert.deepEqual(
      [row.consent, row.dnc, row.marketing_consent, row.marketing_consent_source, row.marketing_channels],
      ["opted_in", false, "opted_out", WHATSAPP_CONSENT_SOURCE, []],
      "a no to offers with WhatsApp as its source and no channel left; messages about their visit untouched",
    );
    assert.ok(row.marketing_consent_updated_at, "stamped");
    const said = (await changes(who.contactId)).filter((e) => e.data.source === WHATSAPP_CONSENT_SOURCE);
    assert.deepEqual(
      said.map((e) => [e.category, e.version, e.data]),
      [
        [
          "contact",
          1,
          {
            purpose: "marketing",
            consent: "opted_out",
            previous: "opted_in",
            source: WHATSAPP_CONSENT_SOURCE,
            channel: "whatsapp",
            message_external_id: offer,
          },
        ],
      ],
      "the purpose named, the row's previous answer, and the message Meta refused",
    );
    // A second report of the same refusal, and a message nobody knows: nothing more is written.
    assert.equal(await recordWhatsAppOffersStop(db, { tenantId, externalId: offer }), false);
    assert.equal(await recordWhatsAppOffersStop(db, { tenantId, externalId: "wamid.nobody-knows" }), false);
    assert.equal((await changes(who.contactId)).filter((e) => e.data.source === WHATSAPP_CONSENT_SOURCE).length, 1);
  },
);

test("the door refuses a stop it does not know, and nobody but the service role may call it", { skip }, async () => {
  const who = await started("sms");
  const call = (over) =>
    db.rpc("record_provider_stop", {
      p_tenant_id: tenantId,
      p_contact_id: who.contactId,
      p_purpose: "conversational",
      p_channel: "sms",
      p_source: CARRIER_CONSENT_SOURCE,
      ...over,
    });
  assert.equal((await call({ p_purpose: "offers" })).error?.code, "22023", "a purpose it does not know");
  assert.equal((await call({ p_channel: " " })).error?.code, "22004", "no channel");
  assert.equal((await call({ p_source: null })).error?.code, "22004", "no source");
  assert.equal((await call({ p_tenant_id: null })).error?.code, "P0002", "no workspace");
  assert.equal((await answers(who.contactId)).consent, "opted_in", "and nothing was written");
  if (ANON) {
    const stranger = createClient(URL_, ANON, { auth: { persistSession: false } });
    const refused = await stranger.rpc("record_provider_stop", {
      p_tenant_id: tenantId,
      p_contact_id: who.contactId,
      p_purpose: "conversational",
      p_channel: "sms",
      p_source: CARRIER_CONSENT_SOURCE,
    });
    assert.equal(refused.error?.code, "42501", `a stranger: ${refused.error?.message}`);
  }
});

test("a stop that names another workspace's person changes nobody, there or here", { skip }, async () => {
  const who = await started("sms");
  const other = ok(
    await db
      .from("tenants")
      .insert({ slug: `provider-stop-other-${RUN}`, name: "Another" })
      .select("id")
      .single(),
    "workspace",
  ).id;
  try {
    const crossed = await db.rpc("record_provider_stop", {
      p_tenant_id: other,
      p_contact_id: who.contactId,
      p_purpose: "conversational",
      p_channel: "sms",
      p_source: CARRIER_CONSENT_SOURCE,
    });
    assert.equal(crossed.error, null, crossed.error?.message);
    assert.equal(crossed.data, false, "no person of that workspace answered");
    assert.equal((await answers(who.contactId)).consent, "opted_in", "the person is as they were");
    assert.deepEqual(
      (await changes(who.contactId)).filter((e) => e.data.source === CARRIER_CONSENT_SOURCE),
      [],
      "and no event was written for them",
    );
  } finally {
    await db.from("tenants").delete().eq("id", other);
  }
});

/**
 * A transaction on this machine's database that never commits (as the take-over's suite runs one): `body` runs in a DO
 * block that ends by raising what it `seen`, so everything it did, the trigger it made included, goes with it.
 */
function rolledBack(body) {
  const sql = `do $$ declare seen jsonb := '{}'; begin ${body} raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex'); end $$`;
  const opts = { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 };
  let r = spawnSync(CLI, ["db", "query", ...CLI_TARGET, sql], opts);
  if (r.error?.code === "ENOENT") r = spawnSync("psql", [PSQL_TARGET, "-v", "ON_ERROR_STOP=0", "-c", sql], opts);
  if (r.error)
    throw new Error(`could not run ${CLI} or psql (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  const said = [r.stdout, r.stderr]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join("\n");
  if (/not_this_database/.test(said))
    throw new Error(
      "the block reached a database that does not hold this suite's rows: point SUPABASE_DB_URL at the stack",
    );
  const seen = /seen (7b[0-9a-f]*)/.exec(said);
  if (!seen) throw new Error(`the block did not get to say what it saw: ${said.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

test(
  "an event the ledger cannot write takes the person's stop back with it: never stopped with the history silent",
  { skip },
  async () => {
    const who = await started("sms");
    const seen = rolledBack(`
    if not exists (select 1 from public.tenants where id = '${tenantId}') then
      raise exception 'not_this_database';
    end if;
    create function public.__stop_event_refused() returns trigger language plpgsql as $f$
    begin raise exception 'the ledger is unavailable'; end $f$;
    create trigger __stop_event_refused before insert on public.events
      for each row when (new.tenant_id = '${tenantId}' and new.kind = 'contact.consent_changed')
      execute function public.__stop_event_refused();
    begin
      perform public.record_provider_stop('${tenantId}', '${who.contactId}', 'conversational', 'sms', '${CARRIER_CONSENT_SOURCE}');
      seen := seen || jsonb_build_object('raised', false);
    exception when others then
      seen := seen || jsonb_build_object('raised', true, 'message', sqlerrm);
    end;
    seen := seen || jsonb_build_object(
      'consent', (select c.consent from public.contacts c where c.id = '${who.contactId}'),
      'dnc', (select c.dnc from public.contacts c where c.id = '${who.contactId}'));
  `);
    assert.equal(seen.raised, true, `a ledger that refuses the event must refuse the stop (${JSON.stringify(seen)})`);
    assert.match(seen.message, /ledger is unavailable/, "it was the event that failed, after the row was written");
    assert.deepEqual([seen.consent, seen.dnc], ["opted_in", false], "the row went back with the event");
  },
);
