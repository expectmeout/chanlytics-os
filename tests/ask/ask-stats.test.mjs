/**
 * The arithmetic the Ask scripts share (eval-ask.mjs, ask-day.mjs): a spread
 * over timings and a Wilson interval on a pass rate. Pure; executed here. And
 * which cases eval-ask.mjs keeps for the weekly run, and what it says a run
 * will cost, through the script itself; and what a turn's stored shape keeps
 * for the judge (eval-ask-context.mjs turnShapes), since the context module's
 * own test file is at its length.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT } from "../_source.mjs";
import { spread, wilson, pct, ms, missTally, streamOf, streamSummary } from "../../tooling/scripts/ask-stats.mjs";

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

test("the nightly's verdict on Ask's day (the Phase 6 plan, D4): a forced miss crosses the cache line and names the most-given reason, a slow day crosses the first-Say line, too few turns judge nothing, and a day on its lines holds", async () => {
  const { askDayVerdict, ASK_DAY_LINES } = await import("../../tooling/scripts/ask-stats.mjs");
  assert.deepEqual(ASK_DAY_LINES, { minTurns: 10, cacheHit: 0.5, firstSayMs: 6_000 });
  const missed = askDayVerdict({
    turns: 16,
    cacheHit: 0.04,
    firstSayMs: 3_400,
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
  const slow = askDayVerdict({ turns: 12, cacheHit: 0.8, firstSayMs: 7_250 });
  assert.equal(slow.ok, false);
  assert.equal(slow.line, "Ask's day crossed a line: median first Say 7250 ms, over 6000 ms, over 12 turns.");
  const both = askDayVerdict({ turns: 12, cacheHit: 0.3, firstSayMs: 9_000 });
  assert.match(both.line, /median cache hit 30%, under 50%; median first Say 9000 ms, over 6000 ms/);
  assert.deepEqual(askDayVerdict({ turns: 9, cacheHit: 0, firstSayMs: 60_000 }), {
    ok: true,
    line: "Ask's day: 9 turns a person watched, under the 10 a median needs; nothing judged.",
  });
  const held = askDayVerdict({ turns: 16, cacheHit: 0.5, firstSayMs: 6_000 });
  assert.equal(held.ok, true, "on the line is not over it");
  assert.equal(
    held.line,
    "Ask's day holds its lines: 16 turns, median cache hit 50% (line 50%), median first Say 6000 ms (line 6000 ms).",
  );
  assert.equal(
    askDayVerdict({ turns: 16, cacheHit: null, firstSayMs: null }).ok,
    true,
    "nothing measured crosses nothing",
  );
});

test("a turn nobody watched is no one's wait: the morning's, by its key, or from before the key by what only a morning leaves (no page and no time the palette was open); a spoken turn was listened to", async () => {
  const { watchedTurn } = await import("../../tooling/scripts/ask-stats.mjs");
  assert.equal(watchedTurn({ morning: true, warm: "hit", opened_ms: 900 }), false, "the key decides");
  assert.equal(watchedTurn({ morning: false, warm: "none", opened_ms: null }), true, "the key decides");
  assert.equal(
    watchedTurn({ warm: "none", opened_ms: null, spoken: false }),
    false,
    "stored before the key: a morning",
  );
  assert.equal(
    watchedTurn({ warm: "none", opened_ms: null, spoken: true }),
    true,
    "stored before the key: a voice turn",
  );
  assert.equal(watchedTurn({ warm: "miss", opened_ms: null }), true, "a page came with it");
  assert.equal(watchedTurn({ warm: "none", opened_ms: 1200 }), true, "the palette was open");
});

test("first Say by rounds (ask-day.mjs): one round, two, and three or more, each with its first Say, its final and how long the first Say stood before the final; a band with no turn says none, and a turn with no first Say counts toward its band alone", async () => {
  const { roundBands } = await import("../../tooling/scripts/ask-stats.mjs");
  const bands = roundBands([
    { rounds: 1, first_say_ms: 2_300, final_ms: 3_700 },
    { rounds: 3, first_say_ms: 10_400, final_ms: 10_401 },
    { rounds: 4, first_say_ms: 2_500, final_ms: 12_500 },
    { rounds: 5, first_say_ms: null, final_ms: 9_000 },
  ]);
  assert.deepEqual(
    bands.map((b) => [b.band, b.n]),
    [
      ["1 round", 1],
      ["2 rounds", 0],
      ["3+ rounds", 3],
    ],
  );
  assert.deepEqual(bands[0].say, { n: 1, median: 2_300, p90: 2_300 });
  assert.deepEqual(bands[1].say, { n: 0, median: null, p90: null });
  assert.deepEqual(bands[2].say, { n: 2, median: 10_400, p90: 10_400 });
  assert.equal(bands[2].final.median, 10_401);
  assert.equal(bands[2].held.median, 10_000, "the gap of each turn with a first Say, its median taken");
  assert.equal(bands[1].held.median, null);
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

test("MUST_NEVER=1 asks the must-never cases alone, the weekly run's, and says so when a set holds none", () => {
  const one = (id, must_never) => ({ id, text: id, surface: "today", expect: { no_write: true }, must_never });
  const list = (cases) => {
    const file = path.join(os.tmpdir(), `eval-ask-must-never-${process.pid}.json`);
    writeFileSync(file, JSON.stringify(cases));
    try {
      return spawnSync(process.execPath, ["tooling/scripts/eval-ask.mjs", "--list", file], {
        cwd: ROOT,
        env: { ...process.env, MUST_NEVER: "1" },
        encoding: "utf8",
      });
    } finally {
      rmSync(file, { force: true });
    }
  };
  const run = list([one("a", true), one("b", false), one("c", true)]);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^a · today · must-never$/m);
  assert.match(run.stdout, /^c · today · must-never$/m);
  assert.doesNotMatch(run.stdout, /^b · today/m);
  assert.match(run.stdout, /^2 cases, 2 turns /m);
  const none = list([one("b", false)]);
  assert.equal(none.status, 2);
  assert.match(none.stderr, /no cases match ONLY\/SURFACE\/MUST_NEVER/);
});

test("a turn that ran degraded fails by its stored shape (eval-ask.mjs, once the run has read it): the answer format refused and let go, or an answer written as text while the answer tool stood; a tool's answer, cards alone, no tool offered, a turn from before the keys and no shape at all fail nothing", async () => {
  const { degradedFails } = await import("../../tooling/scripts/ask-stats.mjs");
  const refused = degradedFails({ format: false, answer_tool: true, answer_in: "tool" });
  assert.equal(refused.length, 1);
  assert.match(
    refused[0],
    /format.*refused/,
    "the API refused the format and the loop let it go (ask_format_rejected)",
  );
  const note = degradedFails({ format: true, answer_tool: true, answer_in: "text" });
  assert.equal(note.length, 1);
  assert.match(note[0], /as text while the answer tool stood/, "a note the model wrote to itself");
  assert.equal(degradedFails({ format: false, answer_tool: true, answer_in: "text" }).length, 2, "both, each said");
  assert.deepEqual(degradedFails({ format: true, answer_tool: true, answer_in: "tool" }), []);
  assert.deepEqual(
    degradedFails({ format: true, answer_tool: true, answer_in: null }),
    [],
    "cards alone, or a failure: no answer was written",
  );
  assert.deepEqual(
    degradedFails({ format: true, answer_tool: false, answer_in: "text" }),
    [],
    "no answer tool offered: text is how it answers",
  );
  assert.deepEqual(
    degradedFails({ tokens: { input: 1, output: 1, cache_read: 0, cache_creation: 0 }, answer_in: "text" }),
    [],
    "a turn stored before the keys (D15's format, the answer tool): nothing is known of it",
  );
  assert.deepEqual(degradedFails(null), [], "a shape the run could not read");
});

test("the stream checks count the turns that ran degraded, by the same two rules the judge fails them on: the format refused, a note to itself; a turn with no shape counts toward neither, and a spoken turn, which streams nothing, still counts", () => {
  const row = (shape, stream = { previews: 1, last_to_final_ms: 100, meets: "same", leaks: 0, lines_lost: false }) => ({
    rounds: 1,
    first_ms: 1000,
    stream,
    shape,
  });
  const s = streamSummary([
    row({ format: false, answer_tool: true, answer_in: "tool" }),
    row({ format: false, answer_tool: true, answer_in: "text" }),
    row({ format: true, answer_tool: true, answer_in: "text" }),
    row({ format: true, answer_tool: true, answer_in: "tool" }),
    row({ format: false, answer_tool: true, answer_in: "tool" }, null),
    row(null),
  ]);
  assert.deepEqual(s.degraded, { format: 3, note: 2 });
  assert.deepEqual(s.via, { tool: 2, text: 2, none: 0, unread: 1 }, "the stream's own checks are the streamed turns'");
});

test("a turn's stored shape keeps whether its answer format held and how many rounds hit the cap (SHAPE_FIELDS: format, cap_hits), so a turn that ran degraded can be failed once the run has read it", async () => {
  const { turnShapes } = await import("../../tooling/scripts/eval-ask-context.mjs");
  const id = "7d3b1c2e-5a4f-4b6c-8d9e-0f1a2b3c4d5e";
  const tokens = { input: 6, output: 3446, cache_read: 96529, cache_creation: 24406 };
  const stored = {
    tokens,
    cache_hit: 0.8,
    follow_up: false,
    since_last_ms: null,
    replay: "none",
    answer_tool: true,
    answer_in: "tool",
    format: false,
    cap_hits: 1,
    rounds: 3,
    warm: "hit",
  };
  const rest = async (path) => {
    assert.match(path, /^ask_messages\?id=in\.\(/);
    return [{ id, shape: stored }];
  };
  const { rounds, warm, ...kept } = stored;
  assert.ok(rounds && warm, "the shape holds more than the judge keeps");
  assert.deepEqual((await turnShapes(rest, [id])).get(id), kept);
});

test("--list prices the run at what an eval turn cost, as measured (eval-ask.mjs PER_TURN), never at the spec's target: two turns are $0.30", () => {
  const file = path.join(os.tmpdir(), `eval-ask-per-turn-${process.pid}.json`);
  const one = (id) => ({ id, text: id, surface: "today", expect: { no_write: true } });
  writeFileSync(file, JSON.stringify([one("a"), one("b")]));
  // The runner's own switches, were any set where the suite runs: both cases, once each.
  const env = { ...process.env };
  for (const k of ["MUST_NEVER", "ONLY", "SURFACE", "REPS"]) delete env[k];
  try {
    const run = spawnSync(process.execPath, ["tooling/scripts/eval-ask.mjs", "--list", file], {
      cwd: ROOT,
      env,
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(
      run.stdout,
      /^2 cases, 2 turns × 1 = 2 turns ≈ \$0\.30 at \$0\.15 a turn, as measured \(eval-ask\.mjs PER_TURN\)$/m,
    );
  } finally {
    rmSync(file, { force: true });
  }
});
