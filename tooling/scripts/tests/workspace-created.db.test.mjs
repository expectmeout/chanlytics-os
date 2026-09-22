/**
 * A workspace is recorded where it is made (00104).
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
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes tenants"
      : false;

let db;
const made = [];

before(() => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip || !made.length) return;
  for (const id of made) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
});

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
  } finally {
    await db.auth.admin.deleteUser(user.data.user.id).catch(() => {});
  }
});
