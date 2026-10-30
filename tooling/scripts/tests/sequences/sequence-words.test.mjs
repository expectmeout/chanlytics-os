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
  sequenceRouteBack,
  runRoute,
  TO_SEND_ROUTE,
  GET_YES_ROUTE,
  sequenceGroupOf,
  sequenceTypeOf,
  sortedSequences,
  retiredRouteOf,
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
  words_ok_at: null,
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

test("a sequence's type is what the list's Type keeps: a one-off on a date, cold email to leads, else a sequence to your customers", () => {
  assert.equal(sequenceTypeOf(row()), "customers");
  assert.equal(sequenceTypeOf(row({ starts: "list" })), "customers");
  assert.equal(sequenceTypeOf(row({ starts: "leads" })), "leads");
  assert.equal(sequenceTypeOf(row({ starts: "date" })), "once");
});

test("the list's sorts: newest made first, last sent first (one never sent last), most people in it, and by name; a copy", () => {
  const rows = [
    row({ id: "a", name: "beta", created_at: "2026-09-01T00:00:00Z", in_it: 3, last: null }),
    row({
      id: "b",
      name: "Alpha",
      created_at: "2026-10-01T00:00:00Z",
      in_it: 9,
      last: { id: "x", at: "2026-10-02T00:00:00Z", sent: 1, replied: 0 },
    }),
    row({
      id: "c",
      name: "gamma",
      created_at: "2026-09-15T00:00:00Z",
      in_it: 0,
      last: { id: "y", at: "2026-10-09T00:00:00Z", sent: 1, replied: 0 },
    }),
  ];
  const ids = (sort) => sortedSequences(rows, sort).map((r) => r.id);
  assert.deepEqual(ids("newest"), ["b", "c", "a"]);
  assert.deepEqual(ids("sent"), ["c", "b", "a"]);
  assert.deepEqual(ids("people"), ["b", "a", "c"]);
  assert.deepEqual(ids("name"), ["b", "a", "c"], "by name, whatever the case");
  assert.deepEqual(
    rows.map((r) => r.id),
    ["a", "b", "c"],
    "the rows given are left as they were",
  );
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
  // A one-off kept as a draft says it waits to be sent (00465); one still to go says when.
  const kept = row({ state: "draft", starts: "date", once: { who: { kind: "everyone", label: "everyone" } } });
  assert.equal(sequenceRowLine(kept, TZ, NOW), "Kept as a draft · nothing goes until you send it");
  const going = row({
    starts: "date",
    date: { batch_id: "b1", state: "scheduled", at: new Date(NOW + 3600e3).toISOString(), people: 5 },
  });
  assert.match(sequenceRowLine(going, TZ, NOW), /^Goes (at|tomorrow) .+ · 5 people$/);
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
  // The act in the words every Approve of a run says (decision 19 of the spec of 9 Oct 2026): its sheet's, Today's row.
  assert.deepEqual([named.words, named.act], ["3 people wait for your OK · until tonight", "Approve · 3 people"]);
  // A phone's dock says it in a line and one fact, the step where there are several; the count is its Approve's alone, never
  // said twice beside it (the run review's item 12).
  assert.deepEqual([named.line, named.fact], ["Waits for your OK", "until tonight"]);
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
  // A moment and a way back to Leads (the lead sheet's hand-off) read together: one in the word, one after it.
  assert.deepEqual(parseSequencesRoute(`${newSequenceRoute("visited")}/back:`), {
    view: "new",
    moment: "visited",
    back: "clients/leads",
  });
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
  // A day of History is its run, at its home under the sequence (the Campaigns wiring review's lane 2): written and read
  // back, over the History it is a day of; an older day's address reads as the same run.
  assert.equal(runRoute("b1", "s1"), "campaigns/sequences/s1/runs/b1");
  assert.deepEqual(parseSequencesRoute(runRoute("b1", "s1")), { view: "record", id: "s1", tab: "history", run: "b1" });
  assert.deepEqual(parseSequencesRoute("campaigns/sequences/s1/history/b1"), parseSequencesRoute(runRoute("b1", "s1")));
  assert.equal(retiredRouteOf("campaigns/sequences/s1/history/b1"), runRoute("b1", "s1"));
});

test("a new sequence to leads is made where its leads are chosen; an old composer address opens New, and every trip comes back", () => {
  // The composer's addresses for leads (new/list, new/lead, new/version) went with it (the lead-to-sequence canvas, 18 Oct
  // 2026): a link that still names one opens New, never a sheet that is gone.
  assert.deepEqual(parseSequencesRoute(`${SEQUENCES_ROUTE}/new/list:l1`), { view: "new" });
  assert.deepEqual(parseSequencesRoute(`${SEQUENCES_ROUTE}/new/version:s1/lead:d1`), { view: "new" });
  // The way back is the Leads address's words after the page's own, on any of Sequences' addresses.
  const back = "clients/leads:s-l1:p-d1";
  assert.deepEqual(parseSequencesRoute(sequenceRouteBack(sequenceRoute("s1", "people"), back)), {
    view: "record",
    id: "s1",
    tab: "people",
    back,
  });
  assert.deepEqual(parseSequencesRoute(sequenceRouteBack(sequenceRoute("s1"), "clients/leads")), {
    view: "record",
    id: "s1",
    tab: "steps",
    back: "clients/leads",
  });
  assert.equal(
    sequenceRouteBack(sequenceRoute("s1"), "inbox/th-1"),
    sequenceRoute("s1"),
    "only a way back to Leads is kept",
  );
});

test("an older address lands on what it names: the home and Sent's list on Sequences, a run at its home, the composer on New, a message's drawer on its home", () => {
  assert.equal(retiredRouteOf("campaigns"), SEQUENCES_ROUTE);
  // Sent's list is History now (D3): its bare address is Sequences' list.
  assert.equal(retiredRouteOf("broadcasts"), SEQUENCES_ROUTE);
  // A run Sent named lands at its home, under its sequence (the Campaigns wiring review's lane 2): the address does not
  // say the sequence, so the run names its place until it is read. Its sheet is the same screen.
  assert.equal(retiredRouteOf("broadcasts/run:b1"), runRoute("b1"));
  assert.equal(retiredRouteOf("broadcasts/run:b1/sheet"), runRoute("b1"), "a run's sheet in Sent is its home");
  // Sent's views went with it: To send to the Inbox's Needs you (lane 4), Get their yes to People (lane 7).
  assert.equal(retiredRouteOf("broadcasts/to-send"), TO_SEND_ROUTE);
  assert.equal(retiredRouteOf("broadcasts/get-yes"), GET_YES_ROUTE);
  assert.equal(retiredRouteOf("campaigns/in:before"), SEQUENCES_ROUTE);
  assert.equal(retiredRouteOf("campaigns/moment:s1"), "campaigns/sequences/s1");
  assert.equal(retiredRouteOf("campaigns/moment:s1:people"), "campaigns/sequences/s1/people");
  // The composer's Every time went (the closed-loop audit of 17 Oct 2026, G): its addresses, in a bookmark or an old
  // Ask card, land on New, and on New on that moment. The composer went into the one New too (the Campaigns wiring
  // review's lane 6): Send once on its audience, Write to leads, and a change on its sequence's record.
  assert.equal(retiredRouteOf("campaigns/new:every"), "campaigns/sequences/new");
  assert.equal(retiredRouteOf("campaigns/new:moment:quiet_30"), "campaigns/sequences/new:moment:quiet_30");
  assert.equal(retiredRouteOf("campaigns/new"), "campaigns/sequences/new:once");
  assert.equal(retiredRouteOf("campaigns/new:to:list-1"), "campaigns/sequences/new:once:to:list-1");
  assert.equal(retiredRouteOf("campaigns/new:leads"), "campaigns/sequences/new:leads");
  assert.equal(retiredRouteOf("campaigns/new:edit:s1"), "campaigns/sequences/s1");
  // A message's drawer over Sequences went into its home, the Library open on it.
  assert.equal(retiredRouteOf("campaigns/message:come_back"), "campaigns/messages/come_back");
  for (const stays of [
    "campaigns/new:moment:",
    "campaigns/new:edit:",
    "campaigns/messages/come_back",
    "campaigns/ads",
    "campaigns/sequences/s1",
    "campaigns/sequences/s1/runs/b1",
    "campaigns/sequences/new:once",
    TO_SEND_ROUTE,
    GET_YES_ROUTE,
    "campaigns/messages",
  ])
    assert.equal(retiredRouteOf(stays), null, stays);
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
  // Who approves is the sequence's own mode (decision 0064): the row's, never a class's.
  const rec = { word: "visit", timezone: TZ };
  assert.equal(sequenceSubLine(row({ mode: "auto" }), rec, NOW), "Before a visit · sends on its own");
  assert.equal(sequenceSubLine(row({ mode: "veto" }), rec, NOW), "Before a visit · holds each batch for you to stop");
  assert.equal(
    sequenceSubLine(row({ mode: null }), rec, NOW),
    "Before a visit · asks you before each batch",
    "none asks",
  );
  assert.equal(sequenceSubLine(oneOff, rec, NOW), "One message · goes on its own");
  // A sequence to leads fed by a list asks before each first email whatever its mode (00426: each lead was added by
  // hand); one on its search holds as its mode says (30 Oct 2026: the line said it held what waited for an OK).
  const leads = row({
    starts: "leads",
    mode: "veto",
    first: { ...row().first, search_name: "Auto shops", owner_sends: false },
  });
  assert.equal(
    sequenceSubLine(leads, { ...rec, fed_by: "list" }, NOW),
    "Leads from “Auto shops” · asks you before each first email",
  );
  assert.equal(
    sequenceSubLine(leads, { ...rec, fed_by: "search" }, NOW),
    "Leads from “Auto shops” · holds each batch for you to stop",
  );
  assert.equal(
    sequenceSubLine(leads, rec, NOW),
    "Leads from “Auto shops” · holds each batch for you to stop",
    "a list's row knows no feed",
  );
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

test("a paused sequence's dock, who approves in its More, and where a follow-up is offered (a one-off's cancel is the judge's: sequence-acts.test.mjs)", () => {
  assert.deepEqual(sequencePausedDock(row({ state: "paused", in_it: 4 })), {
    line: "Paused",
    fact: "4 people wait for it",
  });
  assert.deepEqual(sequencePausedDock(row({ state: "paused" })), { line: "Paused", fact: null });
  assert.equal(sequencePausedDock(row()), null);
  assert.equal(sequenceWhoApprovesHint("auto"), "Sends on its own");
  assert.equal(sequenceWhoApprovesHint("veto"), "Holds each batch for you to stop");
  assert.equal(sequenceWhoApprovesHint(null), "Asks you before each batch");
  assert.equal(takesFollowUps(row()), false, "a reminder is said once, the day before");
  assert.equal(takesFollowUps(row({ first: { ...FIRST, trigger: "quiet_30" } })), true);
  assert.equal(takesFollowUps(row({ starts: "leads" })), false);
  assert.equal(sequenceChannelsWords([]), "", "a one-off's channels are its sends': none guessed");
  assert.equal(sequenceChannelsWords(["whatsapp", "email"]), "WhatsApp or email, one each");
});
