/**
 * A made piece's tile is drawn at its own shape (campaigns/content/model/tiles.ts): a video tall, a post as it was made. The pieces are
 * dealt into columns, each to the shortest, so the newest read across the top and no column runs long.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tileShapeOf } from "../../../apps/dashboard/src/surfaces/campaigns/content/model/tiles.ts";

const file = (kind, width, height) => ({ kind, width, height });

test("a tile takes the shape nearest its file's own", () => {
  assert.equal(tileShapeOf(file("video", 1080, 1920)), "tall");
  assert.equal(tileShapeOf(file("image", 1080, 1350)), "portrait");
  assert.equal(tileShapeOf(file("image", 1080, 1080)), "square");
  assert.equal(tileShapeOf(file("image", 1200, 900)), "wide");
});

test("a file with no size yet is tall where it is a video, and square otherwise", () => {
  assert.equal(tileShapeOf(file("video", null, null)), "tall");
  assert.equal(tileShapeOf(file("image", null, null)), "square");
});
