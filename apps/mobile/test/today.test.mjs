/** The native Today's own words (src/shell/today-pure.ts) and the page's refresh counted in the shell's state. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sinceWords } from "../src/shell/today-pure.ts";
import { onPageMessage } from "../src/shell/bridge.ts";
import { INITIAL } from "../src/shell/state.ts";

test("a wait is said in minutes, then hours, then days", () => {
  assert.equal(sinceWords(30_000), "1 minute");
  assert.equal(sinceWords(35 * 60_000), "35 minutes");
  assert.equal(sinceWords(2 * 3_600_000), "2 hours");
  assert.equal(sinceWords(26 * 3_600_000), "1 day");
});

test("every refresh of the page's Today ticks the state, so the native Today reads again", () => {
  const snap = { headline: "h", figures: [], waiting: 0, first: null, at: "2026-09-26T10:00:00.000Z" };
  let r = onPageMessage(INITIAL, JSON.stringify({ t: "today", snapshot: snap }));
  assert.equal(r.state.todayTick, 1);
  assert.equal(r.effect, "today");
  r = onPageMessage(r.state, JSON.stringify({ t: "today", snapshot: snap }));
  assert.equal(r.state.todayTick, 2);
});
