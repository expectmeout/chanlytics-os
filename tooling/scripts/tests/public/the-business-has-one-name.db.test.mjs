/**
 * The business has one name (00439; the wiring's second audit, X4-5), on a real database through PostgREST.
 *
 * Proved here: an owner's session may rename its workspace (tenants.name, the name its sign-up page, its paper form and
 * its desk sign say), and nothing else of the row beyond what it could before; a member without the settings permission
 * changes nothing (RLS answers no row). The public page asks whether the business on record has a tax id
 * (sole_proprietor_of) as the service role only, and never reads the tax id. An owner may ask a person at Chanlytics to
 * change the name the carriers hold (setup_request 'name'). And each campaign filed before this keeps the name it was
 * filed under (lines.facts.a2p_campaign_name): the workspace's, which no owner could change before; a line that keeps one
 * already, or has no campaign, is let be, and the statement runs again to the same end. Skipped without a local database;
 * never production. The migration's backfill is run again through the Supabase CLI (SUPABASE_CLI names the binary
 * when `supabase` is not on PATH, SUPABASE_DB_URL the database on this machine).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const DB_URL = process.env.SUPABASE_DB_URL;
const CLI_TARGET =
  DB_URL && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/.test(DB_URL)
    ? ["--db-url", `${DB_URL}${DB_URL.includes("?") ? "&" : "?"}sslmode=disable`]
    : ["--local"];
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users and workspaces"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members' sessions need it"
        : false;

const ok = (r, what = "") => {
  assert.equal(r.error, null, `${what}${r.error?.message ?? ""}`);
  return r.data;
};

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let db;
let owner;
let viewer;
let W;
const made = [];
const users = [];

/** A member of the workspace in the given role, signed in: their own session. */
async function member(role) {
  const email = `one-name-${role}-${RUN}@example.com`;
  const password = `pw-${RUN}-Aa1!`;
  const u = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(u.error, null, u.error?.message);
  users.push(u.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: W, user_id: u.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return client;
}

/** The business on record, every column the table requires; the tax id as given. */
const record = (tenant_id, ein) => ({
  tenant_id,
  legal_name: "Harbor Moving LLC",
  street: "1 Example Street",
  city: "Miami",
  region: "FL",
  postal_code: "33101",
  website_url: "",
  contact_first_name: "Ada",
  contact_last_name: "Lovelace",
  contact_email: "owner@example.com",
  contact_phone: "+13055550199",
  ein,
});

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  W = ok(
    await db
      .from("tenants")
      .insert({ slug: `one-name-${RUN}`, name: "Harbor Moving" })
      .select("id")
      .single(),
  ).id;
  made.push(W);
  owner = await member("owner");
  viewer = await member("viewer");
});

after(async () => {
  if (skip) return;
  for (const id of made) await db.from("tenants").delete().eq("id", id);
  for (const id of users) await db.auth.admin.deleteUser(id);
});

const nameOf = async (id) => ok(await db.from("tenants").select("name").eq("id", id).single()).name;

test(
  "an owner renames the workspace, and that is all of the row they may newly change; a viewer changes nothing",
  { skip },
  async () => {
    const renamed = ok(await owner.from("tenants").update({ name: "Harbor Movers" }).eq("id", W).select("id, name"));
    assert.deepEqual(renamed, [{ id: W, name: "Harbor Movers" }]);
    assert.equal(await nameOf(W), "Harbor Movers");

    // The column grant is the name's alone: the address it is reached at is not the owner's to change.
    const slug = await owner
      .from("tenants")
      .update({ slug: `taken-${RUN}` })
      .eq("id", W)
      .select("id");
    assert.notEqual(slug.error, null, "a column outside the grant is refused");

    // A member without the settings permission: RLS answers success with no row, and nothing moved.
    const none = ok(await viewer.from("tenants").update({ name: "Not Harbor" }).eq("id", W).select("id"));
    assert.deepEqual(none, []);
    assert.equal(await nameOf(W), "Harbor Movers");
  },
);

test("the public page asks whether the business has a tax id, as the service role only", { skip }, async () => {
  assert.equal(ok(await db.rpc("sole_proprietor_of", { p_tenant_id: W })), null, "nothing on record: no answer");
  ok(await db.from("business_records").insert(record(W, null)));
  assert.equal(ok(await db.rpc("sole_proprietor_of", { p_tenant_id: W })), true, "no tax id: one person");
  ok(await db.from("business_records").update({ ein: "   " }).eq("tenant_id", W));
  assert.equal(ok(await db.rpc("sole_proprietor_of", { p_tenant_id: W })), true, "a blank one is none");
  ok(await db.from("business_records").update({ ein: "12-3456789" }).eq("tenant_id", W));
  assert.equal(ok(await db.rpc("sole_proprietor_of", { p_tenant_id: W })), false);

  for (const [who, client] of [
    ["the owner", owner],
    ["a visitor", createClient(URL_, ANON, { auth: { persistSession: false } })],
  ]) {
    const r = await client.rpc("sole_proprietor_of", { p_tenant_id: W });
    assert.notEqual(r.error, null, `${who} is refused: the page reads as the service role`);
  }
});

test("an owner asks a person at Chanlytics to change the name the carriers hold", { skip }, async () => {
  const asked = ok(await owner.rpc("setup_request", { p_tenant_id: W, p_what: "name" }));
  assert.equal(asked.ok, true);
  assert.equal(asked.already, false);
  const bell = ok(
    await db.from("notifications").select("title, route").eq("tenant_id", W).eq("subject_type", "setup").limit(5),
  );
  assert.deepEqual(bell, [
    { title: "We got your request to change your name with the carriers", route: "admin/workspace" },
  ]);
  const again = ok(await owner.rpc("setup_request", { p_tenant_id: W, p_what: "name" }));
  assert.equal(again.already, true, "once a day per thing");
  const unknown = await owner.rpc("setup_request", { p_tenant_id: W, p_what: "logo" });
  assert.notEqual(unknown.error, null);
});

test(
  "each campaign already filed keeps the name it was filed under; a line that keeps one, or has none, is let be",
  { skip },
  async () => {
    const B = ok(
      await db
        .from("tenants")
        .insert({ slug: `one-name-b-${RUN}`, name: "Bayside" })
        .select("id")
        .single(),
    ).id;
    made.push(B);
    const line = (tenant_id, e164, over) =>
      db
        .from("lines")
        .insert({ tenant_id, e164, provider: "twilio", ...over })
        .select("id")
        .single();
    const filed = ok(await line(B, "+13055550171", { campaign_sid: "CMfiled", facts: { trunk_ready: true } })).id;
    const kept = ok(
      await line(B, "+13055550172", { campaign_sid: "CMkept", facts: { a2p_campaign_name: "Old Bayside" } }),
    ).id;
    const unfiled = ok(await line(B, "+13055550173", { facts: {} })).id;

    // The migration's own statement, as written there (the CLI runs one statement a call), twice: re-runnable.
    const migration = readFileSync(path.join(ROOT, "supabase/migrations/00439_the_business_has_one_name.sql"), "utf8");
    const sql = /^update public\.lines[\s\S]*?;/m.exec(migration)?.[0];
    assert.ok(sql, "the backfill is in the migration");
    for (let i = 0; i < 2; i++) {
      const r = spawnSync(CLI, ["db", "query", ...CLI_TARGET, sql], { cwd: ROOT, encoding: "utf8" });
      if (r.error)
        throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
      assert.equal(r.status, 0, [r.stderr, r.stdout].join("\n").slice(-600));
    }

    const factsOf = async (id) => ok(await db.from("lines").select("facts").eq("id", id).single()).facts;
    assert.deepEqual(
      await factsOf(filed),
      { trunk_ready: true, a2p_campaign_name: "Bayside" },
      "its facts kept beside",
    );
    assert.deepEqual(await factsOf(kept), { a2p_campaign_name: "Old Bayside" });
    assert.deepEqual(await factsOf(unfiled), {}, "no campaign, no name");
  },
);
