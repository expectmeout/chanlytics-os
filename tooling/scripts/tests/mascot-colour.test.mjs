/**
 * The three's colour: the app's tokens parsed as tokens.css writes them, mixed in OKLab, and the step from rest to
 * work that gives up saturation before lightness, so coral cools through grey, not brown.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseColor,
  labToCss,
  palette,
  colourOf,
  mixLab,
} from "../../../apps/dashboard/src/legacy-bridge/mascot/colour.ts";

const rgb = (css) => css.match(/\d+/g).map(Number);

test("parses hex, rgb and oklch, and white comes back white", () => {
  assert.deepEqual(rgb(labToCss(parseColor("#ffffff"))), [255, 255, 255]);
  assert.deepEqual(rgb(labToCss(parseColor("#000"))), [0, 0, 0]);
  assert.deepEqual(rgb(labToCss(parseColor("rgb(226, 73, 71)"))), [226, 73, 71]);
  const coral = rgb(labToCss(parseColor("oklch(0.62 0.19 25)")));
  assert.ok(coral[0] > 200 && coral[1] < 110 && coral[2] < 110, `coral, got ${coral}`);
  assert.equal(parseColor("var(--accent)"), null);
  assert.equal(parseColor(""), null);
});

test("the app palette: ink at rest, the accent at work, three steps each, light and dark", () => {
  const light = palette("light");
  const dark = palette("dark");
  for (const p of [light, dark]) {
    assert.equal(p.rest.length, 3);
    assert.equal(p.live.length, 3);
  }
  // rest fades from ink toward the page: the first step darkest on a light page, lightest on a dark one
  const L = (lab) => lab[0];
  assert.ok(L(light.rest[0]) < L(light.rest[1]) && L(light.rest[1]) < L(light.rest[2]));
  assert.ok(L(dark.rest[0]) > L(dark.rest[1]) && L(dark.rest[1]) > L(dark.rest[2]));
  // the first live step is the accent itself
  assert.equal(labToCss(light.live[0]), labToCss(parseColor("oklch(0.62 0.19 25)")));
  // the page's own tokens win over the defaults
  const own = palette("light", { accent: "#0000ff" });
  assert.deepEqual(rgb(labToCss(own.live[0])), [0, 0, 255]);
});

test("between rest and work the colour loses saturation before lightness", () => {
  const p = palette("light");
  const mid = rgb(colourOf(p, 0, 0.5));
  const chroma = (c) => Math.max(...c) - Math.min(...c);
  const restC = chroma(rgb(colourOf(p, 0, 0)));
  const liveC = chroma(rgb(colourOf(p, 0, 1)));
  assert.ok(chroma(mid) < (restC + liveC) / 2, `halfway is greyer than a straight mix: ${mid}`);
});

test("the shade between two steps mixes their colours", () => {
  const p = palette("light");
  const a = rgb(colourOf(p, 0, 1)),
    b = rgb(colourOf(p, 1, 1)),
    m = rgb(colourOf(p, 0.5, 1));
  for (let i = 0; i < 3; i++) assert.ok(m[i] >= Math.min(a[i], b[i]) - 1 && m[i] <= Math.max(a[i], b[i]) + 1);
  // past the last step is the last step
  assert.deepEqual(rgb(colourOf(p, 2.7, 1)), rgb(colourOf(p, 2, 1)));
});

test("mixLab is linear in OKLab", () => {
  const a = parseColor("#000000"),
    b = parseColor("#ffffff");
  const m = mixLab(a, b, 0.5);
  assert.ok(Math.abs(m[0] - 0.5) < 0.01);
});
