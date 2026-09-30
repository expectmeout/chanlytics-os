/**
 * POST /api/admin/llm — the model gateway for the workspace assistant.
 *
 * The dashboard builds the whole request (system, messages, tools) and runs
 * the tools itself as the signed-in person; this edge only spends the key and
 * keeps the count. The response is the API's own event stream, forwarded as
 * it arrives, so the palette shows the answer's first words while the rest
 * is still being written. Ask's own daily budget is checked here, apart from
 * the receptionist's, and refused with 429 when spent.
 *
 * The request leaves through the model port (lib/model.ts, channels' adapter): the registry's route for the purpose
 * (Ask's, or the small JSON drafts'), asked once of its fallback model when the first gives no answer before the stream
 * starts (a 529, a 5xx, a timeout). An answer that never came is this door's own refusal, `model_unreachable` at 503, so
 * the dashboard says the model could not be reached, never that it refused; the API's refusal of the request itself
 * (a 400) is forwarded in its own shape, which the dashboard reads to drop what the model would not take. A workspace
 * paused, ended or unbilled spends nothing (402 payment_required), and a day that could not be counted holds the turn
 * (503 read_failed). Every round is written to the usage ledger with the model that answered and its dollars.
 *
 * Diagnostic-key only: the dashboard is the sole caller, exactly as it is for
 * steer and whisper.
 */
import { json, refuse } from "../../lib/http.js";
import { readBody } from "../../lib/admin-door.js";
import { authorizeAdmin, workspaceFor } from "../../lib/admin-auth.js";
import { pg } from "../../lib/pg.js";
import { ASK_TOKENS_DAY, MIN_MS, MODEL_ROUTES, NO_USAGE, usageOf } from "../../lib/packages/contracts.js";
import {
  GATEWAY_MAX_BODY,
  GATEWAY_PURPOSES,
  askTokensLast24h,
  modelPurposeOf,
  recordAskUsage,
  teeUsage,
  validateGatewayRequest,
} from "../../lib/ask-gateway.js";
import type { GatewayPurpose } from "../../lib/ask-gateway.js";
import { mayUseModelFor, recordCall, streamModelCall } from "../../lib/model.js";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/log.js";

const L = logger();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * The day's count per workspace, kept a minute per instance. A turn is two
 * rounds and each was a database read before the model was even asked; a
 * spent budget is still refused within the minute, and the count itself is
 * written on every round regardless.
 */
const budgetSeen = new Map<string, { at: number; used: number }>();
const BUDGET_TTL_MS = MIN_MS;

export async function POST(request: Request): Promise<Response> {
  const tIn = Date.now();
  const auth = await authorizeAdmin(request, "/api/admin/llm");
  if (!auth.ok) return auth.response;
  if (!env.ANTHROPIC_API_KEY) return refuse(503, "no_model_key");

  const raw = await request.text();
  if (raw.length > GATEWAY_MAX_BODY) return refuse(413, "too_large");
  const body = await readBody<{ tenant_id?: string; user_id?: string; purpose?: string; request?: unknown }>(raw);
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  body.tenant_id = ws.tenantId ?? undefined;
  const tenantId = String(body.tenant_id || "");
  const userId = String(body.user_id || "");
  if (
    !UUID.test(tenantId) ||
    !UUID.test(userId) ||
    !(GATEWAY_PURPOSES as readonly string[]).includes(String(body.purpose))
  ) {
    return refuse(400, "bad_request", "tenant_id, user_id and a purpose required");
  }
  const purpose = body.purpose as GatewayPurpose;
  const v = validateGatewayRequest(body.request, purpose);
  if (!v.ok) return refuse(400, v.error, v.detail);

  const db = pg();
  if (!db) return refuse(503, "no_database");
  const modelPurpose = modelPurposeOf(purpose);
  if (!(await mayUseModelFor(modelPurpose, tenantId))) {
    L.warn("ask_gateway_may_not_spend", { tenant: tenantId, purpose });
    return refuse(402, "payment_required", "Ask is off while this workspace is paused or its plan has ended.");
  }
  const seen = budgetSeen.get(tenantId);
  let used: number;
  if (seen && Date.now() - seen.at < BUDGET_TTL_MS) used = seen.used;
  else {
    const read = await askTokensLast24h(db, tenantId);
    if (read === null) return refuse(503, "read_failed", "Ask's day could not be counted just now.");
    used = read;
    budgetSeen.set(tenantId, { at: Date.now(), used });
  }
  if (used >= ASK_TOKENS_DAY) {
    L.warn("ask_budget_spent", { tenant: tenantId, used, cap: ASK_TOKENS_DAY });
    return json(429, { ok: false, error: "ask_budget", used, cap: ASK_TOKENS_DAY });
  }

  const t0 = Date.now();
  const gatewayMs = t0 - tIn;
  const { model: asked, ...rest } = v.request;
  // The whole call, the fallback's try included, inside the function's sixty seconds (vercel.json).
  const up = await streamModelCall({
    purpose: modelPurpose,
    model: asked,
    body: rest,
    deadlineMs: MODEL_ROUTES[modelPurpose].timeoutMs,
  });
  if (!up) return refuse(503, "no_model_key");
  if (up.outcome !== "ok") {
    const forWhom = { tenantId, userId };
    await recordCall(modelPurpose, { asked: up.asked, model: up.model, outcome: up.outcome, usage: NO_USAGE }, forWhom);
    if (up.outcome === "unreachable") {
      L.error("ask_gateway_unreachable", { status: up.status, error: up.error.slice(0, 200), fell_back: up.fellBack });
      return refuse(503, "model_unreachable", `model ${up.status || "timeout"}`);
    }
    L.error("ask_gateway_refused", { status: up.status, body: up.detail });
    // The API's refusal of the request, in its own shape: the dashboard reads its message.
    return new Response(
      JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: up.error } }),
      {
        status: up.status,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      },
    );
  }
  if (up.fellBack) L.warn("ask_gateway_fell_back", { tenant: tenantId, asked: up.asked, model: up.model });
  // The hop through this edge (the Phase 6 plan, D3): its own time before it asked the model, and the model's time to
  // its headers, said in server-timing so the dashboard can take both from its own wait without comparing clocks.
  const modelMs = Date.now() - t0;
  const stream = teeUsage(up.body, async (usage, stopReason) => {
    const latency = Date.now() - t0;
    L.info("ask_gateway_turn", {
      tenant: tenantId,
      ...usage,
      model: up.model,
      stop_reason: stopReason,
      ms: latency,
      gateway_ms: gatewayMs,
      model_headers_ms: modelMs,
    });
    await recordAskUsage(db, tenantId, userId, {
      ...usage,
      model: up.model,
      latency_ms: latency,
      stop_reason: stopReason,
      stream: true,
      purpose,
    });
    await recordCall(
      modelPurpose,
      {
        asked: up.asked,
        model: up.model,
        outcome: stopReason === "refusal" ? "refused" : up.fellBack ? "fell_back" : "answered",
        usage: usageOf(usage),
      },
      { tenantId, userId },
    );
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
      "server-timing": `gateway;dur=${gatewayMs}, model;dur=${modelMs}`,
    },
  });
}
