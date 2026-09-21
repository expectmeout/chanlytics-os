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
import { fakeDb } from "./_fake-db.mjs";
import { at, knock, answer, refusedAtTheDoor, vault } from "./_cron-doors-world.mjs";

for (const k of ["WHATSAPP_PHONE_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "LEAD_TO", "LEAD_FROM"]) delete process.env[k];

const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { POST } = await import(at("apps/edge/api/cron/playbooks.ts"));
const { PLAYBOOKS_PER_TICK } = await import(at("apps/edge/lib/sweep-rotation.ts"));
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
  id, display_name: `Person ${id}`, wa_profile_name: null, phone_e164: `+130555501${id.replace(/\D/g, "").padStart(2, "0")}`,
  consent: "opted_in", consent_source: "keyword", consent_updated_at: iso(60 * D), dnc: false,
  marketing_consent: "opted_in", marketing_consent_source: "customer_message", marketing_consent_updated_at: iso(60 * D),
  channels: ["whatsapp"], conversation_count: 1, escalation_count: 0, needs_human: false, open_escalation_reason: null, open_escalation_since: null,
  latest_conversation_id: `cv-${id}`, latest_state: "open", latest_paused_until: null, latest_assignee_user_id: null, latest_snooze_until: null,
  latest_wa_inbound_at: iso(40 * D), last_message_at: iso(40 * D), last_message_direction: "inbound", last_message_sender: "customer",
  last_inbound_text: "thanks!", last_inbound_at: iso(40 * D), last_call_at: null, last_inbound_call_at: null, last_inbound_call_summary: null,
  call_count: 0, call_seconds: 0, first_contact_at: iso(90 * D), earliest_row_at: iso(90 * D), has_backfill: false, has_chat: true, queued_reply_at: null,
  effective_reply_mode: "auto", visits: null, ...over,
});
/** The Win-back playbook as its row reads: daily at ten, running, never run. */
const playbook = (tenant, id, over = {}) => ({
  id, tenant_id: tenant, name: "Win-back", trigger: "quiet_30", template_id: "tpl-winback", template_name: "winback_offer", template_language: "en_US",
  params: [{ kind: "first_name" }], policy_class: "reengage", state: "running", run_hour: 10, cap_per_run: 25, gap_days: 90, cadence_days: 30,
  created_by: "owner-1", last_run_for: null, last_run_at: null, created_at: iso(30 * D), updated_at: iso(30 * D), ...over,
});

/* -------------------------------------------------------------- the world */

function world({ people = {}, ticks = 1, faults = {} } = {}) {
  const tables = {
    tenants: [], tenant_config: [], tenant_channels: [], policies: [], templates: [], playbooks: [],
    broadcasts: [], broadcast_recipients: [], jobs: [], decisions: [], events: [], notifications: [],
  };
  const backlog = [];
  const db = fakeDb(tables, faults, {
    ...vault,
    people_list: (a) => people[a.p_tenant_id] ?? [],
    note_sweep_backlog: (a) => { backlog.push(a); return ticks; },
  });
  setPg(db);
  return { db, tables, backlog, tick: () => knock(POST, "playbooks") };
}
/** A workspace on the clock `tz`, with a number that may send, a template Meta approved, and the win-back class set to `mode`. */
function workspace(tables, id, tz, mode, status = "active") {
  tables.tenants.push({ id, name: `Workspace ${id.slice(0, 8)}`, timezone: tz, status });
  tables.tenant_config.push({ tenant_id: id, config: {} });
  tables.tenant_channels.push({ tenant_id: id, kind: "whatsapp", status: "active", external_id: `wa-${id.slice(0, 8)}`, config: { quality_rating: "GREEN", messaging_limit: "TIER_1K" } });
  tables.policies.push({ id: `pol-${id.slice(0, 8)}`, tenant_id: id, class: "reengage", mode, subject_type: null, subject_id: null, limits: {}, updated_at: iso(0) });
  tables.templates.push({ tenant_id: id, channel: "whatsapp", name: "winback_offer", language: "en_US", meta_status: "approved" });
}
const nothingMade = (w) => assert.deepEqual(
  [w.tables.broadcasts, w.tables.broadcast_recipients, w.tables.jobs, w.tables.decisions],
  [[], [], [], []],
  "no run, no recipients, no send job, no decision",
);
const counts = (over) => ({ ok: true, tenants: 0, due: 0, sent: 0, held: 0, empty: 0, off: 0, failed: 0, remaining: 0, ...over });

/** What the route says while it runs, as one line per event: the log is the only place a quiet skip is visible. */
function hear() {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  const keep = (channel) => (...args) => {
    for (const a of args) {
      try {
        const o = JSON.parse(String(a));
        if (o && typeof o === "object" && o.event) lines.push({ channel, ...o });
      } catch { /* not one of the logger's lines */ }
    }
  };
  console.log = keep("log"); console.warn = keep("warn"); console.error = keep("error");
  return { lines, restore: () => { console.log = real.log; console.warn = real.warn; console.error = real.error; } };
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
  assert.deepEqual(run.audience, { kind: "playbook", id: "pb-a", label: "Win-back", reach: { pool: 3, will: 2, noNumber: 0, stopped: 0, noYes: 1, heardThis: 0, heardAny: 0, overCap: 0, overLimit: 0 } });
  assert.equal(run.recipient_count, 2);
  assert.equal(run.created_by, "owner-1", "the sweep's run is the playbook's owner's");
  assert.deepEqual(w.tables.broadcast_recipients.map((r) => r.contact_id).sort(), ["c1", "c2"], "the one who said no to offers is not on it");
  assert.ok(w.tables.broadcast_recipients.every((r) => r.broadcast_id === run.id && r.tenant_id === A), "every recipient row names the run and the workspace");
  assert.deepEqual(w.tables.jobs.map((j) => [j.tenant_id, j.kind, j.payload, j.due_at]), [[A, "broadcast_send", { broadcast_id: run.id }, run.scheduled_for]], "the send is on the ledger, due when the run is");
  assert.deepEqual(w.tables.decisions.map((d) => [d.verb, d.actor_type, d.actor_user_id, d.subject_type, d.subject_id]), [["send_broadcast", "system", null, "broadcast", run.id]], "the system's decision, under the mode the owner chose");
  assert.deepEqual([w.tables.decisions[0].payload.mode, w.tables.decisions[0].payload.recipients, w.tables.decisions[0].payload.run_now], ["auto", 2, false]);
  assert.deepEqual(w.tables.events.map((e) => [e.tenant_id, e.kind, e.subject_type, e.subject_id, e.data.broadcast_id, e.data.by]), [[A, "playbook.run", "playbook", "pb-a", run.id, "system"]], "every run is recorded");
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

test("a paused workspace is counted off and said once, quietly: nothing is made, nothing is scheduled, the playbook is not marked as run, one info line names it", async () => {
  const w = world({ people: { [P]: [person("c1")] } });
  workspace(w.tables, P, OPEN, "auto", "paused");
  w.tables.playbooks.push(playbook(P, "pb-p"));

  const said = hear();
  let status, body;
  try {
    [status, body] = await answer(await w.tick());
  } finally { said.restore(); }
  assert.equal(status, 200);
  assert.deepEqual(body, counts({ tenants: 1, due: 1, off: 1 }), "due, and counted off");
  nothingMade(w);
  assert.deepEqual(w.tables.events, [], "no run recorded: there was none");
  assert.equal(w.tables.playbooks[0].last_run_for, null, "not marked as run, so it runs the day billing resumes");

  const about = said.lines.filter((l) => l.event === "playbooks_skip_paused");
  assert.equal(about.length, 1, "said once");
  assert.deepEqual([about[0].level, about[0].channel], ["info", "log"], "quietly");
  assert.deepEqual([about[0].sweep, about[0].tenant_id, about[0].due], ["playbooks", P, 1]);
  assert.ok(!said.lines.some((l) => l.level !== "info" && l.tenant_id === P), "no warning, no error: a paused workspace is a fact, not a fault");
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
    w.tables.playbooks.push(playbook(R, `pb-${String(i).padStart(2, "0")}`, { last_run_at: i < 2 ? null : iso((N - i) * H) }));
  }
  const today = localDate(OPEN, new Date());

  const [status, body] = await answer(await w.tick());
  assert.equal(status, 200);
  assert.deepEqual(body, counts({ tenants: 1, due: PLAYBOOKS_PER_TICK, off: PLAYBOOKS_PER_TICK, remaining: 2 }));
  const ran = w.tables.playbooks.filter((p) => p.last_run_for === today).map((p) => p.id);
  const waited = w.tables.playbooks.filter((p) => p.last_run_for !== today).map((p) => p.id);
  assert.equal(ran.length, PLAYBOOKS_PER_TICK);
  assert.deepEqual(waited, ["pb-25", "pb-26"], "the two that ran most recently wait; the never-run and the oldest went first");
  assert.equal(w.tables.events.filter((e) => e.kind === "playbook.run").length, PLAYBOOKS_PER_TICK, "every run is recorded, a run that sent nothing included");
  assert.ok(w.tables.events.every((e) => e.data.skipped === "never"));
  nothingMade(w);
  assert.deepEqual(w.backlog, [{ p_sweep: "playbooks", p_remaining: 2 }], "what it could not reach, noted");
  assert.equal(w.db.seen.filter((s) => s.rpc === "people_list").length, 1, "the workspace is read once, not once per playbook");
});

test("by the business's clock: in the middle of the night nothing is due and the workspace is not even read; three ticks in a row with work left behind, and the sweep says so with a 503", async () => {
  const w = world({ people: { [R]: [person("c1")] }, ticks: 3 });
  workspace(w.tables, R, CLOSED, "auto");
  for (let i = 0; i < PLAYBOOKS_PER_TICK + 2; i++) w.tables.playbooks.push(playbook(R, `pb-${String(i).padStart(2, "0")}`));

  const [status, body] = await answer(await w.tick());
  assert.equal(status, 503, "sweep_health turns this red and mails the platform");
  assert.deepEqual(body, { ...counts({ remaining: 2 }), ok: false, error: "playbooks_backlog", backlog_ticks: 3 });
  assert.ok(!w.db.seen.some((s) => s.rpc === "people_list"), "not due: the workspace is not read");
  nothingMade(w);
  assert.ok(w.tables.playbooks.every((p) => p.last_run_for === null));
  assert.deepEqual(w.backlog, [{ p_sweep: "playbooks", p_remaining: 2 }]);
});

/* ------------------------------------------------------- cannot be read */

test("playbooks that cannot be read are a 500, and nothing is noted", async () => {
  const w = world({ faults: { "playbooks.select": { message: "permission denied for table playbooks" } } });
  assert.deepEqual(await answer(await w.tick()), [500, { ok: false }]);
  assert.deepEqual(w.backlog, []);
  nothingMade(w);
});
