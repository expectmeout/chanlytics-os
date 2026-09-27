/**
 * A playbook's run, run: every branch through fakes that log their calls.
 * Until now the edge's runner was executed by no test; playbooks.test.mjs
 * pinned its text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAYBOOK_VETO_DELAY_MS, numberHealth, toPersonRowVM } from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";

const { runPlaybook } = await importSrc("packages/core/src/campaigns/run-playbook.ts");
const NOW = new Date("2026-09-06T14:00:00Z"); // 10:00 in New York
const TZ = "America/New_York";
const D = 86_400_000;
const WRITES = new Set(["record", "create", "enrol", "fail", "schedule", "decide", "notify"]);

/** A person as the People page reads them: quiet for 40 days, said yes to both. */
const person = (id, over = {}) => ({
  id,
  state: "quiet",
  hasChat: true,
  calls: 0,
  phone: `+1555123000${id}`,
  consent: {
    state: "opted_in",
    dnc: false,
    label: "Opted in",
    sub: "",
    source: "in_person",
    marketing: "opted_in",
    marketingSource: "in_person",
    marketingSub: "",
  },
  lastContact: { ts: NOW.getTime() - 40 * D, label: "" },
  ...over,
  // They wrote last when they were last in touch: Quiet 30+ days reads the days since (lists.ts).
  heardDays: over.heardDays ?? Math.round((NOW.getTime() - (over.lastContact?.ts ?? NOW.getTime() - 40 * D)) / D),
});
/** A person as people_list answers, with a calendar: the visit run reads their visits. */
const iso = (msAgo) => new Date(NOW.getTime() - msAgo).toISOString();
function dto(id, over = {}) {
  return {
    id,
    display_name: `Person ${id}`,
    wa_profile_name: null,
    phone_e164: `+1305555000${id}`,
    consent: "opted_in",
    consent_source: "keyword",
    consent_updated_at: iso(30 * D),
    dnc: false,
    marketing_consent: "opted_in",
    marketing_consent_source: "customer_message",
    marketing_consent_updated_at: iso(30 * D),
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
    latest_wa_inbound_at: iso(3 * D),
    last_message_at: iso(3 * D),
    last_message_direction: "inbound",
    last_message_sender: "customer",
    last_inbound_text: "hi",
    last_inbound_at: iso(3 * D),
    last_call_at: null,
    last_inbound_call_at: null,
    last_inbound_call_summary: null,
    call_count: 0,
    call_seconds: 0,
    first_contact_at: iso(60 * D),
    earliest_row_at: iso(60 * D),
    has_backfill: false,
    has_chat: true,
    queued_reply_at: null,
    effective_reply_mode: "auto",
    visits: null,
    ...over,
  };
}
const visit = (startIso, title) => ({
  id: `v-${startIso}`,
  start: startIso,
  end: new Date(Date.parse(startIso) + 3_600_000).toISOString(),
  title,
  all_day: false,
  via: "phone",
});

const playbook = (over = {}) => ({
  id: "p1",
  tenant_id: "t1",
  name: "Win-back",
  trigger: "quiet_30",
  template_id: "tpl-1",
  template_name: "winback_offer",
  template_language: "en_US",
  params: [{ kind: "first_name" }],
  policy_class: "reengage",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  created_by: "owner",
  last_run_for: null,
  ...over,
});
const context = (over = {}) => ({
  tz: TZ,
  now: NOW,
  people: [person("a"), person("b", { lastContact: { ts: NOW.getTime() - 90 * D, label: "" } })],
  modes: new Map([["reengage", "auto"]]),
  health: numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }),
  touches: { byThis: new Map(), byAny: new Map() },
  calendar: "none",
  visits: new Map(),
  ...over,
});
const cmd = (over = {}) => ({
  playbook: playbook(),
  ctx: context(),
  runFor: "2026-09-06",
  by: { kind: "system" },
  ...over,
});
/** A run's reach with nobody named and nobody left out: every count a run keeps, at zero. */
const NOBODY_LEFT = {
  pool: 0,
  will: 0,
  noNumber: 0,
  stopped: 0,
  noYes: 0,
  heardThis: 0,
  heardAny: 0,
  overCap: 0,
  overLimit: 0,
};

/** Every port answers a value or a function of its arguments; the writes log their call as [name, ...args]. */
function fakes(over = {}) {
  const log = [];
  const answers = {
    template: { meta_status: "approved" },
    alreadyRan: false,
    record: undefined,
    create: "b1",
    enrol: undefined,
    fail: undefined,
    schedule: undefined,
    decide: undefined,
    notify: undefined,
    ...over,
  };
  const ports = {};
  for (const [name, answer] of Object.entries(answers)) {
    ports[name] = async (...args) => {
      if (WRITES.has(name)) log.push([name, ...args]);
      if (answer instanceof Error) throw answer;
      return typeof answer === "function" ? answer(...args) : answer;
    };
  }
  return { ports, log, ops: () => log.map((l) => l[0]), of: (name) => log.filter((l) => l[0] === name) };
}

test("the mode decides: never runs nothing and says so; no row for the class means ask; a person who asks has decided, it sends now unless the class is never", async () => {
  const never = fakes();
  assert.deepEqual(await runPlaybook(never.ports, cmd({ ctx: context({ modes: new Map([["reengage", "never"]]) }) })), {
    outcome: "off",
    mode: "never",
    skipped: "never",
  });
  assert.deepEqual(never.log, [
    ["record", "p1", "2026-09-06", NOW, { run_for: "2026-09-06", by: "system", mode: "never", skipped: "never" }],
  ]);
  const noRow = fakes();
  const held = await runPlaybook(noRow.ports, cmd({ ctx: context({ modes: new Map() }) }));
  assert.equal(held.outcome, "held", "no row for the class is ask");
  assert.equal(noRow.of("create")[0][1].state, "pending_approval");
  const asked = fakes();
  const r = await runPlaybook(
    asked.ports,
    cmd({ ctx: context({ modes: new Map([["reengage", "ask"]]) }), by: { kind: "user", userId: "u1" } }),
  );
  assert.deepEqual(
    r,
    {
      outcome: "sent",
      broadcast_id: "b1",
      eligible: 2,
      mode: "ask",
      state: "scheduled",
      scheduled_for: NOW.toISOString(),
      moved_from: null,
    },
    "a person's run now sends now under ask, and says when",
  );
  assert.deepEqual(asked.of("schedule")[0], ["schedule", "b1", NOW]);
  assert.deepEqual(asked.of("create")[0][1].created_by, "u1", "their run");
  assert.deepEqual(
    asked.of("decide")[0][1],
    {
      broadcastId: "b1",
      by: { kind: "user", userId: "u1" },
      payload: {
        playbook_id: "p1",
        playbook: "Win-back",
        mode: "ask",
        recipients: 2,
        scheduled_for: NOW.toISOString(),
        run_now: true,
      },
    },
    "and their decision",
  );
  const refused = fakes();
  assert.deepEqual(
    await runPlaybook(
      refused.ports,
      cmd({ ctx: context({ modes: new Map([["reengage", "never"]]) }), by: { kind: "user", userId: "u1" } }),
    ),
    { outcome: "off", mode: "never", skipped: "never" },
    "never is never, even asked",
  );
});

test("off before a single row: a template Meta withdrew, a flagged number, a run already made for the day (said once, not recorded twice), a visit playbook without its calendar", async () => {
  const withdrawn = fakes({ template: { meta_status: "rejected" } });
  assert.deepEqual(await runPlaybook(withdrawn.ports, cmd()), {
    outcome: "off",
    mode: "auto",
    skipped: "template_not_approved",
  });
  assert.deepEqual(withdrawn.ops(), ["record"]);
  const gone = fakes({ template: null });
  assert.equal((await runPlaybook(gone.ports, cmd())).skipped, "template_not_approved");
  const flagged = fakes();
  assert.deepEqual(
    await runPlaybook(
      flagged.ports,
      cmd({ ctx: context({ health: numberHealth({ quality: "RED", event: null, limit: "TIER_1K" }) }) }),
    ),
    { outcome: "off", mode: "auto", skipped: "number_flagged" },
  );
  assert.deepEqual(flagged.log[0][4], { run_for: "2026-09-06", by: "system", mode: "auto", skipped: "number_flagged" });
  const twice = fakes({ alreadyRan: true });
  assert.deepEqual(await runPlaybook(twice.ports, cmd()), {
    outcome: "off",
    mode: "auto",
    skipped: "already_ran_today",
  });
  assert.deepEqual(twice.ops(), [], "the day's run stands; nothing is recorded again");
  const noCalendar = fakes();
  const p = playbook({ trigger: "visit_tomorrow", policy_class: "booking" });
  assert.deepEqual(
    await runPlaybook(
      noCalendar.ports,
      cmd({ playbook: p, ctx: context({ modes: new Map([["booking", "auto"]]), calendar: "unavailable" }) }),
    ),
    { outcome: "off", mode: "auto", skipped: "no_calendar" },
  );
  assert.deepEqual(noCalendar.ops(), ["record"]);
});

test("a template that could not be read is the run failing, not the template withdrawn: nothing is recorded, so the next sweep asks again", async () => {
  const blip = fakes({ template: new Error("PostgREST blip") });
  assert.deepEqual(await runPlaybook(blip.ports, cmd()), { outcome: "failed", error: "template: PostgREST blip" });
  assert.deepEqual(blip.ops(), []);
});

test("who the run reaches: the trigger's list crossed with who said yes, longest-unheard first; the number's daily limit as a ceiling; nobody at all, recorded honestly", async () => {
  const rows = [
    person("a"),
    person("b", { lastContact: { ts: NOW.getTime() - 90 * D, label: "" } }),
    person("c", { consent: { state: "unknown", dnc: false } }),
    person("d", { state: "active", heardDays: 3 }),
  ];
  const { ports, of } = fakes();
  const r = await runPlaybook(ports, cmd({ ctx: context({ people: rows }) }));
  assert.equal(r.outcome, "sent");
  assert.deepEqual(of("enrol")[0], [
    "enrol",
    "b1",
    [
      { contact_id: "b", facts: null },
      { contact_id: "a", facts: null },
    ],
  ]);
  assert.equal(of("create")[0][1].recipient_count, 2);
  // And who it left out, kept on the run: three on the list, one of them never said yes.
  assert.deepEqual(of("create")[0][1].audience.reach, { ...NOBODY_LEFT, pool: 3, will: 2, noYes: 1 });
  const capped = fakes();
  await runPlaybook(
    capped.ports,
    cmd({
      ctx: context({ people: rows, health: { canSend: true, tone: "ok", label: "", limitPerDay: 1, refusal: null } }),
    }),
  );
  assert.deepEqual(
    capped.of("enrol")[0][2].map((x) => x.contact_id),
    ["b"],
    "the day's limit is a ceiling, not a refusal",
  );
  assert.deepEqual(
    capped.of("create")[0][1].audience.reach,
    { ...NOBODY_LEFT, pool: 3, will: 1, noYes: 1, overLimit: 1 },
    "and the one past it is counted, not dropped",
  );
  const nobody = fakes();
  assert.deepEqual(
    await runPlaybook(
      nobody.ports,
      cmd({ ctx: context({ people: [person("d", { state: "active", heardDays: 3 })] }) }),
    ),
    { outcome: "empty", eligible: 0, mode: "auto" },
  );
  assert.deepEqual(nobody.log, [
    [
      "record",
      "p1",
      "2026-09-06",
      NOW,
      { run_for: "2026-09-06", by: "system", mode: "auto", eligible: 0, reach: NOBODY_LEFT },
    ],
  ]);
});

test("a run counts everyone its moment named, each once, under the first rule that left them out -- so the counts add up to the list", async () => {
  const quiet = (id, daysAgo, over = {}) =>
    person(id, { lastContact: { ts: NOW.getTime() - daysAgo * D, label: "" }, ...over });
  const rows = [
    quiet("a", 90),
    quiet("b", 80, { phone: null }),
    quiet("c", 80, { consent: { state: "opted_in", dnc: true, marketing: "opted_in" } }),
    quiet("d", 80, { consent: { state: "opted_in", dnc: false, marketing: "unknown" } }),
    quiet("e", 80),
    quiet("f", 80),
    quiet("g", 60),
    quiet("h", 45),
    // No number AND no yes: counted once, under the first rule the run applies.
    quiet("i", 80, { phone: null, consent: { state: "unknown", dnc: false, marketing: "unknown" } }),
    person("j", { state: "active", heardDays: 3 }),
  ];
  const touches = {
    byThis: new Map([["p1", new Map([["e", NOW.getTime() - 10 * D]])]]),
    byAny: new Map([["f", NOW.getTime() - 2 * D]]),
  };
  const { ports, of } = fakes();
  await runPlaybook(ports, cmd({ playbook: playbook({ cap_per_run: 2 }), ctx: context({ people: rows, touches }) }));
  const reach = of("create")[0][1].audience.reach;
  assert.deepEqual(reach, {
    pool: 9,
    will: 2,
    noNumber: 2,
    stopped: 1,
    noYes: 1,
    heardThis: 1,
    heardAny: 1,
    overCap: 1,
    overLimit: 0,
  });
  assert.equal(
    reach.will +
      reach.noNumber +
      reach.stopped +
      reach.noYes +
      reach.heardThis +
      reach.heardAny +
      reach.overCap +
      reach.overLimit,
    reach.pool,
    "the whole list, every person once",
  );
  assert.deepEqual(
    of("enrol")[0][2].map((x) => x.contact_id),
    ["a", "g"],
    "and who it reaches is what it always was: the longest unheard, to the cap",
  );
});

test("auto: the row, the people, the send now, the system's decision, the run recorded; veto: the send half an hour ahead with the same row", async () => {
  const { ports, log, of, ops } = fakes();
  const r = await runPlaybook(ports, cmd());
  assert.deepEqual(r, {
    outcome: "sent",
    broadcast_id: "b1",
    eligible: 2,
    mode: "auto",
    state: "scheduled",
    scheduled_for: NOW.toISOString(),
    moved_from: null,
  });
  assert.deepEqual(ops(), ["create", "enrol", "schedule", "decide", "record"]);
  assert.deepEqual(of("create")[0][1], {
    name: "Win-back · 2026-09-06",
    template_id: "tpl-1",
    template_name: "winback_offer",
    template_language: "en_US",
    params: [{ kind: "first_name" }],
    audience: { kind: "playbook", id: "p1", label: "Win-back", reach: { ...NOBODY_LEFT, pool: 2, will: 2 } },
    state: "scheduled",
    scheduled_for: NOW.toISOString(),
    recipient_count: 2,
    created_by: "owner",
    playbook_id: "p1",
    run_for: "2026-09-06",
  });
  assert.deepEqual(of("schedule")[0], ["schedule", "b1", NOW]);
  assert.deepEqual(of("decide")[0][1], {
    broadcastId: "b1",
    by: { kind: "system" },
    payload: {
      playbook_id: "p1",
      playbook: "Win-back",
      mode: "auto",
      recipients: 2,
      scheduled_for: NOW.toISOString(),
      run_now: false,
    },
  });
  assert.deepEqual(log.at(-1), [
    "record",
    "p1",
    "2026-09-06",
    NOW,
    {
      run_for: "2026-09-06",
      by: "system",
      mode: "auto",
      eligible: 2,
      reach: { ...NOBODY_LEFT, pool: 2, will: 2 },
      broadcast_id: "b1",
      state: "scheduled",
    },
  ]);
  const veto = fakes();
  await runPlaybook(veto.ports, cmd({ ctx: context({ modes: new Map([["reengage", "veto"]]) }) }));
  const at = new Date(NOW.getTime() + PLAYBOOK_VETO_DELAY_MS);
  assert.deepEqual(veto.of("schedule")[0], ["schedule", "b1", at]);
  assert.equal(veto.of("create")[0][1].scheduled_for, at.toISOString());
});

test("never at 3 AM, whoever asks: a person's run now at eleven at night goes at nine, and the ledger says what was asked for", async () => {
  const night = new Date("2026-09-07T03:00:00Z"); // 23:00 in New York
  const nine = new Date("2026-09-07T13:00:00Z");
  const f = fakes();
  const r = await runPlaybook(f.ports, cmd({ ctx: context({ now: night }), by: { kind: "user", userId: "u1" } }));
  assert.equal(r.outcome, "sent");
  assert.deepEqual(f.of("schedule")[0], ["schedule", "b1", nine]);
  assert.equal(f.of("create")[0][1].scheduled_for, nine.toISOString(), "the row says when it really goes");
  assert.equal(f.of("decide")[0][1].payload.scheduled_for, nine.toISOString());
  assert.equal(f.of("decide")[0][1].payload.moved_from, night.toISOString(), "and the ledger keeps what was asked for");
  assert.equal(f.log.at(-1)[4].moved_from, night.toISOString());
  assert.deepEqual(
    [r.scheduled_for, r.moved_from],
    [nine.toISOString(), night.toISOString()],
    "and the person who asked is told when it really goes, and what they asked for",
  );
  const day = fakes();
  await runPlaybook(day.ports, cmd({ by: { kind: "user", userId: "u1" } }));
  assert.ok(!("moved_from" in day.of("decide")[0][1].payload), "inside the hours nothing moves, and nothing says so");
});

test("ask: the row waits, nobody is scheduled, the owner is told in these words, the run recorded", async () => {
  const { ports, of, ops } = fakes();
  const r = await runPlaybook(ports, cmd({ ctx: context({ modes: new Map([["reengage", "ask"]]) }) }));
  assert.deepEqual(r, { outcome: "held", broadcast_id: "b1", eligible: 2, mode: "ask", state: "pending_approval" });
  assert.deepEqual(ops(), ["create", "enrol", "notify", "record"]);
  assert.equal(of("create")[0][1].state, "pending_approval");
  assert.equal(of("create")[0][1].scheduled_for, NOW.toISOString());
  assert.deepEqual(of("notify")[0], [
    "notify",
    "Playbook “Win-back” is ready: 2 people",
    "2 people have become eligible for “Win-back”. Approve or skip the run on Today or in Campaigns › Playbooks. Nothing is sent until you do.",
  ]);
  const one = fakes();
  await runPlaybook(one.ports, cmd({ ctx: context({ modes: new Map([["reengage", "ask"]]), people: [person("a")] }) }));
  assert.equal(one.of("notify")[0][1], "Playbook “Win-back” is ready: 1 person");
  assert.match(one.of("notify")[0][2], /^1 person has become eligible/);
});

test("a visit run keeps each person's words on their row, from the visit the run read", async () => {
  const next = visit("2026-09-07T18:00:00Z", "Balayage"); // tomorrow, 2:00 PM in New York
  const row = toPersonRowVM(
    dto("a", { visits: { timezone: TZ, source: "calendar", state: "ok", next, last: null } }),
    TZ,
    NOW,
  );
  const { ports, of } = fakes();
  const r = await runPlaybook(
    ports,
    cmd({
      playbook: playbook({
        trigger: "visit_tomorrow",
        policy_class: "booking",
        template_name: "visit_reminder",
        params: [{ kind: "first_name" }, { kind: "visit_when" }, { kind: "visit_service" }],
      }),
      ctx: context({
        modes: new Map([["booking", "auto"]]),
        calendar: "ok",
        people: [row],
        visits: new Map([["a", { timezone: TZ, source: "calendar", state: "ok", next, last: null }]]),
      }),
    }),
  );
  assert.equal(r.outcome, "sent");
  assert.deepEqual(of("enrol")[0][2], [
    { contact_id: "a", facts: { visit_when: "tomorrow at 2:00 PM", visit_service: "Balayage" } },
  ]);
});

test('a reminder run asked for at night goes at nine and says "today": the words are relative to the moment the send goes; every visit is reminded, whatever the cap', async () => {
  const night = new Date("2026-09-07T03:00:00Z"); // 23:00 in New York, September 6
  const next = visit("2026-09-07T18:00:00Z", "Balayage"); // September 7, 2:00 PM in New York: tomorrow at eleven, today at nine
  const visits = new Map(
    ["a", "b", "c"].map((id) => [id, { timezone: TZ, source: "calendar", state: "ok", next, last: null }]),
  );
  const rows = ["a", "b", "c"].map((id) => toPersonRowVM(dto(id, { visits: visits.get(id) }), TZ, night));
  const f = fakes();
  const r = await runPlaybook(
    f.ports,
    cmd({
      playbook: playbook({
        trigger: "visit_tomorrow",
        policy_class: "booking",
        template_name: "visit_reminder",
        params: [{ kind: "visit_when" }, { kind: "visit_service" }],
        cap_per_run: 1,
      }),
      ctx: context({ now: night, modes: new Map([["booking", "auto"]]), calendar: "ok", people: rows, visits }),
      by: { kind: "user", userId: "u1" },
    }),
  );
  assert.equal(r.outcome, "sent");
  assert.equal(r.eligible, 3, "the cap is for offers: all three are reminded");
  assert.equal(r.moved_from, night.toISOString());
  assert.deepEqual(
    f.of("enrol")[0][2].map((e) => e.facts.visit_when),
    ["today at 2:00 PM", "today at 2:00 PM", "today at 2:00 PM"],
    "read at nine, the visit is today",
  );
});

test("a run that could not be written says so and stops: no row, nothing else; the people not written, the row failed with its reason; the job refused, the row failed with its reason and no decision", async () => {
  const noRow = fakes({ create: new Error("insert refused") });
  assert.deepEqual(await runPlaybook(noRow.ports, cmd()), { outcome: "failed", error: "insert refused" });
  assert.deepEqual(noRow.ops(), ["create"]);
  const noPeople = fakes({ enrol: new Error("rows refused") });
  assert.deepEqual(await runPlaybook(noPeople.ports, cmd()), { outcome: "failed", error: "rows refused" });
  assert.deepEqual(noPeople.log.slice(1), [
    [
      "enrol",
      "b1",
      [
        { contact_id: "b", facts: null },
        { contact_id: "a", facts: null },
      ],
    ],
    ["fail", "b1", "recipients_write_failed"],
  ]);
  const noJob = fakes({ schedule: new Error("schedule_job: no row") });
  assert.deepEqual(await runPlaybook(noJob.ports, cmd()), { outcome: "failed", error: "schedule_job: no row" });
  assert.deepEqual(noJob.ops(), ["create", "enrol", "schedule", "fail"]);
  assert.deepEqual(noJob.log.at(-1), ["fail", "b1", "schedule_failed"]);
});
