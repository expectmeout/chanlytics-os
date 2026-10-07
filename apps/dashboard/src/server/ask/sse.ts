/**
 * The API's event stream, read one frame at a time.
 *
 * Pure on purpose: no environment, no fetch, so the parser can be executed
 * in a test. gateway.ts opens the connection and feeds frames through here.
 */

export interface GatewayBlockStart {
  type: "block_start";
  index: number;
  block:
    | { type: "text" }
    | { type: "tool_use"; id: string; name: string }
    | { type: "thinking" }
    | { type: "redacted_thinking"; data: string };
}
export interface GatewayTextDelta {
  type: "text";
  index: number;
  text: string;
}
export interface GatewayInputDelta {
  type: "input_json";
  index: number;
  partial: string;
}
/** A thinking block's words as they stream (empty when the display is omitted, the default). */
export interface GatewayThinkingDelta {
  type: "thinking";
  index: number;
  thinking: string;
}
/** A thinking block's signature: the part the model checks when the block comes back. */
export interface GatewaySignatureDelta {
  type: "signature";
  index: number;
  signature: string;
}
export interface GatewayBlockStop {
  type: "block_stop";
  index: number;
}
export interface GatewayStop {
  type: "stop";
  stopReason: string | null;
  /** The output side of the usage, on message_delta; null when the frame carried none (never zero: unknown is not free). */
  outputTokens: number | null;
}
/**
 * What a round costs, read off message_start: the input side and the cache
 * counts. The output side arrives with the stop. The edge tees the same frames
 * for the usage row (ask-gateway.ts teeUsage); this is the loop's own copy, so
 * a turn can say what it was fed without a database read.
 */
export interface GatewayUsage {
  type: "usage";
  /** The API's own id for the message; the next request's cache diagnostics name it (the Phase 6 plan, D2). */
  messageId: string | null;
  /** The model that answered, in the API's own name: a fallback's when the edge asked one (the turn's stamp). */
  model: string | null;
  /**
   * Why this request missed the cache the one it named had written (message.diagnostics): the API's type
   * (`system_changed`, `tools_changed`, `messages_changed`, `model_changed`, `previous_message_not_found`,
   * `unavailable`), "pending" when its comparison had not finished, or null when nothing diverged or nothing was named.
   */
  cacheMiss: string | null;
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}
export interface GatewayError {
  type: "error";
  message: string;
}
/**
 * Where the round's wait went before its stream began (the Phase 6 plan, D3): the edge's own time before it asked the
 * model and the model's time to its headers, as the edge's server-timing said them (null when it said nothing), and
 * the whole wait for the headers as this side measured it. What is left over is the hop, both ways.
 */
export interface GatewayTiming {
  type: "timing";
  gatewayMs: number | null;
  modelMs: number | null;
  headersMs: number;
}
export type GatewayEvent =
  | GatewayBlockStart
  | GatewayTextDelta
  | GatewayInputDelta
  | GatewayThinkingDelta
  | GatewaySignatureDelta
  | GatewayBlockStop
  | GatewayStop
  | GatewayUsage
  | GatewayError
  | GatewayTiming;

/** Whether a 400 from the API names the strict-tool or format feature, so the loop can retry without it. */
export function featureRejected(message: string): boolean {
  return /strict|output_config|output_format|json_schema|schema|format/i.test(message);
}

interface RawEvent {
  type: string;
  index?: number;
  content_block?: { type: string; id?: string; name?: string; data?: string };
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    thinking?: string;
    signature?: string;
    stop_reason?: string;
  };
  message?: { id?: unknown; usage?: Record<string, unknown>; diagnostics?: unknown };
  usage?: { output_tokens?: unknown };
  error?: { message?: string; type?: string };
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * The cache diagnostics' verdict on message_start (the Phase 6 plan, D2): null when the response carries none (no
 * divergence, or nothing named to compare), "pending" when the comparison was still running, else the miss's type.
 */
function messageOf(message: { id?: unknown; model?: unknown; diagnostics?: unknown } | undefined) {
  return {
    messageId: typeof message?.id === "string" ? message.id : null,
    model: typeof message?.model === "string" ? message.model : null,
    cacheMiss: cacheMissOf(message?.diagnostics),
  };
}
function cacheMissOf(diagnostics: unknown): string | null {
  if (!diagnostics || typeof diagnostics !== "object") return null;
  const reason = (diagnostics as { cache_miss_reason?: unknown }).cache_miss_reason;
  if (reason === null || reason === undefined) return "pending";
  const type = (reason as { type?: unknown }).type;
  return typeof type === "string" && type ? type : "unavailable";
}

/** One SSE frame → one event, or nothing for pings and the frames the loop does not use. */
export function parseFrame(frame: string): GatewayEvent | null {
  let data = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return null;
  let ev: RawEvent;
  try {
    ev = JSON.parse(data);
  } catch {
    return null;
  }
  switch (ev.type) {
    case "content_block_start": {
      const b = ev.content_block;
      if (!b || typeof ev.index !== "number") return null;
      if (b.type === "tool_use")
        return {
          type: "block_start",
          index: ev.index,
          block: { type: "tool_use", id: b.id ?? "", name: b.name ?? "" },
        };
      // Thinking is its own kind: a model that always thinks (Opus 5.5) must
      // be handed it back unmodified, which a block read as text cannot be.
      if (b.type === "thinking") return { type: "block_start", index: ev.index, block: { type: "thinking" } };
      if (b.type === "redacted_thinking")
        return { type: "block_start", index: ev.index, block: { type: "redacted_thinking", data: b.data ?? "" } };
      return { type: "block_start", index: ev.index, block: { type: "text" } };
    }
    case "content_block_delta": {
      if (typeof ev.index !== "number" || !ev.delta) return null;
      if (ev.delta.type === "text_delta") return { type: "text", index: ev.index, text: ev.delta.text ?? "" };
      if (ev.delta.type === "input_json_delta")
        return { type: "input_json", index: ev.index, partial: ev.delta.partial_json ?? "" };
      if (ev.delta.type === "thinking_delta")
        return { type: "thinking", index: ev.index, thinking: ev.delta.thinking ?? "" };
      if (ev.delta.type === "signature_delta")
        return { type: "signature", index: ev.index, signature: ev.delta.signature ?? "" };
      return null;
    }
    case "content_block_stop":
      return typeof ev.index === "number" ? { type: "block_stop", index: ev.index } : null;
    case "message_start": {
      const u = ev.message?.usage;
      if (!u) return null;
      return {
        type: "usage",
        ...messageOf(ev.message),
        inputTokens: num(u.input_tokens),
        cacheReadTokens: num(u.cache_read_input_tokens),
        cacheCreationTokens: num(u.cache_creation_input_tokens),
      };
    }
    case "message_delta": {
      const out = ev.usage?.output_tokens;
      return {
        type: "stop",
        stopReason: ev.delta?.stop_reason ?? null,
        outputTokens: typeof out === "number" && Number.isFinite(out) ? out : null,
      };
    }
    case "error":
      return { type: "error", message: ev.error?.message ?? ev.error?.type ?? "model error" };
    default:
      return null;
  }
}
