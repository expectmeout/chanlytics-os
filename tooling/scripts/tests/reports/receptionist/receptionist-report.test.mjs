/**
 * The Receptionist lens's own read, drawn from what the database answers (contracts reports/receptionist/): the DTO the
 * route builds from receptionist_series (00380), its guard, and the page-only fold that says every sentence the lens
 * draws: the hold, the topics and languages, how calls ended, the booking link, a handover, the calls nobody took,
 * what came while the business was closed, and what is stuck. EXECUTED: the real functions over a small world, no page.
 * 14 Sep 2026 is a Monday; the hours are reports-closed.test.mjs's own. Run it under TEST_TZ=Pacific/Auckland too: what
 * came while closed is counted from the arrivals' own day and quarter hour, never a clock.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOOKED_NEEDS_A_LINK,
  BOOKED_NEEDS_TODAY,
  MISSED_CALL_TOUCH_WORDS,
  isReceptionistSeriesDto,
  metricWordsOf,
  receptionistDtoOf,
  toReceptionistReportVM,
} from "@chanlytics/contracts";

const NOW = Date.parse("2026-09-21T12:00:00Z");
const PROFILE = {
  hours: {
    mon: { open: "09:30", close: "18:00" },
    tue: { open: "09:30", close: "18:00" },
    wed: { open: "09:30", close: "18:00" },
    thu: { open: "09:30", close: "18:00" },
    fri: { open: "09:30", close: "18:00" },
    sat: { open: "09:30", close: "19:00" },
  },
  closures: [{ date: "2026-09-18" }],
};

/** What the route hands the fold of the series: the SQL's answer, with the links and what is stuck already counted. */
const FACTS = {
  hold: {
    now: {
      total: 14,
      sent: 9,
      canceled: 1,
      steered: 1,
      overtaken: 1,
      person_first: 1,
      waiting: 0,
      other: 1,
      low_confidence: 3,
    },
    before: { total: 10, sent: 8 },
  },
  topics: { of: 41, stamped: 33, by_intent: { booking: 12, pricing: 9, hours: 6, services: 4, other: 2 } },
  languages: { of: 38, stamped: 38, by_language: { en: 30, es: 8 } },
  blocked: { total: 4, by_reason: { human_has_it: 3, opted_out: 1 } },
  call_endings: { total: 18, by_reason: { user_hangup: 11, agent_hangup: 5, unknown: 2 } },
  handover: {
    now: { n: 12, replied: { n: 11, median_s: 540 }, settled: { n: 9, median_s: 3900 } },
    before: { n: 10, replied: { n: 9, median_s: 780 }, settled: { n: 7, median_s: 5400 } },
  },
  missed: { now: { n: 6, touched: 4, pending: 1, unknown: 1 }, before: { n: 4, touched: 3, pending: 0, unknown: 0 } },
  after_hours: [
    { d: "2026-09-20", q: 44, n: 3, a: 1 },
    { d: "2026-09-16", q: 84, n: 2, a: 2 },
    { d: "2026-09-14", q: 40, n: 4, a: 4 },
  ],
  links: { sent: 7, booked: 3, calendar: "ok" },
  stuck: { waiting: 3, oldest_at: "2026-09-21T09:50:00Z", callbacks: 1, capped: false },
};
const dto = (over = {}, profile = PROFILE) => ({
  timezone: "UTC",
  today: "2026-09-21",
  days: 30,
  series: { timezone: "UTC", today: "2026-09-21", days: 30, ...FACTS, ...over },
  profile,
});
const vm = (over, profile) => toReceptionistReportVM(dto(over, profile), { nowMs: NOW });
const rows = (part) => part.rows.map((r) => [r.label, r.value]);
/** Every figure the fold draws as a figure. */
const figuresOf = (v) => [...v.handover, v.missed, ...(v.closed ? [v.closed] : []), ...v.stuck];
const NONE = {
  total: 0,
  sent: 0,
  canceled: 0,
  steered: 0,
  overtaken: 0,
  person_first: 0,
  waiting: 0,
  other: 0,
  low_confidence: 0,
};
const NO_HANDOVERS = { n: 0, replied: { n: 0, median_s: null }, settled: { n: 0, median_s: null } };
const NO_MISSED = { n: 0, touched: 0, pending: 0, unknown: 0 };
/** A period with nothing in it, in every part. */
const QUIET = {
  hold: { now: NONE, before: { total: 0, sent: 0 } },
  topics: { of: 0, stamped: 0, by_intent: {} },
  languages: { of: 0, stamped: 0, by_language: {} },
  blocked: { total: 0, by_reason: {} },
  call_endings: { total: 0, by_reason: {} },
  handover: { now: NO_HANDOVERS, before: NO_HANDOVERS },
  missed: { now: NO_MISSED, before: NO_MISSED },
  after_hours: [],
  links: { sent: 0, booked: 0, calendar: "ok" },
  stuck: { waiting: 0, oldest_at: null, callbacks: 0, capped: false },
};

test("the hold: nine of fourteen went out as it ended, three held for not being sure", () => {
  const { hold } = vm();
  assert.deepEqual(rows(hold), [
    ["Went out as the hold ended", 9],
    ["You cancelled", 1],
    ["You changed", 1],
    ["A newer message came first", 1],
    ["A person answered first", 1],
    ["Did not go out", 1],
  ]);
  assert.equal(hold.empty, null);
  assert.equal(hold.line, "9 of 14 went out as the hold ended. 3 were held back as not sure enough to send alone.");
  assert.equal(hold.rows[0].share, 1, "the largest bar is the whole of its group");
  assert.equal(hold.rows[1].share, 1 / 9);

  const one = vm({ hold: { ...FACTS.hold, now: { ...FACTS.hold.now, low_confidence: 1 } } }).hold;
  assert.match(one.line, /\. 1 was held back as not sure enough to send alone\.$/);
  const sure = vm({ hold: { ...FACTS.hold, now: { ...FACTS.hold.now, low_confidence: 0 } } }).hold;
  assert.equal(
    sure.line,
    "9 of 14 went out as the hold ended.",
    "no second sentence where none was held for being unsure",
  );

  const waiting = vm({ hold: { ...FACTS.hold, now: { ...FACTS.hold.now, waiting: 2, total: 16 } } }).hold;
  assert.deepEqual(waiting.rows.map((r) => r.label).slice(4, 6), ["A person answered first", "Still waiting"]);

  const none = vm({ hold: { ...FACTS.hold, now: NONE } }).hold;
  assert.deepEqual(none, { rows: [], line: null, empty: "No reply waited in a hold in this period." });
});

test("topics say how many had one, and what they cover", () => {
  const { topics } = vm();
  assert.equal(topics.line, "33 of 41 text and WhatsApp messages had a topic.");
  assert.deepEqual(rows(topics).slice(0, 2), [
    ["Booking", 12],
    ["Pricing question", 9],
  ]);
  assert.deepEqual(
    rows(topics).map(([, n]) => n),
    [12, 9, 6, 4, 2],
    "most first",
  );
  assert.equal(topics.empty, null);

  const nothing = vm({ topics: { of: 0, stamped: 0, by_intent: {} } }).topics;
  assert.deepEqual(nothing, {
    rows: [],
    line: null,
    empty: "Topics are read from texts and WhatsApp messages. None came in this period.",
  });
  // Email carries no topic: a workspace that only has email, or messages from before the receptionist stamped them.
  const unstamped = vm({ topics: { of: 6, stamped: 0, by_intent: {} } }).topics;
  assert.deepEqual(unstamped, {
    rows: [],
    line: null,
    empty: "No topic is recorded for the 6 messages that came by text or WhatsApp.",
  });
  assert.equal(
    vm({ topics: { of: 1, stamped: 0, by_intent: {} } }).topics.empty,
    "No topic is recorded for the 1 message that came by text or WhatsApp.",
  );
  // A topic the words do not know is said as it was stamped, never dropped.
  assert.deepEqual(rows(vm({ topics: { of: 3, stamped: 3, by_intent: { gift_card: 3 } } }).topics), [["gift_card", 3]]);
});

test("languages are drawn with two or more", () => {
  const { languages } = vm();
  assert.deepEqual(rows(languages), [
    ["English", 30],
    ["Spanish", 8],
  ]);
  assert.equal(languages.line, "38 of 38 replies say the language they were written in.");
  assert.equal(languages.empty, null);
  assert.equal(vm({ languages: { of: 38, stamped: 38, by_language: { en: 38 } } }).languages, null);
  assert.equal(vm({ languages: { of: 0, stamped: 0, by_language: {} } }).languages, null);
  assert.deepEqual(rows(vm({ languages: { of: 9, stamped: 9, by_language: { other: 2, en: 7 } } }).languages), [
    ["English", 7],
    ["Another language", 2],
  ]);
});

test("how calls ended, in the owner's words, the unrecorded ones said so", () => {
  const { callEndings } = vm();
  assert.deepEqual(rows(callEndings), [
    ["Customer hung up", 11],
    ["Receptionist ended the call", 5],
    ["Not recorded", 2],
  ]);
  assert.equal(callEndings.line, "18 calls that connected.");
  assert.equal(
    vm({ call_endings: { total: 1, by_reason: { user_hangup: 1 } } }).callEndings.line,
    "1 call that connected.",
  );
  assert.deepEqual(rows(vm({ call_endings: { total: 2, by_reason: { carrier_dropped: 2 } } }).callEndings), [
    ["carrier dropped", 2],
  ]);
  // Nobody rang: nobody phoned. Somebody rang and found nobody (a missed call, one under the hour, one with no caller on
  // record): a call that did not connect is not "nobody phoned", which the missed-calls figure beside it would contradict.
  const nobodySpoke = { total: 0, by_reason: {} };
  assert.deepEqual(vm({ call_endings: nobodySpoke, missed: { now: NO_MISSED, before: NO_MISSED } }).callEndings, {
    rows: [],
    line: null,
    empty: "Nobody phoned in this period.",
  });
  for (const rang of [
    { n: 2, touched: 1, pending: 0, unknown: 0 },
    { n: 0, touched: 0, pending: 1, unknown: 0 },
    { n: 0, touched: 0, pending: 0, unknown: 3 },
  ])
    assert.deepEqual(vm({ call_endings: nobodySpoke, missed: { now: rang, before: NO_MISSED } }).callEndings, {
      rows: [],
      line: null,
      empty: "No call connected in this period.",
    });
  // Calls that connected are drawn whether or not some were missed.
  assert.equal(vm({ missed: { now: FACTS.missed.now, before: NO_MISSED } }).callEndings.empty, null);
});

test("the link and what came of it, said by what the calendar could say", () => {
  const linkOf = (links) => vm({ links }).link;
  assert.deepEqual(linkOf({ sent: 7, booked: 3, calendar: "ok" }), {
    sent: 7,
    booked: 3,
    line: "7 people were sent the booking link; 3 have booked since.",
  });
  assert.equal(
    linkOf({ sent: 7, booked: null, calendar: "ended" }).line,
    "7 people were sent the booking link. " + BOOKED_NEEDS_TODAY,
  );
  assert.equal(
    linkOf({ sent: 7, booked: null, calendar: "none" }).line,
    "7 people were sent the booking link. " + BOOKED_NEEDS_A_LINK,
  );
  assert.equal(
    linkOf({ sent: 7, booked: null, calendar: "unavailable" }).line,
    "7 people were sent the booking link. Your calendar could not be read.",
  );
  assert.equal(
    linkOf({ sent: 0, booked: null, calendar: "none" }).line,
    "Nobody was sent the booking link in this period.",
  );
  assert.equal(linkOf({ sent: 0, booked: 0, calendar: "ok" }).line, "Nobody was sent the booking link in this period.");
  assert.equal(
    linkOf({ sent: 1, booked: 1, calendar: "ok" }).line,
    "1 person was sent the booking link; 1 has booked since.",
  );
  assert.equal(
    linkOf({ sent: 2, booked: 0, calendar: "ok" }).line,
    "2 people were sent the booking link; 0 have booked since.",
  );
});

test("you, after a handover: the middle, its n, and the period before", () => {
  const [reply, settled] = vm().handover;
  assert.deepEqual(reply, {
    id: "handover-reply",
    metric: "handover_first_reply",
    label: "Your first reply after a handover",
    value: "9m",
    meta: "11 of 12 handovers that wanted a message had a reply from you",
    compare: "was 13m the 30 days before",
    n: 11,
    minN: 5,
  });
  assert.deepEqual(settled, {
    id: "handover-settled",
    metric: "handover_settled",
    label: "Time to settle a handover",
    value: "1h 5m",
    meta: "9 of 12 settled",
    compare: "was 1h 30m the 30 days before",
    n: 9,
    minN: 5,
  });

  // Nothing handed over: a dash with words, and nothing to set against.
  const none = vm({ handover: { now: NO_HANDOVERS, before: FACTS.handover.before } }).handover;
  for (const f of none) {
    assert.equal(f.value, "—");
    assert.equal(f.meta, "nothing was handed over in this period");
    assert.equal(f.compare, null, "a time is not set against a dash");
    assert.equal(f.n, 0);
  }

  // Few replies carry their n, which is what greys the figure (the kit's Figure, under minN).
  const few = vm({
    handover: { ...FACTS.handover, now: { n: 4, replied: { n: 3, median_s: 120 }, settled: { n: 1, median_s: 30 } } },
  }).handover;
  assert.deepEqual([few[0].n, few[0].minN, few[0].value], [3, 5, "2m"]);
  assert.deepEqual([few[1].n, few[1].value, few[1].meta], [1, "30s", "1 of 4 settled"]);
  assert.equal(few[0].meta, "3 of 4 handovers that wanted a message had a reply from you");
  assert.equal(
    vm({
      handover: {
        ...FACTS.handover,
        now: { n: 1, replied: { n: 1, median_s: 60 }, settled: { n: 0, median_s: null } },
      },
    }).handover[0].meta,
    "1 of 1 handover that wanted a message had a reply from you",
  );

  // No period before to set it against: no comparison, not a made-up one.
  const young = vm({ handover: { now: FACTS.handover.now, before: NO_HANDOVERS } }).handover;
  assert.deepEqual(
    young.map((f) => f.compare),
    [null, null],
  );
});

test("missed calls answered within an hour: a person, not a call; too recent ones are said, not counted", () => {
  const { missed } = vm();
  assert.equal(missed.label, "Missed calls answered within an hour");
  assert.equal(missed.label, `Missed calls answered within ${MISSED_CALL_TOUCH_WORDS}`);
  assert.ok(
    metricWordsOf("missed_calls_answered").includes(MISSED_CALL_TOUCH_WORDS),
    "the definition says the same hour",
  );
  assert.deepEqual(missed, {
    id: "missed-calls",
    metric: "missed_calls_answered",
    label: "Missed calls answered within an hour",
    value: "4 of 6",
    meta: "1 under an hour old, not counted yet · 1 with no caller on record not counted",
    compare: "was 3 of 4 the 30 days before",
    n: 6,
    minN: 5,
  });

  const onlyRecent = vm({
    missed: { now: { n: 6, touched: 4, pending: 2, unknown: 0 }, before: FACTS.missed.before },
  }).missed;
  assert.equal(onlyRecent.meta, "2 under an hour old, not counted yet");
  const onlyUnknown = vm({
    missed: { now: { n: 6, touched: 4, pending: 0, unknown: 3 }, before: FACTS.missed.before },
  }).missed;
  assert.equal(onlyUnknown.meta, "3 with no caller on record not counted");
  const plain = vm({
    missed: { now: { n: 6, touched: 4, pending: 0, unknown: 0 }, before: FACTS.missed.before },
  }).missed;
  assert.equal(plain.meta, "6 people rang and found nobody");
  assert.equal(plain.value, "4 of 6");

  // Nobody rang and found nobody: a dash with words, and nothing to set against a dash.
  const nobody = vm({ missed: { now: NO_MISSED, before: FACTS.missed.before } }).missed;
  assert.equal(nobody.value, "—");
  assert.equal(nobody.meta, "no call went unanswered at the phone");
  assert.equal(nobody.compare, null);
  // A call under the hour is said even where nothing else is counted yet.
  const justNow = vm({ missed: { now: { n: 0, touched: 0, pending: 1, unknown: 0 }, before: NO_MISSED } }).missed;
  assert.deepEqual([justNow.value, justNow.meta], ["—", "1 under an hour old, not counted yet"]);
  assert.equal(vm({ missed: { now: FACTS.missed.now, before: NO_MISSED } }).missed.compare, null);
});

test("while you were closed: the hours decide, and no hours is a question", () => {
  const { closed } = vm();
  // Sunday 11:00 and Wednesday 21:00 are closed, Monday 10:00 is open: 3 + 2 came, 1 + 2 were answered.
  assert.deepEqual(closed, {
    id: "closed",
    metric: "answered_while_closed",
    label: "Answered while you were closed",
    value: "3 of 5",
    meta: "5 messages came while you were closed; the receptionist answered 3.",
    compare: null,
    n: 5,
    minN: 5,
    unset: false,
  });

  const unset = vm({}, { hours: {} }).closed;
  assert.deepEqual(unset, {
    id: "closed",
    metric: "answered_while_closed",
    label: "Answered while you were closed",
    value: "—",
    meta: "set your opening hours to see this",
    compare: null,
    door: "admin/hours",
    unset: true,
  });
  assert.equal(vm({}, null).closed, null, "the hours could not be read: nothing is said of them");

  const open = vm({ after_hours: [{ d: "2026-09-14", q: 40, n: 4, a: 4 }] }).closed;
  assert.equal(open.value, "0");
  assert.equal(open.meta, "no message came while you were closed");
  assert.equal(open.unset, false);
  assert.equal(open.n, undefined, "a count of nothing is no ratio");

  // A closure closes the day, whatever the hours: Friday 18 September.
  const closure = vm({ after_hours: [{ d: "2026-09-18", q: 40, n: 1, a: 0 }] }).closed;
  assert.deepEqual(
    [closure.value, closure.meta],
    ["0 of 1", "1 message came while you were closed; the receptionist answered 0."],
  );
});

test("stuck: needs you, call-backs and replies held back", () => {
  const v = vm();
  assert.deepEqual(
    v.stuck.map((f) => [f.metric, f.label, f.value, f.door]),
    [
      ["waiting_on_you", "Needs you", "3", "inbox"],
      ["call_backs", "Call-backs", "1", "today"],
      ["replies_held_back", "Replies held back", "4", "inbox"],
    ],
  );
  assert.deepEqual(
    v.stuck.map((f) => f.meta),
    [
      "the oldest has waited 2h 10m",
      "people to ring, counted in Needs you",
      "a person had the thread 3 · asked to stop 1",
    ],
  );
  assert.deepEqual(
    v.heldBack.slice(0, 2).map((r) => [r.label, r.value]),
    [
      ["A person had the thread", 3],
      ["Asked to stop", 1],
    ],
  );
  assert.equal(v.heldBack[0].share, 1);
  // The hold's "did not go out" and the door's refusals overlap by design (a draft the door refused is in both):
  // neither is ever added to the other.
  assert.equal(v.stuck[2].value, "4");
  assert.equal(v.hold.rows.at(-1).value, 1);

  // The database lists at most 500 open escalations: a full list is a floor, not a count, and the figure says so.
  const cut = vm({ stuck: { waiting: 212, oldest_at: "2026-09-21T09:50:00Z", callbacks: 9, capped: true } }).stuck;
  assert.deepEqual(
    [cut[0].value, cut[1].value],
    ["212+", "9"],
    "waiting on you is at least 212; the Inbox is where the rest is",
  );
  assert.equal(vm({ stuck: { ...FACTS.stuck, capped: false } }).stuck[0].value, "3", "a list not cut is a count");
  const quiet = vm({
    stuck: { waiting: 0, oldest_at: null, callbacks: 0, capped: false },
    blocked: { total: 0, by_reason: {} },
  }).stuck;
  assert.deepEqual(
    quiet.map((f) => [f.value, f.meta]),
    [
      ["0", "nobody is waiting for you"],
      ["0", "no call-back is waiting"],
      ["0", "none were held at the door in this period"],
    ],
  );
  // More than two reasons: the two most common; one the words do not know is said as it was written.
  const many = vm({ blocked: { total: 9, by_reason: { human_has_it: 2, opted_out: 3, brand_new_refusal: 4 } } });
  assert.equal(many.stuck[2].meta, "brand new refusal 4 · asked to stop 3");
  assert.equal(many.heldBack[0].label, "Brand new refusal");
  assert.equal(many.heldBack.length, 3);
});

test("nothing in the period: every part is absent with words, never a zero percentage or NaN", () => {
  const v = vm(QUIET);
  assert.equal(v.available, true);
  assert.equal(v.hold.empty, "No reply waited in a hold in this period.");
  assert.equal(v.topics.empty, "Topics are read from texts and WhatsApp messages. None came in this period.");
  assert.equal(v.languages, null);
  assert.equal(v.callEndings.empty, "Nobody phoned in this period.");
  assert.equal(v.link.line, "Nobody was sent the booking link in this period.");
  for (const part of [v.hold, v.topics, v.callEndings]) assert.deepEqual([part.rows, part.line], [[], null]);
  assert.deepEqual(
    v.handover.map((f) => [f.value, f.meta]),
    [
      ["—", "nothing was handed over in this period"],
      ["—", "nothing was handed over in this period"],
    ],
  );
  assert.deepEqual([v.missed.value, v.missed.meta], ["—", "no call went unanswered at the phone"]);
  assert.deepEqual([v.closed.value, v.closed.meta], ["0", "no message came while you were closed"]);
  assert.deepEqual(
    v.stuck.map((f) => [f.value, f.meta]),
    [
      ["0", "nobody is waiting for you"],
      ["0", "no call-back is waiting"],
      ["0", "none were held at the door in this period"],
    ],
  );
  assert.deepEqual(v.heldBack, []);
  assert.equal(JSON.stringify(v).includes("NaN"), false);
  assert.equal(JSON.stringify(v).includes("Infinity"), false);
  for (const f of figuresOf(v)) assert.ok(!f.value.includes("%"), `${f.id}: no percentage`);
  for (const f of figuresOf(vm())) assert.ok(!f.value.includes("%"), `${f.id}: no percentage`);
});

test("a database without receptionist_series gives a view model that draws nothing of the new parts", () => {
  const v = toReceptionistReportVM({ ...dto(), series: null }, { nowMs: NOW });
  assert.equal(v.available, false);
  assert.deepEqual(
    [v.hold.rows, v.topics.rows, v.callEndings.rows, v.heldBack, v.handover, v.stuck],
    [[], [], [], [], [], []],
  );
  assert.deepEqual([v.languages, v.closed], [null, null]);
  assert.equal(JSON.stringify(v).includes("NaN"), false);
});

/** What receptionist_series answers (00380), as the repository hands it over. */
const SQL = {
  timezone: "UTC",
  today: "2026-09-21",
  end: "2026-09-21",
  days: 30,
  hold: FACTS.hold,
  topics: FACTS.topics,
  languages: FACTS.languages,
  blocked: FACTS.blocked,
  call_endings: FACTS.call_endings,
  handover: FACTS.handover,
  missed: FACTS.missed,
  after_hours: FACTS.after_hours,
  links: {
    total: 2,
    people: [
      { c: "c1", at: "2026-09-20T10:00:00Z" },
      { c: "c2", at: "2026-09-20T11:00:00Z" },
    ],
  },
  stuck: { open: [] },
};
const open = (reason, created_at, state, over = {}) => ({
  reason,
  created_at,
  state,
  paused_until: null,
  assignee_user_id: null,
  ...over,
});
const HEAD = { timezone: "UTC", today: "2026-09-21", days: 30 };
const parts = (over = {}) => ({ booked: null, profile: PROFILE, head: HEAD, nowMs: NOW, ...over });

test("the route's DTO: who waits on you is counted by the one rule, and the links by what the calendar could say", () => {
  const rows = [
    open("human_token", "2026-09-21T08:00:00Z", "needs_human"),
    open("callback", "2026-09-21T09:00:00Z", "open"),
    open("manual", "2026-09-21T07:00:00Z", "open", { assignee_user_id: "u2" }), // a teammate has it
    open("human_token", "2026-09-20T09:00:00Z", "snoozed"), // put aside
  ];
  const made = receptionistDtoOf({ ...SQL, stuck: { open: rows } }, parts());
  assert.deepEqual(made.series.stuck, { waiting: 2, oldest_at: "2026-09-21T08:00:00Z", callbacks: 1, capped: false });
  // A pause that a person's own reply left behind is theirs; a pause with an escalation open is the receptionist waiting for them.
  const paused = open("human_token", "2026-09-21T10:00:00Z", "open", { paused_until: "2026-09-21T18:00:00Z" });
  assert.equal(receptionistDtoOf({ ...SQL, stuck: { open: [paused] } }, parts()).series.stuck.waiting, 1);
  const none = receptionistDtoOf(SQL, parts());
  assert.deepEqual(none.series.stuck, { waiting: 0, oldest_at: null, callbacks: 0, capped: false });

  // receptionist_series lists at most 500 open escalations (00380's limit): a list that long may be cut, one a row shorter is whole.
  const listOf = (n) => Array.from({ length: n }, () => open("human_token", "2026-09-21T08:00:00Z", "needs_human"));
  const full = receptionistDtoOf({ ...SQL, stuck: { open: listOf(500) } }, parts()).series.stuck;
  assert.deepEqual([full.capped, full.waiting], [true, 500], "counted from the listed ones: a floor, not the count");
  assert.equal(receptionistDtoOf({ ...SQL, stuck: { open: listOf(499) } }, parts()).series.stuck.capped, false);

  assert.deepEqual(receptionistDtoOf(SQL, parts({ booked: { calendar: "ok", booked: 1 } })).series.links, {
    sent: 2,
    booked: 1,
    calendar: "ok",
  });
  assert.deepEqual(receptionistDtoOf(SQL, parts({ booked: null })).series.links, {
    sent: 2,
    booked: null,
    calendar: "none",
  });
  assert.deepEqual(receptionistDtoOf(SQL, parts({ booked: { calendar: "ended", booked: null } })).series.links, {
    sent: 2,
    booked: null,
    calendar: "ended",
  });

  // The rest of the database's answer is carried as it came, and the head is the series' own.
  assert.deepEqual(made.series.hold, SQL.hold);
  assert.deepEqual(made.series.after_hours, SQL.after_hours);
  assert.equal("people" in made.series.links, false, "the people are counted, not carried");
  assert.deepEqual(
    [made.timezone, made.today, made.end, made.days, made.profile],
    ["UTC", "2026-09-21", "2026-09-21", 30, PROFILE],
  );

  // No receptionist_series in this database yet: no series, and the head is the one the route asked.
  assert.deepEqual(receptionistDtoOf(null, parts({ head: { ...HEAD, end: "2026-09-10" }, profile: null })), {
    ...HEAD,
    end: "2026-09-10",
    series: null,
    profile: null,
  });
  assert.equal("end" in receptionistDtoOf(null, parts()), false, "an end that was not asked is not carried");

  // It is pure: asking twice, or in another order, gives the same answer, and does not change what it was given.
  const before = JSON.stringify(SQL);
  assert.deepEqual(receptionistDtoOf(SQL, parts()), receptionistDtoOf(SQL, parts()));
  assert.equal(JSON.stringify(SQL), before);
});

test("the DTO folds into the same view model the page draws", () => {
  const rows = [
    open("human_token", "2026-09-21T09:50:00Z", "needs_human"),
    open("callback", "2026-09-21T10:00:00Z", "open"),
  ];
  const made = receptionistDtoOf({ ...SQL, stuck: { open: rows } }, parts({ booked: { calendar: "ok", booked: 1 } }));
  const v = toReceptionistReportVM(made, { nowMs: NOW });
  assert.equal(v.available, true);
  assert.equal(v.link.line, "2 people were sent the booking link; 1 has booked since.");
  assert.deepEqual(
    v.stuck.map((f) => [f.value, f.meta]),
    [
      ["2", "the oldest has waited 2h 10m"],
      ["1", "people to ring, counted in Needs you"],
      ["4", "a person had the thread 3 · asked to stop 1"],
    ],
  );
  assert.equal(v.closed.value, "3 of 5");
});

test("the database's answer is told from its refusal", () => {
  assert.equal(isReceptionistSeriesDto(SQL), true);
  assert.equal(
    isReceptionistSeriesDto({ ...SQL, stuck: { open: [open("callback", "2026-09-21T09:00:00Z", "open")] } }),
    true,
  );
  assert.equal(isReceptionistSeriesDto({ error: "unknown_tenant" }), false);
  assert.equal(isReceptionistSeriesDto(null), false);
  assert.equal(isReceptionistSeriesDto("receptionist_series"), false);
  assert.equal(isReceptionistSeriesDto({}), false);
  for (const gone of ["timezone", "today", "days", "hold", "handover", "stuck"])
    assert.equal(isReceptionistSeriesDto({ ...SQL, [gone]: undefined }), false, `without ${gone}`);
  assert.equal(isReceptionistSeriesDto({ ...SQL, stuck: {} }), false, "the open rows are the builder's input");
});
