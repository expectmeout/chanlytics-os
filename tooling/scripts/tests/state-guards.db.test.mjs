/**
 * The edges a state machine keeps (00106), proved on a real Postgres: a sent
 * broadcast cannot be scheduled again, an escalation resolves once, an
 * answering line is not re-provisioned by a late retry. Every move a writer
 * in the repo actually makes still passes, and so does a same-state update.
 *
 * Runs the way jobs-outbox.db.test.mjs does: against the database
 * `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite writes rows"
    : false;

let db;
let tenantId;
let templateId;
let conversationId;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const t = await db.from("tenants").insert({ slug: `guards-${Date.now()}`, name: "Guards" }).select("id").single();
  assert.equal(t.error, null, t.error?.message);
  tenantId = t.data.id;
  const tpl = await db.from("templates").insert({ tenant_id: tenantId, channel: "whatsapp", name: "visit_reminder", language: "en_US" }).select("id").single();
  assert.equal(tpl.error, null, tpl.error?.message);
  templateId = tpl.data.id;
  const c = await db.from("contacts").insert({ tenant_id: tenantId, phone_e164: "+15550000001" }).select("id").single();
  assert.equal(c.error, null, c.error?.message);
  const v = await db.from("conversations").insert({ tenant_id: tenantId, contact_id: c.data.id }).select("id").single();
  assert.equal(v.error, null, v.error?.message);
  conversationId = v.data.id;
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("tenants").delete().eq("id", tenantId);
});

async function broadcast(state) {
  const { data, error } = await db
    .from("broadcasts")
    .insert({ tenant_id: tenantId, name: `run ${state}`, template_id: templateId, template_name: "visit_reminder", template_language: "en_US", state, scheduled_for: new Date().toISOString() })
    .select("id")
    .single();
  assert.equal(error, null, error?.message);
  return data.id;
}

/** One update keyed on the id alone, exactly as the writers do. */
const move = (table, id, patch) => db.from(table).update(patch).eq("id", id).select("id");

test("a broadcast takes every edge its writers take, and no other", { skip }, async () => {
  const allowed = [
    ["pending_approval", "scheduled"], ["pending_approval", "canceled"], ["pending_approval", "failed"],
    ["scheduled", "sending"], ["scheduled", "canceled"], ["scheduled", "failed"], ["scheduled", "pending_approval"],
    ["sending", "sent"], ["sending", "failed"], ["sending", "canceled"],
  ];
  for (const [from, to] of allowed) {
    const r = await move("broadcasts", await broadcast(from), { state: to });
    assert.equal(r.error, null, `${from} -> ${to} is a move a writer makes: ${r.error?.message}`);
  }
  const refused = [
    ["sent", "scheduled"], ["sent", "sending"], ["canceled", "scheduled"], ["failed", "sending"], ["failed", "scheduled"],
    ["pending_approval", "sending"], ["pending_approval", "sent"], ["scheduled", "sent"], ["sending", "scheduled"], ["sending", "pending_approval"],
  ];
  for (const [from, to] of refused) {
    const r = await move("broadcasts", await broadcast(from), { state: to });
    assert.match(r.error?.message ?? "", /refused/, `${from} -> ${to} must be refused`);
  }
  const same = await broadcast("sent");
  const r = await move("broadcasts", same, { state: "sent", name: "renamed after sending" });
  assert.equal(r.error, null, `a same-state update is not a move: ${r.error?.message}`);
});

test("an escalation resolves once; a new concern is a new row", { skip }, async () => {
  const { data, error } = await db
    .from("escalations")
    .insert({ tenant_id: tenantId, conversation_id: conversationId, reason: "manual", details: "guard test" })
    .select("id")
    .single();
  assert.equal(error, null, error?.message);
  const refreshed = await move("escalations", data.id, { state: "open", details: "the same concern, said again" });
  assert.equal(refreshed.error, null, `refreshing an open row is not a move: ${refreshed.error?.message}`);
  const resolved = await move("escalations", data.id, { state: "resolved" });
  assert.equal(resolved.error, null, resolved.error?.message);
  const reopened = await move("escalations", data.id, { state: "open" });
  assert.match(reopened.error?.message ?? "", /terminal/, "resolved -> open must be refused");
});

test("a line's voice moves forward; an answering line is not re-provisioned, and none is not a destination", { skip }, async () => {
  const { data, error } = await db
    .from("lines")
    .insert({ tenant_id: tenantId, e164: "+15550000099", kind: "chanlytics", provider: "dry", voice_state: "provisioning" })
    .select("id")
    .single();
  assert.equal(error, null, error?.message);
  const id = data.id;
  const step = async (to, ok, why) => {
    const r = await move("lines", id, { voice_state: to });
    if (ok) assert.equal(r.error, null, `${why}: ${r.error?.message}`);
    else assert.match(r.error?.message ?? "", /refused/, why);
  };
  await step("provisioning", true, "a stuck line is taken again with the same state");
  await step("failed", true, "the saga did not finish");
  await step("provisioning", true, "a failed line may be retried");
  await step("answering", true, "the saga finished");
  await step("provisioning", false, "a late retry must not re-provision an answering line");
  await step("none", false, "a line is released, not reset");
  await step("failed", true, "an answering line may still fail");
});
