/**
 * Posts on the Calendar (the content redesign's stage 3): each post of Campaigns › Content at its time, up at the minute it
 * went, waiting for its time drawn hollow, one that did not go in amber, one pulled or taken down not at all, each opening its
 * piece in Content; shown under Show's own Posts switch, which a Show kept from before posts says nothing of, and draws.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CALENDAR_SHOW_WORDS, calendarRunMarksOf, runMarkShown } from "@chanlytics/contracts";

const TZ = "America/New_York";
// Tuesday noon in New York; the span is the week.
const NOW = new Date("2026-09-08T16:00:00.000Z");
const FILE = "ffffffff-0000-4000-8000-000000000001";
const postOf = (id, over = {}) => ({
  id,
  file_id: FILE,
  name: "open-late-this-saturday",
  place: "instagram",
  status: "published",
  scheduled_for: "2026-09-08T13:00:00.000Z",
  published_at: "2026-09-08T13:02:00.000Z",
  ...over,
});
const week = (posts) => ({ timezone: TZ, from: "2026-09-07", days: 7, paused: false, runs: [], moments: [], posts });
const on = (dto, day) => calendarRunMarksOf(dto, NOW).get(day) ?? [];
const said = (m) => [m.time, m.name, m.words].filter(Boolean).join(" · ");

test("a post is a mark at its time: up where it went, waiting for its time hollow, one that did not go in amber", () => {
  const dto = week([
    postOf("p1"),
    postOf("p2", { place: "google", status: "queued", scheduled_for: "2026-09-09T13:00:00.000Z", published_at: null }),
    postOf("p3", { status: "failed", scheduled_for: "2026-09-10T22:00:00.000Z", published_at: null }),
  ]);
  const [up] = on(dto, "2026-09-08");
  assert.equal(said(up), "9:02 AM · Open late this saturday · On Instagram");
  assert.deepEqual([up.kind, up.tone, up.ahead, up.named], ["post", "ok", false, true]);
  assert.equal(up.route, `campaigns/content:${FILE}`, "its door opens the piece");
  assert.equal(up.door, "Open in Content");
  const [ahead] = on(dto, "2026-09-09");
  assert.equal(said(ahead), "9 AM · Open late this saturday · To go on Google");
  assert.deepEqual([ahead.tone, ahead.ahead], ["info", true]);
  const [stopped] = on(dto, "2026-09-10");
  assert.equal(stopped.words, "Didn't go on Instagram");
  assert.equal(stopped.tone, "warn");
  assert.equal(stopped.route, `campaigns/content:needs:${FILE}`, "opened in Needs you, where it says why");
});

test("one pulled or taken down is no mark, and a server before posts draws none", () => {
  const dto = week([postOf("p1", { status: "pulled", published_at: null }), postOf("p2", { status: "taken_down" })]);
  assert.deepEqual(on(dto, "2026-09-08"), []);
  const { posts: _none, ...before } = week([]);
  assert.deepEqual(on(before, "2026-09-08"), []);
});

test("Show's own Posts switch: on by itself, off alone, and a Show kept from before posts draws them", () => {
  const [mark] = on(week([postOf("p1")]), "2026-09-08");
  assert.equal(runMarkShown(mark, { campaigns: false, cold: false, posts: true }), true);
  assert.equal(runMarkShown(mark, { campaigns: true, cold: true, posts: false }), false);
  assert.equal(runMarkShown(mark, { campaigns: false, cold: false }), true, "a Show kept from before posts");
  const value = CALENDAR_SHOW_WORDS.value;
  const offered = { campaigns: true, cold: false, posts: true };
  assert.equal(value({ open: true, campaigns: true, cold: false, posts: true }, offered), "Everything");
  assert.equal(value({ open: true, campaigns: true, cold: false, posts: false }, offered), "Open times, campaigns");
  assert.equal(value({ open: false, campaigns: false, cold: false, posts: true }, offered), "Posts");
});
