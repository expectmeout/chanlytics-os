/**
 * The dashboard's campaign verbs, run: a person's broadcast, the approval,
 * the cancel and the playbook's check, every branch through fakes that log
 * their writes. outbound-routes.test.mjs keeps running the routes, now
 * adapters, through route().
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { BROADCAST_MAX_RECIPIENTS, EVERYONE_LABEL, broadcastName, emptyAudienceRefusal, numberHealth, paramLabel, starterForTrigger, templateTitle } from "@chanlytics/contracts";
import { importSrc } from "./_source.mjs";
import { localDate as tzDate } from "@chanlytics/contracts";

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

const { createBroadcast } = await importSrc("packages/core/src/campaigns/create-broadcast.ts");
const { approveRun } = await importSrc("packages/core/src/campaigns/approve.ts");
const { cancelBroadcast } = await importSrc("packages/core/src/campaigns/cancel.ts");
const { checkPlaybook } = await importSrc("packages/core/src/campaigns/check-playbook.ts");

const NOW = new Date("2026-09-06T14:00:00Z");
const D = 86_400_000;
const T1 = "77777777-7777-4777-8777-777777777771";
const S1 = "66666666-6666-4666-8666-666666666661";
const WRITES = new Set(["create", "enrol", "fail", "schedule", "record", "release", "hold", "withdraw", "cancel"]);

const template = (over = {}) => ({ id: T1, name: "month_offer", language: "en_US", meta_status: "approved", category: "marketing", variables: [], title: null, ...over });
/** A person as the People page reads them: quiet for 40 days, said yes to both. */
const person = (id, over = {}) => ({
  id, state: "quiet", hasChat: true, calls: 0, phone: `+1555123${String(id).padStart(4, "0")}`,
  consent: { state: "opted_in", dnc: false, label: "Opted in", sub: "", source: "in_person", marketing: "opted_in", marketingSource: "in_person", marketingSub: "" },
  lastContact: { ts: NOW.getTime() - 40 * D, label: "" },
  ...over,
});
const people = [
  person("a"),
  person("b", { state: "active" }),
  person("c", { consent: { state: "opted_in", dnc: false, marketing: "unknown" } }),
  person("d", { consent: { state: "unknown", dnc: false, marketing: "unknown" } }),
];
const noOne = [person("d", { consent: { state: "unknown", dnc: false, marketing: "unknown" } })];

/** Every port answers a value or a function of its arguments; the writes log their call as [name, ...args]. */
function fakes(over = {}) {
  const log = [];
  const answers = {
    template: template(), bookingLink: "https://book.example/m", people, savedList: null, number: numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }),
    // 14:00 UTC is 10:00 in New York: inside the hours a send may go out in.
    timezone: "America/New_York",
    create: "b1", enrol: undefined, fail: undefined, schedule: undefined, record: "d1", release: true, hold: undefined, withdraw: 1, cancel: true,
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
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}
const everyone = { kind: "everyone" };
const make = (f, body) => createBroadcast(f.ports, { userId: "u1", body, now: NOW });

test("a broadcast is refused in the person's words, in order, before anything is written: the template, who, the list, the template as Meta holds it, the values, the link", async () => {
  const f = fakes();
  await refused(make(f, { template_id: "nope", audience: everyone }), "validation", 400, "Pick a template.");
  await refused(make(f, { template_id: T1, audience: { kind: "carrier pigeons" } }), "validation", 400, "Pick who this goes to.");
  await refused(make(f, { template_id: T1, audience: { kind: "saved", id: "x" } }), "validation", 400, "Pick a list.");
  await refused(make(f, { template_id: T1, audience: { kind: "list", id: "nope" } }), "validation", 400, "Pick a list.");
  await refused(make(fakes({ template: null }), { template_id: T1, audience: everyone }), "not_found", 404, "Template not found.");
  await refused(make(fakes({ template: template({ meta_status: "pending" }) }), { template_id: T1, audience: everyone }), "conflict", 409, "not approved by WhatsApp");
  await refused(make(fakes({ template: template({ variables: ["1"] }) }), { template_id: T1, params: [], audience: everyone }), "validation", 400, "This template takes 1 value.");
  await refused(make(f, { template_id: T1, params: ["extra"], audience: everyone }), "validation", 400, "This template takes no values.");
  await refused(make(fakes({ template: template({ variables: ["1"] }) }), { template_id: T1, params: [{ kind: "moon_phase" }], audience: everyone }), "validation", 400, "Each value is typed text");
  await refused(make(fakes({ template: template({ variables: ["1"] }) }), { template_id: T1, params: ["line\nbreak"], audience: everyone }), "validation", 400, "without line breaks or tabs");
  await refused(make(fakes({ template: template({ variables: ["1"] }), bookingLink: null }), { template_id: T1, params: ["@booking_link"], audience: everyone }), "conflict", 409, "This message takes the booking link, and none is on file.");
  // REGRESSION (C6): a one-off broadcast has no visit, so a visit's slot left every person held back as a missing value and the broadcast read as sent.
  await refused(make(fakes({ template: template({ variables: ["1"] }) }), { template_id: T1, params: ["@visit_when"], audience: everyone }), "validation", 400, "Only a visit reminder or an after-the-visit playbook can fill in a visit's time or service.");
  await refused(make(fakes({ template: template({ variables: ["1"] }) }), { template_id: T1, params: [{ kind: "visit_service" }], audience: everyone }), "validation", 400, "Only a visit reminder or an after-the-visit playbook can fill in a visit's time or service.");
  assert.deepEqual(f.ops(), [], "nothing enrolled, nothing scheduled, nothing on the ledger");
});

test("the audience: everyone, a People list, or a list kept by hand, crossed with the yes this template's category needs; an empty audience says which yes was missing", async () => {
  const all = fakes();
  await make(all, { template_id: T1, audience: everyone });
  assert.deepEqual(all.of("enrol")[0][2].map((r) => r.contact_id), ["a", "b"], "marketing: the yes to offers");
  assert.equal(all.of("create")[0][1].audience.label, EVERYONE_LABEL);
  const utility = fakes({ template: template({ category: "utility" }) });
  await make(utility, { template_id: T1, audience: everyone });
  assert.deepEqual(utility.of("enrol")[0][2].map((r) => r.contact_id), ["a", "b", "c"], "a utility message needs only the yes to messages");
  const quiet = fakes();
  await make(quiet, { template_id: T1, audience: { kind: "list", id: "quiet" } });
  assert.deepEqual(quiet.of("enrol")[0][2].map((r) => r.contact_id), ["a"]);
  assert.deepEqual(quiet.of("create")[0][1].audience, { kind: "list", id: "quiet", label: "Quiet 30+ days" });
  const saved = fakes({ savedList: (id) => (id === S1 ? { name: "VIPs", memberIds: ["b", "d"] } : null) });
  await make(saved, { template_id: T1, audience: { kind: "saved", id: S1 } });
  assert.deepEqual(saved.of("enrol")[0][2].map((r) => r.contact_id), ["b"], "on the list and said yes");
  assert.deepEqual(saved.of("create")[0][1].audience, { kind: "saved", id: S1, label: "VIPs" });
  await refused(make(fakes(), { template_id: T1, audience: { kind: "saved", id: S1 } }), "not_found", 404, "List not found.");
  const nobody = fakes({ people: noOne });
  await refused(make(nobody, { template_id: T1, audience: everyone }), "conflict", 409, emptyAudienceRefusal("marketing"));
  await refused(make(fakes({ people: noOne, template: template({ category: "utility" }) }), { template_id: T1, audience: everyone }), "conflict", 409, emptyAudienceRefusal("conversational"));
  const crowd = Array.from({ length: BROADCAST_MAX_RECIPIENTS + 1 }, (_, i) => person(i));
  await refused(make(fakes({ people: crowd }), { template_id: T1, audience: everyone }), "validation", 400, `At most ${BROADCAST_MAX_RECIPIENTS} people in one broadcast.`);
  assert.deepEqual(nobody.ops(), []);
});

test("the number: none connected, flagged, or an audience past the day's limit, refused before a row", async () => {
  await refused(make(fakes({ number: null }), { template_id: T1, audience: everyone }), "conflict", 409, "Connect a WhatsApp number first");
  const flagged = fakes({ number: numberHealth({ quality: "RED", event: null, limit: "TIER_1K" }) });
  await refused(make(flagged, { template_id: T1, audience: everyone }), "conflict", 409, "WhatsApp flagged this number's quality");
  const many = Array.from({ length: 51 }, (_, i) => person(i));
  const over = fakes({ people: many, number: numberHealth({ quality: "GREEN", event: null, limit: "TIER_50" }) });
  await refused(make(over, { template_id: T1, audience: everyone }), "validation", 400, "Send to a smaller list or split it.");
  assert.deepEqual(over.ops(), []);
});

test("when, and what it is called: not a time, past the window, a past time is now, a future time is kept; a name given is trimmed, none given is the template and the day", async () => {
  await refused(make(fakes(), { template_id: T1, audience: everyone, scheduled_for: "nope" }), "validation", 400, "That is not a time.");
  // An instant names its offset: a bare date is midnight UTC (the evening
  // before, in New York) and a wall-clock time without one is the server's.
  await refused(make(fakes(), { template_id: T1, audience: everyone, scheduled_for: "2026-09-20" }), "validation", 400, "Give the time with its offset");
  await refused(make(fakes(), { template_id: T1, audience: everyone, scheduled_for: "2026-09-20T15:00" }), "validation", 400, "Give the time with its offset");
  await refused(make(fakes(), { template_id: T1, audience: everyone, scheduled_for: new Date(NOW.getTime() + 31 * D).toISOString() }), "validation", 400, "Schedule within 30 days.");
  // The ceiling is judged on the moment it really goes: asked for an hour
  // inside the thirty days but after twenty, it would move past them.
  const night = new Date("2026-09-07T03:00:00Z");
  await refused(createBroadcast(fakes().ports, { userId: "u1", body: { template_id: T1, audience: everyone, scheduled_for: "2026-10-07T02:00:00Z" }, now: night }), "validation", 400, "Schedule within 30 days.");
  const past = fakes();
  const r1 = await make(past, { template_id: T1, audience: everyone, scheduled_for: new Date(NOW.getTime() - D).toISOString() });
  assert.equal(r1.scheduled_for, NOW.toISOString(), "a past time is now");
  assert.equal(r1.name, broadcastName("month_offer", ZONE, NOW, null), "the template and the day");
  const later = new Date(NOW.getTime() + 2 * D);
  const future = fakes();
  const r2 = await make(future, { template_id: T1, audience: everyone, scheduled_for: later.toISOString(), name: "  Spring offer  " });
  assert.equal(r2.scheduled_for, later.toISOString());
  assert.deepEqual(future.of("schedule")[0], ["schedule", "b1", later]);
  assert.equal(future.of("create")[0][1].scheduled_for, later.toISOString());
  assert.equal(r2.name, "Spring offer");
});

test("the rows, then the job, then the ledger: the row as the person composed it, the people with no words to keep, the send at its time, the decision, the receipt", async () => {
  const f = fakes({ template: template({ variables: ["1", "2"], title: "Monthly offer" }) });
  const r = await make(f, { template_id: T1, params: ["@first_name", "  20% off  "], audience: everyone });
  const specs = [{ kind: "first_name" }, { kind: "text", value: "20% off" }];
  const name = broadcastName("month_offer", ZONE, NOW, "Monthly offer");
  assert.deepEqual(f.ops(), ["create", "enrol", "schedule", "record"]);
  assert.deepEqual(f.of("create")[0][1], {
    name, template_id: T1, template_name: "month_offer", template_language: "en_US", params: specs, audience: { kind: "everyone", id: null, label: EVERYONE_LABEL },
    state: "scheduled", scheduled_for: NOW.toISOString(), recipient_count: 2, created_by: "u1",
  });
  assert.deepEqual(f.of("enrol")[0], ["enrol", "b1", [{ contact_id: "a", facts: null }, { contact_id: "b", facts: null }]]);
  assert.deepEqual(f.of("schedule")[0], ["schedule", "b1", NOW]);
  assert.deepEqual(f.of("record")[0], ["record", "broadcast", "b1", "send_broadcast", {
    name, template: "month_offer/en_US", category: "marketing", audience: { kind: "everyone", id: null, label: EVERYONE_LABEL },
    values: specs.map(paramLabel), recipients: 2, scheduled_for: NOW.toISOString(),
  }]);
  assert.deepEqual(r, { id: "b1", name, state: "scheduled", recipient_count: 2, scheduled_for: NOW.toISOString(), moved_from: null, decision_id: "d1" });
});

test("what could not be written says so: no row is an error; people not written fails the row, then the error; a job the ledger refused fails the row and asks the person to try again; nothing on the ledger", async () => {
  const noRow = fakes({ create: new Error("insert refused") });
  await refused(make(noRow, { template_id: T1, audience: everyone }), "internal", 500, "The broadcast could not be created. Nothing was sent; try again.");
  assert.deepEqual(noRow.ops(), ["create"]);
  const noPeople = fakes({ enrol: new Error("rows refused") });
  await refused(make(noPeople, { template_id: T1, audience: everyone }), "internal", 500, "The people could not be enrolled. Nothing was sent; try again.");
  assert.deepEqual(noPeople.ops(), ["create", "enrol", "fail"]);
  assert.deepEqual(noPeople.of("fail")[0], ["fail", "b1", "recipients_write_failed"]);
  const noJob = fakes({ schedule: new Error("schedule_job: no row") });
  await refused(make(noJob, { template_id: T1, audience: everyone }), "upstream_meta", 502, "The send could not be scheduled. Nothing was sent; try again.");
  assert.deepEqual(noJob.ops(), ["create", "enrol", "schedule", "fail"]);
  assert.deepEqual(noJob.of("fail")[0], ["fail", "b1", "schedule_failed"]);
});

test("approve: a playbook's run is a day's run: approved on a later day it is refused before anything moves, and the one for today goes", async () => {
  const tz = await fakes().ports.timezone();
  const today = tzDate(tz, NOW);
  const stale = { id: "b1", tenant_id: "t1", state: "pending_approval", name: "Visit reminder · yesterday", recipient_count: 3, playbook_id: "p1", run_for: "2026-09-05" };
  const f = fakes();
  await refused(approveRun(f.ports, { row: stale, now: NOW }), "conflict", 409, "This run was made for 2026-09-05 and that day has passed: its people and its words were that day's. Skip it; the next run reads the calendar again.");
  assert.deepEqual(f.ops(), [], "nothing moved");
  const fresh = fakes();
  const r = await approveRun(fresh.ports, { row: { ...stale, run_for: today }, now: NOW });
  assert.equal(r.state, "scheduled");
  const hand = fakes();
  assert.equal((await approveRun(hand.ports, { row: { ...stale, playbook_id: null, run_for: null }, now: NOW })).state, "scheduled", "a broadcast made by hand has no day");
});

test("approve: a run not waiting is refused; one that changed under the approver says so; a job the ledger refused leaves it waiting; else the send now and the approver's decision", async () => {
  const row = { id: "b1", tenant_id: "t1", state: "pending_approval", name: "Win-back · 2026-09-06", recipient_count: 3, playbook_id: "p1" };
  await refused(approveRun(fakes().ports, { row: { ...row, state: "sending" }, now: NOW }), "conflict", 409, "This run is not waiting for approval.");
  const moved = fakes({ release: false });
  await refused(approveRun(moved.ports, { row, now: NOW }), "conflict", 409, "This run just changed state; look again.");
  assert.deepEqual(moved.ops(), ["release"]);
  const noJob = fakes({ schedule: new Error("schedule_job: no row") });
  await refused(approveRun(noJob.ports, { row, now: NOW }), "upstream_meta", 502, "The send could not be scheduled. The run is still waiting; try again.");
  assert.deepEqual(noJob.ops(), ["release", "schedule", "hold"]);
  const f = fakes();
  const r = await approveRun(f.ports, { row, now: NOW });
  assert.deepEqual(f.log, [
    ["release", "b1", NOW],
    ["schedule", "b1", NOW],
    ["record", "broadcast", "b1", "send_broadcast", { name: row.name, playbook_id: "p1", recipients: 3, approved: true, scheduled_for: NOW.toISOString() }],
  ]);
  assert.deepEqual(r, { id: "b1", state: "scheduled", recipient_count: 3, scheduled_for: NOW.toISOString(), moved_from: null, decision_id: "d1" });
});

test("never at 3 AM: a send asked for outside nine to twenty by the business's clock moves to the next nine, and the receipt says so", async () => {
  // 03:00 UTC is 23:00 the evening before in New York: outside the window, so
  // "now" itself moves to 09:00 New York (13:00 UTC) the same calendar day.
  const night = new Date("2026-09-07T03:00:00Z");
  const nine = new Date("2026-09-07T13:00:00Z");
  const f = fakes();
  const r = await createBroadcast(f.ports, { userId: "u1", body: { template_id: T1, audience: everyone }, now: night });
  assert.equal(r.scheduled_for, nine.toISOString(), "nine in the morning, by the business's clock");
  assert.equal(r.moved_from, night.toISOString(), "and it says what was asked for");
  assert.deepEqual(f.of("schedule")[0], ["schedule", "b1", nine]);
  assert.equal(f.of("create")[0][1].scheduled_for, nine.toISOString(), "the row says when it really goes");
  assert.equal(f.of("record")[0][4].moved_from, night.toISOString(), "the ledger keeps the move");
  // Asked for 05:30 New York (09:30 UTC): the same morning's nine.
  const early = new Date("2026-09-07T09:30:00Z");
  const r2 = await createBroadcast(fakes().ports, { userId: "u1", body: { template_id: T1, audience: everyone, scheduled_for: early.toISOString() }, now: NOW.getTime() < early.getTime() ? NOW : new Date(early.getTime() - 3_600_000) });
  assert.equal(r2.scheduled_for, nine.toISOString());
  assert.equal(r2.moved_from, early.toISOString());
  // Asked for 21:30 New York (01:30 UTC next day): nine the next morning.
  const late = new Date("2026-09-08T01:30:00Z");
  const r3 = await createBroadcast(fakes().ports, { userId: "u1", body: { template_id: T1, audience: everyone, scheduled_for: late.toISOString() }, now: NOW });
  assert.equal(r3.scheduled_for, new Date("2026-09-08T13:00:00Z").toISOString());
  // Inside the window nothing moves, and the receipt says so too.
  const r4 = await createBroadcast(fakes().ports, { userId: "u1", body: { template_id: T1, audience: everyone }, now: NOW });
  assert.equal(r4.scheduled_for, NOW.toISOString());
  assert.equal(r4.moved_from, null);
  assert.ok(!("moved_from" in fakes().of("record")), "nothing recorded about a move that did not happen");
  // An approval at night goes at nine as well.
  const a = fakes();
  const ap = await approveRun(a.ports, { row: { id: "b1", tenant_id: "t1", state: "pending_approval", name: "Win-back", recipient_count: 3, playbook_id: "p1" }, now: night });
  assert.deepEqual(a.of("schedule")[0], ["schedule", "b1", nine]);
  assert.equal(ap.scheduled_for, nine.toISOString());
  assert.equal(ap.moved_from, night.toISOString());
  assert.equal(a.of("record")[0][4].moved_from, night.toISOString());
});

test("cancel: scheduled withdraws the job; sending stops at the next batch; waiting is skipped; anything ended says how; a row that changed under them says so; each on the ledger", async () => {
  const row = (state) => ({ id: "b1", tenant_id: "t1", state, name: "Reminder" });
  const scheduled = fakes();
  const r = await cancelBroadcast(scheduled.ports, { row: row("scheduled") });
  assert.deepEqual(scheduled.log, [["cancel", "b1", "scheduled"], ["withdraw", "b1"], ["record", "broadcast", "b1", "cancel_broadcast", { name: "Reminder", was: "scheduled" }]], "the row first: a job withdrawn before a row that did not change would leave a run that never goes");
  assert.deepEqual(r, { id: "b1", state: "canceled", was: "scheduled", decision_id: "d1" });
  for (const state of ["sending", "pending_approval"]) {
    const f = fakes();
    assert.equal((await cancelBroadcast(f.ports, { row: row(state) })).was, state);
    assert.deepEqual(f.ops(), ["cancel", "record"], `${state}: no job to withdraw`);
  }
  for (const [state, said] of [["sent", "already been sent"], ["canceled", "already been canceled"], ["failed", "already failed"]]) {
    const f = fakes();
    await refused(cancelBroadcast(f.ports, { row: row(state) }), "conflict", 409, `This broadcast has ${said}.`);
    assert.deepEqual(f.ops(), []);
  }
  await refused(cancelBroadcast(fakes({ cancel: false }).ports, { row: row("sending") }), "conflict", 409, "This broadcast just changed state; look again.");
});

test("the playbook's check: the trigger first, then the template through the one judgement, the name when none was given, the whole numbers", async () => {
  await refused(checkPlaybook(fakes().ports, {}), "validation", 400, "Pick what starts it: win-back, welcome, save our number, the month's offer, a visit tomorrow, or a visit yesterday.");
  await refused(checkPlaybook(fakes().ports, { trigger: "quiet_30", template_id: "nope" }), "validation", 400, "Pick a template.");
  await refused(checkPlaybook(fakes({ template: template({ meta_status: "rejected" }) }).ports, { trigger: "quiet_30", template_id: T1 }), "conflict", 409, "not approved by WhatsApp");
  await refused(checkPlaybook(fakes({ template: template({ variables: ["1"] }), bookingLink: null }).ports, { trigger: "quiet_30", template_id: T1, params: ["@booking_link"] }), "conflict", 409, "This message takes the booking link, and none is on file.");
  // REGRESSION (C6): only a visit playbook has a visit to name; a win-back's visit slot reached nobody.
  await refused(checkPlaybook(fakes({ template: template({ variables: ["1"] }) }).ports, { trigger: "quiet_30", template_id: T1, params: ["@visit_service"] }), "validation", 400, "Only a visit reminder or an after-the-visit playbook can fill in a visit's time or service.");
  for (const trigger of ["visit_tomorrow", "visited"]) {
    const visit = await checkPlaybook(fakes({ template: template({ variables: ["1", "2"] }) }).ports, { trigger, template_id: T1, params: ["@visit_when", "@visit_service"] });
    assert.deepEqual(visit.params, [{ kind: "visit_when" }, { kind: "visit_service" }], `${trigger} fills a visit's words`);
  }
  const starter = starterForTrigger("quiet_30").name;
  const own = await checkPlaybook(fakes({ template: template({ name: starter }) }).ports, { trigger: "quiet_30", template_id: T1, params: [] });
  assert.deepEqual(own, { name: "Win-back", trigger: "quiet_30", template_id: T1, template_name: starter, template_language: "en_US", params: [], policy_class: "reengage", run_hour: 10, cap_per_run: 25, gap_days: 90, cadence_days: 30 }, "its own starter: the trigger's name alone, and the defaults");
  const given = await checkPlaybook(fakes({ template: template({ title: "Monthly offer" }) }).ports, { trigger: "everyone_monthly", template_id: T1, params: [], name: "  The   month's  offer " });
  assert.equal(given.name, "The month's offer", "given, its spaces made one");
  assert.equal(given.policy_class, "campaign");
  const titled = await checkPlaybook(fakes({ template: template({ title: "Monthly offer" }) }).ports, { trigger: "everyone_monthly", template_id: T1, params: [] });
  assert.equal(titled.name, `The month's offer · ${templateTitle("month_offer", "Monthly offer")}`, "another template: the trigger and the template's title");
  await refused(checkPlaybook(fakes().ports, { trigger: "quiet_30", template_id: T1, params: [], run_hour: 7 }), "validation", 400, "The hour must be a whole number from 9 to 20.");
  await refused(checkPlaybook(fakes().ports, { trigger: "quiet_30", template_id: T1, params: [], cap_per_run: 2.5 }), "validation", 400, "The cap must be a whole number from 1 to 500.");
  const nums = await checkPlaybook(fakes().ports, { trigger: "quiet_30", template_id: T1, params: [], run_hour: "18", cap_per_run: 5, gap_days: 30, cadence_days: 7 });
  assert.deepEqual([nums.run_hour, nums.cap_per_run, nums.gap_days, nums.cadence_days], [18, 5, 30, 7]);
});
