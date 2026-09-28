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
import { ASK_MAX_TOKENS, ASK_MODELS } from "./packages/contracts.js";
import type { Database, Json } from "./packages/db.js";
import { emitEvent } from "./packages/db.js";
import { logger, errField } from "./log.js";

export const ASK_USAGE_KIND = "usage.ask_tokens" as const;

export interface AskUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Ask's tokens in the last day, this workspace: input plus output of every usage.ask_tokens event of the last 24
 * hours, summed in one statement (ask_tokens_day, 00239). Read failures count as zero, never as a refusal.
 */
export async function askTokensLast24h(db: SupabaseClient<Database>, tenantId: string): Promise<number> {
  const L = logger({ tenant: tenantId });
  try {
    const { data, error } = await db.rpc("ask_tokens_day", { p_tenant: tenantId });
    if (error) throw new Error(`ask_tokens_day: ${error.message}`);
    return num(Number(data));
  } catch (e) {
    L.error("ask_budget_read_failed", { error: errField(e) });
    return 0;
  }
}

export async function recordAskUsage(
  db: SupabaseClient<Database>,
  tenantId: string,
  userId: string,
  data: AskUsage & {
    model: string;
    latency_ms: number;
    stop_reason: string | null;
    stream: boolean;
    purpose: AskUsagePurpose;
  },
): Promise<void> {
  const L = logger({ tenant: tenantId });
  try {
    await emitEvent(db, tenantId, ASK_USAGE_KIND, "usage", "user", userId, data as unknown as Json);
  } catch (e) {
    L.error("ask_usage_write_failed", { error: errField(e) });
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
  const usage: AskUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
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
      let ev: {
        type?: string;
        message?: { usage?: Record<string, unknown> };
        usage?: Record<string, unknown>;
        delta?: { stop_reason?: string };
      };
      try {
        ev = JSON.parse(raw);
      } catch {
        continue;
      }
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
  output_config?: {
    effort?: "low" | "medium" | "high";
    format?: { type: "json_schema"; schema: Record<string, unknown> };
  };
}

const EFFORTS = new Set(["low", "medium", "high"]);

/** What the gateway spends the key on. Every purpose counts in Ask's own daily budget (ASK_USAGE_KIND). */
export const GATEWAY_PURPOSES = ["ask", "lead_draft", "lead_suggest", "list_draft"] as const;
export type GatewayPurpose = (typeof GATEWAY_PURPOSES)[number];
/** What Ask's daily budget counts: the gateway's purposes, and the reach-out sheet's preview (its own door, R12). */
type AskUsagePurpose = GatewayPurpose | "reach_out_preview";
const FORMAT_MAX = 8_000;

function formatOf(raw: unknown): { type: "json_schema"; schema: Record<string, unknown> } | null | "bad" {
  if (raw === undefined) return null;
  const f = raw as { type?: unknown; schema?: unknown } | null;
  if (!f || f.type !== "json_schema" || !f.schema || typeof f.schema !== "object" || Array.isArray(f.schema))
    return "bad";
  return JSON.stringify(f.schema).length > FORMAT_MAX
    ? "bad"
    : { type: "json_schema", schema: f.schema as Record<string, unknown> };
}

/**
 * The models a request may name: Ask's profiles (contracts ASK_MODELS, the list the dashboard's ASK_MODEL picks from)
 * and Opus 5, which no caller names as of 25 Sep 2026 (the door's own tests do).
 */
export const GATEWAY_MODELS = ["claude-opus-5", ...ASK_MODELS] as const;
/**
 * What a request that names no model gets: the model every caller ran on before each named its own (Ask its profile,
 * the lead purposes JSON_MODEL). Only a dashboard older than that sends none, and it expects this; Ask's default
 * (contracts ASK_MODEL) moves Ask alone.
 */
export const GATEWAY_FALLBACK_MODEL = "claude-sonnet-5" as const;
/** The lead purposes' ceiling. Ask's own is ASK_MAX_TOKENS (contracts), the number its loop asks for. */
export const GATEWAY_MAX_TOKENS = 2000;
export const GATEWAY_MAX_MESSAGES = 60;
export const GATEWAY_MAX_TOOLS = 40;
export const GATEWAY_MAX_BODY = 700_000;

/** A request the gateway will not send: `bad_request`, with the rule it broke in `detail`. */
const badRequest = (detail: string) => ({ ok: false as const, error: "bad_request" as const, detail });

export function validateGatewayRequest(
  raw: unknown,
  purpose: GatewayPurpose = "ask",
): { ok: true; request: GatewayRequest } | { ok: false; error: "bad_request"; detail: string } {
  const r = raw as Partial<GatewayRequest> | null;
  if (!r || typeof r !== "object") return badRequest("request required");
  const model = typeof r.model === "string" ? r.model : GATEWAY_FALLBACK_MODEL;
  if (!(GATEWAY_MODELS as readonly string[]).includes(model)) return badRequest("unknown model");
  const cap = purpose === "ask" ? ASK_MAX_TOKENS : GATEWAY_MAX_TOKENS;
  const maxTokens = Math.min(cap, Math.max(64, Math.round(num(r.max_tokens) || 800)));
  if (!Array.isArray(r.messages) || !r.messages.length || r.messages.length > GATEWAY_MAX_MESSAGES) {
    return badRequest(`messages: 1-${GATEWAY_MAX_MESSAGES} turns`);
  }
  if (r.tools !== undefined && (!Array.isArray(r.tools) || r.tools.length > GATEWAY_MAX_TOOLS)) {
    return badRequest(`tools: up to ${GATEWAY_MAX_TOOLS}`);
  }
  if (r.system !== undefined && typeof r.system !== "string" && !Array.isArray(r.system)) {
    return badRequest("system: a string or blocks");
  }
  const oc =
    r.output_config && typeof r.output_config === "object"
      ? (r.output_config as { effort?: unknown; format?: unknown })
      : null;
  const effort = oc && EFFORTS.has(String(oc.effort)) ? (oc.effort as "low" | "medium" | "high") : null;
  // A format rides through for every purpose: the lead purposes answer as
  // records, and Ask's turn answers in its answer schema (the Line, D3).
  const format = formatOf(oc ? oc.format : undefined);
  if (format === "bad") return badRequest("output_config.format: a JSON schema under 8,000 characters");
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
      ...(effort || format ? { output_config: { ...(effort ? { effort } : {}), ...(format ? { format } : {}) } } : {}),
    },
  };
}
