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

import { parseFrame, type GatewayEvent } from "./stream";

/** The edge deployment, as service.ts names it for steer and whisper. */
import { edgeConfigured, streamEdge, type EdgeBody } from "../edge";
import { deployment } from "../env";
import { MIN_MS, SECOND_MS, finiteOrZero, isEffortMessage, isObjectRecord, recordOrEmpty } from "@chanlytics/contracts";
import type {
  ModelEffort,
  ModelSpeed,
  SkillCraftPurpose,
  SmallJsonPurpose,
  ThinkingType,
  TenantId,
} from "@chanlytics/contracts";

export interface GatewayCall {
  tenantId: TenantId;
  userId: string;
  /**
   * What the key is spent on (GATEWAY_PURPOSES, ask-gateway.ts). Ask's own turn
   * omits it and gets "ask"; a turn's warm (warm.ts) and the lead purposes name
   * themselves, the small JSON calls each its own line of the ledger (contracts SMALL_JSON_PURPOSES). Every purpose may
   * carry a format: Ask's turn answers in ASK_ANSWER_FORMAT.
   */
  purpose?: "ask" | "ask_warm" | "lead_suggest" | SmallJsonPurpose | SkillCraftPurpose;
  request: {
    model?: string;
    max_tokens: number;
    system: unknown;
    /** The person's and the model's turns, and an effort said among them (contracts ai/effort.ts: a draft's). */
    messages: unknown[];
    tools?: unknown[];
    tool_choice?: unknown;
    output_config?: {
      effort?: ModelEffort;
      format?: { type: "json_schema"; schema: Record<string, unknown> };
    };
    /**
     * The cache diagnostics (the Phase 6 plan, D2): the id of the message this request follows on, or null to start a
     * comparison. The API answers on message_start with why this request missed what that one wrote.
     */
    diagnostics?: { previous_message_id: string | null };
    /** Fast mode (contracts ask/model.ts): the edge sends it, with its beta, to a model that runs it. */
    speed?: "fast";
    /** How the model thinks (contracts THINKING_TYPES): Ask's turn sends none, and each model thinks as it does. */
    thinking?: { type: ThinkingType };
    /** Betas the edge lets through (ask-gateway.ts GATEWAY_BETAS); fast mode's is the edge's to add. */
    betas?: string[];
  };
  signal?: AbortSignal;
}

export type GatewayRefusal =
  | { kind: "preview" }
  | { kind: "budget"; used: number; cap: number }
  | { kind: "no_key" }
  /** The workspace is paused, ended or its plan is over: the edge spends nothing (402 payment_required). */
  | { kind: "paused" }
  /** Anthropic has paused this person or workspace, decision 0097: nothing left for it (403 model_paused). */
  | { kind: "model_paused" }
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
 * The speed the edge asked the answering request at (its `x-model-speed`): fast, or standard where fast mode was not
 * asked, the model has none, or fast mode's limit refused it and the edge went on at standard; null from an edge older
 * than fast mode, which says nothing.
 */
function speedOf(header: string | null): ModelSpeed | null {
  return header === "fast" || header === "standard" ? header : null;
}

/**
 * What an answer that is not a stream means: the budget, the key, a paused workspace, a model that could not be
 * reached (a 429 that is not the budget, any 5xx: the model was never heard, so it never "refused"), or the API's
 * refusal of the request itself, whose words the loop reads to drop what the model would not take.
 */
function gatewayRefusalOf(status: number, json: unknown): GatewayRefusal {
  // The edge's refusal (a code, its words in `detail`), or the model's own body forwarded as it came, whose `error`
  // is an object with a message. An answer that is not JSON reads as an empty one.
  const body = recordOrEmpty(json);
  const code = typeof body.error === "string" ? body.error : null;
  if (status === 429 && code === "ask_budget")
    return { kind: "budget", used: finiteOrZero(body.used), cap: finiteOrZero(body.cap) };
  if (status === 503 && code === "no_model_key") return { kind: "no_key" };
  if (status === 402) return { kind: "paused" };
  if (status === 403 && code === "model_paused") return { kind: "model_paused" };
  const err =
    typeof body.detail === "string"
      ? body.detail
      : isObjectRecord(body.error)
        ? body.error.message
        : (code ?? body.message);
  const message = `${status} ${typeof err === "string" ? err : "model refused"}`;
  return status === 429 || status >= 500 ? { kind: "unreachable", message } : { kind: "bad_request", message };
}

/** The breath before the one retry of a model that could not be reached: a throttled or busy one is not asked again in the same instant. */
const RETRY_PAUSE_MS = 400;

/**
 * The longest one round waits for the edge, its stream included: the edge's model door ends at a minute (its
 * maxDuration, apps/edge/vercel.json), so a round never outlives it, and this bound, a little past it, never ends one
 * the platform would not have. The turn's own end is its signal.
 */
const ROUND_BOUND_MS = MIN_MS + 5 * SECOND_MS;

/**
 * The API's refusal of an effort said in the messages (contracts ai/effort.ts), in its own words: what an edge older
 * than them makes of one, since it drops the beta they need ("messages.1.output_config: Extra inputs are not
 * permitted"), or a model that takes none ("requires a model that supports per-turn effort").
 */
const EFFORT_REFUSED = /messages\.\d+\.output_config|per-turn effort/;

/**
 * A request an edge older than the effort messages refused for them, asked again without them: the round runs at the
 * turn's own effort, and the draft is asked as every other turn is, until the edge that lets them through deploys.
 * Null for any other refusal, or a request that carried none.
 */
function withoutEffort(call: GatewayCall, refusal: GatewayRefusal | null): GatewayCall | null {
  if (refusal?.kind !== "bad_request" || !EFFORT_REFUSED.test(refusal.message)) return null;
  if (!call.request.messages.some(isEffortMessage)) return null;
  const messages = call.request.messages.filter((m) => !isEffortMessage(m));
  return { ...call, request: { ...call.request, messages } };
}

const gatewayBody = (call: GatewayCall): EdgeBody<"/api/admin/llm"> => ({
  tenant_id: call.tenantId,
  user_id: call.userId,
  purpose: call.purpose ?? "ask",
  request: call.request,
});

/**
 * Open one model round and yield its events as they arrive.
 *
 * Throws GatewayRefused before the first event when the edge would not run
 * it (a deployment that may not ask the model: a preview or a laptop without
 * EDGE_PROVIDERS=model or live, env.ts modelLive; the budget, the key, a paused
 * workspace, a bad request, a model that could not be reached); after the stream starts, a
 * broken connection surfaces as an "error" event. A model that could not be
 * reached is asked once more before the refusal is said (the edge has already
 * asked the route's fallback model), unless the turn's own time is up; a
 * request refused for its effort messages, once more without them
 * (withoutEffort).
 */
export async function* streamModel(call: GatewayCall): AsyncGenerator<GatewayEvent> {
  if (!deployment.modelLive) throw new GatewayRefused({ kind: "preview" });
  if (!edgeConfigured()) throw new GatewayRefused({ kind: "no_key" });
  let sent = call;
  let res: { body: ReadableStream<Uint8Array>; headers: Headers | null } | null = null;
  let sentAt = Date.now();
  for (let attempt = 0; !res; attempt++) {
    sentAt = Date.now();
    let refusal: GatewayRefusal | null = null;
    const r = await streamEdge("/api/admin/llm", gatewayBody(sent), {
      workspace: call.tenantId,
      user: call.userId,
      timeoutMs: ROUND_BOUND_MS,
      ...(call.signal ? { signal: call.signal } : {}),
    });
    if (r.body) res = { body: r.body, headers: r.headers };
    else if (r.status === 0) refusal = { kind: "unreachable", message: r.error ?? "no answer" };
    else refusal = gatewayRefusalOf(r.status, r.json);
    const plain = withoutEffort(sent, refusal);
    if (plain) {
      sent = plain;
      attempt--;
      continue;
    }
    if (refusal && (refusal.kind !== "unreachable" || attempt > 0 || call.signal?.aborted))
      throw new GatewayRefused(refusal);
    if (refusal) await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS));
  }
  yield {
    type: "timing",
    ...serverTiming(res.headers?.get("server-timing") ?? null),
    headersMs: Date.now() - sentAt,
    speed: speedOf(res.headers?.get("x-model-speed") ?? null),
  };
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
