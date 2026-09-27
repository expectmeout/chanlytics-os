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
  };
  signal?: AbortSignal;
}

export type GatewayRefusal =
  | { kind: "preview" }
  | { kind: "budget"; used: number; cap: number }
  | { kind: "no_key" }
  | { kind: "bad_request"; message: string }
  | { kind: "unreachable"; message: string };

export class GatewayRefused extends Error {
  constructor(public refusal: GatewayRefusal) {
    super(`gateway refused: ${refusal.kind}`);
  }
}

/**
 * Open one model round and yield its events as they arrive.
 *
 * Throws GatewayRefused before the first event when the edge would not run
 * it (a preview deployment, the budget, the key, a bad request); after the
 * stream starts, a broken connection surfaces as an "error" event.
 */
export async function* streamModel(call: GatewayCall): AsyncGenerator<GatewayEvent> {
  if (!deployment.providersLive) throw new GatewayRefused({ kind: "preview" });
  if (!edgeConfigured()) throw new GatewayRefused({ kind: "no_key" });
  let res: Response;
  try {
    res = await fetch(`${edgeUrl()}/api/admin/llm`, {
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
  } catch (e) {
    throw new GatewayRefused({ kind: "unreachable", message: e instanceof Error ? e.message : String(e) });
  }
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => ({}))) as {
      error?: unknown;
      used?: number;
      cap?: number;
      message?: string;
    };
    if (res.status === 429 && j.error === "ask_budget")
      throw new GatewayRefused({ kind: "budget", used: j.used ?? 0, cap: j.cap ?? 0 });
    if (res.status === 503 && j.error === "no_model_key") throw new GatewayRefused({ kind: "no_key" });
    const err =
      j.error && typeof j.error === "object"
        ? (j.error as { message?: string }).message
        : typeof j.error === "string"
          ? j.error
          : j.message;
    throw new GatewayRefused({ kind: "bad_request", message: `${res.status} ${err ?? "model refused"}` });
  }
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
