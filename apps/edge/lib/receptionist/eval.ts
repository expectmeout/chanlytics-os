/**
 * Run the receptionist on a set of messages, for one workspace, and hand
 * back what it would have said — nothing is sent, nothing is written.
 *
 * The door is api/admin/eval.ts: it checks who may knock (authorizeAdmin) and reads the body, then hands this the knock
 * (`auth`) and what the body carried; everything after is here, in the order the door had it.
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
 * text, history? }] } where history is prior turns [{ role, content }]. The
 * answer carries the prices the workspace may say (allowed_prices, contracts
 * priceAllowance; null for the strict rule), so the runner judges a price
 * against the workspace's own switch.
 */
import { json, refuse } from "../http.js";
import { workspaceFor, type Admitted } from "../admin-auth.js";
import { pg } from "../pg.js";
import { loadTenantRuntime, type TenantRuntime } from "../tenant-runtime.js";
import { openingsFor, takesRequests } from "../calendar/availability.js";
import { resolveSystemPrompt, describeNow, fallbackMessages, priceAllowance, UUID } from "../packages/contracts.js";
import { oldestActiveChannel } from "../packages/db.js";
import { brainCallOf, generateReply } from "./brain.js";
import { env } from "../env.js";
import { logger } from "../log.js";

const MAX_CASES = 6;

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

/**
 * The door's answer: what the receptionist said, case by case, and the prices the workspace may say
 * (allowed_prices, contracts priceAllowance; null for the strict rule), so the runner judges by the workspace's switch.
 * The allowance is read at `now`, the clock the cases' prompt was composed at: a note that has ended lends it nothing.
 */
function evalAnswer(
  rt: Awaited<ReturnType<typeof loadTenantRuntime>>,
  now: Date,
  promptChars: number,
  results: readonly unknown[],
): Response {
  const allowed = priceAllowance(rt.brain, rt.timezone, now);
  return json(200, {
    ok: true,
    prompt_chars: promptChars,
    timezone: rt.timezone,
    allowed_prices: allowed ? [...allowed] : null,
    results,
  });
}

/**
 * What the live turn is told beside the prompt, and may write (core model-turn.ts): the clock and the open times, and,
 * where the workspace takes booking requests, the two fields a time picked is written in, and what it wrote (decision
 * 0061). A workspace with no calendar is told the clock alone, as before; one that takes no requests answers as before.
 */
async function turnOf(rt: TenantRuntime, now: Date) {
  const openings = await openingsFor(rt, "chat", now);
  const clock = describeNow(rt.timezone, now, rt.brain?.profile?.closures);
  const takes = takesRequests(rt);
  return {
    nowNote: openings
      ? `${clock}

${openings}`
      : clock,
    asks: takes ? { bookingRequests: true } : {},
    said: (r: { booking?: { slot: string; service: string } }) =>
      takes ? { takes_requests: true, booking: r.booking ?? null } : {},
  };
}

export async function evaluateCases(
  auth: Admitted,
  body: Partial<{ tenant_id?: string; cases?: EvalCase[] }>,
  brain?: BrainPort | null,
): Promise<Response> {
  const L = logger();
  const MAX_CHARS = 500;
  const ask = brain?.generateReply ?? generateReply;
  if (!env.ANTHROPIC_API_KEY) return refuse(503, "no_model_key");
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  body.tenant_id = ws.tenantId ?? undefined;
  const tenantId = String(body.tenant_id || "");
  const cases = Array.isArray(body.cases) ? body.cases : [];
  if (!UUID.test(tenantId) || !cases.length || cases.length > MAX_CASES) {
    return refuse(400, "bad_request", `tenant_id and 1-${MAX_CASES} cases required`);
  }
  for (const c of cases) {
    if (!c || typeof c.id !== "string" || typeof c.text !== "string" || !c.text.trim() || c.text.length > MAX_CHARS) {
      return refuse(400, "bad_request", `each case needs an id and a text of 1-${MAX_CHARS} chars`);
    }
    if (
      c.history &&
      (!Array.isArray(c.history) ||
        c.history.length > 12 ||
        c.history.some((h) => !h || (h.role !== "user" && h.role !== "assistant") || typeof h.content !== "string"))
    ) {
      return refuse(400, "bad_request", "history is up to 12 turns of { role, content }");
    }
  }

  const db = pg();
  if (!db) return refuse(503, "no_database");
  // The tenant's WhatsApp channel, as the webhook would route it: its oldest active one, where it holds two.
  const routed = await oldestActiveChannel(db, tenantId, "whatsapp").catch(() => undefined);
  if (routed === undefined) return refuse(500, "channel_read_failed");
  if (!routed) return refuse(404, "no_whatsapp_channel");
  const rt = await loadTenantRuntime(db, routed);
  if (!rt.brain) return refuse(409, rt.configBroken ? "config_broken" : "no_persona");
  const now = new Date(); // the run's one clock: the prompt, the clock note, the prices it may say, and its timing
  const system = resolveSystemPrompt(rt.brain, "whatsapp", rt.timezone, now, rt.policy, rt.known);
  const { nowNote, asks, said } = await turnOf(rt, now);
  // The holding message as a customer would get it, its details filled as they are now (S5).
  const holding = fallbackMessages(rt.brain, rt.known).error;
  const call = { ...brainCallOf(tenantId, rt), ...asks };
  const results = [];
  for (const c of cases) {
    const t0 = Date.now();
    try {
      const r = await ask(c.history ?? [], c.text, system, holding, undefined, nowNote, undefined, undefined, call);
      results.push({
        id: c.id,
        ok: true,
        text: r.text,
        escalate: r.escalate,
        reason: r.reason ?? null,
        meta: r.meta ?? null,
        usage: r.usage ?? null,
        ms: Date.now() - t0,
        ...said(r),
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
  // The texts are the model's and stay out of the log; the count and the time are what a search needs.
  L.info("admin_eval", {
    tenant_id: tenantId,
    cases: cases.length,
    ms: Date.now() - now.getTime(),
    prompt_chars: system.length,
  });
  return evalAnswer(rt, now, system.length, results);
}
