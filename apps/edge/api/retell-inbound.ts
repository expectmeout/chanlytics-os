/**
 * Retell inbound-call webhook — fires when a call arrives on the number, and
 * answers with what the receptionist is told before it speaks: whose facts,
 * whose memory, the greeting, the line a transfer dials.
 * Auth: ?key=<RETELL_FN_SECRET> on the URL.
 *
 * THIS ENDPOINT SPEAKS STORED CONVERSATION BACK TO A CALLER, so getting the
 * tenant right is not bookkeeping — it decides whose words come out of the
 * agent's mouth. It resolves the tenant from the agent the call arrived on,
 * the same routing every other voice endpoint uses, and when it cannot it
 * returns NO context rather than guessing. A caller treated as new is a small
 * loss; a caller read someone else's conversation is not recoverable.
 *
 * THIS FILE IS THE WIRE, NOT THE JUDGEMENT. What the agent is handed is
 * decided by planCallStart (lib/call-start.ts), which runs over a database in
 * memory in a test; what is left here is the key, the body, the log, the
 * alert's own suppression, and the shape Retell wants back. The same split
 * the texting door, the health route and the OAuth callback use.
 *
 * ALWAYS 200. Retell gives this webhook ten seconds and three tries, then
 * connects the call to the agent anyway with the shell's own defaults — so a
 * refusal here costs the caller the business's facts, never the call. The
 * judgement never refuses: every way it can fall short is a fallback variable
 * and a line in the log.
 */
import { phoneTail } from "../lib/workspace/contracts.js";
import { json } from "../lib/http.js";
import { pg } from "../lib/pg.js";
import { planCallStart } from "../lib/call-start.js";
import { alertUnroutable } from "../lib/whatsapp/alerts.js";
import { logger } from "../lib/log.js";

export async function POST(request: Request): Promise<Response> {
  if (new URL(request.url).searchParams.get("key") !== process.env.RETELL_FN_SECRET) {
    return json(401, { ok: false });
  }
  const raw = await request.text();
  let body: { call_inbound?: { call_id?: string; from_number?: string; agent_id?: string } } = {};
  try { body = JSON.parse(raw); } catch { /* fall through with empty body */ }
  const inbound = body.call_inbound || {};
  const from = String(inbound.from_number || "").replace(/^\+/, "");
  const agentId = inbound.agent_id;

  // The last four digits identify a caller across a log search without
  // writing their number into every line; the call id is what the webhook's
  // later stages carry, so one call reads as one call in the log.
  const L = logger({ from_tail: phoneTail(from), agent_id: agentId, call_id: inbound.call_id });

  const start = await planCallStart({ agentId, from, db: pg() });

  if (start.error) L.error("inbound_ctx_failed", { facts: start.facts, memory: start.memory, error: start.error });
  else if (start.facts === "unrouted") L.warn("inbound_ctx_unrouted");
  else if (start.facts === "missing") L.warn("inbound_facts_missing");
  // The platform is told, as it is for a text: a call answered with no facts
  // is a customer nobody knows about. Suppressed per agent for fifteen minutes
  // inside alertUnroutable, which is why the judgement says whether they are
  // told rather than telling them. Never waited for -- Retell gives this
  // webhook ten seconds.
  if (start.alert) void alertUnroutable("voice", agentId ?? undefined, 1).catch(() => {});

  L.info("retell_inbound", { facts: start.facts, memory: start.memory, facts_chars: start.variables.business_facts.length });
  return json(200, { call_inbound: { dynamic_variables: start.variables } });
}
