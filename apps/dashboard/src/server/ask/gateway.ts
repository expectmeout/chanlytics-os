import "server-only";

/**
 * The dashboard's side of the model gateway.
 *
 * One call per model round: the request goes to the edge (which holds the
 * key and keeps the count) and the API's event stream comes back. This
 * module turns that stream into the few events the turn loop cares about:
 * a text delta, a tool call's input growing, the stop reason. Nothing here
 * knows what a tool does.
 */

import { parseFrame, type GatewayEvent } from "./sse";
export { parseFrame } from "./sse";
export type { GatewayEvent } from "./sse";

/** The edge deployment, as service.ts names it for steer and whisper. */
import { edgeConfigured, edgeHeaders, edgeUrl } from "../edge";
import { deployment } from "../deployment";
import type { EdgeErrorCode } from "@chanlytics/contracts";

export interface GatewayCall {
  tenantId: string;
  userId: string;
  /**
   * What the key is spent on (GATEWAY_PURPOSES, ask-gateway.ts). Ask's own turn
   * omits it and gets "ask"; the lead purposes name themselves. Every purpose
   * may carry a format: Ask's turn answers in ASK_ANSWER_FORMAT.
   */
  purpose?: "ask" | "lead_draft" | "lead_suggest" | "list_draft";
  request: {
    model?: string;
    max_tokens: number;
    system: unknown;
    messages: unknown[];
    tools?: unknown[];
    tool_choice?: unknown;
    output_config?: {
      effort?: "low" | "medium" | "high";
      format?: { type: "json_schema"; schema: Record<string, unknown> };
    };
    /**
     * The cache diagnostics (the Phase 6 plan, D2): the id of the message this request follows on, or null to start a
     * comparison. The API answers on message_start with why this request missed what that one wrote.
     */
    diagnostics?: { previous_message_id: string | null };
  };
  signal?: AbortSignal;
}

export type GatewayRefusal =
  | { kind: "preview" }
  | { kind: "budget"; used: number; cap: number }
  | { kind: "no_key" }
  /** The workspace is paused, ended or its plan is over: the edge spends nothing (402 payment_required). */
  | { kind: "paused" }
  | { kind: "bad_request"; message: string }
  | { kind: "unreachable"; message: string };

export class GatewayRefused extends Error {
  constructor(public refusal: GatewayRefusal) {
    super(`gateway refused: ${refusal.kind}`);
  }
}

/**
 * The edge's server-timing header (the Phase 6 plan, D3): its own time before it asked the model (`gateway`) and the
 * model's time to its headers (`model`), each null when the header says nothing of it.
 */
function serverTiming(header: string | null): { gatewayMs: number | null; modelMs: number | null } {
  const durs = new Map<string, number>();
  for (const part of (header ?? "").split(",")) {
    const [name, ...params] = part.split(";").map((x) => x.trim());
    const dur = params.find((x) => x.startsWith("dur="));
    const ms = dur ? Number(dur.slice(4)) : NaN;
    if (name && Number.isFinite(ms)) durs.set(name, Math.round(ms));
  }
  const dur = (name: string): number | null => durs.get(name) ?? null;
  return { gatewayMs: dur("gateway"), modelMs: dur("model") };
}

/**
 * What an answer that is not a stream means: the budget, the key, a paused workspace, a model that could not be
 * reached (a 429 that is not the budget, any 5xx: the model was never heard, so it never "refused"), or the API's
 * refusal of the request itself, whose words the loop reads to drop what the model would not take.
 */
async function gatewayRefusalOf(res: Response): Promise<GatewayRefusal> {
  // The edge's refusal (a code, its words in `detail`), or the model's own body forwarded as it came, whose `error`
  // is an object with a message.
  const j = (await res.json().catch(() => ({}))) as {
    error?: EdgeErrorCode | { message?: string };
    detail?: string;
    used?: number;
    cap?: number;
    message?: string;
  };
  if (res.status === 429 && j.error === "ask_budget") return { kind: "budget", used: j.used ?? 0, cap: j.cap ?? 0 };
  if (res.status === 503 && j.error === "no_model_key") return { kind: "no_key" };
  if (res.status === 402) return { kind: "paused" };
  const err =
    typeof j.detail === "string"
      ? j.detail
      : j.error && typeof j.error === "object"
        ? j.error.message
        : typeof j.error === "string"
          ? j.error
          : j.message;
  const message = `${res.status} ${err ?? "model refused"}`;
  return res.status === 429 || res.status >= 500 ? { kind: "unreachable", message } : { kind: "bad_request", message };
}

/**
 * Open one model round and yield its events as they arrive.
 *
 * Throws GatewayRefused before the first event when the edge would not run
 * it (a preview deployment, the budget, the key, a paused workspace, a bad
 * request, a model that could not be reached); after the stream starts, a
 * broken connection surfaces as an "error" event. A model that could not be
 * reached is asked once more before the refusal is said (the edge has already
 * asked the route's fallback model), unless the turn's own time is up.
 */
export async function* streamModel(call: GatewayCall): AsyncGenerator<GatewayEvent> {
  if (!deployment.providersLive) throw new GatewayRefused({ kind: "preview" });
  if (!edgeConfigured()) throw new GatewayRefused({ kind: "no_key" });
  let res: (Response & { body: ReadableStream<Uint8Array> }) | null = null;
  let sentAt = Date.now();
  for (let attempt = 0; !res; attempt++) {
    sentAt = Date.now();
    let refusal: GatewayRefusal | null = null;
    try {
      const r = await fetch(`${edgeUrl()}/api/admin/llm`, {
        method: "POST",
        headers: edgeHeaders("/api/admin/llm", { workspace: call.tenantId, user: call.userId }),
        body: JSON.stringify({
          tenant_id: call.tenantId,
          user_id: call.userId,
          purpose: call.purpose ?? "ask",
          request: call.request,
        }),
        signal: call.signal,
      });
      if (r.ok && r.body) res = r as Response & { body: ReadableStream<Uint8Array> };
      else refusal = await gatewayRefusalOf(r);
    } catch (e) {
      refusal = { kind: "unreachable", message: e instanceof Error ? e.message : String(e) };
    }
    if (refusal && (refusal.kind !== "unreachable" || attempt > 0 || call.signal?.aborted))
      throw new GatewayRefused(refusal);
  }
  yield { type: "timing", ...serverTiming(res.headers.get("server-timing")), headersMs: Date.now() - sentAt };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      carry += decoder.decode(value, { stream: true });
      const frames = carry.split("\n\n");
      carry = frames.pop() ?? "";
      for (const frame of frames) {
        const ev = parseFrame(frame);
        if (ev) yield ev;
      }
    }
    if (carry.trim()) {
      const ev = parseFrame(carry);
      if (ev) yield ev;
    }
  } catch (e) {
    yield { type: "error", message: e instanceof Error ? e.message : String(e) };
  } finally {
    reader.releaseLock();
  }
}
