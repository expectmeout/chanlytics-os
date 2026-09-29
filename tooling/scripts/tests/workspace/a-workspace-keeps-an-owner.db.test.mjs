/**
 * A workspace keeps an owner while anyone is in it (00267), on a real Postgres through PostgREST, as the team's door
 * writes. The door counts the owners first, for its words; two removals at once each counted two, and both wrote. The
 * deferred trigger judges each change at its end under a lock per workspace: two owners removed at once leave one, the
 * last owner is neither removed nor demoted while others remain, and the refusal is `last_owner` (P0001), which
 * workspace/team.ts turns into the words it already says. A workspace being deleted, and one everyone leaves, are let
 * go. Runs against the database `supabase start` builds, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine"
      : false;

let db;
const made = { users: [], tenants: [] };
const RUN = Date.now().toString(36);
const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
const lastOwner = (r, why) => {
  assert.ok(r.error, `REGRESSION: written: ${why}`);
  assert.equal(r.error.code, "P0001", `${why}: ${r.error.message}`);
  assert.equal(r.error.message, "last_owner", why);
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});
after(async () => {
  if (skip) return;
  for (const id of made.tenants) await db.from("tenants").delete().eq("id", id);
  for (const id of made.users) await db.auth.admin.deleteUser(id).catch(() => undefined);
});

/** A workspace with a team of these roles, each a person of their own; answers the membership ids by role. */
async function team(tag, roles) {
  const t = ok(
    await db
      .from("tenants")
      .insert({ name: `Owners ${tag}`, slug: `owners-${tag}-${RUN}` })
      .select("id")
      .single(),
    "tenant",
  ).id;
  made.tenants.push(t);
  const seats = [];
  for (const [n, role] of roles.entries()) {
    const email = `owners-${tag}-${n}-${RUN}@example.com`;
    const u = ok(
      await db.auth.admin.createUser({ email, password: `pw-${RUN}-Aa1!`, email_confirm: true }),
      "user",
    ).user;
    made.users.push(u.id);
    const m = ok(
      await db.from("memberships").insert({ tenant_id: t, user_id: u.id, role }).select("id").single(),
      "membership",
    );
    seats.push({ id: m.id, role });
  }
  return { t, seats };
}
const rolesOf = async (t) =>
  ok(await db.from("memberships").select("role").eq("tenant_id", t), "roles")
    .map((m) => m.role)
    .sort();

test("two owners removed at once leave one: the second removal counts the first", { skip }, async () => {
  const { t, seats } = await team("race", ["owner", "owner", "operator"]);
  const owners = seats.filter((s) => s.role === "owner");
  const both = await Promise.all(owners.map((o) => db.from("memberships").delete().eq("id", o.id)));
  assert.equal(both.filter((r) => r.error === null).length, 1, "exactly one of the two removals is written");
  lastOwner(both.find((r) => r.error) ?? {}, "the second removal of the last owner");
  assert.deepEqual(await rolesOf(t), ["operator", "owner"]);
});

test("the last owner is neither removed nor demoted while anyone else is in the workspace", { skip }, async () => {
  const { t, seats } = await team("last", ["owner", "viewer"]);
  const [owner] = seats;
  lastOwner(await db.from("memberships").delete().eq("id", owner.id), "removing the last owner");
  for (const role of ["operator", "viewer", "partner"]) {
    lastOwner(
      await db.from("memberships").update({ role }).eq("id", owner.id).select("id"),
      `demoting the last owner to ${role}`,
    );
  }
  assert.deepEqual(await rolesOf(t), ["owner", "viewer"]);
});

test("an owner hands over: promote another, then step down, and the new owner is the last", { skip }, async () => {
  const { t, seats } = await team("handover", ["owner", "operator", "viewer"]);
  const [owner, operator] = seats;
  ok(await db.from("memberships").update({ role: "owner" }).eq("id", operator.id).select("id"), "promote");
  ok(await db.from("memberships").update({ role: "viewer" }).eq("id", owner.id).select("id"), "step down");
  assert.deepEqual(await rolesOf(t), ["owner", "viewer", "viewer"]);
  lastOwner(await db.from("memberships").delete().eq("id", operator.id), "and the new owner is now the last");
});

test("a workspace everyone leaves, and one deleted, are let go", { skip }, async () => {
  const alone = await team("alone", ["owner"]);
  ok(await db.from("memberships").delete().eq("id", alone.seats[0].id), "the only member leaves");
  assert.deepEqual(await rolesOf(alone.t), []);

  const whole = await team("whole", ["owner", "viewer"]);
  ok(await db.from("memberships").delete().eq("tenant_id", whole.t), "everyone leaves at once");
  assert.deepEqual(await rolesOf(whole.t), []);

  const gone = await team("gone", ["owner", "operator"]);
  ok(await db.from("tenants").delete().eq("id", gone.t), "a deleted workspace takes its team with it");
  assert.deepEqual(await rolesOf(gone.t), []);
});
