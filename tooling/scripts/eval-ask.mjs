/**
 * The Ask case set, run against a deployed dashboard as a real member.
 *
 * Each case is one question. The turn runs exactly as it would from the
 * palette: a session minted for E2E_USER_EMAIL (generate_link + verify, as
 * e2e/session.ts does; no password exists), the cookie the app reads, a
 * same-origin POST, the JSON lines read to the end. The judge then checks
 * what the receptionist's harness checks, translated to an assistant: the
 * tools it chose (never a write — there are none, and the text must not
 * claim one), the language, the citations (only rows it read; a person who
 * does not exist gets none), the phrases an answer must or must not carry,
 * and, on an answer made since the Line, what the page draws: a headline of
 * one sentence, no place offered twice after one door, a count shown as a
 * figure or a breakdown, and a breakdown that adds up (the spec's 10.2).
 * Each run times the first words (a `say` or a v1 `delta`) and the final,
 * and reads what the run cost from Ask's own usage rows (usage.ask_tokens,
 * one per model round, written by the edge): the tokens, the dollars per
 * answered turn at the models' list prices, the rounds that stopped at the
 * cap, and which model answered (the model gate, spec 8.3).
 *
 * A case may carry the page it is asked on (`context`, eval-ask-context.mjs): its rows are read through the GETs the
 * page makes, once, before a turn is spent; the page is warmed (POST ask/warm) and rides with the question as the
 * palette sends it, with the scope its route opens. A case without one is asked as before.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… \
 *   E2E_USER_EMAIL=… [REPS=3] [SURFACE=today] [ONLY=id,id] node tooling/scripts/eval-ask.mjs [tooling/evals/ask-cases.json]
 *   [REPS=3] [SURFACE=…] [ONLY=…] node tooling/scripts/eval-ask.mjs --list [tooling/evals/ask-cases.json]
 *
 * REPS runs every case that many times (the gate runs three: spec 5.10). SURFACE keeps one surface's cases. The run
 * says how many turns it is about to spend before it spends one, and stops after three refusals in a row: a key with
 * no credit refuses every turn the same way, and the turns after the third say nothing about the model. `--list`
 * says the same and stops there: every case, its page, the turns and their cost, with nothing read and nothing spent.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { ASK_TOKENS_DAY, cardOpenRoute, oneDoor } from "@chanlytics/contracts";
import { spread, wilson, pct } from "./ask-stats.mjs";
import { usedAny } from "./rename-ask-tools.mjs";
import {
  ROW_SOURCES,
  announcement,
  contextFails,
  describeContext,
  fromContext,
  neededGets,
  pageProblems,
  resolveContext,
} from "./eval-ask-context.mjs";

const BASE = process.env.E2E_BASE_URL || "https://chanlytics-os.vercel.app";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const EMAIL = process.env.E2E_USER_EMAIL;
const LIST = process.argv.includes("--list");
const file = process.argv.slice(2).find((a) => !a.startsWith("--")) || "tooling/evals/ask-cases.json";
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const REPS = Math.max(1, Math.round(Number(process.env.REPS) || 1));
const SURFACE = process.env.SURFACE || null;
/** The baseline cost of one turn (spec §9): what the announcement multiplies before a turn is spent. */
const PER_TURN = 0.012;

if (!LIST && (!URL_ || !KEY || !ANON || !EMAIL)) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY and E2E_USER_EMAIL are required",
  );
  process.exit(2);
}

const WRITE_CLAIMS = [
  /\bI (have )?(sent|changed|updated|closed|snoozed|resolved|archived|invited|paused|deleted)\b/i,
  /\bhe (enviado|cambiado|actualizado|cerrado)\b/i,
  /\bdone[,.!]/i,
];

/* ---- a session, the way the e2e suite mints one ---- */
async function mint() {
  const gen = await fetch(`${URL_}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: KEY, authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ type: "magiclink", email: EMAIL }),
  });
  if (!gen.ok) throw new Error(`could not mint a session link (${gen.status}): ${await gen.text()}`);
  const body = await gen.json();
  const tokenHash = body.hashed_token ?? body.properties?.hashed_token;
  if (!tokenHash) throw new Error("generate_link returned no hashed_token");
  const ver = await fetch(`${URL_}/auth/v1/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON },
    body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
  });
  if (!ver.ok) throw new Error(`could not verify the minted token (${ver.status}): ${await ver.text()}`);
  return ver.json();
}

/** @supabase/ssr's cookie: base64url session with a marker, split in 3180-char chunks. */
function cookieHeader(session) {
  const ref = new URL(URL_).hostname.split(".")[0];
  const key = `sb-${ref}-auth-token`;
  const value =
    "base64-" +
    Buffer.from(JSON.stringify(session), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const MAX = 3180;
  if (value.length <= MAX) return `${key}=${value}`;
  const parts = [];
  for (let i = 0, n = 0; i < value.length; i += MAX, n++) parts.push(`${key}.${n}=${value.slice(i, i + MAX)}`);
  return parts.join("; ");
}

/* ---- the cost: Ask's usage rows, priced as Anthropic's pages list them (spec 8.1, read 23 Sep) ---- */
/** Dollars per million tokens: uncached input, output, a five-minute cache write, a cache read. */
const PRICE = {
  "claude-sonnet-5": { input: 2, output: 10, cache_creation: 2.5, cache_read: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cache_creation: 5, cache_read: 0.2 },
};
const DAY_MS = 24 * 3600 * 1000;
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

async function rest(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`${path.split("?")[0]} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** The one workspace the eval member belongs to: the usage rows are keyed by it. */
async function workspaceOf(userId) {
  const rows = await rest(`memberships?user_id=eq.${userId}&select=tenant_id`);
  if (rows.length !== 1) throw new Error(`${EMAIL} belongs to ${rows.length} workspaces; the usage rows need one`);
  return rows[0].tenant_id;
}

/** Ask's usage rows for the workspace since `since`, oldest first: one per model round, as the edge recorded it. */
async function usageSince(tenantId, since) {
  const rows = await rest(
    `events?tenant_id=eq.${tenantId}&kind=eq.usage.ask_tokens&created_at=gte.${encodeURIComponent(since)}` +
      `&select=data&order=created_at.asc&limit=2000`,
  );
  return rows.map((r) => r.data ?? {}).filter((d) => !d.purpose || d.purpose === "ask");
}

/** What the day's budget counts (ask-gateway.ts askTokensLast24h): uncached input plus output. */
const budgetTokens = (rows) => rows.reduce((s, d) => s + num(d.input_tokens) + num(d.output_tokens), 0);

/**
 * A run's usage by model: the rounds, the tokens by kind, the rounds that stopped at the cap, and the dollars at list
 * price, null for a model the table above does not price. `answered` divides the cost into a per-turn figure.
 */
function summarizeUsage(rows, answered) {
  const byModel = {};
  for (const d of rows) {
    const m = (byModel[d.model ?? "?"] ??= {
      rounds: 0,
      input: 0,
      output: 0,
      cache_read: 0,
      cache_creation: 0,
      cap_hits: 0,
      cost: null,
    });
    m.rounds++;
    m.input += num(d.input_tokens);
    m.output += num(d.output_tokens);
    m.cache_read += num(d.cache_read_input_tokens);
    m.cache_creation += num(d.cache_creation_input_tokens);
    if (d.stop_reason === "max_tokens") m.cap_hits++;
  }
  for (const [model, m] of Object.entries(byModel)) {
    const p = PRICE[model];
    if (p)
      m.cost =
        (m.input * p.input + m.output * p.output + m.cache_creation * p.cache_creation + m.cache_read * p.cache_read) /
        1e6;
  }
  const models = Object.values(byModel);
  const cost = models.every((m) => m.cost !== null) ? models.reduce((s, m) => s + m.cost, 0) : null;
  return {
    byModel,
    rounds: rows.length,
    cost,
    per_turn: cost !== null && answered ? cost / answered : null,
    cap_hits: models.reduce((s, m) => s + m.cap_hits, 0),
    answered,
  };
}

/* ---- the page, then one turn, read to the end ---- */
/** The workspace named on every request, as the client's scoped() names it. */
const scopedUrl = (path, ws) => `${BASE}${path}${path.includes("?") ? "&" : "?"}workspace=${encodeURIComponent(ws)}`;

/** The GETs the cases' pages draw their rows from, each read once: a read that fails stops the run before a turn. */
async function readGets(cookie, ws, keys) {
  const answers = {};
  for (const k of keys) {
    const res = await fetch(scopedUrl(ROW_SOURCES[k].path, ws), { headers: { cookie } });
    if (!res.ok) throw new Error(`GET ${k} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    answers[k] = (await res.json()).data;
  }
  return answers;
}

/** The page, read before the question as the palette reads it on open (POST ask/warm): its time, or its refusal. */
async function warm(cookie, ws, context) {
  const t0 = Date.now();
  const res = await fetch(scopedUrl("/api/v1/ask/warm", ws), {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: new URL(BASE).origin },
    body: JSON.stringify(context),
  });
  return { ok: res.ok, status: res.status, ms: Date.now() - t0 };
}

async function ask(cookie, text, surface, page = null, ws = null) {
  const t0 = Date.now();
  const res = await fetch(ws ? scopedUrl("/api/v1/ask", ws) : `${BASE}/api/v1/ask`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: new URL(BASE).origin },
    body: JSON.stringify({
      text,
      thread_id: null,
      scope: page?.scope ?? null,
      surface,
      ...(page ? { context: page.context } : {}),
    }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`ask ${res.status}: ${body.slice(0, 300)}`);
  }
  const events = [];
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let carry = "";
  // When the person first sees words: the first `delta` (a v1 turn) or `say` (a v2 turn), from the request's start;
  // and when the model first decided anything: the first `trace` (a read or a card starting).
  let firstMs = null;
  let firstTraceMs = null;
  const take = (l) => {
    const e = JSON.parse(l);
    if (firstMs === null && (e.t === "delta" || e.t === "say")) firstMs = Date.now() - t0;
    if (firstTraceMs === null && e.t === "trace") firstTraceMs = Date.now() - t0;
    events.push(e);
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    carry += dec.decode(value, { stream: true });
    const lines = carry.split("\n");
    carry = lines.pop() ?? "";
    for (const l of lines) if (l.trim()) take(l);
  }
  if (carry.trim()) take(carry);
  const final = events.find((e) => e.t === "final");
  const thread = events.find((e) => e.t === "thread");
  const ms = Date.now() - t0;
  return {
    events,
    final: final?.message ?? null,
    threadId: thread?.id ?? null,
    ms,
    // A turn with no words streamed (a card, a failure) shows its words when the final lands.
    firstMs: firstMs ?? ms,
    firstTraceMs,
    deltas: events.filter((e) => e.t === "delta" || e.t === "say").length,
  };
}

/* ---- the judge ---- */
export function judge(c, r) {
  const fails = [];
  // What a reviewer would mark but the gate does not fail: said once, counted in the summary.
  const notes = [];
  const m = r.final;
  if (!m) return { pass: false, fails: ["no final message"], notes };
  const e = c.expect ?? {};
  const text = m.text ?? "";
  if (m.failed) fails.push(`turn failed: ${text.slice(0, 120)}`);
  // The tools by their names today (D13, tooling/evals/tool-names.json): a case, or a turn stored before the rename,
  // that says an old name is judged as its new one, so a baseline from before stays comparable.
  // Context first: an on-page case's page rode with it, so a case the page answers is satisfied by an answer that
  // needed no read at all.
  if (e.tools_any && !fromContext(c, m, r.context) && !usedAny(e.tools_any, m.tools))
    fails.push(`tools ${JSON.stringify(m.tools)} include none of ${e.tools_any.join("/")}`);
  fails.push(...contextFails(c, m, r.context));
  if (m.failed && /daily budget|presupuesto diario/.test(text))
    fails.push("BUDGET: the workspace's Ask cap is spent; this result says nothing about the model");
  if (e.tools_also_any && !usedAny(e.tools_also_any, m.tools))
    fails.push(`tools ${JSON.stringify(m.tools)} include none of ${e.tools_also_any.join("/")}`);
  if (e.language && m.language !== e.language) fails.push(`language ${m.language} ≠ ${e.language}`);
  if (e.no_write && WRITE_CLAIMS.some((re) => re.test(text)))
    fails.push(`the answer claims a write: “${text.slice(0, 120)}”`);
  if (e.includes_any && !e.includes_any.some((s) => text.toLowerCase().includes(s.toLowerCase())))
    fails.push(`answer lacks all of ${e.includes_any.join("/")}`);
  for (const s of e.excludes ?? [])
    if (text.toLowerCase().includes(s.toLowerCase())) fails.push(`answer contains “${s}”`);
  if (e.no_invented_citations && m.citations.some((x) => x.kind !== "page" && !/^[0-9a-f-]{36}$/.test(x.id)))
    fails.push("a citation with an id no tool could have returned");
  const kinds = (m.proposals ?? []).map((p) => p.kind);
  if (e.proposals_any && !e.proposals_any.some((k) => kinds.includes(k)))
    fails.push(`proposals ${JSON.stringify(kinds)} include none of ${e.proposals_any.join("/")}`);
  // Since the Line, the pointer may be the door itself: a row or an Open that opens a thread.
  const doors = m.answer ? [...m.answer.show.items.map((i) => i.source.to), m.answer.do.open?.to] : [];
  if (
    e.proposals_any_or_says &&
    !e.proposals_any_or_says.some((k) => kinds.includes(k)) &&
    !/card|propos|approve|Inbox|thread/i.test(text) &&
    !doors.some((to) => to && /^inbox(\/|$)/.test(to))
  )
    fails.push("neither a card nor a pointer to where to do it");
  if (e.proposals_none && kinds.length) fails.push(`no card expected, got ${JSON.stringify(kinds)}`);
  if (e.navigate_now && !(m.navigate && m.navigate.now && m.navigate.to))
    fails.push(`expected the app to go there; navigate=${JSON.stringify(m.navigate)}`);
  if (
    e.cites_or_says_nothing &&
    m.citations.length === 0 &&
    !/nobody|no one|nothing|none|nadie|nada|ning[uú]n/i.test(text)
  )
    fails.push("no citation and no statement that there was nothing");
  if (m.ungrounded) fails.push("the answer was marked ungrounded (a figure with no read behind it)");
  // The answer as the Line draws it, on every turn made since the Line.
  const a = m.answer;
  if (a && !m.failed) {
    // A message the headline quotes ("Yes! Pick a time here", or the same in single quotes after a space or a
    // colon, which is never an apostrophe) is not a sentence of its own.
    const own = a.say.headline.replace(/“[^”]*”|"[^"]*"|«[^»]*»/g, "…").replace(/(^|[\s:(])'[^']*\s[^']*'/g, "$1…");
    if (a.form === "structured" && /[.!?]\s+[A-ZÁÉÍÓÚÑ¿¡]/.test(own))
      fails.push(`the headline is more than one sentence: “${a.say.headline.slice(0, 120)}”`);
    const cards = m.proposals ?? [];
    const { answer: drawn, cardOpen } = oneDoor(a, cards);
    const offered = [
      ...drawn.show.items.filter((i) => i.source.door).map((i) => i.source.to),
      ...(drawn.do.open ? [drawn.do.open.to] : []),
      ...cards.filter((p) => cardOpen[p.id]).map((p) => cardOpenRoute(p)),
      ...[...drawn.show.figures.map((f) => f.source), drawn.show.breakdown?.source]
        .filter((s) => s && s.door)
        .map((s) => s.to),
    ];
    const twice = offered.filter((to, i) => offered.indexOf(to) !== i);
    if (twice.length) fails.push(`a place offered twice: ${[...new Set(twice)].join(", ")}`);
    if (e.counts && !a.show.figures.length && !a.show.breakdown)
      fails.push("a count shown by no figure and no breakdown");
    const b = a.show.breakdown;
    if (b && b.parts.reduce((s, p) => s + p.value, 0) !== b.total)
      fails.push(`a breakdown whose parts do not add up to ${b.total}`);
    // The whole is said by the breakdown; a figure that says it again is show filled for its own sake (spec 7.7).
    if (b && a.show.figures.some((f) => Number(String(f.value).replace(/[^\d.-]/g, "")) === b.total))
      notes.push(`a figure repeats the breakdown's total (${b.total})`);
  }
  return { pass: fails.length === 0, fails, notes };
}

const cases = JSON.parse(readFileSync(file, "utf8"))
  .map((c) => ({ ...c, surface: c.surface ?? c.context?.surface ?? "today" }))
  .filter((c) => !ONLY || ONLY.has(c.id))
  .filter((c) => !SURFACE || c.surface === SURFACE);
if (!cases.length) {
  console.error("no cases match ONLY/SURFACE");
  process.exit(2);
}
// A page the eval cannot build is said before anything is read or spent.
const unbuildable = pageProblems(cases);
if (unbuildable.length) {
  console.error(`cases whose page cannot be built:\n  ${unbuildable.join("\n  ")}`);
  process.exit(2);
}

if (LIST) {
  for (const c of cases)
    console.log(
      `${c.id} · ${c.surface}${c.must_never ? " · must-never" : ""}${c.context ? ` · ${describeContext(c.context)}` : ""}\n    ${c.text}`,
    );
  process.stdout.write(
    `\n${announcement(cases, REPS, PER_TURN)}Nothing was read or spent: --list only says what a run would do.\n`,
  );
  process.exit(0);
}

const session = await mint();
const cookie = cookieHeader(session);
// The budget before a case is asked: a run that starts near the cap ends in a wall of BUDGET refusals that say
// nothing about the model (ask-gateway.ts refuses at ASK_TOKENS_DAY over the last day).
const tenantId = await workspaceOf(session.user.id);
const usedToday = budgetTokens(await usageSince(tenantId, new Date(Date.now() - DAY_MS).toISOString()));
// The pages' rows, read once through the GETs the pages make; each turn builds its page from them at its own clock.
const answers = await readGets(cookie, tenantId, neededGets(cases));
let drawn;
try {
  drawn = cases
    .filter((c) => c.context)
    .map((c) => `${c.id} ${resolveContext(c.context, answers).context.rows.length}`);
} catch (e) {
  console.error(`a page could not be built from what its GETs answered, so nothing was asked: ${e.message}`);
  process.exit(2);
}
process.stderr.write(
  `Ask's budget today: ${usedToday.toLocaleString("en-US")} of ${ASK_TOKENS_DAY.toLocaleString("en-US")} tokens used before this run\n` +
    announcement(cases, REPS, PER_TURN) +
    (drawn.length ? `The pages' rows as read: ${drawn.join(", ")}\n` : "") +
    `Against ${BASE}. Every turn spends the model key the receptionist answers customers with; the run stops after three refusals in a row.\n`,
);
// A second of clock skew: the first row of a run lands seconds after this, and the previous run's last row can
// still be on its way (the edge writes it after its stream settles), so the window opens no earlier than this.
const startedAt = new Date(Date.now() - 1_000).toISOString();
const results = [];
/** The loop's own refusal sentences (loop.ts refusalText): the key, its credit, the model or the edge, never the case. */
const REFUSED =
  /refused the question|rechazó la pregunta|not connected to a model|no está conectado|could not reach the model|No pude llegar al modelo/;
let refusals = 0;
let stopped = null;
run: for (let rep = 1; rep <= REPS; rep++) {
  for (const c of cases) {
    let r;
    let page = null;
    let warmed = null;
    try {
      // The page as the palette sends it: warmed as the Line opens, then carried with the question.
      page = c.context ? resolveContext(c.context, answers) : null;
      if (page) warmed = await warm(cookie, tenantId, page.context);
      r = await ask(cookie, c.text, c.surface, page, page ? tenantId : null);
    } catch (e) {
      r = {
        final: null,
        error: e instanceof Error ? e.message : String(e),
        ms: 0,
        firstMs: 0,
        firstTraceMs: null,
        deltas: 0,
      };
    }
    r.context = page?.context ?? null;
    const j = r.final ? judge(c, r) : { pass: false, fails: [r.error ?? "no answer"], notes: [] };
    results.push({
      id: c.id,
      rep,
      surface: c.surface,
      must_never: c.must_never === true,
      text: c.text,
      context: r.context,
      warm: warmed,
      answer: r.final?.text ?? null,
      // The whole message, so a review can draw the answer as the Line does (the model gate's blind review).
      message: r.final,
      form: r.final?.answer?.form ?? null,
      shown: r.final?.answer
        ? {
            figures: r.final.answer.show.figures.length,
            items: r.final.answer.show.items.length,
            breakdown: !!r.final.answer.show.breakdown,
            open: r.final.answer.do.open?.to ?? null,
          }
        : null,
      rounds: r.final?.rounds ?? null,
      tools: r.final?.tools ?? [],
      proposals: (r.final?.proposals ?? []).map((p) => ({ kind: p.kind, title: p.title, summary: p.summary })),
      citations: r.final?.citations ?? [],
      language: r.final?.language ?? null,
      latency_ms: r.final?.latencyMs ?? r.ms,
      first_ms: r.firstMs,
      first_trace_ms: r.firstTraceMs,
      final_ms: r.ms,
      deltas: r.deltas,
      threadId: r.threadId ?? null,
      ...j,
    });
    process.stderr.write(
      `${j.pass ? "PASS" : "FAIL"} ${c.id}${REPS > 1 ? ` #${rep}` : ""} (${r.ms} ms, ${r.final?.rounds ?? "?"} round(s), tools ${JSON.stringify(r.final?.tools ?? [])}, cards ${JSON.stringify((r.final?.proposals ?? []).map((p) => p.kind))}${warmed && !warmed.ok ? `, warm refused ${warmed.status}` : ""})${j.pass ? "" : "\n     " + j.fails.join("\n     ")}\n`,
    );
    // A request that threw (a 5xx, the route's rate limit) counts too: it says nothing about the model either.
    const refused = !r.final || (r.final.failed && REFUSED.test(r.final.text ?? ""));
    refusals = refused ? refusals + 1 : 0;
    if (refusals >= 3) {
      stopped = `three refusals in a row at ${c.id} #${rep}: the key, its credit, the model or the route. Nothing after this was asked.`;
      process.stderr.write(`STOP: ${stopped}\n`);
      break run;
    }
  }
}
const passed = results.filter((r) => r.pass).length;
// The timings are the turns that answered: a request that threw records 0 ms, and a zero pulls every median down.
const answered = results.filter((r) => r.message);
const first = spread(answered.map((r) => r.first_ms));
const trace = spread(answered.map((r) => r.first_trace_ms));
const whole = spread(answered.map((r) => r.final_ms));
const median = spread(answered.map((r) => r.latency_ms)).median;
const oneRound = results.filter((r) => r.rounds === 1).length;
const repeats = results.filter((r) => r.notes?.length).length;
// A must-never case passes only when it passed every repetition (pass^k, spec 5.10).
const mustNever = [...new Set(results.filter((r) => r.must_never).map((r) => r.id))];
const mustNeverHeld = mustNever.filter((id) => results.filter((r) => r.id === id).every((r) => r.pass)).length;
// The edge writes a turn's last usage row as its stream settles, a moment after the final lands.
await new Promise((res) => setTimeout(res, 5_000));
const usage = summarizeUsage(await usageSince(tenantId, startedAt), results.filter((r) => r.message).length);
const reported = results.reduce((s, r) => s + (r.rounds ?? 0), 0);
const dollars = (n) => (n === null ? "unpriced" : `$${n.toFixed(n < 1 ? 3 : 2)}`);
const interval = (k, n) => {
  const [lo, hi] = wilson(k, n);
  return `${k}/${n} (95%: ${pct(lo)}–${pct(hi)})`;
};
console.log(
  `\nAsk evals: ${interval(passed, results.length)} passed over ${REPS} rep(s) · median ${median} ms · one-round ${oneRound}/${results.length}` +
    ` · first trace median ${trace.median ?? "—"} ms · first words median ${first.median} ms, p90 ${first.p90} ms · final median ${whole.median} ms, p90 ${whole.p90} ms` +
    `\n  must-never: ${mustNeverHeld}/${mustNever.length} cases held on every rep` +
    `\n  model ${Object.keys(usage.byModel).join("+") || "?"} · ${dollars(usage.per_turn)} per answered turn` +
    ` (${dollars(usage.cost)} the run, ${usage.rounds} rounds recorded of ${reported} reported)` +
    ` · at the cap ${usage.cap_hits} · repeats ${repeats}${stopped ? `\n  STOPPED: ${stopped}` : ""}`,
);
const surfaces = [...new Set(results.map((r) => r.surface))];
for (const s of surfaces) {
  const rs = results.filter((r) => r.surface === s);
  const f = spread(rs.filter((r) => r.message).map((r) => r.first_ms));
  const w = spread(rs.filter((r) => r.message).map((r) => r.final_ms));
  console.log(
    `  ${s}: ${interval(rs.filter((r) => r.pass).length, rs.length)} · one-round ${rs.filter((r) => r.rounds === 1).length}/${rs.length}` +
      ` · first words ${f.median} ms (p90 ${f.p90}) · final ${w.median} ms (p90 ${w.p90})`,
  );
}
for (const [model, m] of Object.entries(usage.byModel))
  console.log(
    `  ${model}: ${m.rounds} rounds · input ${m.input.toLocaleString("en-US")} · output ${m.output.toLocaleString("en-US")}` +
      ` · cache read ${m.cache_read.toLocaleString("en-US")} · cache write ${m.cache_creation.toLocaleString("en-US")}` +
      ` · ${dollars(m.cost)}`,
  );
for (const r of results)
  console.log(
    `- ${r.pass ? "ok  " : "FAIL"} ${r.id}${REPS > 1 ? ` #${r.rep}` : ""}: ${(r.answer ?? "").replace(/\s+/g, " ").slice(0, 160)}` +
      (r.notes?.length ? `\n       note: ${r.notes.join("; ")}` : ""),
  );
mkdirSync("tooling/backups", { recursive: true });
const out = `tooling/backups/eval-ask-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(
  out,
  JSON.stringify(
    {
      base: BASE,
      file,
      reps: REPS,
      stopped,
      at: new Date().toISOString(),
      used_today_before: usedToday,
      usage,
      results,
    },
    null,
    2,
  ),
);
console.log(`saved ${out}`);
process.exit(passed === results.length && !stopped ? 0 : 1);
