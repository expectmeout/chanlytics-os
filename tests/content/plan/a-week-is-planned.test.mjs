/**
 * A week of posts, planned (the content loop PRD's 10.1, 10.2, 15.1): the reasons to post now read from what the business
 * has (open time on its book, a new review, fresh footage, an offer that runs, a service it says is new); the week picked
 * within the cadence and FEWER when the candidates are weak, saying why; what no clip can tell asked to be filmed, a
 * sentence and a length each, at most three; a slot a check refuses is blocked with its words; nothing is made, so the
 * week costs nothing to draft. Pure: packages/core content/plan and opportunities.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { openTimeByDay, opportunitiesFrom, planWeek } from "@chanlytics/core";
import { FOOTAGE_ASKS_MOST, weekSizeSaid, creativesOf, planWeekOf } from "@chanlytics/contracts";

const ZONE = "America/New_York";
// Sunday 22 November 2026, 7 PM in New York: the week to plan starts Monday the 23rd.
const NOW = Date.parse("2026-11-23T00:00:00Z");
const WEEK = "2026-11-23";
const HOURS = {
  mon: { open: "09:00", close: "17:00" },
  tue: { open: "09:00", close: "17:00" },
  wed: { open: "09:00", close: "17:00" },
  thu: { open: "09:00", close: "17:00" },
  fri: { open: "09:00", close: "17:00" },
  sat: { open: "10:00", close: "14:00" },
};
const at = (day, hh) => Date.parse(`${day}T${String(hh + 5).padStart(2, "0")}:00:00Z`);
// A full book but for Thursday: every weekday taken from open to close, Thursday free from noon.
const BUSY = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-27"].map((day) => ({
  start: at(day, 9),
  end: at(day, 17),
}));
BUSY.push(
  { start: at("2026-11-26", 9), end: at("2026-11-26", 12) },
  { start: at("2026-11-28", 10), end: at("2026-11-28", 14) },
);

const facts = (part) => ({
  zone: ZONE,
  nowMs: NOW,
  from: WEEK,
  to: "2026-11-29",
  hours: { hours: HOURS, closures: [], rules: { lead_hours: 0, buffer_min: 0, max_days_ahead: 14, slot_min: 30 } },
  busy: BUSY,
  reviews: [],
  files: [],
  claims: [],
  newServices: [],
  ...part,
});
const clip = (id, part) => ({
  id,
  kind: "video",
  shows: ["finished blow-dry"],
  name: `clip-${id}`,
  issues: [],
  at: "2026-11-21T15:00:00Z",
  postedRecently: false,
  moments: 2,
  ...part,
});
let n = 0;
const newId = () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, "0")}`;
const week = (part) => ({
  zone: ZONE,
  nowMs: NOW,
  weekOf: WEEK,
  cadence: undefined,
  quietDays: [],
  places: { instagram: "yes", google: "not_connected" },
  goals: [],
  opportunities: [],
  footage: [],
  usedReasons: new Set(),
  ...part,
});

test("which week: Sunday evening plans the week that starts Monday; a Wednesday, what is left of this one", () => {
  assert.equal(planWeekOf(ZONE, NOW), WEEK);
  assert.equal(
    planWeekOf(ZONE, Date.parse("2026-11-25T15:00:00Z")),
    WEEK,
    "a Wednesday's ask covers what is left of it",
  );
});

test("open time: a day mostly free is a reason, by the book's own count; a full day is none; no book, no guess", () => {
  const byDay = openTimeByDay(facts({}));
  const thursday = byDay.find((d) => d.day === "2026-11-26");
  assert.equal(thursday.openHours, 5);
  assert.ok(Math.abs(thursday.share - 5 / 8) < 0.01);
  assert.equal(byDay.find((d) => d.day === "2026-11-24").openHours, 0, "Tuesday is full");
  const found = opportunitiesFrom(facts({}));
  assert.deepEqual(
    found.map((o) => [o.kind, o.says, o.day]),
    [["open_capacity", "Thursday has 5 hours open", "2026-11-26"]],
  );
  assert.deepEqual(opportunitiesFrom(facts({ busy: null })), [], "no book read: open time is never guessed");
});

test("the other reasons: an offer that runs, a service said to be new, a new review of four or five stars, fresh footage", () => {
  const found = opportunitiesFrom(
    facts({
      busy: null,
      claims: [
        {
          id: "c1",
          kind: "offer",
          text: "20% off a first colour",
          source: "settings",
          valid_until: "2026-11-28",
          withdrawn_at: null,
          created_at: "x",
        },
        {
          id: "c2",
          kind: "offer",
          text: "Old offer",
          source: "settings",
          valid_until: "2026-11-01",
          withdrawn_at: null,
          created_at: "x",
        },
      ],
      newServices: ["Balayage"],
      reviews: [
        { id: "r1", rating: 5, by: "Ana R.", words: "The best cut I have had in years.", at: "2026-11-20T10:00:00Z" },
        { id: "r2", rating: 2, by: "Bo T.", words: "Waited far too long for it.", at: "2026-11-20T10:00:00Z" },
        { id: "r3", rating: 5, by: "Old K.", words: "Lovely, lovely, lovely place.", at: "2026-09-01T10:00:00Z" },
      ],
      files: [{ id: "f1", kind: "video", shows: ["toner"], at: "2026-11-21T10:00:00Z", usable: true }],
    }),
  );
  assert.deepEqual(
    found.map((o) => o.key),
    ["offer:c1", "new_review:r1", "new_service:balayage", "fresh_footage:f1"],
    "strongest first; an ended offer, a low review and an old one are no reason",
  );
  assert.equal(found.find((o) => o.kind === "new_review").says, "Ana R. left 5 stars");
});

test("a week within the cadence: the strongest candidates, each at its time, the open day's post the evening before", () => {
  const opportunities = opportunitiesFrom(facts({}));
  const drafted = planWeek(
    week({ opportunities, footage: [clip("v1"), clip("v2", { shows: ["colour result"] })], goals: [] }),
    newId,
  );
  const live = drafted.slots.filter((s) => s.state === "proposed");
  assert.equal(live.length, 2, "two reels: the default cadence's high end");
  const thursday = live.find((s) => s.intent?.opportunity_id === "open_capacity:2026-11-26");
  assert.equal(thursday.title, "Thursday has openings");
  assert.equal(thursday.reason, "Thursday has 5 hours open");
  assert.equal(thursday.at, "2026-11-25T23:00:00.000Z", "Wednesday at 6 PM, the evening before");
  assert.equal(thursday.kind, "reel");
  assert.equal(thursday.intent.day, "2026-11-26");
  assert.ok(thursday.score.total >= 0.5);
  assert.deepEqual(Object.keys(thursday.score.parts).sort(), [
    "audience_fit",
    "effort",
    "eligibility",
    "expected_value",
    "footage_fit",
    "novelty",
    "relevance",
    "timeliness",
  ]);
  for (const part of Object.values(thursday.score.parts)) assert.ok(part.why.length > 0, "every part says why");
  assert.equal(drafted.fewer, null);
  assert.equal(weekSizeSaid(creativesOf(drafted.slots)), "2 reels");
});

test("fewer when the candidates are weak, and the week says why; what no clip can tell is asked to be filmed", () => {
  const opportunities = opportunitiesFrom(facts({ newServices: ["Balayage", "Toner", "Gloss", "Perm"] }));
  const dark = clip("v9", { issues: ["too dark to see the colour"], postedRecently: true });
  const drafted = planWeek(week({ opportunities, footage: [dark] }), newId);
  const live = drafted.slots.filter((s) => s.state === "proposed");
  assert.equal(live.length, 0, "a dark clip posted last week is too weak to post");
  assert.match(drafted.fewer, /^Nothing to post this week/);
  const asks = drafted.slots.filter((s) => s.state === "needs_footage");
  assert.equal(asks.length, FOOTAGE_ASKS_MOST, "at most three asks a week");
  assert.deepEqual(asks[0].ask, {
    what: "15 seconds of Balayage, start to finish",
    seconds: 15,
    opportunity_id: "new_service:balayage",
  });
  assert.equal(asks[0].reason, "Balayage is new");
  assert.equal(asks[0].file_id, null);

  const one = planWeek(week({ opportunities: opportunitiesFrom(facts({})), footage: [clip("v1"), dark] }), newId);
  assert.equal(one.slots.filter((s) => s.state === "proposed").length, 1);
  assert.match(one.fewer, /^Only 1 this week: /);
});

test("a slot a check refuses at the propose moment is blocked with its words and its check", () => {
  const drafted = planWeek(
    week({ opportunities: opportunitiesFrom(facts({})), footage: [clip("v1")], places: { instagram: "line_off" } }),
    newId,
  );
  const [slot] = drafted.slots;
  assert.equal(slot.state, "blocked");
  assert.equal(slot.blocked_why, "line_off");
  assert.match(slot.blocked_reason, /Instagram doesn't allow posting from here/);
});

test("a picture goes to Google too where it is connected and the cadence allows; a quiet day takes nothing", () => {
  const drafted = planWeek(
    week({
      opportunities: opportunitiesFrom(
        facts({
          busy: null,
          reviews: [
            { id: "r1", rating: 5, by: "Ana R.", words: "The best cut in years, truly.", at: "2026-11-20T10:00:00Z" },
          ],
        }),
      ),
      places: { instagram: "yes", google: "yes" },
      quietDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
    }),
    newId,
  );
  const review = drafted.slots.filter((s) => s.title === "Ana R. left 5 stars");
  assert.deepEqual(review.map((s) => [s.place, s.kind, s.file_id]).sort(), [
    ["google", "picture", null],
    ["instagram", "picture", null],
  ]);
  assert.equal(review[0].creative, review[1].creative, "one creative, two places");
  for (const slot of review) assert.equal(new Date(slot.at).getUTCDay(), 0, "Sunday: the only day not quiet");
});

test("drafting a week makes nothing and asks no model: the plan holds no cost", () => {
  const drafted = planWeek(week({ opportunities: opportunitiesFrom(facts({})), footage: [clip("v1")] }), newId);
  for (const slot of drafted.slots) {
    assert.equal(Object.hasOwn(slot, "piece_id"), false, "no piece is made");
    assert.equal(Object.hasOwn(slot, "cost_cents"), false);
  }
});
