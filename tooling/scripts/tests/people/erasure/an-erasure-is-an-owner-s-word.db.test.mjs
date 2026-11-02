/**
 * An erasure is an owner's word (decision 0036; 00501).
 *
 * erase_contact cannot be undone, so who may call it is the first thing it decides. 00501 let one more caller in: the
 * service role, for a person an owner's press blocked, so the erasure_finish job can finish what the press began
 * (erasure.integration.test.mjs holds its refusal, erasure-completeness.db.test.mjs its finish). Everyone else's
 * refusal was pinned only by reading the function's text (erasure.test.mjs), and no database suite called it as anyone
 * but an owner.
 *
 * So these do, with real sessions, and each caller is asked about two people: one nobody is erasing, and one whose
 * block is set, since the block is what opens the door to the system and must open it to nobody else. The owner comes
 * last and is let in, so a refusal here is the door's and not a broken person. Local stack only, and it leaves nothing
 * behind. The one call with no session goes through the CLI (SUPABASE_CLI names the binary), as the other rolled-back
 * blocks do: no session can carry a role that may run the function and no user.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, workspaces and people"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

let db;
let A; // the person's workspace
let B; // another workspace
let owner; // A's owner
let stranger; // B's owner: an owner, of somewhere else
const seats = {}; // A's members who are not its owner, by role
let live; // nobody is erasing them
let blocked; // an owner's press blocked them, and the finish has not run
const users = [];

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

async function memberClient(role, tenant) {
  const email = `owner-word-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, userId: made.data.user.id };
}

const workspace = async (name) =>
  ok(
    await db
      .from("tenants")
      .insert({ slug: `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name })
      .select("id")
      .single(),
  ).id;

const person = async (fields) =>
  ok(
    await db
      .from("contacts")
      .insert({ tenant_id: A, ...fields })
      .select("id")
      .single(),
  ).id;

const erase = (client, id) => client.rpc("erase_contact", { p_contact_id: id, p_legs: {} });

/** What the database says of a refused call: the two things a test holds it to. */
const said = (res) => {
  assert.equal(res.data, null, `answered, not refused: ${JSON.stringify(res.data)}`);
  return { code: res.error?.code, message: res.error?.message };
};

/** Both people as they stand, and every erasure on the ledger: what a refused caller must leave as it was. */
const everything = async () =>
  JSON.stringify({
    people: ok(
      await db
        .from("contacts")
        .select("id, display_name, erased_at, erasing_since")
        .in("id", [live, blocked])
        .order("id"),
    ),
    ledger: ok(await db.from("decisions").select("id").eq("tenant_id", A).eq("verb", "erase")),
  });

/**
 * What the function says to a role that may run it and has no user, in a transaction that never commits: the answer
 * goes out in the raise that rolls the block back, as hex (rolledBack in the database suites).
 */
function withNoUser(id) {
  const sql = `do $$ declare seen jsonb; begin
    begin
      perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
      set local role authenticated;
      perform public.erase_contact('${id}'::uuid, '{}'::jsonb);
      seen := '{"answered":true}';
    exception when others then
      seen := jsonb_build_object('code', sqlstate, 'message', sqlerrm);
    end;
    raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex');
  end $$`;
  const r = spawnSync(CLI, ["db", "query", "--local", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  const out = [r.stdout, r.stderr]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const seen = /seen (7b[0-9a-f]*)/.exec(out);
  if (!seen) throw new Error(`the block did not get to say what it saw: ${out.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await workspace("owner-word");
  B = await workspace("elsewhere");
  owner = await memberClient("owner", A);
  stranger = await memberClient("owner", B);
  for (const role of ["operator", "viewer", "partner"]) seats[role] = await memberClient(role, A);
  live = await person({ display_name: "Nobody Asked" });
  blocked = await person({ display_name: "Being Erased", erasing_since: new Date().toISOString() });
});

after(async () => {
  if (skip) return;
  for (const id of [A, B].filter(Boolean)) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test("signed out, the grant refuses before the function runs", { skip }, async () => {
  const signedOut = createClient(URL_, ANON, { auth: { persistSession: false } });
  const before = await everything();
  for (const id of [live, blocked]) {
    const r = said(await erase(signedOut, id));
    assert.equal(r.code, "42501", JSON.stringify(r));
    assert.match(r.message, /permission denied for function erase_contact/);
  }
  assert.equal(await everything(), before);
});

test("past the grant, a caller with no user who is not the service role is refused by the function", { skip }, () => {
  // The guard behind the grant: what 00501 changed, and the one refusal no session can reach, so it needs this block.
  for (const id of [live, blocked]) {
    assert.deepEqual(withNoUser(id), { code: "28000", message: "Sign in required." });
  }
});

test("a member who is not the owner is refused, whatever their seat", { skip }, async () => {
  const before = await everything();
  for (const [role, seat] of Object.entries(seats)) {
    for (const id of [live, blocked]) {
      assert.deepEqual(
        said(await erase(seat.client, id)),
        { code: "42501", message: "Only an owner can erase a customer's data." },
        role,
      );
    }
  }
  assert.equal(await everything(), before);
});

test("an owner of another workspace is answered as if the person did not exist", { skip }, async () => {
  const before = await everything();
  const nobody = said(await erase(stranger.client, randomUUID()));
  assert.deepEqual(nobody, { code: "P0002", message: "Contact not found." });
  for (const id of [live, blocked]) assert.deepEqual(said(await erase(stranger.client, id)), nobody);
  assert.equal(await everything(), before);
});

test("the owner is let in, block or none, and the ledger says the owner erased them", { skip }, async () => {
  for (const id of [live, blocked]) {
    const done = ok(await erase(owner.client, id));
    assert.equal(done.already_erased, false);
    const row = ok(await db.from("contacts").select("display_name, erased_at").eq("id", id).single());
    assert.equal(row.display_name, null, "the tombstone holds no name");
    assert.ok(row.erased_at, "and says when");
    assert.deepEqual(
      ok(await db.from("decisions").select("actor_type, actor_user_id").eq("id", done.decision_id).single()),
      { actor_type: "user", actor_user_id: owner.userId },
    );
  }
});
