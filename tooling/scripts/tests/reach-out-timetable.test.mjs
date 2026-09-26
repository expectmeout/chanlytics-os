import { test } from "node:test";
import assert from "node:assert/strict";
import { timetable, sendWindowsOf, DEFAULT_WEEK, SEND_DAY_FRAME, SEND_WINDOW_MARGIN_MIN } from "@chanlytics/contracts";

const NY = "America/New_York";
const LA = "America/Los_Angeles";
const at = (iso) => Date.parse(iso);
const send = (id, zone = NY, week = DEFAULT_WEEK) => ({ id, zone, week });
const domain = (id, cap, recent = []) => ({ id, cap, recent });
const none = () => 0; // no jitter: the tests read exact times

test("a send goes at the lead's own next open moment, half an hour inside the window", () => {
  // Monday 7:00 in New York: the window opens at 9:00, so the first send is 9:30 local (13:30Z in September).
  const out = timetable({
    sends: [send("a")],
    domains: [domain("d1", 30)],
    gapMinutes: 12,
    nowMs: at("2026-09-28T11:00:00Z"),
    jitter: none,
  });
  assert.deepEqual(out.placed, [{ id: "a", domainId: "d1", sendAtMs: at("2026-09-28T13:30:00Z") }]);
  assert.equal(SEND_WINDOW_MARGIN_MIN, 30);
});

test("each lead in its own zone: a Los Angeles lead waits for Los Angeles' morning", () => {
  const out = timetable({
    sends: [send("ny"), send("la", LA)],
    domains: [domain("d1", 30)],
    gapMinutes: 12,
    nowMs: at("2026-09-28T11:00:00Z"),
    jitter: none,
  });
  const by = Object.fromEntries(out.placed.map((p) => [p.id, p.sendAtMs]));
  assert.equal(by.ny, at("2026-09-28T13:30:00Z"));
  assert.equal(by.la, at("2026-09-28T16:30:00Z"), "9:30 in Los Angeles");
});

test("the gap between two sends on one domain, and the second domain takes the next lead meanwhile", () => {
  const one = timetable({
    sends: [send("a"), send("b")],
    domains: [domain("d1", 30)],
    gapMinutes: 12,
    nowMs: at("2026-09-28T11:00:00Z"),
    jitter: none,
  });
  assert.equal(one.placed[1].sendAtMs - one.placed[0].sendAtMs, 12 * 60_000);
  const two = timetable({
    sends: [send("a"), send("b")],
    domains: [domain("d1", 30), domain("d2", 30)],
    gapMinutes: 12,
    nowMs: at("2026-09-28T11:00:00Z"),
    jitter: none,
  });
  assert.deepEqual(
    two.placed.map((p) => [p.domainId, p.sendAtMs]),
    [
      ["d1", at("2026-09-28T13:30:00Z")],
      ["d2", at("2026-09-28T13:30:00Z")],
    ],
  );
});

test("a domain's day is its cap, counted with what it already sent; what does not fit waits for room", () => {
  // Cap 2, one already sent at 13:00Z: one more today, and the third a day after the first of the two.
  const out = timetable({
    sends: [send("a"), send("b")],
    domains: [domain("d1", 2, [at("2026-09-28T13:00:00Z")])],
    gapMinutes: 12,
    nowMs: at("2026-09-28T11:00:00Z"),
    jitter: none,
  });
  assert.equal(out.placed[0].sendAtMs, at("2026-09-28T13:30:00Z"));
  assert.ok(out.placed[1].sendAtMs >= at("2026-09-29T13:00:00Z"), "rolled to when the first leaves the 24 hours");
});

test("a closed day is skipped, and a lead with no room within the horizon is left unplaced, never forced", () => {
  const fridayOnly = { ...DEFAULT_WEEK, mon: [], tue: [], wed: [], thu: [] };
  const out = timetable({
    sends: [send("f", NY, fridayOnly)],
    domains: [domain("d1", 30)],
    gapMinutes: 12,
    nowMs: at("2026-09-28T11:00:00Z"),
    jitter: none,
  });
  assert.equal(new Date(out.placed[0].sendAtMs).getUTCDay(), 5, "Friday");
  const closed = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
  const never = timetable({
    sends: [send("x", NY, closed)],
    domains: [domain("d1", 30)],
    gapMinutes: 12,
    nowMs: at("2026-09-28T11:00:00Z"),
    jitter: none,
  });
  assert.deepEqual([never.placed, never.unplaced], [[], ["x"]]);
});

test("no domain with a day's share places nothing", () => {
  const out = timetable({
    sends: [send("a")],
    domains: [domain("d1", 0)],
    gapMinutes: 12,
    nowMs: at("2026-09-28T11:00:00Z"),
    jitter: none,
  });
  assert.deepEqual(out.unplaced, ["a"]);
});

test("jitter moves each gap by at most a quarter, so no two runs keep one rhythm", () => {
  const out = timetable({
    sends: [send("a"), send("b"), send("c")],
    domains: [domain("d1", 30)],
    gapMinutes: 12,
    nowMs: at("2026-09-28T11:00:00Z"),
    jitter: () => 1,
  });
  const gaps = out.placed.slice(1).map((p, i) => (p.sendAtMs - out.placed[i].sendAtMs) / 60_000);
  assert.deepEqual(gaps, [15, 15]);
});

test("the day's frame: a business open all night is written to from eight, its own time, never at one in the morning", () => {
  const allDay = {
    mon: [{ from: 0, to: 1440 }],
    tue: [{ from: 0, to: 1440 }],
    wed: [],
    thu: [],
    fri: [],
    sat: [],
    sun: [],
  };
  // Monday 3:00 in New York (7:00Z): the first send is 8:00 local, 12:00Z.
  const out = timetable({
    sends: [send("a", NY, allDay)],
    domains: [domain("d1", 30)],
    gapMinutes: 12,
    nowMs: at("2026-09-28T07:00:00Z"),
    jitter: none,
  });
  assert.equal(out.placed[0].sendAtMs, at("2026-09-28T12:00:00Z"));
  assert.deepEqual(SEND_DAY_FRAME, { from: 480, to: 1200 });
  assert.deepEqual(sendWindowsOf(allDay).mon, [{ from: 480, to: 1200 }]);
  // Open six to two past midnight: from half past six until eight, and nothing after midnight.
  const evening = { ...DEFAULT_WEEK, mon: [{ from: 1080, to: 1560 }] };
  assert.deepEqual(sendWindowsOf(evening).mon, [{ from: 1110, to: 1200 }]);
});

test("a business open only at night takes the default week's hours; one closed every day stays unplaced", () => {
  const night = {
    mon: [{ from: 1260, to: 1560 }],
    tue: [{ from: 1260, to: 1560 }],
    wed: [],
    thu: [],
    fri: [],
    sat: [],
    sun: [],
  };
  assert.deepEqual(sendWindowsOf(night).wed, [{ from: 570, to: 990 }], "nine to five, half an hour in");
  const out = timetable({
    sends: [send("bar", NY, night)],
    domains: [domain("d1", 30)],
    gapMinutes: 12,
    nowMs: at("2026-09-28T11:00:00Z"),
    jitter: none,
  });
  assert.equal(out.placed[0].sendAtMs, at("2026-09-28T13:30:00Z"));
  const closed = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
  assert.deepEqual(sendWindowsOf(closed), closed);
});

test("a run of five hundred over two domains keeps every gap and every rolling day's cap, inside the leads' windows", () => {
  const zones = [NY, LA, "America/Chicago", "America/Denver"];
  const sends = Array.from({ length: 500 }, (_, i) => send(`s${i}`, zones[i % 4]));
  const already = Array.from({ length: 20 }, (_, i) => at("2026-09-27T14:00:00Z") + i * 15 * 60_000);
  const started = performance.now();
  const out = timetable({
    sends,
    domains: [domain("d1", 30, already), domain("d2", 20)],
    gapMinutes: 12,
    nowMs: at("2026-09-28T11:00:00Z"),
  });
  const took = performance.now() - started;
  assert.equal(out.placed.length + out.unplaced.length, 500);
  assert.ok(out.placed.length > 150, `placed ${out.placed.length}`);
  for (const [id, cap, recent] of [
    ["d1", 30, already],
    ["d2", 20, []],
  ]) {
    const times = [...recent, ...out.placed.filter((p) => p.domainId === id).map((p) => p.sendAtMs)].sort(
      (a, b) => a - b,
    );
    for (let i = 1; i < times.length; i += 1)
      assert.ok(times[i] - times[i - 1] >= 9 * 60_000, `${id}: a gap of at least three quarters`);
    for (const q of times)
      assert.ok(times.filter((x) => x > q - 86_400_000 && x <= q).length <= cap, `${id}: a rolling day within ${cap}`);
  }
  const zoneOf = Object.fromEntries(sends.map((s) => [s.id, s.zone]));
  for (const p of out.placed) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zoneOf[p.id],
      weekday: "short",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    }).formatToParts(p.sendAtMs);
    const get = (t) => parts.find((x) => x.type === t).value;
    const min = Number(get("hour")) * 60 + Number(get("minute"));
    assert.ok(
      !["Sat", "Sun"].includes(get("weekday")) && min >= 570 && min <= 990,
      `${p.id} at ${get("weekday")} ${min}`,
    );
  }
  assert.ok(took < 3000, `planned in ${Math.round(took)} ms`);
});
