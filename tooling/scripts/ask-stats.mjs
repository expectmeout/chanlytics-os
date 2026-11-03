/**
 * The arithmetic the Ask scripts share (eval-ask.mjs, ask-day.mjs): a spread
 * over a list of timings, and a Wilson interval on a pass rate, so a run of
 * twenty-eight cases says "27 of 28 (95%: 82–99%)" and not "96%"; and the two
 * rules a turn's stored shape fails it on (DEGRADED). Pure; executed in
 * tooling/scripts/tests/ask/ask-stats.test.mjs.
 */

/** The median and the slowest tenth of the numbers that exist in `xs`. */
export function spread(xs) {
  const s = xs.filter((n) => typeof n === "number" && Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return { n: 0, median: null, p90: null };
  return {
    n: s.length,
    median: s[Math.floor(s.length / 2)],
    p90: s[Math.min(s.length - 1, Math.max(0, Math.ceil(s.length * 0.9) - 1))],
  };
}

/** The 95% Wilson score interval on k passes of n, as [low, high] in 0..1; [0, 0] for no trials. */
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}

/**
 * Why the rounds of these turns missed the cache (AskTurnShape.cache_miss, the Phase 6 plan, D2): each reason the API
 * gave and how many rounds gave it, the most first, then by name. Rounds that named no message, or where nothing
 * diverged, say nothing and are not counted; a turn from before Phase 6 has no key.
 */
export function missTally(shapes) {
  const n = new Map();
  for (const s of shapes)
    for (const m of Array.isArray(s?.cache_miss) ? s.cache_miss : [])
      if (typeof m === "string") n.set(m, (n.get(m) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([reason, rounds]) => ({ reason, rounds }));
}

/**
 * Whether a person read this turn as it came. The morning's (AskTurnShape.morning, companion/morning.ts) runs after the
 * response has gone and hears nothing it says, so its first Say is no one's wait: 25 of the 35 turns of the fortnight to
 * 2 Nov 2026. A turn stored before the key is a morning by what only a morning leaves: no page, no time the palette was
 * open, and no voice.
 */
export const watchedTurn = (s) => !(s.morning ?? (s.warm === "none" && s.opened_ms === null && !s.spoken));

/**
 * The turns by how many rounds they took, as ask-day.mjs prints them: each band's first Say, its final, and how long
 * the first Say stood before the final, which is a turn's silence told from its streaming. A turn no Say reached counts
 * toward its band and no spread of the first Say.
 */
export function roundBands(shapes) {
  const band = (name, within) => {
    const rs = shapes.filter((s) => within(s.rounds ?? 0));
    const said = rs.filter((s) => typeof s.first_say_ms === "number");
    return {
      band: name,
      n: rs.length,
      say: spread(said.map((s) => s.first_say_ms)),
      final: spread(rs.map((s) => s.final_ms)),
      held: spread(said.map((s) => s.final_ms - s.first_say_ms)),
    };
  };
  return [band("1 round", (r) => r === 1), band("2 rounds", (r) => r === 2), band("3+ rounds", (r) => r >= 3)];
}

/**
 * The nightly's lines for Ask's day (the Phase 6 plan, D4): alarms, not the spec's targets (a median cache hit of 80%,
 * first words in 2 s), which the day does not meet yet. First Say, not first text: with the answer tool on, a turn writes
 * no text before it answers, so first text was measured on the few answers written as text and read 2.3 s while the
 * person read at 7.7 s. At fewer watched turns than `minTurns` a median says nothing, and in the fortnight to 2 Nov 2026
 * no day had ten: the line judges nothing until a day does.
 */
export const ASK_DAY_LINES = { minTurns: 10, cacheHit: 0.5, firstSayMs: 6_000 };

/**
 * The day against its lines, in one sentence (the Phase 6 plan, D4): `ok` false when the median cache hit is under its
 * line or the median first Say over its, and then the sentence names the most-given miss reason, where one was said.
 * A median that could not be taken crosses nothing.
 */
export function askDayVerdict({ turns, cacheHit, firstSayMs, misses = [] }, lines = ASK_DAY_LINES) {
  if (turns < lines.minTurns)
    return {
      ok: true,
      line: `Ask's day: ${turns} turns a person watched, under the ${lines.minTurns} a median needs; nothing judged.`,
    };
  const hit = cacheHit === null ? "no cache hit measured" : `median cache hit ${pct(cacheHit)}`;
  const say = firstSayMs === null ? "no first Say measured" : `median first Say ${ms(firstSayMs)}`;
  const crossed = [
    ...(cacheHit !== null && cacheHit < lines.cacheHit ? [`${hit}, under ${pct(lines.cacheHit)}`] : []),
    ...(firstSayMs !== null && firstSayMs > lines.firstSayMs ? [`${say}, over ${ms(lines.firstSayMs)}`] : []),
  ];
  if (!crossed.length)
    return {
      ok: true,
      line: `Ask's day holds its lines: ${turns} turns, ${hit} (line ${pct(lines.cacheHit)}), ${say} (line ${ms(lines.firstSayMs)}).`,
    };
  const [top] = misses;
  const why = top ? ` The most-given cache miss: ${top.reason} (${top.rounds} rounds).` : "";
  return { ok: false, line: `Ask's day crossed a line: ${crossed.join("; ")}, over ${turns} turns.${why}` };
}

/** A ratio as a whole percent. */
export const pct = (x) => `${Math.round(x * 100)}%`;

/** A millisecond figure for a table cell; a dash where there is none. */
export const ms = (n) => (typeof n === "number" ? `${Math.round(n)} ms` : "—");

/** A Say as the stream checks compare it: headline and detail, every whitespace run one space (the final's clip). */
const flatSay = (s) => `${s.headline ?? ""}\n${s.detail ?? ""}`.replace(/\s+/g, " ").trim();
/** What a preview should never show: a backslash escape, a key and its colon, a comma between quotes, a brace by one. */
const LEAK = /\\[nrtu"\\/]|\{\s*"|"\s*:|"\s*,\s*"|"\s*\}/;

/**
 * A turn's stream as the person saw it, from every `say` the turn sent with when it came (`says`: { ms, headline,
 * detail, shown }: `shown` the figures and rows its Show held, an empty one a Say taken back) and the final's Say and
 * time: how many previews, how many drew Show and when the first did, when the first came, how
 * long the last waited for the final, how the last met the final -- the same, a prefix of it (the last words came with
 * the final), or a jump (words the final does not keep: the preview showed what the answer took back) -- the previews
 * that showed JSON or an escape, and whether the preview's line breaks were lost when the final landed.
 */
export function streamOf(says, finalMs, finalSay) {
  const shown = says.filter((s) => s.headline || s.detail);
  const last = shown.at(-1) ?? null;
  const was = last ? flatSay(last) : null;
  const fin = finalSay ? flatSay(finalSay) : null;
  const meets = was === null || fin === null ? null : was === fin ? "same" : fin.startsWith(was) ? "prefix" : "jump";
  return {
    previews: shown.length,
    taken_back: says.length - shown.length,
    show_previews: shown.filter((s) => (s.shown ?? 0) > 0).length,
    first_show_ms: shown.find((s) => (s.shown ?? 0) > 0)?.ms ?? null,
    first_ms: shown[0]?.ms ?? null,
    last_to_final_ms: last && typeof finalMs === "number" ? finalMs - last.ms : null,
    meets,
    ...(meets === "jump" ? { last: was, final: fin } : {}),
    leaks: shown.filter((s) => LEAK.test(`${s.headline}\n${s.detail}`)).length,
    lines_lost: !!last && /\n/.test(last.detail ?? "") && !/\n/.test(finalSay?.detail ?? ""),
  };
}

/**
 * The ways a turn can run degraded, read off its stored shape (AskTurnShape, ask_messages.content.shape) once the run
 * has read it, each with the sentence the judge fails the turn with (eval-ask.mjs). `format`: the API refused the
 * answer's format and the loop let it go and asked the round again without it (refusals.ts, D15; the log's
 * ask_format_rejected), so the answer came as prose with nothing red: on 2 November 2026 #2046's chart took the format
 * past the API's limit, every turn ran so for twenty hours, and every eval passed. `note`: the answer was written as
 * text while the answer tool stood, which is a note the model wrote to itself and not the answer (#2051). A turn
 * stored before either key has no `format` and no `answer_tool`, and says nothing; a tool's answer, cards alone
 * (`answer_in` null) and text where no tool was offered are the turn as designed.
 */
const DEGRADED = {
  format: {
    when: (s) => s.format === false,
    fail: "the turn ran without its answer format: the API refused it and the loop let it go (ask_format_rejected)",
  },
  note: {
    when: (s) => s.answer_tool === true && s.answer_in === "text",
    fail: "the answer was written as text while the answer tool stood: a note the model wrote to itself, not the answer",
  },
};

/** What a turn's stored shape fails it for (DEGRADED), each rule's sentence; none for a shape the run could not read. */
export const degradedFails = (shape) =>
  Object.values(DEGRADED)
    .filter((d) => shape && d.when(shape))
    .map((d) => d.fail);

/**
 * The stream checks over a run's turns that answered (rows with `rounds`, `first_ms`, `stream` and the stored shape's
 * `answer_in`), by how many rounds each took: how many previews, first words, the last preview's wait for the final,
 * and how many streamed (three previews or more); then the jumps, the previews that leaked JSON, the lost line breaks,
 * how each answer was written (the answer tool's input, text, or none: cards alone or a failure), and how many turns
 * ran degraded by each of DEGRADED's rules, over every row with a shape, since a spoken turn streams nothing and is
 * failed all the same.
 */
export function streamSummary(rows) {
  const answered = rows.filter((r) => r.stream);
  const band = (rs) => ({
    n: rs.length,
    previews: spread(rs.map((r) => r.stream.previews)).median,
    first: spread(rs.map((r) => r.first_ms)),
    tail: spread(rs.map((r) => r.stream.last_to_final_ms)),
    streamed: rs.filter((r) => r.stream.previews >= 3).length,
  });
  const via = (v) => answered.filter((r) => r.shape && (r.shape.answer_in ?? null) === v).length;
  return {
    one: band(answered.filter((r) => r.rounds === 1)),
    more: band(answered.filter((r) => (r.rounds ?? 0) >= 2)),
    jumps: answered.filter((r) => r.stream.meets === "jump").length,
    leaks: answered.filter((r) => r.stream.leaks > 0).length,
    lines_lost: answered.filter((r) => r.stream.lines_lost).length,
    show_streamed: answered.filter((r) => r.stream.show_previews > 0).length,
    via: { tool: via("tool"), text: via("text"), none: via(null), unread: answered.filter((r) => !r.shape).length },
    degraded: Object.fromEntries(
      Object.entries(DEGRADED).map(([k, d]) => [k, rows.filter((r) => r.shape && d.when(r.shape)).length]),
    ),
  };
}
