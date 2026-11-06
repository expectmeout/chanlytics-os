/**
 * An email the owner sends from their connected mailbox, kept and answering what waited (00482 mailbox_owner_wrote) --
 * on a real database.
 *
 * The door matches the person as resolve_person matches an address and makes nobody, keeps the email once by its
 * provider id, and resolves in the same write the holds that waited on a person and opened before it was sent. Which
 * rows it finds, which it leaves and what it writes once are what reading the SQL cannot prove, so these run against
 * Postgres in the database workflow; skipped without a local database.
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
      ? "refusing a database that is not on this machine: this suite writes customers"
      : false;

const REASONS = ["email_review", "manual", "wrote_while_held"];
let db;
const made = [];
const stamp = Date.now().toString(36);

const workspace = async (slug) => {
  const { data, error } = await db
    .from("tenants")
    .insert({ slug: `${slug}-${stamp}`, name: slug })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  made.push(data.id);
  return data.id;
};

/** A person who wrote by email, their thread, and the hold waiting on a person since `heldMsAgo`. */
const waiting = async (tenantId, email, heldMsAgo = 60 * 60_000) => {
  const person = await db.from("contacts").insert({ tenant_id: tenantId, email }).select("id").single();
  assert.equal(person.error, null, person.error?.message);
  const thread = await db
    .from("conversations")
    .insert({ tenant_id: tenantId, contact_id: person.data.id })
    .select("id")
    .single();
  assert.equal(thread.error, null, thread.error?.message);
  const hold = await db
    .from("escalations")
    .insert({
      tenant_id: tenantId,
      conversation_id: thread.data.id,
      reason: "email_review",
      created_at: new Date(Date.now() - heldMsAgo).toISOString(),
    })
    .select("id")
    .single();
  assert.equal(hold.error, null, hold.error?.message);
  return { contact: person.data.id, conversation: thread.data.id, hold: hold.data.id };
};

const wrote = (tenantId, address, externalId, at = new Date()) =>
  db.rpc("mailbox_owner_wrote", {
    p_tenant_id: tenantId,
    p_address: address,
    p_external_id: externalId,
    p_body: "Thursday at 10 works.",
    p_channel_ts: at.toISOString(),
    p_meta: { source: "mailbox", owner_wrote: true, thread_id: `t-${externalId}` },
    p_reasons: REASONS,
  });

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  for (const id of made) await db.from("tenants").delete().eq("id", id);
});

test(
  "the owner's email to a person the workspace knows is kept in their thread as a person's words, and resolves the hold that waited, once",
  { skip },
  async () => {
    const t = await workspace("owner-wrote");
    const rosa = await waiting(t, `rosa-${stamp}@example.com`);
    const first = await wrote(t, `Rosa-${stamp}@Example.com`, `g-${stamp}-1`);
    assert.equal(first.error, null, first.error?.message);
    assert.equal(first.data.kept, true);
    assert.equal(first.data.conversation_id, rosa.conversation, "their thread, matched by the address however spelled");
    assert.equal(first.data.resolved, 1);
    assert.ok(first.data.decision_id, "one resolve decision");

    const message = await db
      .from("messages")
      .select("channel, direction, sender, status, body, meta, contact_id")
      .eq("id", first.data.message_id)
      .single();
    assert.deepEqual(
      [message.data.channel, message.data.direction, message.data.sender, message.data.status, message.data.body],
      ["email", "outbound", "human", "sent", "Thursday at 10 works."],
    );
    assert.equal(message.data.contact_id, rosa.contact);
    assert.equal(message.data.meta.owner_wrote, true);

    const hold = await db.from("escalations").select("state, decision_id").eq("id", rosa.hold).single();
    assert.deepEqual([hold.data.state, hold.data.decision_id], ["resolved", first.data.decision_id]);
    const decision = await db
      .from("decisions")
      .select("verb, subject_id, actor_user_id, payload")
      .eq("id", first.data.decision_id)
      .single();
    assert.deepEqual(
      [decision.data.verb, decision.data.subject_id, decision.data.actor_user_id, decision.data.payload.via],
      ["resolve", rosa.conversation, null, "mailbox"],
    );

    // The sync reads the same email again: nothing kept twice, nothing resolved twice.
    const again = await wrote(t, `rosa-${stamp}@example.com`, `g-${stamp}-1`);
    assert.equal(again.error, null, again.error?.message);
    assert.deepEqual([again.data.kept, again.data.why], [false, "already"]);
    const count = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", t)
      .eq("external_id", `g-${stamp}-1`);
    assert.equal(count.count, 1);
  },
);

test("a hold that opened after the owner's email stays open: it is something new to answer", { skip }, async () => {
  const t = await workspace("owner-wrote-later");
  const ana = await waiting(t, `ana-${stamp}@example.com`, 1_000);
  const sentBefore = new Date(Date.now() - 10 * 60_000);
  const out = await wrote(t, `ana-${stamp}@example.com`, `g-${stamp}-2`, sentBefore);
  assert.equal(out.error, null, out.error?.message);
  assert.deepEqual([out.data.kept, out.data.resolved], [true, 0]);
  const hold = await db.from("escalations").select("state").eq("id", ana.hold).single();
  assert.equal(hold.data.state, "open");
});

test(
  "an address the workspace does not know, or a person erased, makes nobody and keeps nothing",
  { skip },
  async () => {
    const t = await workspace("owner-wrote-unknown");
    const before = await db.from("contacts").select("id", { count: "exact", head: true }).eq("tenant_id", t);
    const out = await wrote(t, `orders-${stamp}@supplier.example`, `g-${stamp}-3`);
    assert.equal(out.error, null, out.error?.message);
    assert.deepEqual([out.data.kept, out.data.why], [false, "not_known"]);
    const after_ = await db.from("contacts").select("id", { count: "exact", head: true }).eq("tenant_id", t);
    assert.equal(after_.count, before.count, "the owner's mail to a supplier stays theirs");

    const gone = await waiting(t, `gone-${stamp}@example.com`);
    const erase = await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", gone.contact);
    assert.equal(erase.error, null, erase.error?.message);
    const toErased = await wrote(t, `gone-${stamp}@example.com`, `g-${stamp}-4`);
    assert.equal(toErased.error, null, toErased.error?.message);
    assert.deepEqual([toErased.data.kept, toErased.data.why], [false, "not_known"]);
  },
);

test("the door is the service role's alone", { skip }, async () => {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!anonKey) return;
  const anon = createClient(URL_, anonKey, { auth: { persistSession: false } });
  const t = await workspace("owner-wrote-anon");
  const out = await anon.rpc("mailbox_owner_wrote", {
    p_tenant_id: t,
    p_address: "a@example.com",
    p_external_id: `g-${stamp}-5`,
    p_body: "x",
    p_channel_ts: new Date().toISOString(),
    p_meta: {},
    p_reasons: REASONS,
  });
  assert.ok(out.error, "refused");
});
