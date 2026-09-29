/**
 * A day of Ask, in numbers.
 *
 * Reads the assistant turns of the last HOURS hours (their AskTurnShape, stored
 * on the row by the route since Phase 0) and Ask's usage rows (usage.ask_tokens,
 * one per model round, written by the edge), and prints one line per model and
 * surface: turns, one-round rate, follow-up rate, first Say, first text, final,
 * cache hit, cap hits, how long the palette was open, and the dollars a turn
 * cost at the models' list prices. Read-only; the service role, because a
 * day's turns belong to every member of every workspace.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… [HOURS=24] [TENANT=<uuid>] node tooling/scripts/ops/ask-day.mjs [--json] [--check]
 *
 * --check says last, in one line, whether the day held the nightly's lines (ask-stats.mjs askDayVerdict), and exits 1
 * when it crossed one: the nightly workflow opens an issue with that line. It exits 2, with a last line that says so,
 * when the day could not be read at all (a variable missing, a read refused or thrown): that is not Ask crossing a
 * line, and the nightly titles its issue by which it was (the scorecard's I2:2).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { spread, pct, ms, missTally, askDayVerdict } from "../ask-stats.mjs";

/** The exits the nightly reads: the day held its lines, crossed one, or could not be read. */
const ASK_DAY_EXIT = { held: 0, crossed: 1, could_not_run: 2 };

/** Said last, so the nightly's issue carries it, and the exit that tells it apart from a crossed line. */
function couldNotRun(why) {
  console.log(`\nAsk's day could not be checked: ${why}`);
  process.exit(ASK_DAY_EXIT.could_not_run);
}
process.on("uncaughtException", (e) => couldNotRun(e instanceof Error ? e.message : String(e)));

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HOURS = Math.max(1, Number(process.env.HOURS) || 24);
const TENANT = process.env.TENANT || null;
const JSON_OUT = process.argv.includes("--json");
/** The nightly's check (the Phase 6 plan, D4): the day against its lines, said last, exit 1 when one is crossed. */
const CHECK = process.argv.includes("--check");
if (!URL_ || !KEY) couldNotRun("NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required");

/** Dollars per million tokens: uncached input, output, a five-minute cache write, a cache read (Anthropic's pages, read 23 Sep 2026). */
const PRICE = {
  "claude-sonnet-5": { input: 2, output: 10, cache_creation: 2.5, cache_read: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cache_creation: 5, cache_read: 0.2 },
};
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

async function rest(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`${path.split("?")[0]} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Every row of a query, a thousand at a time (PostgREST's max_rows), at most ten pages. */
async function page(path) {
  const rows = [];
  for (let i = 0; i < 10; i++) {
    const got = await rest(`${path}&limit=1000&offset=${i * 1000}`);
    rows.push(...got);
    if (got.length < 1000) break;
  }
  return rows;
}

const since = new Date(Date.now() - HOURS * 3600 * 1000).toISOString();
const tenantFilter = TENANT ? `&tenant_id=eq.${TENANT}` : "";
/**
 * Every assistant turn in the window and the model that answered it; turns from before Phase 0 carry no shape. The
 * three keys of the row's content read here, each by its JSON path: an answer's content also holds the turn as the
 * model was sent it (content.raw, the Phase 5 plan, D11), which a whole read would download for every turn.
 */
const all = (
  await page(
    `ask_messages?role=eq.assistant&created_at=gte.${encodeURIComponent(since)}${tenantFilter}` +
      `&select=tenant_id,created_at,model:content->model,shape:content->shape,failed:content->failed` +
      `&order=created_at.asc`,
  )
).map((r) => ({
  tenant: r.tenant_id,
  at: r.created_at,
  model: r.model ?? "?",
  shape: r.shape ?? null,
  failed: r.failed === true,
}));
/** The turns that carry a shape: the table's rows. */
const turns = all.filter((t) => t.shape && t.shape.v === 1);
/** Every assistant turn per model, a shape or none: the usage rows priced them all, so a turn's cost divides by all. */
const turnsByModelAll = {};
for (const t of all) turnsByModelAll[t.model] = (turnsByModelAll[t.model] ?? 0) + 1;
const usage = (
  await page(
    `events?kind=eq.usage.ask_tokens&created_at=gte.${encodeURIComponent(since)}${tenantFilter}&select=data&order=created_at.asc`,
  )
)
  .map((r) => r.data ?? {})
  .filter((d) => !d.purpose || d.purpose === "ask");

/** The dollars the window's rounds cost, by model, at list price; null for a model the table does not price. */
const cost = {};
for (const d of usage) {
  const p = PRICE[d.model];
  const m = (cost[d.model ?? "?"] ??= { rounds: 0, dollars: p ? 0 : null });
  m.rounds++;
  if (p)
    m.dollars +=
      (num(d.input_tokens) * p.input +
        num(d.output_tokens) * p.output +
        num(d.cache_creation_input_tokens) * p.cache_creation +
        num(d.cache_read_input_tokens) * p.cache_read) /
      1e6;
}

/** One row of the table: the shapes of a group of turns, summarised. */
function summarise(group) {
  const sh = group.map((t) => t.shape);
  return {
    turns: group.length,
    failed: group.filter((t) => t.failed).length,
    one_round: group.length ? group.filter((t) => t.shape.rounds === 1).length / group.length : null,
    // A second round read what the first did not have: the share the context's breakpoint pays for itself above (D10).
    two_plus: group.length ? group.filter((t) => t.shape.rounds >= 2).length / group.length : null,
    // Of the turns that carried a page, how many found the warm's build kept (D7): the warm and the question met.
    warm_hit: (() => {
      const carried = sh.filter((s) => s.warm === "hit" || s.warm === "miss");
      return carried.length ? carried.filter((s) => s.warm === "hit").length / carried.length : null;
    })(),
    follow_up: group.length ? sh.filter((s) => s.follow_up).length / group.length : null,
    first_say: spread(sh.map((s) => s.first_say_ms)),
    first_text: spread(sh.map((s) => s.first_text_ms)),
    final: spread(sh.map((s) => s.final_ms)),
    cache_hit: spread(sh.map((s) => s.cache_hit)),
    cap_hits: sh.reduce((n, s) => n + num(s.cap_hits), 0),
    opened: spread(sh.map((s) => s.opened_ms)),
    since_last: spread(sh.map((s) => s.since_last_ms)),
    // The Phase 6 plan: why rounds missed the cache (D2), and the first round's hop through the edge (D3).
    misses: missTally(sh),
    hop: spread(sh.map((s) => s.hop_ms)),
  };
}
const key = (t) => `${t.shape.model} · ${t.shape.surface ?? "none"}`;
const groups = {};
for (const t of turns) (groups[key(t)] ??= []).push(t);
const byModel = {};
for (const t of turns) (byModel[t.shape.model] ??= []).push(t);

const line = (name, s, dollars) =>
  `${name.padEnd(34)} ${String(s.turns).padStart(5)} ${String(s.failed).padStart(4)} ` +
  `${(s.one_round === null ? "—" : pct(s.one_round)).padStart(5)} ${(s.follow_up === null ? "—" : pct(s.follow_up)).padStart(5)} ` +
  `${ms(s.first_say.median).padStart(9)} ${ms(s.first_say.p90).padStart(9)} ${ms(s.first_text.median).padStart(9)} ` +
  `${ms(s.final.median).padStart(9)} ${ms(s.final.p90).padStart(9)} ${(s.cache_hit.median === null ? "—" : pct(s.cache_hit.median)).padStart(6)} ` +
  `${String(s.cap_hits).padStart(4)} ${ms(s.opened.median).padStart(9)} ${(s.two_plus === null ? "—" : pct(s.two_plus)).padStart(5)} ${(s.warm_hit === null ? "—" : pct(s.warm_hit)).padStart(5)} ${(dollars === undefined ? "" : dollars === null ? "unpriced" : `$${dollars.toFixed(3)}`).padStart(9)}`;

console.log(
  `Ask, the last ${HOURS} h${TENANT ? ` in ${TENANT}` : ""}: ${turns.length} turns with a shape, ${all.length - turns.length} without a shape, ${usage.length} usage rows\n`,
);
console.log(
  `${"model · surface".padEnd(34)} ${"turns".padStart(5)} ${"fail".padStart(4)} ${"1-rd".padStart(5)} ${"f-up".padStart(5)} ` +
    `${"say med".padStart(9)} ${"say p90".padStart(9)} ${"text med".padStart(9)} ${"final med".padStart(9)} ${"final p90".padStart(9)} ` +
    `${"cache".padStart(6)} ${"caps".padStart(4)} ${"open med".padStart(9)} ${"2+rd".padStart(5)} ${"warm".padStart(5)} ${"$/turn".padStart(9)}`,
);
for (const [model, group] of Object.entries(byModel)) {
  const c = cost[model];
  const n = turnsByModelAll[model];
  const perTurn = c && c.dollars !== null && n ? c.dollars / n : c ? null : undefined;
  console.log(line(model, summarise(group), perTurn));
  for (const [k, g] of Object.entries(groups)
    .filter(([k]) => k.startsWith(`${model} · `))
    .sort((a, b) => b[1].length - a[1].length))
    console.log(line(`  ${k.slice(model.length + 3)}`, summarise(g)));
}
const whole = summarise(turns);
console.log(
  `\ncache misses by reason: ${whole.misses.length ? whole.misses.map((m) => `${m.reason} ${m.rounds}`).join(", ") : "none said"}` +
    ` · the hop through the edge, median ${ms(whole.hop.median)}, p90 ${ms(whole.hop.p90)}`,
);
for (const [model, c] of Object.entries(cost))
  if (!byModel[model])
    console.log(
      `${model}: ${c.rounds} usage rows and no turn with a shape (turns from before Phase 0, or another purpose)`,
    );

if (JSON_OUT) {
  mkdirSync("tooling/backups", { recursive: true });
  const out = `tooling/backups/ask-day-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(
    out,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        hours: HOURS,
        tenant: TENANT,
        by_model: Object.fromEntries(Object.entries(byModel).map(([m, g]) => [m, summarise(g)])),
        by_model_surface: Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, summarise(g)])),
        cost,
      },
      null,
      2,
    ),
  );
  console.log(`saved ${out}`);
}

if (CHECK) {
  const verdict = askDayVerdict({
    turns: turns.length,
    cacheHit: whole.cache_hit.median,
    firstTextMs: whole.first_text.median,
    misses: whole.misses,
  });
  console.log(`\n${verdict.line}`);
  if (!verdict.ok) process.exitCode = ASK_DAY_EXIT.crossed;
}
