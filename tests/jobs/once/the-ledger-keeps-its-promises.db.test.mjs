/**
 * The ledger's promises that only a real database can keep (_sql-cases.mjs), on this machine's Postgres: a transaction
 * that fails leaves nothing of itself; a row a dead worker claimed is taken back once, and not while its lease holds; an
 * event relayed twice has one delivery and one job.
 *
 * Each case runs in a transaction that never commits, read through the CLI as the other suites of the ledger are
 * (SUPABASE_CLI names the binary). The ledger is one queue, so the file takes the ledger's lock (_file-lock.mjs) and
 * the case that claims holds the table for the moment it takes.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { takeLock } from "../../_file-lock.mjs";
import { SQL_CASES } from "./_sql-cases.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const skip = !URL_
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite claims due jobs"
    : false;

let releaseLedger;
before(async () => {
  if (skip) return;
  releaseLedger = await takeLock("jobs-ledger");
});
after(async () => {
  await releaseLedger?.();
});

/** A transaction that never commits: `body` runs in a DO block that ends by raising what it `seen`, as hex. */
function rolledBack(body) {
  const r = spawnSync(
    CLI,
    [
      "db",
      "query",
      "--local",
      `do $$ declare seen jsonb := '{}'; ${body} raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex'); end $$`,
    ],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  const said = [r.stdout, r.stderr]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const seen = /seen (7b[0-9a-f]*)/.exec(said);
  if (!seen) throw new Error(`the block did not get to say what it saw: ${said.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

for (const c of SQL_CASES) {
  test(c.name, { skip }, () => {
    assert.deepEqual(rolledBack(c.body), c.expect);
  });
}
