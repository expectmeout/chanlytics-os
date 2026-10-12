/**
 * 00408 on a real Postgres: a listing keeps its review link.
 *
 *   1. The migration runs again, twice, and changes nothing: google_listings.new_review_uri is text, null, with no
 *      default, and says what it is.
 *   2. A listing has none until one is written; db reviewLinkOf reads the workspace's own through the member's session
 *      the dashboard reads with (the table's policy covers the column: a member reads nothing of another workspace's),
 *      and none for a workspace with no listing.
 *
 * Local stack only: it makes workspaces, a member and listings with the service key and removes them after, reads the
 * catalog through the CLI (SUPABASE_CLI names it), as lead-lists.db.test.mjs does, and runs the migration as the CLI's
 * runner runs a file, in one transaction, through psql in the stack's database container (the one supabase/config.toml's
 * project_id names, under SUPABASE_WORKDIR when it is set, as schema-snapshot.db.test.mjs reaches it): `db query` takes
 * one statement, and a migration is several. Both go through ./_db-stack.mjs, which first holds that stack to the one
 * SUPABASE_URL names and fails the suite where they differ, so the migration never lands on another stack.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { reviewLinkOf } from "@chanlytics/db";
import { migrationNamed, query, runMigration } from "./_db-stack.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces and runs a migration"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the member this suite reads as needs it"
        : false;

const REVIEW_LINK = "a_listing_keeps_its_review_link";

/** The column as the catalog says it, and its comment. */
const column = () =>
  query(
    `select c.data_type, c.is_nullable, c.column_default,
            col_description('public.google_listings'::regclass, c.ordinal_position::int) as comment
       from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'google_listings' and c.column_name = 'new_review_uri'`,
  );

let db;
const made = { tenants: [], users: [] };
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
async function workspace(slug, listed) {
  const id = ok(
    await db
      .from("tenants")
      .insert({ slug: `${slug}-${Date.now()}`, name: "Harbor Studio", timezone: "UTC" })
      .select("id")
      .single(),
  ).id;
  made.tenants.push(id);
  if (listed)
    ok(
      await db
        .from("google_listings")
        .insert({ tenant_id: id, place_id: `place-review-${id.slice(0, 8)}`, name: "Harbor Studio" }),
    );
  return id;
}
/** A real session for a fresh member of a workspace. */
async function memberOf(tenant) {
  const email = `review-link-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const user = ok(await db.auth.admin.createUser({ email, password, email_confirm: true })).user;
  made.users.push(user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: user.id, role: "viewer" }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await client.auth.signInWithPassword({ email, password }));
  return client;
}

let A; // the workspace under test, its listing found by the public read and then bound to a profile
let B; // another workspace, with a link of its own
let C; // a workspace with no listing
let memberA;

before(async () => {
  if (skip) return;
  // A database the replay built holds the column already; one that has not reached 00408 gets it here.
  runMigration(migrationNamed(REVIEW_LINK));
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await workspace("review-link-a", true);
  B = await workspace("review-link-b", true);
  C = await workspace("review-link-c", false);
  memberA = await memberOf(A);
});

after(async () => {
  if (skip) return;
  for (const t of made.tenants) await db.from("tenants").delete().eq("id", t);
  for (const u of made.users) await db.auth.admin.deleteUser(u);
});

test(
  "00408 runs again, twice, and changes nothing: new_review_uri is text, null, with no default, and says what it is",
  { skip },
  () => {
    const once = column();
    assert.equal(once.length, 1, "the column is there");
    assert.deepEqual(
      { data_type: once[0].data_type, is_nullable: once[0].is_nullable, column_default: once[0].column_default },
      { data_type: "text", is_nullable: "YES", column_default: null },
    );
    assert.match(once[0].comment, /^Where a customer leaves this business a review on Google/);
    runMigration(migrationNamed(REVIEW_LINK));
    runMigration(migrationNamed(REVIEW_LINK));
    assert.deepEqual(column(), once);
  },
);

test(
  "a listing has no review link until one is written; reviewLinkOf reads the workspace's own through a member's session, nothing of another's, and none without a listing",
  { skip },
  async () => {
    const fresh = ok(await db.from("google_listings").select("new_review_uri").eq("tenant_id", A).single());
    assert.equal(fresh.new_review_uri, null, "null by default");
    assert.equal(await reviewLinkOf(db, A), null);
    assert.equal(await reviewLinkOf(memberA, A), null);

    const linkA = "https://example.com/review/harbor-studio";
    const linkB = "https://example.com/review/another-studio";
    ok(await db.from("google_listings").update({ new_review_uri: linkA }).eq("tenant_id", A));
    ok(await db.from("google_listings").update({ new_review_uri: linkB }).eq("tenant_id", B));

    assert.equal(await reviewLinkOf(db, A), linkA, "the edge's service role");
    assert.equal(await reviewLinkOf(memberA, A), linkA, "the member's session, as the dashboard's port reads it");
    assert.equal(await reviewLinkOf(memberA, B), null, "another workspace's link is not theirs to read");
    assert.equal(await reviewLinkOf(db, B), linkB);
    assert.equal(await reviewLinkOf(db, C), null, "no listing, no link");
  },
);
