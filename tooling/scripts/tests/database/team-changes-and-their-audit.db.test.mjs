/**
 * A team change and the row that says who made it are one transaction (00277: team_change_role, team_remove,
 * team_join, team_invite, team_invite_withdraw and their helpers team_owner_or_refuse and team_decision), proved on a
 * real Postgres through PostgREST, called as the dashboard's service client calls them (workspace/team.ts).
 *
 * The role change, the removal and the invitation used to write the ledger afterwards, on another client, and a failed
 * audit row was a log line: the change stood, unrecorded. What is proved here, and how:
 *   - the door: only the service role executes any of them (a signed-in owner and the anon key are refused with
 *     nothing changed), and the actor the dashboard passes must own the workspace it acts on (a member who is not an
 *     owner, an owner of another workspace and nobody at all are `forbidden`);
 *   - each change writes exactly the row it should (from/to, via, undo_of, the role a removed member held), and a
 *     refusal writes neither the change nor a decision: what a call refused leaves behind is counted, not assumed;
 *   - atomicity, on the rows: a change made and its decision are both there after a success. And on the failure that
 *     matters, a database that cannot write the decision: a trigger that refuses every team decision is put on
 *     `decisions` inside one transaction that never commits (through the CLI, as sweep-registry.db.test.mjs turns a
 *     clock), and each function is called in a savepoint. Each raises and leaves the membership, the invitation and
 *     the ledger as they were, so a change is never left unrecorded, which is the defect this migration closes;
 *   - the last owner stays one under concurrency: two owners stepping down at the same moment leave exactly one, the
 *     second refused as `last_owner`; two owners each demoting or removing the OTHER at the same moment leave exactly
 *     one owner and one refusal (never a deadlock), and the refused call leaves no decision.
 *
 * `last_owner` cannot be reached through team_remove: it refuses the actor's own membership first (`self_remove`),
 * and an actor who owns the workspace while another owner is the target means two owners exist. It is the count's
 * backstop, and the deferred trigger of 00271 stands behind it (a-workspace-keeps-an-owner.db.test.mjs).
 *
 * The last block proves 00371's three doors and one lookup the same way: team_invite_renew (an owner sends an open
 * invitation again: seven days from now, one more `invite` decision saying `resent`, the first untouched; owner only;
 * an accepted, revoked or unknown invitation is not_found), team_invite_renew_withdraw (a mail that could not go takes
 * the expiry and ONLY that decision back), team_leave (any member leaves, by their own hand; the last owner is refused;
 * a non-member is not_found; two leaving at once, or a leave against a removal, never deadlock) and
 * lookup_user_for_invite (an account an invitation made and nobody opened is not one to seat).
 *
 * Runs the way a-workspace-keeps-an-owner.db.test.mjs does, against the database `supabase start` builds on this
 * machine, never production; the atomicity block goes through the CLI (SUPABASE_CLI names the binary when `supabase`
 * is not on PATH) and never commits.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
// The database the CLI is pointed at: the one the environment names when it is on this machine, else the stack
// `supabase start` runs here.
const DB_URL = process.env.SUPABASE_DB_URL;
const CLI_TARGET =
  DB_URL && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/.test(DB_URL)
    ? ["--db-url", `${DB_URL}${DB_URL.includes("?") ? "&" : "?"}sslmode=disable`]
    : ["--local"];
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, workspaces and team changes"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

let db;
const made = { users: [], tenants: [] };
const RUN = Date.now().toString(36);
let serial = 0;

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
/** A refusal, by the words the dashboard turns into its own (team.ts teamRefusal) and, when given, the SQLSTATE. */
const refusedWith = (r, message, what, code) => {
  assert.ok(r.error, `REGRESSION: ${what} was not refused`);
  assert.equal(r.error.message, message, `${what}: ${r.error.message}`);
  if (code) assert.equal(r.error.code, code, `${what}: ${r.error.message}`);
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

/** A real account, made with the admin API. */
async function person(tag) {
  const email = `team-${tag}-${++serial}-${RUN}@example.com`;
  const password = `pw-${RUN}-${serial}-Aa1!`;
  const u = ok(await db.auth.admin.createUser({ email, password, email_confirm: true }), "user").user;
  made.users.push(u.id);
  return { id: u.id, email, password };
}

/** A workspace with a seat for each role (one person each, or the people given), answering the seats. */
async function workspace(tag, roles, people) {
  const t = ok(
    await db
      .from("tenants")
      .insert({ name: `Team ${tag}`, slug: `team-${tag}-${++serial}-${RUN}` })
      .select("id")
      .single(),
    "tenant",
  ).id;
  made.tenants.push(t);
  const seats = [];
  for (const [n, role] of roles.entries()) {
    const who = people?.[n] ?? (await person(`${tag}-${n}`));
    const m = ok(
      await db.from("memberships").insert({ tenant_id: t, user_id: who.id, role }).select("id").single(),
      "membership",
    );
    seats.push({ ...who, membership: m.id, role });
  }
  return { t, seats };
}

/** A signed-in session for someone, as the dashboard's own client is. */
async function session(who) {
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email: who.email, password: who.password });
  assert.equal(s.error, null, s.error?.message);
  return client;
}

const ledger = async (t, verb) => {
  let q = db.from("decisions").select("*").eq("tenant_id", t).order("created_at");
  if (verb) q = q.eq("verb", verb);
  return ok(await q, "decisions");
};
const roleOf = async (membership) =>
  ok(await db.from("memberships").select("role").eq("id", membership).maybeSingle(), "role")?.role ?? null;
const rolesOf = async (t) =>
  ok(await db.from("memberships").select("role").eq("tenant_id", t), "roles")
    .map((m) => m.role)
    .sort();
const invitationsOf = async (t) => ok(await db.from("invitations").select("*").eq("tenant_id", t), "invitations");

const change = (t, actor, membership, role, extra = {}) =>
  db.rpc("team_change_role", { p_tenant_id: t, p_actor: actor, p_membership_id: membership, p_role: role, ...extra });
const remove = (t, actor, id, extra = {}) =>
  db.rpc("team_remove", { p_tenant_id: t, p_actor: actor, p_id: id, ...extra });
const join = (t, actor, userId, role, email, extra = {}) =>
  db.rpc("team_join", { p_tenant_id: t, p_actor: actor, p_user_id: userId, p_role: role, p_email: email, ...extra });
const invite = (t, actor, email, role, extra = {}) =>
  db.rpc("team_invite", { p_tenant_id: t, p_actor: actor, p_email: email, p_role: role, ...extra });

/* ------------------------------------------------------------------------------------------------ the door */

test(
  "only the service role executes the team functions: a signed-in owner and the anon key are refused, nothing changes",
  { skip },
  async () => {
    const { t, seats } = await workspace("door", ["owner", "operator"]);
    const [owner, operator] = seats;
    const stranger = await person("door-stranger");
    const calls = {
      team_change_role: { p_tenant_id: t, p_actor: owner.id, p_membership_id: operator.membership, p_role: "viewer" },
      team_remove: { p_tenant_id: t, p_actor: owner.id, p_id: operator.membership },
      team_join: {
        p_tenant_id: t,
        p_actor: owner.id,
        p_user_id: stranger.id,
        p_role: "viewer",
        p_email: stranger.email,
      },
      team_invite: { p_tenant_id: t, p_actor: owner.id, p_email: `door-${RUN}@example.com`, p_role: "viewer" },
      team_invite_withdraw: { p_tenant_id: t, p_invitation_id: crypto.randomUUID() },
      // The helpers: a signed-in owner may not write a decision as themself or ask the platform's own question.
      team_owner_or_refuse: { p_tenant_id: t, p_actor: owner.id },
      team_decision: {
        p_tenant_id: t,
        p_actor: owner.id,
        p_subject_type: "membership",
        p_subject_id: operator.membership,
        p_verb: "change_role",
        p_payload: {},
        p_via: null,
        p_undo_of: null,
      },
    };
    const ownerSession = await session(owner);
    const nobody = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const [who, client] of [
      ["a signed-in owner", ownerSession],
      ["the anon key", nobody],
    ]) {
      for (const [fn, args] of Object.entries(calls)) {
        const r = await client.rpc(fn, args);
        assert.ok(r.error, `REGRESSION: ${who} executed ${fn}`);
        assert.equal(r.error.code, "42501", `${who} calling ${fn}: ${r.error.message}`);
      }
    }
    assert.deepEqual(await rolesOf(t), ["operator", "owner"], "no role changed");
    assert.deepEqual(await ledger(t), [], "no decision was written");
    assert.deepEqual(await invitationsOf(t), [], "no invitation was made");
    // And the service role, which the dashboard calls them as, is let through.
    ok(await db.rpc("team_owner_or_refuse", calls.team_owner_or_refuse), "the service role's own call");
  },
);

/* ------------------------------------------------------------------------------------ the actor owns it */

test(
  "the actor must own the workspace: a member who is not an owner, another workspace's owner and nobody are forbidden",
  { skip },
  async () => {
    const { t, seats } = await workspace("actor", ["owner", "operator", "viewer"]);
    const [owner, operator, viewer] = seats;
    const elsewhere = await workspace("actor-elsewhere", ["owner"]);
    const [foreign] = elsewhere.seats;
    const invitee = await person("actor-invitee");
    const open = ok(
      await db
        .from("invitations")
        .insert({ tenant_id: t, email: `open-${RUN}@example.com`, role: "viewer", invited_by: owner.id })
        .select("id")
        .single(),
      "an open invitation",
    ).id;
    const before_ = { roles: await rolesOf(t), invitations: await invitationsOf(t) };
    const doors = {
      team_change_role: (actor) => change(t, actor, viewer.membership, "operator"),
      team_remove: (actor) => remove(t, actor, operator.membership),
      "team_remove (an open invitation)": (actor) => remove(t, actor, open),
      team_join: (actor) => join(t, actor, invitee.id, "viewer", invitee.email),
      team_invite: (actor) => invite(t, actor, `nope-${RUN}@example.com`, "viewer"),
    };
    for (const [who, actor] of [
      ["an operator", operator.id],
      ["a viewer", viewer.id],
      ["the owner of another workspace", foreign.id],
      ["nobody (a null actor)", null],
    ]) {
      for (const [name, door] of Object.entries(doors))
        refusedWith(await door(actor), "forbidden", `${who} at ${name}`, "42501");
    }
    assert.deepEqual(await rolesOf(t), before_.roles, "no role changed, no member was added or removed");
    assert.deepEqual(await invitationsOf(t), before_.invitations, "the open invitation is open and no other was made");
    assert.deepEqual(await ledger(t), [], "and a refusal wrote no decision");
    assert.deepEqual(await rolesOf(elsewhere.t), ["owner"], "the other workspace was not touched either");
    // The same actor is let through where they own.
    ok(await change(t, owner.id, viewer.membership, "operator"), "the owner's own change");
  },
);

/* ---------------------------------------------------------------------------------------- role change */

test("a role change is the change and one change_role decision, saying from and to", { skip }, async () => {
  const { t, seats } = await workspace("role", ["owner", "operator", "viewer"]);
  const [owner, operator, viewer] = seats;
  const done = ok(await change(t, owner.id, operator.membership, "viewer"), "demote the operator");
  assert.equal(done.membership_id, operator.membership);
  assert.equal(done.role, "viewer");
  assert.equal(done.undo_dropped, false);
  assert.equal(await roleOf(operator.membership), "viewer", "the change is there");
  const rows = await ledger(t);
  assert.equal(rows.length, 1, "and exactly one decision with it");
  const [d] = rows;
  assert.equal(d.id, done.decision_id, "the answer names the decision");
  assert.equal(d.verb, "change_role");
  assert.equal(d.subject_type, "membership");
  assert.equal(d.subject_id, operator.membership);
  assert.equal(d.actor_type, "user");
  assert.equal(d.actor_user_id, owner.id, "the actor is the one the dashboard passed, who owns the workspace");
  assert.deepEqual(d.payload, { from: "operator", to: "viewer" }, "from and to, and no via when none was given");
  assert.equal(d.undo_of, null);

  // A promotion is a change like any other, and says what the member was.
  ok(await change(t, owner.id, viewer.membership, "owner"), "promote the viewer");
  const promotion = (await ledger(t, "change_role")).find((r) => r.subject_id === viewer.membership);
  assert.deepEqual(promotion.payload, { from: "viewer", to: "owner" });
});

test(
  "via rides on the decision; an undo links to a decision it reverses, and one that does not exist is dropped and said",
  { skip },
  async () => {
    const { t, seats } = await workspace("undo", ["owner", "operator"]);
    const [owner, operator] = seats;
    const first = ok(
      await change(t, owner.id, operator.membership, "viewer", { p_via: "ask" }),
      "a change from a card",
    );
    const [asked] = await ledger(t, "change_role");
    assert.deepEqual(asked.payload, { from: "operator", to: "viewer", via: "ask" }, "the card is named in the payload");

    const undone = ok(
      await change(t, owner.id, operator.membership, "operator", { p_undo_of: first.decision_id }),
      "undo it",
    );
    assert.equal(undone.undo_dropped, false, "a known decision is linked, not dropped");
    const linked = (await ledger(t, "change_role")).find((r) => r.id === undone.decision_id);
    assert.equal(linked.undo_of, first.decision_id, "the undo names what it reverses");
    assert.deepEqual(linked.payload, { from: "viewer", to: "operator" });

    const stale = crypto.randomUUID();
    const kept = ok(
      await change(t, owner.id, operator.membership, "viewer", { p_undo_of: stale }),
      "a card kept from a stale tab",
    );
    assert.equal(kept.undo_dropped, true, "the answer says the link was dropped");
    assert.equal(await roleOf(operator.membership), "viewer", "the change itself is kept");
    const dropped = (await ledger(t, "change_role")).find((r) => r.id === kept.decision_id);
    assert.equal(dropped.undo_of, null, "and its row carries no link to a decision that is not there");
    assert.equal((await ledger(t, "change_role")).length, 3, "one decision per change, no more");
  },
);

test(
  "a role change to a member who is not on this team is not_found: an unknown id, and one of another workspace",
  { skip },
  async () => {
    const { t, seats } = await workspace("nf", ["owner"]);
    const other = await workspace("nf-other", ["owner", "viewer"]);
    const [owner] = seats;
    refusedWith(await change(t, owner.id, crypto.randomUUID(), "viewer"), "not_found", "an unknown id", "P0002");
    refusedWith(
      await change(t, owner.id, other.seats[1].membership, "operator"),
      "not_found",
      "another workspace's membership",
      "P0002",
    );
    assert.equal(await roleOf(other.seats[1].membership), "viewer", "the other workspace's member is as they were");
    assert.deepEqual(await ledger(t), [], "a refusal leaves no decision");
    assert.deepEqual(await ledger(other.t), []);
  },
);

test("a role that is not one the team has is refused whole: no change and no decision", { skip }, async () => {
  const { t, seats } = await workspace("badrole", ["owner", "operator"]);
  const r = await change(t, seats[0].id, seats[1].membership, "emperor");
  assert.ok(r.error, "a role outside memberships_role_check was written");
  assert.equal(await roleOf(seats[1].membership), "operator");
  assert.deepEqual(await ledger(t), []);
});

/* ------------------------------------------------------------------------------------------- the last owner */

test("a lone owner cannot step down, and the refusal leaves no decision", { skip }, async () => {
  const { t, seats } = await workspace("lone", ["owner", "viewer"]);
  const [owner] = seats;
  for (const role of ["operator", "viewer", "partner"])
    refusedWith(await change(t, owner.id, owner.membership, role), "last_owner", `stepping down to ${role}`, "P0001");
  assert.equal(await roleOf(owner.membership), "owner");
  assert.deepEqual(await ledger(t), [], "a refused call leaves no decision");
  // Nor may they remove themself: self_remove says so before last_owner could.
  refusedWith(await remove(t, owner.id, owner.membership), "self_remove", "the lone owner removing themself", "P0001");
  assert.deepEqual(await rolesOf(t), ["owner", "viewer"]);
  assert.deepEqual(await ledger(t), []);
});

test(
  "an owner may hand over: promote another, then step down, and the promoted one is the last",
  { skip },
  async () => {
    const { t, seats } = await workspace("handover", ["owner", "operator"]);
    const [owner, operator] = seats;
    ok(await change(t, owner.id, operator.membership, "owner"), "promote");
    ok(await change(t, owner.id, owner.membership, "viewer"), "step down, with another owner in place");
    assert.deepEqual(await rolesOf(t), ["owner", "viewer"]);
    assert.equal((await ledger(t, "change_role")).length, 2, "two changes, two decisions");
    refusedWith(
      await change(t, operator.id, operator.membership, "operator"),
      "last_owner",
      "and now the new owner is the last",
      "P0001",
    );
  },
);

const ROUNDS = 12;
/** Two owners of workspaces made for the round: two calls, fired together, and what came back. */
async function race(tag, act) {
  const people = [await person(`${tag}-a`), await person(`${tag}-b`)];
  const rounds = [];
  for (let n = 0; n < ROUNDS; n++) {
    const w = await workspace(`${tag}${n}`, ["owner", "owner"], people);
    const results = await Promise.all(act(w.t, w.seats));
    rounds.push({ ...w, results });
  }
  return rounds;
}

test(
  "two owners stepping down at the same moment leave exactly one, and the second is refused last_owner",
  { skip },
  async () => {
    const rounds = await race("step", (t, [a, b]) => [
      change(t, a.id, a.membership, "viewer"),
      change(t, b.id, b.membership, "viewer"),
    ]);
    for (const { t, results } of rounds) {
      const written = results.filter((r) => r.error === null);
      const refused = results.filter((r) => r.error);
      assert.equal(written.length, 1, "exactly one of the two step-downs is written");
      assert.equal(refused.length, 1);
      refusedWith(refused[0], "last_owner", "the second step-down", "P0001");
      assert.deepEqual(await rolesOf(t), ["owner", "viewer"], "exactly one owner is left");
      const rows = await ledger(t);
      assert.equal(rows.length, 1, "one decision: the refused call left none");
      assert.equal(rows[0].id, written[0].data.decision_id);
    }
  },
);

test(
  "two owners each demoting the OTHER at the same moment leave exactly one owner and one refusal, never a deadlock",
  { skip },
  async () => {
    const rounds = await race("cross", (t, [a, b]) => [
      change(t, a.id, b.membership, "operator"),
      change(t, b.id, a.membership, "operator"),
    ]);
    for (const { t, seats, results } of rounds) {
      const written = results.filter((r) => r.error === null);
      const refused = results.filter((r) => r.error);
      assert.equal(
        written.length,
        1,
        `exactly one of the two demotions is written (${refused.map((r) => r.error.message)})`,
      );
      assert.equal(refused.length, 1);
      // The calls take turns on the workspace's team. The one whose turn comes second finds its actor no longer an
      // owner: that is forbidden, the serial answer. It is never a deadlock (40P01), the failure this suite was
      // written for, and never a second write that would have left the workspace with no owner.
      refusedWith(refused[0], "forbidden", "the demotion that came second", "42501");
      assert.deepEqual(await rolesOf(t), ["operator", "owner"], "exactly one owner is left");
      const winner = seats[results.findIndex((r) => r.error === null) === 0 ? 0 : 1];
      assert.equal(await roleOf(winner.membership), "owner", "the owner is the one whose call was written");
      const rows = await ledger(t);
      assert.equal(rows.length, 1, "one decision: the refused call left none");
      assert.equal(rows[0].id, written[0].data.decision_id);
      assert.equal(rows[0].actor_user_id, winner.id);
    }
  },
);

test(
  "two owners each removing the OTHER at the same moment leave exactly one owner and one refusal, never a deadlock",
  { skip },
  async () => {
    const rounds = await race("cut", (t, [a, b]) => [remove(t, a.id, b.membership), remove(t, b.id, a.membership)]);
    for (const { t, results } of rounds) {
      const written = results.filter((r) => r.error === null);
      const refused = results.filter((r) => r.error);
      assert.equal(
        written.length,
        1,
        `exactly one of the two removals is written (${refused.map((r) => r.error.message)})`,
      );
      refusedWith(refused[0], "forbidden", "the removal that came second", "42501");
      assert.deepEqual(await rolesOf(t), ["owner"], "exactly one member is left, an owner");
      const rows = await ledger(t);
      assert.equal(rows.length, 1, "one decision: the refused call left none");
      assert.equal(rows[0].verb, "remove_member");
    }
  },
);

/* ----------------------------------------------------------------------------------------------- removal */

test("removing an open invitation revokes it and writes one revoke_invite decision", { skip }, async () => {
  const { t, seats } = await workspace("revoke", ["owner"]);
  const [owner] = seats;
  const open = ok(
    await db
      .from("invitations")
      .insert({ tenant_id: t, email: `revoke-${RUN}@example.com`, role: "operator", invited_by: owner.id })
      .select("id")
      .single(),
    "an open invitation",
  ).id;
  const done = ok(await remove(t, owner.id, open, { p_via: "ask" }), "revoke it");
  assert.equal(done.revoked_invite, true);
  assert.equal(done.undo_dropped, false);
  const [row] = await invitationsOf(t);
  assert.notEqual(row.revoked_at, null, "the invitation is revoked, not deleted");
  const rows = await ledger(t);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].verb, "revoke_invite");
  assert.equal(rows[0].subject_type, "invitation");
  assert.equal(rows[0].subject_id, open);
  assert.equal(rows[0].actor_user_id, owner.id);
  assert.deepEqual(rows[0].payload, { via: "ask" });
  assert.deepEqual(await rolesOf(t), ["owner"], "and no member went with it");
});

test(
  "removing a member deletes the seat and writes remove_member with who they were and the role they held",
  { skip },
  async () => {
    const { t, seats } = await workspace("out", ["owner", "operator", "owner"]);
    const [owner, operator, otherOwner] = seats;
    const first = ok(await remove(t, owner.id, operator.membership), "remove the operator");
    assert.equal(first.removed, true);
    assert.equal(await roleOf(operator.membership), null, "the seat is gone");
    const [d] = await ledger(t, "remove_member");
    assert.equal(d.subject_type, "membership");
    assert.equal(d.subject_id, operator.membership, "the decision keeps the id of the seat that is gone");
    assert.equal(d.actor_user_id, owner.id);
    assert.deepEqual(
      d.payload,
      { removed_user_id: operator.id, had_role: "operator" },
      "the only surviving record of it",
    );
    assert.equal(d.id, first.decision_id);

    // An owner may remove another while two remain; the record says they were one, and an undo links when it can.
    const second = ok(await remove(t, owner.id, otherOwner.membership, { p_undo_of: d.id }), "remove the other owner");
    assert.equal(second.undo_dropped, false);
    const linked = (await ledger(t, "remove_member")).find((r) => r.id === second.decision_id);
    assert.deepEqual(linked.payload, { removed_user_id: otherOwner.id, had_role: "owner" });
    assert.equal(linked.undo_of, d.id);
    assert.deepEqual(await rolesOf(t), ["owner"]);
    const stale = await workspace("out2", ["owner", "viewer"]);
    const dropped = ok(
      await remove(stale.t, stale.seats[0].id, stale.seats[1].membership, { p_undo_of: crypto.randomUUID() }),
      "a stale undo",
    );
    assert.equal(dropped.undo_dropped, true, "a stale undo is said, and the removal kept");
  },
);

test(
  "nobody removes themself, an unknown id is not_found, and a refusal leaves neither the change nor a decision",
  { skip },
  async () => {
    const { t, seats } = await workspace("nothing", ["owner", "operator", "owner"]);
    const other = await workspace("nothing-other", ["owner", "viewer"]);
    const [owner] = seats;
    refusedWith(await remove(t, owner.id, owner.membership), "self_remove", "an owner removing themself", "P0001");
    refusedWith(await remove(t, owner.id, crypto.randomUUID()), "not_found", "an unknown id", "P0002");
    refusedWith(
      await remove(t, owner.id, other.seats[1].membership),
      "not_found",
      "another workspace's member",
      "P0002",
    );
    assert.deepEqual(await rolesOf(t), ["operator", "owner", "owner"], "everyone is still here");
    assert.deepEqual(await rolesOf(other.t), ["owner", "viewer"]);
    assert.deepEqual(await ledger(t), []);
    assert.deepEqual(await ledger(other.t), []);
  },
);

/* ------------------------------------------------------------------------------- join, invite, withdraw */

test(
  "team_join adds an existing account once, with an invite decision; the second call is already_member and writes nothing",
  { skip },
  async () => {
    const { t, seats } = await workspace("join", ["owner"]);
    const [owner] = seats;
    const guest = await person("join-guest");
    const done = ok(await join(t, owner.id, guest.id, "operator", guest.email, { p_via: "ask" }), "join");
    assert.equal(done.added, true);
    assert.equal(done.undo_dropped, false);
    const seat = ok(
      await db.from("memberships").select("id, role").eq("tenant_id", t).eq("user_id", guest.id).single(),
      "the seat",
    );
    assert.equal(seat.role, "operator");
    assert.equal(done.membership_id, seat.id);
    const rows = await ledger(t);
    assert.equal(rows.length, 1, "one decision with the seat");
    assert.equal(rows[0].verb, "invite");
    assert.equal(rows[0].subject_type, "membership");
    assert.equal(rows[0].subject_id, seat.id);
    assert.equal(rows[0].actor_user_id, owner.id);
    assert.deepEqual(rows[0].payload, {
      email: guest.email,
      role: "operator",
      joined_existing_account: true,
      via: "ask",
    });

    const again = ok(await join(t, owner.id, guest.id, "viewer", guest.email), "the same account again");
    assert.deepEqual(again, { already_member: true });
    assert.equal((await ledger(t)).length, 1, "the second call wrote no second decision");
    assert.equal(await roleOf(seat.id), "operator", "and did not change the role");
    assert.deepEqual(await rolesOf(t), ["operator", "owner"]);
  },
);

test("team_join for an account that does not exist writes neither a seat nor a decision", { skip }, async () => {
  const { t, seats } = await workspace("ghost", ["owner"]);
  const r = await join(t, seats[0].id, crypto.randomUUID(), "viewer", `ghost-${RUN}@example.com`);
  assert.ok(r.error, "a seat for an account that is not there was written");
  assert.deepEqual(await rolesOf(t), ["owner"]);
  assert.deepEqual(await ledger(t), []);
});

test(
  "team_invite records the invitation and its decision; an open one is already_invited and writes nothing",
  { skip },
  async () => {
    const { t, seats } = await workspace("invite", ["owner"]);
    const [owner] = seats;
    const email = `Guest-${RUN}@Example.com`;
    const done = ok(await invite(t, owner.id, email, "viewer", { p_via: "ask" }), "invite");
    assert.equal(done.undo_dropped, false);
    const [inv] = await invitationsOf(t);
    assert.equal(done.invitation_id, inv.id);
    assert.equal(inv.email, email);
    assert.equal(inv.role, "viewer");
    assert.equal(inv.invited_by, owner.id);
    assert.equal(inv.accepted_at, null);
    assert.equal(inv.revoked_at, null);
    const rows = await ledger(t);
    assert.equal(rows.length, 1, "one decision with the invitation");
    assert.equal(rows[0].verb, "invite");
    assert.equal(rows[0].subject_type, "invitation");
    assert.equal(rows[0].subject_id, inv.id);
    assert.equal(rows[0].actor_user_id, owner.id);
    assert.deepEqual(rows[0].payload, { email, role: "viewer", via: "ask" });

    // The open one is unique per address in any case (the index is on lower(email)).
    const again = ok(await invite(t, owner.id, email.toLowerCase(), "operator"), "the same address again");
    assert.deepEqual(again, { already_invited: true });
    assert.equal((await invitationsOf(t)).length, 1, "no second invitation");
    assert.equal((await ledger(t)).length, 1, "no second decision");
  },
);

test(
  "team_invite for a role invitations do not take writes neither the invitation nor a decision",
  { skip },
  async () => {
    const { t, seats } = await workspace("badinvite", ["owner"]);
    const r = await invite(t, seats[0].id, `owner-${RUN}@example.com`, "owner");
    assert.ok(r.error, "an invitation to be an owner was written");
    assert.deepEqual(await invitationsOf(t), []);
    assert.deepEqual(await ledger(t), []);
  },
);

test(
  "team_invite_withdraw takes the invitation and its decision back; another workspace's and an accepted one stay",
  { skip },
  async () => {
    const { t, seats } = await workspace("withdraw", ["owner"]);
    const other = await workspace("withdraw-other", ["owner"]);
    const [owner] = seats;
    const sent = ok(await invite(t, owner.id, `withdraw-${RUN}@example.com`, "viewer"), "invite");
    // Named for another workspace, it takes nothing.
    ok(
      await db.rpc("team_invite_withdraw", { p_tenant_id: other.t, p_invitation_id: sent.invitation_id }),
      "wrong workspace",
    );
    assert.equal((await invitationsOf(t)).length, 1, "another workspace cannot withdraw it");
    assert.equal((await ledger(t)).length, 1);

    ok(await db.rpc("team_invite_withdraw", { p_tenant_id: t, p_invitation_id: sent.invitation_id }), "withdraw");
    assert.deepEqual(await invitationsOf(t), [], "the invitation is gone");
    assert.deepEqual(
      await ledger(t),
      [],
      "and the decision with it: the ledger never says an invitation went that did not",
    );
    ok(await db.rpc("team_invite_withdraw", { p_tenant_id: t, p_invitation_id: sent.invitation_id }), "withdraw again");

    // One that was accepted in the meantime is somebody's seat's origin, and stays with its decision.
    const taken = ok(await invite(t, owner.id, `taken-${RUN}@example.com`, "viewer"), "a second invitation");
    ok(
      await db.from("invitations").update({ accepted_at: new Date().toISOString() }).eq("id", taken.invitation_id),
      "accepted",
    );
    ok(
      await db.rpc("team_invite_withdraw", { p_tenant_id: t, p_invitation_id: taken.invitation_id }),
      "withdraw an accepted one",
    );
    assert.equal((await invitationsOf(t)).length, 1, "an accepted invitation is not withdrawn");
    assert.equal((await ledger(t, "invite")).length, 1, "and keeps its decision");
  },
);

/* ------------------------------------------------------------------------------------------ atomicity */

/**
 * A transaction on this machine's database that never commits (as sweep-registry.db.test.mjs runs one): `body` runs in
 * a DO block that ends by raising what it `seen`, so everything it did, the trigger it made included, goes with it.
 */
function rolledBack(body) {
  const sql = `do $$ declare seen jsonb := '{}'; begin ${body} raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex'); end $$`;
  const r = spawnSync(CLI, ["db", "query", ...CLI_TARGET, sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  const said = [r.stdout, r.stderr]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const seen = /seen (7b[0-9a-f]*)/.exec(said);
  if (/not_this_database/.test(said))
    throw new Error(
      "the CLI reached a database that does not hold this suite's rows: point SUPABASE_DB_URL at the stack",
    );
  if (!seen) throw new Error(`the block did not get to say what it saw: ${said.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

test(
  "a database that cannot write the decision takes the change with it: nothing is left changed and unrecorded",
  { skip },
  async () => {
    // The rows the block acts on are made here: the block itself never commits.
    const { t, seats } = await workspace("atomic", ["owner", "operator", "viewer"]);
    const [owner, operator, viewer] = seats;
    const guest = await person("atomic-guest");
    const each = (name, call, state) => `
    begin
      perform ${call};
      seen := seen || jsonb_build_object('${name}', jsonb_build_object('raised', false));
    exception when others then
      seen := seen || jsonb_build_object('${name}', jsonb_build_object('raised', true, 'message', sqlerrm, 'state', ${state}));
    end;`;
    const seen = rolledBack(`
    -- Before anything is made: this is the database the suite's rows are in, or nothing happens.
    if not exists (select 1 from public.tenants where id = '${t}') then
      raise exception 'not_this_database';
    end if;
    -- A ledger that refuses every team decision of this workspace, after the change it records has been made.
    create function public.__team_decision_refused() returns trigger language plpgsql as $f$
    begin raise exception 'the ledger is unavailable'; end $f$;
    create trigger __team_decision_refused before insert on public.decisions
      for each row when (new.tenant_id = '${t}') execute function public.__team_decision_refused();
    ${each("change_role", `public.team_change_role('${t}', '${owner.id}', '${operator.membership}', 'viewer')`, "(select role from public.memberships where id = '" + operator.membership + "')")}
    ${each("remove", `public.team_remove('${t}', '${owner.id}', '${viewer.membership}')`, "(select count(*) from public.memberships where id = '" + viewer.membership + "')")}
    ${each("join", `public.team_join('${t}', '${owner.id}', '${guest.id}', 'viewer', '${guest.email}')`, "(select count(*) from public.memberships where tenant_id = '" + t + "' and user_id = '" + guest.id + "')")}
    ${each("invite", `public.team_invite('${t}', '${owner.id}', 'refused-${RUN}@example.com', 'viewer')`, "(select count(*) from public.invitations where tenant_id = '" + t + "')")}
    seen := seen || jsonb_build_object('decisions', (select count(*) from public.decisions where tenant_id = '${t}'));
  `);
    for (const name of ["change_role", "remove", "join", "invite"])
      assert.equal(
        seen[name].raised,
        true,
        `${name}: a ledger that refuses the row must refuse the call (${JSON.stringify(seen[name])})`,
      );
    assert.match(
      seen.change_role.message,
      /ledger is unavailable/,
      "it was the decision that failed, not something before it",
    );
    assert.equal(seen.change_role.state, "operator", "the role change went back with the decision");
    assert.equal(seen.remove.state, 1, "the removed member is still on the team");
    assert.equal(seen.join.state, 0, "the joined account is not on the team");
    assert.equal(seen.invite.state, 0, "the invitation was not made");
    assert.equal(seen.decisions, 0, "and no decision was written");
  },
);

/* ------------------------------------------------------------------------------------ 00371: leave, renew, lookup */

const leave = (t, actor, extra = {}) => db.rpc("team_leave", { p_tenant_id: t, p_actor: actor, ...extra });
const renew = (t, actor, invitation, extra = {}) =>
  db.rpc("team_invite_renew", { p_tenant_id: t, p_actor: actor, p_invitation_id: invitation, ...extra });
const unrenew = (t, invitation, decision, was) =>
  db.rpc("team_invite_renew_withdraw", {
    p_tenant_id: t,
    p_invitation_id: invitation,
    p_decision_id: decision,
    p_was: was,
  });
const lookup = (t, email) => db.rpc("lookup_user_for_invite", { p_tenant_id: t, p_email: email });
const invitationOf = async (id) => ok(await db.from("invitations").select("*").eq("id", id).single(), "the invitation");
const DAY_MS = 24 * 60 * 60 * 1000;

/** An open invitation, made as the dashboard makes one (team_invite), its expiry set to `expires` when one is given. */
async function openInvitation(t, owner, tag, expires) {
  const sent = ok(await invite(t, owner.id, `${tag}-${RUN}@example.com`, "operator"), "invite");
  if (expires)
    ok(
      await db.from("invitations").update({ expires_at: expires.toISOString() }).eq("id", sent.invitation_id),
      "the expiry",
    );
  return sent;
}

test(
  "only the service role executes the new doors: a signed-in owner and the anon key are refused, nothing changes",
  { skip },
  async () => {
    const { t, seats } = await workspace("door2", ["owner", "operator"]);
    const [owner, operator] = seats;
    const sent = await openInvitation(t, owner, "door2");
    const before_ = { invitation: await invitationOf(sent.invitation_id), decisions: await ledger(t) };
    const calls = {
      team_invite_renew: { p_tenant_id: t, p_actor: owner.id, p_invitation_id: sent.invitation_id },
      team_invite_renew_withdraw: {
        p_tenant_id: t,
        p_invitation_id: sent.invitation_id,
        p_decision_id: sent.decision_id,
        p_was: new Date(Date.now() + DAY_MS).toISOString(),
      },
      team_leave: { p_tenant_id: t, p_actor: operator.id },
      // The lookup answers whether an address has an account: an enumeration oracle, the platform's alone (00121).
      lookup_user_for_invite: { p_tenant_id: t, p_email: `door2-${RUN}@example.com` },
    };
    const ownerSession = await session(owner);
    const nobody = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const [who, client] of [
      ["a signed-in owner", ownerSession],
      ["the anon key", nobody],
    ]) {
      for (const [fn, args] of Object.entries(calls)) {
        const r = await client.rpc(fn, args);
        assert.ok(r.error, `REGRESSION: ${who} executed ${fn}`);
        assert.equal(r.error.code, "42501", `${who} calling ${fn}: ${r.error.message}`);
      }
    }
    assert.deepEqual(await rolesOf(t), ["operator", "owner"], "nobody left");
    assert.deepEqual(await invitationOf(sent.invitation_id), before_.invitation, "the invitation is as it was");
    assert.deepEqual(await ledger(t), before_.decisions, "and no decision was written or taken back");
    // And the service role, which the dashboard calls them as, is let through.
    assert.equal(ok(await lookup(t, calls.lookup_user_for_invite.p_email), "the service role's own call"), null);
  },
);

/* ------------------------------------------------------------------------------------------- an invitation again */

test(
  "an owner sends an invitation again: the same row open seven more days, and one more invite decision saying resent",
  { skip },
  async () => {
    const { t, seats } = await workspace("renew", ["owner"]);
    const [owner] = seats;
    const sent = await openInvitation(t, owner, "renew", new Date(Date.now() + 60 * 60 * 1000));
    const first = await invitationOf(sent.invitation_id);
    const done = ok(await renew(t, owner.id, sent.invitation_id, { p_via: "ask" }), "send it again");
    assert.equal(done.invitation_id, sent.invitation_id);
    assert.equal(done.email, first.email);
    assert.equal(done.role, "operator");
    assert.equal(Date.parse(done.was), Date.parse(first.expires_at), "the answer says the expiry it had");
    assert.equal(done.undo_dropped, false);

    const after_ = await invitationOf(sent.invitation_id);
    for (const column of ["id", "tenant_id", "email", "role", "invited_by", "created_at"])
      assert.equal(after_[column], first[column], `${column} is the invitation's own and was not touched`);
    assert.equal(after_.accepted_at, null);
    assert.equal(after_.revoked_at, null);
    assert.equal((await invitationsOf(t)).length, 1, "the same invitation: no second row");

    const rows = await ledger(t, "invite");
    assert.equal(rows.length, 2, "the first invitation's decision, and the renewal's");
    const [original, again] = rows;
    assert.equal(original.id, sent.decision_id);
    assert.deepEqual(original.payload, { email: first.email, role: "operator" }, "the first decision is as it was");
    assert.equal(again.id, done.decision_id, "the answer names the decision");
    assert.equal(again.subject_type, "invitation");
    assert.equal(again.subject_id, sent.invitation_id);
    assert.equal(again.actor_type, "user");
    assert.equal(again.actor_user_id, owner.id);
    assert.equal(again.undo_of, null);
    assert.deepEqual(again.payload, { email: first.email, role: "operator", resent: true, via: "ask" });
    assert.equal(
      Date.parse(after_.expires_at) - Date.parse(again.created_at),
      7 * DAY_MS,
      "open seven days from the moment of the renewal: the decision and the expiry share the transaction's clock",
    );
    assert.equal((await ledger(t)).length, 2, "and nothing else was written");
  },
);

test(
  "an invitation that lapsed is open again when sent again, and each renewal is a decision of its own",
  { skip },
  async () => {
    const { t, seats } = await workspace("lapsed", ["owner"]);
    const [owner] = seats;
    const sent = await openInvitation(t, owner, "lapsed", new Date(Date.now() - 2 * DAY_MS));
    const first = ok(await renew(t, owner.id, sent.invitation_id), "send the lapsed one again");
    assert.ok(Date.parse(first.was) < Date.now(), "it had lapsed");
    const reopened = await invitationOf(sent.invitation_id);
    assert.ok(Date.parse(reopened.expires_at) > Date.now() + 6 * DAY_MS, "and is open for about a week again");

    const second = ok(await renew(t, owner.id, sent.invitation_id), "and again");
    assert.notEqual(second.decision_id, first.decision_id);
    assert.ok(Date.parse(second.was) > Date.parse(first.was), "the second call saw the first one's expiry");
    const resent = (await ledger(t, "invite")).filter((r) => r.payload.resent === true);
    assert.equal(resent.length, 2, "two renewals, two decisions");
    for (const r of resent)
      assert.deepEqual(
        r.payload,
        { email: reopened.email, role: "operator", resent: true },
        "no via when none was given",
      );
    assert.equal((await ledger(t, "invite")).length, 3, "with the first invitation's");
  },
);

test(
  "only an owner of the workspace sends an invitation again: an operator, a viewer, another workspace's owner and nobody are forbidden",
  { skip },
  async () => {
    const { t, seats } = await workspace("renewactor", ["owner", "operator", "viewer"]);
    const [owner, operator, viewer] = seats;
    const elsewhere = await workspace("renewactor-elsewhere", ["owner"]);
    const sent = await openInvitation(t, owner, "renewactor", new Date(Date.now() + 60 * 60 * 1000));
    const first = await invitationOf(sent.invitation_id);
    for (const [who, actor] of [
      ["an operator", operator.id],
      ["a viewer", viewer.id],
      ["the owner of another workspace", elsewhere.seats[0].id],
      ["nobody (a null actor)", null],
    ])
      refusedWith(await renew(t, actor, sent.invitation_id), "forbidden", `${who} sending it again`, "42501");
    assert.deepEqual(await invitationOf(sent.invitation_id), first, "the invitation is as it was");
    assert.equal((await ledger(t)).length, 1, "a refusal wrote no decision: only the first invitation's is there");
    // The workspace's own owner is let through.
    ok(await renew(t, owner.id, sent.invitation_id), "the owner's own renewal");
  },
);

test(
  "an invitation that is accepted, revoked, unknown or another workspace's is not_found, and nothing is written",
  { skip },
  async () => {
    const { t, seats } = await workspace("renewgone", ["owner"]);
    const other = await workspace("renewgone-other", ["owner"]);
    const [owner] = seats;
    const soon = new Date(Date.now() + 60 * 60 * 1000);
    const accepted = await openInvitation(t, owner, "renewgone-accepted", soon);
    const revoked = await openInvitation(t, owner, "renewgone-revoked", soon);
    const foreign = await openInvitation(other.t, other.seats[0], "renewgone-foreign", soon);
    ok(
      await db.from("invitations").update({ accepted_at: new Date().toISOString() }).eq("id", accepted.invitation_id),
      "accepted",
    );
    ok(await remove(t, owner.id, revoked.invitation_id), "revoked");
    const before_ = {
      accepted: await invitationOf(accepted.invitation_id),
      revoked: await invitationOf(revoked.invitation_id),
      foreign: await invitationOf(foreign.invitation_id),
      decisions: (await ledger(t)).length,
      foreignDecisions: (await ledger(other.t)).length,
    };
    for (const [what, id] of [
      ["an accepted invitation", accepted.invitation_id],
      ["a revoked invitation", revoked.invitation_id],
      ["an unknown id", crypto.randomUUID()],
      ["another workspace's invitation", foreign.invitation_id],
    ])
      refusedWith(await renew(t, owner.id, id), "not_found", what, "P0002");
    assert.deepEqual(await invitationOf(accepted.invitation_id), before_.accepted, "the accepted one keeps its expiry");
    assert.deepEqual(await invitationOf(revoked.invitation_id), before_.revoked, "the revoked one stays revoked");
    assert.deepEqual(await invitationOf(foreign.invitation_id), before_.foreign, "the other workspace's is as it was");
    assert.equal((await ledger(t)).length, before_.decisions, "no decision was written");
    assert.equal((await ledger(other.t)).length, before_.foreignDecisions);
    assert.equal(
      (await ledger(t, "invite")).filter((r) => r.payload.resent).length,
      0,
      "and none says an invitation went again",
    );
  },
);

/* ----------------------------------------------------------------------------------- a renewal whose mail failed */

test(
  "team_invite_renew_withdraw restores the expiry and deletes only the resent decision: the first invitation's stays",
  { skip },
  async () => {
    const { t, seats } = await workspace("unrenew", ["owner"]);
    const other = await workspace("unrenew-other", ["owner"]);
    const [owner] = seats;
    const sent = await openInvitation(t, owner, "unrenew", new Date(Date.now() + 60 * 60 * 1000));
    const first = await invitationOf(sent.invitation_id);
    const done = ok(await renew(t, owner.id, sent.invitation_id), "send it again");
    const renewed = await invitationOf(sent.invitation_id);
    assert.ok(Date.parse(renewed.expires_at) > Date.parse(first.expires_at), "the renewal moved the expiry");

    // Named for another workspace, it takes nothing back.
    ok(await unrenew(other.t, sent.invitation_id, done.decision_id, done.was), "another workspace's call");
    assert.deepEqual(await invitationOf(sent.invitation_id), renewed, "another workspace cannot put it back");
    assert.equal((await ledger(t, "invite")).length, 2, "and cannot take the decision");

    // Naming the first invitation's decision takes no decision: it is not a resent one.
    ok(await unrenew(t, sent.invitation_id, sent.decision_id, renewed.expires_at), "the first decision's id");
    assert.deepEqual(
      (await ledger(t, "invite")).map((r) => r.id),
      [sent.decision_id, done.decision_id],
      "the first invitation's decision stays, and so does the renewal's",
    );

    ok(await unrenew(t, sent.invitation_id, done.decision_id, done.was), "take the renewal back");
    assert.equal((await invitationOf(sent.invitation_id)).expires_at, first.expires_at, "the expiry it had");
    const rows = await ledger(t, "invite");
    assert.deepEqual(
      rows.map((r) => r.id),
      [sent.decision_id],
      "the resent decision is gone: the ledger never says an email went that did not",
    );
    assert.deepEqual(rows[0].payload, { email: first.email, role: "operator" }, "and the first one is as it was");
    ok(await unrenew(t, sent.invitation_id, done.decision_id, done.was), "take it back again");
    assert.equal((await ledger(t, "invite")).length, 1, "the second call takes nothing more");
  },
);

test(
  "team_invite_renew_withdraw leaves an invitation accepted in the meantime alone, and still takes the resent decision",
  { skip },
  async () => {
    const { t, seats } = await workspace("unrenew2", ["owner"]);
    const [owner] = seats;
    const sent = await openInvitation(t, owner, "unrenew2", new Date(Date.now() + 60 * 60 * 1000));
    const first = await invitationOf(sent.invitation_id);
    const done = ok(await renew(t, owner.id, sent.invitation_id), "send it again");
    ok(
      await db.from("invitations").update({ accepted_at: new Date().toISOString() }).eq("id", sent.invitation_id),
      "accepted",
    );
    const taken = await invitationOf(sent.invitation_id);
    ok(await unrenew(t, sent.invitation_id, done.decision_id, first.expires_at), "take the renewal back");
    assert.deepEqual(await invitationOf(sent.invitation_id), taken, "an accepted invitation is somebody's: untouched");
    assert.deepEqual(
      (await ledger(t, "invite")).map((r) => r.id),
      [sent.decision_id],
      "its first decision stays, how it began",
    );
  },
);

test(
  "team_invite_renew_withdraw leaves a later renewal's days alone: two owners send it again and the first one's mail fails",
  { skip },
  async () => {
    const { t, seats } = await workspace("unrenew3", ["owner", "owner"]);
    const [r1, r2] = seats;
    // It had lapsed, so putting the old expiry back over a later renewal would show the card as Expired.
    const sent = await openInvitation(t, r1, "unrenew3", new Date(Date.now() - 60 * 60 * 1000));
    const one = ok(await renew(t, r1.id, sent.invitation_id), "the first owner sends it again");
    assert.ok(Date.parse(one.was) < Date.now(), "it had lapsed when the first owner sent it again");
    const two = ok(
      await renew(t, r2.id, sent.invitation_id),
      "the second owner sends it again, in a later transaction",
    );
    const held = await invitationOf(sent.invitation_id);
    assert.ok(Date.parse(held.expires_at) > Date.parse(two.was), "the second renewal moved the expiry on");
    assert.ok(Date.parse(held.expires_at) > Date.now() + 6 * DAY_MS, "and the invitation is open for about a week");

    // The first owner's mail fails: their withdraw takes their own decision and leaves the second one's days.
    ok(await unrenew(t, sent.invitation_id, one.decision_id, one.was), "the first owner's renewal is taken back");
    assert.deepEqual(await invitationOf(sent.invitation_id), held, "the expiry stays the second renewal's");
    assert.deepEqual(
      (await ledger(t, "invite")).map((r) => r.id),
      [sent.decision_id, two.decision_id],
      "the first owner's resent decision is gone; the second's and the invitation's own stay",
    );

    // A decision that is not there says nothing about the expiry either.
    ok(await unrenew(t, sent.invitation_id, crypto.randomUUID(), one.was), "an unknown decision");
    assert.deepEqual(await invitationOf(sent.invitation_id), held, "nothing is put back for a renewal not on record");
  },
);

/* ------------------------------------------------------------------------------------------------- a member leaves */

test(
  "a member leaves: the seat is gone, and one remove_member decision by their own hand says they left and what they held",
  { skip },
  async () => {
    const { t, seats } = await workspace("leave", ["owner", "operator", "viewer"]);
    const [owner, operator, viewer] = seats;
    const done = ok(await leave(t, operator.id, { p_via: "ask" }), "the operator leaves");
    assert.equal(done.left, true);
    assert.equal(done.undo_dropped, false);
    assert.equal(await roleOf(operator.membership), null, "the seat is gone");
    assert.deepEqual(await rolesOf(t), ["owner", "viewer"], "and nobody else's");
    const [d, ...more] = await ledger(t);
    assert.deepEqual(more, [], "exactly one decision");
    assert.equal(d.id, done.decision_id);
    assert.equal(d.verb, "remove_member");
    assert.equal(d.subject_type, "membership");
    assert.equal(d.subject_id, operator.membership, "the decision keeps the id of the seat that is gone");
    assert.equal(d.actor_type, "user");
    assert.equal(d.actor_user_id, operator.id, "by their own hand, not the owner's");
    assert.equal(d.undo_of, null);
    assert.deepEqual(
      d.payload,
      { removed_user_id: operator.id, had_role: "operator", left: true, via: "ask" },
      "the only surviving record of the seat they held",
    );
    const account = ok(await db.auth.admin.getUserById(operator.id), "the account");
    assert.equal(account.user.id, operator.id, "leaving a workspace is not leaving the platform: the account stays");

    // A viewer leaves the same way, with no via; the owner is untouched.
    ok(await leave(t, viewer.id), "the viewer leaves");
    assert.deepEqual(await rolesOf(t), ["owner"]);
    const second = (await ledger(t, "remove_member")).find((r) => r.subject_id === viewer.membership);
    assert.deepEqual(second.payload, { removed_user_id: viewer.id, had_role: "viewer", left: true });
    assert.equal(second.actor_user_id, viewer.id);
    assert.equal(await roleOf(owner.membership), "owner");
  },
);

test("the last owner cannot leave, and the refusal leaves the seat and no decision", { skip }, async () => {
  const { t, seats } = await workspace("leavelast", ["owner", "operator"]);
  const [owner] = seats;
  refusedWith(await leave(t, owner.id), "last_owner", "the lone owner leaving", "P0001");
  refusedWith(await leave(t, owner.id, { p_via: "ask" }), "last_owner", "and again", "P0001");
  assert.deepEqual(await rolesOf(t), ["operator", "owner"], "nobody left");
  assert.deepEqual(await ledger(t), [], "a refused call leaves no decision");
});

test("one of two owners may leave, and then the other is the last: they cannot", { skip }, async () => {
  const { t, seats } = await workspace("leavetwo", ["owner", "owner", "viewer"]);
  const [a, b] = seats;
  const done = ok(await leave(t, a.id), "one of two owners leaves");
  assert.equal(done.left, true);
  assert.deepEqual(await rolesOf(t), ["owner", "viewer"], "exactly one owner is left");
  const [d] = await ledger(t, "remove_member");
  assert.deepEqual(
    d.payload,
    { removed_user_id: a.id, had_role: "owner", left: true },
    "the record says they were one",
  );
  assert.equal(d.actor_user_id, a.id);
  refusedWith(await leave(t, b.id), "last_owner", "and now the other is the last", "P0001");
  assert.deepEqual(await rolesOf(t), ["owner", "viewer"]);
  assert.equal((await ledger(t)).length, 1, "the refusal wrote nothing");
});

test(
  "someone who is not on the team cannot leave it: a stranger, another workspace's member, nobody, and one who already left",
  { skip },
  async () => {
    const { t, seats } = await workspace("leavenot", ["owner", "viewer"]);
    const other = await workspace("leavenot-other", ["owner"]);
    const stranger = await person("leavenot-stranger");
    for (const [who, actor] of [
      ["a stranger with no workspace", stranger.id],
      ["another workspace's owner", other.seats[0].id],
      ["an id that is nobody's", crypto.randomUUID()],
      ["nobody (a null actor)", null],
    ])
      refusedWith(await leave(t, actor), "not_found", who, "P0002");
    assert.deepEqual(await rolesOf(t), ["owner", "viewer"], "nobody left");
    assert.deepEqual(await rolesOf(other.t), ["owner"], "and the other workspace is as it was");
    assert.deepEqual(await ledger(t), []);
    assert.deepEqual(await ledger(other.t), []);

    ok(await leave(t, seats[1].id), "the viewer leaves");
    refusedWith(await leave(t, seats[1].id), "not_found", "the viewer leaving a second time", "P0002");
    assert.equal((await ledger(t)).length, 1, "one leaving, one decision");
  },
);

test(
  "two owners leaving at the same moment leave exactly one, and the second is refused last_owner",
  { skip },
  async () => {
    const rounds = await race("quit", (t, [a, b]) => [leave(t, a.id), leave(t, b.id)]);
    for (const { t, results } of rounds) {
      const written = results.filter((r) => r.error === null);
      const refused = results.filter((r) => r.error);
      assert.equal(
        written.length,
        1,
        `exactly one of the two leavings is written (${refused.map((r) => r.error.message)})`,
      );
      assert.equal(refused.length, 1);
      refusedWith(refused[0], "last_owner", "the second owner to leave", "P0001");
      assert.deepEqual(await rolesOf(t), ["owner"], "exactly one owner is left");
      const rows = await ledger(t);
      assert.equal(rows.length, 1, "one decision: the refused call left none");
      assert.equal(rows[0].id, written[0].data.decision_id);
    }
  },
);

test(
  "an owner leaving while the other removes them at the same moment: one is written, the other finds the seat gone, never a deadlock",
  { skip },
  async () => {
    const rounds = await race("quitcut", (t, [a, b]) => [leave(t, a.id), remove(t, b.id, a.membership)]);
    for (const { t, results } of rounds) {
      const written = results.filter((r) => r.error === null);
      const refused = results.filter((r) => r.error);
      assert.equal(
        written.length,
        1,
        `exactly one of the leaving and the removal is written (${refused.map((r) => r.error.message)})`,
      );
      refusedWith(refused[0], "not_found", "the one that came second", "P0002");
      assert.deepEqual(await rolesOf(t), ["owner"], "the other owner is left");
      const rows = await ledger(t);
      assert.equal(rows.length, 1, "one decision: the refused call left none");
      assert.equal(rows[0].verb, "remove_member");
      assert.equal(rows[0].id, written[0].data.decision_id);
    }
  },
);

/* ------------------------------------------------------------------------------------------ an account to seat */

test(
  "lookup_user_for_invite finds a confirmed account and not one an invitation made and nobody has opened",
  { skip },
  async () => {
    const { t } = await workspace("lookup", ["owner"]);
    const confirmed = await person("lookup-confirmed");
    const email = `team-lookup-pending-${RUN}-${++serial}@example.com`;
    // What an invitation leaves in Supabase Auth before it is accepted: an account whose email is not confirmed.
    const pending = ok(
      await db.auth.admin.createUser({ email, password: `pw-${RUN}-pending-Aa1!` }),
      "an account nobody has opened",
    ).user;
    made.users.push(pending.id);
    assert.ok(!pending.email_confirmed_at, "the account is unconfirmed");

    assert.equal(ok(await lookup(t, email), "pending"), null, "an unconfirmed account is not one to seat");
    assert.equal(ok(await lookup(t, `  ${email.toUpperCase()} `), "pending, any case"), null);
    assert.equal(ok(await lookup(t, `nobody-${RUN}@example.com`), "no account"), null, "nor an address with none");
    assert.equal(ok(await lookup(t, confirmed.email), "confirmed"), confirmed.id, "a confirmed account is found");
    assert.equal(
      ok(await lookup(t, `  ${confirmed.email.toUpperCase()} `), "confirmed, any case"),
      confirmed.id,
      "in any case, with the spaces a form leaves",
    );

    // Once they have opened it, it is an account like any other.
    ok(await db.auth.admin.updateUserById(pending.id, { email_confirm: true }), "confirm the email");
    assert.equal(ok(await lookup(t, email), "opened"), pending.id);
  },
);

test("lookup_user_for_invite counts an account whose phone was confirmed", { skip }, async () => {
  const { t } = await workspace("lookupphone", ["owner"]);
  const email = `team-lookup-phone-${RUN}-${++serial}@example.com`;
  const phone = `+1555${String(Date.now() % 10_000_000).padStart(7, "0")}`;
  const made_ = ok(
    await db.auth.admin.createUser({ email, phone, phone_confirm: true, password: `pw-${RUN}-phone-Aa1!` }),
    "an account with a confirmed phone and an unconfirmed email",
  ).user;
  made.users.push(made_.id);
  assert.ok(!made_.email_confirmed_at, "the email is not confirmed");
  assert.ok(made_.phone_confirmed_at, "the phone is");
  assert.equal(ok(await lookup(t, email), "phone-confirmed"), made_.id);
});

/* ------------------------------------------------------------------------------------------------ atomicity again */

test("a database that cannot write the decision takes a renewal and a leaving back with it", { skip }, async () => {
  const { t, seats } = await workspace("atomic2", ["owner", "operator"]);
  const [owner, operator] = seats;
  const sent = await openInvitation(t, owner, "atomic2", new Date(Date.now() + 60 * 60 * 1000));
  const first = await invitationOf(sent.invitation_id);
  const each = (name, call, state) => `
    begin
      perform ${call};
      seen := seen || jsonb_build_object('${name}', jsonb_build_object('raised', false));
    exception when others then
      seen := seen || jsonb_build_object('${name}', jsonb_build_object('raised', true, 'message', sqlerrm, 'state', ${state}));
    end;`;
  const seen = rolledBack(`
    if not exists (select 1 from public.tenants where id = '${t}') then
      raise exception 'not_this_database';
    end if;
    create function public.__team_renew_leave_refused() returns trigger language plpgsql as $f$
    begin raise exception 'the ledger is unavailable'; end $f$;
    create trigger __team_renew_leave_refused before insert on public.decisions
      for each row when (new.tenant_id = '${t}') execute function public.__team_renew_leave_refused();
    ${each("renew", `public.team_invite_renew('${t}', '${owner.id}', '${sent.invitation_id}')`, "(select expires_at from public.invitations where id = '" + sent.invitation_id + "')")}
    ${each("leave", `public.team_leave('${t}', '${operator.id}')`, "(select count(*) from public.memberships where id = '" + operator.membership + "')")}
    seen := seen || jsonb_build_object('decisions', (select count(*) from public.decisions where tenant_id = '${t}'));
  `);
  for (const name of ["renew", "leave"])
    assert.equal(
      seen[name].raised,
      true,
      `${name}: a ledger that refuses the row must refuse the call (${JSON.stringify(seen[name])})`,
    );
  assert.match(seen.renew.message, /ledger is unavailable/, "it was the decision that failed, not something before it");
  assert.equal(Date.parse(seen.renew.state), Date.parse(first.expires_at), "the renewal's expiry went back with it");
  assert.equal(seen.leave.state, 1, "the member who left is still on the team");
  assert.equal(seen.decisions, 1, "and no decision was written: the first invitation's is the only one");
});
