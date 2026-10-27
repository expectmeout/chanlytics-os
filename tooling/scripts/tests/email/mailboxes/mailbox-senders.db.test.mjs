/**
 * A sender the owner sorted stays sorted, and what the mailbox left is listed (00483) -- on a real database. What only
 * Postgres can answer: mailbox_sender_sort writes what a member who may change the settings said of an address or a
 * domain, takes it back, refuses a viewer, a stranger and a sender that is neither, takes a person's address off the
 * list of what was left, and writes its line without the address; mailbox_left_note counts a sender's emails as one row
 * and is the service role's alone; members read their own workspace's rows and write none; and an erasure takes a
 * person's address off both lists, keeping what was said of a robot.
 *
 * Skipped without a local database.
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
      ? "refusing a database that is not on this machine: this suite makes workspaces and rows"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

const stamp = Date.now().toString(36);
let db;
let A;
let B;
let owner; // A's owner: may change the settings
let viewer; // reads A
let stranger; // owns B
const users = [];

async function memberClient(role, tenant) {
  const email = `senders-${role}-${stamp}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  const m = await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role });
  assert.equal(m.error, null, m.error?.message);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return client;
}

async function workspace(tag) {
  const t = await db
    .from("tenants")
    .insert({ slug: `senders-${tag}-${stamp}`, name: `senders ${tag}` })
    .select("id")
    .single();
  assert.equal(t.error, null, t.error?.message);
  return t.data.id;
}

const note = (tenant, address, why, name = null, at = new Date().toISOString()) =>
  db.rpc("mailbox_left_note", { p_tenant_id: tenant, p_address: address, p_name: name, p_why: why, p_at: at });

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await workspace("a");
  B = await workspace("b");
  owner = await memberClient("owner", A);
  viewer = await memberClient("viewer", A);
  stranger = await memberClient("owner", B);
});

after(async () => {
  if (skip) return;
  for (const id of [A, B]) if (id) await db.from("tenants").delete().eq("id", id);
  for (const id of users) await db.auth.admin.deleteUser(id);
});

test(
  "what the mailbox left is one row a sender, counted, its name and why the newest; the service role's alone",
  { skip },
  async () => {
    const first = await note(A, ` Account-Update@Amazon.com `, "updates", "Amazon", "2026-10-26T20:00:00Z");
    assert.equal(first.error, null, first.error?.message);
    const second = await note(A, "account-update@amazon.com", "said", null, "2026-10-27T09:00:00Z");
    assert.equal(second.error, null, second.error?.message);
    const row = await db
      .from("mailbox_left")
      .select("address, name, why, count, first_at, last_at")
      .eq("tenant_id", A)
      .eq("address", "account-update@amazon.com")
      .single();
    assert.equal(row.error, null, row.error?.message);
    assert.deepEqual(
      [row.data.address, row.data.name, row.data.why, row.data.count],
      ["account-update@amazon.com", "Amazon", "said", 2],
    );
    assert.equal(new Date(row.data.first_at).toISOString(), "2026-10-26T20:00:00.000Z");
    assert.equal(new Date(row.data.last_at).toISOString(), "2026-10-27T09:00:00.000Z");

    const byMember = await owner.rpc("mailbox_left_note", {
      p_tenant_id: A,
      p_address: "x@example.com",
      p_name: null,
      p_why: "updates",
      p_at: new Date().toISOString(),
    });
    assert.ok(byMember.error, "a member writes nothing to the list");
    const read = await owner.from("mailbox_left").select("address").eq("tenant_id", A);
    assert.deepEqual(
      read.data.map((r) => r.address),
      ["account-update@amazon.com"],
      "the owner reads their workspace's list",
    );
    const theirs = await stranger.from("mailbox_left").select("address").eq("tenant_id", A);
    assert.deepEqual(theirs.data, [], "another workspace's owner reads none of it");
  },
);

test(
  "a member who may change the settings sorts an address or a domain, and takes it back; a person's address leaves the list; the line names no address",
  { skip },
  async () => {
    await note(A, "rosa@example.com", "updates", "Rosa Diaz");
    const person = await owner.rpc("mailbox_sender_sort", {
      p_tenant_id: A,
      p_sender: "Rosa@Example.com",
      p_verdict: "person",
    });
    assert.equal(person.error, null, person.error?.message);
    assert.deepEqual(person.data, { sender: "rosa@example.com", kind: "address", verdict: "person" });
    const left = await db.from("mailbox_left").select("address").eq("tenant_id", A).eq("address", "rosa@example.com");
    assert.deepEqual(left.data, [], "a person's mail comes in from now on: off the list");

    const domain = await owner.rpc("mailbox_sender_sort", {
      p_tenant_id: A,
      p_sender: "amazon.com",
      p_verdict: "automated",
    });
    assert.equal(domain.error, null, domain.error?.message);
    assert.equal(domain.data.kind, "domain");
    const said = await owner.from("mailbox_senders").select("sender, verdict").eq("tenant_id", A).order("sender");
    assert.deepEqual(said.data, [
      { sender: "amazon.com", verdict: "automated" },
      { sender: "rosa@example.com", verdict: "person" },
    ]);

    const line = await db
      .from("events")
      .select("data")
      .eq("tenant_id", A)
      .eq("kind", "mailbox_connection.sender_sorted")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    assert.equal(line.error, null, line.error?.message);
    assert.deepEqual([line.data.data.kind, line.data.data.verdict], ["domain", "automated"]);
    assert.equal(JSON.stringify(line.data.data).includes("amazon"), false, "never the address or the domain");

    const back = await owner.rpc("mailbox_sender_sort", { p_tenant_id: A, p_sender: "amazon.com", p_verdict: null });
    assert.equal(back.error, null, back.error?.message);
    const after_ = await db.from("mailbox_senders").select("sender").eq("tenant_id", A).eq("sender", "amazon.com");
    assert.deepEqual(after_.data, [], "taken back");
  },
);

test(
  "a viewer, another workspace's owner, a sender that is neither an address nor a domain, and a verdict outside the two are refused",
  { skip },
  async () => {
    const byViewer = await viewer.rpc("mailbox_sender_sort", {
      p_tenant_id: A,
      p_sender: "a@b.example",
      p_verdict: "automated",
    });
    assert.equal(byViewer.error?.code, "42501");
    const byStranger = await stranger.rpc("mailbox_sender_sort", {
      p_tenant_id: A,
      p_sender: "a@b.example",
      p_verdict: "automated",
    });
    assert.equal(byStranger.error?.code, "42501");
    for (const sender of ["localhost", "a b@c.example", "<a@b.example>", "a@b@c.example", "x"]) {
      const r = await owner.rpc("mailbox_sender_sort", { p_tenant_id: A, p_sender: sender, p_verdict: "automated" });
      assert.equal(r.error?.code, "22023", sender);
    }
    const verdict = await owner.rpc("mailbox_sender_sort", {
      p_tenant_id: A,
      p_sender: "a@b.example",
      p_verdict: "spam",
    });
    assert.equal(verdict.error?.code, "22023");
    const direct = await owner
      .from("mailbox_senders")
      .insert({ tenant_id: A, sender: "c@d.example", verdict: "person" });
    assert.ok(direct.error, "a member writes no row straight into the table");
  },
);

test("an erasure takes a person's address off both lists, and keeps what was said of a robot", { skip }, async () => {
  const c = await db
    .from("contacts")
    .insert({ tenant_id: A, email: `gone-${stamp}@example.com` })
    .select("id")
    .single();
  assert.equal(c.error, null, c.error?.message);
  await note(A, `gone-${stamp}@example.com`, "updates");
  await owner.rpc("mailbox_sender_sort", {
    p_tenant_id: A,
    p_sender: `gone-${stamp}@example.com`,
    p_verdict: "person",
  });
  await note(A, `gone-${stamp}@example.com`, "updates");
  const robot = await db
    .from("contacts")
    .insert({ tenant_id: A, email: `robot-${stamp}@example.com` })
    .select("id")
    .single();
  await owner.rpc("mailbox_sender_sort", {
    p_tenant_id: A,
    p_sender: `robot-${stamp}@example.com`,
    p_verdict: "automated",
  });
  for (const id of [c.data.id, robot.data.id]) {
    const erase = await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", id);
    assert.equal(erase.error, null, erase.error?.message);
  }
  const left = await db
    .from("mailbox_left")
    .select("address")
    .eq("tenant_id", A)
    .eq("address", `gone-${stamp}@example.com`);
  assert.deepEqual(left.data, []);
  const said = await db
    .from("mailbox_senders")
    .select("sender, verdict")
    .eq("tenant_id", A)
    .in("sender", [`gone-${stamp}@example.com`, `robot-${stamp}@example.com`]);
  assert.deepEqual(said.data, [{ sender: `robot-${stamp}@example.com`, verdict: "automated" }]);
});
