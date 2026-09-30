/**
 * A broadcast is assembled whole (00280 assemble_broadcast), on a real Postgres: the run, its people and its send job
 * in one transaction, so nothing is left half-made when any part is refused. Before, core assembleRun wrote them in
 * three statements with a compensating fail between them, and a function that died after the first left a broadcast
 * with no people or no job: shown as scheduled, and sent by nothing. Also the release 00280 adds to the recipients'
 * guard: a claim goes back to the queue as `not_taken` when WhatsApp was never reached.
 *
 * Sessions are real (made with the admin API, signed in through the anon key), as tenancy.db.test.mjs makes them.
 * Runs against the database `supabase start` builds on this machine, never production.
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

let db;
let A;
let B;
let template;
const people = {};
const users = [];
const far = () => new Date(Date.now() + 30 * 86_400_000).toISOString();

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const ws = async (slug) => {
    const { data, error } = await db
      .from("tenants")
      .insert({ slug: `${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: slug })
      .select("id")
      .single();
    assert.equal(error, null, error?.message);
    return data.id;
  };
  A = await ws("assemble-a");
  B = await ws("assemble-b");
  const t = await db
    .from("templates")
    .insert({ tenant_id: A, channel: "whatsapp", name: "offer", language: "en_US", meta_status: "approved" })
    .select("id")
    .single();
  assert.equal(t.error, null, t.error?.message);
  template = t.data.id;
  let n = 0;
  const contact = async (tenant, erased = false) => {
    n += 1;
    const { data, error } = await db
      .from("contacts")
      .insert({
        tenant_id: tenant,
        phone_e164: `+1555017${String(n).padStart(4, "0")}`,
        ...(erased ? { erased_at: new Date().toISOString() } : {}),
      })
      .select("id")
      .single();
    assert.equal(error, null, error?.message);
    return data.id;
  };
  people.a1 = await contact(A);
  people.a2 = await contact(A);
  people.gone = await contact(A, true);
  people.b1 = await contact(B);
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
  ...over,
});
const assemble = (client, tenant, r, recipients, sendAt) =>
  client.rpc("assemble_broadcast", {
    p_tenant: tenant,
    p_run: r,
    p_recipients: recipients,
    ...(sendAt ? { p_send_at: sendAt } : {}),
  });

/** What the database holds of a run by its name: the row, its people, its jobs. */
async function heldFor(name) {
  const { data: rows } = await db
    .from("broadcasts")
    .select("id, created_by, state")
    .eq("tenant_id", A)
    .eq("name", name);
  const ids = (rows ?? []).map((r) => r.id);
  const { data: recips } = ids.length
    ? await db.from("broadcast_recipients").select("contact_id, state").in("broadcast_id", ids)
    : { data: [] };
  const { data: jobs } = await db
    .from("jobs")
    .select("kind, due_at, payload, lane, state")
    .eq("tenant_id", A)
    .eq("kind", "broadcast_send");
  return {
    rows: rows ?? [],
    recips: recips ?? [],
    jobs: (jobs ?? []).filter((j) => ids.includes(j.payload?.broadcast_id)),
  };
}

test("the run, its people and its send job are written together, the job due when the run is and in the bulk lane", async (t) => {
  if (skip) return t.skip(skip);
  const when = far();
  const { data: id, error } = await assemble(
    db,
    A,
    run("Whole", { scheduled_for: when, created_by: null }),
    [
      { contact_id: people.a1, facts: null },
      { contact_id: people.a2, facts: { visit_when: "tomorrow at 3" } },
    ],
    when,
  );
  assert.equal(error, null, error?.message);
  const held = await heldFor("Whole");
  assert.deepEqual(
    held.rows.map((r) => r.id),
    [id],
  );
  assert.deepEqual(held.recips.map((r) => r.state).sort(), ["queued", "queued"]);
  assert.equal(held.jobs.length, 1, "one send job, as this workspace");
  assert.equal(Date.parse(held.jobs[0].due_at), Date.parse(when));
  assert.equal(held.jobs[0].lane, 2, "a broadcast batch waits behind replies");
});

test("a run that waits for a person is written with its people and no job", async (t) => {
  if (skip) return t.skip(skip);
  const { error } = await assemble(db, A, run("Waiting", { state: "pending_approval" }), [
    { contact_id: people.a1, facts: null },
  ]);
  assert.equal(error, null, error?.message);
  const held = await heldFor("Waiting");
  assert.equal(held.rows.length, 1);
  assert.equal(held.recips.length, 1);
  assert.deepEqual(held.jobs, [], "nothing on the ledger until someone approves it");
});

test("one person who is not the workspace's to send to refuses the whole run: no row, no people, no job", async (t) => {
  if (skip) return t.skip(skip);
  for (const [name, stranger] of [
    ["Stranger", people.b1],
    ["Erased", people.gone],
  ]) {
    const { error } = await assemble(
      db,
      A,
      run(name),
      [
        { contact_id: people.a1, facts: null },
        { contact_id: stranger, facts: null },
      ],
      far(),
    );
    assert.match(error?.message ?? "", /not this workspace's to send to/, name);
    const held = await heldFor(name);
    assert.deepEqual([held.rows, held.recips, held.jobs], [[], [], []], `${name}: nothing was left half-made`);
  }
});

test("a template or a playbook of another workspace refuses the run whole, for every caller: a foreign key ignores row security", async (t) => {
  if (skip) return t.skip(skip);
  // The template belongs to A; B asks for it. The definer function asks what 00270 asks of a session's insert.
  const theirs = await db
    .from("templates")
    .insert({ tenant_id: B, channel: "whatsapp", name: "winback", language: "en_US", meta_status: "approved" })
    .select("id")
    .single();
  assert.equal(theirs.error, null, theirs.error?.message);
  const other = await db
    .from("playbooks")
    .insert({
      tenant_id: B,
      name: "Win-back",
      trigger: "quiet_30",
      template_id: theirs.data.id,
      template_name: "winback",
      template_language: "en_US",
      policy_class: "reengage",
      state: "paused",
    })
    .select("id")
    .single();
  assert.equal(other.error, null, other.error?.message);
  const p = await assemble(db, B, run("Foreign template"), [{ contact_id: people.b1, facts: null }], far());
  assert.match(p.error?.message ?? "", /the template is not workspace/);
  const q = await assemble(
    db,
    A,
    run("Foreign playbook", { playbook_id: other.data.id }),
    [{ contact_id: people.a1, facts: null }],
    far(),
  );
  assert.match(q.error?.message ?? "", /the playbook is not workspace/);
  for (const name of ["Foreign template", "Foreign playbook"]) {
    const held = await heldFor(name);
    assert.deepEqual([held.rows, held.recips, held.jobs], [[], [], []], `${name}: nothing was left half-made`);
  }
});

test("a state the run may not have refuses the run whole as well", async (t) => {
  if (skip) return t.skip(skip);
  const { error } = await assemble(
    db,
    A,
    run("Bad state", { state: "in_flight" }),
    [{ contact_id: people.a1, facts: null }],
    far(),
  );
  assert.ok(error, "the CHECK refuses it");
  const held = await heldFor("Bad state");
  assert.deepEqual([held.rows, held.recips, held.jobs], [[], [], []]);
});

test("the door is the service role's alone: a member's session, an operator's included, cannot call it, since it puts the send job on the ledger", async (t) => {
  if (skip) return t.skip(skip);
  if (!ANON) return t.skip("no SUPABASE_ANON_KEY in env: the sessions this case signs in with need it");
  const signedIn = async (role) => {
    const email = `assemble-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
    const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
    const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(made.error, null, made.error?.message);
    users.push(made.data.user.id);
    const m = await db.from("memberships").insert({ tenant_id: A, user_id: made.data.user.id, role });
    assert.equal(m.error, null, m.error?.message);
    const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const s = await client.auth.signInWithPassword({ email, password });
    assert.equal(s.error, null, s.error?.message);
    return client;
  };
  const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const [who, client] of [
    ["an owner", await signedIn("owner")],
    ["an operator", await signedIn("operator")],
    ["a viewer", await signedIn("viewer")],
    ["nobody signed in", anon],
  ]) {
    const name = `Refused ${who}`;
    const r = await assemble(client, A, run(name), [{ contact_id: people.a1, facts: null }], far());
    assert.ok(r.error, `${who}: refused`);
    assert.match(r.error.message, /permission denied|not found|could not find/i, who);
    assert.deepEqual((await heldFor(name)).rows, [], `${who}: nothing written`);
  }
});

test("the run is the person's the door names, whoever that is, and is nobody's when it names none", async (t) => {
  if (skip) return t.skip(skip);
  const made = await db.auth.admin.createUser({
    email: `assemble-by-${Date.now()}@example.com`,
    password: `pw-${Math.random().toString(36).slice(2)}-Aa1!`,
    email_confirm: true,
  });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  const named = await assemble(db, A, run("Theirs", { created_by: made.data.user.id }), [
    { contact_id: people.a1, facts: null },
  ]);
  assert.equal(named.error, null, named.error?.message);
  assert.equal((await heldFor("Theirs")).rows[0].created_by, made.data.user.id);
  const nobody = await assemble(db, A, run("Nobody's"), [{ contact_id: people.a1, facts: null }]);
  assert.equal(nobody.error, null, nobody.error?.message);
  assert.equal((await heldFor("Nobody's")).rows[0].created_by, null, "a sweep's run has no author");
});

test("a claim goes back to the queue as not_taken when WhatsApp was never reached, and only from a claim", async (t) => {
  if (skip) return t.skip(skip);
  const { data: id, error } = await assemble(db, A, run("Released"), [
    { contact_id: people.a1, facts: null },
    { contact_id: people.a2, facts: null },
  ]);
  assert.equal(error, null, error?.message);
  const mark = (contact, patch) =>
    db.from("broadcast_recipients").update(patch).eq("broadcast_id", id).eq("contact_id", contact).select("state");
  // Claimed before the wire (00182), then given back: nothing left.
  assert.equal((await mark(people.a1, { state: "failed", reason: "outcome_unknown" })).error, null);
  const back = await mark(people.a1, { state: "queued", reason: "not_taken" });
  assert.equal(back.error, null, back.error?.message);
  assert.deepEqual(back.data, [{ state: "queued" }]);
  // A failure that is a verdict is final, whatever the release says.
  assert.equal((await mark(people.a2, { state: "failed", reason: "send_failed" })).error, null);
  const refused = await mark(people.a2, { state: "queued", reason: "not_taken" });
  assert.match(refused.error?.message ?? "", /terminal/);
  // And a release that names no reason the guard knows is refused from a claim too.
  assert.equal((await mark(people.a1, { state: "failed", reason: "outcome_unknown" })).error, null);
  const unnamed = await mark(people.a1, { state: "queued", reason: "retry" });
  assert.match(unnamed.error?.message ?? "", /terminal/);
});
