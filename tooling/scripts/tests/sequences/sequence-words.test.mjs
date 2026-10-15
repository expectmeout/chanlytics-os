/**
 * What the Sequences page says (decision 0060, contracts sequence-words.ts and sequence-address.ts), executed on rows as the
 * readers answer them: the list's groups (what needs you first, drafts last), a row's pill and line, the one notice, the
 * flow's sentences, and the page's addresses read and written by one parser and one writer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SEQUENCES_ROUTE,
  isSequencesParam,
  momentStartsSentence,
  needsCount,
  needsWords,
  parseSequencesRoute,
  sequenceGroupOf,
  sequenceLandingOf,
  sequenceNotice,
  sequenceRoute,
  sequenceRowLine,
  sequenceStartsSentence,
  sequenceStateTone,
  sequenceStateWords,
  sequenceStopsSentence,
  sequenceWaitWords,
  sequenceWaitsNow,
  stepsStopSentence,
} from "@chanlytics/contracts";

const TZ = "America/New_York";
const NOW = Date.parse("2026-10-14T14:00:00Z");
const NONE = { waiting: 0, waiting_people: 0, held: 0, to_send: 0, replies: 0, oldest_at: null, batches: [] };
const FIRST = {
  id: "s1",
  kind: "moment",
  trigger: "visit_tomorrow",
  state: "running",
  policy_class: "booking",
  run_hour: 9,
  list_id: null,
  list_key: null,
  list_name: null,
  search_id: null,
  search_name: null,
  owner_sends: false,
  until: null,
  trial_until: null,
  template_name: "visit_reminder",
  template_language: "en_US",
};
const row = (over = {}) => ({
  id: "s1",
  name: "Day-before reminder",
  starts: "moment",
  state: "on",
  created_at: "2026-09-18T12:00:00Z",
  first: FIRST,
  date: null,
  steps: 1,
  channels: ["whatsapp"],
  needs: NONE,
  next: null,
  last: null,
  in_it: 0,
  ...over,
});

test("the list groups what needs you first, then by how each starts, and a draft under Drafts whatever it holds", () => {
  assert.equal(sequenceGroupOf(row()), "customers");
  assert.equal(sequenceGroupOf(row({ needs: { ...NONE, held: 2 } })), "needs");
  assert.equal(sequenceGroupOf(row({ starts: "leads" })), "leads");
  assert.equal(sequenceGroupOf(row({ starts: "date" })), "dates");
  assert.equal(sequenceGroupOf(row({ state: "draft", needs: { ...NONE, waiting: 1 } })), "drafts");
});

test("what needs you is one count and one line: a waiting batch with nobody named yet is the batch, never 0 people", () => {
  const n = { ...NONE, waiting: 1, waiting_people: 0, held: 2, replies: 1 };
  assert.equal(needsCount(n), 4);
  assert.equal(needsWords(n), "waits for your OK · 2 held · 1 wrote back · answer them");
  assert.equal(needsWords({ ...n, waiting_people: 14 }), "14 wait for your OK · 2 held · 1 wrote back · answer them");
});

test("a row's pill and line: amber only for a one-off that waits, a draft says nothing goes yet", () => {
  assert.deepEqual([sequenceStateWords(row()), sequenceStateTone(row())], ["On", "ok"]);
  assert.deepEqual(
    [sequenceStateWords(row({ state: "draft" })), sequenceStateTone(row({ state: "draft" }))],
    ["Draft", "plain"],
  );
  const oneOff = row({
    starts: "date",
    date: { batch_id: "b1", state: "pending_approval", at: "2026-10-28T13:00:00Z", people: 5 },
  });
  assert.deepEqual([sequenceStateWords(oneOff), sequenceStateTone(oneOff)], ["Waits for you", "warn"]);
  assert.equal(sequenceRowLine(row({ state: "draft" }), TZ, NOW), "Not started · nothing goes yet");
  assert.equal(sequenceRowLine(row({ needs: { ...NONE, held: 3 } }), TZ, NOW), "3 held");
  assert.equal(sequenceRowLine(row({ state: "paused", in_it: 4 }), TZ, NOW), "4 waiting");
  assert.equal(sequenceRowLine(row()), "Nobody yet");
});

const batch = (over = {}) => ({
  id: "b9",
  step_id: "s1",
  run_for: "2026-10-14",
  at: "2026-10-15T13:00:00Z",
  people: 0,
  audience: { kind: "playbook", trigger: "quiet_30" },
  ...over,
});

test("only a batch an OK can still send waits for you, as the badge counts it: one whose day has passed does not", () => {
  const days = { today: "2026-10-14", sendsOn: "2026-10-14" };
  const two = row({
    needs: {
      ...NONE,
      waiting: 2,
      waiting_people: 9,
      batches: [batch({ id: "old", run_for: "2026-10-12", people: 4 }), batch({ people: 5 })],
    },
  });
  const now = sequenceWaitsNow(two, days);
  assert.deepEqual([now.needs.waiting, now.needs.waiting_people, now.needs.batches.map((b) => b.id)], [1, 5, ["b9"]]);
  const quiet = row();
  assert.equal(sequenceWaitsNow(quiet, days), quiet, "a row with nothing waiting is the row it was");
  // A visit's run made for today waits only while an OK sends it today; a one-off (no step) has no day to pass.
  const visit = row({
    needs: { ...NONE, waiting: 1, batches: [batch({ audience: { kind: "playbook", trigger: "visit_tomorrow" } })] },
  });
  assert.equal(sequenceWaitsNow(visit, { today: "2026-10-14", sendsOn: "2026-10-15" }).needs.waiting, 0);
  const oneOff = row({ needs: { ...NONE, waiting: 1, batches: [batch({ step_id: null, run_for: null })] } });
  assert.equal(sequenceWaitsNow(oneOff, { today: "2026-10-20", sendsOn: "2026-10-20" }).needs.waiting, 1);
});

test("the one notice: a batch waiting for an OK with its act, then what is held, said once", () => {
  const waiting = sequenceNotice(row({ needs: { ...NONE, waiting: 1, batches: [batch()] } }), [], TZ, NOW);
  assert.equal(waiting.kind, "waiting");
  assert.match(waiting.words, /^The next batch waits for your OK · it goes /);
  assert.deepEqual([waiting.act, waiting.batchId], ["Approve", "b9"]);
  const named = sequenceNotice(
    row({ needs: { ...NONE, waiting: 1, waiting_people: 3, batches: [batch({ people: 3 })] } }),
    [],
    TZ,
    NOW,
  );
  assert.deepEqual([named.words.startsWith("3 people wait for your OK"), named.act], [true, "Approve the 3"]);
  assert.equal(
    sequenceNotice(row({ needs: { ...NONE, held: 2 } }), [], TZ, NOW).words,
    "2 emails are held by the check",
  );
  assert.equal(sequenceNotice(row(), [], TZ, NOW), null);
});

test("the flow's sentences: a moment at its hour, the same for a record and a draft; a wait; what stops it", () => {
  assert.equal(sequenceStartsSentence(row(), "visit", TZ, NOW), "The day before each visit, at 9:00 AM");
  assert.equal(momentStartsSentence("visit_tomorrow", 9, "visit"), "The day before each visit, at 9:00 AM");
  assert.equal(momentStartsSentence("quiet_30", null, "visit"), "When someone has gone quiet for 30 days");
  assert.equal(
    sequenceWaitWords({ after_days: 28, only_if: ["no_booking"], kind: "moment" }),
    "28 days later, if they haven’t booked",
  );
  const steps = [{ only_if: [] }, { only_if: ["no_booking"] }];
  assert.equal(stepsStopSentence(steps), "When they book, or after the last step");
  assert.equal(stepsStopSentence([{ only_if: [] }]), "After this one message");
  assert.equal(stepsStopSentence([{ only_if: [] }, { only_if: [] }]), "After step 2");
  assert.equal(sequenceStopsSentence(row({ starts: "leads" }), []), "A reply, a booking, a no, a bounce or a stop");
});

test("an address is read and written by one parser and one writer: the list, a record on a tab, a new one", () => {
  assert.equal(isSequencesParam("sequences"), true);
  assert.equal(isSequencesParam("moment:pb-1"), false);
  assert.deepEqual(parseSequencesRoute(SEQUENCES_ROUTE), { view: "list" });
  assert.deepEqual(parseSequencesRoute(`${SEQUENCES_ROUTE}/new`), { view: "new" });
  assert.deepEqual(parseSequencesRoute(sequenceRoute("s1")), { view: "record", id: "s1", tab: "steps" });
  assert.deepEqual(parseSequencesRoute(sequenceRoute("s1", "history")), { view: "record", id: "s1", tab: "history" });
  assert.deepEqual(parseSequencesRoute(`${SEQUENCES_ROUTE}/s1/elsewhere?x=1`), {
    view: "record",
    id: "s1",
    tab: "steps",
  });
  assert.equal(parseSequencesRoute("campaigns/moment:s1"), null);
  assert.equal(sequenceRoute("s1", "people"), "campaigns/sequences/s1/people");
});

test("where Sequences is drawn, an older address lands on what it names; the composer, a message and Sent stay", () => {
  assert.equal(sequenceLandingOf("campaigns"), SEQUENCES_ROUTE);
  assert.equal(sequenceLandingOf("campaigns/in:before"), SEQUENCES_ROUTE);
  assert.equal(sequenceLandingOf("campaigns/moment:s1"), "campaigns/sequences/s1");
  assert.equal(sequenceLandingOf("campaigns/moment:s1:people"), "campaigns/sequences/s1/people");
  for (const stays of [
    "broadcasts/run:b1",
    "campaigns/new",
    "campaigns/new:every",
    "campaigns/message:come_back",
    "campaigns/ads",
    "campaigns/sequences/s1",
    "broadcasts",
    "broadcasts/get-yes",
    "messages",
  ])
    assert.equal(sequenceLandingOf(stays), null, stays);
});
