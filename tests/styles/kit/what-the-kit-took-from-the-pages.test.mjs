/**
 * The rules the kit took from the frame's, Settings' and AI's stylesheets (lane 8, PR C, 27 Nov 2026), asked of the
 * frame's whole cascade (tests/_css.mjs cascadeOf over frameSheets, globals.css first, then sheets.json in its order):
 * each draws what the page's rule drew, now from kit.css, which loads first, so a later sheet that undid one would be
 * read here. A press gives under the finger; a gated button is dimmed and says so, and says it over busy; a busy one
 * says wait; a busy fold's buttons wait as its boxes do; a sidebar's count is the filled one, amber for people who need
 * you; a quiet row's boxes and remove wait for the row to be approached; AI's line is one line of placeholder, and a
 * phone's 16px; and under reduced motion none of the kit parts the frame used to stop moves.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PHONE, cascadeOf, declared, element, frameSheets } from "../../_css.mjs";

const desk = cascadeOf(frameSheets());
const still = cascadeOf(frameSheets(), { reducedMotion: true });
const phone = cascadeOf(frameSheets(), PHONE);
const at = (where, ...parts) => where.given(element(".app-root", ...parts));

test("a press gives under the finger, a gated button is dimmed over busy, and a busy one says wait", () => {
  assert.equal(
    at(desk, "button.btn:active").transform,
    declared("transform: translateY(0.5px) scale(0.985)").transform,
  );
  const gated = at(desk, "button.btn[data-gated]");
  assert.deepEqual(
    [gated.opacity, gated.cursor],
    [declared("opacity: 0.55").opacity, "not-allowed"],
    "dimmed, and the pointer says no",
  );
  assert.equal(at(desk, 'button.btn[aria-busy="true"]').cursor, "progress", "busy says wait");
  assert.equal(at(desk, 'button.btn[aria-busy="true"][data-gated]').cursor, "not-allowed", "gated says so over busy");
  assert.equal(at(desk, 'button.btn[aria-busy="true"]:disabled').cursor, "default", "disabled keeps its own pointer");
  assert.equal(
    at(desk, '.rec-fold[aria-busy="true"]', "button.btn").cursor,
    "progress",
    "a busy fold's buttons wait as its boxes do",
  );
});

test("a sidebar's count is the kit's filled count, amber where it counts people who need you", () => {
  const count = at(desk, "aside.sidebar", "a.nav-item", "span.nav-count.tally.tally-fill");
  assert.deepEqual(
    [count.background, count.color, count["min-width"]],
    ["var(--count-fill)", "var(--count-ink)", "20px"],
  );
  assert.equal(count["margin-left"], "auto", "at the row's end, the frame's placing");
  const warn = at(desk, "aside.sidebar", "a.nav-item", "span.nav-count.tally.tally-fill.tally-warn");
  assert.deepEqual([warn.background, warn.color], ["var(--warn-soft)", "var(--warn-ink)"]);
});

test("a quiet row's boxes and its remove wait for the row, and a finger sees them drawn", () => {
  const box = at(desk, ".settings", "div.bt-note.rec-quiet", "span.rec-box", "input.rec-input");
  const clear = declared("border-color: transparent; background: transparent");
  assert.deepEqual(
    [box["border-color"], box.background],
    [clear["border-color"], clear.background],
    "at rest, read as text",
  );
  const near = at(desk, ".settings", "div.bt-note.rec-quiet:hover", "span.rec-box", "input.rec-input");
  assert.equal(near["border-color"], "var(--line-strong)", "approached, its edge is drawn");
  assert.equal(at(desk, ".settings", "div.bt-note.rec-quiet", "button.btn.btn-icon").opacity, "0", "its remove waits");
  assert.notEqual(
    at(phone, ".settings", "div.bt-note.rec-quiet", "span.rec-box", "input.rec-input")["border-color"],
    clear["border-color"],
    "a phone hovers nothing, so every edge is drawn",
  );
});

test("REGRESSION: under a finger an icon button is a square, and a phone's wash keeps Safari's bar clear", () => {
  // The hours' sheet's remove stood 28px wide once Settings' own 44px went (the whole browser suite, 27 Nov 2026).
  const touch = at(phone, "html.frame-on", "body", ".rec-fold-sheet", "button.btn.btn-icon.btn-sm");
  assert.deepEqual([touch["min-width"], touch["min-height"]], ["44px", "44px"], "as wide as a finger, and as tall");
  // The drawer's wash lost its filter, and iOS 26 paints a grey band over a filterless one (mobile.css held it).
  const wash = at(phone, "div.sheet-backdrop.nav-wash");
  assert.equal(wash["backdrop-filter"], declared("backdrop-filter: blur(0)")["backdrop-filter"], "the drawer's wash");
  assert.equal(at(phone, "div.sheet-backdrop")["backdrop-filter"], wash["backdrop-filter"], "and every sheet's");
});

test("AI's line is one line of placeholder, and a phone's words are 16px", () => {
  const words = desk.given(element(".app-root", "div.line-box", "textarea.line-field::placeholder"));
  assert.deepEqual([words["white-space"], words["text-overflow"]], ["nowrap", "ellipsis"]);
  assert.equal(at(phone, "div.line-box", "textarea.line-field")["font-size"], "var(--field-text-touch)");
});

test("under reduced motion none of the kit parts the frame used to stop moves", () => {
  assert.equal(at(still, '.rec-row[data-settled="true"]', "span.rec-row-val").animation, "none");
  for (const part of ["div.rec-fold", "div.rec-inline-body", 'span.rec-says-line[data-changed="true"]', "a.stabs-tab"])
    assert.equal(at(still, part).transition, "none", `${part} arrives at once`);
  for (const part of ["div.confirm", "div.confirm-block"]) assert.equal(at(still, part).animation, "none", part);
  assert.equal(at(still, "a.stabs-tab:active").transform, "none");
  assert.match(at(desk, "div.confirm-block").animation, /nudge-in/, "with motion, Confirm's block rises in");
});
