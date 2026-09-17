/**
 * An email is taken in once -- on a real database.
 *
 * 00127's unique index is the replay gate for a webhook the provider delivers
 * at least once; ingestInboundEmail is three writes around the atomic ingest,
 * each idempotent, and whether they find the right person and leave one row is
 * what reading source cannot prove. People's list says which wires a person's
 * words travelled. These run against Postgres in the database workflow;
 * skipped without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite writes customers"
    : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { ingestInboundEmail, mailboxFor, sentEmailWithMessageId } = await import(pathToFileURL(path.join(ROOT, "packages/db/dist/index.js")).href);
const { scheduleJobOnce } = await import(pathToFileURL(path.join(ROOT, "packages/jobs/dist/index.js")).href);

/** A reply token nobody else has: tokens are unique across the platform, and the database suites run side by side. */
const token = () => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(24)), (b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");

let db;
let tenantId;
let otherId;
const stamp = Date.now().toString(36);
const email = (receivedId, address, over = {}) => ({
  tenantId, address, receivedId, body: "Can you do Saturday at 9?", channelTs: new Date().toISOString(),
  meta: { email: { subject: "Quote", message_id: `<${receivedId}@customer.example>` } }, ...over,
});

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  for (const slug of ["email-intake", "email-intake-other"]) {
    const { data, error } = await db.from("tenants").insert({ slug: `${slug}-${stamp}`, name: slug }).select("id").single();
    if (error) throw new Error(error.message);
    if (slug === "email-intake") tenantId = data.id; else otherId = data.id;
  }
});

after(async () => {
  if (skip) return;
  for (const id of [tenantId, otherId]) if (id) await db.from("tenants").delete().eq("id", id);
});

test("the ledger holds one intake per received email per mailbox: a replayed webhook schedules nothing, a second mailbox is a second job", { skip }, async () => {
  // Due tomorrow: the ledger suites beside this one claim whatever is due in the whole database, and these rows are here for their index, not to be run.
  const job = (mailboxId, receivedId, tenant = tenantId) => scheduleJobOnce(db, { tenantId: tenant, kind: "email_ingest", dueAt: new Date(Date.now() + 86_400_000), payload: { mailbox_id: mailboxId, received_id: receivedId } });
  assert.equal(await job("mb-1", "rcv-1"), "scheduled");
  assert.equal(await job("mb-1", "rcv-1"), "already_scheduled", "Resend delivering the same webhook again");
  assert.equal(await job("mb-2", "rcv-1", otherId), "scheduled", "the same email, addressed to another workspace too");
  assert.equal(await job("mb-1", "rcv-2"), "scheduled");
  const { count } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("kind", "email_ingest").in("tenant_id", [tenantId, otherId]);
  assert.equal(count, 3);
  const { error: otherKind } = await db.from("jobs").insert([1, 2].map(() => ({ tenant_id: tenantId, kind: "blob_thread_erase", due_at: new Date(Date.now() + 86_400_000).toISOString(), payload: { mailbox_id: "mb-1", received_id: "rcv-1" } })));
  assert.equal(otherKind, null, "the rule is email_ingest's alone");
});

test("a person who arrives by email is made once, under their address, and the address is on their own row; a replay is the same message", { skip }, async () => {
  const first = await ingestInboundEmail(db, email("rcv-10", "ana@example.com"));
  assert.deepEqual([first.is_new, first.processed], [true, false]);
  const { data: person } = await db.from("contacts").select("id, email, phone_e164").eq("id", first.contact_id).single();
  assert.deepEqual(person, { id: first.contact_id, email: "ana@example.com", phone_e164: null }, "a person with an address and no number");
  const { data: message } = await db.from("messages").select("channel, direction, sender, external_id, body, meta").eq("id", first.message_id).single();
  assert.deepEqual([message.channel, message.direction, message.sender, message.external_id, message.body], ["email", "inbound", "customer", "rcv-10", "Can you do Saturday at 9?"]);
  assert.equal(message.meta.email.subject, "Quote");

  const replay = await ingestInboundEmail(db, email("rcv-10", "ana@example.com"));
  assert.deepEqual([replay.message_id, replay.is_new, replay.processed], [first.message_id, false, false], "the same row, unhandled: what the intake resumes on");

  const second = await ingestInboundEmail(db, email("rcv-11", "ana@example.com"));
  assert.deepEqual([second.contact_id, second.conversation_id, second.is_new], [first.contact_id, first.conversation_id, true], "their next email joins them, on the one thread a person has");
});

test("a person the owner already gave this address to is joined, not doubled; what an owner typed is never overwritten", { skip }, async () => {
  const { data: known } = await db.from("contacts").insert({ tenant_id: tenantId, phone_e164: "+15550100301", display_name: "Bo Reyes", email: "bo@example.com" }).select("id").single();
  const got = await ingestInboundEmail(db, email("rcv-20", "bo@example.com"));
  assert.equal(got.contact_id, known.id, "REGRESSION guard: the ingest finds people by identity, and nobody had written from this address yet");
  const { count } = await db.from("contacts").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("email", "bo@example.com");
  assert.equal(count, 1);

  // Someone known by number writes from an address nobody recorded: a second person until the owner merges them. The product does not guess.
  const stranger = await ingestInboundEmail(db, email("rcv-21", "bo.personal@example.com"));
  assert.notEqual(stranger.contact_id, known.id);

  // The same address in another workspace is another person.
  const elsewhere = await ingestInboundEmail(db, { ...email("rcv-22", "bo@example.com"), tenantId: otherId });
  assert.notEqual(elsewhere.contact_id, known.id);
});

test("a mailbox is found by its published address or by a reply token, the rotated-out one included; our own sent email is known by its Message-ID", { skip }, async () => {
  const [live, prev] = [token(), token()];
  const { data: mb, error } = await db.from("mailboxes").insert({ tenant_id: tenantId, local_part: `intake-${stamp}`, reply_token: live, reply_token_prev: prev, from_name: "Intake" }).select("id").single();
  assert.equal(error, null, error?.message);
  assert.equal((await mailboxFor(db, { kind: "mailbox", localPart: `intake-${stamp}` }))?.id, mb.id);
  assert.equal((await mailboxFor(db, { kind: "reply", token: live }))?.id, mb.id);
  assert.equal((await mailboxFor(db, { kind: "reply", token: prev }))?.id, mb.id, "a rotation keeps the old token routing");
  assert.equal(await mailboxFor(db, { kind: "reply", token: token() }), null);
  assert.equal(await mailboxFor(db, { kind: "mailbox", localPart: "nobody-here" }), null);

  const { data: conv } = await db.from("conversations").select("id, contact_id").eq("tenant_id", tenantId).limit(1).single();
  await db.from("messages").insert({ tenant_id: tenantId, conversation_id: conv.id, contact_id: conv.contact_id, channel: "email", direction: "outbound", sender: "human", type: "text", body: "We can.", status: "sent", meta: { email: { message_id: "<ours-1@mail.chanlytics.com>" } } });
  assert.equal(await sentEmailWithMessageId(db, tenantId, "<ours-1@mail.chanlytics.com>"), true);
  assert.equal(await sentEmailWithMessageId(db, otherId, "<ours-1@mail.chanlytics.com>"), false, "another workspace's ledger is not ours");
  assert.equal(await sentEmailWithMessageId(db, tenantId, "<q1@customer.example>"), false, "an inbound email's id is not something we sent");
});

test("People says which wires a person's words travelled", { skip }, async () => {
  const { data } = await db.rpc("people_list", { p_tenant_id: tenantId, p_query: "ana@example.com" });
  assert.equal(data.length, 1);
  assert.deepEqual([data[0].has_chat, data[0].message_channels, data[0].channels], [true, ["email"], ["email"]]);
  const { data: all } = await db.rpc("people_list", { p_tenant_id: tenantId });
  assert.ok(all.every((r) => Array.isArray(r.message_channels)), "an empty list for someone who has written nothing, never null");
});
