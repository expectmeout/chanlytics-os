/**
 * The playbooks sweep, run: POST /api/cron/playbooks over a database in
 * memory. Until 13 Sep 2026 its text was pinned by two assertions and its
 * POST had never been called.
 *
 * Every hour, a bounded page of running playbooks, least-recently-run first.
 * Due-ness is judged by the business's own clock: a playbook whose hour has
 * come runs once for the day -- under `auto` its run is a scheduled broadcast
 * for the people who said yes, its send job on the ledger, the decision the
 * system's, and the playbook remembers the day so the next tick runs nothing.
 * A paused workspace is counted off and said once, quietly, and nothing is
 * made for it. What the page could not reach is noted; three ticks of that in
 * a row and the sweep says so with a 503 that sweep_health turns red.
 *
 * The clock is real -- the route reads `new Date()` -- so each workspace here
 * is given a zone chosen at test time to make its wall clock say what the case
 * needs: past the run hour and inside sending hours, or the middle of the night.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { localDate, localHour } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { withoutRequestId } from "../_log-lines.mjs";
import { at, knock, answer, refusedAtTheDoor, vault } from "../_cron-doors-world.mjs";

for (const k of [
  "WHATSAPP_PHONE_ID",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY",
  "LEAD_TO",
  "LEAD_FROM",
])
  delete process.env[k];

const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { POST, REACH_OUT_YIELD_AT_MS } = await import(at("apps/edge/api/cron/playbooks.ts"));
const { PLAYBOOKS_PER_TICK } = await import(at("apps/edge/lib/ops/sweep-rotation.ts"));
after(() => setPg(null));

const D = 86_400_000;
const H = 3_600_000;
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();

/**
 * A business clock reading what the case needs, right now. The fixed-offset
 * zones run from UTC-12 to UTC+14, so whatever the hour is here, one of them
 * reads any hour asked for.
 */
function zoneWhere(hourIs) {
  const now = new Date();
  for (let o = -12; o <= 14; o++) {
    const tz = o === 0 ? "Etc/GMT" : `Etc/GMT${o > 0 ? "-" : "+"}${Math.abs(o)}`;
    if (hourIs(localHour(tz, now))) return tz;
  }
  throw new Error("no zone reads that hour");
}
/** Past a 10:00 run hour and inside sending hours (nine to twenty), an hour clear of either edge. */
const OPEN = zoneWhere((h) => h >= 11 && h <= 17);
/** The middle of the night: nothing is due, whatever its hour. */
const CLOSED = zoneWhere((h) => h >= 0 && h <= 6);

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const R = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/** A person as people_list answers: quiet for forty days, said yes to offers. */
const person = (id, over = {}) => ({
  id,
  display_name: `Person ${id}`,
  wa_profile_name: null,
  phone_e164: `+130555501${id.replace(/\D/g, "").padStart(2, "0")}`,
  consent: "opted_in",
  consent_source: "keyword",
  consent_updated_at: iso(60 * D),
  dnc: false,
  marketing_consent: "opted_in",
  marketing_consent_source: "customer_message",
  marketing_consent_updated_at: iso(60 * D),
  channels: ["whatsapp"],
  conversation_count: 1,
  escalation_count: 0,
  needs_human: false,
  open_escalation_reason: null,
  open_escalation_since: null,
  latest_conversation_id: `cv-${id}`,
  latest_state: "open",
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: iso(40 * D),
  last_message_at: iso(40 * D),
  last_message_direction: "inbound",
  last_message_sender: "customer",
  last_inbound_text: "thanks!",
  last_inbound_at: iso(40 * D),
  last_call_at: null,
  last_inbound_call_at: null,
  last_inbound_call_summary: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: iso(90 * D),
  earliest_row_at: iso(90 * D),
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
  effective_reply_mode: "auto",
  visits: null,
  ...over,
});
/** The Win-back playbook as its row reads: daily at ten, running, never run. */
const playbook = (tenant, id, over = {}) => ({
  id,
  tenant_id: tenant,
  kind: "moment",
  name: "Win-back",
  trigger: "quiet_30",
  template_id: "tpl-winback",
  template_name: "winback_offer",
  template_language: "en_US",
  params: [{ kind: "first_name" }],
  policy_class: "reengage",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  created_by: "owner-1",
  last_run_for: null,
  last_run_at: null,
  created_at: iso(30 * D),
  updated_at: iso(30 * D),
  ...over,
});

/* -------------------------------------------------------------- the world */

/** The world a door test runs in, for the fakes of the database's own doors that write to its tables. */
const latest = { tables: null };
function world({ people = {}, ticks = 1, faults = {}, rpcs = {} } = {}) {
  const tables = {
    tenants: [],
    tenant_config: [],
    tenant_channels: [],
    policies: [],
    templates: [],
    playbooks: [],
    broadcasts: [],
    broadcast_recipients: [],
    jobs: [],
    decisions: [],
    events: [],
    notifications: [],
    // Reach out (Part 3): what a reach-out step's run reads and writes.
    billing_accounts: [],
    sending_domains: [],
    reach_out_sends: [],
  };
  latest.tables = tables;
  const backlog = [];
  const db = fakeDb(tables, faults, {
    ...vault,
    people_list: (a) => people[a.p_tenant_id] ?? [],
    note_sweep_backlog: (a) => {
      backlog.push(a);
      return ticks;
    },
    // The day's reach-out numbers at 6 PM (Part 6, H12): nobody's 6 PM here unless a test says so.
    reach_out_day_due: () => [],
    ...rpcs,
  });
  setPg(db);
  return { db, tables, backlog, tick: () => knock(POST, "playbooks") };
}
/**
 * The page as the database read it a moment before a workspace paused: every workspace judged as though active, over
 * the case's own tables, by the fake's own page (its second argument).
 */
const readBeforeThePause = (args, derived) => {
  const was = latest.tables.tenants.map((t) => t.status);
  for (const t of latest.tables.tenants) t.status = "active";
  try {
    return derived(args);
  } finally {
    latest.tables.tenants.forEach((t, i) => (t.status = was[i]));
  }
};

/** A workspace on the clock `tz`, with a number that may send, a template Meta approved, and the win-back class set to `mode`. */
function workspace(tables, id, tz, mode, status = "active") {
  tables.tenants.push({ id, name: `Workspace ${id.slice(0, 8)}`, timezone: tz, status });
  tables.tenant_config.push({ tenant_id: id, config: {} });
  tables.tenant_channels.push({
    tenant_id: id,
    kind: "whatsapp",
    status: "active",
    external_id: `wa-${id.slice(0, 8)}`,
    config: { quality_rating: "GREEN", messaging_limit: "TIER_1K" },
  });
  tables.policies.push({
    id: `pol-${id.slice(0, 8)}`,
    tenant_id: id,
    class: "reengage",
    mode,
    subject_type: null,
    subject_id: null,
    limits: {},
    updated_at: iso(0),
  });
  tables.templates.push({
    tenant_id: id,
    channel: "whatsapp",
    name: "winback_offer",
    language: "en_US",
    meta_status: "approved",
  });
}
const nothingMade = (w) =>
  assert.deepEqual(
    [w.tables.broadcasts, w.tables.broadcast_recipients, w.tables.jobs, w.tables.decisions],
    [[], [], [], []],
    "no run, no recipients, no send job, no decision",
  );
const counts = (over) => ({
  ok: true,
  tenants: 0,
  due: 0,
  sent: 0,
  held: 0,
  empty: 0,
  off: 0,
  failed: 0,
  remaining: 0,
  told: 0,
  ...over,
});

/** What the route says while it runs, as one line per event: the log is the only place a quiet skip is visible. */
function hear() {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  const keep =
    (channel) =>
    (...args) => {
      for (const a of args) {
        try {
          const o = JSON.parse(String(a));
          if (o && typeof o === "object" && o.event) lines.push({ channel, ...o });
        } catch {
          /* not one of the logger's lines */
        }
      }
    };
  console.log = keep("log");
  console.warn = keep("warn");
  console.error = keep("error");
  return {
    lines,
    restore: () => {
      console.log = real.log;
      console.warn = real.warn;
      console.error = real.error;
    },
  };
}

/* -------------------------------------------------------------- the door */

test("the door: the wrong key is a 401, a key Vault cannot produce is a 503, no database is a 503", async () => {
  await refusedAtTheDoor(POST, "playbooks", setPg);
});

/* ----------------------------------------------------------------- due */

test("a due playbook runs: a scheduled broadcast for the people who said yes, its send job on the ledger, the system's decision, every run recorded, and the playbook remembers the day -- so the next tick runs nothing", async () => {
  const w = world({ people: { [A]: [person("c1"), person("c2"), person("c3", { marketing_consent: "opted_out" })] } });
  workspace(w.tables, A, OPEN, "auto");
  w.tables.playbooks.push(playbook(A, "pb-a"));
  const today = localDate(OPEN, new Date());

  const [status, body] = await answer(await w.tick());
  assert.equal(status, 200);
  assert.deepEqual(body, counts({ tenants: 1, due: 1, sent: 1 }));

  assert.equal(w.tables.broadcasts.length, 1, "one run");
  const run = w.tables.broadcasts[0];
  assert.equal(run.tenant_id, A);
  assert.equal(run.playbook_id, "pb-a");
  assert.equal(run.run_for, today, "the run is for the business's own day");
  assert.equal(run.state, "scheduled", "auto: sends now");
  assert.equal(run.name, `Win-back · ${today}`);
  // Who the moment named and why the rest were left out, stored with the run the sheet approves it from.
  assert.deepEqual(run.audience, {
    kind: "playbook",
    id: "pb-a",
    label: "Win-back",
    reach: { pool: 3, will: 2, noNumber: 0, stopped: 0, noYes: 1, heardThis: 0, heardAny: 0, overCap: 0, overLimit: 0 },
  });
  assert.equal(run.recipient_count, 2);
  assert.equal(run.created_by, "owner-1", "the sweep's run is the playbook's owner's");
  assert.deepEqual(
    w.tables.broadcast_recipients.map((r) => r.contact_id).sort(),
    ["c1", "c2"],
    "the one who said no to offers is not on it",
  );
  assert.ok(
    w.tables.broadcast_recipients.every((r) => r.broadcast_id === run.id && r.tenant_id === A),
    "every recipient row names the run and the workspace",
  );
  assert.deepEqual(
    w.tables.jobs.map((j) => [j.tenant_id, j.kind, withoutRequestId(j.payload), j.due_at]),
    [[A, "broadcast_send", { broadcast_id: run.id }, run.scheduled_for]],
    "the send is on the ledger, due when the run is",
  );
  assert.deepEqual(
    w.tables.decisions.map((d) => [d.verb, d.actor_type, d.actor_user_id, d.subject_type, d.subject_id]),
    [["send_broadcast", "system", null, "broadcast", run.id]],
    "the system's decision, under the mode the owner chose",
  );
  assert.deepEqual(
    [
      w.tables.decisions[0].payload.mode,
      w.tables.decisions[0].payload.recipients,
      w.tables.decisions[0].payload.run_now,
    ],
    ["auto", 2, false],
  );
  assert.deepEqual(
    w.tables.events.map((e) => [e.tenant_id, e.kind, e.subject_type, e.subject_id, e.data.broadcast_id, e.data.by]),
    [[A, "playbook.run", "playbook", "pb-a", run.id, "system"]],
    "every run is recorded",
  );
  assert.equal(w.tables.playbooks[0].last_run_for, today, "the playbook remembers the day");
  assert.ok(w.tables.playbooks[0].last_run_at, "and when, which is what the next page sorts on");
  assert.deepEqual(w.backlog, [{ p_sweep: "playbooks", p_remaining: 0 }], "the queue drained");

  // The next tick, the same hour or later the same day.
  const [again, second] = await answer(await w.tick());
  assert.equal(again, 200);
  assert.deepEqual(second, counts(), "nothing due: it ran today");
  assert.equal(w.tables.broadcasts.length, 1, "one run per playbook per local day");
  assert.equal(w.tables.jobs.length, 1);
});

/* -------------------------------------------------------------- paused */

test("a paused workspace's moments are not on the page at all: nothing is made, scheduled, said or stamped, and the day stays open for the hour it resumes", async () => {
  const w = world({ people: { [P]: [person("c1")] } });
  workspace(w.tables, P, OPEN, "auto", "paused");
  w.tables.playbooks.push(playbook(P, "pb-p"));
  const before = { ...w.tables.playbooks[0] };

  const said = hear();
  let status, body;
  try {
    [status, body] = await answer(await w.tick());
  } finally {
    said.restore();
  }
  assert.equal(status, 200);
  assert.deepEqual(body, counts(), "not due while paused: not run, not counted off, not left behind");
  nothingMade(w);
  assert.deepEqual(w.tables.playbooks[0], before, "not marked as run, not moved: untouched");
  assert.ok(!w.db.seen.some((s) => s.rpc === "people_list"), "the workspace is not even read");
  assert.ok(!said.lines.some((l) => l.tenant_id === P), "and nothing is said about it");
  assert.deepEqual(w.backlog, [{ p_sweep: "playbooks", p_remaining: 0 }]);

  // The hour billing resumes, it is due again: its day was never closed.
  w.tables.tenants.find((t) => t.id === P).status = "active";
  const [, resumed] = await answer(await w.tick());
  assert.deepEqual(resumed, counts({ tenants: 1, due: 1, sent: 1 }));
});

test("a workspace paused after the page was read is counted off and said once, quietly: nothing is made or scheduled, the day stays open, and the moment moves to the back of the page", async () => {
  const w = world({ people: { [P]: [person("c1")] }, rpcs: { playbooks_due: readBeforeThePause } });
  workspace(w.tables, P, OPEN, "auto", "paused");
  w.tables.playbooks.push(playbook(P, "pb-p"));

  const said = hear();
  let status, body;
  try {
    [status, body] = await answer(await w.tick());
  } finally {
    said.restore();
  }
  assert.equal(status, 200);
  assert.deepEqual(body, counts({ tenants: 1, due: 1, off: 1 }), "due on the page, and counted off");
  nothingMade(w);
  assert.deepEqual(w.tables.events, [], "no run recorded: there was none");
  const [pb] = w.tables.playbooks;
  assert.equal(pb.last_run_for, null, "not marked as run, so it runs the day billing resumes");
  assert.ok(Date.parse(pb.last_run_at) > Date.now() - 60_000, "but it goes to the back of the page");

  const about = said.lines.filter((l) => l.event === "playbooks_skip_paused");
  assert.equal(about.length, 1, "said once");
  assert.deepEqual([about[0].level, about[0].channel], ["info", "log"], "quietly");
  assert.deepEqual([about[0].sweep, about[0].tenant_id, about[0].due], ["playbooks", P, 1]);
  assert.ok(
    !said.lines.some((l) => l.level !== "info" && l.tenant_id === P),
    "no warning, no error: a paused workspace is a fact, not a fault",
  );
});

/* ------------------------------------------------- the page and the clock */

test("the page is bounded and least-recently-run first, and what it could not reach is noted: twenty-seven running playbooks, twenty-five run, the two run most recently wait for the next tick", async () => {
  // `never` so that each run is off and recorded and nothing is sent: the
  // ORDER is what this case is about, and it is visible in which rows were
  // stamped for today.
  const w = world({ people: { [R]: [person("c1")] } });
  workspace(w.tables, R, OPEN, "never");
  const N = PLAYBOOKS_PER_TICK + 2;
  for (let i = 0; i < N; i++) {
    // pb-00 and pb-01 never ran; pb-02 ran 25 hours ago ... pb-26 ran an hour ago.
    w.tables.playbooks.push(
      playbook(R, `pb-${String(i).padStart(2, "0")}`, { last_run_at: i < 2 ? null : iso((N - i) * H) }),
    );
  }
  const today = localDate(OPEN, new Date());

  const [status, body] = await answer(await w.tick());
  assert.equal(status, 200);
  assert.deepEqual(body, counts({ tenants: 1, due: PLAYBOOKS_PER_TICK, off: PLAYBOOKS_PER_TICK, remaining: 2 }));
  const ran = w.tables.playbooks.filter((p) => p.last_run_for === today).map((p) => p.id);
  const waited = w.tables.playbooks.filter((p) => p.last_run_for !== today).map((p) => p.id);
  assert.equal(ran.length, PLAYBOOKS_PER_TICK);
  assert.deepEqual(
    waited,
    ["pb-25", "pb-26"],
    "the two that ran most recently wait; the never-run and the oldest went first",
  );
  assert.equal(
    w.tables.events.filter((e) => e.kind === "playbook.run").length,
    PLAYBOOKS_PER_TICK,
    "every run is recorded, a run that sent nothing included",
  );
  assert.ok(w.tables.events.every((e) => e.data.skipped === "never"));
  nothingMade(w);
  assert.deepEqual(w.backlog, [{ p_sweep: "playbooks", p_remaining: 2 }], "what it could not reach, noted");
  assert.equal(
    w.db.seen.filter((s) => s.rpc === "people_list").length,
    1,
    "the workspace is read once, not once per playbook",
  );
});

test("by the business's clock: in the middle of the night nothing is due, the workspace is not even read, and twenty-seven playbooks that are not due are not a backlog", async () => {
  const w = world({ people: { [R]: [person("c1")] } });
  workspace(w.tables, R, CLOSED, "auto");
  for (let i = 0; i < PLAYBOOKS_PER_TICK + 2; i++)
    w.tables.playbooks.push(playbook(R, `pb-${String(i).padStart(2, "0")}`));

  const [status, body] = await answer(await w.tick());
  assert.equal(status, 200);
  assert.deepEqual(body, counts(), "nothing due, nothing left behind");
  assert.ok(!w.db.seen.some((s) => s.rpc === "people_list"), "not due: the workspace is not read");
  nothingMade(w);
  assert.ok(w.tables.playbooks.every((p) => p.last_run_for === null));
  assert.deepEqual(
    w.backlog,
    [{ p_sweep: "playbooks", p_remaining: 0 }],
    "what is not due was never left behind: the alarm does not count it",
  );
});

test("three ticks in a row with DUE work left behind, and the sweep says so with a 503, having still run the page", async () => {
  const w = world({ people: { [R]: [person("c1")] }, ticks: 3 });
  workspace(w.tables, R, OPEN, "never");
  for (let i = 0; i < PLAYBOOKS_PER_TICK + 2; i++)
    w.tables.playbooks.push(playbook(R, `pb-${String(i).padStart(2, "0")}`));
  const today = localDate(OPEN, new Date());

  const [status, body] = await answer(await w.tick());
  assert.equal(status, 503, "sweep_health turns this red and mails the platform");
  assert.deepEqual(body, {
    ...counts({ tenants: 1, due: PLAYBOOKS_PER_TICK, off: PLAYBOOKS_PER_TICK, remaining: 2 }),
    ok: false,
    error: "playbooks_backlog",
    backlog_ticks: 3,
  });
  assert.equal(w.tables.playbooks.filter((p) => p.last_run_for === today).length, PLAYBOOKS_PER_TICK);
  assert.deepEqual(w.backlog, [{ p_sweep: "playbooks", p_remaining: 2 }]);
});

/* ---------------------------------------------------- only what is due */

test("a due playbook beyond the twenty-fifth runs in the same tick: twenty-five that are not yet at their hour, never run, hold no place in the page", async () => {
  // Twenty-five playbooks made this morning for eight in the evening. They have
  // never run, so a page ordered on last_run_at alone puts them first all day,
  // and the one that is due now waits behind them until they have run.
  const w = world({ people: { [A]: [person("c1")] } });
  workspace(w.tables, A, OPEN, "auto");
  const today = localDate(OPEN, new Date());
  const yesterday = localDate(OPEN, new Date(Date.now() - D));
  for (let i = 0; i < PLAYBOOKS_PER_TICK; i++)
    w.tables.playbooks.push(playbook(A, `pb-evening-${String(i).padStart(2, "0")}`, { run_hour: 20 }));
  w.tables.playbooks.push(playbook(A, "pb-due", { last_run_for: yesterday, last_run_at: iso(D) }));

  const [status, body] = await answer(await w.tick());
  assert.equal(status, 200);
  assert.deepEqual(body, counts({ tenants: 1, due: 1, sent: 1 }), "the due one ran; nothing was left behind");
  assert.deepEqual(
    w.tables.playbooks.filter((p) => p.last_run_for === today).map((p) => p.id),
    ["pb-due"],
    "the one that was due ran, and none of the evening's",
  );
  assert.equal(w.tables.broadcasts.length, 1);
  assert.equal(w.tables.broadcasts[0].playbook_id, "pb-due");
  assert.deepEqual(w.backlog, [{ p_sweep: "playbooks", p_remaining: 0 }]);
});

test("a playbook that already ran today, or is not yet at its hour, is neither run nor counted as left behind", async () => {
  const w = world({ people: { [A]: [person("c1")] } });
  workspace(w.tables, A, OPEN, "auto");
  const today = localDate(OPEN, new Date());
  // Twenty-six ran this morning, one is set for the evening: twenty-seven running playbooks, none of them due.
  for (let i = 0; i < PLAYBOOKS_PER_TICK + 1; i++)
    w.tables.playbooks.push(
      playbook(A, `pb-ran-${String(i).padStart(2, "0")}`, { last_run_for: today, last_run_at: iso(H) }),
    );
  w.tables.playbooks.push(playbook(A, "pb-evening", { run_hour: 20 }));
  const before = w.tables.playbooks.map((p) => [p.id, p.last_run_for, p.last_run_at]);

  const [status, body] = await answer(await w.tick());
  assert.equal(status, 200);
  assert.deepEqual(body, counts(), "nothing due, nothing left behind");
  assert.ok(!w.db.seen.some((s) => s.rpc === "people_list"), "nothing due: the workspace is not read");
  nothingMade(w);
  assert.deepEqual(
    w.tables.playbooks.map((p) => [p.id, p.last_run_for, p.last_run_at]),
    before,
    "no stamp moved",
  );
  assert.deepEqual(
    w.backlog,
    [{ p_sweep: "playbooks", p_remaining: 0 }],
    "a full table of not-due playbooks is not a backlog",
  );
});

test("a zone nobody knows does not take the tick down: the workspace with it is judged in UTC, and the others run on their own clocks as ever", async () => {
  // tenants.timezone is owner-settable text; a name Postgres does not know would fail the page for every workspace,
  // every tick, so the page judges such a row in UTC (00245 safe_zone), as the edge itself falls back to UTC.
  const now = new Date();
  const utcHour = localHour("UTC", now);
  // Set for the hour it is in UTC right now, within the sending hours: due there when UTC's clock is inside them.
  const marsDue = utcHour >= 9 && utcHour <= 20;
  const M = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const w = world({ people: { [A]: [person("c1")], [M]: [person("c2")] } });
  workspace(w.tables, A, OPEN, "auto");
  workspace(w.tables, M, "Mars/Olympus", "auto");
  w.tables.playbooks.push(playbook(A, "pb-a"));
  w.tables.playbooks.push(playbook(M, "pb-m", { run_hour: Math.min(20, Math.max(9, utcHour)) }));

  const [status, body] = await answer(await w.tick());
  assert.equal(status, 200, "one bad name never fails the tick");
  assert.deepEqual(body, counts(marsDue ? { tenants: 2, due: 2, sent: 2 } : { tenants: 1, due: 1, sent: 1 }));
  const ran = Object.fromEntries(w.tables.playbooks.map((p) => [p.id, p.last_run_for]));
  assert.equal(ran["pb-a"], localDate(OPEN, now), "the sound workspace ran on its own clock");
  assert.equal(
    ran["pb-m"],
    marsDue ? localDate("UTC", now) : null,
    "the workspace with the unknown zone is judged in UTC, and its day is UTC's",
  );
  assert.deepEqual(w.backlog, [{ p_sweep: "playbooks", p_remaining: 0 }]);
});

test("twenty-six running moments in a paused workspace hold no place in the page: the two due in a sound workspace run in the first tick, nothing is left behind, and the alarm stays quiet", async () => {
  // The re-score of 28 September: twenty-five of one paused workspace's moments (every stopped Stripe subscription
  // pauses one), not run since the pause, sorted first every hour and no other workspace's playbook ran, anywhere.
  const w = world({ people: { [A]: [person("c1")], [P]: [person("c2")] } });
  workspace(w.tables, P, OPEN, "auto", "paused");
  workspace(w.tables, A, OPEN, "auto");
  const today = localDate(OPEN, new Date());
  const yesterday = localDate(OPEN, new Date(Date.now() - D));
  // The paused workspace's, last run before the pause: they would sort first.
  for (let i = 0; i < PLAYBOOKS_PER_TICK + 1; i++)
    w.tables.playbooks.push(
      playbook(P, `pb-p-${String(i).padStart(2, "0")}`, { last_run_at: iso(30 * D), last_run_for: "2026-08-28" }),
    );
  // The sound workspace's two, run yesterday: they sort after.
  w.tables.playbooks.push(playbook(A, "pb-a1", { last_run_for: yesterday, last_run_at: iso(D) }));
  w.tables.playbooks.push(playbook(A, "pb-a2", { last_run_for: yesterday, last_run_at: iso(D - H) }));
  const paused = () => w.tables.playbooks.filter((p) => p.tenant_id === P).map((p) => [p.last_run_for, p.last_run_at]);
  const before = paused();

  const [status, first] = await answer(await w.tick());
  assert.equal(status, 200);
  assert.deepEqual(first, counts({ tenants: 1, due: 2, sent: 2 }), "the first tick: the two run");
  assert.deepEqual(
    w.tables.playbooks
      .filter((p) => p.last_run_for === today)
      .map((p) => p.id)
      .sort(),
    ["pb-a1", "pb-a2"],
  );
  assert.deepEqual(paused(), before, "the paused ones untouched: no stamp, their day still open");
  assert.deepEqual(w.backlog, [{ p_sweep: "playbooks", p_remaining: 0 }], "and nothing counted as left behind");
});

test("a moment the page calls due and the edge's clock does not is never run, said once as a warning, and moved to the back of the page with its day open: a zone the two read apart never holds the first places", async () => {
  // The page judged it in one zone and handed the sweep another: what the database and the edge would do with a name
  // they read apart (a POSIX string before 00245's safe_zone refused it).
  const w = world({
    people: { [A]: [person("c1")] },
    rpcs: { playbooks_due: (a, derived) => derived(a).map((r) => ({ ...r, timezone: CLOSED })) },
  });
  workspace(w.tables, A, OPEN, "auto");
  w.tables.playbooks.push(playbook(A, "pb-a"));

  const said = hear();
  let body;
  try {
    [, body] = await answer(await w.tick());
  } finally {
    said.restore();
  }
  assert.deepEqual(body, counts(), "not run, not counted as due");
  nothingMade(w);
  const [pb] = w.tables.playbooks;
  assert.equal(pb.last_run_for, null, "its day stays open");
  assert.ok(Date.parse(pb.last_run_at) > Date.now() - 60_000, "and it goes to the back of the page");
  const about = said.lines.filter((l) => l.event === "playbooks_page_not_due");
  assert.deepEqual(
    about.map((l) => [l.level, l.tenant_id, l.kind, l.count]),
    [["warn", A, "moment", 1]],
  );
});

test("a moment whose run failed is moved to the back of the page with its day open: a run that fails every hour never holds the first place", async () => {
  const w = world({
    people: { [A]: [person("c1")] },
    faults: { "templates.select": { message: "canceling statement due to statement timeout" } },
  });
  workspace(w.tables, A, OPEN, "auto");
  w.tables.playbooks.push(playbook(A, "pb-a", { last_run_at: iso(D) }));
  const [, body] = await answer(await w.tick());
  assert.deepEqual(body, counts({ tenants: 1, due: 1, failed: 1 }));
  const [pb] = w.tables.playbooks;
  assert.equal(pb.last_run_for, null, "its day stays open: the next hour tries it again");
  assert.ok(Date.parse(pb.last_run_at) > Date.now() - 60_000, "behind the moments that can run");
});

test("reach-out steps a tick that ran long never reached are counted as left behind, so the alarm hears a starved page", async () => {
  const w = world({ rpcs: coldRpcs([]) });
  coldWorkspace(w.tables, A, OPEN);
  for (let i = 0; i < 3; i += 1)
    w.tables.playbooks.push(reachOut(A, `ro-${String(i).padStart(2, "0")}`, { last_run_at: iso((i + 1) * H) }));
  // The clock jumps past the yield once the tick has begun: every later read of it is forty-one seconds on.
  const realNow = Date.now;
  let reads = 0;
  Date.now = () => realNow() + (reads++ === 0 ? 0 : REACH_OUT_YIELD_AT_MS + 1_000);
  let body;
  try {
    [, body] = await answer(await w.tick());
  } finally {
    Date.now = realNow;
  }
  assert.deepEqual([body.due, body.remaining], [0, 3], "none run, all three left behind");
  assert.deepEqual(
    w.backlog.map((b) => b.p_remaining),
    [3],
  );
});

/* ------------------------------------------------------- cannot be read */

test("playbooks that cannot be read are a 500 that says so, and nothing is noted: a database without the page's function included, so the edge deployed ahead of its migration is loud, never quiet", async () => {
  for (const refusal of [
    "permission denied for function playbooks_due",
    "Could not find the function public.playbooks_due(p_at, p_kind, p_last_hour, p_limit) in the schema cache",
  ]) {
    const w = world({
      people: { [A]: [person("c1")] },
      rpcs: {
        playbooks_due: () => {
          throw new Error(refusal);
        },
      },
    });
    workspace(w.tables, A, OPEN, "auto");
    w.tables.playbooks.push(playbook(A, "pb-a"));
    const said = hear();
    try {
      assert.deepEqual(await answer(await w.tick()), [500, { ok: false }]);
    } finally {
      said.restore();
    }
    const failed = said.lines.filter((l) => l.event === "playbooks_read_failed");
    assert.equal(failed.length, 1, refusal);
    assert.equal(failed[0].level, "error");
    assert.ok(failed[0].error.includes(refusal), "the database's own words");
    assert.deepEqual(w.backlog, []);
    nothingMade(w);
    assert.equal(w.tables.playbooks[0].last_run_for, null);
  }
});

test("a reach-out page that cannot be read is said, and the moments still run", async () => {
  const w = world({
    people: { [A]: [person("c1")] },
    rpcs: {
      playbooks_due: (a, ask) => {
        if (a.p_kind === "reach_out") throw new Error("permission denied for function playbooks_due");
        return ask(a);
      },
    },
  });
  workspace(w.tables, A, OPEN, "auto");
  w.tables.playbooks.push(playbook(A, "pb-a"));
  const said = hear();
  let status, body;
  try {
    [status, body] = await answer(await w.tick());
  } finally {
    said.restore();
  }
  assert.equal(status, 200);
  assert.deepEqual(body, counts({ tenants: 1, due: 1, sent: 1 }));
  const failed = said.lines.filter((l) => l.event === "reach_outs_read_failed");
  assert.deepEqual([failed.length, failed[0]?.level], [1, "error"], "said once, as an error");
  assert.deepEqual(w.backlog, [{ p_sweep: "playbooks", p_remaining: 0 }]);
});

/* ------------------------------------------------------------ reach-outs */

/** A reach-out's root (00183): a search's leads, a pace, on the playbooks clock at ten. */
const reachOut = (tenant, id, over = {}) =>
  playbook(tenant, id, {
    kind: "reach_out",
    name: "Movers in Austin",
    trigger: "lead_first",
    policy_class: "outreach",
    template_id: "tpl-reach",
    template_name: "reach_first",
    template_language: "en",
    params: [],
    lead_search_id: "search-1",
    after_playbook_id: null,
    after_days: null,
    gap_minutes: 12,
    domain_ids: [],
    ...over,
  });
/** A workspace that may send cold email: its outreach class at its default, a verified domain, and billing. */
function coldWorkspace(tables, id, tz, mode = "veto") {
  workspace(tables, id, tz, "auto");
  tables.policies.push({ ...tables.policies.at(-1), id: `pol-o-${id.slice(0, 8)}`, class: "outreach", mode });
  tables.billing_accounts.push({ tenant_id: id, mode: "direct", status: "active" });
  tables.sending_domains.push({
    id: `dom-${id.slice(0, 8)}`,
    tenant_id: id,
    host: "getharbor.example",
    state: "verified",
    clean_since: iso(20 * D),
  });
}
const coldRpcs = (leads) => ({
  reach_out_audience: () => leads,
  // 00185's door, as the database answers it: the run and its sends together, or {exists} for the step's day.
  reach_out_plan_run: (a) => {
    const t = latest.tables;
    if (
      t.broadcasts.some(
        (b) => b.id === a.p_run.id || (b.playbook_id === a.p_run.playbook_id && b.run_for === a.p_run.run_for),
      )
    )
      return { exists: true };
    t.broadcasts.push({ ...a.p_run });
    for (const x of a.p_sends)
      t.reach_out_sends.push({
        ...x,
        tenant_id: a.p_run.tenant_id,
        broadcast_id: a.p_run.id,
        playbook_id: a.p_run.playbook_id,
        root_id: a.p_run.audience.root_id,
      });
    return { id: a.p_run.id };
  },
  sending_domain_capacity: (a) => ({
    state: "verified",
    clean_since: iso(20 * D),
    sent_days: 0,
    used: 0,
    recent: [],
    last_sent_at: null,
    domain: a.p_domain_id,
  }),
});
const coldLead = (id) => ({
  lead_id: id,
  email: `${id}@fixture.example`,
  business_name: `Biz ${id}`,
  city: "Austin",
  region: "TX",
  hours: [],
});

test("a reach-out's first run waits for its owner: one pending run, its sends planned, the owner told, no broadcast job; the next tick that day makes nothing", async () => {
  const w = world({ rpcs: coldRpcs([coldLead("l1"), coldLead("l2"), coldLead("l3")]) });
  coldWorkspace(w.tables, A, OPEN);
  w.tables.playbooks.push(reachOut(A, R));
  const today = localDate(OPEN, new Date());

  const [status, body] = await answer(await w.tick());
  assert.equal(status, 200);
  assert.deepEqual(body, counts({ due: 1, held: 1 }));
  assert.equal(w.tables.broadcasts.length, 1);
  const run = w.tables.broadcasts[0];
  assert.deepEqual(
    [run.state, run.playbook_id, run.run_for, run.recipient_count, run.audience.kind, run.audience.root_id],
    ["pending_approval", R, today, 3, "reach_out", R],
  );
  assert.equal(w.tables.reach_out_sends.length, 3);
  for (const s of w.tables.reach_out_sends)
    assert.deepEqual([s.state, s.broadcast_id, s.root_id, s.domain_id], ["planned", run.id, R, `dom-${A.slice(0, 8)}`]);
  assert.deepEqual(w.tables.jobs, [], "no broadcast job: the reach-out clock claims its sends");
  assert.deepEqual(w.tables.broadcast_recipients, []);
  assert.equal(
    w.tables.notifications.filter((n) => n.route === "broadcasts").length,
    1,
    "its owner is told where to approve it",
  );
  assert.equal(w.tables.playbooks[0].last_run_for, today, "the step remembers the day");

  const [, again] = await answer(await w.tick());
  assert.deepEqual(again, counts({}), "not due again today");
  assert.equal(w.tables.broadcasts.length, 1);
});

test("a paused reach-out, a workspace whose class is never, or one that may not spend makes no run", async () => {
  for (const setup of [
    (t) => (t.playbooks[0].state = "paused"),
    (t) => (t.policies.find((p) => p.class === "outreach").mode = "never"),
    (t) => (t.billing_accounts[0] = { tenant_id: A, mode: "stripe", status: "canceled" }),
  ]) {
    const w = world({ rpcs: coldRpcs([coldLead("l1")]) });
    coldWorkspace(w.tables, A, OPEN);
    w.tables.playbooks.push(reachOut(A, R));
    setup(w.tables);
    const [status] = await answer(await w.tick());
    assert.equal(status, 200);
    assert.deepEqual([w.tables.broadcasts, w.tables.reach_out_sends], [[], []], String(setup));
  }
});

test("a moment and a reach-out in one workspace each run through their own verb: the moment's broadcast job, the reach-out's planned sends", async () => {
  const w = world({ people: { [A]: [person("c1")] }, rpcs: coldRpcs([coldLead("l1")]) });
  coldWorkspace(w.tables, A, OPEN);
  w.tables.playbooks.push(playbook(A, P), reachOut(A, R));
  const [, body] = await answer(await w.tick());
  assert.deepEqual(body, counts({ tenants: 1, due: 2, sent: 1, held: 1 }));
  const byPlaybook = Object.fromEntries(w.tables.broadcasts.map((b) => [b.playbook_id, b]));
  assert.equal(byPlaybook[P].state, "scheduled");
  assert.equal(byPlaybook[R].state, "pending_approval");
  assert.deepEqual(
    w.tables.jobs.map((j) => j.payload.broadcast_id),
    [byPlaybook[P].id],
    "one send job, the moment's",
  );
  assert.equal(w.tables.reach_out_sends.length, 1);
});

test("a reach-out that cannot run moves to the back of the page and keeps its day open; the steps behind it run, and the alarm counts both pages", async () => {
  // Its workspace paused after the page was read: the step is on the page, and its run finds the pause.
  const w = world({ rpcs: { ...coldRpcs([coldLead("l1")]), playbooks_due: readBeforeThePause } });
  // A paused workspace's step, never run: it sorts first.
  coldWorkspace(w.tables, A, OPEN);
  w.tables.tenants[0].status = "paused";
  w.tables.playbooks.push(reachOut(A, R, { last_run_at: null }));
  // A healthy workspace's step, run yesterday: it sorts after.
  const B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  coldWorkspace(w.tables, B, OPEN);
  w.tables.playbooks.push(reachOut(B, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", { last_run_at: iso(D) }));
  const [, body] = await answer(await w.tick());
  assert.deepEqual([body.off, body.held], [1, 1], "the paused one off, the healthy one waiting for its owner");
  const paused = w.tables.playbooks.find((p) => p.id === R);
  assert.equal(paused.last_run_for, null, "its day stays open");
  assert.ok(Date.parse(paused.last_run_at) > Date.now() - 60_000, "but it goes to the back of the page");
});

test("a paused workspace's reach-out steps hold no place in the reach-out page either: twenty-six of them, and the one due in a sound workspace runs and nothing is left behind", async () => {
  const w = world({ rpcs: coldRpcs([coldLead("l1")]) });
  coldWorkspace(w.tables, A, OPEN);
  w.tables.tenants[0].status = "paused";
  for (let i = 0; i < PLAYBOOKS_PER_TICK + 1; i += 1)
    w.tables.playbooks.push(reachOut(A, `ro-${String(i).padStart(2, "0")}`, { last_run_at: null }));
  const B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  coldWorkspace(w.tables, B, OPEN);
  w.tables.playbooks.push(reachOut(B, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", { last_run_at: iso(D) }));
  const [, body] = await answer(await w.tick());
  assert.deepEqual([body.due, body.off, body.held, body.remaining], [1, 0, 1, 0]);
  assert.deepEqual(
    w.backlog.map((b) => b.p_remaining),
    [0],
  );
});

test("what the reach-out page could not reach is noted with the moments': starved reach-outs can raise the alarm", async () => {
  const w = world({ rpcs: coldRpcs([]) });
  // Twenty-six due steps with no leads to plan: the page takes twenty-five, and the twenty-sixth is what is left.
  coldWorkspace(w.tables, A, OPEN);
  for (let i = 0; i < PLAYBOOKS_PER_TICK + 1; i += 1)
    w.tables.playbooks.push(reachOut(A, `ro-${String(i).padStart(2, "0")}`, { last_run_at: iso((i + 1) * H) }));
  const [, body] = await answer(await w.tick());
  assert.deepEqual([body.due, body.remaining], [PLAYBOOKS_PER_TICK, 1]);
  assert.deepEqual(
    w.backlog.map((b) => b.p_remaining),
    [1],
  );
});

test("the reach-out page is only what is due: twenty-five steps that ran today hold no place and are not counted, and the one due behind them runs now", async () => {
  const w = world({ rpcs: coldRpcs([coldLead("l1")]) });
  coldWorkspace(w.tables, A, OPEN);
  const today = localDate(OPEN, new Date());
  for (let i = 0; i < PLAYBOOKS_PER_TICK; i += 1)
    w.tables.playbooks.push(
      reachOut(A, `ro-ran-${String(i).padStart(2, "0")}`, { last_run_for: today, last_run_at: iso((i + 1) * H) }),
    );
  w.tables.playbooks.push(reachOut(A, R, { last_run_at: iso(3 * D) }));
  const [status, body] = await answer(await w.tick());
  assert.equal(status, 200);
  assert.deepEqual(body, counts({ due: 1, held: 1 }), "the due step ran (its first run waits for its owner)");
  assert.equal(w.tables.broadcasts.length, 1);
  assert.equal(w.tables.broadcasts[0].playbook_id, R);
  assert.deepEqual(w.backlog, [{ p_sweep: "playbooks", p_remaining: 0 }], "twenty-six running steps, none left behind");
});

test("a veto run goes on the record: the system's decision under the mode its owner chose, and the run's event", async () => {
  const w = world({ rpcs: coldRpcs([coldLead("l1")]) });
  coldWorkspace(w.tables, A, OPEN);
  w.tables.playbooks.push(reachOut(A, R));
  // A run of the chain already went ahead: this one is not asked.
  w.tables.broadcasts.push({
    id: "prior-run",
    tenant_id: A,
    playbook_id: R,
    run_for: "2026-01-01",
    state: "sent",
    audience: { kind: "reach_out", root_id: R },
  });
  const [, body] = await answer(await w.tick());
  assert.equal(body.sent, 1);
  const run = w.tables.broadcasts.find((b) => b.id !== "prior-run");
  assert.equal(run.state, "scheduled");
  assert.deepEqual(
    w.tables.decisions.map((d) => [d.subject_id, d.verb, d.actor_type, d.payload.reach_out]),
    [[run.id, "send_broadcast", "system", true]],
  );
  assert.ok(w.tables.events.some((e) => e.kind === "playbook.run" && e.subject_id === R));
  assert.deepEqual(
    w.tables.notifications.filter((n) => n.route === "broadcasts"),
    [],
    "nobody is asked",
  );
});
