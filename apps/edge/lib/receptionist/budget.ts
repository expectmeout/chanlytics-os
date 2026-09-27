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
import type { Database } from "../packages/db.js";
import { DAY_MS } from "../packages/contracts.js";
import { MAX_ROWS } from "../paged.js";
import { logger, errField } from "../log.js";

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
 * Bounded at BOTH ends, which is what makes offset paging safe here. `events`
 * is append-only and this reads it while replies are still writing to it, so
 * an open-ended window shifts under the reader: a row inserted between two
 * pages moves every row after it, and the next OFFSET either re-reads rows
 * already counted or steps over rows never counted. Naming the upper end once,
 * before the first page, freezes the set being read -- and a frozen set can be
 * paged in whichever direction is useful.
 *
 * Which is NEWEST-first, and that half is not cosmetic either. Both callers
 * want the recent end: the budget stops as soon as the day's cap is reached,
 * and the summary describes the last 24 hours on a diagnostics page. Paged
 * oldest-first, a summary that stops at its bound describes the OLDEST events
 * of the window -- so a latency spike or a burst of vetoes, which is the whole
 * reason somebody opens that page, is the first thing to fall off it.
 *
 * `id` breaks ties, which offset paging needs and `created_at` alone, not
 * being unique, cannot give.
 */
async function* usagePages(
  db: SupabaseClient<Database>,
  tenantId: string | null,
  since: string,
  cap = ROW_CAP,
): AsyncGenerator<UsageRow[]> {
  const until = new Date().toISOString();
  for (let from = 0; from < cap; from += MAX_ROWS) {
    const size = Math.min(MAX_ROWS, cap - from);
    let q = db
      .from("events")
      .select("created_at, data")
      .eq("kind", "usage.llm_tokens")
      .gte("created_at", since)
      .lte("created_at", until)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
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
  logger().error("usage_read_capped", { tenant: tenantId, cap });
}

async function usageRows(
  db: SupabaseClient<Database>,
  tenantId: string | null,
  since: string,
  cap = ROW_CAP,
): Promise<UsageRow[]> {
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
 * paging stops the moment the answer is yes, and newest-first is what makes
 * that soon. A workspace comfortably UNDER its cap still has its day read out
 * to know so, which is a page per thousand replies -- bounded by ROW_CAP and
 * logged at it, but genuinely more work than the single truncated read this
 * replaced. Summing in the database, over the same events, is what would make
 * it one round trip again, and is the right next change here.
 */
export async function tokensLast24h(
  db: SupabaseClient<Database>,
  tenantId: string,
  stopAt = Number.POSITIVE_INFINITY,
): Promise<number> {
  const L = logger({ tenant: tenantId });
  try {
    let sum = 0;
    for await (const page of usagePages(db, tenantId, new Date(Date.now() - DAY_MS).toISOString())) {
      for (const r of page) sum += num(r.data?.input_tokens) + num(r.data?.output_tokens);
      if (sum >= stopAt) break;
    }
    return sum;
  } catch (e) {
    L.error("budget_read_failed", { error: errField(e) });
    return 0;
  }
}

interface BrainSummary {
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
export async function brainSummary(
  db: SupabaseClient<Database>,
  tenantId: string | null = null,
): Promise<BrainSummary> {
  const rows = await usageRows(db, tenantId, new Date(Date.now() - DAY_MS).toISOString(), SUMMARY_ROW_CAP);
  const withConf = rows.filter((r) => typeof r.data?.confidence === "number");
  const withMs = rows.filter((r) => typeof r.data?.latency_ms === "number");
  const avg = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null;
  return {
    replies: rows.length,
    with_record: rows.filter((r) => typeof r.data?.intent === "string").length,
    avg_confidence: avg(withConf.map((r) => num(r.data?.confidence))),
    avg_latency_ms: withMs.length
      ? Math.round(withMs.reduce((a, r) => a + num(r.data?.latency_ms), 0) / withMs.length)
      : null,
    held_low_confidence: rows.filter((r) => r.data?.held === "low_confidence").length,
    held_veto: rows.filter((r) => r.data?.held === "veto_window").length,
    escalated: rows.filter((r) => r.data?.escalate === true).length,
    tokens_in: rows.reduce((s, r) => s + num(r.data?.input_tokens), 0),
    tokens_out: rows.reduce((s, r) => s + num(r.data?.output_tokens), 0),
  };
}
