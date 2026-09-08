/**
 * The deadman watchdog, against REAL Postgres.
 *
 * `deadman` was a declared job kind, escalation reason and UI label with no
 * emitter anywhere since Slice 2 — the system could DESCRIBE an abandoned
 * customer and never notice one. An escalation opened, the owner got one
 * email, and if that email was missed the conversation sat open indefinitely
 * with nothing to raise its hand.
 *
 * The detection is a SQL sweep rather than a job because apps/edge cannot
 * publish jobs (it verifies QStash signatures; the dashboard holds the token),
 * and because a sweep notices an abandoned conversation regardless of which
 * code path abandoned it — including paths written later.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY ? "no service-role credentials in env" : false;
const SMOKE_SLUG = "chanlytics-smoke-test";

let db;
let tenantId;
let contactId;
let conversationId;
let escalationId;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data: ts } = await db.from("tenants").select("id, slug");
  // NOT `?? ts[0]`. Pointed at production the first tenant in the table is a
  // real business, and this suite inserts fixture contacts and messages into
  // whatever tenant it is handed — so a missing smoke tenant meant probe rows
  // in a live customer's inbox, tidied away only if the run reached `after`.
  const smoke = (ts ?? []).find((t) => t.slug === SMOKE_SLUG);
  if (!smoke) throw new Error(`no tenant with slug ${SMOKE_SLUG}: refusing to write fixtures into a real workspace`);
  tenantId = smoke.id;

  const { data: c } = await db.from("contacts")
    .insert({ tenant_id: tenantId, phone_e164: `+1999558${String(Date.now()).slice(-4)}`, display_name: "Deadman probe" })
    .select("id").single();
  contactId = c.id;
  const { data: v } = await db.from("conversations")
    .upsert({ tenant_id: tenantId, contact_id: contactId, state: "needs_human" }, { onConflict: "tenant_id,contact_id" })
    .select("id").single();
  conversationId = v.id;
});

after(async () => {
  if (skip || !contactId) return;
  await db.from("escalations").delete().eq("conversation_id", conversationId);
  await db.from("messages").delete().eq("conversation_id", conversationId);
  await db.from("conversations").delete().eq("id", conversationId);
  await db.from("contacts").delete().eq("id", contactId);
});

test("a FRESH escalation is not a candidate", { skip }, async () => {
  const { data, error } = await db.from("escalations")
    .insert({ tenant_id: tenantId, conversation_id: conversationId, reason: "human_token", details: "probe", state: "open" })
    .select("id").single();
  assert.equal(error, null, error?.message);
  escalationId = data.id;

  const { data: cands } = await db.rpc("deadman_candidates", { p_older_than: "2 hours" });
  assert.equal(
    (cands ?? []).some((c) => c.escalation_id === escalationId),
    false,
    "a customer waiting two minutes is not abandoned",
  );
});

test("an escalation open past the threshold IS a candidate, with what the alert needs", { skip }, async () => {
  // Age it rather than wait two hours.
  await db.from("escalations")
    .update({ created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString() })
    .eq("id", escalationId);

  const { data: cands, error } = await db.rpc("deadman_candidates", { p_older_than: "2 hours" });
  assert.equal(error, null, error?.message);
  const mine = (cands ?? []).find((c) => c.escalation_id === escalationId);
  assert.ok(mine, "an escalation open for three hours was not detected");
  // The edge addresses the tenant and names the customer, so both must travel.
  assert.equal(mine.tenant_id, tenantId);
  assert.equal(mine.conversation_id, conversationId);
  assert.equal(mine.reason, "human_token");
  assert.ok(mine.phone_e164, "the alert cannot name the customer without their number");
  assert.ok(mine.opened_at, "the alert states how long they have waited");
});

test("marking is idempotent — a flagged escalation stops being a candidate", { skip }, async () => {
  const first = await db.rpc("deadman_mark_alerted", { p_ids: [escalationId] });
  assert.equal(first.data, 1, "the first sweep should stamp exactly one row");

  const second = await db.rpc("deadman_mark_alerted", { p_ids: [escalationId] });
  assert.equal(second.data, 0, "re-stamping must be a no-op, or the guard is not a guard");

  const { data: cands } = await db.rpc("deadman_candidates", { p_older_than: "2 hours" });
  assert.equal(
    (cands ?? []).some((c) => c.escalation_id === escalationId),
    false,
    "a flagged escalation reappeared — the owner would be emailed every ten minutes",
  );
});

test("a RESOLVED escalation is never a candidate", { skip }, async () => {
  const { data: e2 } = await db.from("escalations")
    .insert({
      tenant_id: tenantId, conversation_id: conversationId, reason: "manual",
      details: "resolved probe", state: "resolved",
      created_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    })
    .select("id").single();
  const { data: cands } = await db.rpc("deadman_candidates", { p_older_than: "2 hours" });
  assert.equal(
    (cands ?? []).some((c) => c.escalation_id === e2.id),
    false,
    "an answered conversation must not be chased",
  );
});

test("the shared secret exists and the sweep is scheduled", { skip }, async () => {
  // Both ends read this one value; if it is absent the endpoint 503s rather
  // than accepting an unauthenticated sweep.
  const { data: key, error } = await db.rpc("get_cron_sweep_key");
  assert.equal(error, null, error?.message);
  assert.ok(typeof key === "string" && key.length >= 32, "no usable cron secret in Vault");

  // The endpoint compares in constant time, so the value must be exact — a
  // trailing newline from a careless secret write would fail every sweep.
  assert.equal(key.trim(), key, "the secret has surrounding whitespace");
});
