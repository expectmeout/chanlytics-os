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
import { phoneTail } from "../lib/packages/contracts.js";
import { json } from "../lib/http.js";
import { pg } from "../lib/pg.js";
import { planCallStart } from "../lib/call-start.js";
import { claimControl, CALL_CONTROL_S } from "../lib/packages/db.js";
import { alertUnroutable } from "../lib/whatsapp/alerts.js";
import { logger } from "../lib/log.js";
import { env } from "../lib/env.js";

/** How long the unroutable alert may hold the answer. Retell's own ceiling is ten seconds. */
const ALERT_BUDGET_MS = 3_000;

export async function POST(request: Request): Promise<Response> {
  // An unset or empty secret matches nothing: an empty key must never open this
  // door because the configured secret is empty too. retell-webhook.ts guards
  // the same variable the same way.
  const secret = env.RETELL_FN_SECRET;
  if (!secret || new URL(request.url).searchParams.get("key") !== secret) {
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
  // told rather than telling them.
  //
  // WAITED FOR, up to three seconds. It was fired and forgotten because Retell
  // gives this webhook ten -- but a serverless invocation is frozen the moment
  // it answers, and nothing here registers a waitUntil, so the send was
  // abandoned mid-flight. Worse, alertUnroutable claims its fifteen-minute
  // window BEFORE sending and gives it back only on a failure it never lived
  // to see: the alarm was neither sent nor re-armed. The race keeps the
  // provider's budget while making the common case -- a Resend POST, well
  // under a second -- actually happen.
  if (start.alert) {
    // The timer is cleared whichever side wins, as lib/call-recording.ts does:
    // the common case is a send well under a second, and leaving three seconds
    // of timer armed behind the answer is the same class of thing this await
    // exists to stop.
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      alertUnroutable("voice", agentId ?? undefined, 1).catch(() => {}),
      new Promise((r) => { timer = setTimeout(r, ALERT_BUDGET_MS); }),
    ]).finally(() => clearTimeout(timer));
  }

  // A call in progress holds the caller's thread (00132), so the text
  // receptionist does not answer the same person on WhatsApp while they are on
  // the phone with us -- two of our own agents, one customer, the same minute.
  // Only a caller we already know has a thread to hold; a first-time caller has
  // nothing to collide with. Never fatal: a hold we could not take costs the
  // guard, and refusing a call over it would cost the call.
  let held: string | null = null;
  const db = pg();
  if (db && start.tenantId && start.conversationId && inbound.call_id) {
    held = await claimControl(db, {
      tenantId: start.tenantId,
      conversationId: start.conversationId,
      holder: { kind: "call", callId: inbound.call_id },
      seconds: CALL_CONTROL_S,
    }).catch((e: unknown) => {
      L.error("retell_inbound_hold_failed", { error: e instanceof Error ? e.message : String(e) });
      return null;
    });
  }

  L.info("retell_inbound", { facts: start.facts, memory: start.memory, facts_chars: start.variables.business_facts.length, hold: held });
  return json(200, { call_inbound: { dynamic_variables: start.variables } });
}
