/**
 * Where Glass's page light drifts (apps/dashboard/src/legacy/styles/components.css, `pg-drift`): on a desk, never on
 * a phone, and never where less motion is asked.
 *
 * The drift moves the three pools' centres, six registered properties every element inherits, on the app's root. So
 * while it runs every element of the page is styled again on every frame, on every page, for as long as the page is
 * open. Measured on production at a phone's size, 5 Oct 2026, nothing touched: the main thread 37% to 79% busy (the
 * more on the page, the more), 6% with the drift stilled, and iPhones were reloading the page under their owners. On
 * a phone the pools now stand where the canvases put them; what is given up is about a pixel of motion a second.
 *
 * Read from the stylesheet's syntax tree (lightningcss, the build's own parser), and asked as a browser asks it: at a
 * width, with a motion preference, which rule for the app's root wins.
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

/** Every rule that sets the app root's animation, in the sheet's order, with the media queries it stands inside. */
function rootAnimations() {
  const found = [];
  const walk = (rules, media) => {
    for (const r of rules) {
      if (r.type === "media") walk(r.value.rules, [...media, r.value.query]);
      else if (r.type === "style" && namesClass(r.value.selectors, "app-root")) {
        for (const d of r.value.declarations?.declarations ?? []) {
          const names = animationNamesOf(d);
          if (names) found.push({ media, names });
        }
      }
    }
  };
  const { warnings } = transform({
    filename: SHEET,
    code: fs.readFileSync(path.join(ROOT, SHEET)),
    errorRecovery: true,
    visitor: {
      StyleSheet(sheet) {
        walk(sheet.rules, []);
      },
    },
  });
  assert.deepEqual(warnings, [], "the stylesheet is read whole");
  return found;
}

const RULES = rootAnimations();
/** Whether the page light drifts in a window: the last rule for the app's root that holds there says. */
const drifts = (env) => {
  const holding = RULES.filter((r) => r.media.every((q) => mediaHolds(q, env)));
  return holding.length > 0 && holding.at(-1).names.includes("pg-drift");
};

test("on a desk the page light drifts, as the canvases' does", () => {
  assert.ok(
    RULES.some((r) => r.names.includes("pg-drift")),
    "the drift is still written for the app's root",
  );
  assert.equal(drifts({ width: 1440, motion: "no-preference" }), true);
  assert.equal(drifts({ width: PHONE_MAX + 1, motion: "no-preference" }), true, "from the first desk width");
});

test("on a phone the page light stands still: the drift styles every element again on every frame, and a phone reloads a page that never rests", () => {
  for (const width of [320, 393, 430, PHONE_MAX]) {
    assert.equal(drifts({ width, motion: "no-preference" }), false, `at ${width}px`);
  }
});

test("where less motion is asked the page light stands still at any width", () => {
  assert.equal(drifts({ width: 1440, motion: "reduce" }), false);
  assert.equal(drifts({ width: 393, motion: "reduce" }), false);
});
