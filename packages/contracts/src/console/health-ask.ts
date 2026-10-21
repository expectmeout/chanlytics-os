/**
 * Ask on Health (decision 0068): the owner's assistant as a part of its own. How many answers, how soon the first words
 * came and how long the whole answer took, where that time went (reading the workspace, the model's rounds, the tools),
 * which tools are slow, each failure in both voices (what the owner read, what the API said, kept since 00469), and
 * what each workspace's Ask cost, ours marked. From the trace each answer already keeps (ask_messages' shape) and the
 * usage ledger's rows, never the words anyone asked. Pure.
 */
import { inScope, type HealthScope } from "./health-scope";
import { modelCallsOf, type HealthPartsDto } from "./health-parts";

/** Past this at the 95th percentile, an owner is waiting too long: the tile turns red. */
const ASK_SLOW_P95_MS = 30_000;

/** A tool slower than this on average is worth a look. */
const ASK_TOOL_SLOW_MS = 1_000;

/** Ask's tools in words, where a person would not know the name. */
const TOOL_WORDS: Record<string, string> = {
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
  "propose_sequence.batch": "Drafting a sequence",
};

function toolWords(name: string): string {
  return TOOL_WORDS[name] ?? name.replace(/[._]/g, " ");
}

export interface HealthAskStageVM {
  key: string;
  words: string;
  p50: number | null;
  p95: number | null;
}

export interface HealthAskVM {
  answers: number;
  threads: number;
  failed: number;
  ungrounded: number;
  latencyP50: number | null;
  latencyP95: number | null;
  latencyMax: number | null;
  traced: number;
  firstTextP50: number | null;
  firstTextP95: number | null;
  stages: HealthAskStageVM[];
  rounds: { one: number; two: number; more: number };
  cacheHit: number | null;
  fast: number;
  tools: Array<{ name: string; words: string; n: number; avgMs: number; maxMs: number; slow: boolean }>;
  failures: Array<{ atMs: number; tenantId: string; ours: boolean; said: string; failure: string | null }>;
  /** What the API said of Ask's rounds that got no answer, newest first (00469; none kept before). */
  apiFailures: Array<{ atMs: number; tenantId: string; ours: boolean; reason: string | null }>;
  byWorkspace: Array<{ tenantId: string; ours: boolean; answers: number; rounds: number; usd: number }>;
  /** Ask's cost in the scope; null when no round was counted. */
  usd: number | null;
  /** Our own workspaces' share of every workspace's Ask cost; null with none. */
  oursShare: number | null;
  slow: boolean;
}

/** The side a scope reads in the grouping sets' rows: false, true, or null for every workspace. */
const sideOf = (scope: HealthScope): boolean | null => (scope === "all" ? null : scope === "ours");

type AskRow = HealthPartsDto["ask"][number];
type TracedRow = HealthPartsDto["ask_traced"][number];

/** A side with no answer in the window: nothing counted, nothing timed. */
const NO_ANSWERS: AskRow = {
  ours: null,
  answers: 0,
  failed: 0,
  ungrounded: 0,
  latency_p50: null,
  latency_p95: null,
  latency_max: null,
};
const NO_TRACES: TracedRow = {
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
  fast: 0,
};

/** The stages an answer's time goes to, in its order, with the trace's columns for each. */
const STAGES = [
  ["context", "Reading the workspace"],
  ["first_byte", "Until the model's first byte"],
  ["rounds", "The model's rounds, all of them"],
  ["tools", "Tools, all of them"],
  ["final", "The whole answer"],
] as const;

/** Each workspace's Ask in the scope: its rounds and cost from the ledger, its answers from the trace. */
function workspacesOf(parts: HealthPartsDto | null, scope: HealthScope, model: ReturnType<typeof modelCallsOf>) {
  const ws = new Map<string, { tenantId: string; ours: boolean; answers: number; rounds: number; usd: number }>();
  for (const w of model.byWorkspace)
    if (w.askN) ws.set(w.tenantId, { tenantId: w.tenantId, ours: w.ours, answers: 0, rounds: w.askN, usd: w.askUsd });
  for (const r of (parts?.ask_by_workspace ?? []).filter((x) => inScope(x.ours, scope))) {
    const was = ws.get(r.tenant_id) ?? { tenantId: r.tenant_id, ours: r.ours, answers: 0, rounds: 0, usd: 0 };
    ws.set(r.tenant_id, { ...was, answers: r.answers });
  }
  return [...ws.values()].sort((x, y) => y.usd - x.usd || y.answers - x.answers);
}

const askUsdOf = (m: ReturnType<typeof modelCallsOf>) =>
  m.byPurpose.filter((p) => p.purpose === "ask").reduce((n, p) => n + p.usd, 0);

export function healthAskOf(parts: HealthPartsDto | null, scope: HealthScope): HealthAskVM {
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
    failures: (parts?.ask_failures ?? [])
      .filter((f) => inScope(f.ours, scope))
      .map((f) => ({ atMs: Date.parse(f.at), tenantId: f.tenant_id, ours: f.ours, said: f.said, failure: f.failure })),
    apiFailures: model.failures
      .filter((f) => f.purpose === "ask")
      .map((f) => ({ atMs: f.atMs, tenantId: f.tenantId, ours: f.ours, reason: f.reason })),
    byWorkspace: workspacesOf(parts, scope, model),
    usd: model.byPurpose.some((p) => p.purpose === "ask") ? askUsdOf(model) : null,
    oursShare: allUsd > 0 ? oursUsd / allUsd : null,
    slow: a.latency_p95 !== null && a.latency_p95 > ASK_SLOW_P95_MS,
  };
}

/** The tools in the scope, one line per tool however many sides it ran on, slowest on average first. */
function mergeTools(parts: HealthPartsDto | null, scope: HealthScope): HealthAskVM["tools"] {
  const by = new Map<string, { n: number; total: number; max: number }>();
  for (const r of (parts?.ask_tools ?? []).filter((x) => inScope(x.ours, scope))) {
    const was = by.get(r.name) ?? { n: 0, total: 0, max: 0 };
    by.set(r.name, {
      n: was.n + r.n,
      total: was.total + Number(r.avg_ms) * r.n,
      max: Math.max(was.max, Number(r.max_ms)),
    });
  }
  return [...by.entries()]
    .map(([name, v]) => {
      const avgMs = v.n ? v.total / v.n : 0;
      return { name, words: toolWords(name), n: v.n, avgMs, maxMs: v.max, slow: avgMs > ASK_TOOL_SLOW_MS };
    })
    .sort((x, y) => y.avgMs - x.avgMs);
}
