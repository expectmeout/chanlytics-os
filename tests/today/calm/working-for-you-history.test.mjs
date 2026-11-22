/**
 * Working for you, what the business's own history lets Today say (22 Nov 2026), EXECUTED: a milestone of AI's bookings,
 * said once in the week it is reached and never of a count long past it (W9); and the day's one word, "A light Monday",
 * only where each of the last four of its weekday held clearly more by this hour (W15). The server's six counts run over
 * a record in memory (server/metrics/history.ts), and the card and the head's sentence are drawn from what it answers.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { dayInZone, shiftKey } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { TENANT } from "../../_rows.mjs";
import { importSrc } from "../../_source.mjs";
import { byTestId, press, textOf } from "../../_stub-react.mjs";
import { until } from "../../shared/_until.mjs";
import { W, ZONE, answerWith, draw, json, redraw, wire } from "../zones/_world.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const { findTodayHistory } = await importSrc("apps/dashboard/src/server/metrics/history.ts");
const { dayAheadWords } = await import("../../../apps/dashboard/src/surfaces/today/model/lines.ts");
const { WeekLead, useWeekMoment } = await import("../../../apps/dashboard/src/surfaces/today/calm/week.tsx");
const { clearRowStates } = await import("../../../apps/dashboard/src/surfaces/today/need-you/row-state.ts");
const { setSurfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");

const forget = () => {
  for (const key of ["reports_headline", "ask_morning"]) setSurfaceValue(key, undefined);
  clearRowStates();
  wire.length = 0;
};
after(forget);

/** The morning's read as Today holds it, with the history it carries and what the member set aside. */
const morning = (history, rested = {}) =>
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
      history,
    },
  });

/** The card's moment as the page reads it: the last one a draw saw, and the tree it drew. */
const seen = [];
const Probe = () => {
  const moment = useWeekMoment();
  seen.push(moment);
  return moment ? W.React.createElement(WeekLead, moment) : null;
};
/** The moment a count of AI's bookings makes, with no week to say: a milestone, or nothing. */
function momentOf(total, lately) {
  forget();
  morning(total === null ? null : { booked_by_ai: { total, lately, days: 7 }, weekday_visits: [] });
  draw(Probe);
  return seen.at(-1);
}

test("a milestone (W9) is the highest count AI's bookings reached in the last days, and a count long past one says nothing", () => {
  assert.equal(momentOf(101, 3)?.id, "milestone:100", "the 100th was booked this week");
  assert.equal(momentOf(100, 1)?.id, "milestone:100", "the 100th itself");
  assert.equal(momentOf(104, 3), null, "101 a week ago: the 100th is old news");
  assert.equal(momentOf(437, 12), null, "a business long past its milestones is told none");
  assert.equal(momentOf(60, 55)?.id, "milestone:50", "two reached in one week: the higher is said");
  assert.equal(momentOf(9, 9), null, "under the first one");
  assert.equal(momentOf(null, 0), null, "a count that could not be read says nothing");
  // A thousand reads with its comma; where every booking is from these days, the sentence has said it all.
  assert.equal(momentOf(1003, 9).sentence, "AI’s 1,000th booking for you.");
  assert.equal(momentOf(10, 10).sub, null);
  // What Got it says back is the count the next one is said at; past the last there is none to name.
  assert.equal(momentOf(101, 3).kept, "Next is AI’s 250th booking");
  assert.equal(momentOf(10_000, 1).kept, "Put away");
  forget();
});

// 11:00 in New York on Monday 21 September 2026. A day there begins at 04:00 UTC.
const NOW = Date.parse("2026-09-21T15:00:00Z");
const TZ = "America/New_York";
let made = 0;

/** A visit on the record: when it is, when it was put on the book, and whose doing. */
const visit = (startsAt, createdAt, over = {}) => ({
  id: `v-${++made}`,
  tenant_id: TENANT,
  source: "calendar_feed",
  status: "booked",
  starts_at: startsAt,
  ends_at: new Date(Date.parse(startsAt) + 3_600_000).toISOString(),
  all_day: false,
  vanished_at: null,
  created_at: createdAt,
  ...over,
});
const byAi = (createdAt, over = {}) => visit("2026-10-02T15:00:00Z", createdAt, { source: "receptionist", ...over });
const times = (n, row) => Array.from({ length: n }, row);

test("the server counts AI's bookings and the last four of the weekday as each stood at this hour, and nothing it should not", async () => {
  const record = [
    // AI's: 98 booked long ago, 3 in the last seven days; one of those days cancelled, one still only proposed, one of
    // another workspace's, and one the owner's calendar made.
    ...times(98, () => byAi("2026-06-01T15:00:00Z")),
    ...times(3, () => byAi("2026-09-19T15:00:00Z")),
    byAi("2026-09-19T16:00:00Z", { status: "cancelled" }),
    byAi("2026-09-19T16:00:00Z", { status: "proposed" }),
    byAi("2026-09-19T16:00:00Z", { tenant_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }),
    visit("2026-10-02T15:00:00Z", "2026-09-19T16:00:00Z"),
    // Monday 14 September: three on the book by 11:00 that day; one booked that afternoon, one all day, one gone from
    // the calendar and one cancelled are none of them.
    ...times(3, () => visit("2026-09-14T18:00:00Z", "2026-09-10T12:00:00Z")),
    visit("2026-09-14T21:00:00Z", "2026-09-14T17:00:00Z"),
    visit("2026-09-14T04:00:00Z", "2026-09-10T12:00:00Z", { all_day: true }),
    visit("2026-09-14T18:00:00Z", "2026-09-10T12:00:00Z", { vanished_at: "2026-09-12T12:00:00Z" }),
    visit("2026-09-14T18:00:00Z", "2026-09-10T12:00:00Z", { status: "cancelled" }),
    // Monday 7: two, one of them since kept. Tuesday 8 is no Monday.
    visit("2026-09-07T18:00:00Z", "2026-09-01T12:00:00Z", { status: "kept" }),
    visit("2026-09-07T19:00:00Z", "2026-09-01T12:00:00Z"),
    visit("2026-09-08T18:00:00Z", "2026-09-01T12:00:00Z"),
    // Monday 31 August: one. Monday 24 August: none.
    visit("2026-08-31T18:00:00Z", "2026-08-20T12:00:00Z"),
  ];
  const history = await findTodayHistory(fakeDb({ appointments: record }), TENANT, { zone: TZ, nowMs: NOW });
  assert.deepEqual(history, { booked_by_ai: { total: 101, lately: 3, days: 7 }, weekday_visits: [3, 2, 1, 0] });
});

test("a history that cannot be read is none: no milestone and no word, never a zero said as a count", async () => {
  const away = {
    from: () => {
      throw new Error("the database is away");
    },
  };
  assert.equal(await findTodayHistory(away, TENANT, { zone: TZ, nowMs: NOW }), null);
});

test("the milestone holds the card ahead of the week, says how many are new, has no door, and Got it puts it away past the days it is news", async () => {
  forget();
  draw(Probe);
  assert.equal(seen.at(-1), null, "before the morning is read: nothing");
  morning({ booked_by_ai: { total: 101, lately: 3, days: 7 }, weekday_visits: [] });
  const tree = redraw(Probe);
  assert.equal(seen.at(-1).id, "milestone:100");
  assert.ok(byTestId(tree, "today-milestone"), "the milestone's own card");
  assert.ok(textOf(tree).includes("AI’s 100th booking for you."), textOf(tree));
  assert.ok(textOf(tree).includes("3 of them in the last 7 days."), textOf(tree));
  assert.equal(byTestId(tree, "today-week-reports"), null, "no page holds this count: no door");
  answerWith(() => json(200, { ok: true, data: {} }));
  press(byTestId(tree, "today-week-got-it"));
  await until(() => wire.some((w) => w.method === "PUT" && w.path === "/api/v1/views/ask_found"), "the rest saved");
  const kept = JSON.parse(wire.find((w) => w.method === "PUT").body).view.rested["milestone:100"];
  assert.equal(kept, shiftKey(dayInZone(ZONE, Date.now()).key, 8), "until a day past the seven it is news for");
  redraw(Probe);
  assert.equal(seen.at(-1), null, "and the card is gone");
  forget();
});

/** The day as the head reads it: today's visits, each by where it stands in the day. */
const dayOf = (...phases) => ({
  frames: [{ today: true, items: phases.map((phase, at) => ({ allDay: false, phase, start: `${10 + at} AM` })) }],
});

test("a light day (W15) is said only with four weeks of the weekday behind it, each with visits, and only of clearly fewer", () => {
  const usual = (before) => ({ before, weekday: "Monday" });
  const four = dayOf("next", "later", "later", "later");
  assert.equal(dayAheadWords(four, usual([7, 8, 6, 9])), "A light Monday: 4 booked, the first at 10 AM.");
  assert.equal(dayAheadWords(four), "4 booked today, the first at 10 AM.", "no history: the facts alone");
  assert.equal(
    dayAheadWords(dayOf("past", "now", "next", "later"), usual([7, 8, 6, 9])),
    "A light Monday: 2 more booked, the next at 12 AM.",
    "the day's own count is all of its visits, not only those ahead",
  );
  const five = dayOf("next", "later", "later", "later", "later");
  const plain = "5 booked today, the first at 10 AM.";
  assert.equal(dayAheadWords(five, usual([7, 8, 6, 9])), plain, "one fewer than the fewest is no light day");
  assert.equal(
    dayAheadWords(dayOf("next"), usual([7, 8, 0, 9])),
    "1 booked today, the first at 10 AM.",
    "a week with none",
  );
  assert.equal(dayAheadWords(dayOf("next"), usual([7, 8, 6])), "1 booked today, the first at 10 AM.", "three weeks");
  assert.equal(dayAheadWords(four, usual(null)), "4 booked today, the first at 10 AM.", "no history read: no word");
  assert.equal(dayAheadWords(dayOf("past"), usual([7, 8, 6, 9])), null, "nothing ahead: the head says what it said");
});
