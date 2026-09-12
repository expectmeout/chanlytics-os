/**
 * The model gateway's bookkeeping: Ask's own budget, and the usage tee.
 *
 * The dashboard runs the assistant as the signed-in person, but the model key
 * lives here and stays here. So a turn's model call passes through this edge,
 * which does two things the dashboard cannot: it spends the key, and it
 * writes the usage row with the service role. Ask's tokens are counted on
 * their own event kind so an owner asking questions never spends the
 * receptionist's customer-facing budget (budget.ts reads usage.llm_tokens
 * and nothing else).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./workspace/db.js";
import { emitEvent } from "./workspace/db.js";

export const ASK_USAGE_KIND = "usage.ask_tokens" as const;
const DAY_MS = 24 * 3600 * 1000;
const ROW_CAP = 2000;

export interface AskUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Ask's tokens in the last day, this workspace. Read failures count as zero, never as a refusal. */
export async function askTokensLast24h(db: SupabaseClient<Database>, tenantId: string): Promise<number> {
  try {
    const { data, error } = await db
      .from("events")
      .select("data")
      .eq("tenant_id", tenantId)
      .eq("kind", ASK_USAGE_KIND)
      .gte("created_at", new Date(Date.now() - DAY_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(ROW_CAP);
    if (error) throw new Error(error.message);
    return (data ?? []).reduce((sum, r) => {
      const d = (r.data ?? {}) as Record<string, unknown>;
      return sum + num(d.input_tokens) + num(d.output_tokens);
    }, 0);
  } catch (e) {
    console.error("ask_budget_read_failed", e instanceof Error ? e.message : e);
    return 0;
  }
}

export async function recordAskUsage(
  db: SupabaseClient<Database>,
  tenantId: string,
  userId: string,
  data: AskUsage & { model: string; latency_ms: number; stop_reason: string | null; stream: boolean },
): Promise<void> {
  try {
    await emitEvent(db, tenantId, ASK_USAGE_KIND, "usage", "user", userId, data as unknown as Json);
  } catch (e) {
    console.error("ask_usage_write_failed", e instanceof Error ? e.message : e);
  }
}

/**
 * Read the usage out of an event stream as it passes.
 *
 * The API says what a message cost in two places: message_start carries the
 * input side (and the cache counts), message_delta the output side and the
 * stop reason. The stream is forwarded byte for byte; only complete `data:`
 * lines are inspected, so a chunk boundary inside a JSON payload changes
 * nothing.
 */
export function teeUsage(
  upstream: ReadableStream<Uint8Array>,
  onDone: (usage: AskUsage, stopReason: string | null) => Promise<void> | void,
): ReadableStream<Uint8Array> {
  const usage: AskUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let stopReason: string | null = null;
  let carry = "";
  const decoder = new TextDecoder();
  const scan = (text: string) => {
    carry += text;
    const lines = carry.split("\n");
    carry = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      let ev: { type?: string; message?: { usage?: Record<string, unknown> }; usage?: Record<string, unknown>; delta?: { stop_reason?: string } };
      try { ev = JSON.parse(raw); } catch { continue; }
      if (ev.type === "message_start" && ev.message?.usage) {
        const u = ev.message.usage;
        usage.input_tokens = num(u.input_tokens);
        usage.cache_read_input_tokens = num(u.cache_read_input_tokens);
        usage.cache_creation_input_tokens = num(u.cache_creation_input_tokens);
      } else if (ev.type === "message_delta") {
        if (ev.usage) usage.output_tokens = num(ev.usage.output_tokens) || usage.output_tokens;
        if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
      }
    }
  };
  let settled = false;
  const settle = async () => {
    if (settled) return;
    settled = true;
    if (carry) scan("\n");
    await onDone(usage, stopReason);
  };
  return upstream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        scan(decoder.decode(chunk, { stream: true }));
        controller.enqueue(chunk);
      },
      async flush() {
        await settle();
      },
    }),
  );
}

/** What a gateway request may ask for. Everything else is refused before the key is spent. */
export interface GatewayRequest {
  model: string;
  max_tokens: number;
  system: unknown;
  messages: unknown[];
  tools?: unknown[];
  tool_choice?: unknown;
  temperature?: number;
  output_config?: { effort: "low" | "medium" | "high" };
}

const EFFORTS = new Set(["low", "medium", "high"]);

export const GATEWAY_MODELS = ["claude-opus-5", "claude-sonnet-5"] as const;
export const GATEWAY_MAX_TOKENS = 2000;
export const GATEWAY_MAX_MESSAGES = 60;
export const GATEWAY_MAX_TOOLS = 40;
export const GATEWAY_MAX_BODY = 700_000;

export function validateGatewayRequest(raw: unknown): { ok: true; request: GatewayRequest } | { ok: false; error: string } {
  const r = raw as Partial<GatewayRequest> | null;
  if (!r || typeof r !== "object") return { ok: false, error: "request required" };
  const model = typeof r.model === "string" ? r.model : GATEWAY_MODELS[0];
  if (!(GATEWAY_MODELS as readonly string[]).includes(model)) return { ok: false, error: "unknown model" };
  const maxTokens = Math.min(GATEWAY_MAX_TOKENS, Math.max(64, Math.round(num(r.max_tokens) || 800)));
  if (!Array.isArray(r.messages) || !r.messages.length || r.messages.length > GATEWAY_MAX_MESSAGES) {
    return { ok: false, error: `messages: 1-${GATEWAY_MAX_MESSAGES} turns` };
  }
  if (r.tools !== undefined && (!Array.isArray(r.tools) || r.tools.length > GATEWAY_MAX_TOOLS)) {
    return { ok: false, error: `tools: up to ${GATEWAY_MAX_TOOLS}` };
  }
  if (r.system !== undefined && typeof r.system !== "string" && !Array.isArray(r.system)) {
    return { ok: false, error: "system: a string or blocks" };
  }
  return {
    ok: true,
    request: {
      model,
      max_tokens: maxTokens,
      system: r.system,
      messages: r.messages,
      ...(r.tools ? { tools: r.tools } : {}),
      ...(r.tool_choice ? { tool_choice: r.tool_choice } : {}),
      ...(typeof r.temperature === "number" ? { temperature: Math.min(1, Math.max(0, r.temperature)) } : {}),
      ...(r.output_config && typeof r.output_config === "object" && EFFORTS.has(String((r.output_config as { effort?: unknown }).effort))
        ? { output_config: { effort: (r.output_config as { effort: "low" | "medium" | "high" }).effort } }
        : {}),
    },
  };
}
