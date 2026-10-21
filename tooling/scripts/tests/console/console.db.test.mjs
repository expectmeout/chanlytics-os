/**
 * The Console against the replayed stack (00467, decision 0066).
 *
 * Staff show their second factor every session, no grace: a session of staff that has not is `needs_second_factor`
 * to platform_staff_state(), not staff to is_platform_admin(), and refused by every door behind it (Find, the overview).
 * The role is the database's (platform_admin_add sets it, adds or changes), its set is held by a CHECK, and nobody but
 * the caller can be asked about. The Console's tables are the service role's alone: a member, an owner included, reads
 * and writes none. Find answers a caller's whole number with the workspace alone, and a report's numbers start at 1001.
 * The sessions that show the factor enrol a real authenticator on the stack's Auth server (_second-factor.mjs).
 *
 * Skips without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
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
let staff;
let unshown;
let owner;
let caller;

async function signIn(email, password) {
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return client;
}

async function person(label, { factor = false } = {}) {
  const email = `console-${label}-${RUN}@example.com`;
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
  staff = await person("staff", { factor: true });
  unshown = await person("unshown");
  owner = await person("owner");
  for (const p of [staff, unshown])
    assert.match(
      ok(await db.rpc("platform_admin_add", { p_email: p.email, p_role: "support" })),
      /may now open the Console, as support/,
    );
  const w = ok(
    await owner.client.rpc("create_workspace", { p_name: "Console Shop", p_timezone: "America/Chicago" }).single(),
  );
  tenants.push(w.id);
  owner.tenant = w.id;
  owner.slug = w.slug;
  caller = ok(
    await db
      .from("contacts")
      .insert({ tenant_id: w.id, phone_e164: "+15550100777", display_name: "A caller" })
      .select("id")
      .single(),
  );
});

after(async () => {
  if (skip) return;
  for (const p of [staff, unshown]) if (p) await db.from("platform_admins").delete().eq("user_id", p.userId);
  for (const id of tenants) await db.from("tenants").delete().eq("id", id);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "staff show their second factor every session, no grace; everybody else is nobody to the Console",
  { skip },
  async () => {
    assert.equal(ok(await staff.client.rpc("platform_staff_state")), "support");
    assert.equal(ok(await staff.client.rpc("platform_role")), "support");
    assert.equal(ok(await staff.client.rpc("is_platform_admin")), true);

    assert.equal(ok(await unshown.client.rpc("platform_staff_state")), "needs_second_factor");
    assert.equal(ok(await unshown.client.rpc("platform_role")), null);
    assert.equal(ok(await unshown.client.rpc("is_platform_admin")), false, "a password alone opens nothing");
    const overview = await unshown.client.rpc("platform_overview");
    assert.equal(overview.error?.code, "42501", "and every door behind the gate holds");

    assert.equal(ok(await owner.client.rpc("platform_staff_state")), "none");
    assert.equal(ok(await owner.client.rpc("is_platform_admin")), false);
  },
);

test(
  "the role is the database's: added or changed by email at the console, held to three, never from the app",
  { skip },
  async () => {
    assert.match(
      ok(await db.rpc("platform_admin_add", { p_email: unshown.email, p_role: "billing" })),
      /was support, now billing/,
    );
    assert.match(
      ok(await db.rpc("platform_admin_add", { p_email: unshown.email, p_role: "billing" })),
      /nothing changed/,
    );
    assert.match(ok(await db.rpc("platform_admin_add", { p_email: unshown.email, p_role: "god" })), /is not a role/);
    assert.match(
      ok(await db.rpc("platform_admin_add", { p_email: "nobody-at-all@example.com", p_role: "owner" })),
      /no account/,
    );
    const [row] = ok(await db.from("platform_admins").select("role").eq("user_id", unshown.userId));
    assert.equal(row.role, "billing");
    const bad = await db.from("platform_admins").update({ role: "god" }).eq("user_id", unshown.userId);
    assert.equal(bad.error?.code, "23514", "the CHECK holds the set");
    // Never from the app: a member, staff included, cannot add anyone.
    for (const p of [staff, owner]) {
      const r = await p.client.rpc("platform_admin_add", { p_email: p.email, p_role: "owner" });
      assert.ok(r.error, "refused to a session");
    }
    ok(await db.rpc("platform_admin_add", { p_email: unshown.email, p_role: "support" }));
  },
);

test(
  "the Console's tables are the service role's alone: a member, its owner included, reads and writes none",
  { skip },
  async () => {
    ok(await db.from("support_reports").insert({ tenant_id: owner.tenant, user_id: owner.userId, words: "It broke." }));
    for (const table of ["platform_acts", "support_reports", "privacy_requests", "platform_claims"]) {
      for (const who of [owner, staff]) {
        const r = await who.client.from(table).select("*").limit(5);
        assert.ok(r.error || (r.data ?? []).length === 0, `${table}: a session reads nothing`);
      }
      const w = await staff.client.from(table).insert({ tenant_id: owner.tenant });
      assert.ok(w.error, `${table}: a session writes nothing`);
    }
  },
);

test(
  "a report's number starts at R-1001, and a request is kept by name once its workspace is gone",
  { skip },
  async () => {
    const [first] = ok(
      await db
        .from("support_reports")
        .insert({ tenant_id: owner.tenant, user_id: owner.userId, words: "Second." })
        .select("number"),
    );
    assert.ok(first.number >= 1001);
    const shortLived = ok(
      await owner.client.rpc("create_workspace", { p_name: "Gone Soon", p_timezone: "America/Chicago" }).single(),
    );
    const req = ok(
      await db
        .from("privacy_requests")
        .insert({
          kind: "delete_workspace",
          tenant_id: shortLived.id,
          slug: shortLived.slug,
          name: "Gone Soon",
          asked_by: owner.email,
          asked_at: "2026-10-13T12:00:00Z",
          due_at: "2026-11-12T12:00:00Z",
        })
        .select("id, number")
        .single(),
    );
    assert.ok(req.number >= 101);
    const act = ok(
      await db
        .from("platform_acts")
        .insert({
          actor_id: staff.userId,
          actor_role: "support",
          act: "request_file",
          tenant_id: shortLived.id,
          target_kind: "request",
          target_id: req.id,
          reason_kind: "found",
          outcome: "running",
        })
        .select("id")
        .single(),
    );
    ok(await db.from("tenants").delete().eq("id", shortLived.id));
    const [kept] = ok(await db.from("privacy_requests").select("tenant_id, name, slug").eq("id", req.id));
    assert.deepEqual(kept, { tenant_id: null, name: "Gone Soon", slug: shortLived.slug });
    const [logged] = ok(await db.from("platform_acts").select("tenant_id").eq("id", act.id));
    assert.equal(logged.tenant_id, null, "the log outlives the workspace too");
    const notTicket = await db.from("platform_acts").insert({
      actor_role: "support",
      act: "line_retry",
      target_kind: "line",
      reason_kind: "ticket",
      outcome: "running",
    });
    assert.equal(notTicket.error?.code, "23514", "a ticket as the reason names it");
  },
);

test(
  "Find: staff with their factor only; a caller's whole number answers with the workspace, never who called",
  { skip },
  async () => {
    assert.equal((await unshown.client.rpc("platform_find", { p_q: "Console Shop" })).error?.code, "42501");
    assert.equal((await owner.client.rpc("platform_find", { p_q: "Console Shop" })).error?.code, "42501");
    const byName = ok(await staff.client.rpc("platform_find", { p_q: "console shop" }));
    assert.ok(byName.some((r) => r.kind === "workspace" && r.tenant_id === owner.tenant));
    const byOwner = ok(await staff.client.rpc("platform_find", { p_q: owner.email }));
    assert.ok(byOwner.some((r) => r.kind === "owner" && r.tenant_id === owner.tenant));
    const byCaller = ok(await staff.client.rpc("platform_find", { p_q: "(555) 010-0777" }));
    const hit = byCaller.find((r) => r.kind === "caller");
    assert.ok(hit, "the workspace a caller's number reached");
    assert.equal(hit.tenant_id, owner.tenant);
    assert.ok(!JSON.stringify(hit).includes("A caller"), "never who called");
    assert.ok(!JSON.stringify(hit).includes(caller.id));
    const partial = ok(await staff.client.rpc("platform_find", { p_q: "0100777" }));
    assert.equal(partial.filter((r) => r.kind === "caller").length, 0, "a caller is matched by a whole number only");
    assert.deepEqual(ok(await staff.client.rpc("platform_find", { p_q: "x" })), [], "too short to search");
  },
);

test("Home's spend is summed by the database, a workspace a row, and the service role's alone", { skip }, async () => {
  ok(
    await db.from("ai_usage").insert({
      tenant_id: owner.tenant,
      purpose: "receptionist",
      model_asked: "claude-test",
      model: "claude-test",
      outcome: "answered",
      usd: 0.25,
    }),
  );
  const rows = ok(await db.rpc("platform_model_spend", { p_days: 30 }));
  const mine = rows.find((r) => r.tenant_id === owner.tenant);
  assert.equal(Number(mine.usd), 0.25);
  assert.ok((await staff.client.rpc("platform_model_spend", { p_days: 30 })).error, "not a session's to ask");
});

test(
  "the Admin log is written forward: finished once, then nothing in a row changes and no row is deleted",
  { skip },
  async () => {
    const act = ok(
      await db
        .from("platform_acts")
        .insert({
          actor_id: staff.userId,
          actor_role: "support",
          act: "line_retry",
          tenant_id: owner.tenant,
          target_kind: "workspace",
          reason_kind: "found",
          outcome: "running",
        })
        .select("id")
        .single(),
    );
    ok(
      await db
        .from("platform_acts")
        .update({ outcome: "done", finished_at: new Date().toISOString() })
        .eq("id", act.id),
    );
    const again = await db.from("platform_acts").update({ outcome: "failed", outcome_note: "Later." }).eq("id", act.id);
    assert.equal(again.error?.code, "23514", "finished once");
    const reworded = await db.from("platform_acts").update({ note: "Said otherwise." }).eq("id", act.id);
    assert.equal(reworded.error?.code, "23514", "who, what, where and why are said once");
    const gone = await db.from("platform_acts").delete().eq("id", act.id);
    assert.equal(gone.error?.code, "23514", "no row is deleted");
    assert.equal(ok(await db.from("platform_acts").select("id").eq("id", act.id)).length, 1);
  },
);
