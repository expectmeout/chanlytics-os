/**
 * Working for you, steps 4 and 5 (21 Nov 2026), EXECUTED: the evening by the business's own hours and never without them
 * (W5), what waits for morning in one line, tonight's sends; a day against a usual one only with four weeks behind it
 * (W8); the week's card, said once a week and kept until the next Monday (W9); Let AI do more only where every held draft
 * went as written (W10); the desk's keys listed in the one sheet and drawn nowhere on the page (W12); a visit said in the
 * workspace's own word (W14); and who holds the card once the day is over.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { SHORTCUTS, dayInZone, shiftKey, toCalendarVM, todayDay } from "@chanlytics/contracts";
import { byTestId, press, redrawWanted, textOf } from "../../_stub-react.mjs";
import { keysDrawn } from "../../_keys.mjs";
import { until } from "../../shared/_until.mjs";
import { W, ZONE, answerWith, draw, json, redraw, wire } from "../zones/_world.mjs";

const { usualDayWords } = await import("../../../apps/dashboard/src/surfaces/today/model/lines.ts");
const { arrangementOf } = await import("../../../apps/dashboard/src/surfaces/today/arrangement.ts");
const { useTodayEvening } = await import("../../../apps/dashboard/src/surfaces/today/zones/head.tsx");
const { MorningFold, TonightLine } = await import("../../../apps/dashboard/src/surfaces/today/calm/evening.tsx");
const { WeekLead, useWeekMoment, weekWords } = await import("../../../apps/dashboard/src/surfaces/today/calm/week.tsx");
const { LetAiDoMore, offerOf } = await import("../../../apps/dashboard/src/surfaces/today/calm/more.tsx");
const { TodayKeys } = await import("../../../apps/dashboard/src/surfaces/today/calm/keys.tsx");
const { typing } = await import("../../../apps/dashboard/src/surfaces/today/calm/held.tsx");
const { clearRowStates } = await import("../../../apps/dashboard/src/surfaces/today/need-you/row-state.ts");
const { setSurfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");

const SURFACES = ["calendar", "playbooks", "today", "broadcasts", "reports_headline", "ask_morning"];
const forget = () => {
  for (const key of SURFACES) setSurfaceValue(key, undefined);
  clearRowStates();
  wire.length = 0;
};
after(forget);

/** Tuesday 8 September 2026 in New York, at a time of the day (EDT is four hours behind UTC). */
const tue = (hh, mm = 0) => new Date(Date.UTC(2026, 8, 8, hh + 4, mm));
const iso = (d) => d.toISOString();
const OPEN = { open: "09:00", close: "18:00" };

/** The week as GET calendar answers it: one visit on Tuesday at ten, and one on Wednesday. `hours` as Settings keep them. */
function week(hours, who = { id: "p-noor", name: "Noor Haddad" }) {
  const from = "2026-09-07";
  const days = Array.from({ length: 7 }, (_, i) => ({ key: shiftKey(from, i), items: [], windows: [] }));
  const visit = (id, start, end, person) => ({ id, start, end, title: `${person.name} · Cut`, all_day: false, person });
  days[1].items.push(visit("e-1", iso(tue(10)), iso(tue(11)), who));
  days[2].items.push(visit("e-2", iso(tue(34)), iso(tue(35)), { id: "p-tove", name: "Tove Lind" }));
  return {
    timezone: ZONE,
    from,
    to: "2026-09-13",
    feed: { present: true, state: "ok", read_at: iso(tue(7)), events: 2, recurring_expanded: 0, skipped_recurring: 0 },
    hours,
    closures: [],
    rules: { lead_hours: 2, buffer_min: 0, max_days_ahead: 14 },
    booking_link: null,
    days,
  };
}
const EVERY_DAY = { mon: OPEN, tue: OPEN, wed: OPEN, thu: OPEN, fri: OPEN, sat: OPEN, sun: OPEN };
const playbooks = () => ({ rows: [], shape: { calendar: "feed", hasDeals: false, word: "visit" } });

/** Whether Today is in its evening, as a component reads it, with the board as it stands at `now`. */
function eveningAt(now, hours = EVERY_DAY) {
  setSurfaceValue("calendar", { vm: toCalendarVM(week(hours), now) });
  setSurfaceValue("playbooks", playbooks());
  const Probe = () => W.React.createElement("i", { "data-evening": String(useTodayEvening()) });
  return draw(Probe).rendered.props["data-evening"];
}

test("the evening (W5) is the business's own closing: after its hours, never before them, and never for a business that set none", () => {
  forget();
  assert.equal(eveningAt(tue(12)), "false", "midday: the day's page");
  assert.equal(eveningAt(tue(18, 30)), "true", "past six, its closing hour: the evening");
  // No hours in Settings: the day still turns to tomorrow after its last visit, and that is no evening anyone set.
  assert.equal(eveningAt(tue(20), {}), "false", "a business with no hours keeps the day's page");
  // A day the business is closed turns to tomorrow at once, whatever the hour: a closed morning is no evening.
  assert.equal(eveningAt(tue(9), { ...EVERY_DAY, tue: {} }), "false", "a closed day is no evening");
  forget();
});

const READS = {
  read: true,
  known: true,
  needYou: false,
  queueCoral: null,
  todoCoral: null,
  waiting: false,
  setupActs: false,
  found: { draws: false, acts: false },
  mayAct: true,
  focus: null,
  waitFirst: null,
  todoFirst: null,
  todoPressed: null,
  foundFirst: null,
  morning: null,
  week: null,
};
const MORNING = { toDo: 2, toDoDoor: "clients/steps", found: 3, setup: true };

test("once the day is over only who waits holds the card and the coral: a to-do, the week, setting up and what AI found wait for morning", () => {
  const rest = { todoFirst: "t1", todoCoral: "t1", setupActs: true, foundFirst: "f1", week: "week:2026-09-07" };
  const evening = arrangementOf({ ...READS, ...rest, found: { draws: true, acts: true }, morning: MORNING });
  assert.equal(evening.card, null, "nothing that can wait takes the card");
  assert.equal(evening.coral, null);
  assert.deepEqual(evening.morning, MORNING, "and what waits is handed to the page's one line");
  const someone = arrangementOf({ ...READS, ...rest, morning: MORNING, waiting: true, focus: "r1", queueCoral: "r1" });
  assert.deepEqual(someone.card, { holder: "queue", id: "r1" }, "a person waiting holds it, whatever the hour");
  assert.equal(someone.coral, "queue");
  // By day, while nobody waits, the week's card comes first, once: before a to-do, setting up and what AI found.
  const byDay = arrangementOf({ ...READS, ...rest });
  assert.deepEqual(byDay.card, { holder: "week", id: "week:2026-09-07" });
  assert.equal(byDay.coral, "week");
  // Got it pressed, the walk is what it was: the to-do, then setting up.
  assert.deepEqual(arrangementOf({ ...READS, ...rest, week: null }).card, { holder: "todo", id: "t1" });
  assert.equal(arrangementOf({ ...READS, ...rest, week: null }).coral, "todo");
  // A to-do the member pressed is theirs to finish, whatever the week has to say.
  assert.deepEqual(arrangementOf({ ...READS, ...rest, todoPressed: "t1" }).card, { holder: "todo", id: "t1" });
  assert.equal(
    arrangementOf({ ...READS, week: "week:2026-09-07", waiting: true, focus: "r1", queueCoral: "r1" }).card.holder,
    "queue",
    "never over someone who waits",
  );
});

test("what waits for morning is one line: it says what it holds, opens under itself, and its to-dos are a door", () => {
  forget();
  const fold = (morning) => () =>
    W.React.createElement(MorningFold, { morning }, W.React.createElement("p", { "data-testid": "kept" }, "Lines"));
  const Shut = fold(MORNING);
  let tree = draw(Shut);
  const line = () => byTestId(tree, "today-morning-line");
  assert.match(textOf(line()), /Waiting for morning/);
  assert.match(textOf(line()), /2 to do · 3 things AI found · setting up/);
  assert.equal(byTestId(tree, "today-morning-open"), null, "shut: a reader finds nothing under it");
  press(all1(tree, (n) => n.props?.role === "button" && n.props?.["aria-expanded"] === false));
  tree = redraw(Shut);
  assert.ok(byTestId(tree, "today-morning-open"), "open, under its own line");
  assert.match(textOf(byTestId(tree, "today-morning-todo-line")), /2 to do/);
  assert.ok(byTestId(tree, "kept"), "with the lines it folded");
  // Nothing counted waits: the lines stand as they would by day, and no line says it holds them.
  const none = draw(fold({ toDo: 0, toDoDoor: null, found: 0, setup: false }));
  assert.equal(byTestId(none, "today-morning-line"), null);
  assert.ok(byTestId(none, "kept"));
});

/** The first node of a drawn tree that `pred` holds for. */
function all1(tree, pred) {
  let hit = null;
  const visit = (n) => {
    if (hit || n == null || typeof n !== "object") return;
    if (Array.isArray(n)) return void n.forEach(visit);
    if (pred(n)) {
      hit = n;
      return;
    }
    visit(n.props?.children);
    visit(n.rendered);
  };
  visit(tree);
  assert.ok(hit, "the node is drawn");
  return hit;
}

test("tonight's line (W5) counts only what goes before the day is out, names the first, and says no key or promise it cannot keep", () => {
  forget();
  const now = Date.now();
  const today = dayInZone(ZONE, now).key;
  // Within the hour and still today on the business's clock; and the first hour that is tomorrow there.
  const soon = [60_000, 1_000].map((ms) => now + ms).find((ms) => dayInZone(ZONE, ms).key === today);
  const HOUR = 3_600_000;
  const tomorrow = Array.from({ length: 23 }, (_, h) => now + (h + 1) * HOUR).find(
    (ms) => dayInZone(ZONE, ms).key !== today,
  );
  const run = (id, atMs, people) => ({
    id,
    name: `Reminders ${id}`,
    state: "scheduled",
    scheduled_for: new Date(atMs).toISOString(),
    recipient_count: people,
    when: "soon",
  });
  setSurfaceValue("broadcasts", { rows: [run("b", tomorrow, 9)] });
  assert.equal(byTestId(draw(TonightLine), "today-tonight-line"), null, "tomorrow's run is not tonight's");
  if (soon === undefined) return; // the last second of the business's day: nothing more can go tonight
  setSurfaceValue("broadcasts", { rows: [run("b", tomorrow, 9), run("a", soon, 6)] });
  const line = byTestId(draw(TonightLine), "today-tonight-line");
  assert.match(textOf(line), /Tonight AI sends 6 messages/);
  assert.doesNotMatch(textOf(line), /Stop any one|and \d+ more/, "one run: its name and time, nothing more");
  forget();
});

test("a day against a usual one (W8) is said only with four weeks of that weekday behind it, each with something answered, and only of more", () => {
  const days = (today, before = [5, 4, 6, 3]) => {
    const list = Array.from({ length: 29 }, () => 2);
    before.forEach((n, k) => (list[28 - (k + 1) * 7] = n));
    list[28] = today;
    return list;
  };
  assert.equal(usualDayWords(days(9), "Tuesday"), "More than a usual Tuesday");
  assert.equal(usualDayWords(days(6), "Tuesday"), null, "as many as its busiest of the four is not more");
  assert.equal(usualDayWords(days(1), "Tuesday"), null, "a quieter day is never said");
  assert.equal(usualDayWords(days(9, [5, 4, 0, 3]), "Tuesday"), null, "a week with nothing is no history");
  assert.equal(usualDayWords(days(9).slice(1), "Tuesday"), null, "under four weeks of days: nothing");
});

const dayOf = (answered, calls = 0, booked = 0) => ({ messages: answered, answered, calls, newPeople: 0, booked });

test("the week's words (W9) are the seven days before today: what AI answered, the calls and bookings under it, and nothing it cannot back", () => {
  const seven = Array.from({ length: 7 }, () => dayOf(12, 2, 1));
  assert.deepEqual(weekWords([...seven, dayOf(99, 9, 9)]), {
    sentence: "In the last 7 days AI answered 84 messages.",
    sub: "14 calls · 7 booked",
  });
  assert.equal(weekWords(seven), null, "seven days and no today: not a week before today");
  assert.equal(weekWords([...Array.from({ length: 7 }, () => dayOf(0, 3, 1)), dayOf(5)]), null, "AI answered nothing");
  const uncounted = [...seven.map((d, at) => (at === 0 ? { ...d, booked: null } : d)), dayOf(1)];
  assert.equal(weekWords(uncounted).sub, "14 calls", "a day whose bookings were not counted: no number of them");
  assert.equal(weekWords([...Array.from({ length: 7 }, () => dayOf(1)), dayOf(1)]).sub, null);
});

const headline = () => ({ perDay: [...Array.from({ length: 7 }, () => dayOf(12, 2, 1)), dayOf(3)] });
const morning = (rested = {}) =>
  setSurfaceValue("ask_morning", {
    fetchedAt: Date.now(),
    dto: {
      day: dayInZone(ZONE, Date.now()).key,
      state: "none",
      offered: false,
      thread_id: null,
      message_id: null,
      headline: "",
      detail: "",
      cards: [],
      findings: [],
      rested,
      lately: [],
    },
  });

test("the week's card waits for what the member set aside, and Got it keeps it until the next Monday, never for good", async () => {
  forget();
  setSurfaceValue("reports_headline", headline());
  const seen = [];
  const Probe = () => {
    const week = useWeekMoment();
    seen.push(week);
    return week ? W.React.createElement(WeekLead, week) : null;
  };
  draw(Probe);
  assert.equal(seen.at(-1), null, "before the rests are read: no card that might show, then go");
  morning();
  const tree = redraw(Probe);
  const week = seen.at(-1);
  assert.match(week.id, /^week:\d{4}-\d\d-\d\d$/);
  assert.equal(new Date(`${week.id.slice(5)}T12:00:00Z`).getUTCDay(), 1, "the week is named by its Monday");
  answerWith(() => json(200, { ok: true, data: {} }));
  press(byTestId(tree, "today-week-got-it"));
  await until(() => wire.some((w) => w.method === "PUT" && w.path === "/api/v1/views/ask_found"), "the rest saved");
  const kept = JSON.parse(wire.find((w) => w.method === "PUT").body).view.rested[week.id];
  const until7 = (Date.parse(`${kept}T12:00:00Z`) - Date.parse(`${week.id.slice(5)}T12:00:00Z`)) / 86_400_000;
  assert.equal(until7, 7, `kept until the next Monday, not for good: ${kept}`);
  redraw(Probe);
  assert.equal(seen.at(-1), null, "and the card is gone for the week");
  // Kept already, as the next visit reads it.
  forget();
  setSurfaceValue("reports_headline", headline());
  morning({ [week.id]: kept });
  draw(Probe);
  assert.equal(seen.at(-1), null);
  forget();
});

const policies = (held, over = {}) => ({
  ok: true,
  data: {
    role: "owner",
    policies: [
      { class: "reply", mode: "ask" },
      { class: "faq", mode: "auto" },
      { class: "booking", mode: "ask" },
    ],
    held,
    ...over,
  },
});
const heldRow = (intent, held, sent, over = {}) => ({
  intent,
  held,
  sent,
  steered: 0,
  canceled: 0,
  person_first: 0,
  ...over,
});

const readOf = (answer) => answer.data;

test("Let AI do more (W10) is offered only where AI asks first and every held draft of the kind went as written; never to a viewer", async () => {
  const offer = (held, over) => offerOf(readOf(policies(held, over)));
  assert.deepEqual(offer([heldRow("other", 6, 6)]), {
    cls: "reply",
    label: "Replies to customers",
    sent: 6,
    from: "ask",
    to: "veto",
  });
  assert.equal(offer([heldRow("other", 6, 5, { steered: 1 })]), null, "one rewritten: no evidence it may send them");
  assert.equal(offer([heldRow("other", 6, 5, { canceled: 1 })]), null, "one stopped");
  assert.equal(offer([heldRow("other", 4, 4)]), null, "too few to say");
  assert.equal(offer([heldRow("other", 6, 6)], { role: "viewer" }), null, "a viewer changes no rule");
  assert.equal(offer(null), null, "the evidence unread: nothing is said");
  const sends = { policies: [{ class: "reply", mode: "auto" }] };
  assert.equal(offer([heldRow("other", 6, 6)], sends), null, "AI already sends them: nothing to offer");
  // And the line as the page draws it, once its read and the member's rests are in.
  forget();
  morning();
  answerWith((u) =>
    u.pathname === "/api/v1/policies"
      ? json(200, policies([heldRow("other", 6, 6)]))
      : json(200, { ok: true, data: {} }),
  );
  draw(LetAiDoMore);
  await until(redrawWanted, "the Autonomy rows read, and the offer made");
  const line = byTestId(redraw(LetAiDoMore), "today-more-line");
  assert.match(textOf(line), /Let AI do more with replies to customers\?/);
  assert.match(textOf(line), /You sent all 6 of its drafts as written in 30 days\./);
  forget();
});

test("the desk's keys (W12) are listed in the one sheet, under Today, and Today draws no key of its own", () => {
  const today = SHORTCUTS.filter((s) => s.group === "Today").map((s) => s.keys.join(" "));
  assert.deepEqual(today, ["J K", "↵", "E", "N", "/"]);
  const tree = draw(TodayKeys);
  assert.equal(tree.rendered, null, "it draws nothing");
  assert.deepEqual(keysDrawn(draw(() => W.React.createElement(MorningFold, { morning: MORNING }, null))), []);
  // A key with a modifier is the browser's or the frame's, never the page's.
  assert.equal(typing({ target: null, altKey: false, ctrlKey: true, metaKey: false }), true);
  assert.equal(typing({ target: null, altKey: false, ctrlKey: false, metaKey: false }), false);
  const field = { tagName: "TEXTAREA", isContentEditable: false };
  assert.equal(typing({ target: field, altKey: false, ctrlKey: false, metaKey: false }), true, "nor while typing");
});

test("a visit's fact says the workspace's own word for it (W14): which of theirs it is, or how long since the last", () => {
  const facts = (over) => ({
    state: "active",
    business: null,
    deal: null,
    step: null,
    last: { at: null, by: "No contact recorded" },
    phone: null,
    email: null,
    next_visit_at: null,
    ...over,
  });
  const factOf = (personFacts, word) => {
    const who = { id: "p-noor", name: "Noor Haddad", facts: facts(personFacts) };
    const cal = toCalendarVM(week(EVERY_DAY, who), tue(8));
    const day = todayDay(cal, { rows: [], word }, { rows: [], word }, Number.POSITIVE_INFINITY);
    return day.frames.find((f) => f.today).items[0].fact;
  };
  assert.equal(factOf({ last_visit_at: "2026-08-25T15:00:00.000Z", visit_number: 10 }, "session"), "10th session");
  assert.equal(
    factOf({ last_visit_at: "2026-05-05T15:00:00.000Z", visit_number: 10 }, "visit"),
    "First visit in 4 months",
  );
  assert.equal(factOf({ last_visit_at: "2026-08-25T15:00:00.000Z" }, "session"), "Last here Aug 25");
  assert.equal(factOf({ last_visit_at: null }, "session"), "First time here");
});
