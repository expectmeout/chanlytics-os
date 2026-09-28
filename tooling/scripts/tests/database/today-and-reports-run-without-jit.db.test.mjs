/**
 * Today's and Reports' reads run without JIT (00232), on a real database.
 *
 * metrics_summary, report_series, campaign_series and first_replies run plans estimated past jit_above_cost, from the
 * whole platform's tables, so a Postgres with the JIT provider compiles them on every call: modelled, Today's read of a
 * workspace took 2.6 s with JIT and 0.2 s without. Each now carries `jit = off`. What this holds is that the setting
 * survives every migration after it: a later copy of one of these functions that leaves the setting out drops it, and
 * this fails. It also says, in the log, whether this stack's Postgres could compile at all.
 *
 * Read through the CLI in a transaction that never commits, as sweep-registry.db.test.mjs turns a clock;
 * SUPABASE_CLI names the binary when `supabase` is not on PATH.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const skip = !URL_
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite reads the local stack through the CLI"
    : false;

/** A transaction that never commits: `body` runs in a DO block that ends by raising what it `seen`, as hex. */
function rolledBack(body) {
  const sql = `do $$ declare seen jsonb := '{}'; begin ${body} raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex'); end $$`;
  const r = spawnSync(CLI, ["db", "query", "--local", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  const said = [r.stdout, r.stderr]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const seen = /seen (7b[0-9a-f]*)/.exec(said);
  if (!seen) throw new Error(`the block did not get to say what it saw: ${said.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

/** The reads under Today and Reports, by their signatures. */
const READS = [
  "public.metrics_summary(uuid, integer)",
  "public.report_series(uuid, integer)",
  "public.campaign_series(uuid, integer)",
  "public.first_replies(uuid, timestamptz)",
];

test("Today's and Reports' reads run with jit off, whatever migration came after", { skip }, (t) => {
  const seen = rolledBack(`
    seen := jsonb_build_object(
      'settings', (select jsonb_object_agg(f.sig, coalesce(p.proconfig, '{}'::text[]))
                     from unnest(array[${READS.map((s) => `'${s}'`).join(", ")}]) f(sig)
                     join pg_proc p on p.oid = f.sig::regprocedure),
      'jit', current_setting('jit'),
      'can_compile', pg_jit_available());
  `);
  t.diagnostic(`this stack: jit = ${seen.jit}, pg_jit_available() = ${seen.can_compile}`);
  for (const sig of READS) {
    assert.ok(seen.settings[sig], `${sig} is in the database`);
    assert.ok(
      seen.settings[sig].includes("jit=off"),
      `${sig} runs with jit off (00232), and has ${JSON.stringify(seen.settings[sig])}: a later copy that leaves ` +
        "`set jit = off` out of the function drops it",
    );
  }
});
