/**
 * What the receptionist has cost, and how it has been doing, from the usage
 * events every reply already writes (usage.llm_tokens).
 *
 * Two readers of one stream, and its one writer. The budget check runs before
 * a reply (and before a reach-out reply's draft) and asks one question: has
 * this workspace used its day's tokens? The database answers it in one sum
 * (llm_tokens_since, 00625). The summary runs on the diagnostics
 * endpoint and describes the last day: how many replies, how sure, how fast,
 * how many held or handed off. recordTokens is the one place a model call's
 * usage is written, so the budget reads every token the receptionist spent.
 *
 * Cross-workspace: only getBrainSummary with no workspace reads every workspace, for the platform's /api/diag.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent } from "@chanlytics/db/events";
import type { Database } from "@chanlytics/db/types";
import { DAY_MS, DbFailure } from "@chanlytics/contracts";
import { MAX_ROWS } from "../shared/paged.js";
import { logger, errField } from "../shared/log.js";
import { finiteOrZero } from "@chanlytics/contracts";
import { findLlmTokensSince, pageLlmUsage } from "@chanlytics/db/ai";
import type { TenantId } from "@chanlytics/contracts";

/**
 * One model call's usage (usage.llm_tokens), on the conversation it answered: tokens in and out, and the quality
 * signal beside them. The receptionist's answers (whatsapp/persist.ts) and a reach-out reply's draft
 * (campaigns/reach-out/reply-draft.ts) both write through here. A write that fails throws; each caller says what that costs.
 */
export async function recordTokens(
  db: SupabaseClient<Database>,
  tenantId: TenantId,
  conversationId: string,
  usage: Record<string, unknown>,
): Promise<void> {
  await emitEvent(db, tenantId, "usage.llm_tokens", "conversation", conversationId, usage);
}

/**
 * The summary's bound. It runs on /api/diag and describes a day rather than
 * enforcing anything, so it is not worth twenty sequential thousand-row reads
 * of a partitioned table -- the page most likely to be opened under load is the
 * one that must not time out under it.
 */
const SUMMARY_ROW_CAP = 5_000;

interface UsageRow {
  created_at: string;
  data: Record<string, unknown> | null;
}

/**
 * The day's usage events, a page at a time, newest first: what the summary
 * describes. A part will do there: at its bound it describes the newest of the
 * day, and says it stopped (`usage_read_capped`).
 *
 * The budget read these too, once, as one query with `.limit(2000)` — which
 * PostgREST answered with 1000 and no complaint (`api.max_rows`). So its sum
 * stopped growing at whatever a thousand events came to, and the daily token
 * cap stopped binding on exactly the busy workspaces it exists for. The budget
 * now asks the database for the sum (getTokensLast24h).
 *
 * Bounded at BOTH ends, which is what makes offset paging safe here. `events`
 * is append-only and this reads it while replies are still writing to it, so
 * an open-ended window shifts under the reader: a row inserted between two
 * pages moves every row after it, and the next OFFSET either re-reads rows
 * already counted or steps over rows never counted. Naming the upper end once,
 * before the first page, freezes the set being read -- and a frozen set can be
 * paged in whichever direction is useful.
 *
 * Which is NEWEST-first, and that half is not cosmetic either. The summary
 * describes the last 24 hours on a diagnostics page. Paged oldest-first, a
 * summary that stops at its bound describes the OLDEST events of the window --
 * so a latency spike or a burst of vetoes, which is the whole reason somebody
 * opens that page, is the first thing to fall off it.
 *
 * `id` breaks ties, which offset paging needs and `created_at` alone, not
 * being unique, cannot give.
 */
async function* usagePages(
  db: SupabaseClient<Database>,
  tenantId: TenantId | null,
  since: string,
  cap: number,
): AsyncGenerator<UsageRow[]> {
  const until = new Date().toISOString();
  for (let from = 0; from < cap; from += MAX_ROWS) {
    const size = Math.min(MAX_ROWS, cap - from);
    const { data, error } = await pageLlmUsage(db, { tenantId, since, until, from, to: from + size - 1 });
    if (error) throw new DbFailure(error);
    const rows = (data ?? []) as UsageRow[];
    if (rows.length) yield rows;
    if (rows.length < size) return;
  }
  // Reached only by exhausting the bound. Silence here is the defect this file
  // was fixed for, one cap further out.
  logger().error("usage_read_capped", { tenant_id: tenantId, cap });
}

async function usageRows(
  db: SupabaseClient<Database>,
  tenantId: TenantId | null,
  since: string,
  cap: number,
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
 * One statement, however busy the day (llm_tokens_since, 00625). It paged the
 * day's events to the edge and added them here, a round trip per thousand
 * replies before every automatic reply, and stopped early only once the cap
 * was reached; a workspace comfortably under its cap had its whole day read
 * to know so. One statement also reads one snapshot, so a reply written while
 * it adds is the next read's, never counted twice.
 */
export async function getTokensLast24h(db: SupabaseClient<Database>, tenantId: TenantId): Promise<number> {
  const log = logger({ tenant_id: tenantId });
  try {
    // Without a workspace there is no day to count: a budget for none is an error, which counts zero.
    if (!tenantId) throw new Error("getTokensLast24h: a workspace is required");
    const { data, error } = await findLlmTokensSince(db, tenantId, new Date(Date.now() - DAY_MS).toISOString());
    if (error) throw new DbFailure(error, "llm_tokens_since");
    return finiteOrZero(Number(data));
  } catch (e) {
    log.error("budget_read_failed", { error: errField(e) });
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
export async function getBrainSummary(
  db: SupabaseClient<Database>,
  tenantId: TenantId | null = null,
): Promise<BrainSummary> {
  const rows = await usageRows(db, tenantId, new Date(Date.now() - DAY_MS).toISOString(), SUMMARY_ROW_CAP);
  const withConf = rows.filter((r) => typeof r.data?.confidence === "number");
  const withMs = rows.filter((r) => typeof r.data?.latency_ms === "number");
  const avg = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null;
  return {
    replies: rows.length,
    with_record: rows.filter((r) => typeof r.data?.intent === "string").length,
    avg_confidence: avg(withConf.map((r) => finiteOrZero(r.data?.confidence))),
    avg_latency_ms: withMs.length
      ? Math.round(withMs.reduce((a, r) => a + finiteOrZero(r.data?.latency_ms), 0) / withMs.length)
      : null,
    held_low_confidence: rows.filter((r) => r.data?.held === "low_confidence").length,
    held_veto: rows.filter((r) => r.data?.held === "veto_window").length,
    escalated: rows.filter((r) => r.data?.escalate === true).length,
    tokens_in: rows.reduce((s, r) => s + finiteOrZero(r.data?.input_tokens), 0),
    tokens_out: rows.reduce((s, r) => s + finiteOrZero(r.data?.output_tokens), 0),
  };
}
