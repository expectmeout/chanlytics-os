/**
 * A partner's second factor (decision 0013), against the replayed stack.
 *
 * M3 (00218): a partner's seat needs a session that showed its second factor. On a session that has not, the seat and
 * its workspace are not visible, is_acting_member and caller_has_permission answer false, and becoming a partner or
 * setting a workspace up for a business is refused. Every other role is unchanged, and the SQL says what contracts'
 * seatNeedsSecondFactor says, role by role. The sessions that show it enrol a real authenticator on the stack's Auth
 * server (_second-factor.mjs).
 *
 * M2 (00215): only a platform admin may record a reset, with why; the record is kept on the partner and written as
 * platform.acted on each workspace the partner sits on as partner; and the answer is the account to remove the factor
 * from.
 *
 * Skips without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { seatNeedsSecondFactor } from "@chanlytics/contracts";
import { showSecondFactor } from "../_second-factor.mjs";

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

/** A signed-in session for this address: the first factor alone, as a password gives it. */
async function signIn(email, password) {
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return client;
}

async function person(label, { factor = false } = {}) {
  const email = `factor-${label}-${RUN}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const u = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(u.error, null, u.error?.message);
  users.push(u.data.user.id);
  const client = await signIn(email, password);
  if (factor) await showSecondFactor(client);
  return { client, userId: u.data.user.id, email, password };
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  partner = await person("partner", { factor: true });
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

/* ---------------------------------------------------------------------------------------------- M3: the seat */

test("becoming a partner asks for the second factor first; a session that showed it may", { skip }, async () => {
  const fresh = await person("fresh");
  const refused = await fresh.client.rpc("partner_become", { p_code: `fr-${Math.random().toString(36).slice(2, 8)}` });
  assert.equal(refused.error?.code, "42501", "a password alone does not make a partner");
  assert.match(refused.error?.message ?? "", /authenticator/);
  const setUp = await fresh.client.rpc("create_workspace_for_business", {
    p_name: "Nope Shop",
    p_timezone: "America/Chicago",
    p_owner_email: `nope-${RUN}@example.com`,
  });
  assert.equal(setUp.error?.code, "42501");
  await showSecondFactor(fresh.client);
  ok(await fresh.client.rpc("partner_become", { p_code: `fr-${Math.random().toString(36).slice(2, 8)}` }));
});

test("a partner's seat on a session without the code: not visible, not acting, no permission", { skip }, async () => {
  const shown = partner.client;
  const password = await signIn(partner.email, partner.password);
  const seats = async (c) => ok(await c.from("memberships").select("tenant_id, role").eq("tenant_id", owner.tenant));
  const named = async (c) => ok(await c.from("tenants").select("id").eq("id", owner.tenant)).map((t) => t.id);
  const acting = async (c) => ok(await c.rpc("is_acting_member", { p_tenant: owner.tenant }));
  const may = async (c) =>
    ok(await c.rpc("caller_has_permission", { p_tenant_id: owner.tenant, p_permission: "settings" }));

  assert.deepEqual(await seats(shown), [{ tenant_id: owner.tenant, role: "partner" }]);
  assert.deepEqual(await named(shown), [owner.tenant]);
  assert.equal(await acting(shown), true);
  assert.equal(await may(shown), true);

  assert.deepEqual(await seats(password), [], "the seat is hidden");
  assert.deepEqual(await named(password), [], "and the workspace with it");
  assert.equal(await acting(password), false);
  assert.equal(await may(password), false);
  assert.equal(ok(await password.rpc("session_shows_second_factor")), false);
  assert.equal(ok(await shown.rpc("session_shows_second_factor")), true);

  // The owner signed in with a password alone, as ever.
  assert.deepEqual(await named(owner.client), [owner.tenant]);
  assert.equal(await acting(owner.client), true);
});

test(
  "the definer doors a session calls straight through PostgREST (00247): a partner's password alone opens none of them, and the session that showed the code opens each as before",
  { skip },
  async () => {
    const shown = partner.client;
    const password = await signIn(partner.email, partner.password);
    const period = new Date().toISOString().slice(0, 7);

    // The lead finder's doors ask has_permission(auth.uid(), …, 'find'): the month's read stands for all eleven.
    ok(await shown.rpc("lead_month_used", { p_tenant_id: owner.tenant, p_period: period }));
    const month = await password.rpc("lead_month_used", { p_tenant_id: owner.tenant, p_period: period });
    assert.equal(month.error?.code, "42501", "no finding, and no spending the month, on a password alone");

    // Every member's email.
    const roster = ok(await shown.rpc("team_roster", { p_tenant_id: owner.tenant }));
    assert.ok(
      roster.some((r) => r.role === "partner"),
      "the roster, to the session that showed the code",
    );
    const hidden = await password.rpc("team_roster", { p_tenant_id: owner.tenant });
    assert.equal(hidden.error?.code, "42501", "and nobody's email to a password alone");

    // The partner's own reads: the workspaces they brought, and the money.
    const brought = ok(await shown.rpc("partner_overview"));
    assert.ok(brought.some((r) => r.tenant_id === owner.tenant));
    assert.deepEqual(ok(await password.rpc("partner_overview")), [], "nothing, as to a caller who is no partner");
    assert.deepEqual(ok(await password.rpc("partner_workspace_money")), []);

    // Reach out's reads of the workspace.
    const search = "55555555-5555-4555-8555-555555555555";
    const reach = await password.rpc("reach_out_reach", { p_tenant_id: owner.tenant, p_search_id: search });
    assert.equal(reach.error?.code, "P0002", "the workspace is not found, as it is to a stranger");
    const report = await password.rpc("reach_out_chain_report", { p_tenant_id: owner.tenant, p_root_id: search });
    assert.equal(report.error?.code, "P0002");
    const shownReach = await shown.rpc("reach_out_reach", { p_tenant_id: owner.tenant, p_search_id: search });
    assert.equal(shownReach.error, null, `the session that showed the code reads it: ${shownReach.error?.message}`);

    // Every other role is unchanged: the owner, on a password, as ever.
    ok(await owner.client.rpc("team_roster", { p_tenant_id: owner.tenant }));
    ok(await owner.client.rpc("lead_month_used", { p_tenant_id: owner.tenant, p_period: period }));
  },
);

test("the SQL says what contracts says, role by role, on a session without the code", { skip }, async () => {
  const ACTS = { owner: true, operator: true, partner: true, viewer: false };
  for (const role of Object.keys(ACTS)) {
    const who = await person(`seat-${role}`);
    ok(await db.from("memberships").insert({ tenant_id: owner.tenant, user_id: who.userId, role }));
    const acting = ok(await who.client.rpc("is_acting_member", { p_tenant: owner.tenant }));
    assert.equal(acting, ACTS[role] && !seatNeedsSecondFactor(role), `${role} acts`);
    const seen = ok(await who.client.from("memberships").select("role").eq("tenant_id", owner.tenant)).length;
    assert.equal(seen, seatNeedsSecondFactor(role) ? 0 : 1, `${role} sees its seat`);
  }
});
