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

test("on a coral button the three are the button's own foreground, fading toward the coral, never coral themselves", () => {
  for (const theme of ["light", "dark"]) {
    const p = palette(theme, {}, "accent");
    const onAccent = theme === "light" ? "oklch(0.99 0 0)" : "oklch(0.16 0.005 260)";
    assert.equal(
      labToCss(p.live[0]),
      labToCss(parseColor(onAccent)),
      `${theme}: the first square at work is the glyph colour`,
    );
    const coral = rgb(labToCss(parseColor(theme === "light" ? "oklch(0.62 0.19 25)" : "oklch(0.7 0.18 28)")));
    const dist = (c) => Math.hypot(c[0] - coral[0], c[1] - coral[1], c[2] - coral[2]);
    const steps = [0, 1, 2].map((k) => rgb(colourOf(p, k, 0)));
    assert.ok(
      dist(steps[0]) > dist(steps[1]) && dist(steps[1]) > dist(steps[2]),
      `${theme}: each step nearer the coral`,
    );
    assert.ok(dist(steps[2]) > 40, `${theme}: the last step still reads against the button`);
  }
  // the page's own tokens reach the button's palette too
  const own = palette("light", { accent: "#0000ff", accentFg: "#ffff00" }, "accent");
  assert.deepEqual(rgb(labToCss(own.live[0])), [255, 255, 0]);
});

test("the tokens as the browser reads them back, lab() after the build, are the tokens as tokens.css writes them", () => {
  // Read from the running app, 23 Sep: the build writes every oklch() token as lab(), and getPropertyValue returns that.
  const pairs = [
    ["lab(54.0154% 59.962 36.1222)", "oklch(0.62 0.19 25)"], // light --accent
    ["lab(63.4876% 55.7856 37.0522)", "oklch(0.7 0.18 28)"], // dark --accent
    ["lab(98.84% 0 0)", "oklch(0.99 0 0)"], // light --accent-fg
    ["lab(3.68927% -.135548 -1.17013)", "oklch(0.16 0.005 260)"], // dark --bg and --accent-fg
    ["lab(95.3719% .224799 1.50443)", "oklch(0.96 0.004 80)"], // dark --ink
    ["lab(5.23796% -.285208 -3.0582)", "oklch(0.18 0.01 260)"], // light --ink
  ];
  for (const [read, written] of pairs) {
    const a = rgb(labToCss(parseColor(read)));
    const b = rgb(labToCss(parseColor(written)));
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(a[i] - b[i]) <= 2, `${read} is ${written}: ${a} vs ${b}`);
  }
  // so the palette the page's tokens give is the palette the defaults give
  const fromPage = palette("light", {
    bg: "lab(98.269% .167668 1.12767)",
    ink: "lab(5.23796% -.285208 -3.0582)",
    accent: "lab(54.0154% 59.962 36.1222)",
  });
  assert.deepEqual(rgb(colourOf(fromPage, 1, 1)), rgb(colourOf(palette("light"), 1, 1)));
});

test("mixLab is linear in OKLab", () => {
  const a = parseColor("#000000"),
    b = parseColor("#ffffff");
  const m = mixLab(a, b, 0.5);
  assert.ok(Math.abs(m[0] - 0.5) < 0.01);
});
