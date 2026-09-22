/**
 * Every clock is registered (00107), proved on a real Postgres: the register
 * names all nineteen cron jobs, the nine that are judged on their runs are
 * judged that way, a name that arrives without its job is refused, the
 * upserts the sweeps themselves make still land, the alert stamp works on
 * the new rows, and the calls clock records what it asks, so the register's
 * word that it is judged on its answers is true (00149).
 *
 * Runs the way jobs-outbox.db.test.mjs does: against the database
 * `supabase start` builds on this machine, never production. The calls clock
 * is turned inside one transaction through the CLI, as privileges.db.test.mjs
 * reads the catalog; SUPABASE_CLI names the binary when `supabase` is not on
 * PATH.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes sweep rows"
      : false;

/**
 * A transaction on this machine's database that never commits. `body` runs
 * inside a DO block that ends by raising what it `seen`, so everything the
 * block did goes with it: a Vault secret, a request handed to pg_net, a row.
 * No other suite, and no clock, ever reads any of it.
 */
function rolledBack(body) {
  // What the block saw leaves as hex: however the CLI dresses a database error
  // -- a line of JSON here, plain text with more lines after it on CI's Linux --
  // nothing it adds can escape hex or run on into it.
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

const EVERY_CLOCK = {
  calendar: "calendar-people-sweep",
  calls: "call-reconcile",
  deadman: "deadman-sweep",
  google: "google-listings-sweep",
  health: "sweep-health",
  jobs: "jobs-tick",
  lines: "lines-sweep",
  partitions: "events-partition-precreate",
  pauses: "expire-stale-pauses",
  playbooks: "playbooks-sweep",
  purge_ask: "purge-ask",
  purge_cron_history: "purge-cron-history",
  purge_events: "purge-events",
  purge_notifications: "purge-notifications",
  purge_rate_hits: "purge-rate-hits",
  registration: "registration-sweep",
  snoozes: "wake-stale-snoozes",
  // The lead finder (00140): a five-minute clock that asks the edge only when
  // a run is live or a round has not ended, and its nightly purge.
  leads: "leads-sweep",
  purge_leads: "purge-leads",
};
const RUN_JUDGED = [
  "partitions",
  "pauses",
  "purge_ask",
  "purge_cron_history",
  "purge_events",
  "purge_leads",
  "purge_notifications",
  "purge_rate_hits",
  "snoozes",
];

let db;
before(() => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

test("the register names every cron job, and every one of them is scheduled", { skip }, async () => {
  const { data, error } = await db.from("sweep_status").select("sweep, jobname, judged_by, max_silence").order("sweep");
  assert.equal(error, null, error?.message);
  assert.deepEqual(
    Object.fromEntries(data.map((r) => [r.sweep, r.jobname])),
    EVERY_CLOCK,
    "one row per clock, each naming its job",
  );
  for (const r of data)
    assert.equal(r.judged_by, RUN_JUDGED.includes(r.sweep) ? "run" : "request", `${r.sweep} is judged the right way`);
  const { data: jobs, error: jerr } = await db.rpc("sweep_schedules");
  assert.equal(jerr, null, jerr?.message);
  const byName = new Map(jobs.map((j) => [j.jobname, j]));
  for (const [sweep, jobname] of Object.entries(EVERY_CLOCK)) {
    assert.ok(byName.has(jobname), `${sweep}: no cron job named ${jobname}`);
    assert.equal(byName.get(jobname).active, true, `${jobname} is disabled`);
  }
});

test(
  "sweep_health() judges every registered clock, and a clock that has not run yet is healthy until its silence is up",
  { skip },
  async () => {
    const { data, error } = await db.rpc("sweep_health");
    assert.equal(error, null, error?.message);
    assert.deepEqual(
      data.map((r) => r.sweep),
      Object.keys(EVERY_CLOCK).sort(),
      "the names, not a count",
    );
    for (const r of data) assert.equal(r.scheduled, true, `${r.sweep}: ${r.detail}`);
    // A fresh database has never run a nightly purge or the monthly precreate;
    // they were registered moments ago, well inside their silence, so they are
    // healthy. The row clocks have run every ten seconds since the database
    // came up, so they are healthy on their runs.
    for (const r of data.filter((x) => RUN_JUDGED.includes(x.sweep))) {
      assert.equal(r.healthy, true, `${r.sweep}: ${r.detail}`);
    }
    const clock = data.find((r) => r.sweep === "pauses");
    assert.ok(
      clock.last_request_at === null || Date.now() - Date.parse(clock.last_request_at) < 3 * 60_000,
      "a row clock's last word is its last successful run",
    );
  },
);

test(
  "a name that arrives without its job is refused; one that names a job nobody scheduled is reported",
  { skip },
  async () => {
    const bare = await db.from("sweep_status").insert({ sweep: "bogus" });
    assert.notEqual(bare.error, null, "an unregistered name was accepted");
    assert.match(bare.error.message, /not registered/);

    const named = await db
      .from("sweep_status")
      .insert({ sweep: "bogus", jobname: "nothing-of-the-kind", judged_by: "run", max_silence: "1 hour" });
    assert.equal(named.error, null, named.error?.message);
    try {
      const { data, error } = await db.rpc("sweep_health");
      assert.equal(error, null, error?.message);
      const row = data.find((r) => r.sweep === "bogus");
      assert.equal(row.healthy, false);
      assert.equal(row.scheduled, false);
      assert.match(row.detail, /no cron job named nothing-of-the-kind/);
    } finally {
      await db.from("sweep_status").delete().eq("sweep", "bogus");
    }
  },
);

test(
  "the upserts the sweeps make still land on a registered row, and the alert stamp works on a run-judged one",
  { skip },
  async () => {
    // request_sweep() carries no jobname; BEFORE INSERT must let it through to
    // ON CONFLICT because the row exists. Locally the Vault holds no edge
    // address, so it records a note rather than a request, which is a write
    // all the same.
    const before_ = await db.from("sweep_status").select("requested_at").eq("sweep", "deadman").single();
    assert.equal(before_.error, null, before_.error?.message);
    const { error } = await db.rpc("request_sweep", { p_sweep: "deadman", p_path: "/api/cron/deadman" });
    assert.equal(error, null, error?.message);
    const after_ = await db.from("sweep_status").select("requested_at, note, jobname").eq("sweep", "deadman").single();
    assert.equal(after_.error, null, after_.error?.message);
    assert.equal(after_.data.jobname, "deadman-sweep", "the registration survives the upsert");
    assert.ok(
      after_.data.requested_at !== before_.data.requested_at || after_.data.note !== null,
      "the sweep recorded its attempt",
    );

    const stamped = await db.rpc("sweep_mark_alerted", { p_alerted: ["purge_events"], p_healthy: [] });
    assert.equal(stamped.error, null, stamped.error?.message);
    assert.equal(stamped.data, 1, "one run-judged row stamped");
    const cleared = await db.rpc("sweep_mark_alerted", { p_alerted: [], p_healthy: ["purge_events"] });
    assert.equal(cleared.error, null, cleared.error?.message);
    assert.equal(cleared.data, 1, "and cleared");
  },
);

test(
  "the calls clock records the request it enqueues and waits past the sweep's own minute, so sweep_health() judges what the edge answers",
  { skip },
  () => {
    const seen = rolledBack(`
    -- This transaction's own edge. seed.sql leaves every other session a Vault with none.
    delete from vault.secrets where name = 'edge_base_url';
    perform vault.create_secret('http://edge.invalid', 'edge_base_url');
    -- A call still marked ongoing half an hour after it began: the provider is owed a question.
    with t as (insert into public.tenants (slug, name) values ('calls-clock-' || gen_random_uuid(), 'Calls clock') returning id)
    insert into public.calls (tenant_id, retell_call_id, status, started_at)
         select id, 'calls-clock-' || gen_random_uuid(), 'ongoing', now() - interval '31 minutes' from t;
    seen := jsonb_build_object('asked', public.trigger_call_reconcile());
    seen := seen || (select jsonb_build_object('request_id', request_id, 'requested_now', requested_at = now(), 'note', note)
                       from public.sweep_status where sweep = 'calls');
    seen := seen || coalesce((select jsonb_build_object('url', url, 'timeout_ms', timeout_milliseconds)
                                from net.http_request_queue where id = (seen->>'asked')::bigint), '{}');
    seen := seen || (select jsonb_build_object('in_flight', jsonb_build_object('healthy', healthy, 'detail', detail, 'at_the_ask', last_request_at = now()))
                       from public.sweep_health() where sweep = 'calls');
    if seen->>'asked' is not null then
      -- What pg_net writes when the edge answers: here, a deployment without RETELL_API_KEY.
      insert into net._http_response (id, status_code, content_type, content, timed_out, created)
           values ((seen->>'asked')::bigint, 503, 'application/json', '{"ok":false,"error":"no_provider_credentials"}', false, now());
    end if;
    seen := seen || (select jsonb_build_object('answered', jsonb_build_object('healthy', healthy, 'detail', detail))
                       from public.sweep_health() where sweep = 'calls');
  `);
    assert.equal(
      typeof seen.asked,
      "number",
      `work owed and an edge to ask: the clock enqueued a request (${JSON.stringify(seen)})`,
    );
    assert.deepEqual(
      [seen.request_id, seen.requested_now, seen.note],
      [seen.asked, true, null],
      "and recorded it where sweep_health() looks for the answer",
    );
    assert.deepEqual(
      [seen.url, seen.timeout_ms],
      ["http://edge.invalid/api/cron/calls", 65000],
      "pg_net waits past the sweep's own 60 s, so a tick that finishes slowly is never read as a timeout",
    );
    assert.deepEqual(
      seen.in_flight,
      { healthy: true, detail: null, at_the_ask: true },
      "a request still in flight is no fault",
    );
    assert.deepEqual(
      seen.answered,
      { healthy: false, detail: 'the edge answered 503: {"ok":false,"error":"no_provider_credentials"}' },
      "the edge's answer is judged, in its own words",
    );
  },
);
