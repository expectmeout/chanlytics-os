/**
 * The run-now door, run: POST /api/admin/playbooks-run over a database in
 * memory. Until 13 Sep 2026 its text was pinned by one assertion in
 * playbooks.test.mjs and its POST had never been called.
 *
 * "Run now" on the Playbooks page: one playbook, run at a person's request,
 * through the same implementation the hourly sweep uses (lib/playbooks.ts
 * over core's run-playbook). What differs is who decided. The sweep runs a
 * due playbook under the class's autonomy mode -- `ask` holds the run for a
 * person -- but a person who presses Run now HAS decided, so the run sends
 * now whatever the mode, unless the class is set to never. The ledger names
 * them, the run is theirs, and one run per local day still holds: a second
 * press the same day says so and makes nothing twice.
 *
 * Executed here: the knock (a token for THIS door, a body that may not name
 * another workspace than the token); the run of the named playbook for the
 * named workspace only; a person's run under `ask` sending now, with every
 * row it leaves -- the broadcast, its people, the send job, the person's
 * decision, the event, the day remembered; what makes a run off -- already
 * ran today, the class set to never, a template Meta has not approved, a
 * flagged number, nobody eligible; and the paths that name a fault.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken } from "@chanlytics/channels";
import { localDate } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { withoutRequestId } from "../_log-lines.mjs";

// Each test file is its own process: this is the whole environment. No
// mailbox, so a run nobody is told about tells nobody; no Supabase
// credentials, so `setPg(null)` really is no database.
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
for (const k of [
  "DIAG_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "WHATSAPP_PHONE_ID",
  "RESEND_API_KEY",
  "LEAD_TO",
  "LEAD_FROM",
])
  delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const door = await import(at("apps/edge/api/admin/playbooks-run.ts"));
after(() => setPg(null));

const AUD = "/api/admin/playbooks-run";
/** Harbor Moving: the workspace every token below is about. */
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
/** Another workspace, whose playbooks a token about A must never run. */
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
/** The person who pressed Run now. */
const U = "11111111-1111-4111-8111-111111111111";
/** A's Win-back, and B's. */
const P = "22222222-2222-4222-8222-222222222222";
const PB = "33333333-3333-4333-8333-333333333333";
const TZ = "America/New_York";
const KEY = "diag-key-for-this-file";
const D = 86_400_000;
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
/**
 * Eleven in the morning on New York's clock. A person's Run now sends at once
 * only inside PLAYBOOK_HOURS, nine to eight by the business's clock; past them
 * it waits for nine (#459). A test that asserts the send is due now freezes
 * Date here, or it fails every night CI runs after eight in New York.
 */
const IN_HOURS = Date.parse("2026-09-11T15:00:00Z");

/* ------------------------------- the knock -------------------------------- */

const token = (o = {}) =>
  signEdgeToken(o.secret ?? process.env.EDGE_CALL_SECRET, o.aud ?? AUD, {
    workspace: "workspace" in o ? o.workspace : A,
    user: "user" in o ? o.user : U,
  });
const knock = (body, headers = { "x-edge-token": token() }) =>
  door.POST(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
const answer = async (res) => [res.status, await res.json()];
const press = { playbook_id: P, user_id: U };

/** Set variables for one call and put every one of them back afterwards; `undefined` unsets. */
async function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}
/** The edge before it has the secret: the key decides, and a key holder is about no workspace. */
const keyed = (fn) => withEnv({ EDGE_CALL_SECRET: undefined, DIAG_KEY: KEY }, fn);

/* -------------------------------- the world ------------------------------- */

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
/** The Win-back playbook as its row reads: daily at ten, running, never run, made by the owner. */
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

function world({ people = {}, faults = {} } = {}) {
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
  };
  const db = fakeDb(tables, faults, { people_list: (a) => people[a.p_tenant_id] ?? [] });
  setPg(db);
  return { db, tables, peopleRead: () => db.seen.filter((s) => s.rpc === "people_list").map((s) => s.args) };
}
/** A workspace on New York's clock, with a number that may send, a template Meta approved, and the win-back class set to `mode`. */
function workspace(tables, id, mode, over = {}) {
  tables.tenants.push({ id, name: `Workspace ${id.slice(0, 8)}`, timezone: TZ, status: "active", ...over });
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
const nothingMade = (tables, why = "no run, no recipients, no send job, no decision") =>
  assert.deepEqual(
    [tables.broadcasts, tables.broadcast_recipients, tables.jobs, tables.decisions],
    [[], [], [], []],
    why,
  );

/* --------------------------------- the door ------------------------------- */

test("the door: a token for another door, a forgery and no credential are 403 before anything is read; a body naming another workspace than the token is refused; ids that are not ids are a 400; no database is a 503", async () => {
  const w = world();
  assert.deepEqual(
    await answer(await knock(press, { "x-edge-token": token({ aud: "/api/admin/whisper" }) })),
    [403, { ok: false, error: "token_audience" }],
    "a token for another door opens nothing here",
  );
  assert.deepEqual(await answer(await knock(press, { "x-edge-token": token({ secret: "not-the-secret" }) })), [
    403,
    { ok: false, error: "token_signature" },
  ]);
  assert.deepEqual(await answer(await knock(press, {})), [403, { ok: false }]);
  assert.deepEqual(
    await answer(await knock(press, { "x-edge-token": "garbage", "x-diag-key": KEY })),
    [403, { ok: false, error: "token_malformed" }],
    "no falling back from a bad token to a key",
  );
  assert.deepEqual(
    await answer(await knock({ ...press, tenant_id: B })),
    [403, { ok: false, error: "workspace_mismatch" }],
    "a token about A may not run B's playbooks",
  );
  for (const bad of [{}, { user_id: U }, { playbook_id: "win-back", user_id: U }, "not json"]) {
    assert.deepEqual(await answer(await knock(bad)), [400, { ok: false, error: "bad_request" }], JSON.stringify(bad));
  }
  // The token's person is who runs it: a body that names none is fine, and a token about no person leaves the body to
  // say who, so a body that names none (or names one that is not an id) is refused.
  for (const bad of [{ playbook_id: P }, { playbook_id: P, user_id: "ada" }])
    assert.deepEqual(await answer(await knock(bad, { "x-edge-token": token({ user: null }) })), [
      400,
      { ok: false, error: "bad_request" },
    ]);
  await keyed(async () => {
    assert.deepEqual(await answer(await knock(press, { "x-diag-key": "not-the-key" })), [403, { ok: false }]);
    assert.deepEqual(
      await answer(await knock(press, { "x-diag-key": KEY })),
      [400, { ok: false, error: "bad_request" }],
      "a key holder is about no workspace: the body must name one",
    );
  });
  assert.equal(w.db.seen.length, 0, "nothing was read for any of it");
  setPg(null);
  assert.deepEqual(await answer(await knock(press)), [503, { ok: false, error: "no_database" }]);
});

test("the named playbook of the named workspace only: another workspace's playbook does not exist as far as this token can see, and its workspace is not even read; a key holder naming that workspace runs it, as B's", async () => {
  const w = world({ people: { [A]: [person("a1")], [B]: [person("b1")] } });
  workspace(w.tables, A, "auto");
  workspace(w.tables, B, "auto");
  w.tables.playbooks.push(playbook(A, P), playbook(B, PB));

  assert.deepEqual(await answer(await knock({ playbook_id: PB, user_id: U })), [
    404,
    { ok: false, error: "not_found" },
  ]);
  assert.deepEqual(
    await answer(await knock({ playbook_id: PB, user_id: U, tenant_id: A })),
    [404, { ok: false, error: "not_found" }],
    "naming our own workspace beside their playbook changes nothing",
  );
  assert.deepEqual(
    await answer(await knock({ playbook_id: "44444444-4444-4444-8444-444444444444", user_id: U })),
    [404, { ok: false, error: "not_found" }],
    "nor does a playbook nobody has",
  );
  nothingMade(w.tables);
  assert.deepEqual(w.peopleRead(), [], "the workspace is read for a run, never for a refusal");
  assert.deepEqual(
    w.tables.playbooks.map((p) => p.last_run_for),
    [null, null],
  );
  assert.deepEqual(w.tables.events, []);

  await keyed(async () => {
    const [status, body] = await answer(
      await knock({ tenant_id: B, playbook_id: PB, user_id: U }, { "x-diag-key": KEY }),
    );
    assert.equal(status, 200, JSON.stringify(body));
    assert.deepEqual([body.ok, body.outcome, body.eligible, body.mode], [true, "sent", 1, "auto"]);
  });
  assert.deepEqual(
    w.tables.broadcasts.map((b) => [b.tenant_id, b.playbook_id, b.created_by]),
    [[B, PB, U]],
    "B's run, under B, the person's",
  );
  assert.deepEqual(
    w.tables.broadcast_recipients.map((r) => [r.tenant_id, r.contact_id]),
    [[B, "b1"]],
  );
  assert.deepEqual(
    w.tables.jobs.map((j) => [j.tenant_id, j.kind]),
    [[B, "broadcast_send"]],
  );
  assert.deepEqual(w.peopleRead(), [{ p_tenant_id: B }], "B's people, read once");
  assert.deepEqual(
    w.tables.playbooks.map((p) => [p.id, p.last_run_for === null]),
    [
      [P, true],
      [PB, false],
    ],
    "A's playbook is untouched",
  );
});

/* --------------------------------- the run -------------------------------- */

test("a person's run sends now under `ask` -- the sweep would have held it -- and leaves every row: the scheduled broadcast for the people who said yes, its send job due now, the person's own decision, the event, the day remembered; a second press the same day says so and makes nothing twice", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: IN_HOURS });
  const w = world({ people: { [A]: [person("c1"), person("c2"), person("c3", { marketing_consent: "opted_out" })] } });
  workspace(w.tables, A, "ask");
  w.tables.playbooks.push(playbook(A, P));
  const today = localDate(TZ, new Date());
  const t0 = Date.now();

  const [status, body] = await answer(await knock(press));
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(w.tables.broadcasts.length, 1, "one run");
  const run = w.tables.broadcasts[0];
  assert.deepEqual(
    body,
    {
      ok: true,
      outcome: "sent",
      broadcast_id: run.id,
      eligible: 2,
      mode: "ask",
      state: "scheduled",
      scheduled_for: run.scheduled_for,
      moved_from: null,
    },
    "sent, not held: the person decided, and is told when it goes",
  );
  assert.equal(run.tenant_id, A);
  assert.equal(run.playbook_id, P);
  assert.equal(run.run_for, today, "the run is for the business's own day");
  assert.equal(run.state, "scheduled");
  assert.ok(
    Date.parse(run.scheduled_for) >= t0 && Date.parse(run.scheduled_for) <= Date.now(),
    "now: not the veto's half hour, not the ask's wait",
  );
  assert.equal(run.name, `Win-back · ${today}`);
  // Who the moment named and why the rest were left out, stored with the run: Run now keeps it as the sweep does.
  assert.deepEqual(run.audience, {
    kind: "playbook",
    id: P,
    label: "Win-back",
    reach: { pool: 3, will: 2, noNumber: 0, stopped: 0, noYes: 1, heardThis: 0, heardAny: 0, overCap: 0, overLimit: 0 },
  });
  assert.deepEqual(run.params, [{ kind: "first_name" }]);
  assert.equal(run.recipient_count, 2);
  assert.equal(run.created_by, U, "the person who asked, not the playbook's owner");
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
    w.tables.decisions.map((d) => [d.tenant_id, d.verb, d.actor_type, d.actor_user_id, d.subject_type, d.subject_id]),
    [[A, "send_broadcast", "user", U, "broadcast", run.id]],
    "the ledger names the person",
  );
  assert.deepEqual(
    w.tables.decisions[0].payload,
    {
      playbook_id: P,
      playbook: "Win-back",
      mode: "ask",
      recipients: 2,
      scheduled_for: run.scheduled_for,
      run_now: true,
    },
    "and says it was a Run now under the mode the owner chose",
  );
  assert.deepEqual(
    w.tables.events.map((e) => [e.tenant_id, e.kind, e.category, e.subject_type, e.subject_id, e.data]),
    [
      [
        A,
        "playbook.run",
        "message",
        "playbook",
        P,
        {
          run_for: today,
          by: "user",
          mode: "ask",
          eligible: 2,
          reach: {
            pool: 3,
            will: 2,
            noNumber: 0,
            stopped: 0,
            noYes: 1,
            heardThis: 0,
            heardAny: 0,
            overCap: 0,
            overLimit: 0,
          },
          broadcast_id: run.id,
          state: "scheduled",
        },
      ],
    ],
    "every run is recorded, and this one says a person asked",
  );
  assert.equal(w.tables.playbooks[0].last_run_for, today, "the playbook remembers the day");
  assert.ok(Date.parse(w.tables.playbooks[0].last_run_at) >= t0, "and when");
  assert.deepEqual(w.tables.notifications, [], "nothing to approve, so nobody is told to");
  assert.deepEqual(w.peopleRead(), [{ p_tenant_id: A }], "the workspace is read once");

  // The same day again: one run per playbook per local day.
  const [again, second] = await answer(await knock(press));
  assert.deepEqual([again, second], [200, { ok: true, outcome: "off", mode: "ask", skipped: "already_ran_today" }]);
  assert.deepEqual(
    [w.tables.broadcasts.length, w.tables.jobs.length, w.tables.decisions.length, w.tables.events.length],
    [1, 1, 1, 1],
    "nothing made twice, and a second ask is not a second run on the ledger",
  );
});

test("the class set to never: a person's press runs nothing and says so; the run is still recorded -- an event with the reason, the day remembered -- so the page can say why", async () => {
  const w = world({ people: { [A]: [person("c1")] } });
  workspace(w.tables, A, "never");
  w.tables.playbooks.push(playbook(A, P));
  const today = localDate(TZ, new Date());
  assert.deepEqual(await answer(await knock(press)), [
    200,
    { ok: true, outcome: "off", mode: "never", skipped: "never" },
  ]);
  nothingMade(w.tables);
  assert.deepEqual(
    w.tables.events.map((e) => [e.kind, e.subject_id, e.data]),
    [["playbook.run", P, { run_for: today, by: "user", mode: "never", skipped: "never" }]],
  );
  assert.equal(
    w.tables.playbooks[0].last_run_for,
    today,
    "a run that was off still takes the day: the sweep will run nothing for it later either",
  );
  assert.deepEqual(
    w.peopleRead(),
    [{ p_tenant_id: A }],
    "the mode is read with the rest of the workspace, so the people are read even for a run that is off",
  );
});

test("what else makes a person's run off, each recorded with its reason: a template Meta has not approved, a number WhatsApp flagged, nobody eligible; a paused workspace and a database that refuses are 500s that name themselves", async () => {
  const today = localDate(TZ, new Date());
  const off = (w, skipped) => {
    nothingMade(w.tables, skipped);
    assert.deepEqual(
      w.tables.events.map((e) => [e.kind, e.data.by, e.data.skipped ?? e.data.eligible]),
      [["playbook.run", "user", skipped]],
    );
    assert.equal(w.tables.playbooks[0].last_run_for, today);
  };

  let w = world({ people: { [A]: [person("c1")] } });
  workspace(w.tables, A, "auto");
  w.tables.templates[0].meta_status = "pending";
  w.tables.playbooks.push(playbook(A, P));
  assert.deepEqual(
    await answer(await knock(press)),
    [200, { ok: true, outcome: "off", mode: "auto", skipped: "template_not_approved" }],
    "the template must still be what Meta approved",
  );
  off(w, "template_not_approved");

  w = world({ people: { [A]: [person("c1")] } });
  workspace(w.tables, A, "auto");
  w.tables.tenant_channels[0].config = { quality_rating: "RED", messaging_limit: "TIER_1K" };
  w.tables.playbooks.push(playbook(A, P));
  assert.deepEqual(
    await answer(await knock(press)),
    [200, { ok: true, outcome: "off", mode: "auto", skipped: "number_flagged" }],
    "the number must be one Meta lets send",
  );
  off(w, "number_flagged");

  w = world({
    people: { [A]: [person("c1", { marketing_consent: "opted_out" }), person("c2", { marketing_consent: "unknown" })] },
  });
  workspace(w.tables, A, "auto");
  w.tables.playbooks.push(playbook(A, P));
  assert.deepEqual(
    await answer(await knock(press)),
    [200, { ok: true, outcome: "empty", eligible: 0, mode: "auto" }],
    "nobody said yes to offers: a run that found nobody",
  );
  off(w, 0);

  w = world({ people: { [A]: [person("c1")] } });
  workspace(w.tables, A, "auto", { status: "paused" });
  w.tables.playbooks.push(playbook(A, P));
  assert.deepEqual(
    await answer(await knock(press)),
    [500, { ok: false, error: "context_failed", detail: "paused" }],
    "billing paused the workspace: the context refuses before the run",
  );
  nothingMade(w.tables);
  assert.deepEqual(w.tables.events, [], "no run recorded: there was none");
  assert.equal(w.tables.playbooks[0].last_run_for, null, "not marked as run, so it runs the day billing resumes");

  w = world({ faults: { "playbooks.select": { message: "permission denied for table playbooks" } } });
  workspace(w.tables, A, "auto");
  assert.deepEqual(await answer(await knock(press)), [
    500,
    { ok: false, error: "read_failed", detail: "permission denied for table playbooks" },
  ]);
  assert.deepEqual(w.peopleRead(), [], "a playbook that cannot be read is answered before the workspace is");

  w = world({ people: { [A]: [person("c1")] }, faults: { "broadcasts.insert": { message: "connection reset" } } });
  workspace(w.tables, A, "auto");
  w.tables.playbooks.push(playbook(A, P));
  assert.deepEqual(
    await answer(await knock(press)),
    [500, { ok: false, error: "run_failed", detail: "connection reset" }],
    "the ledger refused the run: the reason travels",
  );
  nothingMade(w.tables, "no row, so no recipients, no job, no decision");
  assert.deepEqual(w.tables.events, [], "a failed run is not recorded as one");
  assert.equal(w.tables.playbooks[0].last_run_for, null, "and does not take the day: the next press may succeed");
});

test("a proposal follow-up (0006): where deals are on, a run reaches the proposal waiting past the workspace's pace, with its link frozen on the recipient; where they are off it is off and says why", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: IN_HOURS });
  const out = (id, daysOut, over = {}) =>
    person(id, {
      deal_id: `deal-${id}`,
      deal_stage: "proposed",
      deal_proposed_at: iso(daysOut * D),
      deal_proposal_url: `https://docs.example.com/proposal/${id}`,
      ...over,
    });
  const followUp = () =>
    playbook(A, P, {
      name: "Proposal follow-up",
      trigger: "proposal_waiting",
      template_id: "tpl-follow",
      template_name: "proposal_follow_up",
      params: [{ kind: "first_name" }, { kind: "business_name" }, { kind: "proposal_link" }],
      policy_class: "follow_up",
    });
  // Five yeses that took twelve days each: the workspace's pace, so a proposal waits fourteen days before its nudge.
  const yeses = Array.from({ length: 5 }, (_, i) => ({
    id: `yes-${i}`,
    tenant_id: A,
    contact_id: `z${i}`,
    stage: "won",
    proposed_at: iso((40 + i) * D),
    decided_at: iso((28 + i) * D),
  }));
  const people = [out("c1", 20), out("c2", 10), out("c3", 20, { deal_proposal_url: null })];
  const set = (w, sellsBy) => {
    workspace(w.tables, A, "ask", { sells_by: sellsBy });
    w.tables.templates.push({
      tenant_id: A,
      channel: "whatsapp",
      name: "proposal_follow_up",
      language: "en_US",
      meta_status: "approved",
    });
    w.tables.deals = yeses.map((y) => ({ ...y }));
    w.tables.playbooks.push(followUp());
  };

  let w = world({ people: { [A]: people } });
  set(w, "proposal");
  const [status, body] = await answer(await knock(press));
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual([body.outcome, body.eligible], ["sent", 1]);
  assert.deepEqual(
    w.tables.broadcast_recipients.map((r) => [r.contact_id, r.facts]),
    [["c1", { proposal_link: "https://docs.example.com/proposal/c1" }]],
    "out twenty days with its link: reached, the link it was run for kept on the row; ten days is inside the pace; no link, not named",
  );
  assert.deepEqual(w.tables.broadcasts[0].params, [
    { kind: "first_name" },
    { kind: "business_name" },
    { kind: "proposal_link" },
  ]);

  // The pace cannot be read: a week's wait, as before one, and the run goes on.
  w = world({
    people: { [A]: people },
    faults: { "deals.select": { message: "canceling statement due to statement timeout" } },
  });
  set(w, "proposal");
  const [, unread] = await answer(await knock(press));
  assert.deepEqual([unread.outcome, unread.eligible], ["sent", 2], "ten days out is past a week");

  // Deals off: nothing runs, and the reason is the run's own.
  w = world({ people: { [A]: people } });
  set(w, "booking");
  assert.deepEqual(await answer(await knock(press)), [
    200,
    { ok: true, outcome: "off", mode: "ask", skipped: "deals_off" },
  ]);
  nothingMade(w.tables);
});

test("a proposal is followed up once, whoever sent it (0006): not again after the playbook that did was deleted, nor after its run was stopped once it had sent; a waiting run whose day has passed holds nobody", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: IN_HOURS });
  const out = person("c1", {
    deal_id: "deal-c1",
    deal_stage: "proposed",
    deal_proposed_at: iso(20 * D),
    deal_proposal_url: "https://docs.example.com/proposal/c1",
  });
  const link = [{ kind: "first_name" }, { kind: "business_name" }, { kind: "proposal_link" }];
  // Ten days ago: past the week's breath, so only the once-per-proposal rule can hold them back.
  const run = (id, over) => ({
    id,
    tenant_id: A,
    name: "Proposal follow-up",
    template_id: "tpl-follow",
    template_name: "proposal_follow_up",
    template_language: "en_US",
    params: link,
    audience: null,
    state: "sent",
    scheduled_for: iso(10 * D),
    created_at: iso(10 * D),
    recipient_count: 1,
    playbook_id: null,
    run_for: localDate(TZ, new Date(Date.now() - 10 * D)),
    ...over,
  });
  const set = (w, broadcast, recipient) => {
    workspace(w.tables, A, "ask", { sells_by: "proposal" });
    w.tables.templates.push({
      tenant_id: A,
      channel: "whatsapp",
      name: "proposal_follow_up",
      language: "en_US",
      meta_status: "approved",
    });
    w.tables.playbooks.push(
      playbook(A, P, {
        name: "Proposal follow-up",
        trigger: "proposal_waiting",
        template_id: "tpl-follow",
        template_name: "proposal_follow_up",
        params: link,
        policy_class: "follow_up",
      }),
    );
    w.tables.broadcasts.push(broadcast);
    w.tables.broadcast_recipients.push({ tenant_id: A, broadcast_id: broadcast.id, contact_id: "c1", ...recipient });
  };
  // Followed up by a playbook since deleted: its run's playbook is gone, its link is not.
  let w = world({ people: { [A]: [out] } });
  set(w, run("old-run", {}), { state: "sent", sent_at: iso(10 * D) });
  assert.deepEqual(await answer(await knock(press)), [200, { ok: true, outcome: "empty", eligible: 0, mode: "ask" }]);
  // Followed up by a run that was stopped after it sent to them.
  w = world({ people: { [A]: [out] } });
  set(w, run("stopped", { state: "canceled", playbook_id: P }), { state: "sent", sent_at: iso(10 * D) });
  assert.deepEqual(await answer(await knock(press)), [200, { ok: true, outcome: "empty", eligible: 0, mode: "ask" }]);
  // Held three days ago for a person who never approved it: that run can never go, so today's run starts over.
  w = world({ people: { [A]: [out] } });
  set(
    w,
    run("held", {
      state: "pending_approval",
      playbook_id: P,
      scheduled_for: iso(3 * D),
      created_at: iso(3 * D),
      run_for: localDate(TZ, new Date(Date.now() - 3 * D)),
    }),
    {
      state: "queued",
      sent_at: null,
    },
  );
  const [status, body] = await answer(await knock(press));
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual([body.outcome, body.eligible], ["sent", 1], "reached: nothing was sent to them");
});

test("a reach-out's root runs its first step now through the sweep's step runner, and says why (Part 4, R13, R14); a later step runs on its day only", async () => {
  const w = world({ people: { [A]: [person("a1")] } });
  workspace(w.tables, A, "auto");
  // No billing row is no permission to spend: the run is held for billing, and nothing is made.
  w.tables.billing_accounts = (w.tables.billing_accounts ?? []).filter((b) => b.tenant_id !== A);
  w.tables.playbooks.push(
    playbook(A, P, {
      kind: "reach_out",
      trigger: "lead_first",
      policy_class: "outreach",
      lead_search_id: "44444444-4444-4444-8444-444444444444",
      after_playbook_id: null,
      gap_minutes: 12,
      domain_ids: [],
    }),
  );
  const [status, body] = await answer(await knock(press));
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual([body.ok, body.outcome, body.reason, body.planned, body.run_id], [true, "held", "billing", 0, null]);
  assert.deepEqual(w.tables.broadcasts ?? [], [], "no run was made");
  const STEP = "55555555-5555-4555-8555-555555555555";
  w.tables.playbooks.push(
    playbook(A, STEP, { kind: "reach_out", trigger: "after_step", policy_class: "outreach", after_playbook_id: P }),
  );
  const [s2, b2] = await answer(await knock({ ...press, playbook_id: STEP }));
  assert.deepEqual([s2, b2], [409, { ok: false, error: "reach_out_step" }]);
});

test("a reach-out's Start in a paused workspace says the workspace is paused, not the chain (R14)", async () => {
  const w = world({ people: { [A]: [person("a1")] } });
  workspace(w.tables, A, "auto", { status: "paused" });
  w.tables.playbooks.push(
    playbook(A, P, {
      kind: "reach_out",
      trigger: "lead_first",
      policy_class: "outreach",
      lead_search_id: "44444444-4444-4444-8444-444444444444",
      after_playbook_id: null,
      gap_minutes: 12,
      domain_ids: [],
    }),
  );
  const [status, body] = await answer(await knock(press));
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual([body.outcome, body.reason, body.planned], ["off", "workspace_paused", 0]);
});
