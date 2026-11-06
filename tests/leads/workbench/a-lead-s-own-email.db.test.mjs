/**
 * A lead's own email (00540, decision 0094), proved on the database: a send with no sequence, batch or step. The mailbox's
 * day counts it, a reply that cites it is found, it takes no place and is no sequence's, and a lead holds one on its way
 * at a time. Local stack only.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces"
      : false;

let db;
let T;
let lead;
let box;
const stamp = Date.now().toString(36);
const HOST = `getharbor-own-${stamp}.example`;
const FROM = `sam@${HOST}`;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

const leadOf = async (name) =>
  ok(
    await db
      .from("leads")
      .insert({
        tenant_id: T,
        business_name: name,
        email: `owner-${randomUUID().slice(0, 8)}@fixture-own.example`,
        email_state: "ok",
      })
      .select("id, email")
      .single(),
  );

/** The person and thread a first email makes, as the door asks for them. */
const personOf = async (id) => ok(await db.rpc("reach_out_person", { p_tenant_id: T, p_lead_id: id }));

/** A lead's own email: its message and its row, as the door writes them. */
async function ownEmail(id, person, over = {}) {
  const sendId = randomUUID();
  const messageId = randomUUID();
  ok(
    await db.from("messages").insert({
      id: messageId,
      tenant_id: T,
      conversation_id: person.conversation_id,
      contact_id: person.contact_id,
      channel: "email",
      direction: "outbound",
      sender: "human",
      type: "text",
      body: "One email of your own.",
      status: over.status ?? "sent",
      meta: { source: "reach_out", email: { message_id: `<${messageId}@${HOST}>` }, reach_out: { lead_id: id } },
    }),
  );
  ok(
    await db.from("sequence_sends").insert({
      id: sendId,
      tenant_id: T,
      lead_id: id,
      contact_id: person.contact_id,
      state: over.state ?? "sent",
      sent_at: (over.state ?? "sent") === "sent" ? new Date().toISOString() : null,
      message_id: messageId,
      mailbox_id: box,
    }),
  );
  return { sendId, messageId };
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  T = ok(
    await db
      .from("tenants")
      .insert({ slug: `own-email-${stamp}`, name: "Own Email" })
      .select("id")
      .single(),
  ).id;
  box = ok(
    await db
      .from("mailbox_connections")
      .insert({
        tenant_id: T,
        provider: "google",
        provider_account: `acct-${stamp}`,
        address: FROM,
        host: HOST,
        from_name: "Sam at Harbor",
      })
      .select("id")
      .single(),
  ).id;
  lead = await leadOf("Fixture One");
});

after(async () => {
  if (skip) return;
  await db.from("tenants").delete().eq("id", T);
});

test("the mailbox's day counts it, as it counts a sequence's", { skip }, async () => {
  const day = async () => ok(await db.rpc("mailbox_capacity", { p_mailbox_id: box, p_at: new Date().toISOString() }));
  const was = await day();
  const id = await leadOf("Fixture Counted");
  await ownEmail(id.id, await personOf(id.id));
  const now = await day();
  assert.equal(now.sent_today, was.sent_today + 1);
  assert.equal(now.used, was.used + 1);
});

test("a reply that cites it is found, with no sequence named", { skip }, async () => {
  const id = await leadOf("Fixture Replied");
  const person = await personOf(id.id);
  const { sendId, messageId } = await ownEmail(id.id, person);
  const reply = randomUUID();
  ok(
    await db.from("messages").insert({
      id: reply,
      tenant_id: T,
      conversation_id: person.conversation_id,
      contact_id: person.contact_id,
      channel: "email",
      direction: "inbound",
      sender: "customer",
      type: "text",
      body: "No thanks.",
      status: "received",
      meta: { email: { in_reply_to: `<${messageId}@${HOST}>`, claim: "person", from: id.email } },
    }),
  );
  const of = ok(await db.rpc("reach_out_reply_of", { p_tenant_id: T, p_message_id: reply, p_days: 60 }));
  assert.equal(of.send_id, sendId);
  assert.equal(of.cited, true);
  assert.equal(of.lead_id, id.id);
  assert.equal(of.root_id, null);
  const stops = ok(await db.rpc("outreach_wrote_back", { p_tenant_id: T, p_contact_ids: [person.contact_id] }));
  assert.equal(stops.length, 1, "and any reply stops what would write to them");
});

test("it takes no place, is no sequence's, and leaves the lead free to join one", { skip }, async () => {
  const id = await leadOf("Fixture Free");
  await ownEmail(id.id, await personOf(id.id));
  const places = ok(await db.from("sequence_enrollments").select("id").eq("lead_id", id.id));
  assert.deepEqual(places, [], "no step: no place");
  assert.equal(ok(await db.rpc("lead_chain_of", { p_tenant_id: T, p_lead_id: id.id })), null);
  const why = ok(await db.rpc("reach_out_why_not", { p_tenant_id: T, p_lead_ids: [id.id] }));
  assert.notEqual(why[0].why, "written", "a one-off is not a sequence having written to them");
});

test(
  "a sequence's first email is not barred by one of the lead's own, and a lead holds one on its way",
  { skip },
  async () => {
    const id = await leadOf("Fixture Once");
    const person = await personOf(id.id);
    await ownEmail(id.id, person, { state: "queued", status: "queued" });
    await assert.rejects(
      async () => ok(await db.from("sequence_sends").insert({ tenant_id: T, lead_id: id.id, state: "queued" })),
      /sequence_sends_own_once/,
    );
    await ownEmail(lead.id, await personOf(lead.id));
    await ownEmail(lead.id, await personOf(lead.id));
    const rows = ok(await db.from("sequence_sends").select("id").eq("lead_id", lead.id).is("sequence_id", null));
    assert.equal(rows.length, 2, "one sent after another is its own row");
  },
);

test("a customer's send must still name its batch: only a lead's has none", { skip }, async () => {
  const c = ok(
    await db
      .from("contacts")
      .insert({ tenant_id: T, email: `c-${stamp}@fixture-own.example` })
      .select("id")
      .single(),
  );
  const res = await db.from("sequence_sends").insert({ tenant_id: T, contact_id: c.id, state: "queued" });
  assert.equal(res.error?.code, "23514", res.error?.message);
  assert.match(res.error.message, /sequence_sends_own_is_a_leads/);
});
