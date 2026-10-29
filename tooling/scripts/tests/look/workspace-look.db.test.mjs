/**
 * A workspace's colour on a real database (00490, decision 0075): what reading the source cannot prove.
 *
 * The colour is written by two doors. set_workspace_accent is the member's, as set_workspace_logo is: whoever may
 * change the workspace's settings, never a viewer, never for another workspace, one #rrggbb or nothing, the change's
 * event in the same transaction. wear_found_look is the website read's, the service role's alone: it fills the logo
 * and the colour only where the column is empty and no person ever set that field, so an owner's choice stands,
 * including the choice of none. Runs against Postgres in the database workflow; skipped without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY || !ANON
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes workspaces"
      : false;

const PASSWORD = "a-long-test-password-1";
let db;
let A;
let B;
const users = {};
const sessions = {};

async function workspace(name) {
  const t = await db
    .from("tenants")
    .insert({ slug: `look-${name}-${Date.now()}`, name })
    .select("id")
    .single();
  if (t.error) throw new Error(t.error.message);
  return t.data.id;
}

async function member(key, tenantId, role) {
  const email = `${key}-${Date.now()}@example.com`;
  const made = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (made.error) throw new Error(made.error.message);
  users[key] = made.data.user.id;
  const m = await db.from("memberships").insert({ tenant_id: tenantId, user_id: users[key], role });
  if (m.error) throw new Error(m.error.message);
  const as = createClient(URL_, ANON, { auth: { persistSession: false } });
  const signed = await as.auth.signInWithPassword({ email, password: PASSWORD });
  if (signed.error) throw new Error(signed.error.message);
  sessions[key] = as;
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await workspace("Harbor");
  B = await workspace("Bayside");
  await member("owner", A, "owner");
  await member("viewer", A, "viewer");
});

after(async () => {
  if (skip || !A) return;
  for (const t of [A, B]) {
    await db.from("events").delete().eq("tenant_id", t);
    await db.from("tenants").delete().eq("id", t);
  }
  for (const id of Object.values(users)) await db.auth.admin.deleteUser(id);
});

const setAccent = (who, tenantId, accent) =>
  sessions[who].rpc("set_workspace_accent", { p_tenant_id: tenantId, p_accent: accent });
const wear = (tenantId, logo, accent) =>
  db.rpc("wear_found_look", { p_tenant_id: tenantId, p_logo_path: logo, p_accent: accent });
const lookOf = async (tenantId) =>
  (await db.from("tenants").select("logo_path, accent").eq("id", tenantId).single()).data;
const eventsOf = async (tenantId) =>
  (await db.from("events").select("data").eq("tenant_id", tenantId).eq("kind", "settings.changed").order("created_at"))
    .data;

test(
  "the website read wears what it found where the workspace has nothing, once, and says so in one event",
  { skip },
  async () => {
    const logo = `${B}/${randomUUID()}.png`;
    const first = await wear(B, logo, "#2A6F97");
    assert.equal(first.error, null, first.error?.message);
    assert.deepEqual(first.data, { logo: true, accent: true });
    assert.deepEqual(await lookOf(B), { logo_path: logo, accent: "#2a6f97" }, "stored lower-case");
    const events = await eventsOf(B);
    assert.equal(events.length, 1);
    assert.deepEqual(events[0].data, { fields: ["logo", "accent"], by: null, from: "website", version: null });

    const again = await wear(B, `${B}/${randomUUID()}.png`, "#c4452e");
    assert.deepEqual(again.data, { logo: false, accent: false }, "what is worn is kept");
    assert.deepEqual(await lookOf(B), { logo_path: logo, accent: "#2a6f97" });
    assert.equal((await eventsOf(B)).length, 1, "nothing worn, nothing said");

    const bad = await wear(B, `${A}/${randomUUID()}.png`, "");
    assert.equal(bad.error?.code, "22023", "another workspace's folder is refused");
    const shapeless = await wear(B, "", "blue");
    assert.equal(shapeless.error?.code, "22023", "a colour is one #rrggbb");
  },
);

test(
  "the owner sets the colour through the door, and what a person set or cleared the read never touches",
  { skip },
  async () => {
    const r1 = await setAccent("owner", A, "#C4452E");
    assert.equal(r1.error, null, r1.error?.message);
    assert.equal(r1.data, null, "nothing held before");
    assert.equal((await lookOf(A)).accent, "#c4452e");
    const r2 = await setAccent("owner", A, "");
    assert.equal(r2.data, "#c4452e", "the colour it held");
    assert.equal((await lookOf(A)).accent, null, "an empty colour takes it away");
    const events = await eventsOf(A);
    assert.equal(events.length, 2);
    assert.deepEqual(events[0].data, { fields: ["accent"], by: users.owner, version: null });

    const worn = await wear(A, `${A}/${randomUUID()}.png`, "#2a6f97");
    assert.deepEqual(
      worn.data,
      { logo: true, accent: false },
      "the logo nobody set is worn; the colour a person cleared stands",
    );
    assert.equal((await lookOf(A)).accent, null);

    const shapeless = await setAccent("owner", A, "#GGGGGG");
    assert.equal(shapeless.error?.code, "22023", shapeless.error?.message);
  },
);

test("nobody else may set it, and no session may call the read's door", { skip }, async () => {
  const viewer = await setAccent("viewer", A, "#2a6f97");
  assert.equal(viewer.error?.code, "42501", viewer.error?.message);
  const other = await setAccent("owner", B, "#2a6f97");
  assert.equal(other.error?.code, "42501", "the owner of one workspace is nobody in another");
  const found = await sessions.owner.rpc("wear_found_look", { p_tenant_id: A, p_logo_path: "", p_accent: "#2a6f97" });
  assert.equal(found.error?.code, "42501", `the service role's alone: ${found.error?.message}`);
  const direct = await sessions.owner.from("tenants").update({ accent: "#2a6f97" }).eq("id", A).select("id");
  assert.equal((direct.data ?? []).length, 0, "no session writes the column itself");
  const shape = await db.from("tenants").update({ accent: "#ABCDEF" }).eq("id", A).select("id");
  assert.equal(shape.error?.code, "23514", "tenants_accent_shape holds even the service role to lower-case hex");
});
