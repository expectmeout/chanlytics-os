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
 * Diagnostic-key only: the dashboard is the sole caller, exactly as it is for
 * steer and whisper.
 */
import { json, refuse } from "../../lib/http.js";
import { readBody } from "../../lib/admin-door.js";
import { authorizeAdmin, workspaceFor } from "../../lib/admin-auth.js";
import { pg } from "../../lib/pg.js";
import { ASK_TOKENS_DAY, MIN_MS, type EdgeRefusal } from "../../lib/packages/contracts.js";
import {
  GATEWAY_MAX_BODY,
  GATEWAY_PURPOSES,
  askTokensLast24h,
  recordAskUsage,
  teeUsage,
  validateGatewayRequest,
} from "../../lib/ask-gateway.js";
import type { GatewayPurpose } from "../../lib/ask-gateway.js";
import { env } from "../../lib/env.js";
import { logger, errField } from "../../lib/log.js";

const L = logger();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const API = "https://api.anthropic.com/v1/messages";
/**
 * The day's count per workspace, kept a minute per instance. A turn is two
 * rounds and each was a database read before the model was even asked; a
 * spent budget is still refused within the minute, and the count itself is
 * written on every round regardless.
 */
const budgetSeen = new Map<string, { at: number; used: number }>();
const BUDGET_TTL_MS = MIN_MS;
const VERSION = "2023-06-01";
/** The model's answer is given this long, inside the function's sixty seconds (vercel.json). */
const UPSTREAM_TIMEOUT_MS = 55_000;

export async function POST(request: Request): Promise<Response> {
  const tIn = Date.now();
  const auth = authorizeAdmin(request, "/api/admin/llm");
  if (!auth.ok) return auth.response;
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return refuse(503, "no_model_key");

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
  const seen = budgetSeen.get(tenantId);
  let used: number;
  if (seen && Date.now() - seen.at < BUDGET_TTL_MS) used = seen.used;
  else {
    used = await askTokensLast24h(db, tenantId);
    budgetSeen.set(tenantId, { at: Date.now(), used });
  }
  if (used >= ASK_TOKENS_DAY) {
    L.warn("ask_budget_spent", { tenant: tenantId, used, cap: ASK_TOKENS_DAY });
    return json(429, { ok: false, error: "ask_budget", used, cap: ASK_TOKENS_DAY });
  }

  const t0 = Date.now();
  const gatewayMs = t0 - tIn;
  let upstream: Response;
  try {
    upstream = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": VERSION },
      body: JSON.stringify({ ...v.request, stream: true }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (e) {
    L.error("ask_gateway_unreachable", { error: errField(e) });
    return refuse(502, "model_unreachable");
  }
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    L.error("ask_gateway_refused", { status: upstream.status, body: text.slice(0, 300) });
    // The model's own refusal is forwarded as it came, in its own shape (the dashboard reads its message); a refusal
    // with no body is this door's, in the one envelope.
    const own: EdgeRefusal = { ok: false, error: "model_failed", detail: `model ${upstream.status}` };
    return new Response(text || JSON.stringify(own), {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  // The hop through this edge (the Phase 6 plan, D3): its own time before it asked the model, and the model's time to
  // its headers, said in server-timing so the dashboard can take both from its own wait without comparing clocks.
  const modelMs = Date.now() - t0;
  const stream = teeUsage(upstream.body, async (usage, stopReason) => {
    const latency = Date.now() - t0;
    L.info("ask_gateway_turn", {
      tenant: tenantId,
      ...usage,
      stop_reason: stopReason,
      ms: latency,
      gateway_ms: gatewayMs,
      model_headers_ms: modelMs,
    });
    await recordAskUsage(db, tenantId, userId, {
      ...usage,
      model: v.request.model,
      latency_ms: latency,
      stop_reason: stopReason,
      stream: true,
      purpose,
    });
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
