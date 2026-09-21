/**
 * A playbook's run says who it held back, and why -- the canvas's "186 of 312,
 * 94 never said yes to offers, 32 heard from a playbook this week".
 *
 * A run recorded how many it enrolled and nothing about the rest, so every
 * reach bar on a run to come was one full green bar, and the approval sheet
 * could only state the rules that made the list. The same function that picks
 * a run's people (eligibleForPlaybook) now counts the ones it leaves out, by
 * the first rule that leaves each one out, and the run keeps the count in its
 * audience when it is made -- so the counts are the run's, not a reading of
 * the lists taken later.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "@chanlytics/contracts";
import { importSrc } from "./_source.mjs";

const { runPlaybook } = await importSrc("packages/core/src/campaigns/run-playbook.ts");
const NOW = new Date("2026-09-06T14:00:00Z");
const D = 86_400_000;
const yes = { state: "opted_in", dnc: false, label: "Opted in", sub: "", source: "in_person", marketing: "opted_in", marketingSource: "in_person", marketingSub: "" };
/** Quiet for a while, said yes to both, with a number: the people a win-back is for. */
const person = (id, over = {}) => ({ id, state: "quiet", hasChat: true, calls: 0, phone: `+1555123000${id}`, consent: yes, lastContact: { ts: NOW.getTime() - 40 * D, label: "" }, ...over });
const people = [
  person("a", { lastContact: { ts: NOW.getTime() - 90 * D, label: "" } }),
  person("b", { consent: { ...yes, marketing: "unknown" } }),
  person("c", { phone: null }),
  person("d"),
  person("e"),
  person("f", { lastContact: { ts: NOW.getTime() - 60 * D, label: "" } }),
  person("g", { lastContact: { ts: NOW.getTime() - 35 * D, label: "" } }),
  person("h", { state: "active" }),
  person("i", { consent: { ...yes, dnc: true } }),
];
const touches = { byThis: new Map([["d", NOW.getTime() - 10 * D]]), byAny: new Map([["d", NOW.getTime() - 10 * D], ["e", NOW.getTime() - 3 * D]]) };
const winback = { trigger: "quiet_30", cap_per_run: 2, gap_days: 90, cadence_days: 30 };

test("the run's people and the ones it leaves out come from one pass: each held back once, by the first rule that holds them", () => {
  const r = C.reachOfPlaybook(people, winback, touches, NOW.getTime());
  assert.deepEqual(r.eligible.map((p) => p.id), ["a", "f"], "the longest unheard first, at most the cap");
  assert.deepEqual(r.eligible.map((p) => p.id), C.eligibleForPlaybook(people, winback, touches, NOW.getTime()).map((p) => p.id), "the same people eligibleForPlaybook picks");
  assert.equal(r.pool, 8, "everyone the trigger names: the quiet ones, whoever said what");
  assert.deepEqual(r.held, { no_number: 1, stopped: 1, no_yes: 1, gap: 1, week: 1, cap: 1 }, "a stop is not an answer never given");
  const held = Object.values(r.held).reduce((a, n) => a + n, 0);
  assert.equal(r.eligible.length + held, r.pool, "nobody counted twice, nobody lost");
});

test("a visit's reminder is the calendar's: no gap, no week's breath, no cap -- and its yes is to hearing from you", () => {
  const tz = "America/New_York";
  const tomorrow = C.localDate(tz, new Date(NOW.getTime() + D));
  const visitor = (id, over = {}) => person(id, { calendarTz: tz, nextVisitDate: tomorrow, nextVisitMs: NOW.getTime() + D, ...over });
  const rows = [visitor("v1"), visitor("v2", { consent: { ...yes, state: "unknown", marketing: "unknown" } }), visitor("v3", { phone: null }), person("x")];
  const r = C.reachOfPlaybook(rows, { trigger: "visit_tomorrow", cap_per_run: 1, gap_days: 90, cadence_days: 30 }, { byThis: new Map([["v1", NOW.getTime() - D]]), byAny: new Map([["v1", NOW.getTime() - D]]) }, NOW.getTime());
  assert.deepEqual(r.eligible.map((p) => p.id), ["v1"], "a reminder goes whatever else they heard this week");
  assert.equal(r.pool, 3, "everyone with a visit tomorrow");
  assert.deepEqual(r.held, { no_number: 1, stopped: 0, no_yes: 1, gap: 0, week: 0, cap: 0 });
});

test("the words for who was held back, as the canvas says them -- the answer they never gave, then the rules that waited them", () => {
  // The record says its own purpose and gap, so its words need nothing else read.
  const reach = { pool: 312, purpose: "marketing", gap_days: 90, held: { no_yes: 94, stopped: 0, no_number: 0, week: 32, gap: 0, cap: 0, limit: 0 } };
  assert.deepEqual(C.reachWords(reach), ["94 never said yes to offers", "32 heard from a playbook this week"]);
  assert.deepEqual(C.reachWords({ pool: 10, purpose: "conversational", gap_days: 90, held: { no_yes: 1, stopped: 1, no_number: 2, week: 0, gap: 3, cap: 1, limit: 1 } }),
    ["1 never said yes to hearing from you", "1 asked to stop", "2 have no number", "3 heard from this playbook in the last 90 days", "1 waits for the next run", "1 over the number's daily limit"]);
  // The grey part of the bar is the answer never given; the amber, the rules that made them wait.
  assert.deepEqual(C.reachSplit(reach), { never: 94, waiting: 32 });
});

test("a run keeps who it held back, in its audience, when it is made -- the number's daily limit included", async () => {
  const log = [];
  const ports = {};
  const answers = { template: { meta_status: "approved" }, alreadyRan: false, create: "b1" };
  for (const name of ["template", "alreadyRan", "record", "create", "enrol", "fail", "schedule", "decide", "notify"]) {
    ports[name] = async (...args) => { log.push([name, ...args]); return answers[name]; };
  }
  // The runner's touches are keyed by playbook first: this playbook's own, and any playbook's.
  const ctx = { tz: "America/New_York", now: NOW, people, modes: new Map([["reengage", "ask"]]), health: C.numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }), touches: { byThis: new Map([["p1", touches.byThis]]), byAny: touches.byAny }, calendar: "none", visits: new Map() };
  const playbook = { id: "p1", tenant_id: "t1", name: "Win-back", template_id: "tpl-1", template_name: "winback_offer", template_language: "en_US", params: [{ kind: "first_name" }], policy_class: "reengage", state: "running", run_hour: 10, created_by: "owner", last_run_for: null, ...winback };
  await runPlaybook(ports, { playbook, ctx, runFor: "2026-09-06", by: { kind: "system" } });
  const made = log.find((l) => l[0] === "create")[1];
  assert.deepEqual(made.audience, { kind: "playbook", id: "p1", label: "Win-back", reach: { pool: 8, purpose: "marketing", gap_days: 90, held: { no_number: 1, stopped: 1, no_yes: 1, gap: 1, week: 1, cap: 1, limit: 0 } } });
  assert.equal(made.recipient_count, 2);
});

test("a run waiting on you says how many of how many, and who waits and why, when it kept them -- and the rules, when it is older than that", () => {
  const run = (audience) => ({ recipient_count: 2, run_for: "2026-09-06", params: [], audience });
  const opts = { playbook: winback, businessName: "Melany Studio", today: "2026-09-06", open: { time: "10:00", moved: false }, day: (x) => x };
  const kept = C.toApprovalVM({ broadcast: run({ kind: "playbook", id: "p1", label: "Win-back", reach: { pool: 8, purpose: "marketing", gap_days: 90, held: { no_number: 1, stopped: 1, no_yes: 1, gap: 1, week: 1, cap: 1, limit: 0 } } }), recipients: [] }, { ...opts, playbook: null });
  assert.equal(kept.pool, 8);
  assert.deepEqual(kept.split, { never: 3, waiting: 3 });
  assert.deepEqual(kept.rules, ["1 never said yes to offers", "1 asked to stop", "1 has no number", "1 heard from a playbook this week", "1 heard from this playbook in the last 90 days", "1 waits for the next run"], "from the run's own record, the playbook unread");
  const older = C.toApprovalVM({ broadcast: run({ kind: "playbook", id: "p1", label: "Win-back" }), recipients: [] }, opts);
  assert.equal(older.pool, null, "a run made before it kept them says no pool it does not have");
  assert.ok(older.rules.includes("none heard from any playbook this week"), "and the rules instead");
});
