/**
 * The arithmetic the Ask scripts share (eval-ask.mjs, ask-day.mjs): a spread
 * over timings and a Wilson interval on a pass rate. Pure; executed here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spread, wilson, pct, ms, missTally, streamOf, streamSummary } from "../../ask-stats.mjs";

test("the stats: a spread is the median and the slowest tenth over the numbers that exist; a Wilson interval brackets a pass rate and never leaves 0..1", () => {
  assert.deepEqual(spread([5, 1, 3, null, undefined, NaN]), { n: 3, median: 3, p90: 5 });
  assert.deepEqual(spread([]), { n: 0, median: null, p90: null });
  const [lo, hi] = wilson(27, 28);
  assert.ok(lo > 0.8 && lo < 0.9 && hi > 0.99 && hi <= 1, `27 of 28 is about 82–99%, got ${lo}–${hi}`);
  assert.deepEqual(wilson(0, 0), [0, 0]);
  assert.deepEqual(
    wilson(3, 3).map((x) => x <= 1 && x >= 0),
    [true, true],
  );
  assert.equal(pct(0.964), "96%");
  assert.deepEqual([ms(1234.4), ms(null)], ["1234 ms", "—"]);
});

test("why rounds missed the cache (the Phase 6 plan, D2): each reason the API gave, counted by round, the most first; a round that said nothing, and a turn from before, are not counted", () => {
  assert.deepEqual(
    missTally([
      { cache_miss: [null, "tools_changed"] },
      { cache_miss: ["tools_changed", "pending"] },
      { cache_miss: ["system_changed"] },
      {},
      { cache_miss: null },
    ]),
    [
      { reason: "tools_changed", rounds: 2 },
      { reason: "pending", rounds: 1 },
      { reason: "system_changed", rounds: 1 },
    ],
  );
  assert.deepEqual(missTally([]), []);
});

test("the nightly's verdict on Ask's day (the Phase 6 plan, D4): a forced miss crosses the cache line and names the most-given reason, a slow day crosses the first-text line, too few turns judge nothing, and a day on its lines holds", async () => {
  const { askDayVerdict, ASK_DAY_LINES } = await import("../../ask-stats.mjs");
  assert.deepEqual(ASK_DAY_LINES, { minTurns: 10, cacheHit: 0.5, firstTextMs: 6_000 });
  const missed = askDayVerdict({
    turns: 16,
    cacheHit: 0.04,
    firstTextMs: 3_400,
    misses: [
      { reason: "tools_changed", rounds: 21 },
      { reason: "pending", rounds: 2 },
    ],
  });
  assert.equal(missed.ok, false);
  assert.equal(
    missed.line,
    "Ask's day crossed a line: median cache hit 4%, under 50%, over 16 turns. The most-given cache miss: tools_changed (21 rounds).",
  );
  const slow = askDayVerdict({ turns: 12, cacheHit: 0.8, firstTextMs: 7_250 });
  assert.equal(slow.ok, false);
  assert.equal(slow.line, "Ask's day crossed a line: median first text 7250 ms, over 6000 ms, over 12 turns.");
  const both = askDayVerdict({ turns: 12, cacheHit: 0.3, firstTextMs: 9_000 });
  assert.match(both.line, /median cache hit 30%, under 50%; median first text 9000 ms, over 6000 ms/);
  assert.deepEqual(askDayVerdict({ turns: 9, cacheHit: 0, firstTextMs: 60_000 }), {
    ok: true,
    line: "Ask's day: 9 answered turns, under the 10 a median needs; nothing judged.",
  });
  const held = askDayVerdict({ turns: 16, cacheHit: 0.5, firstTextMs: 6_000 });
  assert.equal(held.ok, true, "on the line is not over it");
  assert.equal(
    held.line,
    "Ask's day holds its lines: 16 turns, median cache hit 50% (line 50%), median first text 6000 ms (line 6000 ms).",
  );
  assert.equal(
    askDayVerdict({ turns: 16, cacheHit: null, firstTextMs: null }).ok,
    true,
    "nothing measured crosses nothing",
  );
});

test("a turn's stream (eval-ask.mjs): the previews it showed, when the first came and how long the last waited, and how the last met the final -- the same, a prefix, or a jump -- with the previews that leaked JSON and the line breaks the final lost", () => {
  const say = (ms, headline, detail = "") => ({ ms, headline, detail });
  const grew = [say(900, "Rosa ask"), say(1000, "Rosa asked about"), say(1100, "Rosa asked about Saturday.")];
  assert.deepEqual(streamOf(grew, 1400, { headline: "Rosa asked about Saturday.", detail: "" }), {
    previews: 3,
    taken_back: 0,
    show_previews: 0,
    first_show_ms: null,
    first_ms: 900,
    last_to_final_ms: 300,
    meets: "same",
    leaks: 0,
    lines_lost: false,
  });
  const cut = streamOf(grew.slice(0, 2), 1400, { headline: "Rosa asked about Saturday.", detail: "" });
  assert.deepEqual([cut.meets, cut.last_to_final_ms], ["prefix", 400], "its last words came with the final");
  const jump = streamOf([say(500, "We open at nine.")], 900, { headline: "Monday 9 to 5.", detail: "" });
  assert.deepEqual(
    [jump.meets, jump.last, jump.final],
    ["jump", "We open at nine.", "Monday 9 to 5."],
    "words the final does not keep",
  );
  const back = streamOf([say(400, "We open at nine."), say(450, ""), say(2000, "Monday 9 to 5.")], 2100, {
    headline: "Monday 9 to 5.",
    detail: "",
  });
  assert.deepEqual([back.previews, back.taken_back, back.meets], [2, 1, "same"], "a Say taken back is no preview");
  const leaked = streamOf([say(100, 'Two threads", "detail'), say(200, "Two threads wait.", "Rosa\\nand Ali")], 300, {
    headline: "Two threads wait.",
    detail: "Rosa and Ali",
  });
  assert.equal(leaked.leaks, 2, "a key's quote and an escape, each a leak");
  const lines = streamOf([say(100, "Three things.", "One\nTwo")], 200, {
    headline: "Three things.",
    detail: "One Two",
  });
  const drew = streamOf(
    [
      { ...say(100, "Two wait."), shown: 0 },
      { ...say(300, "Two wait."), shown: 1 },
      { ...say(500, "Two wait."), shown: 2 },
    ],
    800,
    { headline: "Two wait.", detail: "" },
  );
  assert.deepEqual([drew.show_previews, drew.first_show_ms], [2, 300], "Show drew from its first row on");
  assert.deepEqual([lines.meets, lines.lines_lost], ["same", true], "the same words, the lines collapsed");
  assert.deepEqual(
    streamOf([], 800, { headline: "One card to review.", detail: "" }),
    {
      previews: 0,
      taken_back: 0,
      show_previews: 0,
      first_show_ms: null,
      first_ms: null,
      last_to_final_ms: null,
      meets: null,
      leaks: 0,
      lines_lost: false,
    },
    "a turn that streamed nothing (cards alone): nothing to compare",
  );
});

test("the stream checks over a run: by round count, the previews, first words, the last preview's wait and how many streamed; the jumps, leaks and lost lines; and how each answer was written", () => {
  const row = (rounds, first_ms, previews, tail, answer_in, extra = {}) => ({
    rounds,
    first_ms,
    stream: { previews, last_to_final_ms: tail, meets: "same", leaks: 0, lines_lost: false, ...extra },
    shape: answer_in === undefined ? null : { answer_in },
  });
  const s = streamSummary([
    row(1, 3000, 8, 2000, "text"),
    row(1, 3500, 9, 2400, "tool"),
    row(2, 6000, 1, 300, "text", { meets: "jump" }),
    row(2, 5000, 12, 900, "tool", { leaks: 1 }),
    row(3, 9000, 10, 800, "tool", { lines_lost: true }),
    row(2, 7000, 0, null, null),
    row(1, 2000, 4, 1000, undefined),
    { rounds: null, first_ms: 0, stream: null, shape: null },
  ]);
  assert.deepEqual(s.one, {
    n: 3,
    previews: 8,
    first: { n: 3, median: 3000, p90: 3500 },
    tail: { n: 3, median: 2000, p90: 2400 },
    streamed: 3,
  });
  assert.deepEqual([s.more.n, s.more.previews, s.more.streamed], [4, 10, 2]);
  assert.deepEqual([s.more.first.median, s.more.tail.median], [7000, 800]);
  assert.deepEqual([s.jumps, s.leaks, s.lines_lost, s.show_streamed], [1, 1, 1, 0]);
  assert.deepEqual(s.via, { tool: 3, text: 2, none: 1, unread: 1 }, "a row whose shape was not read is said apart");
});
