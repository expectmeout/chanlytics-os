/**
 * The Campaigns lens's reads at the scale of a workspace that talks (Reports, C4): 3,600 runs of 25 people, 90,000
 * recipients, 97,000 messages (_scale-world.mjs says what else is in it and why), asked as a signed-in viewer of that
 * workspace, whose statement the database stops at 8 seconds (00283), as Reports asks them. The gate catches a probe with
 * no index, a join gone quadratic or a statement that stalls (a read that answers a member inside half of 8 seconds has
 * margin). It does not tell a read of the window from a read of the whole workspace at this size: the ledger's `rec`,
 * the series' `sent` and stuck's `reached` read all 90,000 recipients and cost about 40 ms of scan (measured 11 Oct 2026).
 * The counts do the rest: each is held to the same rows counted straight off the tables, so a read that strays outside
 * its window is wrong here, whatever its time.
 *
 *   campaign_ledger(t, 30), campaign_ledger(t, 90)   00405, the lens's own read: people, held, stopped, failed, by
 *                                                    message, first reply, approval
 *   campaign_series(t, 30)                           00403's consent part, with the days' counts
 *   campaign_stuck(t)                                00406, what is stuck as it stands
 *   campaign_answers(t, now - 30 days, now)          00403, each person's answer to each run
 *   reach_out_report(t, 30), reach_out_chain_totals  00404, the businesses a reach-out wrote to
 *
 * Each is asked three times and gated on the median of the three, under 4,000 ms; the three times, the minimum and the
 * median are printed (`t.diagnostic`). Each answer's counts are held to the same rows counted straight off the tables.
 * The world's runs end today, so the newest 30 days hold 180 of its 3,600 runs.
 *
 * Measured on 11 Oct 2026 on the throwaway stack (PostgreSQL 17, 128 MB of shared buffers) with other builds loading the
 * machine, as a viewer through PostgREST: nine asks of each (three runs of three), the minimum and the median in ms.
 * campaign_ledger over 30 days 129 and 154, over 90 days 243 and 339; campaign_series 126 and 159; campaign_stuck 48
 * and 57; campaign_answers 43 and 47; reach_out_report 233 and 464; reach_out_chain_totals 121 and 320. The slowest
 * ask of eighteen, in an earlier run on a busier machine, was 1,055 ms (the ledger over 90 days).
 *
 * Local stack only: it makes a workspace of over 200,000 rows and a member, and removes them in SQL (past the service
 * role's 30 seconds). SUPABASE_CLI names the binary when `supabase` is not on PATH, SUPABASE_DB_URL the database on
 * this machine.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { DAY_MS, REPLY_WINDOW_HOURS } from "@chanlytics/contracts";
import { EARLIER_WORDS, LATE_FAILURE, SCALE, atScale } from "./_scale-world.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
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
      ? "refusing a database that is not on this machine: this suite makes a workspace of over 200,000 rows"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the member this suite signs in as needs it"
        : false;

/** Half a member's 8 seconds, for margin. */
const BUDGET_MS = 4000;
/** Each read is asked this many times and judged by the median. */
const ASKS = 3;

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const db = skip ? null : createClient(URL_, KEY, { auth: { persistSession: false } });
const users = [];
const worlds = [];
const ok = (res, what = "the read") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};

/** One SQL statement on the local stack, for what PostgREST does not serve and what outlasts the service role's 30 s. */
function query(sql) {
  const r = spawnSync(CLI, ["db", "query", ...CLI_TARGET, "--output-format", "json", sql], {
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
/** The one row a SQL statement answers, its counts as numbers. */
const counted = (sql) => Object.fromEntries(Object.entries(query(sql).at(0) ?? {}).map(([k, v]) => [k, Number(v)]));

/** The busy workspace, written once: every case reads it as written. */
let busy;
const world = () => (busy ??= atScale(query, (id) => worlds.push(id)));

/** A viewer of the workspace, signed in: the functions run on the caller's rights, so who calls decides what they read. */
let viewerOf;
async function viewer() {
  if (viewerOf) return viewerOf;
  const tenant = world();
  const email = `scale-viewer-${RUN}@example.com`;
  const password = `pw-${RUN}-viewer-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(
    await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role: "viewer" }),
    "the member",
  );
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await c.auth.signInWithPassword({ email, password }), "the sign-in");
  viewerOf = c;
  return c;
}

after(async () => {
  if (skip) return;
  // A workspace of 90,000 recipients goes as it came, in SQL. Its events keep no foreign key to it (the table is
  // partitioned); the rest, the outbox and the deliveries among it, goes with the tenant. Each removal runs whatever the
  // one before did, so one failure never leaves the rest behind; the file still fails for it.
  const left = [];
  const attempt = (what, remove) => {
    try {
      remove();
    } catch (e) {
      left.push(new Error(`${what}: ${e.message}`));
    }
  };
  for (const id of worlds) {
    attempt(`events of ${id}`, () => query(`delete from public.events where tenant_id = '${id}'`));
    attempt(`workspace ${id}`, () => query(`delete from public.tenants where id = '${id}'`));
  }
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
  if (left.length) throw new AggregateError(left, "the workspace at scale was not all removed");
});

/**
 * A read as the viewer asks it, `ASKS` times, the first answer returned. The times are printed, and the median is the
 * gate: one slow answer on a loaded machine is noise, a plan that reads the workspace is every one of them.
 */
async function asked(t, label, call) {
  const times = [];
  let first;
  for (let i = 0; i < ASKS; i += 1) {
    const started = performance.now();
    const got = ok(await call(), label);
    times.push(Math.round(performance.now() - started));
    if (i === 0) first = got;
  }
  const sorted = [...times].sort((a, b) => a - b);
  const median = sorted.at(Math.floor(sorted.length / 2));
  t.diagnostic(`${label}: ${times.join(", ")} ms (min ${sorted.at(0)}, median ${median})`);
  assert.ok(median < BUDGET_MS, `${label}: half a member's 8 seconds, for margin: ${median} ms`);
  return first;
}

/**
 * The workspace's instants, as the database spells them: this UTC day's midnight and the window `days` ends. Each
 * statement reads the day for itself, as the world did when it was built and as the functions do. A run that crosses
 * 00:00 UTC between the build and a case reads two days: the counts then fall a day short ("174 instead of 180") and a
 * second run passes. Accepted, as odds of about one in a thousand a run, rather than a wait or a pinned day of our own.
 */
const TODAY = "date_trunc('day', now())";
const from = (days) => `${TODAY} - interval '${days - 1} days'`;
const until = `${TODAY} + interval '1 day'`;

/** The sends of the `days` days ending today and of the same number before them, counted off the rows. */
function sendsDirectly(tenant, days) {
  return counted(`with sent as (
      select r.broadcast_id, r.contact_id, r.sent_at,
             exists (select 1 from public.messages i
                      where i.conversation_id = m.conversation_id and i.direction = 'inbound' and i.sender = 'customer'
                        and i.created_at > r.sent_at
                        and i.created_at <= r.sent_at + interval '${REPLY_WINDOW_HOURS} hours') as replied
        from public.broadcast_recipients r
        join public.messages m on m.id = r.message_id
       where r.tenant_id = '${tenant}' and r.state = 'sent'
         and r.sent_at >= ${from(2 * days)} and r.sent_at < ${until})
    select count(*) filter (where sent_at >= ${from(days)}) as sent,
           count(distinct contact_id) filter (where sent_at >= ${from(days)}) as sent_to,
           count(distinct broadcast_id) filter (where sent_at >= ${from(days)}) as runs,
           count(*) filter (where sent_at >= ${from(days)} and replied) as replied,
           count(distinct contact_id) filter (where sent_at >= ${from(days)} and replied) as wrote_back,
           count(*) filter (where sent_at < ${from(days)}) as sent_before,
           count(distinct contact_id) filter (where sent_at < ${from(days)}) as sent_to_before,
           count(distinct broadcast_id) filter (where sent_at < ${from(days)}) as runs_before,
           count(distinct contact_id) filter (where sent_at < ${from(days)} and replied) as wrote_back_before
      from sent`);
}

/**
 * The sends made in the `days` days ending today that stand failed, counted off the rows: the recipients, in any state,
 * whose message was made in the window and is marked failed as it stands (the reach-out's bounced emails are no recipients).
 */
function failuresDirectly(tenant, days) {
  return counted(`select count(*) as failed
      from public.broadcast_recipients r
      join public.messages m on m.id = r.message_id
     where r.tenant_id = '${tenant}' and m.status = 'failed'
       and m.created_at >= ${from(days)} and m.created_at < ${until}`);
}

/** The people a run held back and the approvals of the `days` days ending today, counted off the rows. */
function holdsDirectly(tenant, days) {
  return counted(`select
      (select count(*) from public.broadcast_recipients r join public.broadcasts b on b.id = r.broadcast_id
        where r.tenant_id = '${tenant}' and r.state in ('skipped', 'failed')
          and coalesce(b.started_at, b.scheduled_for) >= ${from(days)} and coalesce(b.started_at, b.scheduled_for) < ${until}) as held,
      (select count(*) from public.decisions d
        where d.tenant_id = '${tenant}' and d.subject_type = 'broadcast' and d.verb = 'send_broadcast'
          and d.payload ->> 'approved' = 'true' and d.created_at >= ${from(days)} and d.created_at < ${until}) as approved`);
}

test(
  "the viewer's statement stops at 8 seconds, and the workspace is the brief's: 3,600 runs of 25 people, 90,000 recipients, the newest 30 days holding 180 runs",
  { skip },
  async () => {
    const tenant = world();
    const [{ setconfig }] = query(
      `select s.setconfig from pg_db_role_setting s join pg_roles r on r.oid = s.setrole
        where r.rolname = 'authenticated' and s.setdatabase = 0`,
    );
    assert.ok(
      setconfig.includes("statement_timeout=8s"),
      "a member's statement stops at 8 seconds, as production's do",
    );
    const rows = counted(`select
        (select count(*) from public.broadcasts where tenant_id = '${tenant}'
            and audience ->> 'kind' = 'playbook') as runs,
        (select count(*) from public.broadcast_recipients where tenant_id = '${tenant}') as recipients,
        (select count(*) from public.broadcasts where tenant_id = '${tenant}'
            and audience ->> 'kind' = 'playbook' and scheduled_for >= ${from(30)}) as newest,
        (select count(*) from public.messages where tenant_id = '${tenant}' and direction = 'inbound'
            and body = 'Is Saturday free?') as before_the_first`);
    assert.deepEqual(rows, {
      runs: SCALE.moments * SCALE.runs,
      recipients: SCALE.moments * SCALE.runs * SCALE.people,
      newest: SCALE.moments * 30,
      before_the_first: EARLIER_WORDS,
    });
  },
);

test(
  "campaign_ledger over 30 days answers a member inside half of 8 seconds, every count the rows'",
  { skip },
  async (t) => {
    const tenant = world();
    const own = await viewer();
    const got = await asked(t, "campaign_ledger over 30 days, as a viewer", () =>
      own.rpc("campaign_ledger", { p_tenant_id: tenant, p_days: 30 }),
    );
    const sends = sendsDirectly(tenant, 30);
    const { held, approved } = holdsDirectly(tenant, 30);
    assert.equal(
      sends.sent,
      SCALE.moments * 30 * (SCALE.people - 1),
      "the window's sends: 24 of 25 on each of its 180 runs",
    );
    assert.equal(got.people.now.sent_to, sends.sent_to);
    assert.equal(got.people.now.wrote_back, sends.wrote_back);
    assert.deepEqual([got.runs.now.moment, got.runs.now.broadcast], [sends.runs, 0]);
    assert.equal(sends.runs, SCALE.moments * 30);
    assert.equal(
      got.by_message.reduce((n, m) => n + m.sent, 0),
      sends.sent,
      "the sum of by_message.sent is the window's sends",
    );
    assert.equal(got.first_reply.n, sends.replied, "every send that was answered, once");
    assert.equal(got.held.total, held);
    assert.equal(got.approval.n, approved);
    // The 24th send of each run failed late (its recipient stays `sent`): told by the provider's code, never its words.
    const { failed } = failuresDirectly(tenant, 30);
    assert.equal(failed, SCALE.moments * 30, "one late failure on each of the window's 180 runs");
    assert.equal(got.failed_sends.total, failed);
    assert.deepEqual(got.failed_sends.by_code, [
      { channel: "whatsapp", code: LATE_FAILURE.code, kind: null, n: failed },
    ]);
    for (const words of [LATE_FAILURE.body, "555 0142", "undeliverable"]) {
      assert.ok(!JSON.stringify(got).includes(words), `${words} does not come out`);
    }
    // The period before: the 30 days before them.
    assert.equal(got.people.before.sent_to, sends.sent_to_before);
    assert.equal(got.people.before.wrote_back, sends.wrote_back_before);
    assert.deepEqual([got.runs.before.moment, got.runs.before.broadcast], [sends.runs_before, 0]);
  },
);

test(
  "campaign_ledger over 90 days answers a member inside half of 8 seconds, every count the rows'",
  { skip },
  async (t) => {
    const tenant = world();
    const own = await viewer();
    const got = await asked(t, "campaign_ledger over 90 days, as a viewer", () =>
      own.rpc("campaign_ledger", { p_tenant_id: tenant, p_days: 90 }),
    );
    const sends = sendsDirectly(tenant, 90);
    const { held, approved } = holdsDirectly(tenant, 90);
    assert.equal(sends.runs, SCALE.moments * 90);
    assert.equal(got.people.now.sent_to, sends.sent_to);
    assert.equal(got.people.now.wrote_back, sends.wrote_back);
    assert.deepEqual([got.runs.now.moment, got.runs.now.broadcast], [sends.runs, 0]);
    assert.equal(
      got.by_message.reduce((n, m) => n + m.sent, 0),
      sends.sent,
    );
    assert.equal(got.first_reply.n, sends.replied);
    assert.equal(got.held.total, held);
    assert.equal(got.approval.n, approved);
    assert.equal(got.failed_sends.total, failuresDirectly(tenant, 90).failed);
    assert.equal(got.failed_sends.total, SCALE.moments * 90);
    assert.equal(got.people.before.sent_to, sends.sent_to_before);
    assert.deepEqual([got.runs.before.moment, got.runs.before.broadcast], [sends.runs_before, 0]);
  },
);

test(
  "campaign_series over 30 days, its consent part among the days' counts, answers a member inside half of 8 seconds",
  { skip },
  async (t) => {
    const tenant = world();
    const own = await viewer();
    const got = await asked(t, "campaign_series over 30 days, as a viewer", () =>
      own.rpc("campaign_series", { p_tenant_id: tenant, p_days: 30 }),
    );
    const now = sendsDirectly(tenant, 30);
    const sum = (rows, key) => rows.reduce((n, d) => n + d[key], 0);
    assert.equal(got.series.length, 60, "the window and the 30 days before it");
    assert.equal(sum(got.series.slice(30), "sent"), now.sent);
    assert.equal(sum(got.series.slice(0, 30), "sent"), now.sent_before);
    assert.equal(sum(got.series.slice(30), "replied"), now.replied);
    assert.deepEqual(
      got.sources.map((s) => [s.runs, s.sent]),
      Array.from({ length: SCALE.moments }, () => [30, 30 * (SCALE.people - 1)]),
      "each moment's 30 runs",
    );
    assert.deepEqual(
      got.by_channel.map((c) => [c.channel, c.sent]),
      [["whatsapp", now.sent]],
    );
    // A person counts once a period and answer: the yeses and stops each period holds, whatever runs they said it to.
    const answers = counted(`select
        (select count(*) from (select distinct subject_id, data ->> 'consent' from public.events
            where tenant_id = '${tenant}' and kind = 'contact.consent_changed'
              and created_at >= ${from(30)} and created_at < ${until}) a) as now,
        (select count(*) from (select distinct subject_id, data ->> 'consent' from public.events
            where tenant_id = '${tenant}' and kind = 'contact.consent_changed'
              and created_at >= ${from(60)} and created_at < ${from(30)}) b) as before`);
    const span = counted(`select count(*) as n from (select distinct subject_id, data ->> 'consent' from public.events
            where tenant_id = '${tenant}' and kind = 'contact.consent_changed'
              and created_at >= ${from(60)} and created_at < ${until}) a`);
    assert.ok(answers.now > 0 && answers.before > 0, "the world has answers in both periods");
    assert.ok(answers.now + answers.before > span.n, "some said the same in both: a period's count is not the span's");
    assert.equal(sum(got.series.slice(30), "opt_ins") + sum(got.series.slice(30), "opt_outs"), answers.now);
    assert.equal(sum(got.series.slice(0, 30), "opt_ins") + sum(got.series.slice(0, 30), "opt_outs"), answers.before);
  },
);

test(
  "campaign_stuck answers a member inside half of 8 seconds, with the threads that answered a run and wait",
  { skip },
  async (t) => {
    const tenant = world();
    const own = await viewer();
    const got = await asked(t, "campaign_stuck, as a viewer", () => own.rpc("campaign_stuck", { p_tenant_id: tenant }));
    // A thread waits when it is flagged and answered a moment's run in the last 30 days: one in ten is flagged.
    const waiting = counted(`select count(distinct m.conversation_id) as threads
      from public.broadcast_recipients r
      join public.messages m on m.id = r.message_id
      join public.conversations c on c.id = m.conversation_id
     where r.tenant_id = '${tenant}' and r.state = 'sent' and r.sent_at >= now() - interval '30 days'
       and c.state = 'needs_human'
       and exists (select 1 from public.messages i
                    where i.conversation_id = m.conversation_id and i.direction = 'inbound' and i.sender = 'customer'
                      and i.created_at > r.sent_at
                      and i.created_at <= r.sent_at + interval '${REPLY_WINDOW_HOURS} hours')`);
    assert.ok(waiting.threads > 0, "the world has threads that wait");
    assert.equal(got.replies.length, waiting.threads);
    assert.deepEqual([got.runs_waiting.length, got.runs_failed.length, got.templates.length], [0, 0, 0]);
  },
);

test(
  "campaign_answers over 30 days answers a member inside half of 8 seconds, one row to each answer",
  { skip },
  async (t) => {
    const tenant = world();
    const own = await viewer();
    const until = new Date();
    const since = new Date(until.getTime() - 30 * DAY_MS);
    const got = await asked(t, "campaign_answers over 30 days, as a viewer", () =>
      own.rpc("campaign_answers", { p_tenant_id: tenant, p_since: since.toISOString(), p_until: until.toISOString() }),
    );
    // Each event is two hours after one send of the person's and 94 before their next, so it answers that run and no other.
    const events = counted(`select count(*) as n from public.events
      where tenant_id = '${tenant}' and kind = 'contact.consent_changed'
        and created_at >= '${since.toISOString()}' and created_at < '${until.toISOString()}'`);
    assert.ok(events.n > 0, "the world has answers in the window");
    assert.equal(got.length, events.n);
    assert.equal(new Set(got.map((a) => `${a.broadcast_id}:${a.contact_id}`)).size, got.length, "one answer to a run");
  },
);

test(
  "the reach-out reads (00404) answer a member inside half of 8 seconds, in the businesses the chain wrote to",
  { skip },
  async (t) => {
    const tenant = world();
    const own = await viewer();
    const report = await asked(t, "reach_out_report over 30 days, as a viewer", () =>
      own.rpc("reach_out_report", { p_tenant_id: tenant, p_days: 30 }),
    );
    const chains = await asked(t, "reach_out_chain_totals over 30 days, as a viewer", () =>
      own.rpc("reach_out_chain_totals", { p_tenant_id: tenant, p_days: 30 }),
    );
    // An email that left, dated as the report dates it; a business once a chain, at its last email of the window.
    const emails = counted(`with em as (
        select s.root_id, s.lead_id, l.contact_id,
               coalesce(s.sent_at, (m.meta -> 'status_at' ->> 'sent')::timestamptz) as at
          from public.reach_out_sends s
          join public.leads l on l.id = s.lead_id
          left join public.messages m on m.id = s.message_id
         where s.tenant_id = '${tenant}'
           and (s.state = 'sent' or (s.state = 'failed' and m.status = 'failed' and m.error ->> 'provider' in ('bounced', 'failed')))),
      last as (select distinct on (root_id, lead_id) root_id, lead_id, contact_id from em
                where at >= ${from(30)} and at < ${until} order by root_id, lead_id, at desc)
      select (select count(*) from em where at >= ${from(30)} and at < ${until}) as written,
             (select count(*) from last) as businesses,
             (select count(*) from em where at >= ${from(60)} and at < ${from(30)}) as before_written,
             (select count(*) from last x where exists (select 1 from public.messages i
                 join public.conversations c on c.id = i.conversation_id
                where i.tenant_id = '${tenant}' and c.contact_id = x.contact_id and i.direction = 'inbound'
                  and i.sender = 'customer')) as wrote_back,
             (select count(*) from last x where exists (select 1 from public.reach_out_replies r
                where r.tenant_id = '${tenant}' and r.lead_id = x.lead_id and r.intent in ('interested', 'question')
                  and r.claim <> 'auto_reply' and r.undone_at is null)) as interested`);
    assert.ok(emails.written > 1000 && emails.wrote_back > 0, "the chain wrote a thousand emails and was answered");
    assert.deepEqual(
      [
        report.totals.written,
        report.totals.businesses,
        report.totals.wrote_back,
        report.totals.interested,
        report.before.written,
      ],
      [emails.written, emails.businesses, emails.wrote_back, emails.interested, emails.before_written],
    );
    const [chain] = Object.values(chains);
    assert.equal(Object.keys(chains).length, 1);
    assert.deepEqual(
      [chain.written, chain.businesses, chain.wrote_back],
      [emails.written, emails.businesses, emails.wrote_back],
      "the chain's totals are the report's",
    );
    assert.ok(chain.wrote_back <= chain.businesses);
  },
);
