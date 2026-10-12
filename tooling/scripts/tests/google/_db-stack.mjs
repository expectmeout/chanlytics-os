/**
 * The stack a database suite that runs a migration reaches, and the one check that it is the stack the suite's keys
 * name. Shared by google/review-link.db.test.mjs and playbooks/change/change-playbook-keys.db.test.mjs; the tests root
 * is at its twenty modules, so it lives with the first of them.
 *
 * A suite's rows go to SUPABASE_URL, but the catalog it reads (`supabase db query --local`) and the migration it runs
 * (psql in the database container supabase/config.toml's `project_id` names) go to the stack under SUPABASE_WORKDIR, or
 * under the repository when it is unset. With several stacks up on one machine, the two can be different stacks, and a
 * migration would land on one the suite's keys never named. So before the first statement either sends, the API URL
 * `supabase status` reports for that directory is compared with SUPABASE_URL, and a difference FAILS the suite: a
 * skip would read as green.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { containerOf } from "../../gen/schema-snapshot.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
/** The project directory whose supabase/config.toml names the stack, as the CLI reads it. */
const workdir = () => process.env.SUPABASE_WORKDIR || ROOT;

/** A URL's origin, the loopback named one way, so `localhost` and `127.0.0.1` on one port are one stack. */
const originOf = (url) => {
  const u = new URL(url);
  return `${u.protocol}//${u.hostname === "localhost" ? "127.0.0.1" : u.hostname}:${u.port}`;
};

let checked = false;
/**
 * The stack under the working directory is the one SUPABASE_URL names, or the suite fails here, before anything is sent
 * to it. Asked once a run, by query and runMigration before their first statement.
 */
function assertTheStackIsTheUrl() {
  if (checked) return;
  const r = spawnSync(CLI, ["status", "--output", "json", "--workdir", workdir()], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  const out = r.stdout ?? "";
  const start = out.indexOf("{");
  assert.ok(
    r.status === 0 && start >= 0,
    `${CLI} status --workdir ${workdir()} named no running stack: ${[r.stderr, out].join("\n").trim().slice(-400)}`,
  );
  const api = JSON.parse(out.slice(start, out.lastIndexOf("}") + 1)).API_URL;
  assert.ok(api, `${CLI} status --workdir ${workdir()} reported no API_URL`);
  assert.equal(
    originOf(api),
    originOf(process.env.SUPABASE_URL),
    `the stack under ${workdir()} answers at ${api}, not at SUPABASE_URL (${process.env.SUPABASE_URL}): ` +
      "set SUPABASE_WORKDIR to the project of the stack the keys are for, so no statement lands on another",
  );
  checked = true;
}

/** One statement through `supabase db query --local` on the checked stack, and its rows. */
export function query(sql) {
  assertTheStackIsTheUrl();
  const r = spawnSync(CLI, ["db", "query", "--local", "--workdir", workdir(), "--output-format", "json", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  if (r.status !== 0) throw new Error(`${CLI} db query failed: ${[r.stderr, r.stdout].join("\n").trim().slice(-800)}`);
  const out = r.stdout;
  const start = out.search(/[[{]/);
  if (start < 0) return [];
  const parsed = JSON.parse(out.slice(start, out.lastIndexOf(out[start] === "{" ? "}" : "]") + 1));
  return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
}

/** A migration's text by its name, whatever number it lands at, its lines ended as git keeps them. */
export const migrationNamed = (name) => {
  const dir = path.join(ROOT, "supabase/migrations");
  const file = fs.readdirSync(dir).find((f) => f.endsWith(`_${name}.sql`));
  assert.ok(file, `no migration is named ${name}`);
  return fs.readFileSync(path.join(dir, file), "utf8").split("\r\n").join("\n");
};

/**
 * A migration's whole text, run once on the checked stack as the CLI's runner runs a file: one transaction, stopped at
 * the first error, through psql in the stack's database container (`db query` takes one statement, and a migration is
 * several).
 */
export function runMigration(sql) {
  assertTheStackIsTheUrl();
  const container = containerOf(fs.readFileSync(path.join(workdir(), "supabase", "config.toml"), "utf8"));
  assert.ok(container, "supabase/config.toml names no project_id, so no stack to run it in");
  const r = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "--username=postgres",
      "--single-transaction",
      "--set=ON_ERROR_STOP=1",
      "--quiet",
    ],
    { input: sql, encoding: "utf8" },
  );
  if (r.error) throw new Error(`could not run docker (${r.error.message})`);
  if (r.status !== 0) throw new Error(`the migration failed in ${container}: ${r.stderr.trim().slice(-800)}`);
}
