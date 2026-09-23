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
 * Each run times the first words (a `say` or a v1 `delta`) and the final.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… \
 *   E2E_USER_EMAIL=… node tooling/scripts/eval-ask.mjs [tooling/evals/ask-cases.json]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { cardOpenRoute, oneDoor } from "@chanlytics/contracts";

const BASE = process.env.E2E_BASE_URL || "https://chanlytics-os.vercel.app";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const EMAIL = process.env.E2E_USER_EMAIL;
const file = process.argv[2] || "tooling/evals/ask-cases.json";
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;

if (!URL_ || !KEY || !ANON || !EMAIL) {
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

/* ---- one turn, read to the end ---- */
async function ask(cookie, text) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/v1/ask`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: new URL(BASE).origin },
    body: JSON.stringify({ text, thread_id: null, scope: null, surface: "today" }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`ask ${res.status}: ${body.slice(0, 300)}`);
  }
  const events = [];
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let carry = "";
  // When the person first sees words: the first `delta` (a v1 turn) or `say` (a v2 turn), from the request's start.
  let firstMs = null;
  const take = (l) => {
    const e = JSON.parse(l);
    if (firstMs === null && (e.t === "delta" || e.t === "say")) firstMs = Date.now() - t0;
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
    deltas: events.filter((e) => e.t === "delta" || e.t === "say").length,
  };
}

/* ---- the judge ---- */
export function judge(c, r) {
  const fails = [];
  const m = r.final;
  if (!m) return { pass: false, fails: ["no final message"] };
  const e = c.expect ?? {};
  const text = m.text ?? "";
  if (m.failed) fails.push(`turn failed: ${text.slice(0, 120)}`);
  // Context first: the overview reads (Today, the Inbox, the calls) ride into
  // every turn as the snapshot, so a case that named them is satisfied by an
  // answer that needed no read at all.
  const OVERVIEW = ["get_today", "list_threads", "list_calls"];
  const fromSnapshot =
    e.tools_any && e.tools_any.some((t) => OVERVIEW.includes(t)) && !m.tools.some((t) => OVERVIEW.includes(t));
  if (e.tools_any && !fromSnapshot && !e.tools_any.some((t) => m.tools.includes(t)))
    fails.push(`tools ${JSON.stringify(m.tools)} include none of ${e.tools_any.join("/")}`);
  if (m.failed && /daily budget|presupuesto diario/.test(text))
    fails.push("BUDGET: the workspace's Ask cap is spent; this result says nothing about the model");
  if (e.tools_also_any && !e.tools_also_any.some((t) => m.tools.includes(t)))
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
    if (a.form === "structured" && /[.!?]\s+[A-ZÁÉÍÓÚÑ¿¡]/.test(a.say.headline))
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
  }
  return { pass: fails.length === 0, fails };
}

const cases = JSON.parse(readFileSync(file, "utf8")).filter((c) => !ONLY || ONLY.has(c.id));
const session = await mint();
const cookie = cookieHeader(session);
const results = [];
for (const c of cases) {
  let r;
  try {
    r = await ask(cookie, c.text);
  } catch (e) {
    r = { final: null, error: e instanceof Error ? e.message : String(e), ms: 0, firstMs: 0, deltas: 0 };
  }
  const j = r.final ? judge(c, r) : { pass: false, fails: [r.error ?? "no answer"] };
  results.push({
    id: c.id,
    text: c.text,
    answer: r.final?.text ?? null,
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
    final_ms: r.ms,
    deltas: r.deltas,
    threadId: r.threadId ?? null,
    ...j,
  });
  process.stderr.write(
    `${j.pass ? "PASS" : "FAIL"} ${c.id} (${r.ms} ms, ${r.final?.rounds ?? "?"} round(s), tools ${JSON.stringify(r.final?.tools ?? [])}, cards ${JSON.stringify((r.final?.proposals ?? []).map((p) => p.kind))})${j.pass ? "" : "\n     " + j.fails.join("\n     ")}\n`,
  );
}
const passed = results.filter((r) => r.pass).length;
/** The middle and the slowest tenth of a timing, over the cases that answered. */
const spread = (key) => {
  const xs = results
    .map((r) => r[key])
    .filter((n) => typeof n === "number" && n > 0)
    .sort((a, b) => a - b);
  if (!xs.length) return { median: 0, p90: 0 };
  return { median: xs[Math.floor(xs.length / 2)], p90: xs[Math.min(xs.length - 1, Math.ceil(xs.length * 0.9) - 1)] };
};
const first = spread("first_ms");
const whole = spread("final_ms");
const median = spread("latency_ms").median;
const oneRound = results.filter((r) => r.rounds === 1).length;
console.log(
  `\nAsk evals: ${passed}/${results.length} passed · median ${median} ms · one-round ${oneRound}/${results.length}` +
    ` · first words median ${first.median} ms, p90 ${first.p90} ms · final median ${whole.median} ms, p90 ${whole.p90} ms`,
);
for (const r of results)
  console.log(`- ${r.pass ? "ok  " : "FAIL"} ${r.id}: ${(r.answer ?? "").replace(/\s+/g, " ").slice(0, 160)}`);
mkdirSync("tooling/backups", { recursive: true });
const out = `tooling/backups/eval-ask-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(out, JSON.stringify({ base: BASE, file, at: new Date().toISOString(), results }, null, 2));
console.log(`saved ${out}`);
process.exit(passed === results.length ? 0 : 1);
