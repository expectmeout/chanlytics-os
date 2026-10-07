/**
 * A text's answer is a job that answers it once, on a real database (00347, decision 0031 Phase 2).
 *
 * The door records the text (ingest_inbound) and leaves its answer to an inbound_answer job; the job's own ingest is a
 * redelivery, and it goes on only while the message is unprocessed and no reply names it. What the job reads is proved
 * here against the schema the replay builds: the redelivery answers is_new false with the message's processed state;
 * replyNaming finds the receptionist's reply by the message it names (meta.reply_to), a draft as queued and one that
 * left as sent, a withdrawn draft as none, and nothing of another thread or workspace; the job is held once per message
 * while it lives, in the reply lane. Skipped without a local database; never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces and customers"
      : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { ingestInbound, markProcessed, replyNaming } = await import(at("packages/db/dist/index.js"));
const { scheduleJobOnce } = await import(at("packages/jobs/dist/index.js"));

const ok = (res, what = "") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let db;
let A;
let B;
let serial = 0;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const workspace = async (tag) =>
    ok(
      await db
        .from("tenants")
        .insert({ slug: `text-job-${tag}-${RUN}`, name: `Text job ${tag}` })
        .select("id")
        .single(),
    ).id;
  A = await workspace("a");
  B = await workspace("b");
});

after(async () => {
  if (skip || !A) return;
  for (const t of [A, B]) {
    await db.from("jobs").delete().eq("tenant_id", t);
    await db.from("events").delete().eq("tenant_id", t);
    await db.from("tenants").delete().eq("id", t);
  }
});

/** One text kept as the door keeps it, from a customer nobody else in this file is. */
async function textIn(tenantId) {
  const n = ++serial;
  const phone = `+1646555${String(1400 + n).slice(-4)}`;
  const p = {
    tenantId,
    channel: "sms",
    identityExternalId: phone.slice(1),
    phoneE164: phone,
    waProfileName: null,
    messageExternalId: `SM${RUN}${n}`,
    type: "text",
    body: "are you open saturday?",
    channelTs: new Date().toISOString(),
  };
  return { p, ing: await ingestInbound(db, p) };
}

/** A reply of the receptionist's in the thread, naming `messageId` as the message it answers. */
async function replyTo(tenantId, ing, status, messageId = ing.message_id) {
  return ok(
    await db
      .from("messages")
      .insert({
        tenant_id: tenantId,
        conversation_id: ing.conversation_id,
        contact_id: ing.contact_id,
        channel: "sms",
        direction: "outbound",
        sender: "ai",
        body: "Yes, from 9.",
        status,
        meta: { reply_to: messageId },
      })
      .select("id")
      .single(),
    "reply",
  ).id;
}

test("the job's ingest is a redelivery that says whether the message was finished with", { skip }, async () => {
  const { p, ing } = await textIn(A);
  assert.deepEqual([ing.is_new, ing.processed], [true, false], "the door's: kept now");
  const again = await ingestInbound(db, p);
  assert.deepEqual(
    [again.is_new, again.processed, again.message_id],
    [false, false, ing.message_id],
    "the job's: the same message, not finished with",
  );
  await markProcessed(db, A, ing.message_id);
  const after = await ingestInbound(db, p);
  assert.deepEqual([after.is_new, after.processed], [false, true], "a job claimed after the stamp finds it finished");
});

test(
  "a reply is found by the message it names: a draft as queued, one that left as sent, a withdrawn one as none",
  { skip },
  async () => {
    const { ing } = await textIn(A);
    assert.equal(await replyNaming(db, A, ing.conversation_id, ing.message_id), null, "nothing has answered it");

    const draft = await replyTo(A, ing, "queued");
    assert.equal(await replyNaming(db, A, ing.conversation_id, ing.message_id), "queued");
    ok(await db.from("messages").update({ status: "canceled" }).eq("id", draft), "withdraw");
    assert.equal(await replyNaming(db, A, ing.conversation_id, ing.message_id), null, "a withdrawn draft is no answer");

    await replyTo(A, ing, "sent");
    assert.equal(await replyNaming(db, A, ing.conversation_id, ing.message_id), "sent");
    assert.equal(
      await replyNaming(db, B, ing.conversation_id, ing.message_id),
      null,
      "another workspace asks of nothing it holds",
    );

    // A reply naming another message of the same thread answers that one, not this.
    const other = await textIn(A);
    await replyTo(A, other.ing, "sent", "00000000-0000-4000-8000-000000000000");
    assert.equal(await replyNaming(db, A, other.ing.conversation_id, other.ing.message_id), null);
  },
);

test("a text's job is held once per message while it lives, in the reply lane", { skip }, async () => {
  const { ing } = await textIn(A);
  const job = { tenantId: A, kind: "inbound_answer", dueAt: new Date(Date.now() + 3_600_000) };
  const payload = { message_id: ing.message_id, conversation_id: ing.conversation_id, contact_id: ing.contact_id };
  assert.equal(await scheduleJobOnce(db, { ...job, payload }), "scheduled");
  assert.equal(await scheduleJobOnce(db, { ...job, payload }), "already_scheduled", "a second door knock adds none");
  const rows = ok(
    await db.from("jobs").select("kind, lane, dedupe_key, state").eq("tenant_id", A).eq("kind", "inbound_answer"),
  );
  assert.deepEqual(rows, [
    { kind: "inbound_answer", lane: 0, dedupe_key: `inbound_answer:${ing.message_id}`, state: "scheduled" },
  ]);
});
