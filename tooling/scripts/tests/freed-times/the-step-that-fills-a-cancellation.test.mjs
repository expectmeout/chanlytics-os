/**
 * The step that fills a cancellation (decision 0082): checked as every step is (core checkPlaybook: the moment, where a
 * calendar is connected, under the follow-ups' class, its message naming the freed time), and run by the event that
 * freed a time, never by the hour (core runPlaybook with a freed time): the people who asked and never booked, the most
 * recent first, at most its cap, each held by the week's breath and the step's gap; the batch keeps the time it offers;
 * a time that has begun by the moment the batch would go is not offered. Over fakes that log their calls.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FREED_TIME_NEEDS_WHEN, PEOPLE_LISTS, channelsReady, numberHealth } from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";

const { checkPlaybook } = await importSrc("packages/core/src/campaigns/check-playbook.ts");
const { runPlaybook } = await importSrc("packages/core/src/campaigns/run-playbook.ts");

/** Sunday 6 September 2026, 10:00 AM in New York: inside the sending hours. */
const NOW = new Date("2026-09-06T14:00:00Z");
const TZ = "America/New_York";
const D = 86_400_000;
const T1 = "77777777-7777-4777-8777-777777777771";
/** Tuesday 8 September, 3:00 to 4:00 PM in New York: the time an appointment's cancellation freed. */
const FREED = { from: "appt-1", start: Date.parse("2026-09-08T19:00:00Z"), end: Date.parse("2026-09-08T20:00:00Z") };

/** WhatsApp's row of a message, as Meta holds it (db messageVersionRowsOf). */
const template = (over = {}) => ({
  id: T1,
  channel: "whatsapp",
  name: "time_freed",
  language: "en_US",
  meta_status: "approved",
  category: "utility",
  variables: [],
  hidden_at: null,
  title: null,
  source: "meta",
  components: [],
  body_preview: null,
  rejected_reason: null,
  ...over,
});

/** A person as the People page reads them, said yes to both; `askedNotBooked` puts them on the step's list. */
const person = (id, over = {}) => ({
  id,
  state: "quiet",
  hasChat: true,
  calls: 0,
  phone: `+1555123000${id.charCodeAt(0) % 10}`,
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
  heardDays: 40,
  ...over,
});
/** Who asked and never booked, and when they were last in touch. */
const asker = (id, daysAgo) =>
  person(id, { askedNotBooked: true, lastContact: { ts: NOW.getTime() - daysAgo * D, label: "" }, heardDays: daysAgo });

/* -------------------------------------------------------------------------------------------------- the check -- */

/** The check's ports: the message the id names, a calendar connected unless a case says not, "visit" as the word. */
function checkPorts(over = {}) {
  const answers = {
    message: (id) => (id === T1 ? [template()] : []),
    bookingLink: "https://book.example/m",
    people: [],
    list: (ref) => {
      const l = ref.kind === "builtin" ? PEOPLE_LISTS.find((x) => x.id === ref.id) : null;
      return l ? { label: l.label, memberIds: [] } : null;
    },
    calendarOn: true,
    appointmentWord: "visit",
    ...over,
  };
  return Object.fromEntries(
    Object.entries(answers).map(([name, answer]) => [
      name,
      async (...args) => (typeof answer === "function" ? answer(...args) : answer),
    ]),
  );
}
async function refused(p, words) {
  await assert.rejects(p, (e) => {
    assert.deepEqual([e.code, e.status], ["validation", 400], e.message);
    assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}

test("the step is checked as every step is: its own name, the follow-ups' class, four people a time and a week's gap", async () => {
  const freed = template({ variables: ["1", "2", "3"] });
  const opened = await checkPlaybook(checkPorts({ message: (id) => (id === T1 ? [freed] : []) }), {
    trigger: "slot_opened",
    template_id: T1,
    params: ["@first_name", "@business_name", "@freed_when"],
  });
  assert.deepEqual(
    [opened.name, opened.policy_class, opened.params],
    ["Fill a cancellation", "follow_up", [{ kind: "first_name" }, { kind: "business_name" }, { kind: "freed_when" }]],
    "its own starter: the moment's name, the follow-ups' class, and the time each batch keeps",
  );
  assert.deepEqual(
    [opened.cap_per_run, opened.gap_days],
    [4, 7],
    "four people a freed time, and a week before anyone hears of another, where none is asked for",
  );
});

test("a step whose message does not say the time is refused, and only its batch knows a freed time", async () => {
  const oneSlot = template({ variables: ["1"] });
  await refused(
    checkPlaybook(checkPorts({ message: (id) => (id === T1 ? [oneSlot] : []) }), {
      trigger: "slot_opened",
      template_id: T1,
      params: ["@first_name"],
    }),
    FREED_TIME_NEEDS_WHEN,
  );
  const offer = template({ variables: ["1"], category: "marketing", name: "month_offer" });
  await refused(
    checkPlaybook(checkPorts({ message: (id) => (id === T1 ? [offer] : []), calendarOn: false }), {
      trigger: "quiet_30",
      template_id: T1,
      params: ["@freed_when"],
    }),
    "Only filling a cancellation can fill in the freed time.",
  );
});

/* ---------------------------------------------------------------------------------------------------- the run -- */

/** A step on the moment, as its sequence holds it: the starter's three values, two people a time, a week's gap. */
const freedStep = (over = {}) => ({
  id: "pf",
  tenant_id: "t1",
  name: "Fill a cancellation",
  trigger: "slot_opened",
  template_id: T1,
  template_name: "time_freed",
  template_language: "en_US",
  params: [{ kind: "first_name" }, { kind: "business_name" }, { kind: "freed_when" }],
  policy_class: "follow_up",
  mode: "auto",
  words_ok_at: "2026-09-01T10:00:00.000Z",
  state: "running",
  run_hour: 10,
  cap_per_run: 2,
  gap_days: 7,
  cadence_days: 30,
  created_by: "owner",
  last_run_for: null,
  ...over,
});
const context = (over = {}) => ({
  tz: TZ,
  now: NOW,
  people: [],
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
  playbook: freedStep(),
  ctx: context(),
  runFor: "2026-09-06",
  by: { kind: "system" },
  ...over,
});
const WRITES = new Set(["record", "assemble", "holdRecipients", "notify"]);
/** The run's ports, its writes logged as [name, ...args]; a day's run already made answers `alreadyRan`. */
function runPorts({ alreadyRan = false } = {}) {
  const log = [];
  const answers = {
    message: (name, language) => [template({ name, language })],
    alreadyRan,
    record: undefined,
    assemble: (_row, _recipients, _sendAt, decision) => ({ id: "b1", decisionId: decision ? "d1" : null }),
    monthSent: 0,
    holdRecipients: (_id, ids) => ({ skipped: ids, error: null }),
    notify: undefined,
  };
  const ports = {};
  for (const [name, answer] of Object.entries(answers))
    ports[name] = async (...args) => {
      if (WRITES.has(name)) log.push([name, ...args]);
      return typeof answer === "function" ? answer(...args) : answer;
    };
  return { ports, ops: () => log.map((l) => l[0]), of: (name) => log.filter((l) => l[0] === name) };
}

test("the run offers the time to whoever asked and never booked, the most recent first, at most its cap; the batch keeps the time", async () => {
  const f = runPorts({ alreadyRan: true });
  const ctx = context({
    people: [
      asker("a", 2),
      asker("b", 10),
      asker("c", 1),
      person("d", { lastContact: { ts: NOW.getTime() - D, label: "" } }),
    ],
  });
  const out = await runPlaybook(f.ports, cmd({ ctx, freed: FREED }));
  assert.equal(out.outcome, "sent", "a day's run already made never holds a freed time: it has no day of its own");
  const [, row, recipients] = f.of("assemble")[0];
  assert.deepEqual(
    recipients.map((r) => r.contact_id),
    ["c", "a"],
    "the one who asked yesterday, then two days ago; the third waits for the next time, and who never asked is not named",
  );
  assert.equal(row.name, "Fill a cancellation · Tue, Sep 8, 3:00 PM", "by its date: a name is kept");
  assert.equal(row.run_for, undefined, "no day of its own: the one-run-a-day index never holds it");
  assert.deepEqual(
    [row.offered_start, row.offered_end, row.offered_from],
    ["2026-09-08T19:00:00.000Z", "2026-09-08T20:00:00.000Z", "appt-1"],
  );
  assert.deepEqual(recipients[0].facts, {
    freed_when: "on Tuesday at 3:00 PM",
    appointment: "appt-1",
    offered_start: "2026-09-08T19:00:00.000Z",
    offered_end: "2026-09-08T20:00:00.000Z",
  });
  assert.equal(row.audience.trigger, "slot_opened");
});

test("the week's breath and the step's own gap hold whoever heard, as every moment's do", async () => {
  const f = runPorts();
  const ctx = context({
    people: [asker("a", 2), asker("b", 3), asker("c", 4)],
    touches: {
      byThis: new Map([["pf", new Map([["b", NOW.getTime() - 3 * D]])]]),
      byAny: new Map([["a", NOW.getTime() - 2 * D]]),
    },
  });
  await runPlaybook(f.ports, cmd({ playbook: freedStep({ cap_per_run: 4 }), ctx, freed: FREED }));
  const [, row, recipients] = f.of("assemble")[0];
  assert.deepEqual(
    recipients.map((r) => r.contact_id),
    ["c"],
  );
  assert.equal(row.audience.reach.heardAny, 1, "heard from a campaign this week");
  assert.equal(row.audience.reach.heardThis, 1, "heard of a freed time within the step's week");
});

test("a batch whose words are new waits for an OK, and its notice says it ends with the time it offers", async () => {
  const f = runPorts();
  const out = await runPlaybook(
    f.ports,
    cmd({ playbook: freedStep({ words_ok_at: null }), ctx: context({ people: [asker("a", 1)] }), freed: FREED }),
  );
  assert.equal(out.outcome, "held");
  assert.equal(f.of("assemble")[0][1].state, "pending_approval");
  const [, subject, body] = f.of("notify")[0];
  assert.equal(subject, "Campaign “Fill a cancellation” is ready: 1 person");
  assert.match(body, /Goes only if you approve it before Tue, Sep 8, 3:00 PM; after that it is skipped\.$/);
  // Made the evening before, its name and its notice still say the date: kept words, read the next morning too.
  const eve = runPorts();
  const evening = new Date("2026-09-08T00:30:00Z"); // Monday 8:30 PM in New York
  const people = [asker("a", 1)];
  await runPlaybook(
    eve.ports,
    cmd({ playbook: freedStep({ words_ok_at: null }), ctx: context({ now: evening, people }), freed: FREED }),
  );
  assert.equal(eve.of("assemble")[0][1].name, "Fill a cancellation · Tue, Sep 8, 3:00 PM");
  assert.doesNotMatch(eve.of("notify")[0][2], /tomorrow/);
});

test("no freed time, no run; a freed time handed to any other step is refused; neither is recorded", async () => {
  const none = runPorts();
  const off = await runPlaybook(none.ports, cmd({ ctx: context({ people: [asker("a", 1)] }) }));
  assert.deepEqual(off, { outcome: "off", mode: "auto", skipped: "no_freed_time" });
  assert.deepEqual(none.ops(), [], "a Run now on it says why, and the day stays open");
  const other = runPorts();
  const refusedRun = await runPlaybook(
    other.ports,
    cmd({ playbook: freedStep({ trigger: "quiet_30", policy_class: "reengage" }), freed: FREED }),
  );
  assert.deepEqual(refusedRun, { outcome: "off", mode: "auto", skipped: "not_a_freed_time_step" });
  assert.deepEqual(other.ops(), []);
});

test("a time that has begun by the moment the batch would go is not offered, and nothing is recorded", async () => {
  // Made at 10:00 PM, the batch would go at nine the next morning; the time freed for 8:30 AM is gone by then.
  const night = new Date("2026-09-07T02:00:00Z");
  const early = { from: "appt-2", start: Date.parse("2026-09-07T12:30:00Z"), end: Date.parse("2026-09-07T13:30:00Z") };
  const f = runPorts();
  const out = await runPlaybook(
    f.ports,
    cmd({ ctx: context({ now: night, people: [asker("a", 1)] }), runFor: "2026-09-06", freed: early }),
  );
  assert.deepEqual(out, { outcome: "off", mode: "auto", skipped: "freed_time_passed" });
  assert.deepEqual(f.ops(), [], "a time nobody can have is offered to nobody");
  // A time freed for 10:30 the same night is still ahead when the batch goes at nine: offered, and it waits for nine.
  const later = { ...early, start: Date.parse("2026-09-07T14:30:00Z"), end: Date.parse("2026-09-07T15:30:00Z") };
  const nine = runPorts();
  const offered = await runPlaybook(
    nine.ports,
    cmd({ ctx: context({ now: night, people: [asker("a", 1)] }), runFor: "2026-09-06", freed: later }),
  );
  assert.equal(offered.outcome, "sent");
  assert.equal(nine.of("assemble")[0][1].scheduled_for, "2026-09-07T13:00:00.000Z");
});
