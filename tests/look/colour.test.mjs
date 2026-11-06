/**
 * Colour as the look reads and draws it (contracts look/colour.ts, decision 0075): the CSS spellings read, the accent
 * judged, and a colour too light for white words darkened until they read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accentOk,
  contrastOnWhite,
  hexOfRgb,
  isAccentLike,
  parseCssColour,
  readableOnWhite,
} from "@chanlytics/contracts";

test("a CSS colour is read in its common spellings, and nothing else", () => {
  assert.deepEqual(parseCssColour("#C4452E"), [196, 69, 46]);
  assert.deepEqual(parseCssColour("#abc"), [170, 187, 204]);
  assert.deepEqual(parseCssColour("#c4452eff"), [196, 69, 46]);
  assert.deepEqual(parseCssColour("rgb(16, 94, 200)"), [16, 94, 200]);
  assert.deepEqual(parseCssColour("rgba(16 94 200 / 0.5)"), [16, 94, 200]);
  assert.deepEqual(parseCssColour("rgb(50%, 0%, 100%)"), [128, 0, 255]);
  for (const bad of ["red", "#12", "transparent", "url(x)", "inherit", "var(--x)", ""])
    assert.equal(parseCssColour(bad), null, bad);
  assert.equal(hexOfRgb([196, 69, 46]), "#c4452e");
});

test("an accent is a saturated colour that is neither paper nor ink", () => {
  assert.equal(isAccentLike([196, 69, 46]), true);
  for (const flat of [
    [255, 255, 255],
    [0, 0, 0],
    [128, 128, 128],
    [240, 240, 238],
    [20, 20, 24],
  ])
    assert.equal(isAccentLike(flat), false, String(flat));
  assert.equal(accentOk("#c4452e"), true);
  assert.equal(accentOk("#C4452E"), false, "stored lower-case only");
  assert.equal(accentOk("c4452e"), false);
  assert.equal(accentOk(null), false);
});

test("a colour too light for white words is darkened until they read, and one that reads is left alone", () => {
  assert.equal(readableOnWhite("#c4452e"), "#c4452e");
  const pink = readableOnWhite("#ff6f91");
  assert.notEqual(pink, "#ff6f91");
  assert.ok(contrastOnWhite(pink) >= 4.5, `${pink} reads on white`);
  const [r, g, b] = parseCssColour(pink);
  assert.ok(r > g && r > b, "still pink");
  assert.equal(readableOnWhite("not a colour"), "not a colour", "left as it came");
});
