/**
 * The usage ledger (00273 ai_usage): the one writer every model call goes through, the reads that gate and alarm on it,
 * and the one that keeps it. A table is typed here and nowhere else.
 *
 *   recordModelUsage      one call's row, as contracts' aiUsageBodyOf priced it, or the rows of one shadow call
 *                         (contracts shadowBodies: one per question, written together). A write that fails throws; the
 *                         model port (apps/edge/lib/model.ts) and the shadow (apps/edge/lib/shadow.ts) log it and keep
 *                         the answer.
 *   workspaceMayUseModels whether a workspace may spend the model key on what a person asks for (contracts
 *                         mayUseModels): not paused, not ended, not unbilled. A read that fails throws.
 *   aiFailuresHour        the workspaces whose model calls or receptionist turns failed at least `min` times in the
 *                         last hour (ai_failures_hour): what the health sweep pages on.
 *   purgeAiUsage          the rows past their keep (ai_usage_purge).
 *   usageMonth            a workspace's month of metered use by meter, purpose and model (ai_usage_month), on the
 *                         caller's client: RLS decides whose rows it sums.
 *
 * And what a row of it names (decision 0039; 00359 model_prompts, model_turns):
 *
 *   keepModelTurn         one receptionist turn as the model read it, and the text of the prompt it read, in one
 *                         write (model_turn_keep). A write that fails throws; the model port logs it and keeps the answer.
 *   scrubModelTurns       an erasure's hand (model_turns_scrub): the workspace's kept turns that name the person.
 *
 * The turns' two clocks are the database's own (purge_model_turns and purge_model_prompts, nightly on one registered
 * job), so nothing here runs them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { mayUseModels, RETENTION_DAYS } from "@chanlytics/contracts";
import type {
  AiUsageBody,
  BillingMode,
  BillingStatus,
  ModelTurnRequest,
  ModelTurnResponse,
} from "@chanlytics/contracts";
import type { Database } from "./database.types";

type Db = SupabaseClient<Database>;

export async function recordModelUsage(db: Db, rows: AiUsageBody | AiUsageBody[]): Promise<void> {
  const { error } = await db.from("ai_usage").insert(rows);
  if (error) throw new Error(`ai_usage: ${error.message}`);
}

export async function workspaceMayUseModels(db: Db, tenantId: string): Promise<boolean> {
  const [tenant, billing] = await Promise.all([
    db.from("tenants").select("status, left_empty_at").eq("id", tenantId).maybeSingle(),
    db.from("billing_accounts").select("mode, status").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (tenant.error) throw new Error(`cannot read the workspace: ${tenant.error.message}`);
  if (billing.error) throw new Error(`cannot read the workspace's billing: ${billing.error.message}`);
  // Every workspace has a billing row since 00073 (the ones before it on `direct`): none is not a yes.
  if (!tenant.data || !billing.data) return false;
  return mayUseModels(billing.data.mode as BillingMode, billing.data.status as BillingStatus, {
    paused: tenant.data.status === "paused",
    ended: !!tenant.data.left_empty_at,
  });
}

export interface AiFailures {
  tenant_id: string;
  failed_calls: number;
  brain_errors: number;
}

export async function aiFailuresHour(db: Db, min: number): Promise<AiFailures[]> {
  const { data, error } = await db.rpc("ai_failures_hour", { p_min: min });
  if (error) throw new Error(`ai_failures_hour: ${error.message}`);
  return (data ?? []).map((r) => ({
    tenant_id: r.tenant_id,
    failed_calls: Number(r.failed_calls) || 0,
    brain_errors: Number(r.brain_errors) || 0,
  }));
}

export async function purgeAiUsage(db: Db): Promise<number> {
  const { data, error } = await db.rpc("ai_usage_purge", { p_keep: `${RETENTION_DAYS.ai_usage} days` });
  if (error) throw new Error(`ai_usage_purge: ${error.message}`);
  return Number(data) || 0;
}

/** One turn to keep: the conversation it was about, the prompt it read, and the two records of it. */
export interface ModelTurnKept {
  /** The model port's own id for the turn: what the reply's meta names it by. */
  turnId: string;
  tenantId: string;
  conversationId: string;
  promptHash: string;
  promptText: string;
  request: ModelTurnRequest;
  /** Null where no answer came. */
  response: ModelTurnResponse | null;
  model: string | null;
  latencyMs: number | null;
}

export async function keepModelTurn(db: Db, turn: ModelTurnKept): Promise<void> {
  const { error } = await db.rpc("model_turn_keep", {
    p_tenant_id: turn.tenantId,
    p_turn_id: turn.turnId,
    p_conversation_id: turn.conversationId,
    p_prompt_hash: turn.promptHash,
    p_prompt_text: turn.promptText,
    p_request: turn.request,
    ...(turn.response ? { p_response: turn.response } : {}),
    ...(turn.model ? { p_model: turn.model } : {}),
    ...(turn.latencyMs === null ? {} : { p_latency_ms: Math.max(0, Math.round(turn.latencyMs)) }),
  });
  if (error) throw new Error(`model_turn_keep: ${error.message}`);
}

/** An erasure's hand: the workspace's kept turns that name any of the person's identifiers, deleted; how many went. */
export async function scrubModelTurns(db: Db, tenantId: string, needles: readonly string[]): Promise<number> {
  const { data, error } = await db.rpc("model_turns_scrub", { p_tenant_id: tenantId, p_needles: [...needles] });
  // A database before 00359 keeps no turn, so nothing is there to scrub: the dashboard may deploy first (either order).
  if (error && (error.code === "PGRST202" || error.code === "42883")) return 0;
  if (error) throw new Error(`model_turns_scrub: ${error.message}`);
  return data ?? 0;
}

export interface UsageMonthRow {
  meter: "model" | "voice_seconds" | "wa_conversation";
  purpose: string | null;
  model: string | null;
  uses: number;
  quantity: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  usd: number | null;
}

export async function usageMonth(db: Db, tenantId: string, month: string): Promise<UsageMonthRow[]> {
  const { data, error } = await db.rpc("ai_usage_month", { p_tenant_id: tenantId, p_month: month });
  if (error) throw new Error(`ai_usage_month: ${error.message}`);
  const n = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return (data ?? []).map((r) => ({
    meter: r.meter as UsageMonthRow["meter"],
    purpose: r.purpose ?? null,
    model: r.model ?? null,
    uses: n(r.uses),
    quantity: n(r.quantity),
    input_tokens: n(r.input_tokens),
    output_tokens: n(r.output_tokens),
    cache_read_tokens: n(r.cache_read_tokens),
    cache_write_tokens: n(r.cache_write_tokens),
    usd: r.usd === null || r.usd === undefined ? null : n(r.usd),
  }));
}
