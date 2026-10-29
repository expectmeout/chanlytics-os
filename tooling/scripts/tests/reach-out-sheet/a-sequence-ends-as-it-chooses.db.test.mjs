/**
 * A cold email ends as its sequence says (00491, decision 0077), on a real Postgres: `sequence_steps.signs_with` is
 * `name` unless a sequence chose its mailbox's signature, and nothing else; the chain's save writes it where its body
 * names it and keeps it where the body does not (a client from before it cannot unset a choice it never showed); and a
 * sequence New makes writes from the connected mailboxes whose SPF and DKIM are not missing (every connected one where
 * none is), one email every 20 minutes.
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
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

const stamp = Date.now().toString(36);
let db;
let A;
let B;
const users = [];
const as = {};
let n = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single()).id;

/** A member of a workspace, signed in on their own client. */
async function owner(tenant, label) {
  const email = `ends-${label}-${stamp}@fixture-ends.example`;
  const password = `pw-${stamp}-${label}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role: "owner" }));
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await c.auth.signInWithPassword({ email, password }));
  return { id: made.data.user.id, c };
}

/** A connected mailbox, on a host of its own, with what DNS said of its domain. */
const mailbox = (tenant, dns) => {
  n += 1;
  const host = `ends-${stamp}-${n}.example`;
  return one(
    db.from("mailbox_connections").insert({
      tenant_id: tenant,
      provider: "google",
      provider_account: `acct-${stamp}-${n}`,
      address: `sam${n}@${host}`,
      host,
      from_name: "Sam at Harbor",
      dns,
    }),
  );
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  for (const [k, name] of [
    ["A", "Harbor Moving Co"],
    ["B", "Bayside Movers"],
  ]) {
    const id = await one(db.from("tenants").insert({ slug: `ends-${k.toLowerCase()}-${stamp}`, name }));
    ok(await db.rpc("provision_tenant", { p_tenant_id: id }));
    ok(await db.from("billing_accounts").upsert({ tenant_id: id, mode: "direct", status: "active" }));
    if (k === "A") A = id;
    else B = id;
  }
  as.a = await owner(A, "a");
  as.b = await owner(B, "b");
});
after(async () => {
  if (skip) return;
  for (const t of [A, B].filter(Boolean)) await db.from("tenants").delete().eq("id", t);
  for (const u of users) await db.auth.admin.deleteUser(u);
});

const listOf = (tenant, name) =>
  one(db.from("lead_searches").insert({ tenant_id: tenant, via: "chosen", card: "", name, asked: "", plan: {} }));
const chainOf = (search, over = {}) => ({
  name: `Movers ${stamp} ${(n += 1)}`,
  search_id: search,
  include_unconfirmed: false,
  gap_minutes: 20,
  mailbox_ids: [],
  signed_by: "Sam",
  steps: [{ subject: "Quick one for {{business}}", body: "{{opening}}", after_days: null }],
  ...over,
});
const save = (chain) => db.rpc("reach_out_save", { p_tenant_id: A, p_user_id: as.a.id, p_chain: chain });
const rootOf = async (id) =>
  ok(await db.from("sequence_steps").select("signs_with, gap_minutes, mailbox_ids, owner_sends").eq("id", id).single());

test("a sequence ends with its name unless it chose its mailbox's signature, and the column holds no third way", async (t) => {
  if (skip) return t.skip(skip);
  const made = ok(await save(chainOf(await listOf(A, "Movers plain"))));
  assert.equal((await rootOf(made.root_id)).signs_with, "name", "a new chain ends with its name");
  const bad = await db.from("sequence_steps").update({ signs_with: "both" }).eq("id", made.root_id);
  assert.equal(bad.error?.code, "23514", "the shape refuses any other");
});

test("the save writes the ending its body names, and keeps it where the body names none", async (t) => {
  if (skip) return t.skip(skip);
  const list = await listOf(A, "Movers signed");
  const made = ok(await save(chainOf(list, { signs_with: "mailbox" })));
  assert.equal((await rootOf(made.root_id)).signs_with, "mailbox");
  const step = { subject: "Quick one for {{business}}", body: "{{opening}}", after_days: null, id: made.step_ids[0] };
  // An edit from a client that never showed the choice: the sequence keeps its signature.
  const { name } = chainOf(list);
  ok(await save({ ...chainOf(list, { name }), root_id: made.root_id, steps: [step] }));
  assert.equal((await rootOf(made.root_id)).signs_with, "mailbox", "kept: the body named none");
  ok(await save({ ...chainOf(list, { name, signs_with: "name" }), root_id: made.root_id, steps: [step] }));
  assert.equal((await rootOf(made.root_id)).signs_with, "name", "written: the body named it");
});

test("New writes from the mailboxes whose SPF and DKIM are set, every one where none is, one email every 20 minutes", async (t) => {
  if (skip) return t.skip(skip);
  const set = await mailbox(A, { spf: "found", dkim: "found", dmarc: "found", mx: "found" });
  await mailbox(A, { spf: "missing", dkim: "missing", dmarc: "found", mx: "found" });
  const unread = await mailbox(A, {});
  const a = ok(
    await as.a.c.rpc("sequence_create", {
      p_tenant_id: A,
      p_first: { starts: "leads", name: `Movers ${stamp} new` },
      p_start: false,
    }),
  );
  const root = await rootOf(a.id);
  assert.deepEqual(
    [...root.mailbox_ids].sort(),
    [set, unread].sort(),
    "a record DNS could not read is not a missing one",
  );
  assert.equal(root.gap_minutes, 20);
  assert.equal(root.owner_sends, false);
  assert.equal(root.signs_with, "name");
  // Every mailbox with a record missing: the sequence writes from them all, never handed to the owner for DNS alone.
  const b1 = await mailbox(B, { spf: "missing", dkim: "found" });
  const b2 = await mailbox(B, { spf: "found", dkim: "missing" });
  const b = ok(
    await as.b.c.rpc("sequence_create", {
      p_tenant_id: B,
      p_first: { starts: "leads", name: `Bayside ${stamp} new` },
      p_start: false,
    }),
  );
  const rootB = await rootOf(b.id);
  assert.deepEqual([...rootB.mailbox_ids].sort(), [b1, b2].sort());
  assert.equal(rootB.owner_sends, false);
});
