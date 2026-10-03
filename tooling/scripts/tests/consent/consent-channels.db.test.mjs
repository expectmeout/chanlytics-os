/**
 * A yes covers the channels it was given for -- on a real database (One message, every channel, step 2; 00286).
 *
 * consent-channels.test.mjs holds contracts' channelsOfYes. This holds the other half, where the rule is kept: the
 * migration's consent_channels_of is that function case by case; each contact.consent_changed event, written by the
 * doors it is written by, leaves the person's two lists as the table says; the backfill gives every yes already on a
 * row the channels its events give it; the receptionist's ask is stamped by the database, once; and people_list
 * answers the three new columns. A function body is exactly what reading source cannot prove, so these run against
 * Postgres. Skipped without a local database (the member's doors also need SUPABASE_ANON_KEY); never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { CONSENT_CHANNELS, channelsOfYes } from "../../../../packages/contracts/src/consent/consent-channels.ts";
import { ingestInbound } from "../../../../packages/db/src/repositories/ingest.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const MIGRATION = path.join(ROOT, "supabase", "migrations", "00286_a_yes_covers_the_channels_it_was_given_for.sql");
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

/** One statement through `supabase db query --local`: the rows it returned. */
function query(sql) {
  const r = spawnSync(CLI, ["db", "query", "--local", "--output-format", "json", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  if (r.status !== 0) throw new Error(`supabase db query exited ${r.status}: ${(r.stderr || r.stdout).slice(-800)}`);
  const out = r.stdout;
  const start = out.search(/[[{]/);
  if (start < 0) return [];
  const end = out.lastIndexOf(out[start] === "{" ? "}" : "]");
  const parsed = JSON.parse(out.slice(start, end + 1));
  return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
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
      .insert({ slug: `consent-channels-${Date.now()}`, name: "Consent channels" })
      .select("id")
      .single(),
  ).id;
  if (skipMember) return;
  const email = `consent-channels-${Date.now()}@example.com`;
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
      p_message_external_id: `wamid.consent-channels-${Date.now()}-${messages}`,
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

/** A person with a thread and no answer yet. */
const someone = async () => (await inbound(phone())).contact_id;

async function lists(contactId) {
  const row = ok(
    await db
      .from("contacts")
      .select("consent, marketing_consent, consent_channels, marketing_channels, offers_asked_at, dnc")
      .eq("id", contactId)
      .single(),
  );
  return row;
}

/** A consent event as the doors write one, by hand: for what the trigger reads and nothing else. */
async function eventOf(contactId, data, createdAt) {
  ok(
    await db.from("events").insert({
      tenant_id: tenantId,
      kind: "contact.consent_changed",
      category: "contact",
      subject_type: "contact",
      subject_id: contactId,
      data,
      ...(createdAt ? { created_at: createdAt } : {}),
    }),
  );
}

/* ------------------------------------------------------------------- the rule -- */

test(
  "ACCEPTANCE: consent_channels_of is contracts' channelsOfYes for every purpose, source and channel",
  { skip },
  async () => {
    const purposes = ["conversational", "marketing"];
    const sources = ["in_person", "phone", "form", "customer_message", "operator", "carrier", null];
    const channels = ["whatsapp", "sms", "email", "voice", null];
    let cases = 0;
    for (const purpose of purposes) {
      for (const source of sources) {
        for (const channel of channels) {
          const { data, error } = await db.rpc("consent_channels_of", {
            p_purpose: purpose,
            p_source: source,
            p_channel: channel,
          });
          assert.equal(error, null, error?.message);
          assert.deepEqual(
            data,
            channelsOfYes(purpose, source, channel),
            `${purpose} yes by ${source ?? "no source"} on ${channel ?? "no channel"}`,
          );
          cases += 1;
        }
      }
    }
    assert.equal(cases, 70, "every case was asked");
    // The order is the contract's: whatsapp, sms, email.
    assert.deepEqual([...CONSENT_CHANNELS], ["whatsapp", "sms", "email"]);
  },
);

test("consent_channels_union keeps each channel once, in order, and drops what is no channel", { skip }, async () => {
  const union = async (a, b) => ok(await db.rpc("consent_channels_union", { p_have: a, p_add: b }));
  assert.deepEqual(await union(["sms"], ["whatsapp"]), ["whatsapp", "sms"]);
  assert.deepEqual(await union(["email", "sms"], ["sms", "whatsapp"]), ["whatsapp", "sms", "email"]);
  assert.deepEqual(await union(null, ["sms"]), ["sms"], "no list is an empty one");
  assert.deepEqual(await union(["whatsapp"], null), ["whatsapp"]);
  assert.deepEqual(await union(null, null), []);
  assert.deepEqual(
    await union(["voice", "whatsapp"], ["fax"]),
    ["whatsapp"],
    "a channel a yes cannot cover is dropped",
  );
});

/* ---------------------------------------------------------------- the ledger -- */

test(
  "a START on WhatsApp covers WhatsApp; a STOP empties it; a START by text covers text alone",
  { skip },
  async () => {
    const p = phone();
    const first = await inbound(p, { p_body: "START", p_opt_in: true });
    const c = first.contact_id;
    assert.deepEqual(await lists(c), {
      consent: "opted_in",
      marketing_consent: "unknown",
      consent_channels: ["whatsapp"],
      marketing_channels: null,
      offers_asked_at: null,
      dnc: false,
    });

    await inbound(p, { p_body: "STOP", p_opt_out: true });
    const stopped = await lists(c);
    assert.equal(stopped.consent, "opted_out");
    assert.deepEqual(stopped.consent_channels, [], "a STOP leaves a yes that covers nothing");
    assert.equal(stopped.dnc, true);

    // The yes after it is by text, and covers text: a START by text is not a WhatsApp yes (decision 6).
    await inbound(p, { p_channel: "sms", p_body: "START", p_opt_in: true });
    const again = await lists(c);
    assert.equal(again.consent, "opted_in");
    assert.deepEqual(again.consent_channels, ["sms"]);
  },
);

/** The consent events a person has, oldest first: what the ledger shows. */
async function ledgerOf(contactId) {
  return ok(
    await db
      .from("events")
      .select("data")
      .eq("tenant_id", tenantId)
      .eq("subject_id", contactId)
      .eq("kind", "contact.consent_changed")
      .order("created_at"),
  ).map((e) => e.data);
}

test(
  "ACCEPTANCE: opted in on WhatsApp, a START by text adds text and one event; a second START by text adds nothing",
  { skip },
  async () => {
    // Through the repository the edge calls: ingest_inbound, then the door, as ingestInbound does for a keyword opt-in.
    const p = phone();
    const base = {
      tenantId,
      identityExternalId: p,
      phoneE164: p,
      waProfileName: null,
      type: "text",
      body: "START",
      channelTs: new Date().toISOString(),
      optIn: true,
    };
    const wa = await ingestInbound(db, { ...base, channel: "whatsapp", messageExternalId: `wamid.start-${p}` });
    const c = wa.contact_id;
    assert.deepEqual((await lists(c)).consent_channels, ["whatsapp"]);
    assert.equal((await ledgerOf(c)).length, 1, "ingest_inbound wrote the first yes");

    // ingest_inbound alone writes nothing for a yes already given: the door is what notes the channel.
    await ingestInbound(db, { ...base, channel: "sms", messageExternalId: `SM-start-${p}-1` });
    assert.deepEqual((await lists(c)).consent_channels, ["whatsapp", "sms"]);
    const ledger = await ledgerOf(c);
    assert.equal(ledger.length, 2, "and the ledger shows the yes by text");
    assert.deepEqual(
      [ledger[1].consent, ledger[1].source, ledger[1].channel, ledger[1].message_external_id, ledger[1].words],
      ["opted_in", "customer_message", "sms", `SM-start-${p}-1`, "START"],
    );
    assert.equal(ledger[1].covers_another_channel, true);

    // Again: the channel is held, so no event.
    await ingestInbound(db, { ...base, channel: "sms", messageExternalId: `SM-start-${p}-2` });
    assert.equal((await ledgerOf(c)).length, 2, "a second START by text writes nothing");
    assert.deepEqual((await lists(c)).consent_channels, ["whatsapp", "sms"]);

    // A START on WhatsApp, which they already said, is held too.
    await ingestInbound(db, { ...base, channel: "whatsapp", messageExternalId: `wamid.start-${p}-2` });
    assert.equal((await ledgerOf(c)).length, 2);
  },
);

test(
  "note_yes_on_channel writes only for a yes whose list lacks the channel, and answers whether it wrote",
  { skip },
  async () => {
    const door = async (c, channel, ext = `x-${phones}`, words = "START") =>
      ok(
        await db.rpc("note_yes_on_channel", {
          p_tenant_id: tenantId,
          p_contact_id: c,
          p_channel: channel,
          p_message_external_id: ext,
          p_words: words,
        }),
      );

    // No yes, or a no: nothing to add a channel to.
    const bare = await someone();
    assert.equal(await door(bare, "sms"), false, "unknown is no yes");
    assert.equal((await lists(bare)).consent_channels, null);
    assert.equal((await ledgerOf(bare)).length, 0);
    const stopped = (await inbound(phone(), { p_body: "STOP", p_opt_out: true })).contact_id;
    assert.equal(await door(stopped, "sms"), false, "a no is no yes");
    assert.deepEqual((await lists(stopped)).consent_channels, [], "and its list is untouched");

    // A channel a yes cannot cover, and a person who is not in this workspace.
    const yes = (await inbound(phone(), { p_body: "START", p_opt_in: true })).contact_id;
    assert.equal(await door(yes, "voice"), false);
    assert.equal(await door("00000000-0000-4000-8000-000000000000", "sms"), false);
    assert.deepEqual((await lists(yes)).consent_channels, ["whatsapp"]);

    // The channel they said it on is held already: no event. A new one is added, and noted once.
    assert.equal(await door(yes, "whatsapp"), false);
    assert.equal(await door(yes, "email", "mail-1", "start"), true);
    assert.equal(await door(yes, "email", "mail-2", "start"), false);
    assert.deepEqual((await lists(yes)).consent_channels, ["whatsapp", "email"]);
    const [, noted] = await ledgerOf(yes);
    assert.deepEqual(
      [noted.channel, noted.message_external_id, noted.words, noted.covers_another_channel],
      ["email", "mail-1", "start", true],
    );

    // A yes with no list kept (a row written without its event) holds WhatsApp: the door keeps that reach and adds text.
    const legacy = await before00286({ consent: "opted_in" });
    assert.equal((await lists(legacy)).consent_channels, null);
    assert.equal(await door(legacy, "whatsapp"), false, "NULL already covers WhatsApp");
    assert.equal(await door(legacy, "sms"), true);
    assert.deepEqual((await lists(legacy)).consent_channels, ["whatsapp", "sms"], "the reach it had is kept");

    // Another workspace's person is not reached by this workspace's call.
    const other = ok(
      await db
        .from("tenants")
        .insert({ slug: `consent-channels-c-${Date.now()}`, name: "Elsewhere" })
        .select("id")
        .single(),
    ).id;
    try {
      const stranger = ok(
        await db
          .from("contacts")
          .insert({ tenant_id: other, phone_e164: "+15125550198", consent: "opted_in" })
          .select("id")
          .single(),
      ).id;
      assert.equal(await door(stranger, "sms"), false);
      assert.equal(
        (await db.from("contacts").select("consent_channels").eq("id", stranger).single()).data.consent_channels,
        null,
      );
    } finally {
      await db.from("events").delete().eq("tenant_id", other);
      await db.from("tenants").delete().eq("id", other);
    }
  },
);

test("note_yes_on_channel is the service role's alone", { skip: skipMember }, async () => {
  const c = await someone();
  const { error } = await owner.rpc("note_yes_on_channel", {
    p_tenant_id: tenantId,
    p_contact_id: c,
    p_channel: "sms",
    p_message_external_id: "x",
    p_words: "START",
  });
  assert.ok(error, "a signed-in member is refused");
  assert.match(error.message, /permission denied|not found|Could not find/i);
});

test(
  "a yes a member records adds its channels to the ones already covered; a reset empties them",
  { skip: skipMember },
  async () => {
    const p = phone();
    const first = await inbound(p, { p_body: "START", p_opt_in: true });
    const c = first.contact_id;
    assert.deepEqual((await lists(c)).consent_channels, ["whatsapp"]);

    // They then write by text, and the member records that as their yes: their own message, on text.
    const text = await inbound(p, { p_channel: "sms", p_body: "yes, text me" });
    ok(
      await owner.rpc("set_contact_consent", {
        p_contact_id: c,
        p_consent: "opted_in",
        p_source: "customer_message",
        p_note: null,
        p_message_id: text.message_id,
      }),
    );
    assert.deepEqual((await lists(c)).consent_channels, ["whatsapp", "sms"]);

    // A yes the team sets at the desk covers WhatsApp, which it already did: nothing is lost, nothing doubled.
    ok(await owner.rpc("set_contact_consent", { p_contact_id: c, p_consent: "opted_in", p_source: "in_person" }));
    assert.deepEqual((await lists(c)).consent_channels, ["whatsapp", "sms"]);

    // A reset is no yes at all.
    ok(await owner.rpc("set_contact_consent", { p_contact_id: c, p_consent: "unknown", p_source: "operator" }));
    assert.deepEqual((await lists(c)).consent_channels, []);

    // The signed form, or the spoken script, covers WhatsApp and text.
    for (const source of ["form", "phone"]) {
      const q = await someone();
      ok(await owner.rpc("set_contact_consent", { p_contact_id: q, p_consent: "opted_in", p_source: source }));
      assert.deepEqual((await lists(q)).consent_channels, ["whatsapp", "sms"], `a yes by ${source}`);
    }
    const desk = await someone();
    ok(await owner.rpc("set_contact_consent", { p_contact_id: desk, p_consent: "opted_in", p_source: "operator" }));
    assert.deepEqual((await lists(desk)).consent_channels, ["whatsapp"], "a yes the team set");
  },
);

test(
  "a YES OFFERS by message, or a form's yes, covers offers on WhatsApp; the two answers keep their own lists",
  { skip },
  async () => {
    const p = phone();
    const first = await inbound(p, { p_body: "START", p_opt_in: true });
    const c = first.contact_id;
    // The edge's door: the customer's message is the evidence, and its channel rides along.
    ok(
      await db.rpc("set_marketing_consent", {
        p_tenant_id: tenantId,
        p_contact_id: c,
        p_consent: "opted_in",
        p_source: "customer_message",
        p_note: null,
        p_evidence: { channel: "whatsapp", message_external_id: "wamid.offers-1", words: "YES OFFERS" },
      }),
    );
    const yes = await lists(c);
    assert.deepEqual(yes.marketing_channels, ["whatsapp"]);
    assert.deepEqual(yes.consent_channels, ["whatsapp"], "the visit-messages answer is its own");

    // The offers answer going to no empties the offers list and leaves the other.
    ok(
      await db.rpc("set_marketing_consent", {
        p_tenant_id: tenantId,
        p_contact_id: c,
        p_consent: "opted_out",
        p_source: "customer_message",
        p_evidence: { channel: "whatsapp", words: "no thanks" },
      }),
    );
    const no = await lists(c);
    assert.deepEqual(no.marketing_channels, []);
    assert.deepEqual(no.consent_channels, ["whatsapp"]);

    // The sign-up form's yes to offers is WhatsApp too.
    ok(
      await db.rpc("set_marketing_consent", {
        p_tenant_id: tenantId,
        p_contact_id: c,
        p_consent: "opted_in",
        p_source: "form",
      }),
    );
    assert.deepEqual((await lists(c)).marketing_channels, ["whatsapp"]);

    // A yes to offers by text covers WhatsApp too, WhatsApp first (it was ["sms"] alone, and offers go by WhatsApp, so it
    // never led to one); the door that sends still refuses an offer by text.
    const t = await someone();
    ok(
      await db.rpc("set_marketing_consent", {
        p_tenant_id: tenantId,
        p_contact_id: t,
        p_consent: "opted_in",
        p_source: "customer_message",
        p_evidence: { channel: "sms", words: "YES OFFERS" },
      }),
    );
    assert.deepEqual((await lists(t)).marketing_channels, ["whatsapp", "sms"]);
    // The email channel on a MARKETING event is a case no door writes: a YES OFFERS by email is the person's own answer about
    // offers by email (email_marketing, set_email_offers_yes: purpose email_marketing), which keeps no channel list and covers
    // email alone. The table still answers it, as contracts' channelsOfYes does (held equal above), and this holds that.
    const e = await someone();
    ok(
      await db.rpc("set_marketing_consent", {
        p_tenant_id: tenantId,
        p_contact_id: e,
        p_consent: "opted_in",
        p_source: "customer_message",
        p_evidence: { channel: "email", words: "YES OFFERS" },
      }),
    );
    assert.deepEqual((await lists(e)).marketing_channels, ["whatsapp", "email"]);
  },
);

test(
  "an event that is not a yes or a no, or names no one in this workspace, changes nothing and raises nothing",
  { skip },
  async () => {
    const c = await someone();
    const before = await lists(c);
    await eventOf(c, { note: "no consent key at all" });
    await eventOf(c, { purpose: "something-else", consent: "opted_in", source: "form" });
    await eventOf(c, { consent: "maybe", source: "form" });
    assert.deepEqual(await lists(c), before);

    // A consent event for someone who is not there, and one that names another workspace's person, touch nobody.
    ok(
      await db.from("events").insert({
        tenant_id: tenantId,
        kind: "contact.consent_changed",
        category: "contact",
        subject_type: "contact",
        subject_id: "00000000-0000-4000-8000-000000000000",
        data: { consent: "opted_in", source: "form" },
      }),
    );
    const other = ok(
      await db
        .from("tenants")
        .insert({ slug: `consent-channels-b-${Date.now()}`, name: "Elsewhere" })
        .select("id")
        .single(),
    ).id;
    try {
      const stranger = ok(
        await db.from("contacts").insert({ tenant_id: other, phone_e164: "+15125550199" }).select("id").single(),
      ).id;
      await eventOf(stranger, { consent: "opted_in", source: "form" });
      assert.equal(
        (await db.from("contacts").select("consent_channels").eq("id", stranger).single()).data.consent_channels,
        null,
        "an event of this workspace does not reach another's person",
      );
    } finally {
      await db.from("events").delete().eq("tenant_id", other);
      await db.from("tenants").delete().eq("id", other);
    }
  },
);

/* ------------------------------------------------------------------ backfill -- */

/** The migration's own backfill statements, so what runs here is what the migration runs. */
function backfillSql() {
  const text = fs.readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n");
  const from = text.indexOf("/* ---------------------------------------------------------------- backfill -- */");
  const to = text.indexOf("/* ------------------------------------------------------------- people_list -- */");
  assert.ok(from > 0 && to > from, "the backfill is in the migration, before people_list");
  return text
    .slice(from, to)
    .split(/;\s*\n/)
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => !/^\s*(--|\/\*)/.test(line))
        .join("\n")
        .trim(),
    )
    .filter((s) => s.startsWith("update "))
    .map((s) => `${s};`);
}

/** A person whose answer is on the row and whose lists were never kept: as every yes was before 00286. */
async function before00286(row, events = []) {
  const c = ok(
    await db
      .from("contacts")
      .insert({ tenant_id: tenantId, phone_e164: phone(), ...row })
      .select("id")
      .single(),
  ).id;
  for (const [data, createdAt] of events) await eventOf(c, data, createdAt);
  // The events have kept the lists already, as they do now; this is the row as it was before they did.
  ok(await db.from("contacts").update({ consent_channels: null, marketing_channels: null }).eq("id", c));
  return c;
}

test(
  "ACCEPTANCE: the backfill gives every yes the channels its events give it, WhatsApp where none, and nobody else a list",
  { skip },
  async () => {
    const yes = (extra = {}) => ({ consent: "opted_in", ...extra });
    const t = (hours) => new Date(Date.UTC(2026, 8, 1, hours)).toISOString();

    // A yes with no event at all: it keeps the WhatsApp reach it had.
    const noEvent = await before00286({ consent: "opted_in", marketing_consent: "opted_in" });
    // Their own message on text, the form, and a plain yes.
    const byText = await before00286({ consent: "opted_in" }, [
      [yes({ source: "customer_message", channel: "sms", words: "START" }), t(1)],
    ]);
    const byForm = await before00286({ consent: "opted_in", marketing_consent: "opted_in" }, [
      [yes({ source: "form" }), t(1)],
      [yes({ purpose: "marketing", source: "form" }), t(2)],
    ]);
    // Only what came after the last no: a form, then a STOP, then START by text is text alone.
    const afterNo = await before00286({ consent: "opted_in" }, [
      [yes({ source: "form" }), t(1)],
      [{ consent: "opted_out", source: "customer_message", channel: "whatsapp" }, t(2)],
      [yes({ source: "customer_message", channel: "sms" }), t(3)],
    ]);
    // Two yeses with no no between them add up.
    const added = await before00286({ consent: "opted_in" }, [
      [yes({ source: "customer_message", channel: "whatsapp" }), t(1)],
      [yes({ source: "customer_message", channel: "email" }), t(2)],
    ]);
    // The offers answer is its own: a conversational no does not empty it, and its own no does.
    const offersOnly = await before00286({ consent: "opted_in", marketing_consent: "opted_in" }, [
      [yes({ purpose: "marketing", source: "customer_message", channel: "whatsapp" }), t(1)],
      [{ consent: "opted_out", source: "customer_message", channel: "sms" }, t(2)],
    ]);
    // No yes on the row: nothing to keep, and nothing is written.
    const never = await before00286({ consent: "unknown" });
    const stopped = await before00286({ consent: "opted_out", marketing_consent: "opted_out" }, [
      [yes({ source: "form" }), t(1)],
      [{ consent: "opted_out", source: "customer_message", channel: "whatsapp" }, t(2)],
    ]);

    const statements = backfillSql();
    assert.equal(statements.length, 2, "one statement for each answer");
    for (const s of statements) query(s);

    const l = async (id) => {
      const r = await lists(id);
      return [r.consent_channels, r.marketing_channels];
    };
    assert.deepEqual(await l(noEvent), [["whatsapp"], ["whatsapp"]], "no event: the reach it had");
    assert.deepEqual(await l(byText), [["sms"], null]);
    assert.deepEqual(await l(byForm), [["whatsapp", "sms"], ["whatsapp"]]);
    assert.deepEqual(await l(afterNo), [["sms"], null], "only the yes after the last no");
    assert.deepEqual(await l(added), [["whatsapp", "email"], null]);
    assert.deepEqual(await l(offersOnly), [["whatsapp"], ["whatsapp"]], "the other answer's no is not this one's");
    assert.deepEqual(await l(never), [null, null], "an unknown answer keeps no list");
    assert.deepEqual(await l(stopped), [null, null], "a no keeps no list");

    // Run again: a list that is kept stays as it is, even when a later yes has added to it since.
    await eventOf(noEvent, { consent: "opted_in", source: "customer_message", channel: "email" });
    assert.deepEqual(
      await l(noEvent),
      [["whatsapp", "email"], ["whatsapp"]],
      "the trigger adds to what the backfill kept",
    );
    for (const s of statements) query(s);
    assert.deepEqual(await l(noEvent), [["whatsapp", "email"], ["whatsapp"]], "a second run changes nothing");
    assert.deepEqual(await l(afterNo), [["sms"], null]);
  },
);

/* ------------------------------------------------------- the receptionist's ask -- */

async function say(contactId, conversationId, body, over = {}) {
  ok(
    await db.from("messages").insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      contact_id: contactId,
      channel: "whatsapp",
      direction: "outbound",
      sender: "ai",
      type: "text",
      body,
      status: "sent",
      ...over,
    }),
  );
}

test(
  "ACCEPTANCE: an outbound message that says YES OFFERS stamps the ask once; a later one, and an inbound, do not",
  { skip },
  async () => {
    const p = phone();
    const first = await inbound(p);
    const { contact_id: c, conversation_id: cv } = first;
    assert.equal((await lists(c)).offers_asked_at, null);

    // Not the words: nothing is stamped.
    await say(c, cv, "Thanks, your visit is booked for Tuesday.");
    assert.equal((await lists(c)).offers_asked_at, null);
    // Not ours: a customer who writes the words is answering, not being asked.
    await inbound(p, { p_body: "YES OFFERS" });
    assert.equal((await lists(c)).offers_asked_at, null, "an inbound message does not stamp");

    // The ask, in any case, stamps the message's time.
    const asked = "2026-10-01T10:00:00.000Z";
    await say(c, cv, "Want news and offers? Reply yes offers any time.", { created_at: asked });
    assert.equal(new Date((await lists(c)).offers_asked_at).toISOString(), asked);

    // A second ask, in either language, keeps the first time.
    await say(c, cv, "Quieres ofertas? Responde SI OFERTAS.", { created_at: "2026-10-02T10:00:00.000Z" });
    assert.equal(new Date((await lists(c)).offers_asked_at).toISOString(), asked, "the first ask stands");

    // Spanish alone stamps another person, and a text carries the words as they were sent.
    const q = await inbound(phone());
    await say(q.contact_id, q.conversation_id, "Quieres ofertas? Responde SI OFERTAS.", {
      channel: "sms",
      channel_ts: "2026-09-30T09:00:00.000Z",
    });
    assert.equal(new Date((await lists(q.contact_id)).offers_asked_at).toISOString(), "2026-09-30T09:00:00.000Z");
    // And the person it stamps is the conversation's: nobody else's row moved.
    assert.equal((await lists(c)).offers_asked_at !== null, true);
    const third = await inbound(phone());
    assert.equal((await lists(third.contact_id)).offers_asked_at, null);
  },
);

test(
  "a draft that was never sent asked nobody: held, cancelled and failed leave the one ask unused, and it counts when the message is sent",
  { skip },
  async () => {
    const words = "Want news and offers? Reply yes offers any time.";
    const { contact_id: c, conversation_id: cv } = await inbound(phone());
    // The old trigger fired on the write: a draft the team held or cancelled used the ask up (REGRESSION guard).
    for (const status of ["queued", "canceled", "failed"]) await say(c, cv, words, { status });
    assert.equal((await lists(c)).offers_asked_at, null, "nothing was sent: nothing was asked");

    // A draft that is sent later asks then: the update that moves it to sent stamps it, with the message's own time.
    const drafted = "2026-10-01T08:00:00.000Z";
    const draft = ok(
      await db
        .from("messages")
        .insert({
          tenant_id: tenantId,
          conversation_id: cv,
          contact_id: c,
          channel: "whatsapp",
          direction: "outbound",
          sender: "human",
          type: "text",
          body: words,
          status: "queued",
          created_at: drafted,
        })
        .select("id")
        .single(),
    );
    assert.equal((await lists(c)).offers_asked_at, null, "still a draft");
    ok(await db.from("messages").update({ status: "sent" }).eq("id", draft.id).select("id").single());
    assert.equal(new Date((await lists(c)).offers_asked_at).toISOString(), drafted, "sent: the ask counts");

    // Its receipts, delivered and read, find the stamp and leave it; a second sent ask leaves it too.
    ok(await db.from("messages").update({ status: "delivered" }).eq("id", draft.id).select("id").single());
    ok(await db.from("messages").update({ status: "read" }).eq("id", draft.id).select("id").single());
    await say(c, cv, words, { created_at: "2026-10-03T08:00:00.000Z" });
    assert.equal(new Date((await lists(c)).offers_asked_at).toISOString(), drafted, "the first ask stands");

    // A message written as sent, delivered or read counts at once, as before.
    for (const status of ["delivered", "read"]) {
      const other = await inbound(phone());
      await say(other.contact_id, other.conversation_id, words, { status });
      assert.notEqual((await lists(other.contact_id)).offers_asked_at, null, `written as ${status}`);
    }
  },
);

test(
  "the ask is read in every spelling the inbound side takes as the yes, in any case and with or without the accent, as a word of its own",
  { skip },
  async () => {
    const acute = String.fromCharCode(0x301);
    const asks = [
      "YES OFFERS",
      "Yes Offers",
      "yes offers",
      "Reply *yes offers* to hear more.",
      "Responde SI OFERTAS.",
      "Responde Si Ofertas para recibirlas.",
      "Responde Sí ofertas para recibirlas.",
      "Responde SÍ OFERTAS",
      "Responde sí ofertas",
      `Responde si${acute} ofertas`, // the accent as a combining mark
      "Responde Yes  Offers!", // a doubled space
    ];
    for (const body of asks) {
      const first = await inbound(phone());
      await say(first.contact_id, first.conversation_id, body);
      assert.notEqual((await lists(first.contact_id)).offers_asked_at, null, `${JSON.stringify(body)} is the ask`);
    }

    // Anything else is not: a word that only contains the words, or a sentence that only mentions offers.
    const notAsks = [
      "We have no offers this week.",
      "Yes, offers are our thing.",
      "eyes offers",
      "yes offersx",
      "Sin ofertas hoy.",
      "Mis ofertas están aquí.",
    ];
    for (const body of notAsks) {
      const first = await inbound(phone());
      await say(first.contact_id, first.conversation_id, body);
      assert.equal((await lists(first.contact_id)).offers_asked_at, null, `${JSON.stringify(body)} is not the ask`);
    }
  },
);

/* ------------------------------------------------------------------- erasure -- */

test("an erased row holds no list and no ask, and a later event keeps none", { skip }, async () => {
  const first = await inbound(phone());
  const c = first.contact_id;
  await eventOf(c, { consent: "opted_in", source: "form" });
  await eventOf(c, { purpose: "marketing", consent: "opted_in", source: "form" });
  await say(c, first.conversation_id, "Reply YES OFFERS to hear about offers.");
  const kept = await lists(c);
  assert.deepEqual([kept.consent_channels, kept.marketing_channels], [["whatsapp", "sms"], ["whatsapp"]]);
  assert.notEqual(kept.offers_asked_at, null);

  ok(await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", c));
  const gone = await lists(c);
  assert.deepEqual([gone.consent_channels, gone.marketing_channels, gone.offers_asked_at], [null, null, null]);

  await eventOf(c, { consent: "opted_in", source: "form" });
  assert.equal((await lists(c)).consent_channels, null, "an erased person is not given a list again");
});

/* ---------------------------------------------------------------- people_list -- */

test("people_list answers the two lists and the ask beside the consent columns", { skip }, async () => {
  const p = phone();
  const first = await inbound(p, { p_body: "START", p_opt_in: true });
  const { contact_id: c, conversation_id: cv } = first;
  await eventOf(c, { purpose: "marketing", consent: "opted_in", source: "form" });
  ok(await db.from("contacts").update({ marketing_consent: "opted_in", marketing_consent_source: "form" }).eq("id", c));
  await say(c, cv, "Reply YES OFFERS for news.", { created_at: "2026-10-01T08:30:00.000Z" });

  const rows = ok(await db.rpc("people_list", { p_tenant_id: tenantId, p_contact_id: c }));
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.consent, "opted_in");
  assert.equal(row.marketing_consent, "opted_in");
  assert.deepEqual(row.consent_channels, ["whatsapp"]);
  assert.deepEqual(row.marketing_channels, ["whatsapp"]);
  assert.equal(new Date(row.offers_asked_at).toISOString(), "2026-10-01T08:30:00.000Z");

  // A person with no answer kept answers null, which a reader takes as WhatsApp alone.
  const bare = await someone();
  const [other] = ok(await db.rpc("people_list", { p_tenant_id: tenantId, p_contact_id: bare }));
  assert.deepEqual([other.consent_channels, other.marketing_channels, other.offers_asked_at], [null, null, null]);

  // The page read, whole: the same two columns ride every row.
  const page = ok(await db.rpc("people_list", { p_tenant_id: tenantId }));
  assert.ok(page.length >= 2);
  for (const r of page) {
    assert.ok("consent_channels" in r && "marketing_channels" in r && "offers_asked_at" in r, "every row carries them");
  }
});
