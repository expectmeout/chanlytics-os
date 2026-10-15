/**
 * What the two doors that spend the platform's model key for a person share: Ask's model gateway
 * (api/admin/llm.ts) and the reach-out sheet's preview (api/admin/reach-out-preview.ts). It is whole and wired at both: the
 * gateway door uses all of it, the preview the day's count and the usage event.
 *
 *   - askTokensLast24h / recordAskUsage / teeUsage: Ask's own budget. The dashboard runs the assistant as the signed-in
 *     person, but the key lives here, so a turn's call passes through this edge. Its tokens are counted on their own event
 *     kind (ASK_USAGE_KIND) so an owner asking questions never spends the receptionist's customer-facing budget
 *     (budget.ts reads usage.llm_tokens and nothing else); the day's sum is one statement (ask_tokens_day, 00240) and a
 *     count that cannot be read holds the turn. The tee reads a round's usage off the stream as it is forwarded.
 *   - validateGatewayRequest and its limits: what a request may ask for; anything else is refused (bad_request) before
 *     the key is spent. Ask may name any model that reads as one (its deployment's ASK_MODEL); the small drafts
 *     name the registry's for their route. A request may ask for fast mode (`speed`), a thinking type and the betas
 *     GATEWAY_BETAS lists, each dropped when it is none of those (extrasOf); the port sends each model only what it
 *     takes (channels models/anthropic.ts).
 *   - modelPurposeOf: the registry's purpose a gateway purpose is asked as.
 *
 * Two records of one round, on purpose: the event above is the budget's count (a sum over 24 hours, purged with the
 * events), and the ledger row (lib/model.ts recordCall, written by the door once the stream ends) is the round's dollars,
 * by the model that answered, kept 400 days. This module writes the first and not the second.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ASK_MAX_TOKENS,
  ASK_WARM_MAX_TOKENS,
  FAST_MODE_BETA,
  MODELS,
  MODEL_EFFORTS,
  MODEL_ROUTES,
  THINKING_TYPES,
  readsAsModel,
  type ModelEffort,
  type ModelPurpose,
  type ModelSpeed,
  type ThinkingType,
} from "./packages/contracts.js";
import type { Database } from "./packages/db.js";
import { emitEvent } from "./packages/db.js";
import { logger, errField } from "./log.js";

export const ASK_USAGE_KIND = "usage.ask_tokens" as const;

export interface AskUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  /** The speed the round ran at, as the API's usage said it; absent when it said none (the door then says the asked). */
  speed?: ModelSpeed;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Ask's tokens in the last day, this workspace: input, cache writes and output of every usage.ask_tokens event of the
 * last 24 hours, a cache read not counted, summed in one statement (ask_tokens_day, 00240, 00368). A read that fails is
 * not known, and says so (null): the door holds the turn rather than let a failed count read as a day with nothing
 * spent (the scorecard, 29 September).
 */
export async function askTokensLast24h(db: SupabaseClient<Database>, tenantId: string): Promise<number | null> {
  const L = logger({ tenant_id: tenantId });
  try {
    const { data, error } = await db.rpc("ask_tokens_day", { p_tenant: tenantId });
    if (error) throw new Error(`ask_tokens_day: ${error.message}`);
    return num(Number(data));
  } catch (e) {
    L.error("ask_budget_read_failed", { error: errField(e) });
    return null;
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
  const L = logger({ tenant_id: tenantId });
  try {
    await emitEvent(db, tenantId, ASK_USAGE_KIND, "user", userId, { ...data });
  } catch (e) {
    L.error("ask_usage_write_failed", { error: errField(e) });
  }
}

/**
 * A transformer with the cancel step the Streams standard has given it, which Node 22 (the engines' floor) runs when
 * the readable side is cancelled or the writable side aborted. TypeScript's DOM types do not name it yet.
 */
type CancellableTransformer<I, O> = Transformer<I, O> & { cancel?: (reason: unknown) => Promise<void> | void };

/**
 * Read the usage out of an event stream as it passes.
 *
 * The API says what a message cost in two places: message_start carries the
 * input side (and the cache counts), message_delta the output side and the
 * stop reason. The stream is forwarded byte for byte; only complete `data:`
 * lines are inspected, so a chunk boundary inside a JSON payload changes
 * nothing.
 *
 * `onDone` runs once, however the stream ends: at its end, or with what was
 * read so far when it is cut. It used to run only at a clean end (flush), and
 * a stream cut short never flushes: one the dashboard abandoned (its turn's
 * budget), one its try's bound ended, one the upstream broke. The round had
 * been spent all the same, and it was missing from Ask's day and from the
 * ledger. A cut from either side cancels the transform, which settles the
 * round before the cut reaches the other side. (The API says the output side
 * only at the end, so a round cut before it counts its input side alone.)
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
  // The API says the speed a round ran at in its usage (fast mode's prices are their own): kept when it says one.
  const noteSpeed = (v: unknown) => {
    if (v === "fast" || v === "standard") usage.speed = v;
  };
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
        noteSpeed(u.speed);
      } else if (ev.type === "message_delta") {
        if (ev.usage) usage.output_tokens = num(ev.usage.output_tokens) || usage.output_tokens;
        noteSpeed(ev.usage?.speed);
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
  const tee: CancellableTransformer<Uint8Array, Uint8Array> = {
    transform(chunk, controller) {
      scan(decoder.decode(chunk, { stream: true }));
      controller.enqueue(chunk);
    },
    async flush() {
      await settle();
    },
    // The reader cancelled (the dashboard's abort), or the upstream failed and the pipe aborted this side: flush never
    // runs then, and the stream holds the cancel, or the error, until this returns.
    async cancel() {
      await settle();
    },
  };
  return upstream.pipeThrough(new TransformStream(tee));
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
    effort?: ModelEffort;
    format?: { type: "json_schema"; schema: Record<string, unknown> };
  };
  /** The cache diagnostics (the Phase 6 plan, D2): the message this request follows on, or null to start comparing. */
  diagnostics?: { previous_message_id: string | null };
  /**
   * Fast mode (contracts MODEL_SPEEDS): "fast" rides through, any other word is standard, which is a request that names
   * none. The port sends it, with FAST_MODE_BETA, only to a model that runs it, and asks again at standard speed when
   * fast mode's own limit refuses it.
   */
  speed?: "fast";
  /** How the model thinks (contracts THINKING_TYPES); the port sends it only to a model that accepts the type. */
  thinking?: { type: ThinkingType };
  /** The betas the request names, each one GATEWAY_BETAS lists: the anthropic-beta header, never the body. */
  betas?: string[];
}

const EFFORTS: ReadonlySet<string> = new Set(MODEL_EFFORTS);

/**
 * The betas a gateway request may name; another is dropped before the key is spent. Fast mode's is the port's to add
 * for a fast request, and may be named too; a beta joins the list with the feature that needs it.
 */
const GATEWAY_BETAS: readonly string[] = [FAST_MODE_BETA];
const THINKING: ReadonlySet<string> = new Set(THINKING_TYPES);

/**
 * What a request asks of the model beyond its words, each dropped when it is not one the gateway knows, never refused,
 * as an effort is: fast mode ("fast" rides through; any other speed is standard, a request that names none), a
 * thinking type of THINKING_TYPES (its type alone: a budget is a 400 on every model Ask runs), and the betas
 * GATEWAY_BETAS lists, each once.
 */
function extrasOf(r: Partial<GatewayRequest>): Pick<GatewayRequest, "speed" | "thinking" | "betas"> {
  const type = r.thinking && typeof r.thinking === "object" ? (r.thinking as { type?: unknown }).type : undefined;
  const betas = Array.isArray(r.betas) ? [...new Set(r.betas.filter((b) => GATEWAY_BETAS.includes(b)))] : [];
  return {
    ...(r.speed === "fast" ? { speed: "fast" as const } : {}),
    ...(typeof type === "string" && THINKING.has(type) ? { thinking: { type: type as ThinkingType } } : {}),
    ...(betas.length ? { betas } : {}),
  };
}

/**
 * What the gateway spends the key on. Every purpose counts in Ask's own daily budget (ASK_USAGE_KIND). A warm
 * (`ask_warm`) is Ask's turn in everything but what it is for: the head of a turn's first request, sent ahead of the
 * question so the model's cache is written before it arrives (the dashboard's server/ask/warm.ts). It is held to what a
 * turn is held to, may write next to nothing (ASK_WARM_MAX_TOKENS), and its usage row says `ask_warm`, so what counts
 * Ask's rounds by `purpose: "ask"` (ops/ask-day.mjs, the eval) counts no round of it.
 */
export const GATEWAY_PURPOSES = [
  "ask",
  "ask_warm",
  "lead_draft",
  "lead_suggest",
  "list_draft",
  "person_draft",
  // A new sequence drafted from the owner's line (decision 0060, S4): the small JSON route, as the other drafts.
  "sequence_draft",
] as const;
export type GatewayPurpose = (typeof GATEWAY_PURPOSES)[number];
/** Whether a purpose is Ask's own: its turn, or a turn's warm. */
const isAsk = (purpose: GatewayPurpose): boolean => purpose === "ask" || purpose === "ask_warm";

/**
 * The registry's purpose a gateway purpose is asked as (contracts ai/models.ts): Ask's turn is Ask's route (the template
 * drafter's rounds come as Ask's too), the ideas for a new search their own (00398), the lead and list drafts the small
 * JSON route. The route names the fallback.
 */
export function modelPurposeOf(purpose: GatewayPurpose): ModelPurpose {
  if (isAsk(purpose)) return "ask";
  return purpose === "lead_suggest" ? "lead_suggest" : "lead_json";
}
/** What Ask's daily budget counts: the gateway's purposes, and the reach-out sheet's preview (its own door, R12). */
type AskUsagePurpose = GatewayPurpose | "reach_out_preview";
const FORMAT_MAX = 8_000;

/**
 * The cache diagnostics a request may carry (the Phase 6 plan, D2): the id of a message the API wrote, or null to start
 * a comparison. Anything else is dropped, never refused: diagnostics change nothing the model answers.
 */
const MESSAGE_ID = /^msg_[A-Za-z0-9_-]{1,120}$/;
function diagnosticsOf(raw: unknown): { diagnostics?: { previous_message_id: string | null } } {
  if (!raw || typeof raw !== "object" || !("previous_message_id" in raw)) return {};
  const id = (raw as { previous_message_id: unknown }).previous_message_id;
  if (id === null) return { diagnostics: { previous_message_id: null } };
  return typeof id === "string" && MESSAGE_ID.test(id) ? { diagnostics: { previous_message_id: id } } : {};
}

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
 * The models a small draft's request may name: every model and fallback of the registry's routes the gateway serves,
 * so the dashboard's JSON_MODEL and the fallback the port may ask are the list, and the two cannot drift apart. Ask is
 * not held to it: its model is its deployment's to name (contracts ask-model.ts), any that reads as a Claude model, so
 * trying one is a variable on the dashboard and no change here. The door is the dashboard's alone (a signed token),
 * the day's cap counts tokens whatever the model, and a name the API does not know is asked of the route's own.
 */
export const GATEWAY_MODELS: readonly string[] = [
  ...new Set(
    (["ask", "lead_json", "lead_suggest", "template_draft"] as const).flatMap((p) =>
      [MODEL_ROUTES[p].model, MODEL_ROUTES[p].fallback].filter((m): m is NonNullable<typeof m> => m !== null),
    ),
  ),
];
/**
 * What a request that names no model gets: the model every caller ran on before each named its own (Ask its profile,
 * the lead purposes JSON_MODEL). Only a dashboard older than that sends none, and it expects this; Ask's default
 * (contracts ASK_MODEL) moves Ask alone.
 */
export const GATEWAY_FALLBACK_MODEL = MODELS.SONNET_5;
/** The lead purposes' ceiling. Ask's own is ASK_MAX_TOKENS (contracts), the number its loop asks for. */
export const GATEWAY_MAX_TOKENS = 2000;
export const GATEWAY_MAX_MESSAGES = 60;
export const GATEWAY_MAX_TOOLS = 40;
export const GATEWAY_MAX_BODY = 700_000;

/** Whether a purpose's request may name this model: Ask any that reads as one, a small draft the list's. */
const mayName = (purpose: GatewayPurpose, model: string): boolean =>
  isAsk(purpose) ? readsAsModel(model) : GATEWAY_MODELS.includes(model);

/** The most a purpose's request may write: Ask's turn its own ceiling, a warm next to nothing, a draft the drafts'. */
const ceilingOf = (purpose: GatewayPurpose): number =>
  purpose === "ask" ? ASK_MAX_TOKENS : purpose === "ask_warm" ? ASK_WARM_MAX_TOKENS : GATEWAY_MAX_TOKENS;

/** A request the gateway will not send: `bad_request`, with the rule it broke in `detail`. */
const badRequest = (detail: string) => ({ ok: false as const, error: "bad_request" as const, detail });

export function validateGatewayRequest(
  raw: unknown,
  purpose: GatewayPurpose = "ask",
): { ok: true; request: GatewayRequest } | { ok: false; error: "bad_request"; detail: string } {
  const r = raw as Partial<GatewayRequest> | null;
  if (!r || typeof r !== "object") return badRequest("request required");
  const model = typeof r.model === "string" ? r.model : GATEWAY_FALLBACK_MODEL;
  if (!mayName(purpose, model)) return badRequest("unknown model");
  const maxTokens = Math.min(ceilingOf(purpose), Math.max(64, Math.round(num(r.max_tokens) || 800)));
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
  const effort = oc && EFFORTS.has(String(oc.effort)) ? (oc.effort as ModelEffort) : null;
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
      ...diagnosticsOf(r.diagnostics),
      ...extrasOf(r),
    },
  };
}
