/**
 * One visit line, marked where it is seen (decision 0047, task 4.4 of the wiring plan: D1-visit-mark, D1-visit-match-words,
 * D1-consult-held). The deal card's Consultation step is run beside the card's other steps (deals/deal-sheet.test.mjs).
 *
 * A visit was drawn five ways and said what became of it in one: the Calendar's panel said Past and offered Kept and Missed, and
 * the person's History said 'Past visit', People's Visits cell, the Inbox's chip, Coming up and Today's Next said the visit's
 * time and nothing of its state and offered nothing. The match was worded four ways, a visit marked while it was under way still
 * read 'Booked' under Coming up, a consultation marked Missed still offered 'Start a proposal', and a consultation nobody marked
 * was 'Held' on the Pipeline. Now one contracts line carries the visit's time, title, person, state, match and acts, and every
 * page draws it.
 *
 * Run on the contracts: the line itself (visitLineOf), the person's page built over it (toPersonVM: History and Coming up), the
 * row's next and last (toPersonRowVM), the consultation (calendarPeekDeal, pipelineOf) and Today's yesterday
 * (todayVisitsAsked, withVisitsAsked).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calendarPeekDeal,
  matchWordsOf,
  pipelineOf,
  todayVisitsAsked,
  todayVisitsFoot,
  todayVisitsSub,
  toPersonRowVM,
  toPersonVM,
  visitLineOf,
  visitLineOfBlock,
  visitMarkOfDto,
  visitStateOf,
  withVisitsAsked,
} from "@chanlytics/contracts";

const H = 3_600_000;
const TZ = "America/New_York";
/** Friday 18 September 2026, 4 PM in New York. */
const NOW = Date.parse("2026-09-18T20:00:00Z");
const iso = (ms) => new Date(ms).toISOString();

/** A visit one hour long starting `fromH` hours from now (negative: before). */
const at = (fromH) => ({ startMs: NOW + fromH * H, endMs: NOW + (fromH + 1) * H });
const line = (mark, fromH, over = {}) =>
  visitLineOf(
    {
      id: "v1",
      mark,
      ...at(fromH),
      title: "Colour",
      day: "Today",
      time: "2 – 3 PM",
      person: { id: "p1", name: "Maria Lopez" },
      via: "phone",
      ...over,
    },
    NOW,
  );

/* ------------------------------------------------------------------- the line */

test("a visit says how it stands in one word, whichever page draws it: Past once it has ended and nobody has marked it, the member's word otherwise, nothing ahead", () => {
  const booked = { id: "r1", status: "booked" };
  assert.equal(line(booked, 5).state, null, "ahead: no word");
  assert.equal(line(booked, -0.5).state, null, "under way and nobody has said: no word yet");
  assert.deepEqual(line(booked, -3).state, { text: "Past", tone: "past", pill: "plain" });
  assert.deepEqual(line({ id: "r1", status: "kept" }, -3).state, { text: "Kept", tone: "kept", pill: "ok" });
  assert.deepEqual(line({ id: "r1", status: "missed" }, -3).state, { text: "Missed", tone: "missed", pill: "warn" });
  assert.deepEqual(line({ id: "r1", status: "cancelled" }, 5).state, {
    text: "Cancelled",
    tone: "cancelled",
    pill: "plain",
  });
  assert.equal(line(null, -3).state?.text, "Past", "an event the record has not kept has ended, and says so");
  // The word is a member's whether or not the visit has ended: a visit marked while it is under way reads as its mark.
  assert.equal(line({ id: "r1", status: "kept" }, -0.5).state?.text, "Kept");
  assert.equal(line({ id: "r1", status: "missed" }, -0.5).state?.text, "Missed");
  // And the Calendar's panel asks the same function.
  assert.deepEqual(visitStateOf({ id: "r1", status: "booked" }, NOW - 2 * H, NOW), line(booked, -3).state);
});

test("a visit that has ended with no word asks 'Did they come?': Kept and Missed, never Cancelled; a marked one asks nothing but may be corrected", () => {
  const booked = { id: "r1", status: "booked" };
  const ended = line(booked, -3);
  assert.equal(ended.unmarked, true);
  assert.deepEqual(ended.asks, ["kept", "missed"]);
  assert.deepEqual(ended.acts, ["kept", "missed"], "the door's own rules: cancelled is until it ends");
  const underWay = line(booked, -0.5);
  assert.equal(underWay.unmarked, false, "not over: nothing is waiting for a word");
  assert.deepEqual(underWay.asks, ["kept", "missed"], "but it has begun, which is when the door takes the word");
  assert.deepEqual(underWay.acts, ["kept", "missed", "cancelled"]);
  const ahead = line(booked, 5);
  assert.deepEqual([ahead.asks, ahead.acts], [[], ["cancelled"]], "ahead: only cancelled, and no question");
  const kept = line({ id: "r1", status: "kept" }, -3);
  assert.deepEqual(
    [kept.unmarked, kept.asks, kept.acts],
    [false, [], ["missed"]],
    "a correction is the panel's, not a question",
  );
  assert.deepEqual(line({ id: "r1", status: "cancelled" }, -3).acts, []);
  const unkept = line(null, -3);
  assert.deepEqual([unkept.unmarked, unkept.asks, unkept.acts], [false, [], []], "no row, nothing to say it on");
});

test("the match is said once: matched by phone, email or name, and only a name is a guess", () => {
  assert.deepEqual(["phone", "email", "name"].map(matchWordsOf), [
    "matched by phone",
    "matched by email",
    "matched by name",
  ]);
  assert.equal(matchWordsOf(null), null);
  assert.equal(matchWordsOf(undefined), null);
  assert.deepEqual(
    [line(null, 1, { via: "phone" }).match, line(null, 1, { via: "phone" }).guess],
    ["matched by phone", false],
  );
  assert.deepEqual(
    [line(null, 1, { via: "name" }).match, line(null, 1, { via: "name" }).guess],
    ["matched by name", true],
  );
  assert.deepEqual([line(null, 1, { via: null }).match, line(null, 1, { via: null }).guess], [null, false]);
});

test("a person's read carries the record's row as a mark: its id and how it stands, booked while nobody has said", () => {
  assert.deepEqual(visitMarkOfDto({ record_id: "r1" }), { id: "r1", status: "booked" });
  assert.deepEqual(visitMarkOfDto({ record_id: "r1", said: "kept" }), { id: "r1", status: "kept" });
  assert.deepEqual(visitMarkOfDto({ record_id: "r1", said: "missed" }), { id: "r1", status: "missed" });
  assert.equal(visitMarkOfDto({}), null, "an event the sync has not kept has no row");
  assert.deepEqual(
    visitMarkOfDto({ said: "kept" }),
    { id: "", status: "kept" },
    "a member's word stands on a read that carries no id for its row: read, and never pressed on",
  );
});

test("the board's block is the same line: its mark, its person's route, and the time it is judged at", () => {
  const block = {
    id: "e1",
    title: "Colour · Maria Lopez",
    time: "2 – 3 PM",
    start: iso(NOW - 3 * H),
    end: iso(NOW - 2 * H),
    visit: { id: "r1", status: "booked" },
    person: { id: "p1", name: "Maria Lopez", via: "email" },
  };
  const l = visitLineOfBlock(block, NOW);
  assert.deepEqual(
    [l.id, l.state?.text, l.unmarked, l.match, l.asks],
    ["r1", "Past", true, "matched by email", ["kept", "missed"]],
  );
  assert.equal(visitLineOfBlock({ ...block, visit: null }, NOW).id, "e1", "no row: the block's own id");
  assert.equal(visitLineOfBlock({ ...block, person: null }, NOW).person, null);
});

/* ---------------------------------------------------------------- the person's page */

const ROW = {
  id: "p-maria",
  display_name: "Maria Lopez",
  wa_profile_name: null,
  phone_e164: "+13055550134",
  consent: "unknown",
  consent_source: null,
  consent_updated_at: null,
  dnc: false,
  channels: ["whatsapp"],
  conversation_count: 0,
  escalation_count: 0,
  needs_human: false,
  open_escalation_reason: null,
  open_escalation_since: null,
  latest_conversation_id: null,
  latest_state: null,
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: null,
  last_message_at: null,
  last_message_direction: null,
  last_message_sender: null,
  last_inbound_text: null,
  last_inbound_at: null,
  last_call_at: null,
  last_inbound_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: null,
  earliest_row_at: null,
  has_backfill: false,
  has_chat: false,
  queued_reply_at: null,
};
/** A visit of Maria's, `fromH` hours from now: the record's row `r-<id>` (none with `row: false`), the member's word, how it was matched. */
const dto = (id, fromH, over = {}) => ({
  id,
  start: iso(NOW + fromH * H),
  end: iso(NOW + (fromH + 1) * H),
  title: "Colour",
  all_day: false,
  via: "phone",
  record_id: `r-${id}`,
  ...over,
});
const profile = (all, over = {}) => {
  const ahead = all.filter((v) => Date.parse(v.end) >= NOW && v.said !== "missed");
  const behind = all.filter((v) => Date.parse(v.end) < NOW && v.said !== "missed");
  return toPersonVM(
    {
      row: { ...ROW, ...over },
      identities: [],
      conversations: [],
      calls: [],
      escalations: [],
      decisions: [],
      receptionist_mode: null,
      workspace_reply_mode: "auto",
      visits: {
        timezone: TZ,
        source: "Google Calendar",
        state: "ok",
        next: ahead[0] ?? null,
        last: behind.at(-1) ?? null,
        all,
      },
    },
    TZ,
    new Date(NOW),
  );
};
const visitRows = (vm) => vm.timeline.filter((i) => i.kind === "visit");

test("History says one word for a visit that has ended and nobody has marked: Past, as the Calendar does, with the two presses it is asked with", () => {
  const vm = profile([dto("a", -48), dto("b", -30, { said: "kept" }), dto("c", -20, { said: "missed" })]);
  const rows = visitRows(vm);
  assert.deepEqual(
    rows.map((r) => r.text),
    ["Missed · Colour", "Kept · Colour", "Past · Colour"],
    "newest first; never 'Past visit' beside the Calendar's 'Past'",
  );
  const [missed, kept, past] = rows;
  assert.deepEqual(past.visit.asks, ["kept", "missed"], "asked of a visit nobody has marked");
  assert.deepEqual(
    past.visit.mark,
    { id: "r-a", status: "booked" },
    "on the record's row, what the door is pressed with",
  );
  assert.deepEqual([kept.visit.asks, missed.visit.asks], [[], []], "a visit with a word asks nothing");
  assert.ok(rows.every((r) => !r.ahead));
});

test("a visit marked while it is under way reads as its mark and is not Coming up; one nobody has marked is booked, and asks once it has begun", () => {
  const vm = profile([dto("k", -0.5, { said: "kept" }), dto("u", -0.25), dto("f", 30)]);
  const rows = visitRows(vm);
  const word = (id) => rows.find((r) => r.id === `v-${id}`);
  assert.equal(word("k").text, "Kept · Colour", "REGRESSION: a kept visit still under way read 'Booked'");
  assert.equal(word("k").ahead, undefined, "and sat under Coming up, where the panel already said Kept");
  assert.equal(word("u").text, "Booked · Colour", "under way and nobody has said: still booked");
  assert.equal(word("u").ahead, true);
  assert.equal(word("f").ahead, true);
  assert.deepEqual(
    vm.comingUp.map((c) => c.id),
    ["v-u", "v-f"],
    "Coming up holds what nobody has marked and has not ended, soonest first",
  );
  const [under, later] = vm.comingUp;
  assert.deepEqual([under.visit.asks, later.visit.asks], [["kept", "missed"], []], "under way asks; ahead does not");
});

test("the match is worded once on the person's page: History, Coming up and the Next visit fact say 'matched by name' for a guess, and say nothing for an exact match", () => {
  const vm = profile([dto("g", 30, { via: "name" }), dto("p", 54, { via: "phone" })]);
  const rows = visitRows(vm);
  assert.ok(rows.find((r) => r.id === "v-g").sub.endsWith("· matched by name"), rows.find((r) => r.id === "v-g").sub);
  assert.ok(!rows.find((r) => r.id === "v-p").sub.includes("matched"), "an exact match is not a guess to say");
  assert.deepEqual(
    vm.comingUp.map((c) => c.match),
    ["matched by name", null],
  );
  const fact = vm.facts.find((f) => f.label === "Next appointment");
  assert.ok(fact.meta.endsWith("· matched by name"), fact.meta);
  // A next visit that is under way and marked says its mark beside its time.
  const kept = profile([dto("k", -0.5, { said: "kept" })]);
  assert.ok(kept.facts.find((f) => f.label === "Next appointment").meta.endsWith("· Kept"));
});

/* ----------------------------------------------------------------------- People's row */

test("a row carries its next and last visit as the one line: People's Visits cell and the Inbox's chip draw it, with its state", () => {
  const rowOf = (visits) => toPersonRowVM({ ...ROW, visits }, TZ, new Date(NOW));
  const last = dto("l", -48);
  const row = rowOf({ timezone: TZ, source: "Google Calendar", state: "ok", next: null, last });
  assert.equal(row.nextVisitLine, null);
  assert.deepEqual(
    [row.lastVisitLine.state?.text, row.lastVisitLine.unmarked, row.lastVisitLine.day, row.lastVisitLine.to],
    ["Past", true, row.lastVisitDay, `calendar/${row.lastVisitDate}:a-r-l`],
    "the last visit has ended and nobody said: Past, where People's cell said only its day",
  );
  const kept = rowOf({
    timezone: TZ,
    source: "Google Calendar",
    state: "ok",
    next: null,
    last: dto("l", -48, { said: "kept" }),
  });
  assert.equal(kept.lastVisitLine.state?.text, "Kept", "a member's word says so");
  const next = rowOf({ timezone: TZ, source: "Google Calendar", state: "ok", next: dto("n", 30), last: null });
  assert.deepEqual([next.nextVisitLine.state, next.nextVisitLine.time], [null, next.nextVisit.split(" · ")[1]]);
  const none = rowOf({ timezone: TZ, source: "Google Calendar", state: "ok", next: null, last: null });
  assert.deepEqual([none.nextVisitLine, none.lastVisitLine], [null, null]);
  assert.deepEqual([toPersonRowVM(ROW, TZ, new Date(NOW)).nextVisitLine], [null], "no calendar: no line");
});

/* ----------------------------------------------------------------------- the consultation */

test("a consultation marked Missed or Cancelled offers no 'Start a proposal' on the Calendar; one kept, booked or with no row does", () => {
  const block = (visit) => ({
    person: { id: "p1" },
    consultation: true,
    consultService: "Bridal package",
    end: iso(NOW - 2 * H),
    visit,
  });
  const people = { rows: [{ id: "p1", deal: null }] };
  const start = (visit) => calendarPeekDeal(block(visit), people, NOW).start;
  assert.equal(
    start({ id: "r1", status: "missed" }),
    null,
    "REGRESSION: they did not come, and a proposal was offered",
  );
  assert.equal(start({ id: "r1", status: "cancelled" }), null);
  assert.equal(start({ id: "r1", status: "kept" })?.act.label, "Start a proposal");
  assert.equal(
    start({ id: "r1", status: "booked" })?.act.label,
    "Start a proposal",
    "past and unmarked is past, not missed",
  );
  assert.equal(start(null)?.act.label, "Start a proposal", "no row, as before");
  assert.equal(start(undefined)?.act.label, "Start a proposal", "a block read before the marks existed");
  assert.equal(
    calendarPeekDeal({ ...block({ id: "r1", status: "booked" }), end: iso(NOW + 2 * H) }, people, NOW).start,
    null,
    "and not before it is over",
  );
});

test("the Pipeline says Past for a consultation nobody marked and Kept for one the owner did, never 'Held'; the group counts them as ended", () => {
  const consultation = (id, over = {}) => ({
    ...dto(id, -26),
    title: "Consultation",
    consultation: true,
    ...over,
  });
  const rows = [
    toPersonRowVM(
      {
        ...ROW,
        id: "unmarked",
        display_name: "Una",
        visits: { timezone: TZ, source: "x", state: "ok", next: null, last: consultation("u") },
      },
      TZ,
      new Date(NOW),
    ),
    toPersonRowVM(
      {
        ...ROW,
        id: "kept",
        display_name: "Kay",
        phone_e164: "+13055550177",
        visits: { timezone: TZ, source: "x", state: "ok", next: null, last: consultation("k", { said: "kept" }) },
      },
      TZ,
      new Date(NOW),
    ),
  ];
  const vm = pipelineOf(rows, NOW, TZ, null);
  const group = vm.groups.find((g) => g.key === "consultations");
  const chip = (id) => group.rows.find((r) => r.id === id).chip.words;
  assert.match(chip("unmarked"), /^Past .* · no proposal yet$/, chip("unmarked"));
  assert.match(chip("kept"), /^Kept .* · no proposal yet$/, chip("kept"));
  assert.equal(group.meta, "2 ended in the last week, nothing since");
});

/* -------------------------------------------------------------------------- Today's yesterday */

const block = (id, t, over = {}) => {
  const start = Date.parse("2026-09-17T18:00:00Z") + (t - 14) * H;
  return {
    id,
    t,
    dur: 60,
    time: `${t - 12}:00 PM`,
    title: `Colour · Ana ${id}`,
    service: "Colour",
    person: { id: `p-${id}`, name: `Ana ${id}`, via: "phone" },
    start: iso(start),
    end: iso(start + H),
    visit: { id: `r-${id}`, status: "booked" },
    ...over,
  };
};
const frame = (key, over = {}) => ({
  key,
  long: key,
  today: false,
  past: false,
  closed: { yes: false, note: null },
  blocks: [],
  allDay: [],
  windows: [],
  ...over,
});
const cal = (yesterday) => ({
  days: [frame("2026-09-17", { past: true, blocks: yesterday }), frame("2026-09-18", { today: true })],
  now: 16,
  feed: { state: "ok" },
  stats: { next: "—" },
});

test("yesterday's visits nobody has marked are asked 'Did they come?': the matched, the ended, the ones the record keeps, three named and the rest counted", () => {
  const blocks = [
    block("a", 14),
    block("b", 15, { visit: { id: "r-b", status: "kept" } }),
    block("c", 16),
    block("d", 17, { visit: null }),
    block("e", 18, { person: null }),
    block("f", 19),
    block("g", 20),
  ];
  const asked = todayVisitsAsked(cal(blocks), NOW, "appointment");
  assert.deepEqual(
    asked.items.map((i) => i.person.name),
    ["Ana a", "Ana c", "Ana f"],
    "the unmarked, matched ones with a row, in the day's order, three at most; a kept one, one the record has no row for and an event nobody is matched to are not asked",
  );
  assert.equal(asked.count, 4);
  assert.equal(asked.to, "calendar/2026-09-17");
  assert.deepEqual(asked.items[0].line.asks, ["kept", "missed"]);
  assert.equal(asked.items[0].to, "calendar/2026-09-17:a-r-a", "the row's door is the visit on its day");
  assert.equal(
    todayVisitsAsked(cal([block("a", 14, { visit: { id: "r-a", status: "missed" } })]), NOW, "appointment"),
    null,
  );
  assert.equal(todayVisitsAsked(cal([]), NOW, "appointment"), null, "none to ask: no block");
  assert.equal(todayVisitsAsked(null, NOW, "appointment"), null);
  assert.equal(
    todayVisitsAsked({ ...cal([block("a", 14)]), days: [frame("2026-09-18", { today: true })] }, NOW, "appointment"),
    null,
    "a calendar that does not hold the day before today asks nothing on a guess",
  );
  assert.equal(
    todayVisitsAsked(cal([block("a", 14)]), Date.parse("2026-09-17T18:30:00Z"), "appointment"),
    null,
    "and nothing about a visit that has not ended",
  );
});

test("they are rows of the queue's own shape, after the steps and before a call worth a listen; Kept and Missed are the verbs, the visit the door; the head's number does not take them", () => {
  const asked = todayVisitsAsked(
    cal([block("a", 14), block("c", 16), block("f", 19), block("g", 20)]),
    NOW,
    "appointment",
  );
  const handoff = { id: "q-1", kind: "handoff", who: "Zed", cta: { label: "Reply", to: "inbox" } };
  const step = { id: "q-step-n1", kind: "step", who: "Di" };
  const call = { id: "q-c-1", kind: "call", who: "Caller" };
  const rows = withVisitsAsked([handoff, step, call], asked);
  assert.deepEqual(
    rows.map((r) => r.kind),
    ["handoff", "step", "visit", "visit", "visit", "visits", "call"],
    "the rest is one row, as the steps' is",
  );
  const [a] = rows.filter((r) => r.kind === "visit");
  assert.deepEqual(
    {
      id: a.id,
      who: a.who,
      initials: a.initials,
      channel: a.channel,
      when: a.when,
      sentence: a.sentence,
      status: a.status,
      cta: a.cta,
      also: a.also,
      visit: a.visit,
      conversationId: a.conversationId,
      callId: a.callId,
    },
    {
      id: "q-visit-r-a",
      who: "Ana a",
      initials: "AA",
      channel: "Calendar",
      when: "Yesterday, 2:00 PM",
      sentence: "Did they come?",
      status: ["Not marked yet", "Colour · Ana a"],
      cta: { label: "Kept", to: "calendar/2026-09-17:a-r-a" },
      also: null,
      visit: { id: "r-a", asks: ["kept", "missed"] },
      conversationId: null,
      callId: null,
    },
  );
  const rest = rows.find((r) => r.kind === "visits");
  assert.deepEqual(
    [rest.who, rest.initials, rest.cta],
    ["1 more appointment to mark", "+1", { label: "Open", to: "calendar/2026-09-17" }],
  );
  assert.deepEqual(withVisitsAsked([handoff], null), [handoff], "none to ask: the queue as it was");
  assert.deepEqual(
    withVisitsAsked([handoff], todayVisitsAsked(cal([block("a", 14)]), NOW, "appointment")).map((r) => r.kind),
    ["handoff", "visit"],
    "one is one row and no line for the rest",
  );
});

test("the head and the foot count them in the workspace's word for an appointment", () => {
  assert.equal(todayVisitsSub(1, "appointment"), "1 appointment to mark");
  assert.equal(todayVisitsSub(3, "appointment"), "3 appointments to mark");
  assert.equal(todayVisitsSub(2, "meeting"), "2 meetings to mark");
  assert.equal(todayVisitsFoot(3, "lesson"), "3 lessons to mark on the Calendar");
  const asked = todayVisitsAsked(cal([block("a", 14), block("c", 16), block("f", 19), block("g", 20)]), NOW, "session");
  assert.equal(asked.word, "session");
  assert.equal(withVisitsAsked([], asked).at(-1).who, "1 more session to mark");
});
