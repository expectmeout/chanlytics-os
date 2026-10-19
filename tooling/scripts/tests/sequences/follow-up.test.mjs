/**
 * A customer's step after the first (decision 0060, D6), run: what stops a person before it (contracts followUpStop), and
 * the moment's own run over the people the database says are due it (core runPlaybook), through fakes that log their
 * calls. Who leaves, and why, is the run's to say: booked (or came in), replied, gone, or a reason of their own no channel
 * reaches them for; one the workspace can mend (no channel ready today) keeps them due (the loop review, 17 Oct 2026).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { channelsReady, followUpLeaves, followUpStop, numberHealth } from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";

const { runPlaybook } = await importSrc("packages/core/src/campaigns/run-playbook.ts");
const NOW = new Date("2026-10-08T14:00:00Z"); // 10:00 in New York
const D = 86_400_000;
const SENT = new Date(NOW.getTime() - 4 * D).toISOString();

/** Someone due the step: said yes to offers and to texts, nothing booked, quiet since the step before went. */
const customer = (id, over = {}) => ({
  id,
  state: "quiet",
  hasChat: true,
  calls: 0,
  phone: `+1555010${id.length}${id.charCodeAt(0) % 10}`,
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
  lastContact: { ts: NOW.getTime() - 20 * D, label: "" },
  booked: false,
  askedMs: NOW.getTime() - 20 * D,
  lastVisitMs: null,
  ...over,
});

test("what stops someone before a step after the first: a booking ahead where it asks for none, a word since the step before where it asks for none", () => {
  const sent = Date.parse(SENT);
  assert.equal(followUpStop(customer("a"), ["no_booking", "no_reply"], sent), null);
  assert.equal(followUpStop(customer("a", { booked: true }), ["no_booking"], sent), "booked");
  assert.equal(
    followUpStop(customer("a", { booked: true }), ["no_reply"], sent),
    null,
    "a booking stops only no_booking",
  );
  assert.equal(followUpStop(customer("a", { askedMs: sent + 60_000 }), ["no_reply"], sent), "replied");
  assert.equal(followUpStop(customer("a", { askedMs: sent - 60_000 }), ["no_reply"], sent), null, "before it went");
  assert.equal(followUpStop(customer("a", { booked: true, askedMs: sent + 1 }), [], sent), null, "nothing asked");
});

test("a booking made and kept within the wait stops them too: they came in since the step before went, and a win-back must not reach them", () => {
  const sent = Date.parse(SENT);
  assert.equal(followUpStop(customer("a", { lastVisitMs: sent + 2 * D }), ["no_booking"], sent), "booked");
  assert.equal(
    followUpStop(customer("a", { lastVisitMs: sent - 2 * D }), ["no_booking"], sent),
    null,
    "a visit before it went",
  );
  assert.equal(
    followUpStop(customer("a", { lastVisitMs: sent + 2 * D }), ["no_reply"], sent),
    null,
    "asked about replies alone",
  );
  assert.equal(
    followUpStop(customer("a", { lastVisitMs: sent + 2 * D }), ["no_booking"], null),
    null,
    "no step before went",
  );
});

test("who a step cannot reach today leaves only for a reason of their own: no channel ready is the workspace's to mend", () => {
  for (const why of ["stopped", "unsubscribed", "no_yes", "no_number", "no_address", "address_stopped"])
    assert.equal(followUpLeaves(why), true, why);
  assert.equal(followUpLeaves("no_channel"), false);
});

const step = (over = {}) => ({
  id: "s2",
  tenant_id: "t1",
  name: "Win-back, a nudge",
  kind: "moment",
  trigger: "after_step",
  after_step_id: "s1",
  after_days: 4,
  only_if: ["no_booking"],
  template_id: "tpl-1",
  template_name: "come_back",
  template_language: "en_US",
  params: [],
  policy_class: "reengage",
  // Its sequence sends on its own and its words were seen going (decision 0064): its batches go by themselves.
  mode: "auto",
  words_ok_at: "2026-09-01T10:00:00.000Z",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  created_by: "owner",
  last_run_for: null,
  ...over,
});

const context = (people) => ({
  tz: "America/New_York",
  now: NOW,
  people,
  health: numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }),
  ready: channelsReady({
    whatsapp: { canSend: true, refusal: null },
    textLine: null,
    email: { mailbox: false, domain: false },
  }),
  // The week's breath holds nobody back from the step after: it is the sequence they are in.
  touches: {
    byThis: new Map(),
    byAny: new Map([["a", NOW.getTime() - D]]),
    followUps: new Map(),
    followUpKeys: new Map(),
  },
  calendar: "none",
  visits: new Map(),
});

function fakes(due) {
  const log = [];
  const ports = {
    message: async (name, language) => [
      {
        id: "tpl-1",
        channel: "whatsapp",
        name,
        language,
        meta_status: "approved",
        category: "marketing",
        variables: [],
        hidden_at: null,
        title: null,
        source: "meta",
        components: [],
        body_preview: null,
        rejected_reason: null,
      },
    ],
    alreadyRan: async () => false,
    followUpsDue: async (...args) => {
      log.push(["followUpsDue", ...args]);
      return due;
    },
    leave: async (ids, why) => {
      log.push(["leave", [...ids].sort(), why]);
      return ids.length;
    },
    record: async (...args) => log.push(["record", ...args]),
    assemble: async (row, recipients, sendAt, decision) => {
      log.push(["assemble", row, recipients, sendAt, decision]);
      return { id: "b9", decisionId: decision ? "d9" : null };
    },
    monthSent: async () => 0,
    holdRecipients: async (_id, ids) => ({ skipped: ids, error: null }),
    notify: async () => undefined,
  };
  return { ports, log, of: (name) => log.filter((l) => l[0] === name) };
}

test("a step after the first reaches whoever is due it, and takes out, with why, those it will not: booked, gone, never said yes", async () => {
  const due = [
    { enrollment_id: "e-a", contact_id: "a", sent_at: SENT },
    { enrollment_id: "e-b", contact_id: "b", sent_at: SENT },
    { enrollment_id: "e-c", contact_id: "c", sent_at: SENT },
    { enrollment_id: "e-d", contact_id: "d", sent_at: SENT },
  ];
  const people = [
    customer("a"),
    customer("b", { booked: true }),
    customer("d", { consent: { ...customer("d").consent, marketing: "unknown", state: "unknown" } }),
  ];
  const f = fakes(due);
  const r = await runPlaybook(f.ports, {
    playbook: step(),
    ctx: context(people),
    runFor: "2026-10-08",
    by: { kind: "system" },
  });
  assert.equal(r.outcome, "sent", JSON.stringify(r));
  assert.deepEqual(f.of("followUpsDue")[0].slice(1), ["s2", "2026-10-08"]);
  const [, row, recipients] = f.of("assemble")[0];
  assert.deepEqual(
    recipients.map((x) => [x.contact_id, x.channel, x.facts]),
    [["a", "whatsapp", null]],
    "the one still due, on WhatsApp, with no visit's words",
  );
  assert.equal(row.playbook_id, "s2", "the batch is the step's");
  assert.equal(row.audience.trigger, "after_step");
  assert.equal(row.audience.reach.pool, 2, "the two the step looked at, after the booked and the gone left");
  assert.equal(row.audience.reach.noYes, 1);
  assert.deepEqual(
    f
      .of("leave")
      .map((l) => [l[1], l[2]])
      .sort((x, y) => x[1].localeCompare(y[1])),
    [
      [["e-b"], "booked"],
      [["e-c"], "gone"],
      [["e-d"], "no_yes"],
    ],
  );
});

test("nobody due is an empty run, recorded, with nobody taken out; a failed read of who is due fails the run and records nothing", async () => {
  const empty = fakes([]);
  const r = await runPlaybook(empty.ports, {
    playbook: step(),
    ctx: context([]),
    runFor: "2026-10-08",
    by: { kind: "system" },
  });
  assert.equal(r.outcome, "empty");
  assert.equal(empty.of("leave").length, 0);
  assert.equal(empty.of("record").length, 1);
  const broken = fakes([]);
  broken.ports.followUpsDue = async () => {
    throw new Error("connection reset");
  };
  const failed = await runPlaybook(broken.ports, {
    playbook: step(),
    ctx: context([]),
    runFor: "2026-10-08",
    by: { kind: "system" },
  });
  assert.equal(failed.outcome, "failed");
  assert.match(failed.error, /follow_up: connection reset/);
  assert.equal(broken.of("record").length, 0, "the next sweep asks again");
});

test("past its cap the rest wait for tomorrow, still due: nobody is taken out for the cap", async () => {
  const due = ["a", "b", "c"].map((id) => ({ enrollment_id: `e-${id}`, contact_id: id, sent_at: SENT }));
  const f = fakes(due);
  const r = await runPlaybook(f.ports, {
    playbook: step({ cap_per_run: 2 }),
    ctx: context(["a", "b", "c"].map((id) => customer(id))),
    runFor: "2026-10-08",
    by: { kind: "system" },
  });
  assert.equal(r.outcome, "sent");
  const [, row, recipients] = f.of("assemble")[0];
  assert.deepEqual(
    recipients.map((x) => x.contact_id),
    ["a", "b"],
  );
  assert.equal(row.audience.reach.overCap, 1);
  assert.equal(f.of("leave").length, 0);
});

test("a step no channel can carry today keeps everyone due: nobody leaves, the run finds nobody, and tomorrow's asks again", async () => {
  const due = ["a", "b"].map((id) => ({ enrollment_id: `e-${id}`, contact_id: id, sent_at: SENT }));
  const f = fakes(due);
  // It goes by email alone, and the workspace has no mailbox connected today.
  const r = await runPlaybook(f.ports, {
    playbook: step({ channels: ["email"] }),
    ctx: context(["a", "b"].map((id) => customer(id, { email: `${id}@example.com` }))),
    runFor: "2026-10-08",
    by: { kind: "system" },
  });
  assert.equal(r.outcome, "empty", JSON.stringify(r));
  assert.equal(f.of("leave").length, 0, "still due: the step reaches them the day it can");
  assert.equal(f.of("assemble").length, 0);
  assert.equal(f.of("record").length, 1, "the day is recorded, with nobody reached");
});

test("a step that goes only to those who haven't booked needs a calendar it can read: unread, the run fails and records nothing; none connected, it goes on", async () => {
  const due = [{ enrollment_id: "e-a", contact_id: "a", sent_at: SENT }];
  const unread = fakes(due);
  const failed = await runPlaybook(unread.ports, {
    playbook: step(),
    ctx: { ...context([customer("a")]), calendar: "unavailable" },
    runFor: "2026-10-08",
    by: { kind: "system" },
  });
  assert.equal(failed.outcome, "failed", JSON.stringify(failed));
  assert.equal(
    unread.of("followUpsDue").length,
    0,
    "nobody is judged booked or not on a day the calendar was not read",
  );
  assert.deepEqual([unread.of("leave").length, unread.of("record").length], [0, 0], "the next sweep asks again");
  // A step that asks nothing of bookings goes on whatever the calendar.
  const replies = fakes(due);
  const r = await runPlaybook(replies.ports, {
    playbook: step({ only_if: ["no_reply"] }),
    ctx: { ...context([customer("a")]), calendar: "unavailable" },
    runFor: "2026-10-08",
    by: { kind: "system" },
  });
  assert.equal(r.outcome, "sent", JSON.stringify(r));
  // No calendar connected at all is the workspace's answer, not a failed read: the step goes by what is known.
  const none = fakes(due);
  assert.equal(
    (
      await runPlaybook(none.ports, {
        playbook: step(),
        ctx: context([customer("a")]),
        runFor: "2026-10-08",
        by: { kind: "system" },
      })
    ).outcome,
    "sent",
  );
});
