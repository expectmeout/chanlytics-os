/**
 * The ledger wakes when a due row is written, and a job has one dedupe key (00331, decision 0031 steps 1 and 2), on a
 * real Postgres.
 *
 * jobs_wake is a statement trigger: a row scheduled and due within two seconds asks for the tick through request_sweep
 * (one pg_net request, recorded on sweep_status's 'jobs' row), at most once a second (woken_at), and a row due later
 * asks for nothing. jobs_dedupe_live holds one live row per key: a second insert is refused while the first is
 * scheduled or fired, and a row that failed lets the key be scheduled again. Each case runs in a transaction on this
 * machine's database that never commits, with its own edge in Vault, so pg_net sends nothing and nothing is left behind.
 * Read through the CLI, as jobs-lanes.db.test.mjs is; SUPABASE_CLI names the binary when `supabase` is not on PATH.
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
    ? "refusing a database that is not on this machine: this suite writes the ledger"
    : false;

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

/**
 * This transaction's own edge and key in Vault (seed.sql leaves every other session none), the 'jobs' row's wake
 * forgotten, and a workspace of its own.
 */
const ARMED = `
  delete from vault.secrets where name in ('edge_base_url', 'cron_sweep_key');
  perform vault.create_secret('http://edge.invalid', 'edge_base_url');
  perform vault.create_secret('a-made-up-key', 'cron_sweep_key');
  update public.sweep_status set woken_at = null, request_id = null, note = null where sweep = 'jobs';
  insert into public.tenants (slug, name) values ('wake-' || gen_random_uuid(), 'Wake') returning id into t;`;

/** What the wake left: the 'jobs' row's stamps and the knocks queued for the tick in this transaction. */
const LEFT = `
  (select jsonb_build_object('woken', woken_at is not null, 'asked', request_id is not null, 'note', note)
     from public.sweep_status where sweep = 'jobs')
  || jsonb_build_object('knocks', (select count(*) from net.http_request_queue q where q.url like '%/api/jobs/tick'))`;

test(
  "a row due now asks for the tick once; a second within the second asks nothing; a row due later asks nothing",
  { skip },
  () => {
    const seen = rolledBack(`
    t uuid;
    begin
      ${ARMED}
      seen := jsonb_build_object('before', ${LEFT});
      insert into public.jobs (tenant_id, kind, due_at, payload) values (t, 'push_receipts', now(), '{}');
      seen := seen || jsonb_build_object('first', ${LEFT});
      insert into public.jobs (tenant_id, kind, due_at, payload) values (t, 'push_receipts', now() - interval '1 minute', '{}');
      seen := seen || jsonb_build_object('second', ${LEFT});
      -- A second on: the stamp is older than the debounce, and the next due row asks again.
      update public.sweep_status set woken_at = now() - interval '2 seconds' where sweep = 'jobs';
      insert into public.jobs (tenant_id, kind, due_at, payload) values (t, 'push_receipts', now() + interval '1 second', '{}');
      seen := seen || jsonb_build_object('third', ${LEFT});
      update public.sweep_status set woken_at = now() - interval '2 seconds' where sweep = 'jobs';
      insert into public.jobs (tenant_id, kind, due_at, payload) values (t, 'push_receipts', now() + interval '1 minute', '{}');
      seen := seen || jsonb_build_object('later', ${LEFT});`);
    assert.deepEqual(seen.before, { woken: false, asked: false, note: null, knocks: 0 }, "nothing before");
    assert.deepEqual(seen.first, { woken: true, asked: true, note: null, knocks: 1 }, "a due row knocks once");
    assert.deepEqual(seen.second, seen.first, "a second due row within the second rides on the first knock");
    assert.deepEqual(
      seen.third,
      { ...seen.first, knocks: 2 },
      "a row due within two seconds, a second on, knocks again",
    );
    assert.deepEqual(seen.later, seen.third, "a row due in a minute asks nothing: the poll reaches it");
  },
);

test(
  "the knock is the tick's own: request_sweep's call to /api/jobs/tick with the sweep key, as pg_cron makes it",
  { skip },
  () => {
    const seen = rolledBack(`
    t uuid;
    begin
      ${ARMED}
      insert into public.jobs (tenant_id, kind, due_at, payload) values (t, 'push_receipts', now(), '{}');
      seen := (select jsonb_build_object('url', q.url, 'key', q.headers ->> 'x-cron-key')
                 from net.http_request_queue q
                where q.id = (select request_id from public.sweep_status where sweep = 'jobs'));`);
    assert.deepEqual(seen, { url: "http://edge.invalid/api/jobs/tick", key: "a-made-up-key" });
  },
);

test("a writer that finds the 'jobs' row held by another asks nothing and never waits", { skip }, () => {
  // The row is locked here as another asker's transaction would hold it; the insert's trigger skips it.
  const seen = rolledBack(`
    t uuid;
    begin
      ${ARMED}
      perform 1 from public.sweep_status where sweep = 'jobs' for update;
      insert into public.jobs (tenant_id, kind, due_at, payload) values (t, 'push_receipts', now(), '{}');
      seen := ${LEFT};`);
  // The lock is this transaction's own, so skip locked still finds the row: what is proved is that the trigger runs
  // inside a transaction that holds the row without waiting on itself, and asks once.
  assert.equal(seen.knocks, 1);
});

test(
  "one dedupe key: a second insert is refused while the first lives; a failed row lets the key be scheduled again",
  { skip },
  () => {
    const seen = rolledBack(`
    t uuid; first uuid; refused text := 'no';
    begin
      ${ARMED}
      lock table public.jobs in share row exclusive mode;
      update public.jobs set due_at = now() + interval '100 years' where state = 'scheduled' and due_at <= now();
      insert into public.jobs (tenant_id, kind, due_at, payload, dedupe_key)
           values (t, 'push_receipts', now(), '{}', 'once:' || t::text) returning id into first;
      begin
        insert into public.jobs (tenant_id, kind, due_at, payload, dedupe_key)
             values (t, 'push_receipts', now(), '{}', 'once:' || t::text);
      exception when unique_violation then refused := sqlstate;
      end;
      seen := jsonb_build_object('second', refused);
      -- Claimed and failed: the key is free again. A done row would free it the same way.
      perform public.claim_due_jobs(1, 90);
      update public.jobs set state = 'failed', last_error = 'made up' where id = first;
      insert into public.jobs (tenant_id, kind, due_at, payload, dedupe_key)
           values (t, 'push_receipts', now(), '{}', 'once:' || t::text);
      seen := seen || jsonb_build_object('live', (select count(*) from public.jobs where dedupe_key = 'once:' || t::text and state in ('scheduled', 'fired')),
                                         'all', (select count(*) from public.jobs where dedupe_key = 'once:' || t::text));
      -- Rows with no key are never each other's duplicate.
      insert into public.jobs (tenant_id, kind, due_at, payload) values (t, 'push_receipts', now(), '{}'), (t, 'push_receipts', now(), '{}');
      seen := seen || jsonb_build_object('unkeyed', (select count(*) from public.jobs where tenant_id = t and dedupe_key is null));`);
    assert.equal(seen.second, "23505", "the second insert of a live key is refused");
    assert.deepEqual([seen.live, seen.all], [1, 2], "the failed row and the new one share the key; one is live");
    assert.equal(seen.unkeyed, 2);
  },
);
