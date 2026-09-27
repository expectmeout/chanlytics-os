/**
 * Reading a team without holding the keys to every team.
 *
 * Both problems here came from one fact: `memberships_self_select` is
 * `user_id = auth.uid()`, so a session client can see its OWN membership row
 * and nobody else's, and emails live in auth.users which PostgREST does not
 * expose. With no way to read a roster on the caller's client, the service
 * role was the only door — and the shape of the code then followed from what
 * the JS admin API happens to offer:
 *
 *   * the roster looped auth.admin.getUserById once per member, sequentially;
 *   * finding one address called listUsers({ perPage: 1000 }), which is
 *     O(every account on the platform) and silently WRONG past a thousand —
 *     an existing user on page two reads as new, the invite email then fails
 *     because the account exists, and the invitation row is rolled back.
 *
 * Two definer functions replace both, and each checks the CALLER's standing
 * itself. That is what makes them safe on the session client, which is the
 * actual win: one fewer privileged path, with the speed as a side effect.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readRaw, readCode } from "../_source.mjs";

const sql = readRaw("supabase/migrations/00022_team_reads.sql");
const service = readCode("apps/dashboard/src/server/workspace/team.ts");
const teamRoute = readCode("apps/dashboard/app/api/v1/team/route.ts");

/* ------------------------- the functions guard themselves ----------------- */

test("the roster refuses a caller who is not in the workspace", () => {
  // A definer function that reads auth.users without checking who is asking is
  // an email-enumeration endpoint for every workspace at once.
  assert.match(
    sql,
    /from public\.memberships m\s*\n\s*where m\.tenant_id = p_tenant_id and m\.user_id = auth\.uid\(\)/,
  );
  assert.match(sql, /raise exception 'Not a member of this workspace\.' using errcode = '42501'/);
});

test("the email lookup is OWNER-only, not member-only", () => {
  // It answers "does this address have an account", which is an oracle. Only
  // the role that can already invite that address — and learn the same thing
  // from the outcome — may ask.
  assert.match(sql, /and m\.role = 'owner'/);
  assert.match(sql, /raise exception 'Only an owner can invite people\.'/);
});

test("both are definer, scoped, and closed to anon", () => {
  for (const fn of ["team_roster(uuid)", "lookup_user_for_invite(uuid, text)"]) {
    assert.ok(sql.includes(`revoke execute on function public.${fn} from public, anon;`), fn);
    assert.ok(sql.includes(`grant  execute on function public.${fn} to authenticated;`), fn);
  }
  assert.equal(sql.split("security definer").length - 1, 2);
  assert.equal(sql.split("set search_path = public").length - 1, 2);
});

test("every column reference is qualified, because these return `email` and `role`", () => {
  // PL/pgSQL keeps OUT parameters in scope for the whole body, so an
  // unqualified `email` or `role` is ambiguous — and it fails when CALLED, not
  // when created. That exact mistake shipped in 00021.
  assert.match(sql, /select m\.id, m\.user_id, u\.email::text, m\.role, m\.created_at/);
  assert.ok(!/where email =/.test(sql) && !/where role =/.test(sql), "no bare OUT-param names");
});

test("the email match is case-insensitive", () => {
  // A case mismatch would re-create the very bug this replaces: a known
  // account read as new, and an invite that fails on send.
  assert.match(sql, /lower\(u\.email\) = lower\(btrim\(p_email\)\)/);
});

/* --------------------------- the callers changed -------------------------- */

test("the roster no longer loops the admin API, or uses the service role", () => {
  assert.ok(service.includes('db.rpc("team_roster"'), "one query, not N");
  assert.ok(!service.includes("auth.admin.getUserById"), "the per-member loop is gone");
  assert.ok(!service.includes("auth.admin.listUsers"), "the platform-wide scan is gone");
});

test("the roster runs on the CALLER's client", () => {
  // The point is not speed — it is one fewer path holding the service role.
  assert.match(service, /export async function teamRoster\(\s*db: SupabaseClient<Database>,/);
  assert.ok(teamRoute.includes("teamRoster(ctx.supabase,"));
});

// The invite's email lookup moved to the platform's client in 00121, and which
// client asks is proved by running it: team-writes.test.mjs.

test("the one remaining admin call is the one that must be", () => {
  // Sending a signup email is not something SQL can do.
  const adminCalls = service.match(/auth\.admin\.\w+/g) ?? [];
  assert.deepEqual([...new Set(adminCalls)], ["auth.admin.inviteUserByEmail"]);
});

test("invitations are read by plain RLS, as they always could have been", () => {
  // invitations_member_read already scopes them to the caller's workspaces.
  assert.ok(service.includes('.from("invitations")'));
  assert.ok(service.includes("Promise.all"), "roster and invites still go together");
});
