/**
 * The mark we keep (00161): core's reading of an image's own first bytes, and the three rules a copy has to pass
 * before the collect stores it. Every fixture is the format's real header (_mark-images.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  imageHeaderOf,
  markImageFrom,
  MARK_MAX_BYTES,
  MARK_MIN_SIDE,
} from "../../../../packages/core/src/leads/mark-image.ts";
import { gif, heic, ico, jpeg, notAnImage, png, svg, webpExtended, webpLossless, webpLossy } from "./_mark-images.mjs";

const sized = (img) => (img ? [img.kind, img.contentType, img.width, img.height] : null);

test("each of the five formats says what it is and how big, from its own header, whatever the server called it", () => {
  assert.deepEqual(sized(imageHeaderOf(png(180, 120))), ["png", "image/png", 180, 120]);
  assert.deepEqual(sized(imageHeaderOf(gif(96, 90))), ["gif", "image/gif", 96, 90]);
  assert.deepEqual(sized(imageHeaderOf(jpeg(300, 200))), ["jpg", "image/jpeg", 300, 200], "past the APP0 segment");
  assert.deepEqual(
    sized(imageHeaderOf(jpeg(640, 480, 0xc2))),
    ["jpg", "image/jpeg", 640, 480],
    "a progressive frame too",
  );
  assert.deepEqual(sized(imageHeaderOf(webpLossy(512, 384))), ["webp", "image/webp", 512, 384]);
  assert.deepEqual(sized(imageHeaderOf(webpLossless(200, 150))), ["webp", "image/webp", 200, 150]);
  assert.deepEqual(sized(imageHeaderOf(webpExtended(1200, 1000))), ["webp", "image/webp", 1200, 1000]);
  assert.deepEqual(
    sized(imageHeaderOf(ico(16, 32, 48))),
    ["ico", "image/x-icon", 48, 48],
    "an icon file is as big as the biggest image in it",
  );
  assert.deepEqual(
    sized(imageHeaderOf(ico(16, 256))),
    ["ico", "image/x-icon", 256, 256],
    "a side of 256 is written as 0",
  );
});

test("what is not one of the five is nothing: an error page, an SVG, a HEIC, a header cut short, no bytes at all", () => {
  for (const [bytes, what] of [
    [notAnImage, "the site's error page, served where the logo was"],
    [svg, "an SVG, which can carry script"],
    [heic, "a HEIC, which one browser draws"],
    [png(180, 180).slice(0, 20), "a PNG cut off before its size"],
    [jpeg(180, 180).slice(0, 22), "a JPEG cut off before its frame"],
    [new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 4, 0, 0]), "a JPEG whose data starts before any frame"],
    [new Uint8Array(0), "nothing"],
  ]) {
    assert.equal(imageHeaderOf(bytes), null, what);
    assert.equal(markImageFrom(bytes), null, what);
  }
});

test("a copy is kept only when it is sharp in a tile, not a banner, and the size of a logo", () => {
  assert.ok(markImageFrom(png(180, 180)), "a home-screen icon");
  assert.ok(markImageFrom(png(MARK_MIN_SIDE, MARK_MIN_SIDE)), "the smallest side that is sharp at the peek's size");
  assert.equal(markImageFrom(png(MARK_MIN_SIDE - 1, 200)), null, "one pixel short on its short side");
  assert.equal(markImageFrom(ico(16, 32, 48)), null, "a favicon's sixteen to forty-eight pixels would be mush");
  assert.ok(markImageFrom(ico(16, 32, 256)), "an icon file with a big image in it is kept");
  assert.ok(markImageFrom(png(256, 128)), "twice as wide as tall still reads in a square tile");
  assert.equal(markImageFrom(png(257, 128)), null, "a wordmark any wider is a thin line inside it");
  assert.equal(markImageFrom(png(128, 257)), null, "and so is one as tall");
  assert.ok(markImageFrom(png(200, 200, MARK_MAX_BYTES)), "a logo right at the limit");
  assert.equal(markImageFrom(png(200, 200, MARK_MAX_BYTES + 1)), null, "a byte past it is a photograph, not a logo");
});
