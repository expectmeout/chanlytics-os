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

const DAY_MS = 24 * 3600 * 1000;
/** More rows than any workspace writes in a day; a bound, not a target. */
const ROW_CAP = 2000;

interface UsageRow {
  created_at: string;
  data: Record<string, unknown> | null;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

async function usageRows(db: SupabaseClient<Database>, tenantId: string | null, since: string): Promise<UsageRow[]> {
  let q = db
    .from("events")
    .select("created_at, data")
    .eq("kind", "usage.llm_tokens")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(ROW_CAP);
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as UsageRow[];
}

/**
 * Tokens this workspace's receptionist used in the last 24 hours, in and out.
 * A rolling day, not a calendar day: simpler to reason about at 4 a.m., and
 * the cap it serves is a margin, not an invoice. A failed read counts as
 * zero and says so — a budget must never silence a receptionist by accident.
 */
export async function tokensLast24h(db: SupabaseClient<Database>, tenantId: string): Promise<number> {
  try {
    const rows = await usageRows(db, tenantId, new Date(Date.now() - DAY_MS).toISOString());
    return rows.reduce((sum, r) => sum + num(r.data?.input_tokens) + num(r.data?.output_tokens), 0);
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
  const rows = await usageRows(db, tenantId, new Date(Date.now() - DAY_MS).toISOString());
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
