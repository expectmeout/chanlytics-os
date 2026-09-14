/**
 * The floor, read from the catalog.
 *
 * tenancy.db.test.mjs signs real people in and proves rows: who reads and who
 * writes which workspace's. It cannot see a column, and it cannot see a grant
 * nothing uses. Six tables carried column UPDATE grants beside the table-wide
 * UPDATE Supabase hands out, so their column lists fenced nothing, every write
 * still worked, and that suite had nothing to fail on (00121). A rule about
 * privileges is a rule about the catalog, so these read it: on the database
 * `supabase start` builds from the migrations, through the CLI, each naming the
 * object that breaks it.
 *
 * Runs the way tenancy.db.test.mjs does, against the local stack only.
 * SUPABASE_CLI names the binary when `supabase` is not on PATH, as it does for
 * check-db-types.mjs.
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
  if (r.status !== 0) throw new Error(`supabase db query exited ${r.status}: ${(r.stderr || r.stdout).trim().slice(-600)}`);
  const out = r.stdout;
  const start = out.search(/[[{]/);
  if (start < 0) return [];
  const end = out.lastIndexOf(out[start] === "{" ? "}" : "]");
  const parsed = JSON.parse(out.slice(start, end + 1));
  return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
}

const MONTH = "'events_y' || to_char(now(), 'YYYY') || 'm' || to_char(now(), 'MM')";

const RULES = `
select 'column_fence' as rule, coalesce(array_agg(x order by x), '{}') as offenders from (
  select c.relname::text as x
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and has_table_privilege('authenticated', c.oid, 'UPDATE')
     and exists (
       select 1 from pg_attribute a cross join lateral aclexplode(a.attacl) g
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attacl is not null
          and g.grantee = 'authenticated'::regrole and g.privilege_type = 'UPDATE')
) s
union all
select 'definer_anon', coalesce(array_agg(x order by x), '{}') from (
  select p.oid::regprocedure::text as x
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')
) s
union all
select 'definer_trigger_callable', coalesce(array_agg(x order by x), '{}') from (
  select p.oid::regprocedure::text as x
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and p.prorettype = 'trigger'::regtype
     and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('public', p.oid, 'EXECUTE'))
) s
union all
select 'search_path_unpinned', coalesce(array_agg(x order by x), '{}') from (
  select p.oid::regprocedure::text as x
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg where cfg like 'search_path=%')
) s
union all
select 'no_policy_but_granted', coalesce(array_agg(x order by x), '{}') from (
  select c.relname::text as x
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
     and (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
          or has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE'))
) s
union all
select 'rls_off', coalesce(array_agg(x order by x), '{}') from (
  select c.relname::text as x
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
) s
union all
select 'partition_granted', coalesce(array_agg(x order by x), '{}') from (
  select c.relname::text as x
    from pg_inherits i join pg_class c on c.oid = i.inhrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
          or has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE'))
) s
union all
select 'session_email_lookup',
       case when has_function_privilege('authenticated', 'public.lookup_user_for_invite(uuid, text)', 'EXECUTE')
            then array['lookup_user_for_invite(uuid,text)'] else '{}'::text[] end
`;

const rules = {};
before(() => {
  if (skip) return;
  for (const r of query(RULES)) rules[r.rule] = r.offenders;
});

test("a column UPDATE grant is a fence: no table also hands authenticated table-wide UPDATE", { skip }, () => {
  // REVOKE UPDATE on a table takes its column grants with it, so the order is
  // always revoke, then grant the columns (00037, 00084, 00121).
  assert.deepEqual(rules.column_fence, [], "these tables grant columns and the whole row at once: revoke update on the table, then grant the columns again");
});

test("no function that runs with definer rights is callable by anon", { skip }, () => {
  assert.deepEqual(rules.definer_anon, [], "revoke execute from public, anon: a definer function skips RLS for whoever may call it");
});

test("no trigger function that runs with definer rights is callable by a session", { skip }, () => {
  // Postgres refuses to run one outside a trigger, and firing never checks
  // EXECUTE, so closing it costs nothing and leaves nothing for an advisor to flag.
  assert.deepEqual(rules.definer_trigger_callable, [], "revoke execute from public, anon, authenticated");
});

test("every function in public pins its search_path", { skip }, () => {
  assert.deepEqual(rules.search_path_unpinned, [], "add `set search_path = public`: an unpinned function resolves names through its caller's path");
});

test("a table with no policy grants anon and authenticated nothing", { skip }, () => {
  // RLS with no policy denies every row, and so does a forgotten revoke, until
  // someone writes a policy (00120).
  assert.deepEqual(rules.no_policy_but_granted, [], "revoke all from anon, authenticated beside every deny-all table");
});

test("every table in public has row-level security on", { skip }, () => {
  assert.deepEqual(rules.rls_off, []);
});

test("the partitions of events grant sessions nothing: a month is read through events", { skip }, () => {
  assert.deepEqual(rules.partition_granted, [], "a partition's rows are reached through its parent, whose policy scopes them");
});

test("a session cannot ask whether an address has an account", { skip }, () => {
  // Sign-up is open, so every session can own a workspace; the invite route asks
  // with the service role, after its owner check and rate bucket (00121).
  assert.deepEqual(rules.session_email_lookup, [], "lookup_user_for_invite is the service role's");
});

test("ensure_events_partition takes a stray session grant back from the month it makes", { skip }, () => {
  // Run, not read: make sure this month exists, hand authenticated a grant on
  // it, run the function again, and see what is left.
  query(`do $$
declare
  n text := ${MONTH};
begin
  perform public.ensure_events_partition(date_trunc('month', now())::date);
  execute format('grant select on table public.%I to authenticated', n);
  perform public.ensure_events_partition(date_trunc('month', now())::date);
end
$$`);
  const [row] = query(`select has_table_privilege('authenticated', format('public.%I', ${MONTH}), 'SELECT') as leaked`);
  assert.ok(row, "the privilege check answered no row");
  assert.equal(row.leaked, false, "a month made or re-made by ensure_events_partition keeps no session grant");
});
