/**
 * The arithmetic the Ask scripts share (eval-ask.mjs, ask-day.mjs): a spread
 * over a list of timings, and a Wilson interval on a pass rate, so a run of
 * twenty-eight cases says "27 of 28 (95%: 82–99%)" and not "96%". Pure;
 * executed in tooling/scripts/tests/ask/ask-stats.test.mjs.
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
 * The nightly's lines for Ask's day (the Phase 6 plan, D4): alarms, not the spec's targets (a median cache hit of 80%,
 * first words in 2 s), which the day does not meet yet. At fewer answered turns than `minTurns` a median says nothing.
 */
export const ASK_DAY_LINES = { minTurns: 10, cacheHit: 0.5, firstTextMs: 6_000 };

/**
 * The day against its lines, in one sentence (the Phase 6 plan, D4): `ok` false when the median cache hit is under its
 * line or the median first text over its, and then the sentence names the most-given miss reason, where one was said.
 * A median that could not be taken crosses nothing.
 */
export function askDayVerdict({ turns, cacheHit, firstTextMs, misses = [] }, lines = ASK_DAY_LINES) {
  if (turns < lines.minTurns)
    return {
      ok: true,
      line: `Ask's day: ${turns} answered turns, under the ${lines.minTurns} a median needs; nothing judged.`,
    };
  const hit = cacheHit === null ? "no cache hit measured" : `median cache hit ${pct(cacheHit)}`;
  const text = firstTextMs === null ? "no first text measured" : `median first text ${ms(firstTextMs)}`;
  const crossed = [
    ...(cacheHit !== null && cacheHit < lines.cacheHit ? [`${hit}, under ${pct(lines.cacheHit)}`] : []),
    ...(firstTextMs !== null && firstTextMs > lines.firstTextMs ? [`${text}, over ${ms(lines.firstTextMs)}`] : []),
  ];
  if (!crossed.length)
    return {
      ok: true,
      line: `Ask's day holds its lines: ${turns} turns, ${hit} (line ${pct(lines.cacheHit)}), ${text} (line ${ms(lines.firstTextMs)}).`,
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
 * The stream checks over a run's turns that answered (rows with `rounds`, `first_ms`, `stream` and the stored shape's
 * `answer_in`), by how many rounds each took: how many previews, first words, the last preview's wait for the final,
 * and how many streamed (three previews or more); then the jumps, the previews that leaked JSON, the lost line breaks,
 * and how each answer was written (the answer tool's input, text, or none: cards alone or a failure).
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
  };
}
