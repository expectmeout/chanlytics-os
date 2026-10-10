/**
 * 00379 on a real Postgres: an automated email (an automatic reply, a list's mail, a delivery report: meta.email.claim
 * `automated`, `auto_reply` or `report`) is no customer message. report_series, metrics_summary and first_replies count
 * a customer message only when its words are a person's (message_is_a_persons_words), so Overview, Receptionist and
 * Today say one number, and answered + unanswered still add up to the messages that came in.
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
      ? "refusing a database that is not on this machine"
      : false;

let db;
const tenants = [];
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const ago = (min) => new Date(Date.now() - min * 60_000);

before(() => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  for (const id of tenants) await db.from("tenants").delete().eq("id", id);
});

/** A workspace in UTC with one person and one conversation. */
async function world(slug, phone) {
  const tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `${slug}-${Date.now()}`, name: "Harbor Automated", timezone: "UTC" })
      .select("id")
      .single(),
  ).id;
  tenants.push(tenantId);
  const contact = ok(
    await db
      .from("contacts")
      .insert({ tenant_id: tenantId, phone_e164: phone, display_name: "Harbor Guest" })
      .select("id")
      .single(),
  ).id;
  const conv = ok(
    await db
      .from("conversations")
      .insert({ tenant_id: tenantId, contact_id: contact, state: "open", last_message_at: ago(1).toISOString() })
      .select("id")
      .single(),
  ).id;
  return { tenantId, contact, conv };
}

/** One inbound customer message `min` minutes ago; `meta` is what the intake kept of it. */
const inbound = (w, min, channel, meta) => ({
  tenant_id: w.tenantId,
  conversation_id: w.conv,
  contact_id: w.contact,
  channel,
  direction: "inbound",
  sender: "customer",
  status: "received",
  type: "text",
  body: "hi",
  meta,
  created_at: ago(min).toISOString(),
  channel_ts: ago(min).toISOString(),
});

test(
  "report_series, metrics_summary and first_replies count a customer message only when its words are a person's",
  { skip },
  async () => {
    const w = await world("harbor-automated", "+15550139001");
    const lastPerson = inbound(w, 60, "email", {});
    ok(
      await db.from("messages").insert([
        inbound(w, 120, "whatsapp", {}),
        lastPerson,
        inbound(w, 50, "email", { email: { claim: "automated" } }),
        inbound(w, 40, "email", { email: { claim: "auto_reply" } }),
        inbound(w, 30, "email", { email: { claim: "report" } }),
        {
          tenant_id: w.tenantId,
          conversation_id: w.conv,
          contact_id: w.contact,
          channel: "whatsapp",
          direction: "outbound",
          sender: "ai",
          status: "sent",
          type: "text",
          body: "hello",
          meta: {},
          created_at: ago(119).toISOString(),
        },
      ]),
    );
    const tenantId = w.tenantId;

    const r = ok(await db.rpc("report_series", { p_tenant_id: tenantId, p_days: 7 }));
    // Summed over the window: a run just after midnight UTC puts the 120-minute-old row on yesterday.
    const sum = (key) => r.series.slice(-7).reduce((s, d) => s + d[key], 0);
    assert.deepEqual(
      ["messages_in", "answered_ai", "answered_you", "unanswered"].map(sum),
      [2, 1, 0, 1],
      "two messages, one answered, one not",
    );
    assert.equal(r.channels.current.email, 1, "one email that a person wrote");
    assert.equal(
      r.arrivals.reduce((s, a) => s + a.n, 0),
      2,
      "when people reached the business: an automatic reply is no one arriving",
    );

    const m = ok(await db.rpc("metrics_summary", { p_tenant_id: tenantId, p_days: 2 }));
    assert.deepEqual(
      [m.period.messages_in, m.period.answered_by_ai, m.period.unanswered_in_window, m.period.conversations_active],
      [2, 1, 1, 1],
    );
    // Today draws "last at 10:30" beside messages_in: the last message is the last person's, not the mailbox's.
    assert.equal(
      new Date(m.now.last_inbound_at).getTime(),
      new Date(lastPerson.channel_ts).getTime(),
      "the last message is the 60-minute-old email a person wrote, not the report that came after it",
    );
    const since = new Date(Date.now() - 86_400_000).toISOString();
    assert.equal(ok(await db.rpc("first_replies", { p_tenant_id: tenantId, p_start: since })).length, 2);
  },
);

test(
  "a conversation whose only inbound message was automated mail counts no customer message in it",
  { skip },
  async () => {
    const w = await world("harbor-automated-alone", "+15550139003");
    ok(await db.from("messages").insert(inbound(w, 45, "email", { email: { claim: "auto_reply" } })));
    const r = ok(await db.rpc("report_series", { p_tenant_id: w.tenantId, p_days: 7 }));
    assert.equal(
      r.series.reduce((s, d) => s + d.messages_in + d.conversations + d.unanswered, 0),
      0,
      "no message, no conversation that wrote, nothing unanswered",
    );
    // Two days, as the first test reads: the 45-minute-old row is in the window whatever time of day this runs.
    const m = ok(await db.rpc("metrics_summary", { p_tenant_id: w.tenantId, p_days: 2 }));
    assert.deepEqual([m.period.messages_in, m.period.conversations_active, m.period.unanswered_in_window], [0, 0, 0]);
    assert.equal(m.now.last_inbound_at, null, 'Today\'s "last at" has no message to name: it says none yet');
  },
);

test(
  "a person whose only message was automated mail still has a first moment: the new-person rule is People's, and this migration does not touch it",
  { skip },
  async () => {
    const w = await world("harbor-automated-first", "+15550139002");
    const row = inbound(w, 45, "email", { email: { claim: "automated" } });
    ok(await db.from("messages").insert(row));
    const firsts = ok(await db.rpc("contact_first_moments", { p_tenant_id: w.tenantId }));
    const mine = firsts.find((f) => f.contact_id === w.contact);
    assert.ok(mine, "a person's first word in either direction is a first moment, whatever it said");
    assert.equal(new Date(mine.first_at).getTime(), new Date(row.channel_ts).getTime(), "the row's own channel_ts");
    const r = ok(await db.rpc("report_series", { p_tenant_id: w.tenantId, p_days: 7 }));
    assert.equal(
      r.series.slice(-7).reduce((s, d) => s + d.new_contacts, 0),
      1,
      "new people still count them",
    );
  },
);
