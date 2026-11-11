/**
 * What New opens on (the canvas "New: start from what's ready", N1, N3, N10, N11): the starts a workspace can begin now,
 * the journey's moments, and what changed while the owner was away. Pure rules over what the page counted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NEW_READY_MAX,
  NEW_READY_WORDS as R,
  NEW_WORDS as W,
  journeyCovered,
  momentNeedsCalendar,
  newJourneyOf,
  readyStartsOf,
  newSinceWords,
} from "@chanlytics/contracts";

const moment = (id, kind, candidates, over = {}) => ({
  id,
  label: `${id} label`,
  hint: `${id} hint`,
  kind,
  offered: true,
  candidates,
  ...over,
});
const MOMENTS = [
  moment("quiet_30", "list", 0, { offered: false }),
  moment("everyone_monthly", "cadence", 186),
  moment("visit_tomorrow", "visit", 6),
  moment("visited", "visit", 6),
  moment("lapsed", "list", 41),
  moment("saved_list", "saved", null),
  moment("proposal_waiting", "deal", 0),
  moment("slot_opened", "freed", null),
  moment("visit_soon", "occasion", null),
  moment("visit_missed", "occasion", null),
  moment("asked_no_booking", "occasion", 2),
];
const reads = (over = {}) => ({
  moments: MOMENTS,
  lists: [],
  everyone: null,
  sources: [],
  running: [],
  calendarOn: true,
  hasDeals: false,
  word: "appointment",
  ...over,
});
const on = (trigger, over = {}) => ({
  id: `seq-${trigger}`,
  name: `${trigger} sequence`,
  state: "on",
  starts: "moment",
  first: { trigger, list_id: null, list_key: null, source_search_id: null },
  ...over,
});
const ids = (starts) => starts.map((s) => s.id);

test("most people waiting first, and a moment nobody waits in is still offered", () => {
  assert.deepEqual(ids(readyStartsOf(reads())), [
    "lapsed",
    "visit_tomorrow",
    "visited",
    "asked_no_booking",
    "visit_soon",
    "visit_missed",
    "slot_opened",
  ]);
  assert.equal(NEW_READY_MAX, 4);
});

test("a retired moment, the month's offer, a list's own trigger and a proposal with no deals are no start", () => {
  const got = ids(readyStartsOf(reads()));
  for (const id of ["quiet_30", "everyone_monthly", "saved_list", "proposal_waiting"]) assert.ok(!got.includes(id), id);
  assert.ok(ids(readyStartsOf(reads({ hasDeals: true }))).includes("proposal_waiting"));
});

test("without a calendar, what is read off it is left to One step away", () => {
  assert.deepEqual(ids(readyStartsOf(reads({ calendarOn: false }))), ["lapsed", "asked_no_booking"]);
  assert.equal(momentNeedsCalendar({ id: "visit_missed", kind: "occasion" }), true);
  assert.equal(momentNeedsCalendar({ id: "slot_opened", kind: "freed" }), true);
  assert.equal(momentNeedsCalendar({ id: "asked_no_booking", kind: "occasion" }), false);
});

test("a moment a sequence already starts on is not offered again; either win-back counts for both", () => {
  const got = ids(readyStartsOf(reads({ running: [on("visited"), on("quiet_30")] })));
  assert.ok(!got.includes("visited"));
  assert.ok(!got.includes("lapsed"));
  // One that ended stands on nothing.
  assert.ok(ids(readyStartsOf(reads({ running: [on("visited", { state: "ended" })] }))).includes("visited"));
});

test("who is waiting leads: a ready search and a list nothing sends to; an offer to everyone never stands over them", () => {
  const lists = [
    { id: "list:11111111-1111-4111-8111-111111111111", name: "Regulars", candidates: 18, builtin: false },
    { id: "seg:offers_ok", name: "Can hear offers", candidates: 186, builtin: true },
    { id: "list:22222222-2222-4222-8222-222222222222", name: "Empty", candidates: 0, builtin: false },
    { id: "list:33333333-3333-4333-8333-333333333333", name: "A smaller list", candidates: 5, builtin: false },
  ];
  const sources = [
    { id: "a", name: "Dentists near Portland", ready: 28 },
    { id: "b", name: "None checked", ready: 0 },
  ];
  const got = readyStartsOf(reads({ everyone: 186, lists, sources }));
  // Someone waiting, most people first; then the offer, though it reaches the most; then the moments nobody is in.
  assert.deepEqual(ids(got), [
    "lapsed",
    "search-a",
    lists[0].id,
    "visit_tomorrow",
    "visited",
    "asked_no_booking",
    "everyone",
    "visit_soon",
    "visit_missed",
    "slot_opened",
  ]);
  // One list is offered, the largest: a workspace with ten lists is not ten starts.
  assert.ok(!ids(got).includes(lists[3].id));
  // Where nobody waits anywhere, the offer is what reaches someone today, and it leads.
  const quiet = MOMENTS.map((m) => ({ ...m, candidates: 0 }));
  assert.equal(ids(readyStartsOf(reads({ everyone: 186, moments: quiet })))[0], "everyone");
  const everyone = got.find((s) => s.id === "everyone");
  assert.equal(everyone.kind, "once");
  assert.deepEqual(everyone.fixed.who, { kind: "everyone", label: W.draft.everyoneOffers });
  const search = got.find((s) => s.id === "search-a");
  assert.deepEqual(search.fixed, {
    kind: "sequence",
    audience: "leads",
    who: { kind: "search", id: "a", label: "Dentists near Portland" },
  });
  const list = got.find((s) => s.id.startsWith("list:1"));
  assert.equal(list.title, R.list("Regulars"));
  assert.equal(list.said, R.listSaid(18));
  assert.deepEqual(list.fixed.who, { kind: "list", token: lists[0].id, label: "Regulars" });
  // A list a sequence already starts on, and a search one already adds from, are said by their own sequences.
  const running = [
    on(null, { starts: "list", first: { trigger: "saved_list", list_id: lists[0].id.slice(5), list_key: null } }),
    on(null, {
      starts: "leads",
      first: { trigger: "lead_first", list_id: null, list_key: null, source_search_id: "a" },
    }),
  ];
  const left = ids(readyStartsOf(reads({ everyone: 186, lists, sources, running })));
  assert.ok(!left.includes(lists[0].id) && !left.includes("search-a"));
});

test("a start's words: today's where it has them, its hint where nobody waits, a count where one was read", () => {
  const got = readyStartsOf(reads());
  const by = (id) => got.find((s) => s.id === id);
  assert.equal(by("visited").title, W.starts.thank);
  assert.equal(by("visited").said, W.starts.thankSaid(6));
  assert.equal(by("lapsed").title, W.starts.winBack(41));
  assert.equal(by("lapsed").said, "lapsed hint");
  assert.equal(by("visit_soon").said, "visit_soon hint");
  assert.equal(by("asked_no_booking").said, R.reach(2));
  assert.equal(by("visit_tomorrow").line, "Remind each customer the day before their appointment");
  // What a viewer reads of each: the fact it is drawn from, never an act.
  assert.deepEqual(by("visited").fact, { title: W.viewer.thank(6), said: W.viewer.thankSaid });
  assert.deepEqual(by("lapsed").fact, { title: W.viewer.winBack(41), said: "lapsed hint" });
  assert.deepEqual(by("asked_no_booking").fact, { title: "asked_no_booking label", said: R.reach(2) });
  assert.deepEqual(by("visit_tomorrow").fixed.who, {
    kind: "moment",
    trigger: "visit_tomorrow",
    label: "visit_tomorrow label",
  });
});

test("the journey: each moment in the order a customer passes it, covered or open", () => {
  const journey = newJourneyOf(reads({ running: [on("visit_tomorrow"), on("visit_missed")] }));
  assert.deepEqual(
    journey.map((m) => m.id),
    ["asked_no_booking", "visit_tomorrow", "visit_soon", "visit_missed", "visited", "slot_opened", "lapsed"],
  );
  assert.equal(journeyCovered(journey), 2);
  const reminder = journey.find((m) => m.id === "visit_tomorrow");
  assert.deepEqual(reminder.on, { id: "seq-visit_tomorrow", name: "visit_tomorrow sequence" });
  assert.equal(reminder.start, null);
  const thank = journey.find((m) => m.id === "visited");
  assert.equal(thank.on, null);
  assert.equal(thank.start.fixed.who.trigger, "visited");
  // A proposal's moment is drawn where a deal was recorded, or a sequence stands on it.
  assert.ok(newJourneyOf(reads({ hasDeals: true })).some((m) => m.id === "proposal_waiting"));
  assert.ok(newJourneyOf(reads({ running: [on("proposal_waiting")] })).some((m) => m.id === "proposal_waiting"));
});

test("the journey without a calendar says what it needs, and offers no draft there", () => {
  const journey = newJourneyOf(reads({ calendarOn: false }));
  const reminder = journey.find((m) => m.id === "visit_tomorrow");
  assert.equal(reminder.needs, "calendar");
  assert.equal(reminder.start, null);
  assert.equal(journey.find((m) => m.id === "asked_no_booking").needs, null);
});

test("what changed while away: only what went from nothing to something", () => {
  const before = { everyone: 0, leads: 0, calendar: false };
  assert.deepEqual(newSinceWords(null, { everyone: 38, leads: 4, calendar: true }), []);
  assert.deepEqual(newSinceWords(before, before), []);
  assert.deepEqual(newSinceWords(before, { everyone: 38, leads: 4, calendar: true }), [
    R.since.yes(38),
    R.since.leads(4),
    R.since.calendar,
  ]);
  assert.deepEqual(
    newSinceWords({ everyone: 30, leads: 2, calendar: true }, { everyone: 38, leads: 4, calendar: true }),
    [],
  );
  assert.equal(R.since.yes(1), "1 person said yes to messages");
  assert.equal(R.since.leads(1), "1 lead is ready");
});
