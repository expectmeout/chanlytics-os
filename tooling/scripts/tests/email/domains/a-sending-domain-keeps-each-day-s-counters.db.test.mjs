/**
 * A sending domain keeps each day's counters (00296 sending_domain_days), on a real Postgres.
 *
 * A domain's sent, bounced and complaint counts, the days it has sent on and its state live on its own row, which the
 * ten-minute domains sweep rewrites on every check and a Resume clears. The nightly clock `sending-domain-days` (00:23
 * UTC) writes one row per verified or held domain under the day that has just ended, copying what the last check left.
 * This makes a workspace with domains in each state and holds the function to what was written:
 *   - sending_domain_days_keep(): a verified and a held domain are kept once, under yesterday (UTC), with the counters
 *     and the check time the sweep left; a domain still being set up (verifying, records) is not; a domain never
 *     counted keeps nulls, absent and never zero;
 *   - run again, the day's row is replaced and never doubled, and a Resume's cleared counters are kept as absent;
 *   - a domain taken off the workspace keeps the days it had (no foreign key), and the workspace's deletion takes them;
 *   - the door: the function is the service role's alone, and the anon key reads nothing of the table;
 *   - it takes no day: a call that names one finds no such function and files nothing, and the day it files under is
 *     the UTC yesterday whatever the zone of the session that runs it (the job's command, run in sessions set a day's
 *     clock away either side of UTC);
 *   - the clock: a cron job `sending-domain-days` at 00:23 UTC, registered in sweep_status as judged on its runs within
 *     26 hours, reported by sweep_health(), and its own command (cron.job) writes the rows.
 *
 * Runs the way tenancy.db.test.mjs does: its own workspaces and domains, made with the service key and removed after,
 * against the database `supabase start` builds on this machine, never production. One block goes through the CLI
 * (SUPABASE_CLI names the binary when `supabase` is not on PATH; SUPABASE_DB_URL aims it), in a transaction that never
 * commits. The cases are in order: the third removes `D.fresh`, which the clock case and the zone case count without.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { DAY_MS, MIN_MS } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
// The database the CLI is pointed at: the one the environment names when it is on this machine, else the stack
// `supabase start` runs here.
const DB_URL = process.env.SUPABASE_DB_URL;
const CLI_TARGET =
  DB_URL && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/.test(DB_URL)
    ? ["--db-url", `${DB_URL}${DB_URL.includes("?") ? "&" : "?"}sslmode=disable`]
    : ["--local"];
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces and sending domains"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the refusal this suite proves needs it"
        : false;

const stamp = Date.now().toString(36);
let db;
let T;
const made = [];
const D = {};
const ok = (r, what = "") => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
const ago = (ms) => new Date(Date.now() - ms).toISOString();
/** The UTC day before the one a timestamp is in: the day the function files under. */
const dayBefore = (at) => new Date(Date.parse(at) - DAY_MS).toISOString().slice(0, 10);

async function tenant(tag) {
  const id = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-days-${tag}-${stamp}`, name: `Harbor Days ${tag}` })
      .select("id")
      .single(),
    "workspace",
  ).id;
  made.push(id);
  return id;
}
const domain = async (tenantId, tag, over = {}) =>
  ok(
    await db
      .from("sending_domains")
      .insert({
        tenant_id: tenantId,
        host: `${tag}-${stamp}.example.com`,
        from_local: "sam",
        from_name: "Harbor",
        ...over,
      })
      .select("id, host")
      .single(),
    `domain ${tag}`,
  );
const days = async (tenantId) =>
  ok(await db.from("sending_domain_days").select("*").eq("tenant_id", tenantId).order("host"), "days");

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  T = await tenant("a");
  const sending = { verified_at: ago(30 * DAY_MS), clean_since: ago(10 * DAY_MS) };
  D.verified = await domain(T, "v", {
    state: "verified",
    ...sending,
    sent_recent: 120,
    bounced_recent: 2,
    complaints: 0,
    sent_days: 6,
    checked_at: ago(3 * MIN_MS),
  });
  D.held = await domain(T, "h", {
    state: "held",
    ...sending,
    held_why: "bounces",
    held_at: ago(90 * MIN_MS),
    sent_recent: 80,
    bounced_recent: 9,
    complaints: 1,
    sent_days: 6,
    checked_at: ago(5 * MIN_MS),
  });
  D.fresh = await domain(T, "f", { state: "verified", ...sending });
  D.verifying = await domain(T, "w", { state: "verifying" });
  D.records = await domain(T, "r", { state: "records" });
});

after(async () => {
  if (skip) return;
  for (const id of made) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
});

test(
  "each verified or held domain is kept once, under the day that has just ended, with the counters its last check left; a domain still being set up is not",
  { skip },
  async () => {
    const wrote = ok(await db.rpc("sending_domain_days_keep"), "keep");
    assert.ok(
      wrote >= 3,
      `it answers how many rows it wrote (${wrote}); other workspaces' domains on this stack are kept too`,
    );
    const rows = await days(T);
    assert.deepEqual(
      rows.map((r) => r.domain_id).sort(),
      [D.verified.id, D.held.id, D.fresh.id].sort(),
      "verified and held, not verifying or records",
    );
    const yesterday = dayBefore(rows[0].kept_at);
    assert.ok(
      rows.every((r) => r.day === yesterday),
      "every row is under the day that ended, UTC",
    );
    const of = (d) => rows.find((r) => r.domain_id === d.id);
    const counters = (r) => [r.host, r.state, r.held_why, r.sent, r.bounced, r.complaints, r.sent_days];
    assert.deepEqual(counters(of(D.verified)), [D.verified.host, "verified", null, 120, 2, 0, 6]);
    assert.deepEqual(counters(of(D.held)), [D.held.host, "held", "bounces", 80, 9, 1, 6]);
    assert.deepEqual(
      counters(of(D.fresh)),
      [D.fresh.host, "verified", null, null, null, null, null],
      "a domain never counted keeps nothing: absent, never zero",
    );
    assert.ok(Date.parse(of(D.verified).checked_at) > Date.now() - 10 * MIN_MS, "and each row says how stale it is");
  },
);

test(
  "run again, a day's row is replaced and never doubled; a Resume's cleared counters are kept as absent",
  { skip },
  async () => {
    const first = (await days(T)).find((r) => r.domain_id === D.verified.id);
    ok(
      await db.from("sending_domains").update({ sent_recent: 150, bounced_recent: 3 }).eq("id", D.verified.id),
      "counters move",
    );
    ok(await db.rpc("sending_domain_days_keep"), "keep again");
    let rows = await days(T);
    assert.equal(rows.length, 3, "one row per domain per day");
    const later = rows.find((r) => r.domain_id === D.verified.id);
    assert.deepEqual([later.sent, later.bounced], [150, 3], "the later run's counters stand");
    assert.ok(Date.parse(later.kept_at) > Date.parse(first.kept_at));

    ok(
      await db
        .from("sending_domains")
        .update({ sent_recent: null, bounced_recent: null, complaints: null, sent_days: null })
        .eq("id", D.held.id),
      "a Resume clears them",
    );
    ok(await db.rpc("sending_domain_days_keep"), "and the next night");
    rows = await days(T);
    const held = rows.find((r) => r.domain_id === D.held.id);
    assert.deepEqual([held.sent, held.bounced, held.complaints, held.sent_days], [null, null, null, null]);
  },
);

test("a domain taken off keeps the days it had; a workspace's deletion takes them", { skip }, async () => {
  ok(await db.from("sending_domains").delete().eq("id", D.fresh.id), "remove a domain");
  assert.equal((await days(T)).filter((r) => r.domain_id === D.fresh.id).length, 1, "its day stays");
  const T2 = await tenant("b");
  await domain(T2, "x", { state: "verified", verified_at: ago(5 * DAY_MS), clean_since: ago(DAY_MS) });
  ok(await db.rpc("sending_domain_days_keep"), "keep");
  assert.equal((await days(T2)).length, 1);
  ok(await db.from("tenants").delete().eq("id", T2), "delete the workspace");
  assert.equal((await days(T2)).length, 0, "its days went with it");
});

test(
  "the function is the service role's alone: the anon key can neither run it nor read the table",
  { skip },
  async () => {
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    const run = await anon.rpc("sending_domain_days_keep");
    assert.ok(run.error, "refused");
    const read = await anon.from("sending_domain_days").select("day").limit(1);
    assert.ok(read.error || read.data.length === 0, "and sees nothing");
  },
);

/**
 * A transaction on this machine's database that never commits (as sweep-registry.db.test.mjs runs one): `body` runs in
 * a DO block that ends by raising what it `seen`, so everything it did, the trigger it made included, goes with it.
 */
function rolledBack(body) {
  const sql = `do $$ declare seen jsonb := '{}'; begin ${body} raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex'); end $$`;
  const r = spawnSync(CLI, ["db", "query", ...CLI_TARGET, sql], {
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
  if (/not_this_database/.test(said))
    throw new Error(
      "the CLI reached a database that does not hold this suite's rows: point SUPABASE_DB_URL at the stack",
    );
  if (!seen) throw new Error(`the block did not get to say what it saw: ${said.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

test(
  "the clock: a job at 00:23 UTC, registered as judged on its runs within 26 hours, reported by sweep_health(), and its own command writes the rows",
  { skip },
  async () => {
    const jobs = ok(await db.rpc("sweep_schedules"), "schedules");
    const job = jobs.find((j) => j.jobname === "sending-domain-days");
    assert.ok(job, "no cron job named sending-domain-days is scheduled");
    assert.deepEqual([job.schedule, job.active], ["23 0 * * *", true]);
    const row = ok(
      await db
        .from("sweep_status")
        .select("sweep, jobname, judged_by, max_silence")
        .eq("sweep", "sending_domain_days")
        .single(),
      "register",
    );
    assert.deepEqual(row, {
      sweep: "sending_domain_days",
      jobname: "sending-domain-days",
      judged_by: "run",
      max_silence: "26:00:00",
    });
    const health = ok(await db.rpc("sweep_health"), "health").find((r) => r.sweep === "sending_domain_days");
    assert.ok(health, "sweep_health() does not report the clock");
    assert.deepEqual([health.scheduled, health.healthy], [true, true], health.detail ?? "");

    const seen = rolledBack(`
    if not exists (select 1 from public.tenants where id = '${T}') then raise exception 'not_this_database'; end if;
    delete from public.sending_domain_days where tenant_id = '${T}';
    -- The command the job holds, run as the job runs it.
    execute (select j.command from cron.job j where j.jobname = 'sending-domain-days');
    seen := jsonb_build_object('rows', (select count(*) from public.sending_domain_days where tenant_id = '${T}'));
  `);
    assert.equal(seen.rows, 2, "the verified and the held domain that are still on the workspace");
  },
);

test(
  "it takes no day: a call that names one finds no such function, and nothing is filed under a day the caller chose",
  { skip },
  async () => {
    const chosen = "2026-01-01";
    // 00277's platform_metrics_roll takes `p_day`; a copy of it here, or a backfill door, would answer.
    for (const name of ["p_day", "day"]) {
      const named = await db.rpc("sending_domain_days_keep", { [name]: chosen });
      assert.equal(
        named.error?.code,
        "PGRST202",
        `a call naming ${name} should find no function: ${named.error?.message}`,
      );
      assert.equal(named.data, null);
    }
    const filed = ok(
      await db.from("sending_domain_days").select("domain_id").eq("tenant_id", T).eq("day", chosen),
      "days",
    );
    assert.deepEqual(filed, [], "so nothing is filed under it");
  },
);

/**
 * Zones a day's clock away either side of UTC. Auckland (UTC+13 in daylight time, +12 otherwise) and Pago Pago (UTC-11)
 * are on another date than UTC for most of a day between them; Kiritimati (UTC+14, no daylight time) closes the hour
 * a winter Auckland leaves, so at every hour of every month one of the three is on a different date.
 */
const ZONES = ["Pacific/Auckland", "Pacific/Pago_Pago", "Pacific/Kiritimati"];

test(
  "the day is the UTC one: the job's command, run in sessions set to a zone either side of UTC, files under the UTC yesterday",
  { skip },
  async () => {
    const underZone = (zone) => `
    delete from public.sending_domain_days where tenant_id = '${T}';
    set local timezone = '${zone}';
    execute (select j.command from cron.job j where j.jobname = 'sending-domain-days');
    seen := seen || jsonb_build_object('${zone}', (
      select jsonb_build_object(
               'zone', current_setting('timezone'),
               'local_today', current_date::text,
               'days', coalesce(jsonb_agg(distinct d.day::text), '[]'::jsonb),
               'rows', count(*))
        from public.sending_domain_days d where d.tenant_id = '${T}'));`;
    const seen = rolledBack(`
    if not exists (select 1 from public.tenants where id = '${T}') then raise exception 'not_this_database'; end if;
    ${ZONES.map(underZone).join("")}
    -- Read in the same transaction as the function's own now(), so midnight cannot come between them.
    seen := seen || jsonb_build_object(
      'utc_today', ((now() at time zone 'utc')::date)::text,
      'utc_yesterday', ((now() at time zone 'utc')::date - 1)::text);
  `);
    for (const zone of ZONES) {
      assert.equal(seen[zone].zone, zone, "the session ran in the zone it was set to");
      assert.deepEqual(seen[zone].days, [seen.utc_yesterday], `${zone}: one day, the UTC yesterday`);
      assert.ok(seen[zone].rows >= 2, `${zone}: the verified and the held domain were kept`);
    }
    assert.ok(
      ZONES.some((zone) => seen[zone].local_today !== seen.utc_today),
      "at least one zone is on another date than UTC, or this case proves nothing",
    );
  },
);
