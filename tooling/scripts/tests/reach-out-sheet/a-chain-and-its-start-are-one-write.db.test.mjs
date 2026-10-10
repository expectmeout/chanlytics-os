/**
 * A chain is started with its decision (00373 reach_out_save, over 00228's door), on a real Postgres: the chain's rows
 * and the start_playbook decision on its root in one transaction. The decision was the route's own write after the
 * door, and one that failed left a chain with no line saying who started it, and a 500 the person answers by saving
 * again. Here the decision is made to fail AFTER the chain is written (a ledger that refuses the row, in a transaction
 * that never commits), and nothing of the chain remains; an undo link onto another workspace's line is dropped and said,
 * never a failure (team_decision, 00373). A chain is started once: an edit records no start.
 *
 * Runs against the database `supabase start` builds on this machine, never production; makes its own workspaces and
 * removes them.
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
// `supabase start` runs here. psql, with no CLI, takes the same database.
const DB_URL = process.env.SUPABASE_DB_URL;
const LOCAL_DB = DB_URL && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/.test(DB_URL) ? DB_URL : null;
const CLI_TARGET = LOCAL_DB
  ? ["--db-url", `${LOCAL_DB}${LOCAL_DB.includes("?") ? "&" : "?"}sslmode=disable`]
  : ["--local"];
const PSQL_TARGET = LOCAL_DB ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

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

/**
 * A transaction on this machine's database that never commits (as the take-over's suite runs one): `body` runs in a DO
 * block that ends by raising what it `seen`, so everything it did, the trigger it made included, goes with it.
 */
function rolledBack(body) {
  const sql = `do $$ declare seen jsonb := '{}'; begin ${body} raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex'); end $$`;
  const opts = { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 };
  let r = spawnSync(CLI, ["db", "query", ...CLI_TARGET, sql], opts);
  if (r.error?.code === "ENOENT") r = spawnSync("psql", [PSQL_TARGET, "-v", "ON_ERROR_STOP=0", "-c", sql], opts);
  if (r.error)
    throw new Error(`could not run ${CLI} or psql (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  const said = [r.stdout, r.stderr]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join("\n");
  if (/not_this_database/.test(said))
    throw new Error(
      "the block reached a database that does not hold this suite's rows: point SUPABASE_DB_URL at the stack",
    );
  const seen = /seen (7b[0-9a-f]*)/.exec(said);
  if (!seen) throw new Error(`the block did not get to say what it saw: ${said.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

/** A value as a SQL jsonb literal, for the block. */
const jsonb = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

test("a decision that cannot be written takes the chain with it: no steps, no words, nothing on the ledger", async (t) => {
  if (skip) return t.skip(skip);
  const s = await newSearch("Movers refused");
  // A ledger that refuses every decision of A, made and called inside one transaction that never commits: the chain is
  // written by the three-argument door first, then the decision fails, and the chain and its words go with it.
  const chain = chainOf(s);
  const seen = rolledBack(`
    if not exists (select 1 from public.tenants where id = '${A}') then
      raise exception 'not_this_database';
    end if;
    seen := seen || jsonb_build_object('words_before',
      (select count(*) from public.templates where tenant_id = '${A}' and name like 'reach_out_%'));
    create function public.__chain_decision_refused() returns trigger language plpgsql as $f$
    begin raise exception 'the ledger is unavailable'; end $f$;
    create trigger __chain_decision_refused before insert on public.decisions
      for each row when (new.tenant_id = '${A}') execute function public.__chain_decision_refused();
    begin
      perform public.reach_out_save(
        p_tenant_id => '${A}', p_user_id => '${operator}', p_chain => ${jsonb(chain)},
        p_decision => ${jsonb({ name: chain.name })});
      seen := seen || jsonb_build_object('raised', false);
    exception when others then
      seen := seen || jsonb_build_object('raised', true, 'message', sqlerrm);
    end;
    seen := seen || jsonb_build_object(
      'steps', (select count(*) from public.playbooks p where p.tenant_id = '${A}' and p.lead_search_id = '${s}'),
      'words_after', (select count(*) from public.templates where tenant_id = '${A}' and name like 'reach_out_%'));
  `);
  assert.equal(seen.raised, true, `a ledger that refuses the row must refuse the chain (${JSON.stringify(seen)})`);
  assert.match(seen.message, /ledger is unavailable/, "it was the decision that failed, after the chain was written");
  assert.equal(seen.steps, 0, "the chain went back with the decision");
  assert.equal(seen.words_after, seen.words_before, "the steps' words went with them");

  // An undo link onto another workspace's line: dropped and said, and the chain stands with its start.
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
  const crossedSearch = await newSearch("Movers crossed");
  const crossed = await save(chainOf(crossedSearch), { p_undo_of: theirs.data.id });
  assert.equal(crossed.error, null, crossed.error?.message);
  assert.equal(crossed.data.undo_dropped, true, "a line of another workspace is not this one's to undo");
  const held = await heldFor(crossedSearch);
  assert.deepEqual([held.decisions.length, held.decisions[0].undo_of], [1, null]);

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
