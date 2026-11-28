/**
 * What stands beside a workspace's rows and could be a way around them, held on the stack by the catalog.
 *
 * database/tenancy/ signs people in and proves rows, table by table: every table that names a workspace is in its
 * list or the suite fails, a member of one reads and writes nothing of another's, and a table with no workspace on it
 * says what scopes it. The door walk beside this calls every function. Three things neither can see:
 *
 *   - a view reads its tables as whoever made it unless it says otherwise, so a view a session may read that does not
 *     run as its reader shows every workspace's rows whatever the tables' rules say;
 *   - a file is no row of `public`: what keeps a workspace's files from another's is that no rule on the files' own
 *     tables admits a session at all (the server hands a caller a bucket, never the client: decision 0150);
 *   - a bucket marked public serves its files to anyone who has the address, so each one is named with what it holds.
 *
 * Read through the CLI, as database/privileges.db.test.mjs reads the catalog.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
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

const RULES = `
select 'view_reads_as_its_maker' as rule, coalesce(array_agg(x order by x), '{}') as offenders from (
  select c.relname::text as x
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
     and (has_table_privilege('authenticated', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'SELECT'))
     and not coalesce((select o like '%=true' or o like '%=on' from unnest(c.reloptions) o
                        where o like 'security_invoker=%'), false)
) s
union all
select 'session_reaches_files', coalesce(array_agg(x order by x), '{}') from (
  select p.tablename || '.' || p.policyname as x
    from pg_policies p
   where p.schemaname = 'storage'
     and (p.roles && array['public', 'anon', 'authenticated']::name[])
) s
union all
select 'public_buckets', coalesce(array_agg(x order by x), '{}') from (
  select b.id::text as x from storage.buckets b where b.public
) s
`;

/**
 * The buckets anyone with an address may read, each with what it holds. A file of a workspace's own (footage, a made
 * video, a recording, what a customer sent) is in none of them.
 */
const PUBLIC_BUCKETS = {
  "workspace-logos": "a workspace's logo, which its public page and its emails show to anyone (00407)",
  "lead-marks": "a found business's mark, drawn from its public listing for the leads table (00161)",
};

const rules = {};
before(() => {
  if (skip) return;
  for (const r of query(RULES)) rules[r.rule] = r.offenders;
});

test("every view a session may read runs as its reader, under the reader's own row rules", { skip }, () => {
  assert.deepEqual(
    rules.view_reads_as_its_maker,
    [],
    "create the view `with (security_invoker = true)`: without it the view reads every workspace's rows for whoever may select from it",
  );
});

test(
  "no rule on the files' own tables admits a session: a workspace's files are reached through the server alone",
  { skip },
  () => {
    assert.deepEqual(
      rules.session_reaches_files,
      [],
      "a policy on storage.objects or storage.buckets for a session's role opens the files to the browser's own key: hand the caller a signed address from the server instead",
    );
  },
);

test("a bucket anyone may read is named with what it holds", { skip }, () => {
  assert.deepEqual(
    rules.public_buckets.filter((b) => !(b in PUBLIC_BUCKETS)),
    [],
    "a public bucket serves its files to anyone with the address: make it private, or name it in PUBLIC_BUCKETS with what it holds",
  );
  assert.deepEqual(
    Object.keys(PUBLIC_BUCKETS).filter((b) => !rules.public_buckets.includes(b)),
    [],
    "named as public but private now, or gone: take it off the list",
  );
});
