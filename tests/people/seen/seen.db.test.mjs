/**
 * What a member has seen of a person (00349), proved on a real Postgres with real sessions: a member's floor is the day
 * they joined until they have a row of their own; opening a person stamps their own mark and nobody else's; putting a
 * person back as unread keeps when they last saw them; a mark says how far they have seen in the customer's own
 * moments and never goes back; every writing is stamped; a member of another workspace can neither read nor mark; the
 * tables are written through the doors alone; and a person deleted, or a member who leaves, takes their marks with them.
 *
 * Runs the way notifications.db.test.mjs does: against the database `supabase start` builds on this machine, never
 * production. Users are made with the admin API and sign in with a password through the anon key, so RLS and
 * auth.uid() judge them as the dashboard's client would.
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
      ? "refusing a database that is not on this machine: this suite makes users"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

let db;
let tenantId;
let otherTenantId;
const users = [];

/** A real session for a fresh user with this role in this workspace. */
async function memberClient(role, tenant = tenantId) {
  const email = `seen-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  const m = await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role });
  assert.equal(m.error, null, m.error?.message);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, userId: made.data.user.id };
}

/** A person of a workspace, written as the service role. */
async function person(tenant, n) {
  const r = await db
    .from("contacts")
    .insert({
      tenant_id: tenant,
      phone_e164: `+1212555${String(1000 + n).slice(-4)}`,
      display_name: `Seen Example ${n}`,
    })
    .select("id")
    .single();
  assert.equal(r.error, null, r.error?.message);
  return r.data.id;
}

const seenOf = async (client, tenant, ids) => {
  const r = await client.rpc("contact_seen", { p_tenant_id: tenant, p_contact_ids: ids });
  assert.equal(r.error, null, r.error?.message);
  return r.data;
};
const markOf = (data, id) => data.marks.find((m) => m.contact_id === id) ?? null;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const t = await db
    .from("tenants")
    .insert({ slug: `seen-${Date.now()}`, name: "Seen" })
    .select("id")
    .single();
  assert.equal(t.error, null, t.error?.message);
  tenantId = t.data.id;
  const o = await db
    .from("tenants")
    .insert({ slug: `seen-other-${Date.now()}`, name: "Other" })
    .select("id")
    .single();
  assert.equal(o.error, null, o.error?.message);
  otherTenantId = o.data.id;
});

after(async () => {
  if (skip) return;
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
  if (tenantId) await db.from("tenants").delete().eq("id", tenantId);
  if (otherTenantId) await db.from("tenants").delete().eq("id", otherTenantId);
});

test(
  "a member with no row of their own is held to the day they joined, and a member who has one to it; nobody has a mark until they make one",
  { skip },
  async () => {
    const a = await person(tenantId, 1);
    const joiner = await memberClient("viewer");
    const membership = await db
      .from("memberships")
      .select("created_at")
      .eq("tenant_id", tenantId)
      .eq("user_id", joiner.userId)
      .single();
    const first = await seenOf(joiner.client, tenantId, [a]);
    assert.equal(
      new Date(first.floor_at).getTime(),
      new Date(membership.data.created_at).getTime(),
      "no floor of their own: the day they joined",
    );
    assert.deepEqual(first.marks, [], "and no mark: they have opened nobody");

    // The migration made a floor for every member there was; a floor of one's own outranks the day one joined.
    const floor = new Date(Date.now() + 60_000).toISOString();
    const made = await db.from("contact_reads").insert({ tenant_id: tenantId, user_id: joiner.userId, seen_at: floor });
    assert.equal(made.error, null, made.error?.message);
    const second = await seenOf(joiner.client, tenantId, [a]);
    assert.equal(new Date(second.floor_at).getTime(), new Date(floor).getTime(), "their own floor");
  },
);

test(
  "opening a person stamps the caller's own mark; unread keeps when they saw them and is cleared by the next opening; a teammate's reading is their own",
  { skip },
  async () => {
    const a = await person(tenantId, 2);
    const b = await person(tenantId, 3);
    const me = await memberClient("operator");
    const mate = await memberClient("viewer");

    const opened = await me.client.rpc("contact_mark", { p_contact_id: a, p_seen: true });
    assert.equal(opened.error, null, opened.error?.message);
    assert.equal(opened.data.contact_id, a);
    assert.ok(opened.data.seen_at, "seen now");
    assert.equal(opened.data.unread_at, null);

    const mine = await seenOf(me.client, tenantId, [a, b]);
    assert.deepEqual(
      mine.marks.map((m) => m.contact_id),
      [a],
      "a mark for the person opened, none for the one that was not",
    );
    assert.deepEqual(
      (await seenOf(mate.client, tenantId, [a, b])).marks,
      [],
      "the teammate has read nothing: a mark is its member's",
    );

    const back = await me.client.rpc("contact_mark", { p_contact_id: a, p_seen: false });
    assert.equal(back.error, null, back.error?.message);
    assert.ok(back.data.unread_at, "put back as unread");
    assert.equal(back.data.seen_at, opened.data.seen_at, "and when they last saw them is kept");

    const again = await me.client.rpc("contact_mark", { p_contact_id: a, p_seen: true });
    assert.equal(again.error, null, again.error?.message);
    assert.equal(again.data.unread_at, null, "the next opening clears it");
    assert.ok(new Date(again.data.seen_at) >= new Date(opened.data.seen_at));

    // A person never opened can be put back too: a row with no seen_at, which reads as unread.
    const never = await mate.client.rpc("contact_mark", { p_contact_id: b, p_seen: false });
    assert.equal(never.error, null, never.error?.message);
    assert.equal(never.data.seen_at, null);
    assert.ok(markOf(await seenOf(mate.client, tenantId, [b]), b).unread_at);

    const neither = await me.client.rpc("contact_mark", { p_contact_id: a, p_seen: null });
    assert.equal(neither.error?.code, "22023", "neither seen nor unread is refused");
  },
);

test(
  "a member of another workspace can neither read this one's reading nor mark its people, and nobody signed out reaches either door",
  { skip },
  async () => {
    const a = await person(tenantId, 4);
    const stranger = await memberClient("owner", otherTenantId);
    const read = await stranger.client.rpc("contact_seen", { p_tenant_id: tenantId, p_contact_ids: [a] });
    assert.equal(read.error?.code, "P0002", "not their workspace");
    const mark = await stranger.client.rpc("contact_mark", { p_contact_id: a, p_seen: true });
    assert.equal(mark.error?.code, "P0002", "not their person");
    const none = await db.from("contact_marks").select("user_id").eq("contact_id", a);
    assert.deepEqual(none.data, [], "and nothing was written");

    const out = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const anonRead = await out.rpc("contact_seen", { p_tenant_id: tenantId, p_contact_ids: [a] });
    assert.ok(anonRead.error, "signed out: refused");
    const anonMark = await out.rpc("contact_mark", { p_contact_id: a, p_seen: true });
    assert.ok(anonMark.error, "signed out: refused");
  },
);

test("the tables are read by their owner alone and written through the doors alone", { skip }, async () => {
  const a = await person(tenantId, 5);
  const me = await memberClient("owner");
  const mate = await memberClient("owner");
  assert.equal((await me.client.rpc("contact_mark", { p_contact_id: a, p_seen: true })).error, null);

  const own = await me.client.from("contact_marks").select("contact_id, user_id").eq("contact_id", a);
  assert.equal(own.error, null, own.error?.message);
  assert.deepEqual(own.data, [{ contact_id: a, user_id: me.userId }], "their own row");
  const theirs = await mate.client.from("contact_marks").select("contact_id").eq("contact_id", a);
  assert.equal(theirs.error, null);
  assert.deepEqual(theirs.data, [], "RLS: a teammate's rows are not theirs to read");

  const direct = await me.client
    .from("contact_marks")
    .insert({ tenant_id: tenantId, contact_id: a, user_id: mate.userId, seen_at: new Date().toISOString() });
  assert.ok(direct.error, "no insert of one's own making: a mark for another member is refused");
  const floor = await me.client
    .from("contact_reads")
    .upsert({ tenant_id: tenantId, user_id: me.userId, seen_at: new Date().toISOString() });
  assert.ok(floor.error, "and the floor is not a member's to write");
});

test("a person erased takes every member's mark on them", { skip }, async () => {
  const a = await person(tenantId, 6);
  const me = await memberClient("owner");
  assert.equal((await me.client.rpc("contact_mark", { p_contact_id: a, p_seen: true })).error, null);
  const before_ = await db.from("contact_marks").select("user_id").eq("contact_id", a);
  assert.equal(before_.data.length, 1);
  const gone = await db.from("contacts").delete().eq("id", a);
  assert.equal(gone.error, null, gone.error?.message);
  const after_ = await db.from("contact_marks").select("user_id").eq("contact_id", a);
  assert.deepEqual(after_.data, [], "the marks went with the person");
});

test(
  "a mark says how far the member has seen, in the customer's own moments: up to what their screen held, never back, and no further than a day past this clock",
  { skip },
  async () => {
    const a = await person(tenantId, 7);
    const me = await memberClient("operator");
    const mark = async (args) => {
      const r = await me.client.rpc("contact_mark", { p_contact_id: a, ...args });
      assert.equal(r.error, null, r.error?.message);
      return r.data;
    };
    const at = (iso) => new Date(iso).getTime();

    // The customer's message is stamped by its provider, a few seconds behind this clock when it lands. A member who
    // opened the person in between has NOT seen it: their mark reaches the moment their screen held, not now().
    const heard = new Date(Date.now() - 3_600_000).toISOString();
    const opened = await mark({ p_seen: true, p_heard_at: heard });
    assert.equal(at(opened.seen_at), at(heard), "REGRESSION: stamped now(), it covered a message that landed after it");
    assert.ok(opened.marked_at, "and the writing itself is stamped");

    // An opening that knew less leaves the earlier one standing.
    const earlier = await mark({ p_seen: true, p_heard_at: new Date(Date.now() - 7_200_000).toISOString() });
    assert.equal(at(earlier.seen_at), at(heard), "what they have seen never goes back");
    assert.ok(at(earlier.marked_at) >= at(opened.marked_at), "though the writing is stamped again");

    // Something newer, opened.
    const newer = new Date(Date.now() - 60_000).toISOString();
    assert.equal(at((await mark({ p_seen: true, p_heard_at: newer })).seen_at), at(newer));

    // A provider's stamp may run ahead of this clock, and is taken; nothing honest runs a year ahead.
    const far = await mark({ p_seen: true, p_heard_at: new Date(Date.now() + 365 * 86_400_000).toISOString() });
    assert.ok(at(far.seen_at) <= Date.now() + 86_400_000 + 60_000, "no further than a day past this clock");

    // Put back: how far they have seen is kept, and the stamp moves, which is how their other screens learn of it.
    const back = await mark({ p_seen: false });
    assert.equal(at(back.seen_at), at(far.seen_at));
    assert.ok(back.unread_at);
    assert.ok(at(back.marked_at) >= at(far.marked_at));
    const read = await seenOf(me.client, tenantId, [a]);
    assert.equal(at(markOf(read, a).marked_at), at(back.marked_at), "the read carries the stamp");

    // With no moment handed in (they have never written), this clock.
    const b = await person(tenantId, 8);
    const plain = await me.client.rpc("contact_mark", { p_contact_id: b, p_seen: true });
    assert.equal(plain.error, null, plain.error?.message);
    assert.ok(Math.abs(at(plain.data.seen_at) - Date.now()) < 120_000);
  },
);

test("a member who leaves the workspace takes their floor and their marks with them", { skip }, async () => {
  const a = await person(tenantId, 9);
  const me = await memberClient("viewer");
  assert.equal((await me.client.rpc("contact_mark", { p_contact_id: a, p_seen: true })).error, null);
  const floor = await db.from("contact_reads").insert({ tenant_id: tenantId, user_id: me.userId });
  assert.equal(floor.error, null, floor.error?.message);
  const left = await db.from("memberships").delete().eq("tenant_id", tenantId).eq("user_id", me.userId);
  assert.equal(left.error, null, left.error?.message);
  const marks = await db.from("contact_marks").select("contact_id").eq("user_id", me.userId);
  const reads = await db.from("contact_reads").select("tenant_id").eq("user_id", me.userId);
  assert.deepEqual(
    [marks.data, reads.data],
    [[], []],
    "REGRESSION: with no key to the membership, an account deleted or a member removed left their reading behind for good",
  );
});
