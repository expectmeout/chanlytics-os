/**
 * A fix kept from a rehearsal goes through its door (decision 0069, 00481) -- on a real database. What only Postgres can
 * answer: rehearsal_fix_keep appends the fix to its rehearsal for a member who may change the workspace's settings, stamps
 * the moment, writes settings.fix_kept without the words and answers the count; a viewer, an operator, a partner who has
 * not shown the second factor and a member of another workspace find no rehearsal; a fix names a version the settings
 * reached; and a member still writes no rehearsal straight into the table.
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
let version; // A's settings version
let rehearsal; // A's typed rehearsal
let theirs; // B's
let owner; // A's owner: may change the settings
let operator; // acts in A, but the settings are not theirs to change
let viewer; // reads A
let partner; // A's partner, signed in without the second factor
let stranger; // owns B
const users = [];

async function memberClient(role, tenant) {
  const email = `fix-keep-${role}-${stamp}-${Math.random().toString(36).slice(2, 7)}@example.com`;
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

/** A workspace with its settings and one typed rehearsal; answers the workspace, its settings version and the rehearsal. */
async function workspace(tag) {
  const t = await db
    .from("tenants")
    .insert({ slug: `fix-keep-${tag}-${stamp}`, name: `fix keep ${tag}` })
    .select("id")
    .single();
  assert.equal(t.error, null, t.error?.message);
  let c = await db.from("tenant_config").select("version").eq("tenant_id", t.data.id).maybeSingle();
  if (!c.data)
    c = await db.from("tenant_config").insert({ tenant_id: t.data.id, config: {} }).select("version").single();
  assert.equal(c.error, null, c.error?.message);
  const r = await db
    .from("rehearsals")
    .insert({ tenant_id: t.data.id, kind: "typed", transcript: [{ role: "user", content: "Open Thursdays?" }] })
    .select("id")
    .single();
  assert.equal(r.error, null, r.error?.message);
  return { tenant: t.data.id, version: c.data.version, rehearsal: r.data.id };
}

const FIX = { op: "set_hours", field: "When you're open", said: "When you're open: Thursday 9 AM–7 PM" };
const keep = (client, args = {}) =>
  client.rpc("rehearsal_fix_keep", {
    p_tenant_id: A,
    p_rehearsal_id: rehearsal,
    p_fix: { ...FIX, version },
    ...args,
  });
const fixesOf = async (id) => (await db.from("rehearsals").select("fixes").eq("id", id).single()).data.fixes;
const keptEvents = async (tenant) =>
  (await db.from("events").select("data").eq("tenant_id", tenant).eq("kind", "settings.fix_kept")).data;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const a = await workspace("a");
  const b = await workspace("b");
  A = a.tenant;
  B = b.tenant;
  version = a.version;
  rehearsal = a.rehearsal;
  theirs = b.rehearsal;
  owner = await memberClient("owner", A);
  operator = await memberClient("operator", A);
  viewer = await memberClient("viewer", A);
  partner = await memberClient("partner", A);
  stranger = await memberClient("owner", B);
});

after(async () => {
  if (skip) return;
  for (const id of [A, B]) if (id) await db.from("tenants").delete().eq("id", id);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "a member who may change the settings appends the fix, stamped, with its event and never its words",
  { skip },
  async () => {
    const first = await keep(owner);
    assert.equal(first.error, null, first.error?.message);
    assert.equal(first.data, 1, "the count the rehearsal now keeps");
    const fixes = await fixesOf(rehearsal);
    assert.equal(fixes.length, 1);
    const { at, ...kept } = fixes[0];
    assert.deepEqual(kept, { ...FIX, version });
    assert.ok(Math.abs(Date.parse(at) - Date.now()) < 60_000, `the moment is the door's: ${at}`);
    const second = await keep(owner, {
      p_fix: { op: "add_note", field: "Things it should know", said: "Parking", version },
    });
    assert.equal(second.data, 2, "a second Keep appends its own");
    assert.deepEqual(
      (await fixesOf(rehearsal)).map((f) => f.op),
      ["set_hours", "add_note"],
      "newest last",
    );
    const events = await keptEvents(A);
    assert.equal(events.length, 2, "one settings.fix_kept a Keep");
    const ownerId = (await owner.auth.getUser()).data.user.id;
    assert.deepEqual(
      events.map((e) => e.data).find((d) => d.op === "set_hours"),
      {
        rehearsal_id: rehearsal,
        op: "set_hours",
        field: "When you're open",
        version,
        by: ownerId,
      },
    );
    assert.ok(!JSON.stringify(events).includes("Thursday 9 AM"), "the event carries no words");
  },
);

test(
  "a viewer, an operator, a partner without the second factor and another workspace's owner find no rehearsal",
  { skip },
  async () => {
    const before_ = (await fixesOf(rehearsal)).length;
    for (const [who, client] of [
      ["viewer", viewer],
      ["operator", operator],
      ["partner on one factor", partner],
      ["B's owner", stranger],
    ]) {
      const r = await keep(client);
      assert.equal(r.error?.code, "P0002", `${who}: ${r.error?.message}`);
    }
    // Their own workspace's id with A's rehearsal: the row is A's, so B's owner finds none.
    const across = await keep(stranger, { p_tenant_id: B });
    assert.equal(across.error?.code, "P0002", "a rehearsal of another workspace, named under one's own");
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    const nobody = await keep(anon);
    assert.ok(nobody.error, "a session nobody signed in to may not call it");
    assert.equal((await fixesOf(rehearsal)).length, before_, "nothing was appended");
    assert.deepEqual(await fixesOf(theirs), [], "B's rehearsal is untouched");
    assert.equal((await keptEvents(B)).length, 0);
  },
);

test("a fix is four words, of a version the settings reached", { skip }, async () => {
  const before_ = (await fixesOf(rehearsal)).length;
  for (const [why, fix] of [
    ["no op", { field: FIX.field, said: FIX.said, version }],
    ["an op that is no op", { ...FIX, op: "Drop table", version }],
    ["an empty line", { ...FIX, said: "  ", version }],
    ["a version as words", { ...FIX, version: String(version) }],
    ["a version the settings never reached", { ...FIX, version: version + 1 }],
    ["half a version", { ...FIX, version: version + 0.5 }],
  ]) {
    const r = await keep(owner, { p_fix: fix });
    assert.equal(r.error?.code, "22023", `${why}: ${r.error?.message}`);
  }
  const array = await keep(owner, { p_fix: [FIX] });
  assert.equal(array.error?.code, "22023", "a list is not a fix");
  assert.equal((await fixesOf(rehearsal)).length, before_, "nothing was appended");
});

test("a member still writes no rehearsal straight into the table", { skip }, async () => {
  const straight = await owner.from("rehearsals").update({ fixes: [] }).eq("id", rehearsal).select("id");
  assert.ok(straight.error || straight.data.length === 0, "no member update reaches a rehearsal");
  assert.ok((await fixesOf(rehearsal)).length > 0, "the fixes the door kept are still there");
});
