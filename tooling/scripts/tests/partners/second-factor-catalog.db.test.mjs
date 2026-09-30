/**
 * A partner's password alone opens no door a seat opens (00218, 00261, 00280), proved by walking the catalog.
 *
 * 00261 named the doors a partner's seat could pass with a password and gated each; second-factor.db.test.mjs tries
 * those. It named doors, so a door it never named stayed open (reach_out_lead_timeline, partner_invitations_mine, and
 * the policy under it) and nothing said which the next one would be. This suite asks the database: every definer
 * function a session may call that reads the caller's seat (memberships or the partner record, by auth.uid()) either
 * asks for the second factor, directly or through a helper that does, or is named below with why a seat is not what
 * opens it. A new door that reads the seat and does neither fails here, and lists itself.
 *
 * It also proves the three fixes: the timeline and the invitations answer a session that showed its code and nothing
 * to one that did not, and the dashboard can ask, of the session alone, whether it holds a partner's seat it cannot
 * see (session_has_partner_seat), which is how a password-only partner is sent to the second step instead of being told
 * "No workspace found" (defect 45).
 *
 * Skips without a local database; the catalog walk needs the CLI (SUPABASE_CLI names the binary), as privileges does.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { showSecondFactor } from "../_second-factor.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const CLI = process.env.SUPABASE_CLI || "supabase";
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

/** One statement through the CLI: the catalog is not reachable through PostgREST. */
function query(sql) {
  const r = spawnSync(CLI, ["db", "query", "--local", "--output-format", "json", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  if (r.status !== 0) throw new Error(`supabase db query exited ${r.status}: ${(r.stdout + r.stderr).slice(-600)}`);
  const out = r.stdout;
  const start = out.search(/[[{]/);
  if (start < 0) return [];
  const end = out.lastIndexOf(out[start] === "{" ? "}" : "]");
  const parsed = JSON.parse(out.slice(start, end + 1));
  return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
}

let db;
const users = [];
const tenants = [];
const RUN = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
let partner;
let owner;

async function signIn(email, password) {
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return client;
}

async function person(label, { factor = false } = {}) {
  const email = `catalog-${label}-${RUN}@example.com`;
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
  partner.code = `ct-${Math.random().toString(36).slice(2, 8)}`;
  partner.id = ok(await partner.client.rpc("partner_become", { p_code: partner.code })).id;
  const w = ok(
    await owner.client
      .rpc("create_workspace", { p_name: "Catalog Shop", p_timezone: "America/Chicago", p_partner_code: partner.code })
      .single(),
  );
  tenants.push(w.id);
  owner.tenant = w.id;
});

after(async () => {
  if (skip) return;
  for (const id of tenants) await db.from("tenants").delete().eq("id", id);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

/**
 * The definer doors that read the caller's seat and do not ask for the second factor, and why a partner's seat is not
 * what opens each. A door that asks it (session_shows_second_factor, or is_acting_member, caller_has_permission or
 * has_permission, which do) is not listed: it is held. The list may only lose a name that has been gated.
 */
const NOT_A_SEATS_DOOR = {
  "delete_my_account()": "a person's own account, whichever seat they hold: it removes their own sign-in",
  "erase_contact(uuid,jsonb)": "the owner role only: a partner's seat is not an owner's",
  "lead_erase(uuid)": "the owner role only: a partner's seat is not an owner's",
  "scrub_ask_for_contact(uuid,uuid,text[])": "the owner role only: a partner's seat is not an owner's",
  "handover_accept(uuid)": "answers the person a workspace is handed to, by their proved address, never a seat",
  "handover_decline(uuid)": "answers the person a workspace is handed to, by their proved address, never a seat",
  "handovers_mine()": "lists the handovers addressed to the caller's proved address, and excludes the partner's own",
  "notification_mark(uuid,boolean,boolean)": "writes the caller's own read marks; answers no workspace content",
  "notifications_seen(uuid)": "writes the caller's own seen mark; answers no workspace content",
  "partner_invite(uuid,text)": "an owner of the workspace only (is_workspace_owner): a partner's seat is not one",
  "workspace_partner(uuid)": "an owner of the workspace only (is_workspace_owner): a partner's seat is not one",
  "session_has_partner_seat()":
    "answers the caller alone whether they hold a partner's seat: no workspace named, no content",
  "partner_payout_mark(uuid,text,text,bigint)": "a platform admin only",
  "partner_second_factor_reset(uuid,text)": "a platform admin only",
  "partner_standing_set(uuid,text,text)": "a platform admin only",
  "partner_status_set(uuid,text,text)": "a platform admin only",
};

test(
  "every definer door a session can call that reads the caller's seat asks for the second factor, or is named as not a seat's door",
  { skip },
  () => {
    const rows = query(`
    select p.oid::regprocedure::text as fn
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prosecdef
       and has_function_privilege('authenticated', p.oid, 'EXECUTE')
       and p.prosrc ~* '(from|join)\\s+(public\\.)?(memberships|partner_tenants|partners)\\M'
       and p.prosrc ~ 'auth\\.uid\\(\\)'
       and p.prosrc !~ 'session_shows_second_factor'
       and p.prosrc !~ '(is_acting_member|caller_has_permission|has_permission)\\s*\\('
     order by 1`);
    const open = rows.map((r) => r.fn);
    assert.deepEqual(
      open.filter((fn) => !(fn in NOT_A_SEATS_DOOR)),
      [],
      "a door that reads the caller's seat and never asks for the second factor: gate it as 00261 and 00280 do (a partner's seat counts for the calling session only once session_shows_second_factor()), or name it in NOT_A_SEATS_DOOR with why",
    );
    assert.deepEqual(
      Object.keys(NOT_A_SEATS_DOOR).filter((fn) => !open.includes(fn)),
      [],
      "named as not a seat's door but gone or gated since: take it off the list",
    );
  },
);

test(
  "a lead's timeline answers a session that showed the code, and 'workspace not found' to a password alone",
  { skip },
  async () => {
    const shown = partner.client;
    const password = await signIn(partner.email, partner.password);
    const lead = "66666666-6666-4666-8666-666666666666";
    // No such lead: null for a member who may read the workspace, the same not-found a stranger gets for one who may not.
    const seen = await shown.rpc("reach_out_lead_timeline", { p_tenant_id: owner.tenant, p_lead_id: lead });
    assert.equal(seen.error, null, seen.error?.message);
    assert.equal(seen.data, null);
    const hidden = await password.rpc("reach_out_lead_timeline", { p_tenant_id: owner.tenant, p_lead_id: lead });
    assert.equal(hidden.error?.code, "P0002", "a partner's password alone is not a member of the workspace");
    ok(await owner.client.rpc("reach_out_lead_timeline", { p_tenant_id: owner.tenant, p_lead_id: lead }));
  },
);

test(
  "a partner's invitations, by the door and by the table, are the session's that showed the code",
  { skip },
  async () => {
    const w2 = ok(
      await owner.client.rpc("create_workspace", { p_name: "Second Shop", p_timezone: "America/Chicago" }).single(),
    );
    tenants.push(w2.id);
    ok(await owner.client.rpc("partner_invite", { p_tenant: w2.id, p_code: partner.code }));
    const shown = partner.client;
    const password = await signIn(partner.email, partner.password);

    const mine = ok(await shown.rpc("partner_invitations_mine"));
    assert.equal(mine.length, 1, "the invitation, to the session that showed the code");
    assert.equal(mine[0].tenant_id, w2.id);
    assert.deepEqual(ok(await password.rpc("partner_invitations_mine")), [], "nothing to a password alone");

    const rows = async (c) => ok(await c.from("partner_invitations").select("tenant_id").eq("tenant_id", w2.id));
    assert.equal((await rows(shown)).length, 1, "the table, to the session that showed the code");
    assert.deepEqual(await rows(password), [], "and nothing of it to a password alone");
    assert.equal((await rows(owner.client)).length, 1, "the owner who sent it reads it on a password, as ever");
  },
);

test(
  "a partner's password alone cannot answer an invitation; the session that showed the code can",
  { skip },
  async () => {
    const w3 = ok(
      await owner.client.rpc("create_workspace", { p_name: "Third Shop", p_timezone: "America/Chicago" }).single(),
    );
    tenants.push(w3.id);
    ok(await owner.client.rpc("partner_invite", { p_tenant: w3.id, p_code: partner.code }));
    const password = await signIn(partner.email, partner.password);
    const refused = await password.rpc("partner_invite_decline", { p_tenant: w3.id });
    assert.equal(refused.error?.code, "42501", "a password alone does not decline it");
    assert.match(refused.error?.message ?? "", /authenticator/);
    const still = ok(await db.from("partner_invitations").select("declined_at").eq("tenant_id", w3.id));
    assert.equal(still[0].declined_at, null, "and it stands");
    ok(await partner.client.rpc("partner_invite_decline", { p_tenant: w3.id }));
    const done = ok(await db.from("partner_invitations").select("declined_at").eq("tenant_id", w3.id));
    assert.ok(done[0].declined_at, "the session that showed the code declines it");
  },
);

test(
  "a session can ask whether it holds a partner's seat it cannot see: its own and nobody's, so a workspace is never named",
  { skip },
  async () => {
    const shown = partner.client;
    const password = await signIn(partner.email, partner.password);
    const seats = async (c) => ok(await c.from("memberships").select("tenant_id").eq("tenant_id", owner.tenant));
    assert.deepEqual(await seats(password), [], "the seat is hidden from a password alone");
    assert.equal(
      ok(await password.rpc("session_has_partner_seat")),
      true,
      "and the session can still learn it holds one",
    );
    assert.equal(ok(await shown.rpc("session_has_partner_seat")), true);
    assert.equal(ok(await owner.client.rpc("session_has_partner_seat")), false, "an owner holds none");
    const stranger = await person("stranger");
    assert.equal(ok(await stranger.client.rpc("session_has_partner_seat")), false, "nor does a stranger");
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    const refused = await anon.rpc("session_has_partner_seat");
    assert.ok(refused.error, "the logged-out key is not offered it");
  },
);
