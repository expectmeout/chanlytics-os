import { inScope } from "./health-scope.js";
import { modelCallsOf } from "./health-parts.js";
const ASK_SLOW_P95_MS = 3e4;
const ASK_TOOL_SLOW_MS = 1e3;
const TOOL_WORDS = {
  today: "Today",
  "people.search": "Finding people",
  search_people: "Finding people",
  "people.pipeline": "The pipeline",
  "inbox.thread": "A conversation",
  "inbox.search": "Searching the inbox",
  "calendar.week": "The week's calendar",
  signals: "What needs you",
  report: "Reports",
  guide: "How the app works",
  "propose_reply.draft": "Drafting a reply",
  "propose_sequence.batch": "Drafting a sequence"
};
function toolWords(name) {
  return TOOL_WORDS[name] ?? name.replace(/[._]/g, " ");
}
const sideOf = (scope) => scope === "all" ? null : scope === "ours";
const NO_ANSWERS = {
  ours: null,
  answers: 0,
  failed: 0,
  ungrounded: 0,
  latency_p50: null,
  latency_p95: null,
  latency_max: null
};
const NO_TRACES = {
  ours: null,
  traced: 0,
  first_text_p50: null,
  first_text_p95: null,
  context_p50: null,
  context_p95: null,
  first_byte_p50: null,
  first_byte_p95: null,
  rounds_p50: null,
  rounds_p95: null,
  tools_p50: null,
  tools_p95: null,
  final_p50: null,
  final_p95: null,
  one_round: 0,
  two_rounds: 0,
  more_rounds: 0,
  cache_hit: null,
  fast: 0
};
const STAGES = [
  ["context", "Reading the workspace"],
  ["first_byte", "Until the model's first byte"],
  ["rounds", "The model's rounds, all of them"],
  ["tools", "Tools, all of them"],
  ["final", "The whole answer"]
];
function workspacesOf(parts, scope, model) {
  const ws = /* @__PURE__ */ new Map();
  for (const w of model.byWorkspace)
    if (w.askN) ws.set(w.tenantId, { tenantId: w.tenantId, ours: w.ours, answers: 0, rounds: w.askN, usd: w.askUsd });
  for (const r of (parts?.ask_by_workspace ?? []).filter((x) => inScope(x.ours, scope))) {
    const was = ws.get(r.tenant_id) ?? { tenantId: r.tenant_id, ours: r.ours, answers: 0, rounds: 0, usd: 0 };
    ws.set(r.tenant_id, { ...was, answers: r.answers });
  }
  return [...ws.values()].sort((x, y) => y.usd - x.usd || y.answers - x.answers);
}
const askUsdOf = (m) => m.byPurpose.filter((p) => p.purpose === "ask").reduce((n, p) => n + p.usd, 0);
export function healthAskOf(parts, scope) {
  const side = sideOf(scope);
  const a = (parts?.ask ?? []).find((r) => r.ours === side) ?? NO_ANSWERS;
  const t = (parts?.ask_traced ?? []).find((r) => r.ours === side) ?? NO_TRACES;
  const model = modelCallsOf(parts, scope);
  const everyone = modelCallsOf(parts, "all");
  const allUsd = askUsdOf(everyone);
  const oursUsd = everyone.byWorkspace.filter((w) => w.ours).reduce((n, w) => n + w.askUsd, 0);
  return {
    answers: a.answers,
    threads: (parts?.ask_threads ?? []).filter((r) => inScope(r.ours, scope)).reduce((n, r) => n + r.n, 0),
    failed: a.failed,
    ungrounded: a.ungrounded,
    latencyP50: a.latency_p50,
    latencyP95: a.latency_p95,
    latencyMax: a.latency_max,
    traced: t.traced,
    firstTextP50: t.first_text_p50,
    firstTextP95: t.first_text_p95,
    stages: STAGES.map(([key, words]) => ({ key, words, p50: t[`${key}_p50`], p95: t[`${key}_p95`] })),
    rounds: { one: t.one_round, two: t.two_rounds, more: t.more_rounds },
    cacheHit: t.cache_hit,
    fast: t.fast,
    tools: mergeTools(parts, scope),
    failures: (parts?.ask_failures ?? []).filter((f) => inScope(f.ours, scope)).map((f) => ({ atMs: Date.parse(f.at), tenantId: f.tenant_id, ours: f.ours, said: f.said, failure: f.failure })),
    apiFailures: model.failures.filter((f) => f.purpose === "ask").map((f) => ({ atMs: f.atMs, tenantId: f.tenantId, ours: f.ours, reason: f.reason })),
    byWorkspace: workspacesOf(parts, scope, model),
    usd: model.byPurpose.some((p) => p.purpose === "ask") ? askUsdOf(model) : null,
    oursShare: allUsd > 0 ? oursUsd / allUsd : null,
    slow: a.latency_p95 !== null && a.latency_p95 > ASK_SLOW_P95_MS
  };
}
function mergeTools(parts, scope) {
  const by = /* @__PURE__ */ new Map();
  for (const r of (parts?.ask_tools ?? []).filter((x) => inScope(x.ours, scope))) {
    const was = by.get(r.name) ?? { n: 0, total: 0, max: 0 };
    by.set(r.name, {
      n: was.n + r.n,
      total: was.total + Number(r.avg_ms) * r.n,
      max: Math.max(was.max, Number(r.max_ms))
    });
  }
  return [...by.entries()].map(([name, v]) => {
    const avgMs = v.n ? v.total / v.n : 0;
    return { name, words: toolWords(name), n: v.n, avgMs, maxMs: v.max, slow: avgMs > ASK_TOOL_SLOW_MS };
  }).sort((x, y) => y.avgMs - x.avgMs);
}
