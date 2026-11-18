/**
 * The screen (apps/edge/lib/files/takes/screen.ts, the footage sources plan): what an item is and whether it may be
 * taken, from its provider's own record, before any bytes move. Short clips only: a video over ten minutes or 500 MB
 * is listed, said to be too long, and never taken.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { at } from "../../_cron-doors-world.mjs";

const { screenItem } = await import(at("apps/edge/lib/files/takes/screen.ts"));

const NOW = Date.parse("2026-11-18T03:00:00Z");
const SEEN_LAST_WEEK = "2026-11-10T10:00:00.000Z";
const SEEN_AN_HOUR_AGO = "2026-11-18T02:00:00.000Z";
const record = (over) => ({
  id: "drive-1",
  kind: "video",
  parentId: "folder-1",
  name: "clip.MOV",
  mime: "video/quicktime",
  modifiedAt: null,
  checksum: null,
  bytes: 56_812_805,
  seconds: 8.2,
  addedBy: null,
  trashed: false,
  ...over,
});
const screen = (over, seen = SEEN_LAST_WEEK) => screenItem(record(over), seen, NOW);

test("a short clip and a photo are taken, each as what its record says it is", () => {
  assert.deepEqual(screen({}), { fate: "video", mime: "video/quicktime", bytes: 56_812_805, seconds: 8.2 });
  assert.deepEqual(screen({ mime: "video/mp4", bytes: 454_508_739, seconds: 226.4 }), {
    fate: "video",
    mime: "video/mp4",
    bytes: 454_508_739,
    seconds: 226.4,
  });
  assert.deepEqual(screen({ mime: "image/heic", bytes: 2_400_000, seconds: null }), {
    fate: "photo",
    mime: "image/heic",
    bytes: 2_400_000,
  });
});

test("a video over ten minutes or 500 MB is too big, with which, and a clip at the limit is taken", () => {
  assert.deepEqual(screen({ seconds: 601 }), { fate: "too_big", why: "seconds" });
  assert.deepEqual(screen({ bytes: 500_000_001 }), { fate: "too_big", why: "bytes" });
  assert.equal(screen({ seconds: 600, bytes: 500_000_000 }).fate, "video");
  assert.deepEqual(screen({ bytes: 3_000_000_000, seconds: 3_600 }), { fate: "too_big", why: "bytes" });
});

test("a photo over 25 MB is too big", () => {
  assert.deepEqual(screen({ mime: "image/jpeg", bytes: 25_000_001 }), { fate: "too_big", why: "bytes" });
  assert.equal(screen({ mime: "image/jpeg", bytes: 25_000_000 }).fate, "photo");
});

test("what is not a photo or a video a member may add is passed over, and so is an empty file", () => {
  for (const mime of ["application/pdf", "image/x-adobe-dng", "application/vnd.google-apps.shortcut", "image/gif", ""])
    assert.deepEqual(screen({ mime }), { fate: "not_media", why: "kind" }, mime);
  assert.deepEqual(screen({ bytes: 0 }), { fate: "not_media", why: "empty" });
  assert.deepEqual(screen({ mime: "image/png", bytes: null }), { fate: "not_media", why: "empty" });
});

test("a video whose length Drive has not said yet waits, and a day after it was first seen is judged by its size", () => {
  assert.deepEqual(screen({ seconds: null }, SEEN_AN_HOUR_AGO), { fate: "wait", why: "length" });
  assert.deepEqual(screen({ seconds: null }), {
    fate: "video",
    mime: "video/quicktime",
    bytes: 56_812_805,
    seconds: null,
  });
  assert.deepEqual(screen({ seconds: null, bytes: 500_000_001 }, SEEN_AN_HOUR_AGO), { fate: "too_big", why: "bytes" });
});

test("an item in its provider's bin is the sync's to say, never taken", () => {
  assert.deepEqual(screen({ trashed: true }), { fate: "away" });
});
