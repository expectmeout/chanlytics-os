/**
 * The ledger's rules held by the database itself (00526, decision 0089), on this machine's Postgres: the state machine
 * (jobs_guard) pair by pair; the once-only key and the lane each kind's job_kinds row writes, whoever inserts; a kind
 * held while kept; a waiting retry back to scheduled and claimed again counting on; a run whose lease was taken back
 * unable to finish the row; the canary scheduled once and judged; the backlog counting a lease that ran out; and claims
 * raced over one ledger taking every row once.
 *
 * Each case but the race runs in a transaction that never commits and has the ledger to itself (as jobs-lanes.db does);
 * the race commits rows of a workspace of its own, due at once, under the ledger's lock (_file-lock.mjs), and removes
 * them after. Read through the CLI; SUPABASE_CLI names the binary when `supabase` is not on PATH.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { takeLock } from "../_file-lock.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

/** The ledger to this transaction alone, and a workspace of its own, a. */
const ALONE = `
  lock table public.jobs in share row exclusive mode;
  update public.jobs set due_at = now() + interval '100 years' where state = 'scheduled' and due_at <= now();
  update public.jobs set lease_until = now() + interval '100 years' where state = 'fired' and lease_until < now();
  insert into public.tenants (slug, name) values ('rules-a-' || gen_random_uuid(), 'Rules A') returning id into a;`;

const STATES = ["scheduled", "fired", "done", "failed", "canceled"];

test("the state machine, pair by pair: what jobs_guard lets a row become, and what it refuses", { skip }, () => {
  const { moves } = rolledBack(`
    a uuid; j uuid; f text; t text; ok boolean; moves jsonb := '{}';
    begin
      ${ALONE}
      foreach f in array array[${STATES.map((x) => `'${x}'`).join(", ")}] loop
        foreach t in array array[${STATES.map((x) => `'${x}'`).join(", ")}] loop
          continue when f = t;
          insert into public.jobs (tenant_id, kind, due_at, state, attempts, lease_until)
            values (a, 'push_receipts', now() + interval '1 day', f, 1, case when f = 'fired' then now() end)
            returning id into j;
          begin
            update public.jobs set state = t where id = j;
            ok := true;
          exception when others then
            ok := false;
          end;
          moves := moves || jsonb_build_object(f || '>' || t, ok);
        end loop;
      end loop;
      seen := jsonb_build_object('moves', moves);`);
  const allowed = Object.entries(moves)
    .filter(([, ok]) => ok)
    .map(([m]) => m)
    .sort();
  assert.deepEqual(allowed, ["fired>done", "fired>failed", "fired>scheduled", "scheduled>canceled", "scheduled>fired"]);
});

test("a row put back to wait keeps its claims, and a claim of it counts on from there", { skip }, () => {
  const out = rolledBack(`
    a uuid; j uuid; more boolean; c record;
    begin
      ${ALONE}
      insert into public.jobs (tenant_id, kind, due_at) values (a, 'push_receipts', now() - interval '1 second')
        returning id into j;
      select * into c from public.claim_due_jobs(1, 90);
      update public.jobs set state = 'scheduled', due_at = now() - interval '1 second', lease_until = null
       where id = j and state = 'fired' and attempts = 1;
      begin
        update public.jobs set state = 'fired' where id = j;
        update public.jobs set state = 'scheduled', attempts = attempts + 1 where id = j;
        more := true;
      exception when others then
        more := false;
      end;
      update public.jobs set state = 'scheduled', attempts = 1 where id = j and state = 'fired';
      select * into c from public.claim_due_jobs(1, 90);
      seen := jsonb_build_object('claimed', c.id = j, 'attempts', c.attempts, 'more', more);`);
  assert.deepEqual(out, { claimed: true, attempts: 2, more: false });
});

test("a run whose lease was taken back cannot finish the row, and the claim that took it can", { skip }, () => {
  const out = rolledBack(`
    a uuid; j uuid; c record; zombie int; live int;
    begin
      ${ALONE}
      insert into public.jobs (tenant_id, kind, due_at) values (a, 'push_receipts', now() - interval '1 second')
        returning id into j;
      perform public.claim_due_jobs(1, 90);
      update public.jobs set lease_until = now() - interval '1 second' where id = j;
      select * into c from public.claim_due_jobs(1, 90);
      update public.jobs set state = 'done' where id = j and state = 'fired' and attempts = 1;
      get diagnostics zombie = row_count;
      update public.jobs set state = 'done' where id = j and state = 'fired' and attempts = 2;
      get diagnostics live = row_count;
      seen := jsonb_build_object('retaken', c.attempts, 'zombie', zombie, 'live', live);`);
  assert.deepEqual(out, { retaken: 2, zombie: 0, live: 1 });
});

test(
  "every writer's row takes its kind's key and lane from job_kinds, and a requeued copy is held once per job it copies",
  { skip },
  () => {
    const { keys } = rolledBack(`
    a uuid; keys jsonb := '{}'; k text;
    begin
      ${ALONE}
      insert into public.jobs (tenant_id, kind, due_at, payload) values
        (a, 'email_ingest', now() + interval '1 day', '{"mailbox_id": "m1", "received_id": "r1"}'),
        (a, 'reply_read', now() + interval '1 day', '{"message_id": "msg1"}'),
        (a, 'booking_read', now() + interval '1 day', '{"received_id": "r1"}'),
        (a, 'history_import', now() + interval '1 day', '{"source": "mailbox", "seq": "run:1", "connection_id": "c1"}'),
        (a, 'website_read', now() + interval '1 day', '{}'),
        (a, 'canary', now() + interval '1 day', '{}'),
        (a, 'push_send', now() + interval '1 day', '{"notification_id": "n1"}'),
        (a, 'lead_check', now() + interval '1 day', '{"requeue_of": "00000000-0000-4000-8000-000000000001"}'),
        (a, 'email_ingest', now() + interval '1 day', '{"mailbox_id": "m1"}');
      select jsonb_object_agg(j.kind || ':' || j.created_at::text || ':' || j.id::text,
               jsonb_build_object('key', j.dedupe_key, 'lane', j.lane, 'kept', j.dedupe_kept))
        into keys from public.jobs j where j.tenant_id = a;
      seen := jsonb_build_object('keys', keys);`);
    const got = Object.entries(keys)
      .map(([k, v]) => [k.split(":")[0], v.key?.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "<id>") ?? null, v.lane, v.kept])
      .sort((x, y) => `${x[0]}${x[1]}`.localeCompare(`${y[0]}${y[1]}`));
    assert.deepEqual(got, [
      ["booking_read", "booking_read:<id>:r1", 1, false],
      ["canary", "canary:<id>", 0, false],
      ["email_ingest", "email_ingest:m1:r1", 0, true],
      ["email_ingest", null, 0, false],
      ["history_import", "history_import:<id>:mailbox:run:1:c1", 2, false],
      ["lead_check", "requeue:<id>", 2, false],
      ["push_send", null, 0, false],
      ["reply_read", "reply_read:msg1:read", 1, true],
      ["website_read", "website_read:<id>", 1, false],
    ]);
  },
);

test(
  "a kind held while kept refuses a second row of its subject after the first was done; a failed one lets it go",
  { skip },
  () => {
    const out = rolledBack(`
    a uuid; j uuid; after_done text; after_failed text;
    begin
      ${ALONE}
      insert into public.jobs (tenant_id, kind, due_at, payload)
        values (a, 'lead_collect', now() + interval '1 day', '{"run_id": "run1", "seq": "final"}') returning id into j;
      update public.jobs set state = 'fired', attempts = 1, lease_until = now() where id = j;
      update public.jobs set state = 'done' where id = j;
      begin
        insert into public.jobs (tenant_id, kind, due_at, payload)
          values (a, 'lead_collect', now() + interval '1 day', '{"run_id": "run1", "seq": "final"}');
        after_done := 'written';
      exception when unique_violation then
        after_done := 'refused';
      end;
      insert into public.jobs (tenant_id, kind, due_at, payload)
        values (a, 'lead_collect', now() + interval '1 day', '{"run_id": "run2", "seq": "final"}') returning id into j;
      update public.jobs set state = 'fired', attempts = 1, lease_until = now() where id = j;
      update public.jobs set state = 'failed' where id = j;
      begin
        insert into public.jobs (tenant_id, kind, due_at, payload)
          values (a, 'lead_collect', now() + interval '1 day', '{"run_id": "run2", "seq": "final"}');
        after_failed := 'written';
      exception when unique_violation then
        after_failed := 'refused';
      end;
      seen := jsonb_build_object('after_done', after_done, 'after_failed', after_failed);`);
    assert.deepEqual(
      out,
      { after_done: "refused", after_failed: "written" },
      "Apify's redelivery of a done page is held",
    );
  },
);

test(
  "the canary is one at a time, and the backlog counts a lease that ran out as it counts a due row",
  { skip },
  () => {
    const out = rolledBack(`
    a uuid; canaries int; before_n int; after_n int; judged record;
    begin
      ${ALONE}
      -- Ours alone for the block (rolled back): the canary goes to our first workspace, and a stack's suites leave others.
      update public.tenants set ours = (id = a) where ours or id = a;
      perform public.schedule_canary();
      perform public.schedule_canary();
      select count(*) into canaries from public.jobs
       where tenant_id = a and kind = 'canary' and state in ('scheduled', 'fired');
      select public.jobs_backlog() into before_n;
      insert into public.jobs (tenant_id, kind, due_at, state, attempts, fired_at, lease_until)
        values (a, 'push_receipts', now() - interval '1 hour', 'fired', 1, now() - interval '1 hour',
                now() - interval '10 minutes');
      select public.jobs_backlog() into after_n;
      select * into judged from public.sweep_health() h where h.sweep = 'jobs_canary';
      seen := jsonb_build_object('canaries', canaries, 'more', after_n - before_n, 'judged', judged.sweep is not null);`);
    assert.equal(out.canaries, 1, "its key is the kind and the workspace: a second schedule finds the first");
    assert.equal(out.more, 1, "a fired row past its lease is work the claim could take and has not");
    assert.equal(out.judged, true, "sweep_health judges it by its newest done row (judged_by 'job')");
  },
);

test("claims raced over one ledger take every row once, each a first claim", { skip }, async () => {
  const db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data: ws, error } = await db
    .from("tenants")
    .insert({ slug: `race-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: "race" })
    .select("id")
    .single();
  assert.equal(error, null, error?.message);
  try {
    const N = 120;
    const made = await db
      .from("jobs")
      .insert(
        Array.from({ length: N }, (_, i) => ({
          tenant_id: ws.id,
          kind: "push_receipts",
          due_at: new Date(Date.now() - 1000).toISOString(),
          payload: { n: i },
        })),
      )
      .select("id");
    assert.equal(made.error, null, made.error?.message);
    const mine = new Set(made.data.map((r) => r.id));
    const taken = [];
    // Eight runners at once, each claiming one at a time as the tick does, until nothing of this workspace is due.
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        for (;;) {
          const { data, error: e } = await db.rpc("claim_due_jobs", { p_limit: 1, p_lease_seconds: 90 });
          assert.equal(e, null, e?.message);
          const row = data?.[0];
          if (!row) return;
          // A row of this machine's ledger that is not the race's (another suite's leftover, the local clock's canary):
          // put out of reach, so the race goes on over its own rows alone.
          if (!mine.has(row.id)) {
            await db
              .from("jobs")
              .update({ lease_until: new Date(Date.now() + 3_600_000).toISOString() })
              .eq("id", row.id);
            continue;
          }
          taken.push([row.id, row.attempts]);
        }
      }),
    );
    assert.equal(taken.length, N, "every row claimed");
    assert.equal(new Set(taken.map(([id]) => id)).size, N, "and none twice");
    assert.ok(
      taken.every(([, attempts]) => attempts === 1),
      "each a first claim: claimed means started",
    );
  } finally {
    await db.from("jobs").delete().eq("tenant_id", ws.id);
    await db.from("tenants").delete().eq("id", ws.id);
  }
});
