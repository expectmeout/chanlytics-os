/**
 * Run the receptionist on a set of messages, for one workspace, and hand
 * back what it would have said — nothing is sent, nothing is written.
 *
 * The evaluation harness. The model key lives on the edge and nowhere else,
 * so this is where a prompt or config change is exercised against the real
 * composed prompt: the runner (tooling/scripts/eval-brain.mjs) posts a case
 * set, gets the record for each (reply, intent, escalate, confidence, facts,
 * language, tokens, latency), and judges it locally against the case's
 * expectations. Internal endpoint — x-diag-key.
 *
 * Small on purpose: at most six cases per request, sequential, inside the
 * function's budget; the runner batches. Body: { tenant_id, cases: [{ id,
 * text, history? }] } where history is prior turns [{ role, content }].
 */
import { json } from "../../lib/http.js";
import { authorizeAdmin, workspaceFor } from "../../lib/admin-auth.js";
import { pg } from "../../lib/pg.js";
import { loadTenantRuntime } from "../../lib/tenant-runtime.js";
import { resolveSystemPrompt, describeNow, fallbackMessages } from "../../lib/packages/contracts.js";
import type { RoutedChannel } from "../../lib/packages/db.js";
import { generateReply } from "../../lib/receptionist/brain.js";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/log.js";

const L = logger();

const MAX_CASES = 6;
const MAX_CHARS = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface EvalCase {
  id: string;
  text: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

/**
 * The model as a port, as on the steer door. Production passes nothing and
 * gets the real brain; a test hands in an answer, because lib/brain.ts speaks
 * to the Anthropic SDK and has no seam of its own. Anything else that may
 * arrive in this position carries no generateReply and changes nothing. BOTH
 * branches are run in tooling/scripts/tests/eval-door.test.mjs: most cases
 * hand a brain in, and the last two call POST the way Vercel calls it and
 * watch the real brain reach the model.
 */
export interface BrainPort {
  generateReply?: typeof generateReply;
}

export async function POST(request: Request, brain?: BrainPort | null): Promise<Response> {
  const ask = brain?.generateReply ?? generateReply;
  const auth = authorizeAdmin(request, "/api/admin/eval");
  if (!auth.ok) return auth.response;
  if (!env.ANTHROPIC_API_KEY) return json(503, { ok: false, error: "no_model_key" });

  let body: { tenant_id?: string; cases?: EvalCase[] } = {};
  try {
    body = JSON.parse(await request.text());
  } catch {
    /* below */
  }
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  body.tenant_id = ws.tenantId ?? undefined;
  const tenantId = String(body.tenant_id || "");
  const cases = Array.isArray(body.cases) ? body.cases : [];
  if (!UUID.test(tenantId) || !cases.length || cases.length > MAX_CASES) {
    return json(400, { ok: false, error: `tenant_id and 1-${MAX_CASES} cases required` });
  }
  for (const c of cases) {
    if (!c || typeof c.id !== "string" || typeof c.text !== "string" || !c.text.trim() || c.text.length > MAX_CHARS) {
      return json(400, { ok: false, error: `each case needs an id and a text of 1-${MAX_CHARS} chars` });
    }
    if (
      c.history &&
      (!Array.isArray(c.history) ||
        c.history.length > 12 ||
        c.history.some((h) => !h || (h.role !== "user" && h.role !== "assistant") || typeof h.content !== "string"))
    ) {
      return json(400, { ok: false, error: "history is up to 12 turns of { role, content }" });
    }
  }

  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });
  // The tenant's WhatsApp channel, as the webhook would route it.
  const { data: ch, error } = await db
    .from("tenant_channels")
    .select("id, tenant_id, kind, status, number_e164, credentials_ref, config, external_id")
    .eq("tenant_id", tenantId)
    .eq("kind", "whatsapp")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) return json(500, { ok: false, error: "channel_read_failed" });
  if (!ch) return json(404, { ok: false, error: "no_whatsapp_channel" });
  const routed: RoutedChannel = {
    channelId: ch.id,
    tenantId: ch.tenant_id,
    kind: ch.kind,
    externalId: ch.external_id,
    numberE164: ch.number_e164,
    credentialsRef: ch.credentials_ref,
    config: ch.config,
  };
  const rt = await loadTenantRuntime(db, routed);
  if (!rt.brain) return json(409, { ok: false, error: rt.configBroken ? "config_broken" : "no_persona" });

  const system = resolveSystemPrompt(rt.brain, "whatsapp", rt.timezone, new Date(), rt.policy, rt.known);
  const nowNote = describeNow(rt.timezone, new Date(), rt.brain.profile?.closures);
  // The holding message as a customer would get it, its details filled as they are now (S5).
  const holding = fallbackMessages(rt.brain, rt.known).error;
  const started = Date.now();
  const results = [];
  for (const c of cases) {
    const t0 = Date.now();
    try {
      const r = await ask(c.history ?? [], c.text, system, holding, undefined, nowNote);
      results.push({
        id: c.id,
        ok: true,
        text: r.text,
        escalate: r.escalate,
        reason: r.reason ?? null,
        meta: r.meta ?? null,
        usage: r.usage ?? null,
        ms: Date.now() - t0,
      });
    } catch (e) {
      results.push({
        id: c.id,
        ok: false,
        error: String(e instanceof Error ? e.message : e).slice(0, 200),
        ms: Date.now() - t0,
      });
    }
  }
  // The texts are the model's and stay out of the log; the count and the
  // time are what a search needs.
  L.info("admin_eval", {
    tenant: tenantId,
    cases: cases.length,
    ms: Date.now() - started,
    prompt_chars: system.length,
  });
  return json(200, { ok: true, prompt_chars: system.length, timezone: rt.timezone, results });
}
