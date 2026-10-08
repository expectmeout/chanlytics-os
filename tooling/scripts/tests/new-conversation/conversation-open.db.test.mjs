/**
 * A member opens a person's one thread, on a real database (00351): the door a member's own session opens it through,
 * since a session may not insert a conversation. Proved here because it is a definer function and grants: who may, that
 * it makes one thread and the same one after, that it touches nothing, and that a person who is not this workspace's or
 * is being forgotten has none to open. Skipped without a local database and SUPABASE_ANON_KEY; never production.
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
      ? "refusing a database that is not on this machine: this suite makes users, workspaces and customers"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the door asks who is calling, and a session needs it"
        : false;

const ok = (res, what = "") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let db;
let A; // the workspace
let B; // another workspace
let owner;
let operator;
let viewer;
let stranger;
let anon;
const users = [];
let serial = 0;
/** A made-up number (555-01xx), fresh in this run. */
const phone = () => `+1646555${String(1300 + ++serial).slice(-4)}`;

async function session(label, tenantId, role) {
  const email = `open-${label}-${RUN}@example.com`;
  const password = `pw-${RUN}-${label}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenantId, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, id: made.data.user.id };
}
/** A person of a workspace, as the service role makes one: a number, a name, nothing else. */
const personIn = async (tenant) =>
  ok(
    await db
      .from("contacts")
      .insert({ tenant_id: tenant, phone_e164: phone(), display_name: "Robin Example" })
      .select("id")
      .single(),
    "a person",
  ).id;
const open = (who, tenant, person) => who.rpc("conversation_open", { p_tenant_id: tenant, p_contact_id: person });
const threadsOf = async (person) =>
  ok(
    await db
      .from("conversations")
      .select("id, state, last_message_at, last_inbound_at, assignee_user_id, paused_until")
      .eq("contact_id", person),
    "their threads",
  );

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const workspace = async (tag) =>
    ok(
      await db
        .from("tenants")
        .insert({ slug: `open-${tag}-${RUN}`, name: `Open ${tag}` })
        .select("id")
        .single(),
    ).id;
  A = await workspace("a");
  B = await workspace("b");
  owner = await session("owner", A, "owner");
  operator = await session("operator", A, "operator");
  viewer = await session("viewer", A, "viewer");
  stranger = await session("stranger", B, "owner");
  anon = createClient(URL_, ANON, { auth: { persistSession: false } });
});

after(async () => {
  if (skip || !A) return;
  for (const t of [A, B]) {
    await db.from("events").delete().eq("tenant_id", t);
    await db.from("tenants").delete().eq("id", t);
  }
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test("a member opens a person's one thread: made once, untouched, and the same one after", { skip }, async () => {
  const person = await personIn(A);
  assert.deepEqual(await threadsOf(person), [], "they had none");
  const first = ok(await open(operator.client, A, person), "an operator opens it");
  assert.match(first, /^[0-9a-f-]{36}$/);
  assert.deepEqual(await threadsOf(person), [
    {
      id: first,
      state: "open",
      last_message_at: null,
      last_inbound_at: null,
      assignee_user_id: null,
      paused_until: null,
    },
  ]);
  assert.equal(ok(await open(owner.client, A, person), "an owner opens it again"), first, "the same thread");
  assert.equal((await threadsOf(person)).length, 1, "one thread a person");
});

test("a thread that exists is answered as it stands", { skip }, async () => {
  const person = await personIn(A);
  const at = "2026-10-01T12:00:00+00:00";
  const had = ok(
    await db
      .from("conversations")
      .insert({ tenant_id: A, contact_id: person, last_message_at: at, state: "snoozed" })
      .select("id")
      .single(),
  ).id;
  assert.equal(ok(await open(operator.client, A, person)), had);
  const [row] = await threadsOf(person);
  assert.equal(row.state, "snoozed", "opening a thread moves nothing on it");
  assert.equal(new Date(row.last_message_at).toISOString(), new Date(at).toISOString());
});

test("only a member who may act opens one, and only in their own workspace", { skip }, async () => {
  const person = await personIn(A);
  assert.equal((await open(anon, A, person)).error?.code, "42501", "signed out: no right to call it");
  assert.equal((await open(viewer.client, A, person)).error?.code, "P0002", "a viewer reads only");
  assert.equal((await open(stranger.client, A, person)).error?.code, "P0002", "another workspace's owner");
  const theirs = await personIn(B);
  assert.equal((await open(operator.client, A, theirs)).error?.code, "P0002", "another workspace's person");
  assert.equal((await open(operator.client, B, theirs)).error?.code, "P0002", "a workspace they are not in");
  assert.deepEqual(await threadsOf(person), []);
  assert.deepEqual(await threadsOf(theirs), []);
});

test("a person who is being forgotten has no thread to open", { skip }, async () => {
  const person = await personIn(A);
  ok(await db.from("contacts").update({ erasing_since: new Date().toISOString() }).eq("id", person), "the request");
  assert.equal((await open(operator.client, A, person)).error?.code, "P0002");
  assert.deepEqual(await threadsOf(person), []);
});
