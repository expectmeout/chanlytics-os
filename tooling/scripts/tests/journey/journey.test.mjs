/**
 * The journey follows the business (spec 2026-10-09 §4.8, J1 and J2): what a workspace calls an appointment, derived
 * now and stored later (appointmentWordOf), every phrase the word makes said once (appointmentWords), and the moments in
 * the order its customers pass through them (journeyOf), for the four shapes a workspace can have: with a calendar or
 * not, with deals or not. Executed over contracts' own functions; the one-word scan over the view models is below them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { relative, sep } from "node:path";
import * as C from "@chanlytics/contracts";
import { ratchet } from "../_ratchet.mjs";
import { ROOT, readerFiles, readerLines } from "../_source.mjs";

/** The four shapes: a calendar connected or not, deals on or not. */
const SHAPES = [
  { calendarOn: false, dealsOn: false },
  { calendarOn: true, dealsOn: false },
  { calendarOn: true, dealsOn: true },
  { calendarOn: false, dealsOn: true },
];
const NONE_HELD = new Set();

test("the set is five words, and call, consultation, booking and class are not among them", () => {
  assert.deepEqual([...C.APPOINTMENT_WORDS], ["appointment", "visit", "meeting", "session", "lesson"]);
  for (const w of C.APPOINTMENT_WORDS) assert.equal(C.isAppointmentWord(w), true, w);
  for (const w of ["call", "consultation", "booking", "class", "Visit", "", null, 3])
    assert.equal(C.isAppointmentWord(w), false, String(w));
});

test("the word is the one picked, else a meeting where deals are on, else an appointment; nothing else is read", () => {
  assert.equal(C.appointmentWordOf({ stored: "session", sellsBy: "proposal" }), "session", "a pick outranks the shape");
  assert.equal(C.appointmentWordOf({ stored: null, sellsBy: "proposal" }), "meeting");
  assert.equal(C.appointmentWordOf({ stored: null, sellsBy: "booking" }), "appointment");
  assert.equal(C.appointmentWordOf({ stored: null, sellsBy: null }), "appointment", "not asked yet: an appointment");
  assert.equal(
    C.appointmentWordOf({ stored: "class", sellsBy: null }),
    "appointment",
    "a word outside the set is no pick",
  );
});

test("each word says its phrases once, with its own article and verb", () => {
  const visit = C.appointmentWords("visit");
  assert.deepEqual(
    [visit.before.caps, visit.before.name, visit.after.caps, visit.a],
    ["Visit tomorrow", "Visit reminder", "After the visit", "a visit"],
  );
  assert.equal(visit.offTomorrow(1), "Off · 1 person visits tomorrow");
  assert.equal(visit.offTomorrow(3), "Off · 3 people visit tomorrow");
  assert.equal(visit.offYesterday(2), "Off · 2 people visited yesterday");
  assert.equal(visit.tomorrowWho, "everyone with a visit tomorrow");
  assert.equal(visit.yesterdayWho, "everyone who visited yesterday");
  assert.equal(visit.lapsedHint, "No visit in 45 days, and nothing booked");
  const meeting = C.appointmentWords("meeting");
  assert.deepEqual(
    [meeting.before.caps, meeting.before.name, meeting.after.caps, meeting.a],
    ["Meeting tomorrow", "Meeting reminder", "After the meeting", "a meeting"],
  );
  assert.equal(meeting.offTomorrow(1), "Off · 1 person has a meeting tomorrow");
  assert.equal(meeting.offTomorrow(3), "Off · 3 people have a meeting tomorrow");
  assert.equal(meeting.offYesterday(3), "Off · 3 people had a meeting yesterday");
  assert.equal(meeting.byMany, "by meetings");
  const appointment = C.appointmentWords("appointment");
  assert.equal(appointment.a, "an appointment");
  assert.equal(appointment.before.hint, "The day before an appointment on the calendar");
  assert.equal(appointment.after.hint, "The day after an appointment, when nothing is booked next");
  assert.equal(appointment.startsWith, "an appointment tomorrow, an appointment yesterday");
  assert.equal(
    appointment.needsCalendar,
    "Appointments are read from your calendar, and none is connected. Connect one under Settings › Business.",
  );
});

test("journeyOf: the moments in the journey's order for each shape, Proposal waiting before Quiet, ids free of the word", () => {
  for (const shape of SHAPES) {
    const stages = C.journeyOf({ ...shape, word: "appointment", held: NONE_HELD });
    const ids = stages.map((s) => s.id);
    assert.deepEqual(
      ids,
      shape.dealsOn
        ? ["first_contact", "before", "after", "proposal", "quiet"]
        : ["first_contact", "before", "after", "quiet"],
      JSON.stringify(shape),
    );
    for (const id of ids) assert.ok(C.JOURNEY_STAGE_IDS.includes(id), id);
    assert.deepEqual(
      stages.filter((s) => s.unmet === "calendar").map((s) => s.id),
      shape.calendarOn ? [] : ["before", "after"],
      `${JSON.stringify(shape)}: the appointment moments need a calendar`,
    );
    assert.equal(stages.find((s) => s.id === "quiet").trigger, shape.calendarOn ? "lapsed" : "quiet_30");
    assert.equal(stages[0].kind, "receptionist");
    assert.ok(stages.slice(1).every((s) => s.kind === "moment"));
  }
  // A stage that holds a campaign is drawn whatever the shape: a follow-up made while deals were on.
  const held = C.journeyOf({ calendarOn: true, dealsOn: false, word: "appointment", held: new Set(["proposal"]) });
  assert.deepEqual(
    held.map((s) => s.id),
    ["first_contact", "before", "after", "proposal", "quiet"],
  );
  const session = C.journeyOf({ calendarOn: true, dealsOn: true, word: "session", held: NONE_HELD });
  assert.deepEqual(
    session.map((s) => s.caps),
    ["First contact", "Session tomorrow", "After the session", "Proposal waiting", "Quiet or lapsed"],
  );
  assert.deepEqual(
    session.map((s) => s.name),
    ["Your receptionist", "Session reminder", "How did it go", "Proposal follow-up", "Win-back"],
  );
  assert.deepEqual(
    session.map((s) => s.one),
    [false, false, false, true, false],
    "the follow-up is the one moment that holds at most one campaign (00167)",
  );
  const off = Object.fromEntries(session.map((s) => [s.id, s.off]));
  assert.equal(off.first_contact, null, "the receptionist is nobody's to turn on");
  assert.deepEqual(
    [off.before.hint, off.before.when, off.before.why(3)],
    ["tomorrow", { day: "Every", at: "day" }, "Off · 3 people have a session tomorrow"],
  );
  assert.deepEqual([off.after.hint, off.after.when], ["yesterday", { day: "The day", at: "after" }]);
  assert.deepEqual(
    [off.proposal.why(1), off.quiet.why(2), off.quiet.why(1)],
    ["Off · 1 proposal waiting", "Off · 2 people have gone quiet", "Off · 1 person has gone quiet"],
    "one person has gone quiet, in the singular",
  );
});

test("journeyStageOf: the stage a campaign's trigger stands on, and none for a list, the month's offer or a reach-out's step", () => {
  const cases = {
    new_week: "first_contact",
    phoned_only: "first_contact",
    visit_tomorrow: "before",
    visited: "after",
    proposal_waiting: "proposal",
    quiet_30: "quiet",
    lapsed: "quiet",
    saved_list: null,
    everyone_monthly: null,
    lead_first: null,
    after_step: null,
  };
  for (const [trigger, stage] of Object.entries(cases)) assert.equal(C.journeyStageOf(trigger), stage, trigger);
});

test("the drawer's schedule and a card's pool say the workspace's word; a proposal's say none", () => {
  const p = { trigger: "visit_tomorrow", run_hour: 10, cap_per_run: 25, gap_days: 90, cadence_days: 30 };
  assert.equal(C.scheduleLine(p, "meeting"), "Daily 10:00 AM · everyone with a meeting tomorrow · up to 25");
  assert.equal(
    C.scheduleLine({ ...p, trigger: "visited" }, "visit"),
    "Daily 10:00 AM · everyone who visited yesterday · up to 25",
  );
  assert.equal(C.poolWords("visit_tomorrow", "appointment"), "with an appointment tomorrow");
  assert.equal(C.poolWords("visited", "lesson"), "who had a lesson yesterday");
  assert.equal(C.poolWords("proposal_waiting", "lesson"), "with a proposal waiting");
});

/* ------------------------------------------- one page, one word ------------------------------------------- */

const ZONE = "America/New_York";
/** Friday 2 Oct 2026, 9:44 PM in New York. */
const NOW = Date.parse("2026-10-03T01:44:00Z");

/** Every string in a value, at any depth: what a view model says. The words' builders are functions, not strings. */
function stringsOf(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) stringsOf(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) stringsOf(v, out);
  return out;
}
/** A word's forms as a sentence writes them: the noun, its plural, and visit's verb. */
const formsOf = (w) => new RegExp(`\\b${w}(s|ed)?\\b`, "i");
/** A moment's id is no word (`visited` keeps it, D46): a view model carries it in a stage's `moment` and a Turn on's. */
const MOMENT_IDS = new Set(C.PLAYBOOK_TRIGGERS.map((t) => t.id));

/** Campaigns made on every moment, named in no word, so whatever the page says of an appointment is its own sentence. */
const card = (id, name, trigger, over = {}) => ({
  id,
  name,
  trigger,
  state: "running",
  run_hour: 10,
  cadence_days: 30,
  cap_per_run: 25,
  last_run_for: "2026-09-14",
  next: "tomorrow 10:00 AM",
  triggerLabel: name,
  candidates: 2,
  held: 1,
  named: { pool: 4, saidYes: 2 },
  off: null,
  totals: { waiting: null },
  ...over,
});
const MADE = [
  card("pb-b", "Reminder", "visit_tomorrow", { totals: { waiting: { id: "r-1", recipient_count: 3 } } }),
  card("pb-a", "Check-in", "visited", { state: "paused", next: "paused" }),
  card("pb-q", "Come back", "quiet_30"),
  card("pb-f", "Follow-up", "proposal_waiting"),
];
const homeFor = (shape, word, rows) => {
  const pools = Object.fromEntries(
    ["new_week", "visit_tomorrow", "visited", "quiet_30", "lapsed", "proposal_waiting"].map((k) => [
      k,
      { candidates: 3, held: 0, pool: 4, saidYes: 3 },
    ]),
  );
  const triggers = C.MOMENT_TRIGGERS.filter((t) => C.triggerOffered(t, shape.dealsOn)).map((t) => ({
    id: t.id,
    offered: C.momentOffered(t, shape),
    candidates: 3,
    named: null,
  }));
  return C.campaignsHomeOf({
    nowMs: NOW,
    tz: ZONE,
    playbooks: { rows, pools, triggers, timezone: ZONE, countsRead: true },
    broadcasts: {
      rows: [
        {
          id: "r-1",
          name: "Reminder · Oct 2",
          state: "pending_approval",
          when: "tomorrow 10:00 AM",
          scheduled_for: "2026-10-03T14:00:00Z",
          started_at: null,
          finished_at: null,
          recipient_count: 3,
          playbook_id: "pb-b",
          counts: { sent: 0, replied: 0 },
          // Made for the business's day (2 Oct in New York), so the row offers Approve, as a live run's does.
          run_for: "2026-10-02",
        },
      ],
      number: { present: true },
      optIn: { phrase: "YES OFFERS", link: null },
      reach: { people: 29, canHear: 7, saidMessages: 7, saidOffers: 4 },
    },
    library: [],
    messages: [],
    reachOuts: [],
    report: { days: 30, totals: { sent: 0, delivered: 0, read: 0, replied: 0, optIns: 0, optOuts: 0 }, sources: [] },
    shape: { calendar: shape.calendarOn ? "feed" : "none", dealsOn: shape.dealsOn, word },
    chains: undefined,
  });
};
/** What the drawer, a card, the composer's moments, the win-back's refusals and the approval sheet say in a word. */
const sentencesOf = (word) => {
  const W = C.appointmentWords(word);
  const clock = { run_hour: 10, cap_per_run: 25, gap_days: 90, cadence_days: 30 };
  const approval = (trigger) =>
    C.toApprovalVM(
      {
        broadcast: { recipient_count: 3, playbook_id: "pb-b", run_for: "2026-10-03", params: [{ kind: "first_name" }] },
        recipients: [{ contact_id: "c1", name: "Priya Nair", first_name: "Priya", state: "queued" }],
      },
      {
        playbook: { trigger, ...clock, word },
        businessName: "Harbor",
        today: "2026-10-02",
        open: { time: "10:00", moved: false, on: "2026-10-03" },
        day: (d) => d,
        paused: false,
      },
    );
  return [
    ...stringsOf(W),
    W.offTomorrow(1),
    W.offTomorrow(3),
    W.offYesterday(2),
    ...["visit_tomorrow", "visited"].flatMap((t) => [
      C.scheduleLine({ ...clock, trigger: t }, word),
      C.poolWords(t, word),
    ]),
    ...C.PLAYBOOK_TRIGGERS.flatMap((t) => Object.values(C.triggerWords(t, word))),
    ...Object.values(C.winBackWords(word)),
    ...["visit_tomorrow", "visited"].flatMap((t) => stringsOf(approval(t))),
  ];
};

test("one page, one word: for 4 shapes × 5 words, every string Campaigns' view models say holds its word and no other", () => {
  for (const shape of SHAPES)
    for (const word of C.APPOINTMENT_WORDS) {
      const said = [
        ...stringsOf(homeFor(shape, word, MADE)),
        ...stringsOf(homeFor(shape, word, [])),
        ...sentencesOf(word),
      ].filter((s) => !MOMENT_IDS.has(s));
      assert.ok(
        said.some((s) => formsOf(word).test(s)),
        `${JSON.stringify(shape)}: ${word} is said`,
      );
      for (const other of C.APPOINTMENT_WORDS.filter((w) => w !== word)) {
        const bad = said.filter((s) => formsOf(other).test(s));
        assert.deepEqual(bad, [], `${JSON.stringify(shape)}, ${word}: says ${other}`);
      }
    }
});

/* ------------------------------------- the words not yet the word's ------------------------------------- */

/** A quoted string a reader reads: its content is the second group. */
const QUOTED = /(["'`])((?:\\.|(?!\1).)*)\1/g;
const VISIT_WORD = /\bvisit(?:s|ed)?\b/i;
/** A class name is no word: `className="cl-prof-section cl-prof-visits"` names a style, and nobody reads it. */
const CLASS_NAME = /\bclassName=(["'])(?:(?!\1).)*\1/g;

/** A template's own text, and the code of each `${…}` in it, found by its braces (a `{ timeZone }` inside one is its own). */
function templateParts(content) {
  let text = "";
  const code = [];
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] !== "$" || content[i + 1] !== "{") {
      text += content[i];
      continue;
    }
    let depth = 1;
    let j = i + 2;
    for (; j < content.length && depth > 0; j += 1) {
      if (content[j] === "{") depth += 1;
      else if (content[j] === "}") depth -= 1;
    }
    code.push(content.slice(i + 2, j - 1));
    i = j - 1;
  }
  return { text, code };
}

/**
 * The words a quoted string says "visit" in: its own text, where it holds a space, and each string quoted inside its
 * `${…}`s. The code there is no word: `${visitStartTime(visit, tz)}` names a variable, and a reader never reads it.
 */
function visitWordsIn(content) {
  const { text, code } = templateParts(content);
  let n = /\s/.test(text) && VISIT_WORD.test(text) ? 1 : 0;
  for (const c of code) for (const m of c.matchAll(QUOTED)) n += visitWordsIn(m[2]);
  return n;
}

/** The words a line says "visit" in: each quoted string a reader reads on it, its class names left out. */
function visitWordsOnLine(text) {
  return [...text.replace(CLASS_NAME, "").matchAll(QUOTED)].reduce((n, m) => n + visitWordsIn(m[2]), 0);
}

/**
 * Per file in the reader scope, the quoted strings a reader reads that hold a space and the whole word visit (ids like
 * "visit_tomorrow" hold neither), comments, member accesses and `trade-word:` lines left out (readerLines). It may only
 * fall: each sweep banks its file, and when it reaches zero "visit" joins trade-neutral's banned words.
 */
function appointmentWordsWrittenIn() {
  const out = {};
  for (const file of readerFiles()) {
    let n = 0;
    for (const { text } of readerLines(readFileSync(file, "utf8"))) n += visitWordsOnLine(text);
    if (n > 0) out[relative(ROOT, file).split(sep).join("/")] = n;
  }
  return out;
}

test("the count reads what a reader reads: a sentence's word, not an id, a variable in a template's code, or a marked line", () => {
  const count = (src) => readerLines(src).reduce((n, { text }) => n + visitWordsOnLine(text), 0);
  assert.equal(count(`const a = "Visit reminder";`), 1);
  assert.equal(
    count(`const a = "visit_tomorrow"; const b = "visit"; const c = p.visit;`),
    0,
    "ids and a member are no words",
  );
  assert.equal(
    count("const a = `${visitDayWord(visit, tz)} at ${visitStartTime(visit, tz)}`;"),
    0,
    "a template's code",
  );
  assert.equal(count("const a = `Last visit · ${p}`;"), 1);
  assert.equal(
    count('const a = `${ahead ? "Next visit ahead" : "None"} · ${x}`;'),
    1,
    "a sentence quoted inside its code",
  );
  assert.equal(count(`const a = "a visit"; // trade-word: the word's own forms`), 0, "a marked line");
  assert.equal(count(`// "about your visit" in a comment`), 0);
  assert.equal(count(`const a = <i className="cl-a cl-visits" title="Next visit" />;`), 1, "a class name is none");
});

ratchet({
  name: "appointment words written in",
  file: "appointment-words.json",
  measure: appointmentWordsWrittenIn,
  advice:
    'A sentence a person reads says the workspace\'s appointment word (contracts appointmentWords), or none: never "visit" written in.',
});
