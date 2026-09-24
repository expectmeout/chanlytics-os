/**
 * Gate 1b integration test — the bot's memory, against REAL Postgres.
 *
 * This is the one place where a wrong answer reaches a paying customer: if
 * readThreadState returns the wrong turns, the live receptionist says the wrong
 * thing to someone's client. Pure-function tests can't cover it, because the
 * risk lives in the SQL (ordering, status filters, tenant scoping) rather than
 * in the mapping.
 *
 * Runs against the smoke-test tenant, never Marisa's, and cleans up after
 * itself. Skips (does not fail) without service-role credentials, so CI without
 * secrets stays green.
 *
 * Run: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node --test tooling/scripts/tests/thread-state.integration.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { readThreadState } from "@chanlytics/db";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SMOKE_SLUG = "chanlytics-smoke-test";
const skip = !URL || !KEY ? "no service-role credentials in env" : false;

let db;
let tenantId;
let contactId;
let conversationId;
const PHONE = "+15550009999";

before(async () => {
  if (skip) return;
  db = createClient(URL, KEY, { auth: { persistSession: false } });

  const { data: t } = await db.from("tenants").select("id").eq("slug", SMOKE_SLUG).single();
  tenantId = t.id;

  // A dedicated scratch contact so a rerun never collides with a prior run.
  await db.from("contacts").delete().eq("tenant_id", tenantId).eq("phone_e164", PHONE);
  const { data: c, error: cErr } = await db
    .from("contacts")
    .insert({ tenant_id: tenantId, phone_e164: PHONE, display_name: "Thread State Fixture" })
    .select("id")
    .single();
  if (cErr) throw new Error(`fixture contact: ${cErr.message}`);
  contactId = c.id;

  const { data: cv, error: cvErr } = await db
    .from("conversations")
    .insert({ tenant_id: tenantId, contact_id: contactId, last_message_at: new Date().toISOString() })
    .select("id")
    .single();
  if (cvErr) throw new Error(`fixture conversation: ${cvErr.message}`);
  conversationId = cv.id;

  const base = Date.now() - 60 * 60 * 1000;
  const at = (i) => new Date(base + i * 1000).toISOString();
  const rows = [
    // chronological; inserted out of order on purpose so ordering is tested
    {
      seq: 3,
      channel: "whatsapp",
      direction: "outbound",
      sender: "ai",
      type: "text",
      body: "We're open till 7 today.",
      status: "delivered",
      created_at: at(3),
    },
    {
      seq: 1,
      channel: "whatsapp",
      direction: "inbound",
      sender: "customer",
      type: "text",
      body: "hi are you open?",
      status: "received",
      created_at: at(1),
    },
    // never left the building — must NOT appear as something "we said"
    {
      seq: 4,
      channel: "whatsapp",
      direction: "outbound",
      sender: "human",
      type: "text",
      body: "DRAFT THAT WAS CANCELED",
      status: "canceled",
      created_at: at(4),
    },
    // media placeholder: no text to reason over
    {
      seq: 2,
      channel: "whatsapp",
      direction: "inbound",
      sender: "customer",
      type: "media",
      body: null,
      status: "received",
      created_at: at(2),
    },
    // cross-channel memory: the call the customer made
    {
      seq: 5,
      channel: "voice",
      direction: "inbound",
      sender: "system",
      type: "call_summary",
      body: "Caller asked about gel refills.",
      status: "received",
      created_at: at(5),
    },
    {
      seq: 6,
      channel: "whatsapp",
      direction: "outbound",
      sender: "human",
      type: "text",
      body: "Marisa here — happy to help.",
      status: "sent",
      created_at: at(6),
    },
    // Blob-era duplicate of the call above, imported by the backfill. The
    // native call_summary row is canonical; this must not double the call.
    {
      seq: 7,
      channel: "whatsapp",
      direction: "outbound",
      sender: "ai",
      type: "text",
      body: "[voice call note 2026-08-26T20:59] Caller phoned the salon line. Summary: gel refills.",
      status: "sent",
      created_at: at(7),
      meta: { backfill: true },
    },
    // An imported reply: its created_at is when the IMPORT ran, so it must not
    // spend today's rate cap.
    {
      seq: 8,
      channel: "whatsapp",
      direction: "outbound",
      sender: "ai",
      type: "text",
      body: "Imported reply from the old thread.",
      status: "sent",
      created_at: at(8),
      meta: { backfill: true },
    },
  ];
  const { error: mErr } = await db.from("messages").insert(
    rows.map((r) => ({
      tenant_id: tenantId,
      conversation_id: conversationId,
      contact_id: contactId,
      channel: r.channel,
      direction: r.direction,
      sender: r.sender,
      type: r.type,
      body: r.body,
      status: r.status,
      created_at: r.created_at,
      // meta is NOT NULL, and a batch insert builds ONE column list — a row
      // that omits the key gets an explicit null rather than the default.
      meta: r.meta ?? {},
      external_id: `fixture:${conversationId}:${r.seq}`,
    })),
  );
  if (mErr) throw new Error(`fixture messages: ${mErr.message}`);
});

after(async () => {
  if (skip || !db || !contactId) return;
  await db.from("messages").delete().eq("tenant_id", tenantId).eq("conversation_id", conversationId);
  await db.from("conversations").delete().eq("tenant_id", tenantId).eq("id", conversationId);
  await db.from("contacts").delete().eq("tenant_id", tenantId).eq("id", contactId);
});

test("history is chronological and maps senders to model roles", { skip }, async () => {
  const s = await readThreadState(db, tenantId, conversationId, null);
  assert.deepEqual(s.history, [
    { role: "user", content: "hi are you open?" },
    { role: "assistant", content: "We're open till 7 today." },
    { role: "assistant", content: "Caller asked about gel refills." },
    { role: "assistant", content: "Marisa here — happy to help." },
    { role: "assistant", content: "Imported reply from the old thread." },
  ]);
});

test("a canceled send is never presented to the model as something we said", { skip }, async () => {
  const s = await readThreadState(db, tenantId, conversationId, null);
  assert.ok(!s.history.some((h) => h.content.includes("CANCELED")), "canceled outbound leaked into the bot's memory");
});

test("media rows with no text are skipped rather than sent as empty turns", { skip }, async () => {
  const s = await readThreadState(db, tenantId, conversationId, null);
  assert.ok(s.history.every((h) => h.content.trim().length > 0));
});

test("the rate cap counts only delivered AI sends in the last 24h", { skip }, async () => {
  const s = await readThreadState(db, tenantId, conversationId, null);
  // one ai/delivered row in-window. The human sends, the canceled draft, and
  // the two BACKFILLED rows (whose created_at is the import, not a send) must
  // not spend the cap.
  assert.equal(s.replies.length, 1);
});

test("a Blob-era call note is dropped so the call is not counted twice", { skip }, async () => {
  const s = await readThreadState(db, tenantId, conversationId, null);
  const notes = s.history.filter((h) => h.content.includes("voice call note"));
  assert.equal(notes.length, 0, "imported note duplicated the native call_summary row");
  assert.equal(
    s.history.filter((h) => h.content.includes("gel refills")).length,
    1,
    "the call should appear exactly once",
  );
});

test("pausedUntil comes straight from the conversation row", { skip }, async () => {
  const iso = new Date(Date.now() + 3600_000).toISOString();
  const s = await readThreadState(db, tenantId, conversationId, iso);
  assert.equal(s.pausedUntil, new Date(iso).getTime());
  const none = await readThreadState(db, tenantId, conversationId, null);
  assert.equal(none.pausedUntil, 0);
});

test("history is scoped to the tenant — another tenant's id returns nothing", { skip }, async () => {
  const { data: other } = await db.from("tenants").select("id").neq("slug", SMOKE_SLUG).limit(1).single();
  const s = await readThreadState(db, other.id, conversationId, null);
  assert.deepEqual(s.history, [], "conversation rows crossed a tenant boundary");
  assert.equal(s.replies.length, 0);
});

test("history is capped so a long thread can't blow the model's context", { skip }, async () => {
  const s = await readThreadState(db, tenantId, conversationId, null, 2);
  assert.equal(s.history.length, 2);
  // the cap keeps the MOST RECENT turns, not the oldest
  assert.equal(s.history[1].content, "Imported reply from the old thread.");
});
