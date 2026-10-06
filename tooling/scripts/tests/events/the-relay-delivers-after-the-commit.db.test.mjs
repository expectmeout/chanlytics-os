/**
 * A fact's event reaches its subscribers after the commit (00334, decision 0032), on a real Postgres.
 *
 * events_outbox_copy writes one outbox row per event of a subscribed kind, in the event's own transaction; relay_events
 * drains the outbox under skip locked with no cursor, writes one delivery per unpaused subscriber and one event_deliver
 * job each, keyed so a second relay writes none, and takes the row off; an outbox row asks for the tick; a failed
 * delivery is re-driven; and the day's roll keeps relay lag. The subscription used here is the suite's own, on a kind
 * the product writes rarely, made before and removed after, so no other suite's events ride on it. Runs against the
 * database `supabase start` builds on this machine, never production; the wake's case goes through the CLI in a
 * transaction that never commits (SUPABASE_CLI names the binary when `supabase` is not on PATH).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes events and jobs"
      : false;

/** A kind of the catalogue nothing else writes in a test run, and a subscriber of this suite's own. */
const KIND = "google.unlinked";
const SUBSCRIBER = "audit";

let db;
const made = [];
const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

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

async function workspace(tag) {
  const t = ok(
    await db
      .from("tenants")
      .insert({
        name: `Relay ${tag}`,
        slug: `relay-${tag}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      })
      .select("id")
      .single(),
    "workspace",
  ).id;
  made.push(t);
  return t;
}

const event = async (t, kind, over = {}) =>
  ok(
    await db
      .from("events")
      .insert({ tenant_id: t, kind, category: "google", data: {}, ...over })
      .select("id, created_at")
      .single(),
    "event",
  );
const outbox = async (ids) => ok(await db.from("event_outbox").select("event_id").in("event_id", ids), "outbox");
const deliveries = async (ids) =>
  ok(
    await db
      .from("event_deliveries")
      .select("event_id, subscriber, state, job_id, attempts, last_error, kind")
      .in("event_id", ids),
    "deliveries",
  );
const jobsFor = async (t) =>
  ok(
    await db
      .from("jobs")
      .select("id, kind, state, lane, dedupe_key, payload")
      .eq("tenant_id", t)
      .eq("kind", "event_deliver"),
    "jobs",
  );
/** The relay, until this suite's events are off the outbox: other suites' events may be ahead in the queue. */
async function relay() {
  let total = 0;
  for (let i = 0; i < 20; i += 1) {
    const n = ok(await db.rpc("relay_events", { p_limit: 500 }), "relay");
    total += n;
    if (n < 500) break;
  }
  return total;
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  ok(
    await db.from("event_subscriptions").upsert({ kind: KIND, subscriber: SUBSCRIBER, lane: 1, paused: false }),
    "subscription",
  );
});

after(async () => {
  if (skip) return;
  await db.from("event_subscriptions").delete().eq("kind", KIND).eq("subscriber", SUBSCRIBER);
  for (const t of made) {
    await db.from("jobs").delete().eq("tenant_id", t);
    await db.from("events").delete().eq("tenant_id", t);
    await db.from("tenants").delete().eq("id", t);
  }
});

test(
  "an event of a subscribed kind is copied to the outbox in its own transaction; one of no subscribed kind is not",
  { skip },
  async () => {
    const t = await workspace("copy");
    const yes = await event(t, KIND);
    const no = await event(t, "google.linked");
    assert.deepEqual(
      (await outbox([yes.id, no.id])).map((r) => r.event_id),
      [yes.id],
      "the subscribed kind alone",
    );
  },
);

test(
  "the relay writes one delivery and one keyed job per subscriber in its lane, empties the outbox, and a second relay writes nothing more",
  { skip },
  async () => {
    const t = await workspace("relay");
    const e = await event(t, KIND);
    assert.ok((await relay()) >= 1, "relayed");
    assert.deepEqual(await outbox([e.id]), [], "off the outbox");
    const [d] = await deliveries([e.id]);
    assert.equal(d.subscriber, SUBSCRIBER);
    assert.equal(d.state, "scheduled");
    assert.equal(d.kind, KIND);
    assert.ok(d.job_id, "its job");
    const jobs = await jobsFor(t);
    assert.equal(jobs.length, 1);
    assert.deepEqual(
      [jobs[0].id, jobs[0].lane, jobs[0].dedupe_key, jobs[0].payload],
      [d.job_id, 1, `deliver:${e.id}:${SUBSCRIBER}`, { event_id: e.id, subscriber: SUBSCRIBER, kind: KIND, lane: "1" }],
      "the subscription's lane, the key, and what the handler needs",
    );
    await relay();
    assert.equal((await jobsFor(t)).length, 1, "a second relay of the same event writes no second job");
    assert.equal((await deliveries([e.id])).length, 1);
  },
);

test(
  "no cursor: an event that committed late, with an older clock, is relayed on the next pass",
  { skip },
  async () => {
    const t = await workspace("late");
    const first = await event(t, KIND);
    await relay();
    // Written after the relay ran, stamped before it: what an id cursor would skip.
    const late = await event(t, KIND, { created_at: new Date(Date.parse(first.created_at) - 60_000).toISOString() });
    await relay();
    assert.deepEqual(
      (await deliveries([first.id, late.id])).map((d) => d.event_id).sort(),
      [first.id, late.id].sort(),
      "both delivered",
    );
  },
);

test(
  "a paused subscription copies nothing new and keeps what was delivered; a failed delivery is re-driven with a fresh job",
  { skip },
  async () => {
    const t = await workspace("pause");
    const e = await event(t, KIND);
    await relay();
    ok(
      await db.from("event_subscriptions").update({ paused: true }).eq("kind", KIND).eq("subscriber", SUBSCRIBER),
      "pause",
    );
    try {
      const quiet = await event(t, KIND);
      assert.deepEqual(await outbox([quiet.id]), [], "paused: no outbox row");
      assert.equal((await deliveries([e.id])).length, 1, "the earlier delivery stays");
    } finally {
      ok(
        await db.from("event_subscriptions").update({ paused: false }).eq("kind", KIND).eq("subscriber", SUBSCRIBER),
        "resume",
      );
    }
    // The handler's verdict, as it would write it, then the re-drive.
    const [d] = await deliveries([e.id]);
    ok(await db.from("jobs").update({ state: "canceled" }).eq("id", d.job_id), "the old job is out of the way");
    ok(
      await db
        .from("event_deliveries")
        .update({ state: "failed", last_error: "made up", attempts: 1 })
        .eq("event_id", e.id),
      "failed",
    );
    assert.equal(ok(await db.rpc("event_deliveries_redrive", { p_subscriber: SUBSCRIBER })) >= 1, true, "re-driven");
    const [again] = await deliveries([e.id]);
    assert.equal(again.state, "scheduled");
    assert.equal(again.last_error, null);
    assert.notEqual(again.job_id, d.job_id, "a fresh job");
    assert.equal((await jobsFor(t)).filter((j) => j.state === "scheduled").length, 1);
  },
);

test("an outbox row asks for the tick, as a due job does", { skip }, () => {
  const seen = rolledBack(`
    t uuid;
    begin
      delete from vault.secrets where name in ('edge_base_url', 'cron_sweep_key');
      perform vault.create_secret('http://edge.invalid', 'edge_base_url');
      perform vault.create_secret('a-made-up-key', 'cron_sweep_key');
      update public.sweep_status set woken_at = null, request_id = null, note = null where sweep = 'jobs';
      insert into public.tenants (slug, name) values ('relay-wake-' || gen_random_uuid(), 'Wake') returning id into t;
      insert into public.events (tenant_id, kind, category, data) values (t, '${KIND}', 'google', '{}');
      seen := jsonb_build_object(
        'knocks', (select count(*) from net.http_request_queue q where q.url like '%/api/jobs/tick'),
        'polls', public.trigger_jobs_tick() is not null);`);
  assert.equal(seen.knocks, 1, "the event's outbox row knocked once");
  assert.equal(seen.polls, true, "and the poll knocks while the outbox is not empty");
});

test(
  "the day keeps relay lag: the delivery row's clock against the event's, at the 95th percentile",
  { skip },
  async () => {
    const t = await workspace("lag");
    const day = "2026-03-14";
    const e = await event(t, KIND, { created_at: `${day}T10:00:00Z` });
    await relay();
    // The relay ran now; the roll reads the delivery's own day, so the row is moved onto the event's day with a known lag.
    ok(
      await db
        .from("event_deliveries")
        .update({ created_at: `${day}T10:00:00.750Z` })
        .eq("event_id", e.id)
        .eq("subscriber", SUBSCRIBER),
      "stamped",
    );
    ok(await db.rpc("platform_metrics_roll", { p_day: day }), "roll");
    const row = ok(
      await db.from("platform_metrics").select("relay_lag_ms").eq("tenant_id", t).eq("day", day),
      "day",
    )[0];
    assert.equal(row.relay_lag_ms, 750);
  },
);
