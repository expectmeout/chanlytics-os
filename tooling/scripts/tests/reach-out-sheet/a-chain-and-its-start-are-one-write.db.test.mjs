/**
 * A chain is started with its decision (00373 reach_out_save, over 00228's door), on a real Postgres: the chain's rows
 * and the start_playbook decision on its root in one transaction. The decision was the route's own write after the
 * door, and one that failed left a chain with no line saying who started it, and a 500 the person answers by saving
 * again. Here the decision is made to fail AFTER the chain is written (an undo link onto another workspace's decision,
 * which the ledger's same-workspace key refuses: the one value the database refuses after the save, since the actor is
 * a member the door verified), and nothing of the chain remains. A chain is started once: an edit records no start.
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
      ? "refusing a database that is not on this machine: this suite makes workspaces"
      : false;

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let db;
let A;
let B;
let operator;
const users = [];
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single()).id;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(db.from("tenants").insert({ slug: `chain-a-${RUN}`, name: "Harbor Moving Co" }));
  B = await one(db.from("tenants").insert({ slug: `chain-b-${RUN}`, name: "Bayside" }));
  ok(await db.rpc("provision_tenant", { p_tenant_id: A }));
  ok(await db.from("billing_accounts").upsert({ tenant_id: A, mode: "direct", status: "active" }));
  const made = await db.auth.admin.createUser({
    email: `chain-operator-${RUN}@example.com`,
    password: `pw-${RUN}-Aa1!`,
    email_confirm: true,
  });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.data.user.id, role: "operator" }));
  operator = made.data.user.id;
});
after(async () => {
  if (skip) return;
  for (const t of [A, B].filter(Boolean)) await db.from("tenants").delete().eq("id", t);
  for (const u of users) await db.auth.admin.deleteUser(u);
});

const newSearch = (name) =>
  one(
    db.from("lead_searches").insert({ tenant_id: A, via: "people", card: "movers", name, asked: "movers", plan: {} }),
  );
const chainOf = (search, over = {}) => ({
  name: `Reach out · Movers ${RUN}`,
  search_id: search,
  include_unconfirmed: false,
  gap_minutes: 12,
  domain_ids: [],
  signed_by: "Sam",
  steps: [
    { subject: "Quick one for {{business}}", body: "{{opening}}\n\n{{your name}}", after_days: null },
    { subject: null, body: "Just checking in.", after_days: 4 },
  ],
  ...over,
});
/** 00373's door: the chain with its start's line. `p_decision` is what tells it from 00211's. */
const save = (chain, over = {}) =>
  db.rpc("reach_out_save", {
    p_tenant_id: A,
    p_user_id: operator,
    p_chain: chain,
    p_decision: { name: chain.name },
    ...over,
  });
/** What the workspace holds of a chain over this search: its steps, and the start decisions on its root. */
async function heldFor(search) {
  const { data: steps } = await db
    .from("playbooks")
    .select("id, trigger, after_playbook_id")
    .eq("tenant_id", A)
    .or(`lead_search_id.eq.${search},after_playbook_id.not.is.null`);
  const roots = (steps ?? []).filter((s) => s.trigger === "lead_first").map((s) => s.id);
  const chain = (steps ?? []).filter((s) => roots.includes(s.id) || roots.includes(s.after_playbook_id));
  const { data: decisions } = roots.length
    ? await db
        .from("decisions")
        .select("id, verb, actor_type, actor_user_id, payload, undo_of")
        .eq("tenant_id", A)
        .eq("subject_type", "playbook")
        .in("subject_id", roots)
    : { data: [] };
  return { steps: chain, decisions: decisions ?? [] };
}

test("a new chain and the start_playbook decision on its root are one write, as the member's", async (t) => {
  if (skip) return t.skip(skip);
  const s = await newSearch("Movers whole");
  const chain = chainOf(s);
  const { data, error } = await save(chain, { p_via: "sheet" });
  assert.equal(error, null, error?.message);
  assert.equal(data.step_ids.length, 2);
  assert.match(data.decision_id, /^[0-9a-f-]{36}$/);
  assert.equal(data.undo_dropped, false);
  const held = await heldFor(s);
  assert.equal(held.steps.length, 2, "the root and its nudge");
  assert.deepEqual(held.decisions, [
    {
      id: data.decision_id,
      verb: "start_playbook",
      actor_type: "user",
      actor_user_id: operator,
      payload: { name: chain.name, via: "sheet" },
      undo_of: null,
    },
  ]);
  // Edited, the chain records no start: it was started once. A decision given with an edit is refused, and the edit
  // is not made.
  const edited = chainOf(s, {
    root_id: data.root_id,
    steps: [{ ...chain.steps[0], id: data.step_ids[0], body: "Edited.\n\n{{your name}}" }],
  });
  const refused = await save(edited);
  assert.equal(refused.error?.code, "22023", refused.error?.message);
  assert.equal((await heldFor(s)).steps.length, 2, "the edit was not made: the nudge is still there");
  const plain = await save(edited, { p_decision: null });
  assert.equal(plain.error, null, plain.error?.message);
  assert.equal("decision_id" in plain.data, false, "an edit answers as 00211's door does");
  const after_ = await heldFor(s);
  assert.equal(after_.steps.length, 1, "the nudge was dropped by the edit");
  assert.equal(after_.decisions.length, 1, "and no second start");
});

test("a decision that cannot be written takes the chain with it: no steps, no words, nothing on the ledger", async (t) => {
  if (skip) return t.skip(skip);
  const s = await newSearch("Movers crossed");
  // An undo link onto another workspace's decision: the link is real, so the ledger keeps it, and its same-workspace
  // key refuses it, after the chain was written.
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
  // The steps' words are templates rows of their own (a dropped step's stay on file, hidden): counted around the save.
  const words = async () =>
    (await db.from("templates").select("id").eq("tenant_id", A).like("name", "reach_out_%")).data.length;
  const wordsBefore = await words();
  const r = await save(chainOf(s), { p_undo_of: theirs.data.id });
  assert.equal(r.error?.code, "23503", r.error?.message);
  assert.deepEqual(await heldFor(s), { steps: [], decisions: [] });
  assert.equal(await words(), wordsBefore, "the steps' words went with them");

  // A chain the inner door refuses (a pace the sheet does not offer) writes no decision either.
  const paced = await save(chainOf(s, { gap_minutes: 7 }));
  assert.equal(paced.error?.code, "23514", paced.error?.message);
  assert.deepEqual(await heldFor(s), { steps: [], decisions: [] });
  // And a detail that is no object is refused before anything is written.
  const said = await save(chainOf(s), { p_decision: ["start"] });
  assert.equal(said.error?.code, "22023", said.error?.message);
  assert.deepEqual(await heldFor(s), { steps: [], decisions: [] });
});

test("the door with its decision is the service role's alone, and 00211's still answers for an app deployed before", async (t) => {
  if (skip) return t.skip(skip);
  const s = await newSearch("Movers before");
  const { data, error } = await db.rpc("reach_out_save", { p_tenant_id: A, p_user_id: operator, p_chain: chainOf(s) });
  assert.equal(error, null, error?.message);
  assert.equal(data.step_ids.length, 2);
  assert.equal("decision_id" in data, false, "the three-argument door writes no decision: the app from before does");
  assert.deepEqual((await heldFor(s)).decisions, []);
  if (!ANON) return t.skip("no SUPABASE_ANON_KEY in env: the session this case signs in with needs it");
  const email = `chain-owner-${RUN}@example.com`;
  const password = `pw-${RUN}-owner-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.data.user.id, role: "owner" }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await client.auth.signInWithPassword({ email, password }));
  const s2 = await newSearch("Movers session");
  const denied = await client.rpc("reach_out_save", {
    p_tenant_id: A,
    p_user_id: made.data.user.id,
    p_chain: chainOf(s2),
    p_decision: { name: "theirs" },
  });
  assert.ok(denied.error, "a session may not call the service role's door");
  assert.deepEqual(await heldFor(s2), { steps: [], decisions: [] });
});
