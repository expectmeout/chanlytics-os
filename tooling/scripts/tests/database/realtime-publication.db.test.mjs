/**
 * No table is published to Postgres Changes (decision 0019, step 3, 00266).
 *
 * The tabs hear each workspace's notices on its private topic (00265): a statement trigger on each table the live feed
 * watches (packages/db realtime.ts, WATCHED), held to that list by each-workspace-is-told-what-changed.db.test.mjs. A
 * table put back in `supabase_realtime` would have Realtime read each of its changes from the write-ahead log and weigh
 * it against subscriptions no tab holds: the cost 0019 took away. This reads the publication itself, on the database
 * `supabase start` builds from the migrations, through the CLI, the way privileges.db.test.mjs does.
 *
 * Runs against the local stack only. SUPABASE_CLI names the binary when `supabase` is not on PATH.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const URL_ = process.env.SUPABASE_URL;
const CLI = process.env.SUPABASE_CLI || "supabase";
const skip = !URL_
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite reads the local stack through the CLI"
    : false;

/** One statement through `supabase db query --local`, and the rows it returned. */
function query(sql) {
  const r = spawnSync(CLI, ["db", "query", "--local", "--output-format", "json", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  if (r.status !== 0) {
    const said = [r.stderr, r.stdout]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .join("\n");
    throw new Error(`supabase db query exited ${r.status}: ${said.slice(-800)}`);
  }
  const out = r.stdout;
  const start = out.search(/[[{]/);
  if (start < 0) return [];
  const end = out.lastIndexOf(out[start] === "{" ? "}" : "]");
  const parsed = JSON.parse(out.slice(start, end + 1));
  return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
}

const published = () =>
  query(
    `select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' order by 1`,
  ).map((r) => r.tablename);

test(
  "no table is published to Postgres Changes: the live feed is each workspace's notices (00265, 00266)",
  { skip },
  async () => {
    const { watchedTables } = await import(pathToFileURL(path.join(ROOT, "packages/db/src/realtime.ts")).href);
    assert.ok(watchedTables().includes("lead_searches"), "the live feed still hears its tables, by their triggers");
    assert.deepEqual(
      published(),
      [],
      "a table the live feed hears gets its trigger (00265's list and WATCHED), never a place in supabase_realtime",
    );
  },
);
