/**
 * A reply by email and its receipts -- on a real database.
 *
 * 00128 merges the provider's ids into a JSON column in one statement, beside
 * a trigger that writes the same column; messages_guard decides which status
 * moves a receipt may make; a suppression is about an address a person may
 * since have corrected. Triggers, a definer function's grants and what a JSON
 * merge keeps are what reading source cannot prove, so these run against
 * Postgres in the database workflow; skipped without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes customers"
      : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const {
  ingestInboundEmail,
  lastInboundEmail,
  mailboxOfTenant,
  recordEmailStatus,
  sentEmailWithMessageId,
  stampEmailSent,
  suppressEmailOf,
} = await import(pathToFileURL(path.join(ROOT, "packages/db/dist/index.js")).href);

let db;
let tenantId;
let otherId;
let person;
const stamp = Date.now().toString(36);

/** A queued email reply, as the reply verb's row is born: its id known first, its request frozen in meta. */
async function queuedReply(status = "queued") {
  const id = globalThis.crypto.randomUUID();
  const { error } = await db.from("messages").insert({
    id,
    tenant_id: tenantId,
    conversation_id: person.conversation_id,
    contact_id: person.contact_id,
    channel: "email",
    direction: "outbound",
    sender: "human",
    type: "text",
    body: "We can do Saturday at 9.",
    status: "queued",
    meta: {
      email: {
        subject: "Re: Quote",
        to: ["ana@example.com"],
        request: { to: ["ana@example.com"], idempotency_key: id },
      },
    },
  });
  assert.equal(error, null, error?.message);
  if (status !== "queued") await db.from("messages").update({ status }).eq("id", id);
  return id;
}
const row = async (id) =>
  (await db.from("messages").select("status, external_id, error, meta").eq("id", id).single()).data;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  for (const slug of ["email-reply", "email-reply-other"]) {
    const { data, error } = await db
      .from("tenants")
      .insert({ slug: `${slug}-${stamp}`, name: slug })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (slug === "email-reply") tenantId = data.id;
    else otherId = data.id;
  }
  person = await ingestInboundEmail(db, {
    tenantId,
    address: "ana@example.com",
    receivedId: `rcv-${stamp}-1`,
    body: "Can you do Saturday?",
    channelTs: new Date(Date.now() - 60_000).toISOString(),
    meta: {
      email: {
        subject: "Quote",
        message_id: "<q1@customer.example>",
        references: ["<q0@customer.example>"],
        from: "Ana@Example.com",
      },
    },
  });
});

after(async () => {
  if (skip) return;
  for (const id of [tenantId, otherId]) if (id) await db.from("tenants").delete().eq("id", id);
});

test(
  "the email a reply answers is the person's latest on that thread, read inside that workspace and conversation only",
  { skip },
  async () => {
    await ingestInboundEmail(db, {
      tenantId,
      address: "ana@example.com",
      receivedId: `rcv-${stamp}-2`,
      body: "Or Sunday?",
      channelTs: new Date().toISOString(),
      meta: {
        email: {
          subject: "Re: Quote",
          message_id: "<q2@customer.example>",
          references: ["<q0@customer.example>", "<q1@customer.example>"],
          from: "Ana@Example.com",
        },
      },
    });
    const parent = await lastInboundEmail(db, tenantId, person.conversation_id);
    assert.deepEqual(
      [parent.rfcMessageId, parent.subject, parent.from, parent.references],
      ["<q2@customer.example>", "Re: Quote", "Ana@Example.com", ["<q0@customer.example>", "<q1@customer.example>"]],
    );
    assert.equal(
      await lastInboundEmail(db, otherId, person.conversation_id),
      null,
      "another workspace asking about this thread is handed nothing",
    );
    assert.equal(await mailboxOfTenant(db, tenantId), null, "a workspace with no mailbox has no email line");
  },
);

test(
  "a sent email learns its ids in one statement: nothing the row kept is lost, no status moves, and only this workspace's outbound email can be stamped",
  { skip },
  async () => {
    const id = await queuedReply();
    const first = await stampEmailSent(db, {
      tenantId,
      messageId: id,
      providerId: "re_1",
      rfcMessageId: "<abc@mail.chanlytics.com>",
    });
    assert.deepEqual(
      first,
      { status: "queued", conversationId: person.conversation_id },
      "REGRESSION guard: a receipt that made the row `sent` would make the send's own finalize read as a cancel that won",
    );
    let m = await row(id);
    assert.deepEqual(
      [m.status, m.external_id, m.meta.email.message_id, m.meta.email.subject, m.meta.email.request.idempotency_key],
      ["queued", "re_1", "<abc@mail.chanlytics.com>", "Re: Quote", id],
    );

    // The send's own write, then the trigger's stamp, then a second receipt: each keeps what the others wrote.
    await db.from("messages").update({ status: "sent" }).eq("id", id);
    await stampEmailSent(db, { tenantId, messageId: id, providerId: "re_other", rfcMessageId: null });
    m = await row(id);
    assert.equal(m.external_id, "re_1", "the first id is the id");
    assert.equal(
      m.meta.email.message_id,
      "<abc@mail.chanlytics.com>",
      "a receipt that carries no Message-ID erases none",
    );
    assert.ok(m.meta.status_at?.sent, "messages_guard's own stamp in the same column survives");
    assert.equal(
      await sentEmailWithMessageId(db, tenantId, "<abc@mail.chanlytics.com>"),
      true,
      "which is how this email, coming back round a forward, is known for ours",
    );

    assert.equal(
      await stampEmailSent(db, { tenantId: otherId, messageId: id, providerId: "re_x", rfcMessageId: null }),
      null,
      "a tag naming another workspace reaches no row",
    );
    assert.equal(
      await stampEmailSent(db, { tenantId, messageId: person.message_id, providerId: "re_x", rfcMessageId: null }),
      null,
      "an inbound email is not one we sent",
    );
    const anon = createClient(URL_, process.env.SUPABASE_ANON_KEY ?? KEY, { auth: { persistSession: false } });
    if (process.env.SUPABASE_ANON_KEY) {
      const { error } = await anon.rpc("stamp_email_sent", {
        p_tenant_id: tenantId,
        p_message_id: id,
        p_provider_id: "x",
        p_rfc_message_id: null,
      });
      assert.ok(error, "the function is the service role's alone");
    }
  },
);

test(
  "a receipt moves a row forward and no other way: delivered after sent, failed after either, and a late or repeated one is let go without an error",
  { skip },
  async () => {
    const id = await queuedReply("sent");
    await recordEmailStatus(db, { tenantId, messageId: id, status: "delivered", error: null });
    assert.equal((await row(id)).status, "delivered");
    await recordEmailStatus(db, {
      tenantId,
      messageId: id,
      status: "failed",
      error: { provider: "bounced", kind: "Permanent" },
    });
    const failed = await row(id);
    assert.deepEqual(
      [failed.status, failed.error.provider],
      ["failed", "bounced"],
      "a bounce after a relay's `delivered` is still a bounce",
    );
    await recordEmailStatus(db, { tenantId, messageId: id, status: "delivered", error: null });
    assert.equal((await row(id)).status, "failed", "terminal is kept, and the out-of-order receipt did not throw");
    await recordEmailStatus(db, { tenantId: otherId, messageId: id, status: "delivered", error: null });
  },
);

test(
  "a suppression stops the address the email went to, when it is still the person's; a corrected address is a different address",
  { skip },
  async () => {
    const id = await queuedReply("sent");
    const at = new Date().toISOString();
    assert.equal(
      await suppressEmailOf(db, {
        tenantId,
        messageId: id,
        addresses: ["someone.else@example.com"],
        reason: "hard_bounce",
        at,
      }),
      null,
    );
    assert.equal(
      await suppressEmailOf(db, { tenantId, messageId: id, addresses: [], reason: "hard_bounce", at }),
      null,
    );
    assert.equal(
      await suppressEmailOf(db, { tenantId, messageId: id, addresses: ["ana@example.com"], reason: "hard_bounce", at }),
      person.contact_id,
    );
    assert.equal(
      await suppressEmailOf(db, { tenantId, messageId: id, addresses: ["ana@example.com"], reason: "complaint", at }),
      null,
      "already stopped: the first reason stands, and nothing is announced twice",
    );
    const { data: c } = await db
      .from("contacts")
      .select("email_suppressed_reason")
      .eq("id", person.contact_id)
      .single();
    assert.equal(c.email_suppressed_reason, "hard_bounce");

    // The owner corrects the address (00126 clears the suppression with it); a late bounce for the old one stops nothing.
    await db.from("contacts").update({ email: "ana.new@example.com" }).eq("id", person.contact_id);
    assert.equal(
      await suppressEmailOf(db, { tenantId, messageId: id, addresses: ["ana@example.com"], reason: "hard_bounce", at }),
      null,
    );
    const { data: clean } = await db
      .from("contacts")
      .select("email, email_suppressed_at")
      .eq("id", person.contact_id)
      .single();
    assert.deepEqual(clean, { email: "ana.new@example.com", email_suppressed_at: null });
  },
);
