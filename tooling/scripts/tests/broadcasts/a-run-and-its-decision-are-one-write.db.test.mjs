/**
 * A run is assembled with its decision (00373 assemble_broadcast, over 00282's door), on a real Postgres: the run, its
 * people, its send job and the send_broadcast decision on it in one transaction. The decision was the route's own
 * write after the door, and one that failed answered 500 for a run that had landed, which a person presses again.
 * Here the decision is made to fail AFTER the run is written (an actor no auth user holds, an undo link of another
 * workspace: values the database refuses, not the door), and nothing of the run remains.
 *
 * Runs against the database `supabase start` builds on this machine, never production; makes its own workspaces and
 * removes them.
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
      ? "refusing a database that is not on this machine: this suite writes broadcasts and due jobs"
      : false;

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let db;
let A;
let B;
let template;
let member;
const people = {};
const users = [];
const far = () => new Date(Date.now() + 30 * 86_400_000).toISOString();

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const ws = async (slug) => {
    const { data, error } = await db
      .from("tenants")
      .insert({ slug: `${slug}-${RUN}`, name: slug })
      .select("id")
      .single();
    assert.equal(error, null, error?.message);
    return data.id;
  };
  A = await ws("decided-a");
  B = await ws("decided-b");
  const t = await db
    .from("templates")
    .insert({ tenant_id: A, channel: "whatsapp", name: "offer", language: "en_US", meta_status: "approved" })
    .select("id")
    .single();
  assert.equal(t.error, null, t.error?.message);
  template = t.data.id;
  let n = 0;
  const contact = async () => {
    n += 1;
    const { data, error } = await db
      .from("contacts")
      .insert({ tenant_id: A, phone_e164: `+1555018${String(n).padStart(4, "0")}` })
      .select("id")
      .single();
    assert.equal(error, null, error?.message);
    return data.id;
  };
  people.a1 = await contact();
  people.a2 = await contact();
  // A person the decision can be written as: the ledger's actor is a foreign key onto auth.users.
  const made = await db.auth.admin.createUser({
    email: `decided-${RUN}@example.com`,
    password: `pw-${RUN}-Aa1!`,
    email_confirm: true,
  });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  member = made.data.user.id;
});

after(async () => {
  if (skip) return;
  for (const t of [A, B].filter(Boolean)) {
    await db.from("jobs").delete().eq("tenant_id", t);
    await db.from("tenants").delete().eq("id", t);
  }
  for (const u of users) await db.auth.admin.deleteUser(u);
});

const run = (name, over = {}) => ({
  name,
  template_id: template,
  template_name: "offer",
  template_language: "en_US",
  params: [{ kind: "first_name" }],
  audience: { kind: "everyone", id: null, label: "Everyone" },
  state: "scheduled",
  scheduled_for: far(),
  recipient_count: 2,
  created_by: null,
  ...over,
});
const two = () => [
  { contact_id: people.a1, facts: null },
  { contact_id: people.a2, facts: null },
];
const DECISION = { name: "the run", recipients: 2, channels: ["whatsapp"] };
/** 00373's door: the run with its decision. `p_decision` is what tells it from 00282's. */
const assemble = (client, name, over = {}) =>
  client.rpc("assemble_broadcast", {
    p_tenant: A,
    p_run: run(name),
    p_recipients: two(),
    p_send_at: far(),
    p_decision: DECISION,
    p_actor: member,
    ...over,
  });

/** What the database holds of a run by its name: the row, its people, its jobs, its decisions. */
async function heldFor(name) {
  const { data: rows } = await db.from("broadcasts").select("id, state").eq("tenant_id", A).eq("name", name);
  const ids = (rows ?? []).map((r) => r.id);
  const { data: recips } = ids.length
    ? await db.from("broadcast_recipients").select("contact_id").in("broadcast_id", ids)
    : { data: [] };
  const { data: jobs } = await db.from("jobs").select("payload").eq("tenant_id", A).eq("kind", "broadcast_send");
  const { data: decisions } = ids.length
    ? await db
        .from("decisions")
        .select("id, verb, actor_type, actor_user_id, payload, undo_of")
        .eq("tenant_id", A)
        .eq("subject_type", "broadcast")
        .in("subject_id", ids)
    : { data: [] };
  return {
    rows: rows ?? [],
    recips: recips ?? [],
    jobs: (jobs ?? []).filter((j) => ids.includes(j.payload?.broadcast_id)),
    decisions: decisions ?? [],
  };
}

test("the run, its people, its send job and the member's decision are one write, and the answer names them both", async (t) => {
  if (skip) return t.skip(skip);
  const { data, error } = await assemble(db, "Decided", { p_via: "ask" });
  assert.equal(error, null, error?.message);
  assert.match(data.id, /^[0-9a-f-]{36}$/);
  assert.match(data.decision_id, /^[0-9a-f-]{36}$/);
  assert.equal(data.undo_dropped, false);
  const held = await heldFor("Decided");
  assert.deepEqual(
    held.rows.map((r) => [r.id, r.state]),
    [[data.id, "scheduled"]],
  );
  assert.equal(held.recips.length, 2);
  assert.equal(held.jobs.length, 1, "one send job");
  assert.deepEqual(held.decisions, [
    {
      id: data.decision_id,
      verb: "send_broadcast",
      actor_type: "user",
      actor_user_id: member,
      payload: { ...DECISION, via: "ask" },
      undo_of: null,
    },
  ]);
});

test("the sweep's run is the system's decision: no person, no undo link", async (t) => {
  if (skip) return t.skip(skip);
  const { data, error } = await assemble(db, "Swept", { p_actor: null, p_undo_of: null });
  assert.equal(error, null, error?.message);
  assert.match(data.decision_id, /^[0-9a-f-]{36}$/);
  const held = await heldFor("Swept");
  assert.deepEqual(
    held.decisions.map((d) => [d.id, d.verb, d.actor_type, d.actor_user_id, d.payload]),
    [[data.decision_id, "send_broadcast", "system", null, DECISION]],
  );
});

test("a run that waits for a person is made with no decision: its approval is one, and the answer is the id alone", async (t) => {
  if (skip) return t.skip(skip);
  const { data, error } = await assemble(db, "Waiting", {
    p_run: run("Waiting", { state: "pending_approval" }),
    p_send_at: null,
    p_decision: null,
  });
  assert.equal(error, null, error?.message);
  assert.deepEqual(Object.keys(data), ["id"]);
  const held = await heldFor("Waiting");
  assert.deepEqual([held.rows.length, held.recips.length, held.jobs.length, held.decisions.length], [1, 2, 0, 0]);
});

test("a decision that cannot be written takes the run with it: no row, no people, no job, nothing on the ledger", async (t) => {
  if (skip) return t.skip(skip);
  // An actor no auth user holds: the ledger's foreign key refuses the decision, after the run was written.
  const nobody = "00000000-0000-4000-8000-00000000dead";
  const r = await assemble(db, "Nobody's decision", { p_actor: nobody });
  assert.equal(r.error?.code, "23503", r.error?.message);
  assert.deepEqual(await heldFor("Nobody's decision"), { rows: [], recips: [], jobs: [], decisions: [] });

  // An undo link onto another workspace's decision: the link is real, so it is kept, and the ledger's same-workspace
  // key refuses it, after the run was written.
  const theirs = await db
    .from("decisions")
    .insert({
      tenant_id: B,
      subject_type: "workspace",
      subject_id: B,
      verb: "export",
      actor_type: "system",
      payload: {},
    })
    .select("id")
    .single();
  assert.equal(theirs.error, null, theirs.error?.message);
  const crossed = await assemble(db, "Crossed undo", { p_undo_of: theirs.data.id });
  assert.equal(crossed.error?.code, "23503", crossed.error?.message);
  assert.deepEqual(await heldFor("Crossed undo"), { rows: [], recips: [], jobs: [], decisions: [] });

  // And a detail that is no object is refused before anything is written.
  const words = await assemble(db, "Words", { p_decision: "sure" });
  assert.equal(words.error?.code, "22023", words.error?.message);
  assert.deepEqual(await heldFor("Words"), { rows: [], recips: [], jobs: [], decisions: [] });
});

test("a run the four-argument door refuses writes no decision either; an undo link nobody holds is dropped and said", async (t) => {
  if (skip) return t.skip(skip);
  const stranger = await db.from("contacts").insert({ tenant_id: B, phone_e164: "+15550189999" }).select("id").single();
  assert.equal(stranger.error, null, stranger.error?.message);
  const refused = await assemble(db, "Refused whole", {
    p_recipients: [...two(), { contact_id: stranger.data.id, facts: null }],
  });
  assert.match(refused.error?.message ?? "", /not this workspace's to send to/);
  assert.deepEqual(await heldFor("Refused whole"), { rows: [], recips: [], jobs: [], decisions: [] });

  const unknown = "00000000-0000-4000-8000-000000000001";
  const { data, error } = await assemble(db, "Dropped undo", { p_undo_of: unknown });
  assert.equal(error, null, error?.message);
  assert.equal(data.undo_dropped, true, "the link named a decision nobody holds");
  assert.equal((await heldFor("Dropped undo")).decisions[0].undo_of, null);
});

test("00282's door still answers the id alone, for an app deployed before 00373", async (t) => {
  if (skip) return t.skip(skip);
  const { data, error } = await db.rpc("assemble_broadcast", {
    p_tenant: A,
    p_run: run("Before"),
    p_recipients: two(),
    p_send_at: far(),
  });
  assert.equal(error, null, error?.message);
  assert.match(data, /^[0-9a-f-]{36}$/, "a uuid, as it always answered");
  const held = await heldFor("Before");
  assert.deepEqual([held.rows.length, held.jobs.length, held.decisions.length], [1, 1, 0]);
});

test("the door with its decision is the service role's alone: a member's session cannot call it", async (t) => {
  if (skip) return t.skip(skip);
  if (!ANON) return t.skip("no SUPABASE_ANON_KEY in env: the session this case signs in with needs it");
  const email = `decided-owner-${RUN}@example.com`;
  const password = `pw-${RUN}-owner-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  const m = await db.from("memberships").insert({ tenant_id: A, user_id: made.data.user.id, role: "owner" });
  assert.equal(m.error, null, m.error?.message);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  const r = await assemble(client, "Not a session's", { p_actor: made.data.user.id });
  assert.ok(r.error, "refused");
  assert.match(r.error.message, /permission denied|not found|could not find/i);
  assert.deepEqual(await heldFor("Not a session's"), { rows: [], recips: [], jobs: [], decisions: [] });
});
