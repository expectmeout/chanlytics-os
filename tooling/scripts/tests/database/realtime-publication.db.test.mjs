/**
 * What the one subscription listens to is what the database publishes.
 *
 * packages/db realtime.ts names the tables whose changes repaint a surface, and a surface's refreshOnTables may name
 * only those (a-list-has-a-life.test.mjs holds that half). The other half is the catalog's: a table the client
 * watches but the database never put in `supabase_realtime` sends nothing, and the surface waits for a reload with
 * no error anywhere. lead_searches was one, from 00140 until 00212; this reads the publication itself, on the
 * database `supabase start` builds from the migrations, through the CLI, the way privileges.db.test.mjs does.
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
  "every table the one subscription watches is in supabase_realtime, lead_searches among them (00212)",
  { skip },
  async () => {
    const { watchedTables } = await import(pathToFileURL(path.join(ROOT, "packages/db/src/realtime.ts")).href);
    const live = published();
    assert.ok(live.includes("lead_searches"), "a search's own row reaches the Leads page live (00212)");
    assert.deepEqual(
      watchedTables().filter((t) => !live.includes(t)),
      [],
      "a watched table the database does not publish sends nothing, and its surface waits for a reload",
    );
  },
);
