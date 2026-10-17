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
  newSequenceLine,
  newSequenceRoute,
  parseSequencesRoute,
  runSheetRoute,
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
  sequenceCancels,
  sequenceChannelsWords,
  sequenceNextOf,
  sequenceNextWords,
  sequencePausedDock,
  sequenceRowState,
  sequenceSubLine,
  sequenceTwinOf,
  sequenceWhoApprovesHint,
  takesFollowUps,
  visitTwinWords,
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

test("the one notice: a batch waiting for an OK with its act and how long it waits, then what is held, said once", () => {
  const waiting = sequenceNotice(row({ needs: { ...NONE, waiting: 1, batches: [batch()] } }), []);
  assert.equal(waiting.kind, "waiting");
  // A customer's batch waits until its day is gone, never "goes at" the hour it was made: an OK sends it at once.
  assert.equal(waiting.words, "The next batch waits for your OK · until tonight");
  assert.deepEqual([waiting.act, waiting.batchId], ["Approve", "b9"]);
  const named = sequenceNotice(
    row({ needs: { ...NONE, waiting: 1, waiting_people: 3, batches: [batch({ people: 3 })] } }),
    [],
  );
  assert.deepEqual([named.words, named.act], ["3 people wait for your OK · until tonight", "Approve 3"]);
  // A phone's dock says it in a line and one fact, the step where there are several.
  assert.deepEqual([named.line, named.fact], ["3 wait for your OK", "until tonight"]);
  const steps = [
    { id: "s1", place: 1 },
    { id: "s2", place: 2 },
  ];
  const second = sequenceNotice(
    row({ needs: { ...NONE, waiting: 1, waiting_people: 2, batches: [batch({ step_id: "s2", people: 2 })] } }),
    steps,
  );
  assert.equal(second.fact, "Step 2 · until tonight");
  // A sequence to leads' batch and a one-off wait until they are answered: no day to pass, so no "until".
  const leads = sequenceNotice(
    row({
      starts: "leads",
      needs: {
        ...NONE,
        waiting: 1,
        waiting_people: 4,
        batches: [batch({ people: 4, audience: { kind: "reach_out", trigger: null } })],
      },
    }),
    [],
  );
  assert.deepEqual([leads.words, leads.fact], ["4 people wait for your OK", null]);
  assert.equal(sequenceNotice(row({ needs: { ...NONE, held: 2 } }), []).words, "2 emails are held by the check");
  assert.equal(sequenceNotice(row(), []), null);
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
  // New on the moment a door asks for (Setup's first reminder, Ask's moment card): written and read back.
  assert.equal(newSequenceRoute(), "campaigns/sequences/new");
  assert.equal(newSequenceRoute(null), "campaigns/sequences/new");
  assert.equal(newSequenceRoute("visit_tomorrow"), "campaigns/sequences/new:moment:visit_tomorrow");
  assert.deepEqual(parseSequencesRoute(newSequenceRoute("visit_tomorrow")), { view: "new", moment: "visit_tomorrow" });
  for (const odd of ["new:moment:", "new:moment", "new:every", "new:surprise"])
    assert.deepEqual(parseSequencesRoute(`${SEQUENCES_ROUTE}/${odd}`), { view: "new" }, odd);
  assert.deepEqual(parseSequencesRoute(sequenceRoute("s1")), { view: "record", id: "s1", tab: "steps" });
  assert.deepEqual(parseSequencesRoute(sequenceRoute("s1", "history")), { view: "record", id: "s1", tab: "history" });
  assert.deepEqual(parseSequencesRoute(`${SEQUENCES_ROUTE}/s1/elsewhere?x=1`), {
    view: "record",
    id: "s1",
    tab: "steps",
  });
  assert.equal(parseSequencesRoute("campaigns/moment:s1"), null);
  assert.equal(sequenceRoute("s1", "people"), "campaigns/sequences/s1/people");
  // A day of History open is the address's own: written and read back.
  assert.equal(sequenceRoute("s1", "history", "b1"), "campaigns/sequences/s1/history/b1");
  assert.equal(sequenceRoute("s1", "people", "b1"), "campaigns/sequences/s1/people", "a day is History's alone");
  assert.deepEqual(parseSequencesRoute(sequenceRoute("s1", "history", "b1")), {
    view: "record",
    id: "s1",
    tab: "history",
    day: "b1",
  });
});

test("an older address lands on what it names: the home and Sent's list on Sequences; the composer, a message and Sent's sheets stay", () => {
  assert.equal(sequenceLandingOf("campaigns"), SEQUENCES_ROUTE);
  // Sent's list is History now (D3): its bare address is Sequences' list.
  assert.equal(sequenceLandingOf("broadcasts"), SEQUENCES_ROUTE);
  // A run a link names lands on its sequence's History, that day open (W4); its sheet stays where Open the run goes.
  assert.equal(sequenceLandingOf("broadcasts/run:b1"), "campaigns/sequences/b1/history/b1");
  assert.equal(sequenceLandingOf(runSheetRoute("b1")), null);
  assert.equal(sequenceLandingOf("campaigns/in:before"), SEQUENCES_ROUTE);
  assert.equal(sequenceLandingOf("campaigns/moment:s1"), "campaigns/sequences/s1");
  assert.equal(sequenceLandingOf("campaigns/moment:s1:people"), "campaigns/sequences/s1/people");
  // The composer's Every time went (the closed-loop audit of 17 Oct 2026, G): its addresses, in a bookmark or an old
  // Ask card, land on New, and on New on that moment. A change (`new:edit:<root>`) stays: it is a reach-out's sheet.
  assert.equal(sequenceLandingOf("campaigns/new:every"), "campaigns/sequences/new");
  assert.equal(sequenceLandingOf("campaigns/new:moment:quiet_30"), "campaigns/sequences/new:moment:quiet_30");
  for (const stays of [
    "campaigns/new",
    "campaigns/new:to:list-1",
    "campaigns/new:leads",
    "campaigns/new:moment:",
    "campaigns/new:edit:",
    "campaigns/new:edit:s1",
    "campaigns/message:come_back",
    "campaigns/ads",
    "campaigns/sequences/s1",
    "broadcasts/get-yes",
    "broadcasts/to-send",
    "messages",
  ])
    assert.equal(sequenceLandingOf(stays), null, stays);
});

test("New on a moment is written in: the owner's line for that moment, in the workspace's word, and none for one it does not know", () => {
  assert.equal(
    newSequenceLine("visit_tomorrow", "appointment"),
    "Remind each customer the day before their appointment",
  );
  assert.equal(newSequenceLine("visit_tomorrow", "meeting"), "Remind each customer the day before their meeting");
  assert.match(newSequenceLine("visited", "appointment"), /the day after their appointment/);
  assert.equal(
    newSequenceLine("quiet_30", "appointment"),
    newSequenceLine("lapsed", "appointment"),
    "one line for coming back",
  );
  for (const t of ["new_week", "phoned_only", "everyone_monthly", "proposal_waiting"])
    assert.ok(newSequenceLine(t, "appointment"), t);
  assert.equal(newSequenceLine("list:3f6c1a52", "appointment"), null, "a list's moment has no line of its own");
  assert.equal(newSequenceLine("", "appointment"), null);
});

test("a twin on a visit moment needs you: two running sequences send each person the same moment twice (the phone review, 16 Oct 2026)", () => {
  const a = row({ id: "a", name: "Meeting reminder" });
  const b = row({ id: "b", name: "Meeting reminder 2", created_at: "2026-10-10T12:00:00Z" });
  const quiet = row({ id: "c", name: "Win back", first: { ...FIRST, trigger: "quiet_30" } });
  const rows = [a, b, quiet];
  const twin = sequenceTwinOf(rows, b);
  assert.deepEqual(twin, { id: "a", name: "Meeting reminder" });
  assert.equal(sequenceTwinOf(rows, a), null, "the one made first keeps its place: the later one needs you");
  assert.equal(sequenceTwinOf(rows, quiet), null, "any other moment's breath keeps a twin from reaching anyone twice");
  assert.equal(sequenceTwinOf([row({ id: "a", state: "paused" }), b], b), null, "a paused one sends nothing");
  assert.equal(sequenceGroupOf(b, twin), "needs");
  assert.equal(sequenceRowLine(b, TZ, NOW, twin), "Two reminders go to each person");
  const n = sequenceNotice(b, [], twin);
  assert.deepEqual(
    [n.kind, n.line, n.fact, n.act],
    ["twin", "Two reminders go to each person", "“Meeting reminder” sends one too", "Turn this off"],
  );
  assert.match(visitTwinWords("Meeting reminder"), /^“Meeting reminder” already sends at this moment/);
});

test("new words WhatsApp turned down are the notice's last, with the step its act opens", () => {
  const steps = [{ id: "st2", place: 2, next_words: { status: "rejected", rejected_reason: "reads as marketing" } }];
  const n = sequenceNotice(row(), steps);
  assert.deepEqual(
    [n.kind, n.line, n.fact, n.act, n.stepId],
    ["words", "Step 2’s new words turned down", "WhatsApp: reads as marketing", "Edit step 2", "st2"],
  );
});

test("a row ends on its state only where it is not On; the head's line says what starts it and who approves", () => {
  assert.equal(sequenceRowState(row()), null, "a green On on every row said nothing");
  assert.deepEqual(sequenceRowState(row({ state: "paused" })), { label: "Paused", tone: "plain" });
  const oneOff = row({
    starts: "date",
    date: { batch_id: "b1", state: "scheduled", at: "2026-10-28T13:00:00Z", people: 5 },
  });
  assert.deepEqual(sequenceRowState(oneOff), { label: "Scheduled", tone: "plain" });
  assert.deepEqual(sequenceRowState({ ...oneOff, date: { ...oneOff.date, state: "failed" } }), {
    label: "Failed",
    tone: "danger",
  });
  const rec = (mode) => ({ word: "visit", timezone: TZ, mode });
  assert.equal(sequenceSubLine(row(), rec("auto"), NOW), "Before a visit · sends on its own");
  assert.equal(sequenceSubLine(row(), rec(null), NOW), "Before a visit · asks you first", "none set asks");
  assert.equal(sequenceSubLine(oneOff, rec("ask"), NOW), "One message · goes on its own");
});

test("what goes next: a made batch's day and size, else its first step's next run by its hour, never what it cannot know", () => {
  // NOW is 10:00 AM in New York on Wed, Oct 14; the first step runs at 9:00.
  const made = row({ next: { id: "b1", at: "2026-10-15T13:00:00Z", people: 3, state: "scheduled", place: 1 } });
  assert.equal(sequenceNextWords(sequenceNextOf(made, null, TZ, NOW), TZ, NOW), "tomorrow 9:00 AM · 3 people");
  const ran = sequenceNextOf(row(), "2026-10-14", TZ, NOW);
  assert.equal(sequenceNextWords(ran, TZ, NOW), "tomorrow 9:00 AM", "ran today: tomorrow at its hour");
  const due = sequenceNextOf(row(), "2026-10-13", TZ, NOW);
  assert.equal(sequenceNextWords(due, TZ, NOW), "within the hour", "its hour has come and today's has not run");
  assert.equal(sequenceNextOf(row(), undefined, TZ, NOW), null, "a server from before the field says none");
  assert.equal(sequenceNextOf(row({ state: "paused" }), "2026-10-14", TZ, NOW), null);
});

test("a paused sequence's dock, who approves in its More, a one-off's cancel, and where a follow-up is offered", () => {
  assert.deepEqual(sequencePausedDock(row({ state: "paused", in_it: 4 })), {
    line: "Paused",
    fact: "4 people wait for it",
  });
  assert.deepEqual(sequencePausedDock(row({ state: "paused" })), { line: "Paused", fact: null });
  assert.equal(sequencePausedDock(row()), null);
  assert.equal(sequenceWhoApprovesHint("auto", "booking"), "Sends on its own · Book · reschedule");
  assert.equal(sequenceWhoApprovesHint(null, null), "Asks you first");
  const oneOff = (state) =>
    row({ starts: "date", date: { batch_id: "b1", state, at: "2026-10-28T13:00:00Z", people: 5 } });
  assert.equal(sequenceCancels(oneOff("scheduled")), true);
  assert.equal(sequenceCancels(oneOff("sent")), false);
  assert.equal(sequenceCancels(row()), false);
  assert.equal(takesFollowUps(row()), false, "a reminder is said once, the day before");
  assert.equal(takesFollowUps(row({ first: { ...FIRST, trigger: "quiet_30" } })), true);
  assert.equal(takesFollowUps(row({ starts: "leads" })), false);
  assert.equal(sequenceChannelsWords([]), "", "a one-off's channels are its sends': none guessed");
  assert.equal(sequenceChannelsWords(["whatsapp", "email"]), "WhatsApp or email, one each");
});
