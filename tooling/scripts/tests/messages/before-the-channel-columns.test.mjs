/**
 * Either deploy order works (One message, every channel, steps 2 and 3): the code that sends reads three things the
 * migrations 00297 (a person's consent_channels and marketing_channels) and 00298 (a recipient's channel) add, and it may
 * reach production before they do. Where the database answers that such a column does not exist (42703), each read is
 * made again without it -- the arrays read as null, which is WhatsApp alone, and a recipient's channel as null, which is
 * WhatsApp -- so every reply, receptionist answer, booking link and WhatsApp broadcast keeps going.
 *
 * The database in memory is made the older one by `withoutColumns` (_schema.mjs): it refuses a read that names a column
 * the older schema lacks, as the real one does, so a read that still named one would fail here as it would there.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { queuedRecipients, resolveOutboundTarget, resolveOutboundTargetForContact } from "@chanlytics/db";
import { fakeDb } from "../_fake-db.mjs";
import { withoutColumns } from "../_schema.mjs";
import { middayZone } from "../shared/_midday-zone.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const dist = (pkg) => pathToFileURL(path.join(ROOT, `packages/${pkg}/dist/index.js`)).href;
const { deliver } = await import(dist("core"));
const { dispatchJob } = await import(dist("jobs"));

const T = "11111111-1111-4111-8111-111111111111";
const NOW = Date.parse("2026-09-10T10:00:00.000Z");
/** The columns the two migrations add, which a database that has not run them does not have. */
const BEFORE_00297 = { contacts: ["consent_channels", "marketing_channels"] };
const BEFORE_00298 = { broadcast_recipients: ["channel"] };

/** The selects a table was asked, in order: how a read made again is seen. */
function watch(db, table) {
  const reads = [];
  const from = db.from.bind(db);
  db.from = (name) => {
    const q = from(name);
    if (name !== table) return q;
    return new Proxy(q, {
      get(target, key) {
        if (key !== "select") return target[key];
        return (cols, o) => (reads.push(String(cols)), target.select(cols, o));
      },
    });
  };
  return reads;
}

const person = (over = {}) => ({
  id: "k1",
  tenant_id: T,
  phone_e164: "+13475550101",
  consent: "opted_in",
  dnc: false,
  marketing_consent: "opted_out",
  erased_at: null,
  merged_into_contact_id: null,
  ...over,
});

test("the door's read of the wire, on a database 00297 has not reached, is made again without the channel arrays: a reply still goes, and a yes covers WhatsApp alone", async () => {
  await withoutColumns(BEFORE_00297, async () => {
    const t = {
      conversations: [
        { id: "c1", tenant_id: T, paused_until: null, contacts: person(), tenants: { status: "active" } },
      ],
      messages: [],
      events: [],
      lines: [
        {
          tenant_id: T,
          messaging_service_sid: "MG1",
          voice_state: "ready",
          sms_state: "active",
          reg_mock: false,
          created_at: "2026-09-01T00:00:00.000Z",
        },
      ],
    };
    const db = fakeDb(t);
    const reads = watch(db, "conversations");
    const calls = [];
    const wire = { whatsapp: async (to, p) => (calls.push([to, p.body]), { ok: true, wamid: "wamid.1", status: 200 }) };
    const words = {
      tenantId: T,
      conversationId: "c1",
      contactId: "k1",
      to: "+13475550101",
      channel: "whatsapp",
      sender: "ai",
      purpose: "conversational",
      proactive: false,
      body: "See you at 3",
    };
    const out = await deliver({ db, wire, now: () => NOW }, words);
    assert.equal(
      out.outcome,
      "sent",
      "REGRESSION guard: the receptionist's reply is never lost to a column that is not there",
    );
    assert.deepEqual(calls, [["+13475550101", "See you at 3"]]);
    assert.equal(reads.length, 2, "read again, once");
    assert.ok(/consent_channels/.test(reads[0]) && /marketing_channels/.test(reads[0]), "first asked for the arrays");
    assert.ok(!/consent_channels|marketing_channels/.test(reads[1]), "then without them");
    // No arrays kept: their yes covers WhatsApp alone, as it did before the arrays, so a text they never said yes to is held.
    const text = await deliver({ db, wire, now: () => NOW }, { ...words, channel: "sms", proactive: true });
    assert.equal(text.outcome, "refused", "a yes with no channels kept is WhatsApp's alone");
  });
});

test("a send's thread and consent, on a database 00297 has not reached: found by number and by person without the arrays, which read as null", async () => {
  await withoutColumns(BEFORE_00297, async () => {
    const t = { contacts: [person()], conversations: [] };
    const db = fakeDb(t);
    const byNumber = watch(db, "contacts");
    const a = await resolveOutboundTarget(db, { tenantId: T, phoneE164: "+13475550101", create: false, touch: false });
    assert.ok(a, "the person is found: a column that is not there costs the channels, never who they are");
    assert.equal(a.contactId, "k1");
    assert.equal(a.consent, "opted_in");
    assert.equal(a.consent_channels, null, "unread: WhatsApp alone");
    assert.equal(a.marketing_channels, null);
    assert.equal(byNumber.length, 2, "read again, once");
    assert.ok(!/consent_channels|marketing_channels/.test(byNumber[1]));
    const b = await resolveOutboundTargetForContact(db, { tenantId: T, contactId: "k1", touch: false });
    assert.ok(b, "and by the person's id");
    assert.deepEqual([b.consent, b.consent_channels, b.marketing_channels], ["opted_in", null, null]);
    // Gone or erased is still null there: the fallback keeps the columns that say so.
    t.contacts[0].erased_at = "2026-09-01T00:00:00.000Z";
    assert.equal(await resolveOutboundTargetForContact(db, { tenantId: T, contactId: "k1", touch: false }), null);
  });
});

/** A WhatsApp broadcast to one person, as a run made before the channel column was: no `channel` on its row. */
const world = (over = {}) => ({
  broadcasts: [
    {
      id: "b1",
      tenant_id: T,
      state: "scheduled",
      name: "Spring offer",
      template_name: "offer",
      template_language: "en_US",
      params: [{ kind: "first_name" }],
      recipient_count: 1,
      playbook_id: null,
      audience: null,
      started_at: null,
      finished_at: null,
      failure: null,
    },
  ],
  // The batch asks the day's sending hours on the machine's clock: this workspace's noon is now, whenever the suite runs.
  tenants: [{ id: T, name: "Marisa's Salon", status: "active", timezone: middayZone() }],
  tenant_config: [
    {
      tenant_id: T,
      config: {
        brain: {
          business_name: "Marisa's",
          system_prompt: "Answer as the front desk of Marisa's: brief and warm.",
          fallbacks: { greeting: "g", error: "e", non_text: "n" },
        },
      },
    },
  ],
  templates: [
    {
      tenant_id: T,
      channel: "whatsapp",
      name: "offer",
      language: "en_US",
      meta_status: "approved",
      category: "utility",
      body_preview: "Hi {{1}}, your visit is tomorrow.",
    },
  ],
  contacts: [person({ display_name: "Ada Lovelace", marketing_consent: "unknown" })],
  conversations: [
    {
      id: "cv-k1",
      tenant_id: T,
      contact_id: "k1",
      paused_until: null,
      contacts: person(),
      tenants: { status: "active" },
    },
  ],
  broadcast_recipients: [
    { tenant_id: T, broadcast_id: "b1", contact_id: "k1", state: "queued", facts: null, sent_at: null },
  ],
  messages: [],
  events: [],
  jobs: [],
  ...over,
});
function context(t) {
  const wa = [];
  const news = [];
  const ctx = {
    db: fakeDb(t, {}, { campaign_month_sent: () => 0 }),
    wire: { whatsapp: async (to, p) => (wa.push({ to, p }), { ok: true, wamid: `wamid.${wa.length}`, status: 200 }) },
    alert: async (n) => news.push(n),
    schedule: async () => {},
    deadline: Date.now() + 60_000,
  };
  return { ctx, wa, news };
}
const JOB = { id: "j1", tenant_id: T, kind: "broadcast_send", payload: { broadcast_id: "b1" } };

test("a WhatsApp broadcast, on a database 00298 has not reached, still goes: the recipients are read again without their channel, and everyone is WhatsApp's", async () => {
  await withoutColumns({ ...BEFORE_00297, ...BEFORE_00298 }, async () => {
    const t = world();
    const w = context(t);
    const seen = watch(w.ctx.db, "broadcast_recipients");
    await dispatchJob(w.ctx, JOB);
    assert.equal(w.wa.length, 1, "the template left");
    assert.deepEqual(w.wa[0].p.template, { name: "offer", language: "en_US", params: ["Ada"] });
    assert.deepEqual(
      t.broadcast_recipients.map((r) => [r.contact_id, r.state, r.reason ?? null]),
      [["k1", "sent", null]],
    );
    assert.equal(t.broadcasts[0].state, "sent");
    // The newest column first (00301's attempt), then without it, then without the channel too: each step is made on the
    // database's own 42703, whichever column it was.
    assert.ok(
      /\bchannel\b/.test(seen[0]) && !/\bchannel\b/.test(seen.at(-1)),
      "asked for the channel, then without it",
    );
  });
});

test("a run's queued people, on a database 00301 has not reached, are read again without their attempt, keeping their channel: an email is then named as it was, by the run's waits", async () => {
  const run = (over = {}) => ({
    tenant_id: T,
    broadcast_id: "b1",
    state: "queued",
    facts: null,
    ...over,
  });
  const rows = () => [
    run({ contact_id: "k2", channel: "email", attempt: 2 }),
    run({ contact_id: "k1", channel: "sms", attempt: 0 }),
    run({ contact_id: "k3", channel: "whatsapp", attempt: 1 }),
    run({ contact_id: "k4", state: "sent" }),
  ];
  const ask = (db) => queuedRecipients(db, { tenantId: T, broadcastId: "b1", limit: 25 });
  // As the database is now: every column, and the people in the order of their ids (a batch is the same few every read).
  const now = fakeDb({ broadcast_recipients: rows() });
  const reads = watch(now, "broadcast_recipients");
  assert.deepEqual(await ask(now), [
    { contact_id: "k1", facts: null, channel: "sms", attempt: 0 },
    { contact_id: "k2", facts: null, channel: "email", attempt: 2 },
    { contact_id: "k3", facts: null, channel: "whatsapp", attempt: 1 },
  ]);
  assert.equal(reads.length, 1);
  // Before 00301: the second read, without the attempt only.
  await withoutColumns({ broadcast_recipients: ["attempt"] }, async () => {
    const db = fakeDb({ broadcast_recipients: rows().map(({ attempt: _attempt, ...r }) => r) });
    const seen = watch(db, "broadcast_recipients");
    const people = await ask(db);
    assert.deepEqual(
      people.map((p) => [p.contact_id, p.channel, "attempt" in p]),
      [
        ["k1", "sms", false],
        ["k2", "email", false],
        ["k3", "whatsapp", false],
      ],
      "the channel kept, no attempt to read: absent, not zero",
    );
    assert.equal(seen.length, 2);
    assert.ok(/\battempt\b/.test(seen[0]) && !/\battempt\b/.test(seen[1]) && /\bchannel\b/.test(seen[1]));
  });
  // Before 00298 too: the third, bare.
  await withoutColumns({ broadcast_recipients: ["attempt", "channel"] }, async () => {
    const db = fakeDb({ broadcast_recipients: rows().map(({ attempt: _a, channel: _c, ...r }) => r) });
    const seen = watch(db, "broadcast_recipients");
    assert.deepEqual(
      (await ask(db)).map((p) => Object.keys(p).sort()),
      [
        ["contact_id", "facts"],
        ["contact_id", "facts"],
        ["contact_id", "facts"],
      ],
    );
    assert.equal(seen.length, 3);
  });
  // Any other failed read is a failure, never a read made again: not every error is a missing column.
  const timeout = { code: "57014", message: "canceling statement due to statement timeout" };
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: async () => ({ data: null, error: timeout }),
  };
  await assert.rejects(ask({ from: () => chain }), /queued_recipients: canceling statement due to statement timeout/);
});

test("a run whose WhatsApp template is not approved, on a database 00298 has not reached, fails as it always did: nobody on it goes by email or text there", async () => {
  await withoutColumns({ ...BEFORE_00297, ...BEFORE_00298 }, async () => {
    const t = world();
    t.templates[0].meta_status = "rejected";
    const w = context(t);
    await dispatchJob(w.ctx, JOB);
    assert.equal(w.wa.length, 0);
    assert.deepEqual([t.broadcasts[0].state, t.broadcasts[0].failure], ["failed", "template_not_approved"]);
  });
});
