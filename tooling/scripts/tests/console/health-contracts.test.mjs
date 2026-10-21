/**
 * Health's pure half (decision 0068, contracts/src/console/health*.ts): the tab on the address, whose numbers a row is
 * (customers', ours, all), the clocks and how a schedule reads, the plain reading of a failed job, the promises a day at
 * a time, each part's numbers (sends, calls, the model, deliveries, Ask), the tiles, what needs a look and in what
 * order, the errors pages hit grouped by fingerprint, and the model's failure kept with its reason. Run, not read: each
 * function is called with the cases it exists for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AI_USAGE_ERROR_CHARS,
  ClientErrorInput,
  HealthQuerySchema,
  DeliveryRedriveSchema,
  aiUsageBodyOf,
  healthAskOf,
  callsOf,
  clocksOf,
  creditRanOut,
  deliveriesOf,
  errorGroupReport,
  errorGroupsOf,
  failureReadingOf,
  healthCounts,
  healthLooksOf,
  healthPathOf,
  healthSentence,
  healthTabOf,
  healthTilesOf,
  inScope,
  modelCallsOf,
  oursOf,
  pageKeyWords,
  promiseDaysOf,
  scheduleWords,
  sendsOf,
  workspaceNamer,
} from "@chanlytics/contracts";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const iso = (ms) => new Date(ms).toISOString();

const C = "c0000000-0000-4000-8000-000000000001";
const O = "00000000-0000-4000-8000-0000000000e2";
const WORKSPACES = [
  { id: C, slug: "bloom-studio", name: "Bloom Studio", ours: false },
  { id: O, slug: "nightly-suite", name: "The nightly suite", ours: true },
];

/** Every part's lists, empty: what platform_health_parts answers for a quiet platform. */
const quietParts = (over = {}) => ({
  days: 30,
  sends: [],
  send_errors: [],
  calls: [],
  webhooks: [],
  billing: [],
  model: [],
  model_by_workspace: [],
  model_failures: [],
  deliveries: [],
  delivery_failures: [],
  ask: [],
  ask_traced: [],
  ask_tools: [],
  ask_by_workspace: [],
  ask_failures: [],
  ask_threads: [],
  lines: [],
  channels: [],
  google: [],
  mailboxes: [],
  ...over,
});

/** One workspace's rolled day, every number none but what the case says. */
const dayRow = (tenantId, name, day, over = {}) => ({
  tenant_id: tenantId,
  name,
  day,
  messages_in: {},
  messages_out: {},
  asks: 0,
  answered: 0,
  replies_answered: 0,
  replies_held: 0,
  replies_handed_off: 0,
  brain_p95_ms: null,
  provider_failures: {},
  tokens: 0,
  job_lag_ms: {},
  first_answer_ms: {},
  duplicate_sends: null,
  dead_letters: {},
  relay_lag_ms: null,
  intake_lag_ms: {},
  ...over,
});

/** What GET platform/health answers, quiet but for what the case says. */
const healthOf = (over = {}) => ({
  days: 30,
  checked_at: iso(NOW),
  workspaces: WORKSPACES,
  clocks: [],
  backlog: 0,
  failed_jobs: [],
  pages: [],
  day_rows: [],
  parts: quietParts(),
  client_errors: [],
  vitals: [],
  speed: { rows: [], spots: [] },
  ...over,
});

/* ----------------------------------------------------------------------------------------- the address, the scope */

test("a part is a tab on the address: /console/health/<part>, the overview at /console/health, an unknown part the overview", () => {
  assert.equal(healthPathOf("overview"), "/console/health");
  assert.equal(healthPathOf("ask"), "/console/health/ask");
  for (const tab of ["promises", "background", "messages", "ask", "model", "speed", "bugs"])
    assert.equal(healthTabOf(healthPathOf(tab)), tab, tab);
  assert.equal(healthTabOf("/console/health"), "overview");
  assert.equal(healthTabOf("/console/health/nope"), "overview");
  assert.equal(healthTabOf("/console/support/ask"), "overview", "another screen's address names no part");
  assert.equal(healthTabOf("/console/health/bugs?x=1#y"), "bugs");
});

test("whose numbers: customers' rows and the platform's own, ours apart, all of them; a workspace is named, a deleted one said so", () => {
  assert.equal(inScope(false, "customers"), true);
  assert.equal(inScope(true, "customers"), false);
  assert.equal(inScope(true, "ours"), true);
  assert.equal(inScope(false, "ours"), false);
  assert.equal(inScope(true, "all") && inScope(false, "all"), true);
  assert.deepEqual([...oursOf(WORKSPACES)], [O]);
  assert.deepEqual([...oursOf(null)], [], "an unread list makes nobody ours");
  const name = workspaceNamer(WORKSPACES);
  assert.equal(name(C), "Bloom Studio");
  assert.equal(name("dddddddd-0000-4000-8000-000000000009"), "A workspace since deleted");
  assert.equal(name(null), "Every workspace");
});

test("the query reads a week or a month, a month by default; Deliver again names a subscriber and why", () => {
  assert.deepEqual(HealthQuerySchema.parse({}), { days: 30 });
  assert.deepEqual(HealthQuerySchema.parse({ days: "7" }), { days: 7 });
  assert.equal(HealthQuerySchema.safeParse({ days: "14" }).success, false);
  const why = { kind: "found", ticket: null, note: null };
  assert.equal(DeliveryRedriveSchema.safeParse({ subscriber: "consent_notice", why }).success, true);
  assert.equal(DeliveryRedriveSchema.safeParse({ subscriber: "Consent Notice", why }).success, false);
  assert.equal(DeliveryRedriveSchema.safeParse({ subscriber: "consent_notice" }).success, false, "never without why");
});

/* ------------------------------------------------------------------------------------------------------ the clocks */

test("a schedule reads as a person says it", () => {
  assert.equal(scheduleWords("*/5 * * * *"), "every 5 min");
  assert.equal(scheduleWords("13,43 * * * *"), ":13 and :43");
  assert.equal(scheduleWords("17 0 * * *"), "daily 00:17");
  assert.equal(scheduleWords("0 3 25 * *"), "the 25th");
  assert.equal(scheduleWords("* * * * *"), "every minute");
  assert.equal(scheduleWords("30 seconds"), "every 30 seconds");
  assert.equal(scheduleWords(null), "");
});

test("the clocks: not running first, then unread, running, idle; a clock that asks only with work and has not asked is idle, never stopped", () => {
  const clock = (sweep, over) => ({
    sweep,
    jobname: `${sweep}-sweep`,
    schedule: "*/5 * * * *",
    judged_by: "request",
    max_silence: "00:20:00",
    last_run: iso(NOW - 2 * MIN),
    runs: 2016,
    failed: 0,
    last_failure: null,
    healthy: true,
    detail: null,
    last_request_at: iso(NOW - 3 * MIN),
    ...over,
  });
  const c = clocksOf([
    clock("calls", { max_silence: null, last_request_at: null, failed: 1, last_failure: "job startup timeout" }),
    clock("health"),
    clock("mailboxes", { healthy: false, detail: "No request for 45 minutes.", last_request_at: iso(NOW - 45 * MIN) }),
    clock("partitions", { healthy: null, judged_by: "run", max_silence: "35 days" }),
  ]);
  assert.deepEqual(
    c.rows.map((r) => [r.sweep, r.state]),
    [
      ["mailboxes", "stopped"],
      ["partitions", "unknown"],
      ["health", "running"],
      ["calls", "idle"],
    ],
  );
  const [mail, part, health, calls] = c.rows;
  assert.equal(mail.problem, "No request for 45 minutes.", "the health check's own words");
  assert.equal(mail.words, "Connected mailboxes read");
  assert.equal(mail.judged, "its asks, 20 min");
  assert.equal(part.judged, "its runs, 35 days");
  assert.equal(health.problem, null);
  assert.match(calls.note, /only while a call has run past five minutes/);
  assert.equal(calls.problem, "job startup timeout", "a failed start is said though the clock is idle");
  assert.deepEqual([c.runs, c.failed], [4 * 2016, 1]);
  assert.deepEqual(clocksOf(null).rows, [], "an unread list draws no clock");
});

test("what paged us in words: a delivery names its subscriber, a workspace's model failures say whose elsewhere", () => {
  assert.equal(pageKeyWords("event_deliver_failed:consent_notice"), "A delivery failing: consent notices");
  assert.equal(pageKeyWords("model_credit"), "The model key's credit ran out");
  assert.equal(pageKeyWords(`model_failures:${C}`), "A workspace's model calls failing");
  assert.equal(pageKeyWords("something_new"), "something new");
});

test("a failed job's plain reading comes from the shape of what it answered", () => {
  assert.match(
    failureReadingOf('resend answered 422: {"message":"The `id` must be a valid UUID."}', 3),
    /^It failed the same way on every try, and a 4xx from the provider means the request itself is wrong/,
  );
  assert.match(failureReadingOf("twilio answered 401: Authenticate", 1), /^A 4xx from the provider/);
  assert.match(failureReadingOf("meta answered 503", 2), /provider failed or didn't answer in time/);
  assert.match(failureReadingOf("the request timed out", 1), /provider failed or didn't answer in time/);
  assert.match(failureReadingOf("the run did not finish: its outcome is unknown", 1), /stopped before it finished/);
  assert.match(failureReadingOf("the job ran out of time", 1), /ran out of time/);
  assert.match(failureReadingOf("This API key is restricted from this endpoint", 1), /refused our key/);
  assert.equal(failureReadingOf("something nobody has seen", 1), null);
  assert.equal(failureReadingOf(null, 1), null);
});

/* ---------------------------------------------------------------------------------------------------- the promises */

test("the promises a day at a time: a day past the target is missed with its worst figure, a day with no number is none, never kept", () => {
  const rows = [
    dayRow(C, "Bloom Studio", "2026-10-19", { job_lag_ms: { 0: 4_000 }, relay_lag_ms: 2_000 }),
    dayRow(C, "Bloom Studio", "2026-10-20", { job_lag_ms: { 0: 25_000 }, relay_lag_ms: 3_000 }),
    dayRow(O, "The nightly suite", "2026-10-20", { relay_lag_ms: 168 * HOUR }),
  ];
  const customers = promiseDaysOf(rows, oursOf(WORKSPACES), "customers", 3);
  assert.deepEqual(
    customers.days,
    ["2026-10-18", "2026-10-19", "2026-10-20"],
    "the window ends at the newest day rolled",
  );
  const jobs = customers.rows.find((r) => r.key === "job_lag_ms");
  assert.deepEqual(
    jobs.cells.map((c) => c.state),
    ["none", "kept", "missed"],
  );
  assert.equal(jobs.cells[2].words, "0 25.0 s, target 10.0 s");
  assert.equal(jobs.state, "missed");
  assert.equal(jobs.missedDays, 1);
  assert.equal(jobs.where, "Bloom Studio");
  assert.match(jobs.worst, /^Bloom Studio: 0 25\.0 s on 2026-10-20, target 10\.0 s$/);
  const relay = customers.rows.find((r) => r.key === "relay_lag_ms");
  assert.equal(relay.state, "kept", "the suite's week-old events are not a customer's");
  const brain = customers.rows.find((r) => r.key === "brain_p95_ms");
  assert.equal(brain.state, "unjudged");
  assert.equal(brain.last, "not judged");

  const ours = promiseDaysOf(rows, oursOf(WORKSPACES), "ours", 3);
  const oursRelay = ours.rows.find((r) => r.key === "relay_lag_ms");
  assert.equal(oursRelay.state, "missed");
  assert.equal(oursRelay.last, "168 h");
  assert.deepEqual(promiseDaysOf(null, new Set(), "all", 30), {
    days: [],
    rows: promiseDaysOf([], new Set(), "all", 30).rows,
  });
});

/* ------------------------------------------------------------------------------------------------------- the parts */

test("sends: a channel failing one send in twenty, on twenty at least, is troubled; the provider's code is said in words", () => {
  const last = iso(NOW - HOUR);
  const parts = (delivered) =>
    quietParts({
      sends: [
        { ours: false, channel: "whatsapp", status: "delivered", n: delivered },
        { ours: false, channel: "whatsapp", status: "failed", n: 1 },
        { ours: true, channel: "sms", status: "failed", n: 30 },
      ],
      send_errors: [
        { ours: false, channel: "whatsapp", code: "131026", title: "Message undeliverable", n: 1, last_at: last },
      ],
    });
  const s = sendsOf(parts(19), "customers");
  assert.deepEqual([s.total, s.failed, s.delivered], [20, 1, 19]);
  assert.equal(s.troubled.length, 1);
  assert.equal(s.troubled[0].topError, "Undeliverable: the number can't take WhatsApp messages (131026)");
  assert.equal(sendsOf(parts(18), "customers").troubled.length, 0, "nineteen sends are too few to judge");
  assert.equal(sendsOf(parts(19), "all").troubled.length, 2, "each side is judged apart");
  assert.equal(sendsOf(null, "all").total, 0);
});

test("calls: the endings that are ours to mend are trouble, with what to do; a caller hanging up is not", () => {
  const last = iso(NOW - 2 * DAY);
  const c = callsOf(
    quietParts({
      calls: [
        { ours: false, status: "ended", reason: "user_hangup", n: 91, last_at: last },
        { ours: false, status: "error", reason: "credit_exhausted", n: 2, last_at: last },
        { ours: false, status: "not_connected", reason: "dial_no_answer", n: 4, last_at: last },
      ],
    }),
    "customers",
  );
  assert.deepEqual([c.connected, c.total], [91, 97]);
  assert.deepEqual(
    c.trouble.map((t) => [t.reason, t.words, t.n]),
    [["credit_exhausted", "the voice provider's credit ran out", 2]],
  );
  assert.match(c.trouble[0].why, /^Top up the voice provider's credit/);
});

test("model calls: a key out of credit is said as such, a side's failures are grouped apart, and the reason is the API's own", () => {
  const parts = quietParts({
    model: [
      { ours: false, purpose: "ask", outcome: "ok", n: 10, usd: 1 },
      { ours: true, purpose: "ask", outcome: "ok", n: 5, usd: 3 },
      { ours: true, purpose: "ask", outcome: "rejected", n: 2, usd: 0 },
    ],
    model_by_workspace: [
      { ours: false, tenant_id: C, purpose: "ask", n: 10, usd: 1 },
      { ours: true, tenant_id: O, purpose: "ask", n: 7, usd: 3 },
    ],
    model_failures: [
      {
        ours: true,
        at: iso(NOW - 3 * DAY),
        tenant_id: O,
        purpose: "ask",
        model: "claude-opus-5-5",
        outcome: "rejected",
        error_type: "invalid_request_error",
        error_message: "Your credit balance is too low to access the Anthropic API.",
      },
      {
        ours: true,
        at: iso(NOW - 4 * DAY),
        tenant_id: O,
        purpose: "ask",
        model: "claude-opus-5-5",
        outcome: "rejected",
        error_type: null,
        error_message: null,
      },
    ],
  });
  const all = modelCallsOf(parts, "all");
  assert.deepEqual([all.total, all.noAnswer, all.usd], [17, 2, 4]);
  assert.equal(all.failureGroups.length, 1);
  const g = all.failureGroups[0];
  assert.deepEqual([g.purpose, g.ours, g.n, g.credit], ["ask", true, 2, true]);
  assert.equal(g.reason, "invalid_request_error: Your credit balance is too low to access the Anthropic API.");
  assert.deepEqual(g.where, [O]);
  assert.equal(all.failures.find((f) => f.atMs === NOW - 4 * DAY).reason, null, "a round from before 00469 kept none");
  assert.deepEqual(modelCallsOf(parts, "customers").failureGroups, [], "ours are not customers'");
});

test("deliveries: by subscriber, the failures grouped per side with the newest reason and where", () => {
  const d = deliveriesOf(
    quietParts({
      deliveries: [
        { ours: true, subscriber: "consent_notice", state: "failed", n: 13, last_at: iso(NOW - DAY) },
        { ours: false, subscriber: "owner_notice", state: "done", n: 900, last_at: iso(NOW) },
        { ours: false, subscriber: "owner_notice", state: "scheduled", n: 2, last_at: iso(NOW) },
      ],
      delivery_failures: [
        {
          ours: true,
          event_id: "e-1",
          subscriber: "consent_notice",
          kind: "consent.given",
          tenant_id: O,
          attempts: 1,
          last_error: "the ledger no longer holds the event",
          updated_at: iso(NOW - DAY),
        },
      ],
    }),
    "all",
  );
  assert.deepEqual([d.total, d.failed], [915, 13]);
  assert.deepEqual(
    d.subscribers.map((s) => [s.subscriber, s.done, s.failed, s.waiting]),
    [
      ["consent_notice", 0, 13, 0],
      ["owner_notice", 900, 0, 2],
    ],
  );
  assert.deepEqual(
    d.failures.map((f) => [f.subscriber, f.ours, f.n, f.reason, f.where]),
    [["consent_notice", true, 13, "the ledger no longer holds the event", [O]]],
  );
});

test("Ask: each side's row and the row for both, slow past 30 s at the 95th, tools merged across sides, ours' share of the cost", () => {
  const parts = quietParts({
    ask: [
      {
        ours: false,
        answers: 10,
        failed: 1,
        ungrounded: 0,
        latency_p50: 4_000,
        latency_p95: 12_800,
        latency_max: 20_000,
      },
      {
        ours: true,
        answers: 5,
        failed: 0,
        ungrounded: 1,
        latency_p50: 9_000,
        latency_p95: 41_000,
        latency_max: 50_000,
      },
      {
        ours: null,
        answers: 15,
        failed: 1,
        ungrounded: 1,
        latency_p50: 5_000,
        latency_p95: 35_000,
        latency_max: 50_000,
      },
    ],
    ask_tools: [
      { ours: false, name: "people.search", n: 4, avg_ms: 500, max_ms: 900 },
      { ours: true, name: "people.search", n: 4, avg_ms: 2_500, max_ms: 4_000 },
    ],
    model: [
      { ours: false, purpose: "ask", outcome: "ok", n: 10, usd: 1 },
      { ours: true, purpose: "ask", outcome: "ok", n: 5, usd: 3 },
    ],
    model_by_workspace: [
      { ours: false, tenant_id: C, purpose: "ask", n: 10, usd: 1 },
      { ours: true, tenant_id: O, purpose: "ask", n: 5, usd: 3 },
    ],
    ask_by_workspace: [
      { ours: false, tenant_id: C, answers: 10 },
      { ours: true, tenant_id: O, answers: 5 },
    ],
    ask_failures: [
      {
        ours: false,
        at: iso(NOW - HOUR),
        tenant_id: C,
        failure: "bad_request",
        said: "The model refused the question",
      },
    ],
  });
  const customers = healthAskOf(parts, "customers");
  assert.deepEqual([customers.answers, customers.failed, customers.slow], [10, 1, false]);
  assert.equal(customers.usd, 1);
  assert.deepEqual(
    customers.tools.map((t) => [t.name, t.n, t.avgMs, t.slow]),
    [["people.search", 4, 500, false]],
  );
  assert.deepEqual(customers.byWorkspace, [{ tenantId: C, ours: false, answers: 10, rounds: 10, usd: 1 }]);
  assert.equal(customers.failures[0].said, "The model refused the question");
  assert.equal(healthAskOf(parts, "ours").slow, true, "41 s at the 95th is too long for an owner");
  const all = healthAskOf(parts, "all");
  assert.equal(all.answers, 15, "the row for both sides, never the two summed");
  assert.deepEqual(
    all.tools.map((t) => [t.n, t.avgMs, t.maxMs, t.slow]),
    [[8, 1_500, 4_000, true]],
  );
  assert.equal(all.oursShare, 0.75);
  assert.equal(healthAskOf(null, "all").usd, null, "no round counted, no cost");
});

/* ------------------------------------------------------------------------------------- the tiles and what needs a look */

test("the tiles judge each part by the platform's own targets, and a part that could not be read is Not judged, never Kept", () => {
  const quiet = healthTilesOf(healthOf(), "customers", NOW);
  assert.deepEqual(
    quiet.map((t) => t.key),
    ["promises", "background", "deliveries", "sends", "calls", "webhooks", "ask", "speed"],
  );
  assert.equal(quiet.find((t) => t.key === "background").state, "kept");
  assert.equal(quiet.find((t) => t.key === "sends").state, "unjudged", "nothing sent is nothing to judge");
  const unread = healthTilesOf(healthOf({ clocks: null, parts: null, day_rows: null, vitals: null }), "all", NOW);
  for (const t of unread) assert.equal(t.state, "unjudged", t.key);
  assert.equal(unread.find((t) => t.key === "promises").line, "The nightly counts could not be read just now.");
  const late = healthTilesOf(healthOf({ backlog: 3 }), "customers", NOW).find((t) => t.key === "background");
  assert.deepEqual([late.state, late.line], ["missed", "3 jobs late"]);
});

test("what needs a look: worst first then newest, each with where and its act; ours only under Ours and All", () => {
  const h = healthOf({
    backlog: 3,
    failed_jobs: [
      {
        id: "j0000000-0000-4000-8000-000000000001",
        tenant_id: C,
        kind: "booking_read",
        lane: 1,
        attempts: 3,
        last_error: "resend answered 422: The `id` must be a valid UUID.",
        created_at: iso(NOW - 2 * HOUR - 14 * MIN),
        updated_at: iso(NOW - 2 * HOUR),
      },
    ],
    parts: quietParts({
      model_failures: [
        {
          ours: true,
          at: iso(NOW - 3 * DAY),
          tenant_id: O,
          purpose: "ask",
          model: "claude-opus-5-5",
          outcome: "rejected",
          error_type: "invalid_request_error",
          error_message: "Your credit balance is too low to access the Anthropic API.",
        },
      ],
      deliveries: [{ ours: true, subscriber: "consent_notice", state: "failed", n: 13, last_at: iso(NOW - DAY) }],
      delivery_failures: [
        {
          ours: true,
          event_id: "e-1",
          subscriber: "consent_notice",
          kind: "consent.given",
          tenant_id: O,
          attempts: 1,
          last_error: "the ledger no longer holds the event",
          updated_at: iso(NOW - DAY),
        },
      ],
    }),
  });
  const customers = healthLooksOf(h, "customers", NOW);
  assert.deepEqual(
    customers.map((l) => [l.key, l.severity]),
    [
      ["backlog", "red"],
      ["job:j0000000-0000-4000-8000-000000000001", "amber"],
    ],
  );
  const job = customers[1];
  assert.equal(job.what, "Reading a booking notice failed, 3 tries");
  assert.equal(job.where, "Bloom Studio");
  assert.equal(job.tenantId, C);
  assert.deepEqual(job.act, { kind: "run_again", jobId: "j0000000-0000-4000-8000-000000000001", tenantId: C });
  assert.match(job.reading, /4xx from the provider means the request itself is wrong/);

  const ours = healthLooksOf(h, "ours", NOW);
  assert.deepEqual(
    ours.map((l) => [l.key, l.severity]),
    [
      ["delivery:consent_notice:ours", "red"],
      ["model:ask:ours", "red"],
    ],
    "the newer red first",
  );
  assert.deepEqual(ours[0].act, { kind: "redrive", subscriber: "consent_notice" });
  assert.equal(ours[0].tenantId, O, "one workspace's failures name it");
  assert.match(ours[0].reading, /the event was removed before its delivery ran/i);
  assert.deepEqual(ours[1].act, { kind: "open", tab: "ask" });
  assert.match(ours[1].reading, /credit ran out/);

  assert.deepEqual(healthCounts(h, NOW), { customers: 2, ours: 2, all: 4 });
  assert.equal(healthSentence(h, NOW), "2 need a look for customers · 2 in ours · every clock running · 3 jobs late");
  assert.equal(
    healthSentence(healthOf({ clocks: null, backlog: null }), NOW),
    "Nothing needs a look for customers · the clocks could not be read",
  );
});

/* ---------------------------------------------------------------------------------------------- errors nobody reported */

test("the errors pages hit are grouped by fingerprint, people counted by their hash, a report linked by its error id, a day's silence quiet", () => {
  const err = (fingerprint, atMs, member, over = {}) => ({
    at: iso(atMs),
    fingerprint,
    boundary: "os",
    page: "inbox",
    name: "TypeError",
    message: "Cannot read properties of undefined (reading 'id')",
    build: "3de53f9a1c2b",
    device: "desk",
    member_key: member,
    ...over,
  });
  const g = errorGroupsOf(
    [
      err("ab12", NOW - HOUR, "k1", { device: "phone", build: "4ef00aa11b2c" }),
      err("ab12", NOW - 2 * HOUR, "k2"),
      err("ab12", NOW - 3 * HOUR, "k1"),
      err("cd34", NOW - 3 * DAY, "k3", { name: "Error", message: "Loading chunk 9 failed\nat x", page: "people" }),
    ],
    [
      { error_id: "ab12", number: 1044 },
      { error_id: "zz99", number: 1050 },
    ],
    NOW,
  );
  assert.deepEqual([g.events, g.people, g.read], [4, 3, true]);
  assert.deepEqual(
    g.groups.map((x) => [x.fingerprint, x.events, x.people, x.quiet]),
    [
      ["ab12", 3, 2, false],
      ["cd34", 1, 1, true],
    ],
  );
  const ab = g.groups[0];
  assert.deepEqual(ab.reports, ["R-1044"]);
  assert.deepEqual(ab.devices, { desk: 2, phone: 1 });
  assert.equal(ab.since, "3de53f9a1", "the build it was first seen on");
  assert.equal(g.groups[1].message, "Loading chunk 9 failed", "the first line alone");
  assert.match(
    errorGroupReport(ab),
    /^TypeError: Cannot read properties[\s\S]*Reported by members: R-1044\nFingerprint: ab12$/,
  );
  assert.equal(errorGroupsOf(null, null, NOW).read, false, "an unread table says so");
});

test("the beacon's report takes its build and device, and a page from before sends neither", () => {
  const base = {
    boundary: "os",
    page: "inbox",
    name: "TypeError",
    message: "x",
    stack: null,
    digest: null,
    workspace: null,
  };
  assert.equal(ClientErrorInput.safeParse(base).success, true, "an older page's report");
  assert.equal(ClientErrorInput.safeParse({ ...base, build: "3de53f9a1c2b", device: "phone" }).success, true);
  assert.equal(ClientErrorInput.safeParse({ ...base, device: "tablet" }).success, false);
  assert.equal(ClientErrorInput.safeParse({ ...base, build: "Not A Build!" }).success, false);
});

/* --------------------------------------------------------------------------------------------- the model's own reason */

test("a call with no answer keeps what the API said, cut to the column; a credit balance too low is the key's credit running out", () => {
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const call = {
    tenantId: C,
    purpose: "ask",
    asked: "claude-opus-5-5",
    answered: "claude-opus-5-5",
    outcome: "rejected",
    usage,
  };
  const kept = aiUsageBodyOf({ ...call, error: { type: "invalid_request_error", message: "x".repeat(500) } });
  assert.equal(kept.error_type, "invalid_request_error");
  assert.equal(kept.error_message.length, AI_USAGE_ERROR_CHARS);
  const answered = aiUsageBodyOf(call);
  assert.equal(answered.error_type ?? null, null, "an answer keeps no error");
  assert.equal(
    creditRanOut({
      type: "invalid_request_error",
      message: "Your credit balance is too low to access the Anthropic API.",
    }),
    true,
  );
  assert.equal(creditRanOut({ type: "overloaded_error", message: "Overloaded" }), false);
  assert.equal(creditRanOut(null), false);
});
