/**
 * Who listened to a call's recording is on the ledger (00277 recording_opened), on a real Postgres with real sessions.
 *
 * A recording is a customer's voice. The route that signs it (GET calls/:id/recording, media.ts recordingOpened) asks
 * this function first; it writes an `open_recording` decision as the member, once per member per call per hour, since
 * the thread's player asks again at every seek. Any member of the call's workspace may listen (an owner, an operator
 * and a viewer alike), and a viewer may not write decisions under RLS, so the function is the definer's and checks
 * membership itself: a call of another workspace, a call that is not there and someone who is not a member are all
 * the same refusal (P0002), a partner's seat counts only on a session that showed its second factor (as team_roster
 * has it), no session at all is refused (42501), and the anon key may not execute it.
 *
 * The verb is one the ledger accepts (decisions_verb_check, appended to what the database held, not written over it),
 * and one contracts names (DECISION_VERBS), so the activity feed says something for it.
 *
 * Runs the way tenancy.db.test.mjs does: its own workspaces, users and rows, made with the service key and removed
 * after, against the database `supabase start` builds on this machine, never production; the sessions are real.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { DECISION_VERBS } from "@chanlytics/contracts";
import { showSecondFactor } from "../_second-factor.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, workspaces, calls and decisions"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

let db;
const made = { users: [], tenants: [] };
const RUN = Date.now().toString(36);
let serial = 0;
/** The world: a workspace with an owner, an operator and a viewer; another with an owner. */
const w = {};

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

/** A real session for a fresh user with this role in this workspace (no seat at all when `tenant` is null). */
async function member(role, tenant) {
  const email = `recording-${role}-${++serial}-${RUN}@example.com`;
  const password = `pw-${RUN}-${serial}-Aa1!`;
  const u = ok(await db.auth.admin.createUser({ email, password, email_confirm: true }), "user").user;
  made.users.push(u.id);
  if (tenant) ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: u.id, role }), "membership");
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, id: u.id };
}

async function tenant(tag) {
  const t = ok(
    await db
      .from("tenants")
      .insert({ name: `Recording ${tag}`, slug: `recording-${tag}-${++serial}-${RUN}` })
      .select("id")
      .single(),
    "tenant",
  ).id;
  made.tenants.push(t);
  return t;
}

const aCall = async (t) =>
  ok(
    await db
      .from("calls")
      .insert({ tenant_id: t, retell_call_id: `recording-${++serial}-${RUN}` })
      .select("id")
      .single(),
    "call",
  ).id;

const opens = async (callId) =>
  ok(
    await db.from("decisions").select("*").eq("subject_id", callId).eq("verb", "open_recording").order("created_at"),
    "decisions",
  );
const open = (who, callId) => who.client.rpc("recording_opened", { p_call_id: callId });

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  w.tenant = await tenant("a");
  w.other = await tenant("b");
  w.owner = await member("owner", w.tenant);
  w.operator = await member("operator", w.tenant);
  w.viewer = await member("viewer", w.tenant);
  w.stranger = await member("owner", w.other);
  w.call = await aCall(w.tenant);
  w.otherCall = await aCall(w.other);
});
after(async () => {
  if (skip) return;
  for (const id of made.tenants) await db.from("tenants").delete().eq("id", id);
  for (const id of made.users) await db.auth.admin.deleteUser(id).catch(() => undefined);
});

test("a member writes one open_recording decision as themself, whatever their role", { skip }, async () => {
  const call = await aCall(w.tenant);
  for (const [role, who] of [
    ["owner", w.owner],
    ["operator", w.operator],
    ["viewer", w.viewer],
  ]) {
    assert.equal(ok(await open(who, call), `${role} opens`), true, `${role}: a row was written`);
  }
  const rows = await opens(call);
  assert.equal(rows.length, 3, "one row for each of the three, and no more");
  assert.deepEqual(
    rows.map((r) => r.actor_user_id).sort(),
    [w.owner.id, w.operator.id, w.viewer.id].sort(),
    "each as themself",
  );
  for (const r of rows) {
    assert.equal(r.tenant_id, w.tenant, "in the call's workspace");
    assert.equal(r.actor_type, "user");
    assert.equal(r.subject_type, "call");
    assert.equal(r.subject_id, call);
    assert.equal(r.undo_of, null);
    assert.deepEqual(r.payload, {}, "the recording is named by the subject, and no words are kept");
  }
});

test("the same member again inside the hour writes nothing and answers false", { skip }, async () => {
  const call = await aCall(w.tenant);
  assert.equal(ok(await open(w.operator, call), "first"), true);
  assert.equal(ok(await open(w.operator, call), "a seek"), false);
  assert.equal(ok(await open(w.operator, call), "another seek"), false);
  assert.equal((await opens(call)).length, 1, "one row for the operator");
  assert.equal(ok(await open(w.viewer, call), "another member"), true, "another member gets their own row");
  const rows = await opens(call);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.actor_user_id).sort(), [w.operator.id, w.viewer.id].sort());
  // And a different call is a different row for the same member.
  const next = await aCall(w.tenant);
  assert.equal(ok(await open(w.operator, next), "another call"), true);
});

test("the hour is measured: a row 59 minutes old holds, one 61 minutes old does not", { skip }, async () => {
  const call = await aCall(w.tenant);
  const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
  const seed = async (who, minutes) =>
    ok(
      await db.from("decisions").insert({
        tenant_id: w.tenant,
        subject_type: "call",
        subject_id: call,
        verb: "open_recording",
        actor_type: "user",
        actor_user_id: who.id,
        created_at: ago(minutes),
      }),
      "an earlier listen",
    );
  await seed(w.owner, 59);
  await seed(w.viewer, 61);
  assert.equal(ok(await open(w.owner, call), "the owner, 59 minutes on"), false, "still the same listen");
  assert.equal(ok(await open(w.viewer, call), "the viewer, 61 minutes on"), true, "a new listen");
  assert.equal((await opens(call)).length, 3, "the owner's one, the viewer's earlier and new");
});

test("two asks at the same moment write one row, not two", { skip }, async () => {
  // The player asks for the recording's length and for a seek together. Each asks whether the hour holds a row and
  // finds none if both look before either writes; the function takes turns per member and call, so one does.
  for (let round = 0; round < 8; round++) {
    const call = await aCall(w.tenant);
    const answers = await Promise.all([open(w.viewer, call), open(w.viewer, call), open(w.viewer, call)]);
    for (const a of answers) assert.equal(a.error, null, a.error?.message);
    assert.deepEqual(
      answers.map((a) => a.data).sort(),
      [false, false, true],
      `round ${round}: exactly one of three asks wrote the row`,
    );
    assert.equal((await opens(call)).length, 1, `round ${round}: and the hour holds one row`);
  }
});

test(
  "a call of another workspace, an unknown call and a non-member are refused alike (P0002), and write nothing",
  { skip },
  async () => {
    const outsider = await member("owner", null);
    const cases = [
      ["a member of another workspace, at this workspace's call", open(w.stranger, w.call)],
      ["a member of this workspace, at another workspace's call", open(w.owner, w.otherCall)],
      ["an unknown call", open(w.owner, crypto.randomUUID())],
      ["someone who is a member of nothing", open(outsider, w.call)],
    ];
    for (const [who, pending] of cases) {
      const r = await pending;
      assert.ok(r.error, `REGRESSION: ${who} was let in`);
      assert.equal(r.error.code, "P0002", `${who}: ${r.error.message}`);
      assert.match(r.error.message, /no such call for this member/);
    }
    assert.equal((await opens(w.call)).length, 0);
    assert.equal((await opens(w.otherCall)).length, 0);
  },
);

test("no session is refused (42501), and the anon key may not execute it", { skip }, async () => {
  // The service role executes it and carries no user: the function's own refusal.
  const noSession = await db.rpc("recording_opened", { p_call_id: w.call });
  assert.ok(noSession.error, "REGRESSION: a call with no user wrote a row");
  assert.equal(noSession.error.code, "42501");
  assert.match(noSession.error.message, /no session/);
  // The logged-out key is refused for the privilege itself.
  const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const refused = await anon.rpc("recording_opened", { p_call_id: w.call });
  assert.ok(refused.error, "REGRESSION: the anon key executed recording_opened");
  assert.equal(refused.error.code, "42501");
  assert.match(refused.error.message, /permission denied/);
  assert.equal((await opens(w.call)).length, 0, "and neither wrote a row");
});

test("a partner's seat counts only on a session that showed its second factor", { skip }, async () => {
  const partner = await member("partner", w.tenant);
  const call = await aCall(w.tenant);
  const without = await open(partner, call);
  assert.ok(without.error, "REGRESSION: a partner's session without a second factor wrote a row");
  assert.equal(without.error.code, "P0002");
  assert.equal((await opens(call)).length, 0);
  await showSecondFactor(partner.client);
  assert.equal(ok(await open(partner, call), "the partner, at aal2"), true);
  const rows = await opens(call);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor_user_id, partner.id);
});

test(
  "a viewer cannot write a decision for themself under RLS, which is why the function is the definer's",
  { skip },
  async () => {
    const call = await aCall(w.tenant);
    const direct = await w.viewer.client.from("decisions").insert({
      tenant_id: w.tenant,
      subject_type: "call",
      subject_id: call,
      verb: "open_recording",
      actor_type: "user",
      actor_user_id: w.viewer.id,
    });
    assert.ok(direct.error, "a viewer wrote to the ledger directly");
    assert.equal((await opens(call)).length, 0);
    assert.equal(ok(await open(w.viewer, call), "through the function"), true);
    assert.equal((await opens(call)).length, 1);
  },
);

test(
  "open_recording is a verb the ledger accepts and contracts names, and every other verb is still accepted",
  { skip },
  async () => {
    assert.ok(DECISION_VERBS.includes("open_recording"), "contracts' DECISION_VERBS names it");
    // Every verb contracts names is one decisions_verb_check accepts: the constraint was appended to, not replaced by a
    // shorter list. Written against the workspace itself, so no other row is needed.
    for (const verb of DECISION_VERBS) {
      const r = await db.from("decisions").insert({
        tenant_id: w.other,
        subject_type: "workspace",
        subject_id: w.other,
        verb,
        actor_type: "system",
      });
      assert.equal(r.error, null, `the ledger refuses the verb ${verb}: ${r.error?.message}`);
    }
    const bogus = await db.from("decisions").insert({
      tenant_id: w.other,
      subject_type: "workspace",
      subject_id: w.other,
      verb: "listened_maybe",
      actor_type: "system",
    });
    assert.ok(bogus.error, "the verb list is still closed");
    assert.equal(bogus.error.code, "23514");
  },
);
