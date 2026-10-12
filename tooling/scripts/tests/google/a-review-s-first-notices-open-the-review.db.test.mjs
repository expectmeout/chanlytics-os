/**
 * A review's first notices open the review (00411), on a real Postgres. A bell row kept before the Google sync wrote a review's
 * address (about Google's own id for it, opening the Reviews lens at its top) is said the way the sync writes one now: about the
 * review's row, opening it (contracts reviewRoute). Left as they are: a notice of several reviews, which names none; a notice of
 * a review the workspace holds no row for; another workspace's notice of a review with the same Google id; and a row already
 * said. The statement re-runs to nothing. What runs is the migration's own statement, read from its file.
 *
 * Its own workspaces and rows, made with the service key and removed after, against the database `supabase start` builds on
 * this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { lensRoute, reviewRoute } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const MIGRATION = path.join(ROOT, "supabase", "migrations", "00411_a_review_s_first_notices_open_the_review.sql");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces, reviews and notices"
      : false;

/** One statement through `supabase db query --local`: the rows it returned. */
function query(sql) {
  const r = spawnSync(CLI, ["db", "query", "--local", "--output-format", "json", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  if (r.status !== 0) throw new Error(`supabase db query exited ${r.status}: ${(r.stderr || r.stdout).slice(-800)}`);
  const out = r.stdout;
  const start = out.search(/[[{]/);
  if (start < 0) return [];
  const end = out.lastIndexOf(out[start] === "{" ? "}" : "]");
  const parsed = JSON.parse(out.slice(start, end + 1));
  return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
}

/** The migration's one statement, as the file has it, without its comments. */
function migrationUpdate() {
  const text = fs.readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n");
  const from = text.indexOf("update public.notifications");
  assert.ok(from > 0, "the migration updates the kept notices");
  return text.slice(from, text.indexOf(";", from) + 1);
}

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

let db;
const tenants = [];

/** A workspace of the suite's own, with the Google listing its reviews are held under. */
async function workspace(name) {
  const id = ok(
    await db
      .from("tenants")
      .insert({ slug: `first-review-notices-${name}-${Date.now()}`, name: `First review notices ${name}` })
      .select("id")
      .single(),
  ).id;
  tenants.push(id);
  ok(
    await db
      .from("google_listings")
      .insert({ tenant_id: id, place_id: `place-first-notices-${name}-${Date.now()}`, name }),
  );
  return id;
}

/** A review on record, by Google's own id for it: its row's id. */
async function review(tenantId, googleId) {
  return ok(
    await db
      .from("google_reviews")
      .insert({ tenant_id: tenantId, review_id: googleId, rating: 5, author: "Ada", body: "Lovely" })
      .select("id")
      .single(),
  ).id;
}

/** A bell row of a review, as the sync kept one before it wrote the review's address. */
async function notice(tenantId, route, about) {
  return ok(
    await db
      .from("notifications")
      .insert({
        tenant_id: tenantId,
        kind: "review",
        title: "A new review on Google",
        body: "5 stars from Ada",
        route,
        subject_type: about ? "review" : null,
        subject_id: about,
      })
      .select("id")
      .single(),
  ).id;
}

/** Where a kept row opens and what it is about. */
async function keptOf(id) {
  return ok(await db.from("notifications").select("route, subject_id").eq("id", id).single());
}

before(() => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  for (const id of tenants) {
    await db.from("notifications").delete().eq("tenant_id", id);
    await db.from("google_reviews").delete().eq("tenant_id", id);
    await db.from("google_listings").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
});

test(
  "a review's first notices are said as the sync says one now: about the review's row, opening it; the rest are left",
  { skip },
  async () => {
    const lens = lensRoute("reviews");
    assert.equal(lens, "reports/reviews", "the address the first rows kept");
    const harbor = await workspace("harbor");
    const bayside = await workspace("bayside");
    const googleId = `places/first-review-notices/reviews/${Date.now()}`;
    const row = await review(harbor, googleId);
    const elsewhere = await review(bayside, googleId);

    const first = await notice(harbor, lens, googleId);
    const several = await notice(harbor, lens, null);
    const goneId = `${googleId}-gone`;
    const gone = await notice(harbor, lens, goneId);
    const said = await notice(harbor, reviewRoute(row), row);
    // Bayside's row of a review with the same Google id is Bayside's to say, by its own row.
    const theirs = await notice(bayside, lens, googleId);

    query(migrationUpdate());

    assert.deepEqual(
      await keptOf(first),
      { route: reviewRoute(row), subject_id: row },
      "about the review's row, opening it",
    );
    assert.deepEqual(await keptOf(several), { route: lens, subject_id: null }, "several reviews name none: the lens");
    assert.deepEqual(await keptOf(gone), { route: lens, subject_id: goneId }, "no row held for it: left on the lens");
    assert.deepEqual(await keptOf(said), { route: reviewRoute(row), subject_id: row }, "already said: as it was");
    assert.deepEqual(
      await keptOf(theirs),
      { route: reviewRoute(elsewhere), subject_id: elsewhere },
      "each workspace's row by its own review",
    );

    // Again: nothing left that reads the first way, so nothing moves.
    query(migrationUpdate());
    assert.deepEqual(await keptOf(first), { route: reviewRoute(row), subject_id: row }, "re-run: unchanged");
  },
);
