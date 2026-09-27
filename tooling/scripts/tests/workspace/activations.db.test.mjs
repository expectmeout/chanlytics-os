/**
 * The activation record (00108), proved on a real Postgres with real
 * sessions: every member reads it, only an owner writes it, a member of
 * another workspace sees nothing, and the capability set is closed.
 *
 * Runs the way jobs-outbox.db.test.mjs does: against the database
 * `supabase start` builds on this machine, never production. The sessions
 * are real: users are made with the admin API and sign in with a password
 * through the anon key, so RLS judges them as the dashboard's client would.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// The local stack's anon key, as `supabase status -o env` prints it (ANON_KEY).
// The workflow exports it beside the service key; a key never sits in source,
// even the demo one, because the secret scanner cannot tell them apart.
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

let db;
let tenantId;
let otherTenantId;
const users = [];

/** A real session for a fresh user with this role in this workspace. */
async function memberClient(role, tenant = tenantId) {
  const email = `act-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  const m = await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role });
  assert.equal(m.error, null, m.error?.message);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, userId: made.data.user.id };
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const t = await db
    .from("tenants")
    .insert({ slug: `activations-${Date.now()}`, name: "Activations" })
    .select("id")
    .single();
  assert.equal(t.error, null, t.error?.message);
  tenantId = t.data.id;
  const o = await db
    .from("tenants")
    .insert({ slug: `activations-other-${Date.now()}`, name: "Other" })
    .select("id")
    .single();
  assert.equal(o.error, null, o.error?.message);
  otherTenantId = o.data.id;
});

after(async () => {
  if (skip) return;
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
  if (tenantId) await db.from("tenants").delete().eq("id", tenantId);
  if (otherTenantId) await db.from("tenants").delete().eq("id", otherTenantId);
});

test(
  "an owner activates; the row records who and when; a second activation replaces, never duplicates",
  { skip },
  async () => {
    const owner = await memberClient("owner");
    const first = await owner.client
      .from("capability_activations")
      .upsert(
        { tenant_id: tenantId, capability: "voice", activated_by: owner.userId },
        { onConflict: "tenant_id,capability" },
      )
      .select("capability, activated_by, deactivated_at");
    assert.equal(first.error, null, first.error?.message);
    assert.equal(first.data[0].activated_by, owner.userId);
    assert.equal(first.data[0].deactivated_at, null);
    const again = await owner.client
      .from("capability_activations")
      .upsert(
        { tenant_id: tenantId, capability: "voice", activated_by: owner.userId, note: "tried it from my phone" },
        { onConflict: "tenant_id,capability" },
      )
      .select("note");
    assert.equal(again.error, null, again.error?.message);
    const rows = await db.from("capability_activations").select("capability").eq("tenant_id", tenantId);
    assert.equal(rows.data.length, 1, "one row per capability");
    const off = await owner.client
      .from("capability_activations")
      .update({ deactivated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("capability", "voice")
      .select("deactivated_at");
    assert.equal(off.error, null, off.error?.message);
    assert.ok(off.data[0].deactivated_at, "switched off, the row stays");
  },
);

test("an operator and a viewer read it and cannot write it; a stranger sees nothing", { skip }, async () => {
  const operator = await memberClient("operator");
  const viewer = await memberClient("viewer");
  const stranger = await memberClient("owner", otherTenantId);
  for (const [who, c] of [
    ["operator", operator.client],
    ["viewer", viewer.client],
  ]) {
    const read = await c.from("capability_activations").select("capability").eq("tenant_id", tenantId);
    assert.equal(read.error, null, `${who} reads: ${read.error?.message}`);
    assert.equal(read.data.length, 1, `${who} sees the row`);
    const write = await c
      .from("capability_activations")
      .upsert({ tenant_id: tenantId, capability: "whatsapp" }, { onConflict: "tenant_id,capability" });
    assert.notEqual(write.error, null, `${who} must not write`);
    // An UPDATE RLS refuses is a silent zero rows, never an error: count them.
    const upd = await c
      .from("capability_activations")
      .update({ note: "x" })
      .eq("tenant_id", tenantId)
      .eq("capability", "voice")
      .select("capability");
    assert.equal((upd.data ?? []).length, 0, `${who} must not update`);
  }
  const far = await stranger.client.from("capability_activations").select("capability").eq("tenant_id", tenantId);
  assert.equal(far.error, null, far.error?.message);
  assert.equal(far.data.length, 0, "another workspace's owner sees nothing");
  const reach = await stranger.client
    .from("capability_activations")
    .upsert({ tenant_id: tenantId, capability: "sms" }, { onConflict: "tenant_id,capability" });
  assert.notEqual(reach.error, null, "and cannot write into it");
});

test("the capability set is closed", { skip }, async () => {
  const bad = await db.from("capability_activations").insert({ tenant_id: tenantId, capability: "fax" });
  assert.notEqual(bad.error, null);
  assert.match(bad.error.message, /capability_activations_capability_check|violates check constraint/);
});
