/**
 * What a business's own posts have shown, and how the week leans on it (the content loop PRD's 9.4 and 10.2; call 17):
 * below 12 comparable posts on either side nothing is claimed and the week is planned as before; from 12 to 30 an early
 * sign is tried on one post and said as a try; past 30, holding in both halves of the window, a pattern moves every
 * slot's time or every candidate's expected value, and says why. Paid reach is left out, and a difference that came
 * with a second change is credited to neither. Pure: packages/core content/plan.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { contentPatternsOf, planWeek } from "@chanlytics/core";

const ZONE = "America/New_York";
const NOW = Date.parse("2026-11-23T00:00:00Z");
const WEEK = "2026-11-23";
const MORNING = 14; // 9 AM in New York in October and November, as UTC
const EVENING = 23; // 6 PM in New York

/** A day `i` days after 1 August 2026, as its date: the same run of weekdays and weekends for every cohort. */
const dayOf = (i) => new Date(Date.UTC(2026, 7, 1 + i)).toISOString().slice(0, 10);

/** `count` reels going up at `hourUtc` on consecutive days, each reaching `reach`, from what `shows` says. */
const reels = (count, part) =>
  Array.from({ length: count }, (_, i) => ({
    postId: `${part.tag}-${i}`,
    place: "instagram",
    kind: "reel",
    at: `${dayOf(i)}T${String(part.hourUtc ?? EVENING).padStart(2, "0")}:00:00Z`,
    seconds: part.seconds ?? 20,
    shows: part.shows ?? ["a finished blow-dry"],
    paid: part.paid ?? false,
    reach: part.reach,
  }));

const clip = (id, part) => ({
  id,
  kind: "video",
  shows: ["a finished blow-dry"],
  name: `clip-${id}`,
  issues: [],
  at: "2026-11-21T15:00:00Z",
  postedRecently: false,
  moments: 2,
  seconds: 20,
  ...part,
});
let n = 0;
const newId = () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, "0")}`;
const week = (patterns, footage = [clip("v1"), clip("v2")]) => ({
  zone: ZONE,
  nowMs: NOW,
  weekOf: WEEK,
  cadence: undefined,
  quietDays: [],
  places: { instagram: "yes", google: "not_connected" },
  goals: [],
  opportunities: [],
  footage,
  usedReasons: new Set(),
  patterns,
});
const hourIn = (iso) =>
  Number(new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", hourCycle: "h23" }).format(new Date(iso)));
const reelSlots = (drafted) => drafted.slots.filter((s) => s.kind === "reel" && s.state !== "needs_footage");

test("too little: under 12 a side is said as too little, and the week is planned as it was", () => {
  const posts = [...reels(8, { tag: "m", hourUtc: MORNING, reach: 300 }), ...reels(8, { tag: "e", reach: 100 })];
  const [hour] = contentPatternsOf(posts, ZONE).filter((p) => p.dimension === "hour");
  assert.equal(hour.level, "too_little");
  assert.equal(hour.better, "morning");
  const drafted = planWeek(week(contentPatternsOf(posts, ZONE)), newId);
  assert.deepEqual(
    reelSlots(drafted).map((s) => hourIn(s.at)),
    [18, 18],
    "every reel at the plan's own evening hour",
  );
  for (const slot of reelSlots(drafted)) {
    assert.equal(slot.score.parts.expected_value.why, "Not known yet: too few posts to compare");
    assert.equal(slot.score.parts.audience_fit.why, "Not known yet: no post has been measured");
  }
});

test("an early sign: tried on one reel this week, said as a try; the others keep the plan's hour", () => {
  const posts = [...reels(14, { tag: "m", hourUtc: MORNING, reach: 300 }), ...reels(14, { tag: "e", reach: 100 })];
  const [hour] = contentPatternsOf(posts, ZONE).filter((p) => p.dimension === "hour");
  assert.equal(hour.level, "early");
  assert.equal(hour.lift, 3);
  assert.equal(hour.movedWith, null);
  assert.equal(
    hour.says,
    "On Instagram, morning reels reached 3 times as many people as your other reels (14 and 14 reels)",
  );
  const [tried, kept] = reelSlots(planWeek(week(contentPatternsOf(posts, ZONE)), newId));
  assert.equal(hourIn(tried.at), 9, "the try goes up in the morning");
  assert.match(tried.score.parts.audience_fit.why, /^An early sign, tried on this one: On Instagram, morning reels/);
  assert.equal(hourIn(kept.at), 18, "one try a week: the other reel keeps the evening");
});

test("a pattern: past 30 a side and ahead in both halves, every reel moves, and says why", () => {
  const posts = [...reels(35, { tag: "m", hourUtc: MORNING, reach: 300 }), ...reels(35, { tag: "e", reach: 120 })];
  const [hour] = contentPatternsOf(posts, ZONE).filter((p) => p.dimension === "hour");
  assert.equal(hour.level, "pattern");
  const slots = reelSlots(planWeek(week(contentPatternsOf(posts, ZONE)), newId));
  assert.deepEqual(
    slots.map((s) => hourIn(s.at)),
    [9, 9],
  );
  for (const slot of slots) {
    assert.equal(slot.score.parts.audience_fit.value, 0.8);
    assert.equal(slot.score.parts.audience_fit.why, hour.says);
  }
});

test("past 30 but not ahead in both halves of the window: still only an early sign", () => {
  // The morning reels did better only in the older half: the newer half is level.
  const morning = reels(35, { tag: "m", hourUtc: MORNING, reach: 300 }).map((p, i) =>
    i >= 18 ? { ...p, reach: 100 } : p,
  );
  const posts = [...morning, ...reels(35, { tag: "e", reach: 100 })];
  const [hour] = contentPatternsOf(posts, ZONE).filter((p) => p.dimension === "hour");
  assert.ok(!hour || hour.level !== "pattern", "a difference that did not hold is never a pattern");
});

test("two things at once: the morning reels were also the ones showing balayage, so neither is leaned on", () => {
  const posts = [
    ...reels(35, { tag: "m", hourUtc: MORNING, reach: 300, shows: ["balayage"] }),
    ...reels(35, { tag: "e", reach: 100 }),
  ];
  const found = contentPatternsOf(posts, ZONE);
  assert.equal(found.find((p) => p.dimension === "hour").movedWith, "shows");
  assert.equal(found.find((p) => p.dimension === "shows").movedWith, "hour");
  const slots = reelSlots(planWeek(week(found, [clip("v1", { shows: ["balayage"] }), clip("v2")]), newId));
  assert.deepEqual(
    slots.map((s) => hourIn(s.at)),
    [18, 18],
    "the hour is not moved",
  );
  for (const slot of slots)
    assert.equal(slot.score.parts.expected_value.why, "Not known yet: too few posts to compare", "nor the value");
});

test("paid reach is kept apart: posts that also ran as an ad are never compared with organic ones", () => {
  const posts = [
    ...reels(8, { tag: "m", hourUtc: MORNING, reach: 300 }),
    ...reels(20, { tag: "mp", hourUtc: MORNING, reach: 900, paid: true }),
    ...reels(14, { tag: "e", reach: 100 }),
  ];
  const [hour] = contentPatternsOf(posts, ZONE).filter((p) => p.dimension === "hour");
  assert.equal(hour.level, "too_little");
  assert.deepEqual(hour.n, { better: 8, rest: 14 });
});

test("what the footage is: a short-reel pattern lifts a short clip and lowers a long one, each saying why", () => {
  const posts = [
    ...reels(35, { tag: "s", reach: 300, seconds: 10 }),
    ...reels(35, { tag: "l", reach: 100, seconds: 45 }),
  ];
  const [length] = contentPatternsOf(posts, ZONE).filter((p) => p.dimension === "length");
  assert.equal(length.level, "pattern");
  assert.equal(length.better, "short");
  const drafted = planWeek(
    week(contentPatternsOf(posts, ZONE), [clip("long", { seconds: 45 }), clip("short", { seconds: 10 })]),
    newId,
  );
  const byFile = new Map(reelSlots(drafted).map((s) => [s.file_id, s.score.parts.expected_value]));
  assert.equal(byFile.get("short").why, length.says);
  assert.ok(byFile.get("short").value > 0.5);
  assert.equal(byFile.get("long").value, 0.35);
  assert.equal(byFile.get("long").why, `${length.says}; this one is not`);
  assert.equal(reelSlots(drafted)[0].file_id, "short", "the short clip is picked first");
});

test("a difference under a fifth is no difference, and nothing is said of it", () => {
  const posts = [...reels(35, { tag: "m", hourUtc: MORNING, reach: 110 }), ...reels(35, { tag: "e", reach: 100 })];
  assert.deepEqual(
    contentPatternsOf(posts, ZONE).filter((p) => p.dimension === "hour"),
    [],
  );
});
