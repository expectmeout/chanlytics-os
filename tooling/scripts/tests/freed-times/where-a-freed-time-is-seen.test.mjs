/**
 * Where a freed time is seen (decision 0082, L3): Start's Change offers how many people each freed time goes to and says how
 * far ahead it offers, never an hour; a batch's History day says who took the time; the journey's guide names the moment
 * on no stage where a calendar is connected; the activity log says why the system canceled a freed time's run; Ask's
 * signals notice the cancellations nothing offered, and its definitions say what a freed time is.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  SCHEDULE_WORDS,
  activityWords,
  freedTimesUnoffered,
  historyDayWords,
  journeyGuide,
  scheduleSettingsOf,
  sequenceActsOf,
  sequenceNextOf,
} from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { ASK_DEFINITIONS } = await import(at("apps/dashboard/src/server/ask/prompt.ts"));

const sequenceOn = (trigger) => ({
  first: { id: "s1", run_hour: 10, until: null, policy_class: "follow_up", trigger },
});

test("Start's Change for a freed time: the people each time goes to and how far ahead, never an hour, a gap or a cadence", () => {
  assert.deepEqual(scheduleSettingsOf(sequenceOn("slot_opened")), { gap: false, every: false, freed: true });
  assert.deepEqual(scheduleSettingsOf(sequenceOn("quiet_30")), { gap: true, every: false, freed: false });
  const W = SCHEDULE_WORDS.settings;
  assert.equal(W.freedCap, "People per freed time");
  assert.equal(W.freedAhead(14), "Up to 14 days ahead");
  assert.match(W.freedAheadHint, /Booking rules/);
});

test("a freed time's sequence has no next run by an hour and no Run now: it runs when a cancellation frees a time", () => {
  const row = {
    id: "s1",
    name: "Fill a cancellation",
    state: "on",
    starts: "moment",
    mode: "auto",
    first: { id: "s1", state: "running", run_hour: 10, until: null, policy_class: "follow_up", trigger: "slot_opened" },
    next: null,
    needs: { waiting: 0, waiting_people: 0, held: 0, to_send: 0, replies: 0, oldest_at: null, batches: [] },
  };
  const nowMs = Date.parse("2026-09-06T14:00:00Z");
  assert.equal(sequenceNextOf(row, "2026-09-05", "America/New_York", nowMs), null);
  const quiet = { ...row, first: { ...row.first, trigger: "quiet_30" } };
  assert.ok(sequenceNextOf(quiet, "2026-09-05", "America/New_York", nowMs), "a win-back's next run is at its hour");
  const acts = sequenceActsOf({ sequence: row, chain: null, ran: true }, { tz: "America/New_York", nowMs });
  assert.deepEqual(acts.run_now, { ok: false, because: "freed_time" });
});

test("a freed time's day in History says who took the time, as Today's line does; another batch says nothing of it", () => {
  const day = (over) =>
    historyDayWords(
      {
        id: "b1",
        state: "sent",
        run_for: null,
        at: "2026-09-08T14:00:00Z",
        scheduled_for: "2026-09-08T14:00:00Z",
        finished_at: "2026-09-08T14:01:00Z",
        people: 4,
        failure: null,
        place: 1,
        counts: { sent: 4, read: 3, replied: 2 },
        ...over,
      },
      null,
    );
  assert.deepEqual(day({ offered_start: "2026-09-08T19:00:00Z", took: 1 }), {
    end: "4 sent",
    said: "3 read · 2 replied · 1 took it",
  });
  assert.equal(day({ offered_start: "2026-09-08T19:00:00Z", took: 0 }).said, "3 read · 2 replied · 0 took it");
  assert.equal(day({ took: null }).said, "3 read · 2 replied");
  assert.equal(day({}).said, "3 read · 2 replied", "a database before it says no took at all");
});

test("the journey's guide names a freed time on no stage, beside the month's offer, only where a calendar is connected", () => {
  const rows = (calendarOn) => journeyGuide({ calendarOn, hasDeals: false, word: "appointment" });
  const freed = rows(true).find((r) => r.moment === "slot_opened");
  assert.deepEqual(freed, {
    stage: null,
    moment: "slot_opened",
    sends: "when a cancellation frees a time: that time, to the people who asked and never booked",
  });
  assert.equal(rows(true).at(-1).moment, "everyone_monthly", "the month's offer stays last");
  assert.equal(
    rows(false).find((r) => r.moment === "slot_opened"),
    undefined,
    "no calendar, no freed time",
  );
});

test("the activity log says why the system canceled a freed time's run, by the reason its decision keeps", () => {
  const name = "Fill a cancellation · Tue 3:00 PM";
  assert.equal(
    activityWords("cancel_broadcast", { name, reason: "time_passed" }),
    `Skipped a freed time's run when its time came · ${name}`,
  );
  assert.equal(
    activityWords("cancel_broadcast", { name, reason: "taken" }),
    `Stopped a freed time's run: someone booked the time · ${name}`,
  );
  assert.equal(
    activityWords("cancel_broadcast", { name: "Win-back · 2026-09-07", reason: "day_passed" }),
    "Skipped a run whose day had passed · Win-back · 2026-09-07",
  );
  // A member's own cancel keeps the log's own words for the act.
  const own = activityWords("cancel_broadcast", { name });
  assert.ok(!/^(Skipped|Stopped)/.test(own), own);
});

test("Ask notices the cancellations nothing offered: a calendar connected, no step on the moment running, and enough of them", () => {
  const noticed = (over = {}) =>
    freedTimesUnoffered({
      cancellations: 6,
      calendar: "ok",
      steps: [{ trigger: "quiet_30", state: "running" }],
      tz: "UTC",
      nowMs: Date.parse("2026-09-06T14:00:00Z"),
      days: 30,
      ...over,
    });
  assert.deepEqual(noticed(), {
    says: "6 appointments were cancelled in the last 30 days and the time was offered to nobody.",
    next: "propose_sequence with action moment on slot_opened (Fill a cancellation): each time a cancellation frees goes to the people who asked and never booked",
  });
  // A step on the moment running, no calendar, too few, or a count that could not be read: nothing.
  assert.equal(noticed({ steps: [{ trigger: "slot_opened", state: "running" }] }), null);
  assert.equal(noticed({ calendar: "none" }), null);
  assert.equal(noticed({ cancellations: 2 }), null);
  assert.equal(noticed({ cancellations: null }), null);
  // A step on the moment that is paused, or past its last day, offers nothing either: the notice stands.
  assert.ok(noticed({ steps: [{ trigger: "slot_opened", state: "paused" }] }));
  assert.ok(noticed({ steps: [{ trigger: "slot_opened", state: "running", until: "2026-09-01" }] }));
  // A calendar whose feed is down just now is still connected.
  assert.ok(noticed({ calendar: "unavailable" }));
});

test("Ask's definitions say what a freed time is: the campaign that offers it, to whom, and that a booking stays the owner's", () => {
  const said = ASK_DEFINITIONS["freed time"];
  assert.ok(said, "defined");
  assert.match(said, /Fill a cancellation/);
  assert.match(said, /asked .*never booked/);
  assert.match(said, /owner's to confirm/);
  assert.doesNotMatch(said, /\bopening\b/i, "the cold email's word, never this one's");
});
