/**
 * The unique keys the in-memory database refuses a duplicate on (tooling/scripts/tests/_unique-keys.generated.json) are
 * the ones the replayed migrations build: every unique index and primary key of a public table, none left out for want
 * of a translation (`unmodelled` is empty). A migration that adds, drops or changes one without `corepack pnpm
 * gen:db-types` leaves the double refusing, or accepting, what the database does not, and this is what fails.
 *
 * It asks the stack through the Supabase CLI, as privileges.db.test.mjs does: SUPABASE_CLI names the binary where
 * `supabase` is not on PATH, and the stack is the one supabase/config.toml names.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OUT } from "../../../gen/unique-keys.mjs";
import { ROOT } from "../../_source.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine"
      : false;

const script = path.join(ROOT, "tooling/scripts/gen/unique-keys.mjs");
const check = (...args) => spawnSync(process.execPath, [script, "--check", ...args], { cwd: ROOT, encoding: "utf8" });

test("the committed keys are the replayed database's, and none is left unmodelled", { skip }, () => {
  const run = check();
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  const file = JSON.parse(fs.readFileSync(path.join(ROOT, OUT), "utf8"));
  assert.deepEqual(file.unmodelled, [], "an index the translation cannot read is an index the double does not hold");
  assert.ok(file.keys.length > 100, `${file.keys.length} keys: is this the replayed schema?`);
});

test("a stale file is exit 1, and the message says what to run", { skip }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "unique-keys-"));
  try {
    const stale = path.join(dir, "keys.json");
    const file = JSON.parse(fs.readFileSync(path.join(ROOT, OUT), "utf8"));
    file.keys.pop();
    fs.writeFileSync(stale, JSON.stringify(file, null, 2) + "\n");
    const run = check("--file", stale);
    assert.equal(run.status, 1, `${run.stdout}${run.stderr}`);
    assert.match(run.stderr, /is stale/);
    assert.match(run.stderr, /gen:db-types/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
