/**
 * The day on Today: today and tomorrow from the calendar the receptionist
 * reads and the visit playbooks' line, capped at the rows the card draws —
 * computed in contracts from the surfaces the page already holds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  todayDay,
  TODAY_DAY_MAX,
  toTodayVM,
  todayPeriodLine,
  todayRunWords,
  todayRunsSub,
  todayRunApproved,
  todayLeaks,
  todayAwayGrouped,
  todaySteps,
  withReplies,
  NOTIFICATION_KIND_GROUPS,
} from "@chanlytics/contracts";
import { readCode, readRaw } from "../_source.mjs";
import { installLegacyReact, fresh, all, byTestId, textOf } from "../_legacy-react.mjs";

// The pages the wiring test draws are the TSX surface's (apps/dashboard/src/surfaces/today, decision 0015), on the stub React.
installLegacyReact({ __DEMO_MODE: false, __surfaceState: () => "live" });
const { TODAY_HELPERS, installToday } = await import("../../../../apps/dashboard/src/surfaces/today/helpers.ts");
const { HeroBrief } = await import("../../../../apps/dashboard/src/surfaces/today/pages/brief.tsx");
const { TodayCard } = await import("../../../../apps/dashboard/src/surfaces/today/pages/card.tsx");
const { TodayDay } = await import("../../../../apps/dashboard/src/surfaces/today/pages/day.tsx");
const { DashboardA } = await import("../../../../apps/dashboard/src/surfaces/today/pages/today-page.tsx");
const { setSurfaceValue } = await import("../../../../apps/dashboard/src/surfaces/surface-values.ts");

const person = (id, name) => ({ id, name, via: "phone" });
const block = (id, t, time, title, p = null) => ({
  id,
  t,
  dur: 60,
  time,
  title,
  person: p,
  description: null,
  location: null,
  contacts: { phones: [], e164: [], emails: [] },
  guess: null,
  start: "",
  end: "",
});
const day = (key, over = {}) => ({
  key,
  dow: "Sun",
  date: "Sep 6",
  long: "Sunday, September 6",
  dayNum: "6",
  today: false,
  past: false,
  closed: { yes: false, note: null },
  bands: [],
  blocks: [],
  allDay: [],
  windows: [],
  ...over,
});
const cal = (days, over = {}) => ({
  timezone: "America/New_York",
  from: "2026-09-06",
  to: "2026-11-07",
  rangeLabel: "",
  monthLabel: "",
  hours: { start: 8, end: 20 },
  days,
  today: "2026-09-06",
  now: 10,
  feed: { present: true, state: "ok", line: "", events: 3, source: "Google Calendar" },
  stats: { events: 3, windows: 2, next: "Mon 9:30 AM" },
  rules: "",
  hoursLines: [],
  closuresAhead: [],
  services: [],
  bookingLink: null,
  ...over,
});

test("today and tomorrow, as the calendar reads them: items in time order with their person, the open windows, closed days said plainly", () => {
  const days = [
    day("2026-09-05", { past: true, long: "Saturday, September 5", blocks: [block("b0", 10, "10 – 11 AM", "Trim")] }),
    day("2026-09-06", {
      today: true,
      blocks: [
        block("b2", 14, "2 – 3 PM", "Balayage", person("c1", "Daniela R.")),
        block("b1", 10, "10 – 11 AM", "Gloss"),
      ],
      allDay: [block("a1", 0, "", "Stock count")],
      windows: [
        { t: 11, dur: 120, label: "11 AM – 1 PM" },
        { t: 15, dur: 60, label: "3 – 4 PM" },
      ],
    }),
    day("2026-09-07", {
      long: "Monday, September 7",
      closed: { yes: true, note: "Labor Day" },
      windows: [{ t: 9, dur: 60, label: "9 – 10 AM" }],
    }),
    day("2026-09-08", { long: "Tuesday, September 8", blocks: [block("b3", 9, "9 – 10 AM", "Cut")] }),
  ];
  const vm = todayDay(
    cal(days),
    [
      { trigger: "visit_tomorrow", state: "running", run_hour: 10, candidates: 2, next: "today 10:00" },
      { trigger: "quiet_30", state: "running", run_hour: 10, candidates: 5, next: "today 10:00" },
    ],
    { rows: [{ id: "c1", state: "needs_you" }] },
  );
  assert.equal(vm.feed, "ok");
  assert.deepEqual(
    vm.frames.map((f) => f.key),
    ["2026-09-06", "2026-09-07"],
    "today and tomorrow, never yesterday",
  );
  const today = vm.frames[0];
  assert.equal(today.label, "Today · Sunday, September 6");
  assert.deepEqual(
    today.items.map((i) => [i.time, i.title, i.person ? i.person.name : null, i.allDay]),
    [
      ["", "Stock count", null, true],
      ["10 – 11 AM", "Gloss", null, false],
      ["2 – 3 PM", "Balayage", "Daniela R.", false],
    ],
    "all-day first, then by the clock",
  );
  assert.deepEqual(today.open, ["11 AM – 1 PM", "3 – 4 PM"]);
  // The schedule's own words: the start in a column, the length, the place against the clock (now is 10), the person's open thread.
  assert.deepEqual(
    today.items.map((i) => [i.start, i.dur, i.phase, i.flag]),
    [
      ["All day", "", "later", null],
      ["10 AM", "1h", "now", null],
      ["2 PM", "1h", "next", "Needs you — in Inbox"],
    ],
  );
  assert.deepEqual(today.summary, { booked: "3 booked", flagged: "1 needs you" });
  const later = todayDay(
    cal([
      day("2026-09-06", {
        today: true,
        blocks: [block("b1", 8, "8 – 9 AM", "Trim"), block("b2", 9, "9 – 10 AM", "Cut")],
      }),
      day("2026-09-07", { blocks: [block("b3", 9, "9 – 10 AM", "Cut", person("c9", "Ana"))] }),
    ]),
    [],
    null,
  );
  assert.deepEqual(
    later.frames[0].items.map((i) => i.phase),
    ["past", "past"],
    "over by ten",
  );
  assert.deepEqual(
    [later.frames[1].items[0].phase, later.frames[1].items[0].flag, later.frames[1].summary],
    ["later", null, { booked: "1 booked", flagged: null }],
    "tomorrow has no clock and no rows to flag from",
  );
  const tomorrow = vm.frames[1];
  assert.equal(tomorrow.label, "Tomorrow · Monday, September 7");
  assert.equal(tomorrow.summary, null);
  assert.deepEqual(
    tomorrow.items.map((i) => i.phase),
    [],
    "tomorrow is closed with nothing on it",
  );
  assert.deepEqual(
    [tomorrow.closed, tomorrow.open, tomorrow.items],
    [{ yes: true, note: "Labor Day" }, [], []],
    "a closed day offers no windows",
  );
  assert.equal(vm.nextOpening, "Mon 9:30 AM");
  assert.deepEqual(
    vm.reminders,
    { text: "Visit reminder: 2 people · next run today 10:00", to: "outbound" },
    "only the visit playbooks speak here",
  );
});

test("without a feed the day says nothing; with one and no visit playbook it offers to start one; a dash is no next open time", () => {
  assert.deepEqual(todayDay(null, null), { feed: "none", frames: [], nextOpening: null, reminders: null });
  const off = todayDay(
    cal([day("2026-09-06", { today: true })], {
      feed: { present: true, state: "unavailable", line: "", events: 0, source: "x" },
    }),
    [],
  );
  assert.equal(off.feed, "unavailable");
  assert.equal(off.reminders, null);
  const on = todayDay(cal([day("2026-09-06", { today: true })], { stats: { events: 0, windows: 0, next: "—" } }), []);
  assert.equal(on.nextOpening, null);
  assert.match(on.reminders.text, /^No visit reminders yet/);
  assert.equal(on.reminders.to, "outbound");
  const paused = todayDay(cal([day("2026-09-06", { today: true })]), [
    { trigger: "visited", state: "paused", run_hour: 18, candidates: 1, next: "paused" },
  ]);
  assert.match(paused.reminders.text, /^No visit reminders yet/, "a paused playbook is not a reminder going out");
});

test("five rows on Today, the rest a line to the Calendar: what is over goes first, what is coming stays", () => {
  const blocks = [8, 9, 10, 11, 13, 14, 16, 18].map((h) => block(`b${h}`, h, `${h}:00`, `Slot ${h}`));
  const vm = todayDay(cal([day("2026-09-06", { today: true, blocks })]), [], null);
  const [today] = vm.frames;
  assert.equal(TODAY_DAY_MAX, 5);
  assert.deepEqual(
    today.items.map((i) => i.title),
    ["Slot 10", "Slot 11", "Slot 13", "Slot 14", "Slot 16"],
    "at ten: what is on now and the four coming; the two over and the last of the evening are the three cut",
  );
  const noon = todayDay(cal([day("2026-09-06", { today: true, blocks })], { now: 12 }), [], null).frames[0];
  assert.deepEqual(
    noon.items.map((i) => i.title),
    ["Slot 11", "Slot 13", "Slot 14", "Slot 16", "Slot 18"],
    "at noon: the four coming, then the most recent of what is over, back in the day's order",
  );
  assert.equal(today.more, 3);
  assert.equal(today.moreLine, "3 more on the Calendar");
  assert.equal(today.summary.booked, "8 booked", "the summary counts the day, not the rows drawn");
  const few = todayDay(cal([day("2026-09-06", { today: true, blocks: blocks.slice(0, 3) })]), [], null).frames[0];
  assert.deepEqual([few.more, few.moreLine], [0, null]);
});

// The day the hero and the card draw: traffic, so the card has its four figures.
const NOW = new Date("2026-09-06T14:00:00Z");
const busyMetrics = () => ({
  workspace: { name: "Marisa's Beauty Salon", timezone: "America/New_York", status: "active" },
  channels: [{ kind: "whatsapp", status: "active", number: "+1 305" }],
  window: {
    days: 1,
    since: "2026-09-06T04:00:00Z",
    since_local: "2026-09-06T00:00:00",
    now_local: "2026-09-06T10:00:00",
  },
  now: {
    escalations_open: 0,
    oldest_open_escalation_at: null,
    threads_needing_human: 0,
    threads_snoozed: 0,
    threads_awaiting_reply: 0,
    last_inbound_at: "2026-09-06T13:00:00Z",
    last_outbound_at: "2026-09-06T13:01:00Z",
  },
  period: {
    messages_in: 9,
    messages_out_ai: 11,
    messages_out_you: 0,
    conversations_active: 6,
    answered_by_ai: 7,
    answered_by_you: 0,
    unanswered_in_window: 1,
    median_reply_seconds_ai: 34,
    send_failures: 0,
    escalations_new: 0,
    escalation_reasons: {},
    calls: 3,
    call_seconds: 412,
    call_sentiments: { Positive: 2, Neutral: 1 },
    calls_voicemail: 1,
    new_contacts: 2,
  },
});
const draw = (Comp) => {
  fresh();
  return globalThis.React.createElement(Comp, {});
};

test("the wiring: the bridge publishes the helpers, the page composes the module, the hero adds the facts and drops its one-line calendar, the core shows both", () => {
  // The helpers (surfaces/today/helpers.ts), as contracts' own functions and in this order; installed, not re-listed.
  assert.deepEqual(
    Object.keys(TODAY_HELPERS),
    [
      "day",
      "periodLine",
      "runs",
      "runsSub",
      "runApproved",
      "leaks",
      "awayGrouped",
      "steps",
      "withReplies",
      "notificationKinds",
    ],
    "the helpers, in order",
  );
  // (The dashboard resolves contracts through its own path mapping, so a function is its own by name and by what it says.)
  for (const [key, own] of Object.entries({
    day: todayDay,
    periodLine: todayPeriodLine,
    runs: todayRunWords,
    runsSub: todayRunsSub,
    runApproved: todayRunApproved,
    leaks: todayLeaks,
    awayGrouped: todayAwayGrouped,
    steps: todaySteps,
  }))
    assert.equal(TODAY_HELPERS[key].name, own.name, `${key} is contracts' ${own.name}`);
  assert.deepEqual(
    TODAY_HELPERS.notificationKinds,
    NOTIFICATION_KIND_GROUPS,
    "and the notification kinds are contracts'",
  );
  assert.deepEqual(TODAY_HELPERS.day(null, null), todayDay(null, null));
  assert.deepEqual(TODAY_HELPERS.runsSub(2), todayRunsSub(2));
  assert.deepEqual(
    TODAY_HELPERS.runApproved("Win-back", 3, "sending now"),
    todayRunApproved("Win-back", 3, "sending now"),
  );
  // The queue's replies are read where the Inbox's surface publishes them (`window.__REPLIES`): none when unread.
  const handoff = {
    id: "h1",
    kind: "handoff",
    conversationId: "cv1",
    callId: null,
    who: "Brightwater & Co.",
    initials: "BC",
    channel: "Email",
    when: "waited 2h",
    sentence: "They wrote back to your reach-out. Nothing is sent without you.",
    quoted: false,
    status: ["Escalated", "Needs review", "since 2:04 PM"],
    tone: "escalated",
    warn: false,
    cta: { label: "Open and reply", to: "inbox/th-cv1" },
    also: { label: "Snooze", verb: "snooze", conversationId: "cv1", escalationId: "e-h1" },
    waitedMs: 7_200_000,
  };
  const reading = {
    message_id: "m1",
    conversation_id: "cv1",
    read_at: "2026-09-06T13:00:00.000Z",
    intent: "interested",
    claim: "person",
    summary: "Wants more details",
    unread: null,
    undone: false,
    draft: "Thank you for writing.",
    draft_state: "written",
  };
  delete globalThis.__REPLIES;
  assert.deepEqual(TODAY_HELPERS.withReplies([handoff]), [handoff], "no readings read, no row changed");
  globalThis.__REPLIES = { replies: [reading] };
  assert.deepEqual(TODAY_HELPERS.withReplies([handoff]), withReplies([handoff], [reading]));
  assert.equal(TODAY_HELPERS.withReplies([handoff])[0].kind, "reply", "the reading is the surface's, read when asked");
  delete globalThis.__REPLIES;
  delete globalThis.__today;
  installToday();
  assert.equal(globalThis.__today, TODAY_HELPERS, "installed, not re-listed");
  delete globalThis.__today;
  const app = readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx");
  assert.ok(
    app.includes('import { installToday } from "@/surfaces/today/helpers";') && app.includes("installToday();"),
  );
  const dayModule = readCode("apps/dashboard/src/surfaces/today/pages/day.tsx");
  for (const s of [
    'data-testid="today-day"',
    'if (C.vm.feed.state === "unavailable") {',
    'if (C.vm.feed.state !== "ok") return stepsOnly;',
    'data-testid="today-day-frame"',
    'testid="today-day-item"',
    'nav(b.person ? `clients/${b.person.id}` : "calendar")',
    'data-testid="today-day-reminders"',
    'present("AgendaItems", agendaItems<AgendaChildren>())',
    "<Items>",
    "phase={b.phase}",
    "flag={b.flag}",
    "b.person ? b.person.name : b.service",
    "service={b.person ? b.service : null}",
    'data-testid="today-day-more"',
    "d.moreLine",
  ])
    assert.ok(dayModule.includes(s), s);
  assert.match(
    dayModule,
    /TODAY_HELPERS\.day\(C\.vm[^,]*,\s*\(P \? P\.rows : null\)[^,]*,\s*people \|\| null\)/,
    "the page composes the module: the calendar, the playbooks' rows or none, People or none",
  );
  // The hero and the card over a busy day, with a calendar the receptionist reads (what the one-line calendar beat drew
  // from): the day's numbers are the card's figures, not a sentence or a strip of stat cards; no calendar line.
  setSurfaceValue("today", toTodayVM(busyMetrics(), [], [], [], NOW));
  globalThis.__CALENDAR = {
    vm: {
      timezone: "America/New_York",
      feed: { present: true, state: "ok", line: "", events: 3, source: "Google Calendar" },
      stats: { events: 3, windows: 2, next: "Mon 9:30 AM" },
      days: [],
    },
  };
  const hero = draw(HeroBrief);
  assert.equal(textOf(hero), "", "the hero says nothing while every line is up: no sentence of the day, no stat cards");
  const card = draw(TodayCard);
  assert.ok(byTestId(card, "today-figures"), "the day's numbers are the card's figures");
  for (const tree of [hero, card]) {
    assert.equal(byTestId(tree, "brief-calendar"), null, "the one-line calendar beat is the module now");
    const parts = all(tree, (n) => typeof n.type === "function").map((n) => n.type.name);
    assert.ok(!parts.includes("CalendarLine") && !parts.includes("DayFacts"), parts.join(", "));
  }
  assert.ok(!("dayLine" in TODAY_HELPERS), "no helper says the day's numbers as a sentence");
  // The core: the queue, then the day; and the day is the module this file imports (what the manifest's load order
  // held of the JSX pages is an import now).
  const core = draw(DashboardA);
  const drawn = all(core, (n) => typeof n.type === "function").map((n) => n.type);
  assert.ok(drawn.indexOf(TodayDay) > -1, "the core draws the day's module");
  assert.ok(
    drawn.map((t) => t.name).indexOf("AgentCommand") < drawn.indexOf(TodayDay),
    "the queue, then the day, in the core",
  );
  delete globalThis.__CALENDAR;
  setSurfaceValue("today", undefined);
  const css = readRaw("apps/dashboard/src/legacy/styles/dashboard-a-v2.css");
  assert.ok(
    css.includes(".td-day {") &&
      css.includes(".td-frame.today .td-frame-label") &&
      !dayModule.includes("cal-agenda") &&
      css.includes("@media (max-width: 1180px) {\n  .dash-a-v2-core, .dash-a-v2-foot { grid-template-columns: 1fr; }"),
  );
});
