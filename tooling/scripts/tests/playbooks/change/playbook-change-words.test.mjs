/**
 * A campaign's words, its end and its sequence's mode, changed in place (00416 `params`, `until`; 00461 `mode`, decision
 * 0064): the three keys a change may name beside its six, the words a card and the ledger say for each, and core
 * checkPlaybookPatch, the one judgement Ask's change card and PUT playbooks/:id both run, EXECUTED over ports in memory.
 * Its words are held to its message's slots as a new campaign's are (core templateValues: as many values as the message
 * takes, each one a value the run can fill), its end is a day on the business's clock, today or later, which null clears,
 * and its mode one of the three a sequence takes, never Send it to leads. Only what differs from the row is set, and what
 * the row held is kept for the undo; a change card's PUT carries the three as it carries the six (contracts
 * playbookChangeSpec: the card's payload names the mode as `sequence_mode`, its own `mode` being a pause undo's).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FOLLOW_UP_NEEDS_LINK,
  PLAYBOOK_PATCH_KEYS,
  PLAYBOOK_PATCH_WORDS,
  PROPOSAL_SPECS,
  REACH_OUT_IS_NOT_A_MOMENT,
  campaignDayWords,
} from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

const { checkPlaybookPatch } = await importSrc("packages/core/src/campaigns/check-playbook.ts");
const { TEMPLATE_VALUE_WORDS } = await importSrc("packages/core/src/campaigns/template-values.ts");

const W = PLAYBOOK_PATCH_WORDS;
const ZONE = "America/New_York";
/** Sunday 11 Oct 2026, 10:00 PM in New York: already the 12th in UTC. */
const NOW = new Date("2026-10-12T02:00:00Z");
const T1 = "77777777-7777-4777-8777-777777777771";

/** The message the campaign sends, as db messageVersionRowsOf answers it: WhatsApp's approved version, two values. */
const template = (over = {}) => ({
  id: T1,
  channel: "whatsapp",
  name: "winback_offer",
  language: "en_US",
  meta_status: "approved",
  category: "marketing",
  variables: ["1", "2"],
  hidden_at: null,
  title: null,
  source: "meta",
  components: [],
  body_preview: null,
  rejected_reason: null,
  ...over,
});
/** A win-back as the database holds it now: its two values the route stored, no end, its sequence holding each batch. */
const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Win-back",
  trigger: "quiet_30",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  template_id: T1,
  params: [{ kind: "first_name" }, { kind: "text", value: "10% off a colour" }],
  until: null,
  mode: "veto",
};
/** The world a change reads: no list keeps it paused, the message by its id, no links on file, New York's clock. */
const ports = (over = {}) => ({
  archivedList: async () => null,
  message: async (id) => (id === T1 ? [template()] : []),
  bookingLink: async () => null,
  reviewLink: async () => null,
  timezone: async () => ZONE,
  ...over,
});
const judge = (asked, row = ROW, p = ports(), isUndo = false) =>
  checkPlaybookPatch(p, row, asked, { now: NOW, undo: isUndo });
/** The same judgement on an undo: the PUT naming the decision it undoes, which writes back what the door recorded. */
const undo = (asked, row = ROW) => judge(asked, row, ports(), true);
const refusedWith = (p, words, status = 400) =>
  assert.rejects(p, (e) => {
    assert.equal(e.message, words);
    assert.equal(e.status, status, e.message);
    return true;
  });

test("a change names any of nine things, the six and the campaign's words, its end and its mode, in the order a card says them, and says each in the product's words", () => {
  assert.deepEqual(
    [...PLAYBOOK_PATCH_KEYS],
    ["state", "name", "run_hour", "cap_per_run", "gap_days", "cadence_days", "params", "until", "mode"],
  );
  assert.equal(W.until("Nov 30"), "Ends Nov 30");
  assert.equal(W.until(null), "Runs until it is paused, with no last day");
  assert.equal(W.mode("ask", "veto"), "Before each batch: Ask me, where it was Hold it 30 minutes so I can stop it");
  assert.equal(W.mode("auto", "ask"), "Before each batch: Send it, where it was Ask me");
  assert.equal(
    W.params([{ kind: "first_name" }, { kind: "text", value: "15% off a colour" }]),
    "Its words changed: their first name, “15% off a colour”",
  );
  // The refusal of a change that names nothing, and the PUT's of a body that is none of its three, name all nine.
  assert.equal(
    W.nothing,
    "Name what changes: state, name, run_hour, cap_per_run, gap_days, cadence_days, params, until or mode.",
  );
  assert.ok(
    W.putBody.includes("any of state, name, run_hour, cap_per_run, gap_days, cadence_days, params, until and mode"),
  );
  // A day as a campaign's words say it, by the business's calendar.
  assert.equal(campaignDayWords("2026-11-30", ZONE, NOW), "Nov 30");
  assert.equal(campaignDayWords("2027-01-04", ZONE, NOW), "Jan 4, 2027", "another year says its year");
});

test("its words: as many values as its message takes, each judged as a new campaign's are, set as the specs a run fills; the values it holds already are no change", async () => {
  assert.deepEqual(await judge({ params: ["@first_name", "15% off a colour"] }), {
    set: { params: [{ kind: "first_name" }, { kind: "text", value: "15% off a colour" }] },
    was: { params: ROW.params },
  });
  assert.deepEqual(await judge({ params: [{ kind: "first_name" }, { kind: "text", value: "10% off a colour" }] }), {
    set: {},
    was: {},
  });
  await refusedWith(judge({ params: [{ kind: "first_name" }] }), "This template takes 2 values.");
  await refusedWith(judge({ params: "15% off" }), "This template takes 2 values.");
  await refusedWith(
    judge({ params: [{ kind: "first_name" }, { kind: "nope" }] }),
    "Each value is typed text, their first name, the business name, the booking link, the review link, the booked time or service, or a proposal's link.",
  );
  await refusedWith(
    judge({ params: [{ kind: "first_name" }, { kind: "visit_when" }] }),
    "Only a reminder the day before or the check the day after can fill in the booked time or service.",
  );
  await refusedWith(
    judge({ params: [{ kind: "first_name" }, { kind: "booking_link" }] }),
    TEMPLATE_VALUE_WORDS.noBookingLink,
    409,
  );
  // A proposal follow-up keeps its proposal's link (0006): a change of its words that drops it is refused, as a new one is.
  const followUp = { ...ROW, name: "Follow-up", trigger: "proposal_waiting" };
  await refusedWith(
    judge({ params: [{ kind: "first_name" }, { kind: "text", value: "Any news?" }] }, followUp),
    FOLLOW_UP_NEEDS_LINK,
  );
  assert.deepEqual((await judge({ params: [{ kind: "first_name" }, { kind: "proposal_link" }] }, followUp)).set, {
    params: [{ kind: "first_name" }, { kind: "proposal_link" }],
  });
});

test("its end: a day on the business's clock, today or later, and null clears it; an end it holds already is no change", async () => {
  assert.deepEqual(await judge({ until: "2026-11-30" }), { set: { until: "2026-11-30" }, was: { until: null } });
  // The 11th is still today in New York, though it is the 12th in UTC.
  assert.deepEqual((await judge({ until: "2026-10-11" })).set, { until: "2026-10-11" });
  const ending = { ...ROW, until: "2026-11-30" };
  assert.deepEqual(await judge({ until: null }, ending), { set: { until: null }, was: { until: "2026-11-30" } });
  assert.deepEqual(await judge({ until: "2026-11-30" }, ending), { set: {}, was: {} });
  await refusedWith(judge({ until: "2026-10-10" }), W.untilPast("Oct 11"));
  assert.equal(W.untilPast("Oct 11"), "An end is today or later: today is Oct 11 by your clock.");
  for (const no of ["Nov 30", "2026-11-30T00:00:00Z", 20261130, ""])
    await refusedWith(judge({ until: no }), W.untilDay);
  assert.equal(W.untilDay, "An end is a day, written YYYY-MM-DD.");
});

test("its mode: one of the three a sequence takes, set where it differs; Send it is no mode for a sequence to leads; a mode it holds already is no change", async () => {
  assert.deepEqual(await judge({ mode: "ask" }), { set: { mode: "ask" }, was: { mode: "veto" } });
  assert.deepEqual(await judge({ mode: "veto" }), { set: {}, was: {} });
  for (const no of ["never", "sometimes", 1, ""]) await refusedWith(judge({ mode: no }), W.modeWhich);
  const leads = { ...ROW, name: "Movers in Austin", trigger: "lead_first" };
  assert.deepEqual(await judge({ mode: "ask" }, leads), { set: { mode: "ask" }, was: { mode: "veto" } });
  await refusedWith(judge({ mode: "auto" }, leads), W.modeLeads);
});

test("an undo writes back the end and the mode the door recorded, the end past or not: nothing clears an end when it passes, so what a change held may be past by its undo; its shape is still judged, and a change that is no undo still names a day to come", async () => {
  const later = { ...ROW, until: "2026-11-30", mode: "ask" };
  assert.deepEqual(await undo({ until: "2026-10-01", mode: "veto" }, later), {
    set: { until: "2026-10-01", mode: "veto" },
    was: { until: "2026-11-30", mode: "ask" },
  });
  await refusedWith(undo({ until: "Oct 1" }, later), W.untilDay);
  await refusedWith(judge({ until: "2026-10-01" }, later), W.untilPast("Oct 11"));
});

test("the three ride with the six in one change; a reach-out's step takes its mode and none of the other two; and what a change does not name is never read", async () => {
  assert.deepEqual(await judge({ state: "paused", until: "2026-11-30", mode: "ask" }), {
    set: { state: "paused", until: "2026-11-30", mode: "ask" },
    was: { state: "running", until: null, mode: "veto" },
  });
  const step = { ...ROW, name: "Movers in Austin", trigger: "lead_first" };
  for (const asked of [{ until: "2026-11-30" }, { params: [] }])
    await refusedWith(judge(asked, step), REACH_OUT_IS_NOT_A_MOMENT, 409);
  const unread = ports({
    message: async () => assert.fail("the message is read only for its words"),
    timezone: async () => assert.fail("the clock is read only for an end"),
  });
  assert.deepEqual(await judge({ name: "Past clients", mode: "veto" }, ROW, unread), {
    set: { name: "Past clients" },
    was: { name: "Win-back" },
  });
});

test("a change card's PUT names the three as it names the six, a null clearing an end, so the undo of a first end writes no end back; its mode rides as sequence_mode, never as a pause undo's mode; a null for any other names nothing", () => {
  const spec = PROPOSAL_SPECS.playbook_change;
  const at = { settings: null };
  const words = [{ kind: "first_name" }, { kind: "text", value: "15% off a colour" }];
  const payload = { playbook_id: ROW.id, playbook_name: "Win-back", params: words, until: "2026-11-30" };
  assert.deepEqual(spec.commit({ payload: { ...payload, sequence_mode: "ask", name: null, was: {} } }, at), {
    route: "PUT playbooks/[id]",
    params: { id: ROW.id },
    body: { params: words, until: "2026-11-30", mode: "ask" },
  });
  // A pause card's `mode` is what its undo resumes under (decision 7's label), never a change of the sequence's mode.
  assert.deepEqual(spec.commit({ payload: { playbook_id: ROW.id, state: "paused", mode: "auto", was: {} } }, at), {
    route: "PUT playbooks/[id]",
    params: { id: ROW.id },
    body: { state: "paused" },
  });
  assert.deepEqual(
    spec.undo.call({ playbook_id: ROW.id, was: { until: null, mode: "veto" }, decision_id: "d-1" }, at),
    {
      route: "PUT playbooks/[id]",
      params: { id: ROW.id },
      body: { until: null, mode: "veto" },
    },
  );
});
