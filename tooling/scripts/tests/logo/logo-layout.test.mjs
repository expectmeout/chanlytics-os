/**
 * How a chosen picture becomes the workspace's square (contracts logo/layout.ts), over pictures drawn here pixel by
 * pixel: each kind of logo a small business has, and what the owner is told about it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { logoLayout, logoDrawRect, LOGO_PAD, LOGO_PLATE_DARK, LOGO_PLATE_LIGHT } from "@chanlytics/contracts";

/** A picture of `w` by `h`, every pixel `ground` ([r, g, b, a]), then each box painted in its colour. */
function picture(w, h, ground, boxes = []) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(ground, i * 4);
  for (const { x, y, bw, bh, rgba } of boxes)
    for (let yy = y; yy < y + bh; yy++) for (let xx = x; xx < x + bw; xx++) data.set(rgba, (yy * w + xx) * 4);
  return { data, width: w, height: h };
}

const CLEAR = [0, 0, 0, 0];
const WHITE = [255, 255, 255, 255];
const INK = [30, 30, 40, 255];
const CORAL = [235, 110, 90, 255];

test("a mark on nothing: its empty edges trimmed, contained on the light plate, nothing said", () => {
  const out = logoLayout(picture(200, 200, CLEAR, [{ x: 40, y: 60, bw: 120, bh: 80, rgba: INK }]));
  assert.deepEqual(out, {
    mode: "fit",
    crop: { x: 40, y: 60, w: 120, h: 80 },
    plate: LOGO_PLATE_LIGHT,
    notes: [],
  });
});

test("a white mark on nothing takes the dark plate, so a logo made for a dark header does not vanish", () => {
  const out = logoLayout(picture(200, 200, CLEAR, [{ x: 50, y: 50, bw: 100, bh: 100, rgba: WHITE }]));
  assert.equal(out.mode, "fit");
  assert.equal(out.plate, LOGO_PLATE_DARK);
});

test("a mark on a plain white ground: the ground is trimmed and becomes the plate", () => {
  const out = logoLayout(picture(300, 200, WHITE, [{ x: 100, y: 40, bw: 100, bh: 120, rgba: CORAL }]));
  assert.deepEqual(out, {
    mode: "fit",
    crop: { x: 100, y: 40, w: 100, h: 120 },
    plate: "rgb(255, 255, 255)",
    notes: [],
  });
});

test("a name on a coloured card keeps the card's colour as its plate, so the padding never shows a seam", () => {
  const out = logoLayout(picture(240, 240, CORAL, [{ x: 60, y: 100, bw: 120, bh: 40, rgba: WHITE }]));
  assert.equal(out.mode, "fit");
  assert.equal(out.plate, "rgb(235, 110, 90)");
  assert.deepEqual(out.crop, { x: 60, y: 100, w: 120, h: 40 });
});

test("a ground that is nearly one colour (a JPEG's speckle) is still a ground", () => {
  const px = picture(200, 200, WHITE, [{ x: 70, y: 70, bw: 60, bh: 60, rgba: INK }]);
  // Every tenth edge pixel a shade off white, as a compressed file's are.
  for (let x = 0; x < 200; x += 10) px.data.set([244, 246, 240, 255], x * 4);
  const out = logoLayout(px);
  assert.equal(out.mode, "fit");
  assert.deepEqual(out.crop, { x: 70, y: 70, w: 60, h: 60 });
});

test("a picture to its edges (a photograph, an app icon) fills the square, cropped to its middle", () => {
  const px = picture(300, 200, WHITE);
  // A gradient: no edge colour agrees with the rest.
  for (let y = 0; y < 200; y++)
    for (let x = 0; x < 300; x++) px.data.set([x % 256, (x + y) % 256, y % 256, 255], (y * 300 + x) * 4);
  assert.deepEqual(logoLayout(px), {
    mode: "fill",
    crop: { x: 50, y: 0, w: 200, h: 200 },
    plate: null,
    notes: [],
  });
});

test("a wide wordmark is contained, never cropped, and the owner is told it will look small", () => {
  const out = logoLayout(picture(600, 200, CLEAR, [{ x: 20, y: 80, bw: 560, bh: 40, rgba: INK }]));
  assert.equal(out.mode, "fit");
  assert.deepEqual(out.crop, { x: 20, y: 80, w: 560, h: 40 });
  assert.deepEqual(out.notes, ["wide"]);
});

test("a tiny picture is said to look soft, whichever way it is drawn", () => {
  assert.deepEqual(logoLayout(picture(64, 64, CLEAR, [{ x: 4, y: 4, bw: 56, bh: 56, rgba: INK }])).notes, ["small"]);
  const photo = picture(48, 48, WHITE);
  for (let i = 0; i < 48 * 48; i++) photo.data.set([i % 251, (i * 7) % 253, (i * 13) % 255, 255], i * 4);
  const out = logoLayout(photo);
  assert.equal(out.mode, "fill");
  assert.deepEqual(out.notes, ["small"]);
});

test("a picture with nothing in it, or not a picture at all, is nothing to draw", () => {
  assert.equal(logoLayout(picture(100, 100, CLEAR)), null);
  assert.equal(logoLayout(picture(100, 100, WHITE)), null, "a white square is all ground");
  assert.equal(logoLayout({ data: new Uint8ClampedArray(0), width: 0, height: 0 }), null);
  assert.equal(
    logoLayout({ data: new Uint8ClampedArray(8), width: 10, height: 10 }),
    null,
    "fewer pixels than it says",
  );
});

test("where the drawn part lands: inside the padding, centred, its shape kept; a fill is the whole square", () => {
  const fit = { mode: "fit", crop: { x: 0, y: 0, w: 400, h: 100 }, plate: LOGO_PLATE_LIGHT, notes: [] };
  const room = 256 * (1 - 2 * LOGO_PAD);
  const r = logoDrawRect(fit, 256);
  assert.ok(Math.abs(r.w - room) < 1e-9, "the longer side takes the room inside the padding");
  assert.ok(Math.abs(r.h - room / 4) < 1e-9, "the shorter keeps the picture's shape");
  assert.ok(Math.abs(r.x - (256 - r.w) / 2) < 1e-9 && Math.abs(r.y - (256 - r.h) / 2) < 1e-9, "centred");
  assert.deepEqual(logoDrawRect({ ...fit, mode: "fill", plate: null }, 256), { x: 0, y: 0, w: 256, h: 256 });
});
