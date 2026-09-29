/**
 * The nightly's Ask day check tells "Ask crossed a line" (exit 1) from "the check could not run" (exit 2), and says
 * which in its last line, the line the nightly's issue carries (the scorecard's I2:2). On main a crash exited 1, so a
 * refused read filed an alarm about Ask's cache with the stack's last line in it.
 *
 * Run with nothing it could reach: no variable of the shell that runs the suite is passed on (the nightly's hold the
 * service key), the database is a closed port on this machine, and the key is made up. The day's numbers are never
 * read, and no model is asked anything.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { ROOT } from "../_source.mjs";

/** ask-day.mjs --check, with only these variables beside what a process needs to start. */
function askDay(vars) {
  const env = { PATH: process.env.PATH ?? "", ...vars };
  for (const k of ["SystemRoot", "SYSTEMROOT", "TEMP", "TMP"]) if (process.env[k]) env[k] = process.env[k];
  return spawnSync(process.execPath, ["tooling/scripts/ops/ask-day.mjs", "--check"], {
    cwd: ROOT,
    env,
    encoding: "utf8",
    timeout: 30_000,
  });
}
const lastLine = (out) => out.trim().split("\n").at(-1);

test("a missing variable is 'could not run', exit 2, said last", () => {
  const r = askDay({});
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(lastLine(r.stdout), /^Ask's day could not be checked: .*SUPABASE_SERVICE_ROLE_KEY are required$/);
});

test("a read that throws is 'could not run', exit 2, never 'crossed a line'", () => {
  const r = askDay({ SUPABASE_URL: "http://127.0.0.1:9", SUPABASE_SERVICE_ROLE_KEY: "not-a-key" });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(lastLine(r.stdout), /^Ask's day could not be checked: /);
  assert.doesNotMatch(r.stdout, /crossed a line/);
});
