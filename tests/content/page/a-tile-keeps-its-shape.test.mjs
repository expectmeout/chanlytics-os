/**
 * A made piece's tile is drawn at its own shape (campaigns/content/model/tiles.ts): a video tall, a post as it was made. The pieces are
 * dealt into columns, each to the shortest, so the newest read across the top and no column runs long.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { contentColumnsOf, tileShapeOf } from "../../../apps/dashboard/src/surfaces/campaigns/content/model/tiles.ts";

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

test("pieces go to the shortest column, in the order given", () => {
  const pieces = ["tall", "portrait", "portrait", "tall", "square"];
  const columns = contentColumnsOf(pieces, 2, (shape) => shape);
  // Each stands its shape's height plus 0.28 for its words. Left takes tall (2.06). Right takes portrait (1.53), and the
  // next portrait too (3.06). Left is shorter now and takes the second tall (4.12). Right takes square (4.34).
  assert.deepEqual(columns, [
    ["tall", "tall"],
    ["portrait", "portrait", "square"],
  ]);
});

test("one column, or none asked for, holds them all in order", () => {
  assert.deepEqual(
    contentColumnsOf(["a", "b"], 1, () => "square"),
    [["a", "b"]],
  );
  assert.deepEqual(
    contentColumnsOf(["a", "b"], 0, () => "square"),
    [["a", "b"]],
  );
});
