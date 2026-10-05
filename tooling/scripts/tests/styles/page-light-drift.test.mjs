/**
 * Where Glass's page light drifts (apps/dashboard/src/legacy/styles/components.css, `.pg-light` and `pg-pool-*`): on a
 * desk, by layers moved by a transform; never on a phone, and never where less motion is asked.
 *
 * The drift moved the three pools' centres, six registered properties every element inherits, on the app's root. So
 * while it ran every element of the page was styled again on every frame, on every page, for as long as the page was
 * open. Measured on production at a phone's size, 5 Oct 2026, nothing touched: the main thread 37% to 79% busy (the
 * more on the page, the more), 6% with the drift stilled, and iPhones were reloading the page under their owners; so a
 * phone's pools stand still. On a desk, the same day, at 4x CPU: 3.6 to 4.1 s of long tasks in every 5 s and 15 frames
 * a second, idle; 44 a second unthrottled. Each pool is now a layer of its own, moved by a transform, which the
 * compositor runs: nothing of the page is styled again.
 *
 * Read from the stylesheet's syntax tree (lightningcss, the build's own parser), and asked as a browser asks it: at a
 * width, with a motion preference, which rule wins.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { transform } from "lightningcss";
import { ROOT } from "../_source.mjs";

const SHEET = "apps/dashboard/src/legacy/styles/components.css";
/** The widest window the shell draws as a phone (mobile.css and every `max-width: 900px` block of this sheet). */
const PHONE_MAX = 900;

/** Whether one media feature holds for a window of `env.width` px whose owner asked for `env.motion`. */
function featureHolds(f, env) {
  if (f.name === "prefers-reduced-motion" && f.type === "plain") return f.value.value === env.motion;
  if (f.name === "width" && f.type === "range" && f.value.value.value.unit === "px") {
    const px = f.value.value.value.value;
    if (f.operator === "greater-than-equal") return env.width >= px;
    if (f.operator === "greater-than") return env.width > px;
    if (f.operator === "less-than-equal") return env.width <= px;
    if (f.operator === "less-than") return env.width < px;
  }
  throw new Error(`a media feature this test cannot answer: ${JSON.stringify(f)}`);
}

function conditionHolds(c, env) {
  if (!c) return true;
  if (c.type === "feature") return featureHolds(c.value, env);
  if (c.type === "not") return !conditionHolds(c.value, env);
  if (c.type === "operation") {
    const each = c.conditions.map((x) => conditionHolds(x, env));
    return c.operator === "and" ? each.every(Boolean) : each.some(Boolean);
  }
  throw new Error(`a media condition this test cannot answer: ${JSON.stringify(c)}`);
}

/** A media rule's list holds when any of its queries does; this sheet writes no `not` or `only` before a type. */
const mediaHolds = (query, env) =>
  query.mediaQueries.some((q) => {
    if (q.qualifier) throw new Error(`a media qualifier this test cannot answer: ${q.qualifier}`);
    return conditionHolds(q.condition, env);
  });

const namesClass = (node, name) =>
  Array.isArray(node)
    ? node.some((n) => namesClass(n, name))
    : !!node &&
      typeof node === "object" &&
      ((node.type === "class" && node.name === name) || Object.values(node).some((v) => namesClass(v, name)));

/** The animation names a declaration sets, or null when it sets none. */
function animationNamesOf(d) {
  if (d.property === "animation") return d.value.map((a) => (a.name.type === "none" ? "none" : a.name.value));
  if (d.property === "animation-name") return d.value.map((a) => (a.type === "none" ? "none" : a.value));
  return null;
}

/** Every rule naming `cls` that sets an animation, in the sheet's order, with the media queries it stands inside. */
function animationsOf(sheet, cls) {
  const found = [];
  const walk = (rules, media) => {
    for (const r of rules) {
      if (r.type === "media") walk(r.value.rules, [...media, r.value.query]);
      else if (r.type === "style" && namesClass(r.value.selectors, cls)) {
        for (const d of r.value.declarations?.declarations ?? []) {
          const names = animationNamesOf(d);
          if (names) found.push({ media, names });
        }
      }
    }
  };
  walk(sheet.rules, []);
  return found;
}

/** Every @keyframes of the sheet, by name: the properties each of its frames sets. */
function keyframesOf(sheet) {
  const found = new Map();
  const walk = (rules) => {
    for (const r of rules) {
      if (r.type === "media") walk(r.value.rules);
      else if (r.type === "keyframes") {
        const name = r.value.name.value;
        const props = r.value.keyframes.flatMap((k) =>
          (k.declarations?.declarations ?? []).map((d) => (d.property === "custom" ? `--${d.value.name}` : d.property)),
        );
        found.set(name, props);
      }
    }
  };
  walk(sheet.rules);
  return found;
}

let parsed = null;
const { warnings } = transform({
  filename: SHEET,
  code: fs.readFileSync(path.join(ROOT, SHEET)),
  errorRecovery: true,
  visitor: {
    StyleSheet(sheet) {
      parsed = sheet;
    },
  },
});

/** Whether a rule set animates in a window: the last of them that holds there says, and "none" is still. */
const movesIn = (rules, env) => {
  const holding = rules.filter((r) => r.media.every((q) => mediaHolds(q, env)));
  return holding.length > 0 && holding.at(-1).names.some((n) => n !== "none");
};

test("the sheet is read whole", () => {
  assert.deepEqual(warnings, []);
  assert.ok(parsed, "a stylesheet");
});

test("the app's root never animates, at any width: its light's centres styled every element again on every frame", () => {
  const root = animationsOf(parsed, "app-root");
  for (const width of [320, 393, PHONE_MAX, PHONE_MAX + 1, 1440, 2560]) {
    for (const motion of ["no-preference", "reduce"]) {
      assert.equal(movesIn(root, { width, motion }), false, `the app's root moves at ${width}px, ${motion}`);
    }
  }
});

test("no keyframes move a custom property: one every element inherits styles the page again on every frame", () => {
  for (const [name, props] of keyframesOf(parsed)) {
    assert.deepEqual(
      props.filter((p) => p.startsWith("--")),
      [],
      `@keyframes ${name} moves a custom property`,
    );
  }
});

test("on a desk the pools drift, each on a layer of its own, moved by a transform alone", () => {
  const layers = animationsOf(parsed, "pg-light");
  assert.ok(layers.length > 0, "the light's layers are written to drift");
  assert.equal(movesIn(layers, { width: 1440, motion: "no-preference" }), true);
  assert.equal(movesIn(layers, { width: PHONE_MAX + 1, motion: "no-preference" }), true, "from the first desk width");
  const frames = keyframesOf(parsed);
  const names = new Set(layers.flatMap((r) => r.names).filter((n) => n !== "none"));
  assert.equal(names.size, 3, "three pools, each its own drift");
  for (const n of names)
    assert.deepEqual([...new Set(frames.get(n))], ["transform"], `@keyframes ${n} moves only a transform`);
});

test("on a phone the pools stand still: a phone reloads a page that never rests", () => {
  const layers = animationsOf(parsed, "pg-light");
  for (const width of [320, 393, 430, PHONE_MAX]) {
    assert.equal(movesIn(layers, { width, motion: "no-preference" }), false, `at ${width}px`);
  }
});

test("where less motion is asked the pools stand still at any width", () => {
  const layers = animationsOf(parsed, "pg-light");
  assert.equal(movesIn(layers, { width: 1440, motion: "reduce" }), false);
  assert.equal(movesIn(layers, { width: 393, motion: "reduce" }), false);
});
