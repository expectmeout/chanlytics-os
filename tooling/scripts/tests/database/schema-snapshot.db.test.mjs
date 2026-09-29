/**
 * supabase/schema.sql is the schema the migrations build: the replayed stack, dumped, is the committed file.
 *
 * The Database workflow replays every migration from zero and runs this suite against the result, so a migration
 * that changed the schema without regenerating the snapshot fails here, beside the types and the closed sets. The
 * script is run as a person runs it, `--check` and its exit code: 0 current, 1 stale, 2 no dump taken, which fails
 * this as surely as a stale file. It reads the stack through `docker exec` into the database container named by
 * supabase/config.toml's project_id (SUPABASE_WORKDIR names another project directory, as it does for the CLI).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FIX, OUT } from "../../gen/schema-snapshot.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = path.join(ROOT, "tooling/scripts/gen/schema-snapshot.mjs");
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: the snapshot is a local replay's"
      : false;

test(`${OUT} is what the replayed migrations dump`, { skip }, () => {
  const r = spawnSync(process.execPath, [SCRIPT, "--check"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(r.error, undefined, `could not run the script: ${r.error?.message}`);
  assert.equal(
    r.status,
    0,
    `${r.status === 1 ? "stale" : "no dump"}: ${r.stderr.trim()}\nAfter a migration: \`${FIX}\`, and commit ${OUT}.`,
  );
  assert.match(r.stdout, /is current/);
});
