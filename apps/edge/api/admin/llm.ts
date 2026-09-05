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
import { json } from "../../lib/http.js";
import { pg } from "../../lib/pg.js";
import { ASK_TOKENS_DAY } from "../../lib/workspace/contracts.js";
import {
  GATEWAY_MAX_BODY,
  askTokensLast24h,
  recordAskUsage,
  teeUsage,
  validateGatewayRequest,
} from "../../lib/ask-gateway.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const API = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";

export async function POST(request: Request): Promise<Response> {
  if (!process.env.DIAG_KEY || request.headers.get("x-diag-key") !== process.env.DIAG_KEY) {
    return json(403, { ok: false });
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json(503, { ok: false, error: "no_model_key" });

  const raw = await request.text();
  if (raw.length > GATEWAY_MAX_BODY) return json(413, { ok: false, error: "too_large" });
  let body: { tenant_id?: string; user_id?: string; purpose?: string; request?: unknown } = {};
  try { body = JSON.parse(raw); } catch { /* below */ }
  const tenantId = String(body.tenant_id || "");
  const userId = String(body.user_id || "");
  if (!UUID.test(tenantId) || !UUID.test(userId) || body.purpose !== "ask") {
    return json(400, { ok: false, error: "tenant_id, user_id and purpose 'ask' required" });
  }
  const v = validateGatewayRequest(body.request);
  if (!v.ok) return json(400, { ok: false, error: v.error });

  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });
  const used = await askTokensLast24h(db, tenantId);
  if (used >= ASK_TOKENS_DAY) {
    console.warn("ask_budget_spent", JSON.stringify({ tenant: tenantId, used, cap: ASK_TOKENS_DAY }));
    return json(429, { ok: false, error: "ask_budget", used, cap: ASK_TOKENS_DAY });
  }

  const t0 = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": VERSION },
      body: JSON.stringify({ ...v.request, stream: true }),
      signal: AbortSignal.timeout(55_000),
    });
  } catch (e) {
    console.error("ask_gateway_unreachable", JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    return json(502, { ok: false, error: "model_unreachable" });
  }
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    console.error("ask_gateway_refused", JSON.stringify({ status: upstream.status, body: text.slice(0, 300) }));
    return new Response(text || JSON.stringify({ ok: false, error: `model ${upstream.status}` }), {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  const stream = teeUsage(upstream.body, async (usage, stopReason) => {
    const latency = Date.now() - t0;
    console.log("ask_gateway_turn", JSON.stringify({ tenant: tenantId, ...usage, stop_reason: stopReason, ms: latency }));
    await recordAskUsage(db, tenantId, userId, { ...usage, model: v.request.model, latency_ms: latency, stop_reason: stopReason, stream: true });
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
