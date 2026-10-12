/**
 * A campaign runs on trial, and ends (00409 `trial_until`, `until`), EXECUTED: contracts effectiveMode, the one reading of
 * the mode a run goes under (auto waits for a person, as veto does, until the trial ends; every other mode is its own);
 * core runPlaybook over fakes that log their calls, a run on trial planned and told as veto ("on trial until"), a run on a
 * day past the campaign's last recorded once as `ended` with nothing read or sent; and Campaigns' home, which reads both
 * off GET playbooks' answer on the business's clock (contracts lifecyclePlaybooksOf) and says them as the campaign's
 * state ("Ended Oct 1", "On trial until Oct 9").
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

const { runPlaybook } = await importSrc("packages/core/src/campaigns/run-playbook.ts");
const { effectiveMode, LIFECYCLE_WORDS, PLAYBOOK_VETO_DELAY_MS, channelsReady, numberHealth, vetoRunNotice } = C;

const TZ = "America/New_York";
/** Sunday 6 Sep 2026, 10:00 AM in New York. */
const NOW = new Date("2026-09-06T14:00:00Z");
const D = 86_400_000;

/* ------------------------------------------------------------------------------------- the mode a run goes under -- */

test("effectiveMode: auto waits for a person, as veto does, until the trial ends; veto, ask and never are their own; no trial, a trial that is over or a value that is no instant is no trial", () => {
  const trial = { trial_until: "2026-10-18T14:00:00Z" };
  const before = new Date("2026-10-18T13:59:59Z");
  assert.equal(effectiveMode(trial, "auto", before), "veto");
  assert.equal(effectiveMode(trial, "auto", new Date("2026-10-18T14:00:00Z")), "auto", "the trial is over at its end");
  assert.equal(effectiveMode(trial, "auto", new Date("2026-10-19T09:00:00Z")), "auto");
  for (const mode of ["veto", "ask", "never"]) assert.equal(effectiveMode(trial, mode, before), mode, mode);
  assert.equal(effectiveMode({ trial_until: null }, "auto", before), "auto");
  assert.equal(effectiveMode({}, "auto", before), "auto", "a row read before 00409 has no trial");
  assert.equal(effectiveMode({ trial_until: "next week" }, "auto", before), "auto");
  // The same instant however it is spelled: ten in New York is two in the afternoon UTC.
  assert.equal(effectiveMode({ trial_until: "2026-10-18T10:00:00-04:00" }, "auto", before), "veto");
});

/* -------------------------------------------------------------------------------------------------- the run -- */

/** A person as the People page reads them: quiet for 40 days, said yes to both. */
const person = (id, quietDays = 40) => ({
  id,
  state: "quiet",
  hasChat: true,
  calls: 0,
  phone: id === "a" ? "+13055550101" : "+13055550102",
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
  lastContact: { ts: NOW.getTime() - quietDays * D, label: "" },
  heardDays: quietDays,
});
/** A win-back by silence, running at ten under the class reengage. */
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
  until: null,
  trial_until: null,
  ...over,
});
const context = (over = {}) => ({
  tz: TZ,
  now: NOW,
  people: [person("a"), person("b", 90)],
  modes: new Map([["reengage", "auto"]]),
  health: numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }),
  ready: channelsReady({
    whatsapp: { canSend: true, refusal: null },
    textLine: null,
    email: { mailbox: false, domain: false },
  }),
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
/** Meta's approved row of the message, as db messageVersionRowsOf answers it. */
const approved = (name, language) => [
  {
    id: "tpl-1",
    channel: "whatsapp",
    name,
    language,
    meta_status: "approved",
    category: null,
    variables: [],
    hidden_at: null,
    title: null,
    source: "meta",
    components: [],
    body_preview: null,
    rejected_reason: null,
  },
];
const WRITES = new Set(["record", "assemble", "holdRecipients", "notify"]);
/** Every port answers a value or a function of its arguments; the writes log their call, and every call is counted. */
function fakes() {
  const log = [];
  const asked = [];
  const answers = {
    message: approved,
    alreadyRan: false,
    record: undefined,
    assemble: (_row, _recipients, _sendAt, decision) => ({ id: "b1", decisionId: decision ? "d1" : null }),
    monthSent: 0,
    holdRecipients: (_id, ids) => ({ skipped: ids, error: null }),
    notify: undefined,
  };
  const ports = {};
  for (const [name, answer] of Object.entries(answers)) {
    ports[name] = async (...args) => {
      asked.push(name);
      if (WRITES.has(name)) log.push([name, ...args]);
      return typeof answer === "function" ? answer(...args) : answer;
    };
  }
  return { ports, log, asked, ops: () => log.map((l) => l[0]), of: (name) => log.filter((l) => l[0] === name) };
}

test("a run on trial is planned as veto: the send half an hour ahead with a Stop, the ledger and the run's record say veto, and the owner is told it is on trial until its day, by the business's clock", async () => {
  const f = fakes();
  const out = await runPlaybook(f.ports, cmd({ playbook: playbook({ trial_until: "2026-09-13T14:00:00Z" }) }));
  const at = new Date(NOW.getTime() + PLAYBOOK_VETO_DELAY_MS);
  assert.deepEqual(out, {
    outcome: "sent",
    broadcast_id: "b1",
    eligible: 2,
    mode: "veto",
    state: "scheduled",
    scheduled_for: at.toISOString(),
    moved_from: null,
  });
  assert.deepEqual(f.ops(), ["assemble", "notify", "record"]);
  assert.deepEqual(f.of("assemble")[0][3], at);
  assert.equal(f.of("assemble")[0][4].payload.mode, "veto", "the system's decision names the mode it ran under");
  assert.equal(f.of("record")[0][4].mode, "veto");
  const told = vetoRunNotice("Win-back", 2, "today 10:30 AM", "Sep 13");
  assert.deepEqual(f.of("notify")[0].slice(1), [told.subject, told.body, "b1"]);
  assert.equal(told.subject, "Campaign “Win-back” sends today 10:30 AM: 2 people");
  assert.equal(
    told.body,
    "2 people will be sent “Win-back” today 10:30 AM. Stop the run on Today or in Campaigns before then if it should not go. “Win-back” is on trial until Sep 13: until then each of its runs waits 30 minutes for you to stop it, and after it they send on their own.",
  );
});

test("the trial changes auto alone: past its end a run sends at once and nobody is told; a class set to veto is told as veto always was; ask still waits; a person's Run now sends now", async () => {
  const over = fakes();
  const done = await runPlaybook(over.ports, cmd({ playbook: playbook({ trial_until: "2026-09-06T13:59:00Z" }) }));
  assert.equal(done.mode, "auto");
  assert.deepEqual(over.of("assemble")[0][3], NOW, "sent at once");
  assert.ok(!over.ops().includes("notify"));

  const veto = fakes();
  const trial = { playbook: playbook({ trial_until: "2026-09-13T14:00:00Z" }) };
  await runPlaybook(veto.ports, cmd({ ...trial, ctx: context({ modes: new Map([["reengage", "veto"]]) }) }));
  const told = vetoRunNotice("Win-back", 2, "today 10:30 AM", null);
  assert.deepEqual(veto.of("notify")[0].slice(1), [told.subject, told.body, "b1"], "the trial did not make it veto");
  assert.ok(!told.body.includes("on trial"));

  const ask = fakes();
  const held = await runPlaybook(ask.ports, cmd({ ...trial, ctx: context({ modes: new Map([["reengage", "ask"]]) }) }));
  assert.deepEqual([held.outcome, held.mode], ["held", "ask"]);

  const asked = fakes();
  const now = await runPlaybook(asked.ports, cmd({ ...trial, by: { kind: "user", userId: "u1" } }));
  assert.deepEqual([now.outcome, now.scheduled_for], ["sent", NOW.toISOString()], "a person who asks has decided");
  assert.ok(!asked.ops().includes("notify"), "and is not told of their own run");
});

test("a run on a day past the campaign's last is off as ended: recorded once, nothing read and nothing sent; on its last day it runs; the day is the business's, never UTC's", async () => {
  const ended = fakes();
  const out = await runPlaybook(ended.ports, cmd({ playbook: playbook({ until: "2026-09-05" }) }));
  assert.deepEqual(out, { outcome: "off", mode: "auto", skipped: "ended" });
  assert.deepEqual(ended.log, [
    ["record", "p1", "2026-09-06", NOW, { run_for: "2026-09-06", by: "system", mode: "auto", skipped: "ended" }],
  ]);
  assert.deepEqual(ended.asked, ["record"], "neither the message nor the day's run is asked about");

  const last = fakes();
  assert.equal((await runPlaybook(last.ports, cmd({ playbook: playbook({ until: "2026-09-06" }) }))).outcome, "sent");

  // 11:30 PM on the 6th in New York is the 7th in UTC: still its last day.
  const late = fakes();
  const lateCmd = cmd({
    playbook: playbook({ until: "2026-09-06" }),
    ctx: context({ now: new Date("2026-09-07T03:30:00Z") }),
    runFor: undefined,
  });
  assert.equal((await runPlaybook(late.ports, lateCmd)).outcome, "sent");
  // Half past midnight on the 7th in New York: past it.
  const next = fakes();
  const nextCmd = cmd({
    playbook: playbook({ until: "2026-09-06" }),
    ctx: context({ now: new Date("2026-09-07T04:30:00Z") }),
    runFor: undefined,
  });
  assert.equal((await runPlaybook(next.ports, nextCmd)).skipped, "ended");

  // A person's Run now on a campaign that has ended runs nothing either, and says why.
  const asked = fakes();
  const theirs = cmd({ playbook: playbook({ until: "2026-09-05" }), by: { kind: "user", userId: "u1" } });
  assert.deepEqual(await runPlaybook(asked.ports, theirs), { outcome: "off", mode: "auto", skipped: "ended" });
  assert.deepEqual(asked.ops(), ["record"]);
});

/* -------------------------------------------------------------------------------------------- Campaigns' home -- */

/** Friday 2 Oct 2026, 9:44 PM in New York: already Saturday the 3rd in UTC. */
const HOME_NOW = new Date("2026-10-03T01:44:00Z");

test("the home reads a campaign's end and its trial off GET playbooks' answer, on the business's clock: ended the day after its last, on trial until the day its trial ends while it has not", () => {
  const row = (id, over) => ({
    id,
    trigger: "quiet_30",
    state: "running",
    run_hour: 10,
    last_run_for: null,
    list_id: null,
    list_key: null,
    ...over,
  });
  const read = C.lifecyclePlaybooksOf(
    {
      playbooks: [
        row("today", { until: "2026-10-02" }),
        row("yesterday", { until: "2026-10-01" }),
        row("trial", { trial_until: "2026-10-09T14:00:00Z" }),
        row("over", { trial_until: "2026-10-03T01:00:00Z" }),
        row("plain", {}),
      ],
      timezone: TZ,
      calendar: "feed",
    },
    HOME_NOW,
  );
  const card = (id) => read.cards.find((c) => c.playbook.id === id).read;
  assert.deepEqual([card("today").ended, card("today").off], [null, null], "the 2nd is still today in New York");
  assert.deepEqual([card("yesterday").ended, card("yesterday").off], ["Oct 1", LIFECYCLE_WORDS.ended("Oct 1")]);
  assert.equal(card("trial").trial, "Oct 9");
  assert.equal(card("over").trial, null, "a trial that has ended is no trial");
  assert.deepEqual([card("plain").ended, card("plain").trial], [null, null]);
  assert.equal(LIFECYCLE_WORDS.ended("Oct 1"), "Ended Oct 1");
  assert.equal(LIFECYCLE_WORDS.onTrial("Oct 9"), "On trial until Oct 9");
});

/** A playbook as the playbooks surface's card holds it. */
const card = (over = {}) => ({
  id: "pb-1",
  name: "Win-back",
  trigger: "quiet_30",
  state: "running",
  run_hour: 10,
  cadence_days: 30,
  cap_per_run: 25,
  last_run_for: "2026-09-14",
  next: "tomorrow 10:00 AM",
  triggerLabel: "Win-back",
  candidates: 4,
  held: 0,
  named: { pool: 5, saidYes: 4 },
  off: null,
  ended: null,
  trial: null,
  totals: { waiting: null },
  ...over,
});
/** The home over these cards, the win-back's class sending on its own (GET playbooks' `modes`). */
const homeOf = (rows) =>
  C.campaignsHomeOf({
    nowMs: HOME_NOW.getTime(),
    tz: TZ,
    playbooks: {
      rows,
      pools: { quiet_30: { candidates: 4, held: 0, pool: 5, saidYes: 4 } },
      triggers: [{ id: "quiet_30", offered: true, candidates: 0, named: null }],
      timezone: TZ,
      countsRead: true,
      modes: { reengage: "auto" },
    },
    broadcasts: {
      rows: [],
      number: { present: true },
      optIn: { phrase: "YES OFFERS", link: null },
      reach: { people: 29, canHear: 7, saidMessages: 7, saidOffers: 4 },
    },
    library: [],
    messages: [],
    reachOuts: [],
    report: undefined,
    shape: { calendar: "feed", dealsOn: false, word: "appointment" },
    chains: undefined,
  });

test("the ledger says it: a campaign past its last day reads Ended with its day, runs nothing and promises no run; one on trial reads On trial until with its day, and is on", () => {
  const ended = card({ ended: "Oct 1", off: LIFECYCLE_WORDS.ended("Oct 1") });
  const trial = card({ id: "pb-2", name: "Win-back, gently", trial: "Oct 9" });
  const home = homeOf([ended, trial]);
  const row = (id) => home.ledger.groups.flatMap((g) => g.rows).find((r) => r.id === id);
  const e = row("pb-1");
  assert.deepEqual(
    [e.stateWords, e.phoneWords, e.status, e.tone, e.next.words, e.next.atMs],
    ["Ended Oct 1", "Ended Oct 1", "not_here", "plain", LIFECYCLE_WORDS.ledger.dash, null],
  );
  assert.equal(e.hint, "Nothing heard in 30 days", "its line says its moment, not its end twice");
  const t = row("pb-2");
  assert.deepEqual(
    [t.stateWords, t.phoneWords, t.status, t.tone],
    ["On trial until Oct 9", "On trial until Oct 9", "on", "ok"],
  );
  assert.ok(!home.coming.rows.some((r) => r.id === "moment:pb-1"), "an ended campaign is coming up nowhere");
  assert.ok(
    home.coming.rows.some((r) => r.id === "moment:pb-2"),
    "one on trial runs as it would",
  );
  // Paused, and waiting on a person, say so first: the trial is no news beside either. Its Resume never says a campaign
  // on trial sends on its own: its runs still wait for a person until the trial ends.
  const paused = homeOf([card({ trial: "Oct 9", state: "paused" })]);
  const resting = paused.ledger.groups.flatMap((g) => g.rows).find((r) => r.id === "pb-1");
  assert.equal(resting.stateWords, "Paused");
  assert.ok(!resting.act.ask.detail.includes(LIFECYCLE_WORDS.ledger.resume.auto), resting.act.ask.detail);
  const plainPause = homeOf([card({ state: "paused" })])
    .ledger.groups.flatMap((g) => g.rows)
    .find((r) => r.id === "pb-1");
  assert.ok(plainPause.act.ask.detail.endsWith(LIFECYCLE_WORDS.ledger.resume.auto), "off trial, auto says so in full");
  const waits = homeOf([card({ trial: "Oct 9", totals: { waiting: { id: "r-1", recipient_count: 7 } } })]);
  assert.equal(waits.ledger.groups.flatMap((g) => g.rows).find((r) => r.id === "pb-1").stateWords, "Waiting on you");
});
