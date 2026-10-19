/**
 * A step's new words wait for an OK, and a campaign ends (decision 0064's `words_ok_at`, 00416's `until`), EXECUTED:
 * contracts batchModeOf, the one reading of the mode a batch goes under (ask while its step's words are new to the owner,
 * else its sequence's own, and ask for one it does not know); core runPlaybook over fakes that log their calls, a batch of
 * new words held for an OK under every mode and, once seen, planned and told by its sequence's mode, a run on a day past
 * the campaign's last recorded once as `ended` with nothing read or sent; and Campaigns' home, which reads the end off GET
 * playbooks' answer on the business's clock (contracts lifecyclePlaybooksOf) and says it as the campaign's state ("Ended
 * Oct 1"), and whose Resume says what the next batch does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

const { runPlaybook } = await importSrc("packages/core/src/campaigns/run-playbook.ts");
const { batchModeOf, LIFECYCLE_WORDS, PLAYBOOK_VETO_DELAY_MS, channelsReady, numberHealth, vetoRunNotice } = C;

const TZ = "America/New_York";
/** Sunday 6 Sep 2026, 10:00 AM in New York. */
const NOW = new Date("2026-09-06T14:00:00Z");
const D = 86_400_000;

/* ------------------------------------------------------------------------------------- the mode a batch goes under -- */

const SEEN = "2026-09-01T10:00:00.000Z";

test("batchModeOf: a step whose words are new waits for an OK whatever its mode; once seen, its sequence's mode; a mode it does not know asks", () => {
  for (const mode of ["auto", "veto", "ask", null, undefined])
    assert.equal(batchModeOf({ mode, words_ok_at: null }), "ask", String(mode));
  for (const mode of ["auto", "veto", "ask"]) assert.equal(batchModeOf({ mode, words_ok_at: SEEN }), mode, mode);
  for (const mode of ["never", "sometimes", null, undefined])
    assert.equal(batchModeOf({ mode, words_ok_at: SEEN }), "ask", `${String(mode)} is no mode a sequence takes`);
  assert.equal(batchModeOf({ mode: "auto", words_ok_at: undefined }), "ask", "a row read before 00461 asks");
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
  mode: "auto",
  words_ok_at: SEEN,
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  created_by: "owner",
  last_run_for: null,
  until: null,
  ...over,
});
const context = (over = {}) => ({
  tz: TZ,
  now: NOW,
  people: [person("a"), person("b", 90)],
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

test("a batch of new words waits for an OK under every mode, and the owner is told it is ready; nothing is scheduled", async () => {
  for (const mode of ["auto", "veto", "ask"]) {
    const f = fakes();
    const out = await runPlaybook(f.ports, cmd({ playbook: playbook({ mode, words_ok_at: null }) }));
    assert.deepEqual(
      out,
      { outcome: "held", broadcast_id: "b1", eligible: 2, mode: "ask", state: "pending_approval" },
      mode,
    );
    assert.deepEqual(f.ops(), ["assemble", "notify", "record"], mode);
    assert.equal(f.of("assemble")[0][3], null, `${mode}: no job until a person approves it`);
    assert.equal(f.of("notify")[0][1], "Campaign “Win-back” is ready: 2 people");
  }
});

test("once its words are seen, a batch goes by its sequence's mode: auto at once and untold, veto half an hour ahead and told, ask waits; a person's Run now sends now", async () => {
  const auto = fakes();
  const sent = await runPlaybook(auto.ports, cmd());
  assert.equal(sent.mode, "auto");
  assert.deepEqual(auto.of("assemble")[0][3], NOW, "sent at once");
  assert.ok(!auto.ops().includes("notify"));

  const veto = fakes();
  const held = await runPlaybook(veto.ports, cmd({ playbook: playbook({ mode: "veto" }) }));
  const at = new Date(NOW.getTime() + PLAYBOOK_VETO_DELAY_MS);
  assert.deepEqual([held.outcome, held.mode, held.scheduled_for], ["sent", "veto", at.toISOString()]);
  assert.equal(veto.of("assemble")[0][4].payload.mode, "veto", "the system's decision names the mode it ran under");
  assert.equal(veto.of("record")[0][4].mode, "veto");
  const told = vetoRunNotice("Win-back", 2, "today 10:30 AM");
  assert.deepEqual(veto.of("notify")[0].slice(1), [told.subject, told.body, "b1"]);
  // How its wait ends is the wait rule's (decision 0064, step 2): it goes at its time unless it is stopped.
  assert.equal(
    told.body,
    "2 people will be sent “Win-back”. Goes today 10:30 AM unless you stop it, from Today or its run.",
  );

  const ask = fakes();
  const waits = await runPlaybook(ask.ports, cmd({ playbook: playbook({ mode: "ask" }) }));
  assert.deepEqual([waits.outcome, waits.mode], ["held", "ask"]);

  const asked = fakes();
  const now = await runPlaybook(
    asked.ports,
    cmd({ playbook: playbook({ mode: "ask" }), by: { kind: "user", userId: "u1" } }),
  );
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

test("the home reads a campaign's end off GET playbooks' answer, on the business's clock: ended the day after its last", () => {
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
      playbooks: [row("today", { until: "2026-10-02" }), row("yesterday", { until: "2026-10-01" }), row("plain", {})],
      timezone: TZ,
      calendar: "feed",
    },
    HOME_NOW,
  );
  const card = (id) => read.cards.find((c) => c.playbook.id === id).read;
  assert.deepEqual([card("today").ended, card("today").off], [null, null], "the 2nd is still today in New York");
  assert.deepEqual([card("yesterday").ended, card("yesterday").off], ["Oct 1", LIFECYCLE_WORDS.ended("Oct 1")]);
  assert.equal(card("plain").ended, null);
  assert.equal(LIFECYCLE_WORDS.ended("Oct 1"), "Ended Oct 1");
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
  mode: "auto",
  words_ok_at: SEEN,
  totals: { waiting: null },
  ...over,
});
/** The home over these cards, each with its sequence's own mode (GET playbooks' rows, decision 0064). */
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
    shape: { calendar: "feed", hasDeals: false, word: "appointment" },
    chains: undefined,
  });

test("the ledger says it: a campaign past its last day reads Ended with its day, runs nothing and promises no run; Resume says what its next batch does", () => {
  const ended = card({ ended: "Oct 1", off: LIFECYCLE_WORDS.ended("Oct 1") });
  const home = homeOf([ended]);
  const row = (h, id) => h.ledger.groups.flatMap((g) => g.rows).find((r) => r.id === id);
  const e = row(home, "pb-1");
  assert.deepEqual(
    [e.stateWords, e.phoneWords, e.status, e.tone, e.next.words, e.next.atMs],
    ["Ended Oct 1", "Ended Oct 1", "not_here", "plain", LIFECYCLE_WORDS.ledger.dash, null],
  );
  assert.equal(e.hint, "Nothing heard in 30 days", "its line says its moment, not its end twice");
  assert.ok(!home.coming.rows.some((r) => r.id === "moment:pb-1"), "an ended campaign is coming up nowhere");
  // Paused: its Resume says in full that it sends on its own where it does, that its first batch waits where its words
  // are new (decision 0064), and nothing where it holds or asks.
  const resume = (over) => row(homeOf([card({ state: "paused", ...over })]), "pb-1").act.ask.detail;
  assert.ok(resume({}).endsWith(LIFECYCLE_WORDS.ledger.resume.auto), resume({}));
  assert.ok(resume({ words_ok_at: null }).endsWith(LIFECYCLE_WORDS.ledger.resume.asksFirst), "new words wait first");
  assert.ok(!resume({ mode: "veto" }).includes(LIFECYCLE_WORDS.ledger.resume.auto));
  assert.ok(!resume({ mode: undefined }).includes(LIFECYCLE_WORDS.ledger.resume.auto), "unread, no mode is guessed");
  const waits = homeOf([card({ totals: { waiting: { id: "r-1", recipient_count: 7 } } })]);
  assert.equal(row(waits, "pb-1").stateWords, C.RUN_WAITING_WORDS);
});
