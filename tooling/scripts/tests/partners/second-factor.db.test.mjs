/**
 * A partner's second factor reset by the platform (decision 0013, M2), against the replayed stack: only a platform
 * admin may record it, with why; the record is kept on the partner and written as platform.acted on each workspace
 * the partner sits on as partner; and the answer is the account to remove the factor from. Skips without a local
 * database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users and workspaces"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

const ok = (r) => {
  assert.equal(r.error, null, r.error?.message);
  return r.data;
};

let db;
const users = [];
const tenants = [];
const RUN = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
let partner;
let owner;
let admin;

async function person(label) {
  const email = `factor-${label}-${RUN}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const u = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(u.error, null, u.error?.message);
  users.push(u.data.user.id);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, userId: u.data.user.id };
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  partner = await person("partner");
  owner = await person("owner");
  admin = await person("admin");
  partner.code = `fa-${Math.random().toString(36).slice(2, 8)}`;
  partner.id = ok(await partner.client.rpc("partner_become", { p_code: partner.code })).id;
  const w = ok(
    await owner.client
      .rpc("create_workspace", { p_name: "Factor Shop", p_timezone: "America/Chicago", p_partner_code: partner.code })
      .single(),
  );
  tenants.push(w.id);
  owner.tenant = w.id;
  ok(await db.from("platform_admins").insert({ user_id: admin.userId }));
});

after(async () => {
  if (skip) return;
  await db.from("platform_admins").delete().eq("user_id", admin.userId);
  for (const id of tenants) await db.from("tenants").delete().eq("id", id);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test("only a platform admin records a reset, with why; the answer is the partner's account", { skip }, async () => {
  const self = await partner.client.rpc("partner_second_factor_reset", { p_partner: partner.id, p_why: "mine" });
  assert.equal(self.error?.code, "42501", "not even the partner");
  const theOwner = await owner.client.rpc("partner_second_factor_reset", { p_partner: partner.id, p_why: "x" });
  assert.equal(theOwner.error?.code, "42501");
  const blank = await admin.client.rpc("partner_second_factor_reset", { p_partner: partner.id, p_why: "  " });
  assert.equal(blank.error?.code, "22023", "why is required");
  const nobody = await admin.client.rpc("partner_second_factor_reset", {
    p_partner: "44444444-4444-4444-8444-444444444444",
    p_why: "x",
  });
  assert.equal(nobody.error?.code, "P0002");

  const account = ok(
    await admin.client.rpc("partner_second_factor_reset", {
      p_partner: partner.id,
      p_why: "Lost their phone; called them back on the number we hold.",
    }),
  );
  assert.equal(account, partner.userId);
  const [row] = ok(
    await db
      .from("partners")
      .select("second_factor_reset_at, second_factor_reset_by, second_factor_reset_why")
      .eq("id", partner.id),
  );
  assert.ok(row.second_factor_reset_at);
  assert.equal(row.second_factor_reset_by, admin.userId);
  assert.match(row.second_factor_reset_why, /called them back/);
  const acted = ok(
    await db.from("events").select("tenant_id, data").eq("kind", "platform.acted").eq("tenant_id", owner.tenant),
  ).filter((e) => e.data?.action === "partner_second_factor_reset");
  assert.equal(acted.length, 1, "on the workspace the partner sits on");
  assert.equal(acted[0].data.by, admin.userId);
});
