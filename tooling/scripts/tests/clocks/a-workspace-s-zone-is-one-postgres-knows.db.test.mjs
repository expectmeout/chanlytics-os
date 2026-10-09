/**
 * A workspace's zone is one Postgres knows (00364 tenants_zone_guard), on a real database through PostgREST.
 *
 * tenants.timezone decides the workspace's month (lead_month, lead_renews_on), its days and the hours its receptionist
 * states, and an owner may set it. The settings route judges it (contracts cleanTimezone), and create_workspace_for
 * judges it at creation, but a write through the Data API was judged by nothing: a name Postgres does not know raised
 * in lead_month for that workspace from then on. Proved here: a zone written or changed is refused, in the words
 * create_workspace_for uses, by the service role or by the owner's own session; one Postgres knows is taken; and a row
 * that already holds a name Postgres does not know (written before this, which only a write around the route could
 * leave) is let be until its zone is changed. Skipped without a local database; never production. The row that holds
 * an old name is written through the Supabase CLI with triggers off, as such a row was written before the guard
 * (SUPABASE_CLI names the binary when `supabase` is not on PATH, SUPABASE_DB_URL the database on this machine).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
        ? "no SUPABASE_ANON_KEY in env: the owner's session needs it"
        : false;

const ok = (r, what = "") => {
  assert.equal(r.error, null, `${what}${r.error?.message ?? ""}`);
  return r.data;
};

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let db;
let owner; // the owner's session, and the workspace they own
let W;
const made = [];
const users = [];

/** A workspace as the service role makes one, with the zone given (none: the column's default). */
const workspace = (tag, timezone) =>
  db
    .from("tenants")
    .insert({ slug: `zone-${tag}-${RUN}`, name: `Zone ${tag}`, ...(timezone === undefined ? {} : { timezone }) })
    .select("id, timezone")
    .single();

const zoneOf = async (id) => ok(await db.from("tenants").select("timezone").eq("id", id).single()).timezone;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  W = ok(await workspace("owned", "America/Chicago")).id;
  made.push(W);
  const email = `zone-owner-${RUN}@example.com`;
  const password = `pw-${RUN}-Aa1!`;
  const u = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(u.error, null, u.error?.message);
  users.push(u.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: W, user_id: u.data.user.id, role: "owner" }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  owner = client;
});

after(async () => {
  if (skip) return;
  for (const id of made) await db.from("tenants").delete().eq("id", id);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "a zone Postgres does not know is refused when a workspace is made with it, in create_workspace_for's words; one it knows, and the default, are taken",
  { skip },
  async () => {
    for (const zone of ["Mars/Olympus", "UTC+5", "america/chicago ", ""]) {
      const r = await workspace(`bad-${made.length}`, zone);
      assert.equal(r.error?.code, "22023", `${JSON.stringify(zone)}: refused`);
      assert.equal(r.error?.message, `Unknown timezone: ${zone}`);
    }
    for (const [tag, zone, stored] of [
      ["chicago", "America/Chicago", "America/Chicago"],
      ["chatham", "Pacific/Chatham", "Pacific/Chatham"],
      ["link", "US/Eastern", "US/Eastern"],
      ["default", undefined, "America/New_York"],
    ]) {
      const row = ok(await workspace(tag, zone), `${tag}: `);
      made.push(row.id);
      assert.equal(row.timezone, stored, tag);
      assert.match(ok(await db.rpc("lead_month", { p_tenant_id: row.id })), /^\d{4}-\d{2}$/, `${tag}: its month`);
    }
  },
);

test(
  "the owner's own session may set a zone Postgres knows and no other, and the month is read in it",
  { skip },
  async () => {
    const refused = await owner.from("tenants").update({ timezone: "Mars/Olympus" }).eq("id", W).select("timezone");
    assert.equal(refused.error?.code, "22023", "the Data API, around the route's check");
    assert.equal(await zoneOf(W), "America/Chicago", "nothing changed");
    assert.match(ok(await db.rpc("lead_month", { p_tenant_id: W })), /^\d{4}-\d{2}$/, "the month still reads");
    assert.deepEqual(
      ok(await owner.from("tenants").update({ timezone: "Europe/London" }).eq("id", W).select("timezone")),
      [{ timezone: "Europe/London" }],
    );
    const service = await db.from("tenants").update({ timezone: "Nowhere/Atlantis" }).eq("id", W).select("timezone");
    assert.equal(service.error?.code, "22023", "nor the service role");
  },
);

test(
  "a workspace that already holds a name Postgres does not know is let be until its zone changes: a write that names the same zone, or none, still lands",
  { skip },
  async () => {
    const old = ok(await workspace("old", "America/Chicago")).id;
    made.push(old);
    // As a row written before the guard holds it: the trigger off for this one statement's transaction.
    const r = spawnSync(
      CLI,
      [
        "db",
        "query",
        ...CLI_TARGET,
        `do $$ begin execute 'set local session_replication_role = replica'; update public.tenants set timezone = 'Mars/Olympus' where id = '${old}'; end $$`,
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
    if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
    assert.equal(r.status, 0, [r.stderr, r.stdout].join("\n").slice(-600));
    assert.equal(await zoneOf(old), "Mars/Olympus");
    assert.deepEqual(
      ok(
        await db
          .from("tenants")
          .update({ name: "Zone old, renamed", timezone: "Mars/Olympus" })
          .eq("id", old)
          .select("name, timezone"),
      ),
      [{ name: "Zone old, renamed", timezone: "Mars/Olympus" }],
      "the same zone sent back with the rest is no change",
    );
    assert.deepEqual(
      ok(await db.from("tenants").update({ status: "paused" }).eq("id", old).select("status, timezone")),
      [{ status: "paused", timezone: "Mars/Olympus" }],
      "nor is a write that names no zone",
    );
    const changed = await db.from("tenants").update({ timezone: "Mars/Valles" }).eq("id", old).select("timezone");
    assert.equal(changed.error?.code, "22023", "a change is judged");
    assert.deepEqual(
      ok(await db.from("tenants").update({ timezone: "America/Denver" }).eq("id", old).select("timezone")),
      [{ timezone: "America/Denver" }],
      "and a real zone mends it",
    );
  },
);
