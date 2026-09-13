/**
 * What the receptionist has cost, and how it has been doing, from the usage
 * events every reply already writes (usage.llm_tokens).
 *
 * Two readers of one stream. The budget check runs before a reply and asks
 * one question: has this workspace used its day's tokens? The summary runs
 * on the diagnostics endpoint and describes the last day: how many replies,
 * how sure, how fast, how many held or handed off. Neither writes anything.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./workspace/db.js";
import { MAX_ROWS } from "./paged.js";

const DAY_MS = 24 * 3600 * 1000;
/** More rows than any workspace writes in a day; a bound, not a target. */
const ROW_CAP = 20_000;
/**
 * The summary's own, smaller bound. It runs on /api/diag and describes a day
 * rather than enforcing anything, so it is not worth twenty sequential
 * thousand-row reads of a partitioned table -- the page most likely to be
 * opened under load is the one that must not time out under it.
 */
const SUMMARY_ROW_CAP = 5_000;

interface UsageRow {
  created_at: string;
  data: Record<string, unknown> | null;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * The day's usage events, a page at a time, newest first.
 *
 * This was one query with `.limit(ROW_CAP)` and ROW_CAP was 2000 — which
 * PostgREST answered with 1000 and no complaint (`api.max_rows`). So the sum
 * below stopped growing at whatever a thousand events came to, and the daily
 * token cap it serves stopped binding on exactly the busy workspaces it exists
 * for: past a thousand replies a day, `max_llm_tokens_day` could not be
 * reached however much the workspace spent.
 *
 * Ordered by `created_at` AND `id`, ASCENDING. Both halves matter, and the
 * direction is the subtle one: `events` is append-only and this reads it while
 * replies are still writing to it, so with newest-first every row inserted
 * between two pages shifts the whole window down by one and the next OFFSET
 * re-reads rows already counted -- a sum that grows with how busy the
 * workspace is while being read, tripping the very cap it feeds. Oldest-first,
 * new rows land past the end and the offsets already read do not move. The
 * unique tiebreak then settles equal timestamps, which offset paging also
 * needs and which `created_at` alone cannot give.
 */
async function* usagePages(db: SupabaseClient<Database>, tenantId: string | null, since: string, cap = ROW_CAP): AsyncGenerator<UsageRow[]> {
  for (let from = 0; from < cap; from += MAX_ROWS) {
    const size = Math.min(MAX_ROWS, cap - from);
    let q = db
      .from("events")
      .select("created_at, data")
      .eq("kind", "usage.llm_tokens")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + size - 1);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as UsageRow[];
    if (rows.length) yield rows;
    if (rows.length < size) return;
  }
  // Reached only by exhausting the bound. Silence here is the defect this file
  // was fixed for, one cap further out.
  console.error(JSON.stringify({ level: "error", event: "usage_read_capped", tenant: tenantId, cap }));
}

async function usageRows(db: SupabaseClient<Database>, tenantId: string | null, since: string, cap = ROW_CAP): Promise<UsageRow[]> {
  const all: UsageRow[] = [];
  for await (const page of usagePages(db, tenantId, since, cap)) all.push(...page);
  return all;
}

/**
 * Tokens this workspace's receptionist used in the last 24 hours, in and out.
 * A rolling day, not a calendar day: simpler to reason about at 4 a.m., and
 * the cap it serves is a margin, not an invoice. A failed read counts as
 * zero and says so — a budget must never silence a receptionist by accident.
 *
 * `stopAt` is the caller's cap, and it is what keeps this one round trip on
 * the workspaces that fit in a page while still being right on the ones that
 * do not: the only question asked is "is the day's budget used up", so the
 * paging stops the moment the answer is yes. Left out, the whole day is read.
 */
export async function tokensLast24h(db: SupabaseClient<Database>, tenantId: string, stopAt = Number.POSITIVE_INFINITY): Promise<number> {
  try {
    let sum = 0;
    for await (const page of usagePages(db, tenantId, new Date(Date.now() - DAY_MS).toISOString())) {
      for (const r of page) sum += num(r.data?.input_tokens) + num(r.data?.output_tokens);
      if (sum >= stopAt) break;
    }
    return sum;
  } catch (e) {
    console.error("budget_read_failed", e instanceof Error ? e.message : e);
    return 0;
  }
}

export interface BrainSummary {
  replies: number;
  with_record: number;
  avg_confidence: number | null;
  avg_latency_ms: number | null;
  held_low_confidence: number;
  held_veto: number;
  escalated: number;
  tokens_in: number;
  tokens_out: number;
}

/** The last 24 hours across the platform (or one workspace when named). */
export async function brainSummary(db: SupabaseClient<Database>, tenantId: string | null = null): Promise<BrainSummary> {
  const rows = await usageRows(db, tenantId, new Date(Date.now() - DAY_MS).toISOString(), SUMMARY_ROW_CAP);
  const withConf = rows.filter((r) => typeof r.data?.confidence === "number");
  const withMs = rows.filter((r) => typeof r.data?.latency_ms === "number");
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
  return {
    replies: rows.length,
    with_record: rows.filter((r) => typeof r.data?.intent === "string").length,
    avg_confidence: avg(withConf.map((r) => num(r.data?.confidence))),
    avg_latency_ms: withMs.length ? Math.round(withMs.reduce((a, r) => a + num(r.data?.latency_ms), 0) / withMs.length) : null,
    held_low_confidence: rows.filter((r) => r.data?.held === "low_confidence").length,
    held_veto: rows.filter((r) => r.data?.held === "veto_window").length,
    escalated: rows.filter((r) => r.data?.escalate === true).length,
    tokens_in: rows.reduce((s, r) => s + num(r.data?.input_tokens), 0),
    tokens_out: rows.reduce((s, r) => s + num(r.data?.output_tokens), 0),
  };
}
