/**
 * A workspace is recorded where it is made (00104), and made by its signed-in owner (create_workspace, 00021 through
 * create_workspace_for): only a session may call it, the caller is the session's own user and becomes the owner, a zone
 * Postgres does not know and a name too short are refused, a name of punctuation still gets a slug, and one account
 * owns ten at most. Run here since 26 Nov 2026, where workspace-creation.test.mjs had read 00021's text, which later
 * migrations had replaced.
 *
 * Sign-up used to write the workspace.created event for the workspace it
 * made, and it was the only path that did: a workspace made by its
 * signed-in owner through create_workspace left no record. The record now
 * comes from an AFTER INSERT trigger on tenants, so every path writes it --
 * a function, a migration, a console. A trigger is what reading source
 * cannot prove, so this runs against the local database the Database
 * workflow builds from every migration. Never production: `supabase start`,
 * then `pnpm test:db` with its keys.
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
      ? "refusing a database that is not on this machine: this suite writes tenants"
      : false;

/** The tests that sign somebody in need the anon key too. */
const skipSession = skip || (!ANON ? "no SUPABASE_ANON_KEY in env: the session these sign in with needs it" : false);

let db;
const made = [];
const people = [];

before(() => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  for (const id of made) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const id of people) await db.auth.admin.deleteUser(id).catch(() => {});
});

/** A real session for a fresh user, and their id. */
async function signedIn() {
  const email = `made-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const user = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(user.error, null, user.error?.message);
  people.push(user.data.user.id);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, id: user.data.user.id };
}

/** A workspace made through the door, kept for clean-up. */
async function makeAs(client, args) {
  const r = await client.rpc("create_workspace", args).single();
  if (r.data?.id) made.push(r.data.id);
  return r;
}

async function eventsFor(tenantId) {
  const { data, error } = await db
    .from("events")
    .select("kind, category, subject_type, subject_id, data")
    .eq("tenant_id", tenantId)
    .eq("kind", "workspace.created");
  assert.equal(error, null, error?.message);
  return data;
}

test("a tenants row written directly is recorded, with no session to name", { skip }, async () => {
  const slug = `recorded-${Date.now()}`;
  const { data, error } = await db
    .from("tenants")
    .insert({ slug, name: "Recorded", timezone: "America/Chicago" })
    .select("id")
    .single();
  assert.equal(error, null, error?.message);
  made.push(data.id);
  const events = await eventsFor(data.id);
  assert.equal(events.length, 1, "one record per workspace");
  assert.equal(events[0].category, "workspace");
  assert.equal(events[0].subject_type, "tenant");
  assert.equal(events[0].subject_id, data.id);
  assert.deepEqual(
    events[0].data,
    { by: null, slug, timezone: "America/Chicago" },
    "the service role is nobody; a console is nobody",
  );
});

test("the door every workspace uses is recorded the same way, and provisioning still ran", { skip }, async () => {
  // create_workspace_for is the body of create_workspace; the service role
  // may call it for a user who exists. The owner it names must be a real
  // auth user, so one is made for the duration.
  const email = `recorded-${Date.now()}@example.com`;
  const user = await db.auth.admin.createUser({ email, email_confirm: true });
  assert.equal(user.error, null, user.error?.message);
  try {
    const { data, error } = await db
      .rpc("create_workspace_for", {
        p_user: user.data.user.id,
        p_name: `Recorded door ${Date.now()}`,
        p_timezone: "Europe/Madrid",
      })
      .single();
    assert.equal(error, null, error?.message);
    made.push(data.id);
    const events = await eventsFor(data.id);
    assert.equal(events.length, 1);
    assert.equal(events[0].data.slug, data.slug);
    assert.equal(events[0].data.timezone, "Europe/Madrid");
    // Beside the record, the provisioning trigger (00017) did its part.
    const { data: policies } = await db.from("policies").select("class").eq("tenant_id", data.id);
    assert.ok(policies.length >= 7, "the policy matrix was seeded");
    // And it pays by card, nothing subscribed yet (00073's door, provision_tenant since): its billing row is made with it.
    const { data: billing } = await db.from("billing_accounts").select("mode, status").eq("tenant_id", data.id);
    assert.deepEqual(billing, [{ mode: "stripe", status: "none" }]);
  } finally {
    await db.auth.admin.deleteUser(user.data.user.id).catch(() => {});
  }
});

test(
  "only a session makes a workspace through the door, and the session's user is its owner and its record's",
  { skip: skipSession },
  async () => {
    const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const refused = await anon.rpc("create_workspace", { p_name: "No One's Shop", p_timezone: "America/Chicago" });
    assert.ok(refused.error, "a signed-out caller cannot mint a tenant");
    // The service role has no user: the door asks for a session, and says so.
    const nobody = await db.rpc("create_workspace", { p_name: "Nobody's Shop", p_timezone: "America/Chicago" });
    assert.equal(nobody.error?.code, "28000");
    assert.match(nobody.error?.message ?? "", /Sign in required/);
    const { client, id } = await signedIn();
    const { data, error } = await makeAs(client, { p_name: "Harbor Nails", p_timezone: "America/New_York" });
    assert.equal(error, null, error?.message);
    const { data: seats } = await db.from("memberships").select("user_id, role").eq("tenant_id", data.id);
    assert.deepEqual(seats, [{ user_id: id, role: "owner" }], "the caller is read inside the door, and owns it");
    const events = await eventsFor(data.id);
    assert.equal(events[0]?.data.by, id, "and the record names the session's user (00104)");
    // The body is the service role's alone: a session cannot name somebody else the owner.
    const around = await client.rpc("create_workspace_for", { p_user: id, p_name: "Around the door" });
    assert.ok(around.error, "create_workspace_for is not a session's");
  },
);

test(
  "a zone Postgres does not know, and a name too short, are refused at the door; punctuation still gets a slug",
  { skip: skipSession },
  async () => {
    const { client } = await signedIn();
    const zone = await makeAs(client, { p_name: "Mars Salon", p_timezone: "Mars/Olympus_Mons" });
    assert.equal(zone.error?.code, "22023");
    assert.match(zone.error?.message ?? "", /Unknown timezone: Mars\/Olympus_Mons/);
    const real = await makeAs(client, { p_name: "Chicago Salon", p_timezone: "America/Chicago" });
    assert.equal(real.error, null, "a zone Postgres knows is taken (pg_timezone_names read by its qualified name)");
    const short = await makeAs(client, { p_name: "A", p_timezone: "America/Chicago" });
    assert.equal(short.error?.code, "22023");
    const marks = await makeAs(client, { p_name: "!!!", p_timezone: "America/Chicago" });
    assert.equal(marks.error, null, marks.error?.message);
    assert.match(marks.data.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, "a slug with no dash at either end");
  },
);

test(
  "one account owns ten workspaces at most, and the eleventh is refused in its own words",
  { skip: skipSession },
  async () => {
    const { client, id } = await signedIn();
    for (let i = 0; i < 10; i++) {
      const { data, error } = await db
        .rpc("create_workspace_for", { p_user: id, p_name: `Ten of them ${i}`, p_timezone: "America/Chicago" })
        .single();
      assert.equal(error, null, error?.message);
      made.push(data.id);
    }
    const eleventh = await makeAs(client, { p_name: "One too many", p_timezone: "America/Chicago" });
    assert.equal(eleventh.error?.code, "54000", "a distinct code, so the route can say why");
    assert.match(eleventh.error?.message ?? "", /already owns 10 workspaces/);
  },
);
