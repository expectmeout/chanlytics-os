/**
 * Retell inbound-call webhook — fires when a call arrives on the number, and answers with what the receptionist is
 * told before it speaks: whose facts, whose memory, the greeting, the line a transfer dials (the shell's dynamic
 * variables business_facts, caller_context, greeting and, when the workspace has a line to dial, handoff_number).
 * Auth: voiceDoorAuth("inbound"): Retell's signature, or ?key=<RETELL_FN_SECRET> on the URL until Ruben sets
 * RETELL_DOORS_SIGNED=1; a knock with neither is a 401 that reads nothing and sends nothing, and what each knock that
 * came in carried is logged (voice_door_auth; lib/voice/voice-door-auth.ts says which doors read the secret, what is
 * built and what waits).
 *
 * The door is api/retell-inbound.ts: `door(receiveInboundCall)`, which names the request the platform's way (log.ts).
 * Everything a delivery does is here, in the order the door had it: the knock is checked (voiceDoorAuth), the call
 * routed on the agent it arrived on, and the answer planned by planCallStart; past the key the answer is always 200.
 *
 * FINISHED as a door. It routes on the agent the call arrived on, hands the agent the business's facts and the
 * caller's memory, takes the caller's thread for the length of the call (00132) and proves a test of "keep my number"
 * from the diversion headers. What is not done is not in this file: the shared secret on the URL is still accepted here,
 * and closing it is Ruben's switch, decided by reading `voice_door_auth` on production from 3 October 2026.
 *
 * THIS ENDPOINT SPEAKS STORED CONVERSATION BACK TO A CALLER, so getting the tenant right is not bookkeeping — it
 * decides whose words come out of the agent's mouth. It resolves the tenant from the agent the call arrived on, the
 * same routing every other voice endpoint uses, and when it cannot it returns NO context rather than guessing. A caller
 * treated as new is a small loss; a caller read someone else's conversation is not recoverable.
 *
 * THIS FILE IS THE WIRE, NOT THE JUDGEMENT. What the agent is handed is decided by planCallStart
 * (lib/voice/call-start.ts), which runs over a database in memory in a test; what is left here is the key, the body,
 * the log, the alert's own suppression, and the shape Retell wants back. The same split the texting door, the health
 * route and the OAuth callback use. Past the key the answer is ALWAYS 200. Retell gives this webhook ten seconds and
 * three tries, then connects the call to the agent anyway with the shell's own defaults — so a refusal here costs the
 * caller the business's facts, never the call. The judgement never refuses: every way it can fall short is a fallback
 * variable (FACTS_UNAVAILABLE, CALLER_UNKNOWN) and a line in the log: inbound_ctx_failed (an error) for a read that
 * failed, inbound_ctx_unrouted or inbound_facts_missing (warnings) for an agent nobody routes or a workspace with no
 * persona. A workspace whose billing stopped gets the take-a-message script instead of its facts.
 *
 * Around the judgement it does three things, none fatal to the call:
 *   - An agent nobody routes tells the platform through alertUnroutable, suppressed for fifteen minutes per agent, and
 *     that note is waited for, but no longer than ALERT_BUDGET_MS.
 *   - A caller who already has a thread takes the call's hold on it (claimControl, CALL_CONTROL_S, 00132), so the text
 *     receptionist does not answer the same person on WhatsApp while they are on the phone; a hold that could not be
 *     taken is logged (retell_inbound_hold_failed).
 *   - A test of "keep my number" is proven as the call arrives (markForwardingVerified), with the one thing the call
 *     webhook never sees: the diversion headers (custom_sip_headers).
 * Lines carry the caller's last four digits (from_tail), never the number, with the agent and the call id; the call ends
 * in one retell_inbound with how the facts and the memory were arrived at.
 */
import { phoneTail, divertedNumbers } from "../packages/contracts.js";
import { markForwardingVerified } from "./forwarding.js";
import { json } from "../http.js";
import { pg } from "../pg.js";
import { keepDelivery, signatureHeaders } from "../intake/keep.js";
import { planCallStartWithin } from "./call-start.js";
import { claimControl, CALL_CONTROL_S } from "../packages/db.js";
import { alertUnroutable } from "../whatsapp/alerts.js";
import { logger } from "../log.js";
import { keptUrl, voiceDoorAuth } from "./voice-door-auth.js";

/** How long the unroutable alert may hold the answer. Retell's own ceiling is ten seconds. */
const ALERT_BUDGET_MS = 3_000;

/** The unroutable alert, waited for no longer than ALERT_BUDGET_MS. */
async function alertWithin(agentId: string | undefined): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    alertUnroutable("voice", agentId ?? undefined, 1).catch(() => {}),
    new Promise((r) => {
      timer = setTimeout(r, ALERT_BUDGET_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function receiveInboundCall(request: Request): Promise<Response> {
  const raw = await request.text();
  // The signature, or the ?key= while this door still reads one (voice-door-auth.ts says which doors do, and why).
  if (!voiceDoorAuth("inbound", request, raw).ok) {
    return json(401, { ok: false });
  }
  let body: {
    call_inbound?: {
      call_id?: string;
      from_number?: string;
      to_number?: string;
      agent_id?: string;
      custom_sip_headers?: Record<string, unknown>;
    };
  } = {};
  try {
    body = JSON.parse(raw);
  } catch {
    /* fall through with empty body */
  }
  const inbound = body.call_inbound || {};
  // As Retell sends it, E.164: the "+" is the country code, and planCallStart reads the number whole.
  const from = String(inbound.from_number || "");
  const agentId = inbound.agent_id;

  // The last four digits identify a caller across a log search without
  // writing their number into every line; the call id is what the webhook's
  // later stages carry, so one call reads as one call in the log.
  const L = logger({ from_tail: phoneTail(from), agent_id: agentId, call_id: inbound.call_id });

  // Within its budget (PLAN_BUDGET_MS): past it the call is answered with the shell's own words, never dropped.
  const t0 = Date.now();
  const start = await planCallStartWithin({ agentId, from, db: pg() });
  const planMs = Date.now() - t0;

  if (start.error) L.error("inbound_ctx_failed", { facts: start.facts, memory: start.memory, error: start.error });
  else if (start.facts === "unrouted") L.warn("inbound_ctx_unrouted");
  else if (start.facts === "missing") L.warn("inbound_facts_missing");

  // The four things the answer waits for, each never fatal and none needing another, so they run together (they ran
  // one after another inside Retell's ten seconds, behind the plan): the delivery kept, the platform told, the
  // caller's thread held, a test of "keep my number" proven.
  const db = pg();
  const [, , held] = await Promise.all([
    // Kept under the call's id, before the answer (decision 0032, 00336); a call with no id is nothing to replay. Kept
    // without the ?key= it may have come in on (keptUrl): a ledger row is no place for the secret to every voice door.
    db && inbound.call_id
      ? keepDelivery(db, {
          provider: "retell",
          id: `call_inbound:${inbound.call_id}`,
          door: "/api/retell-inbound",
          url: keptUrl(request),
          tenantId: start.tenantId ?? null,
          headers: signatureHeaders(request, ["x-retell-signature"]),
          body: raw,
        })
      : null,
    // The platform is told, as it is for a text: a call answered with no facts is a customer nobody knows about.
    // Suppressed per agent for fifteen minutes inside alertUnroutable, which is why the judgement says whether they are
    // told rather than telling them. WAITED FOR, up to three seconds: a serverless invocation is frozen the moment it
    // answers, and alertUnroutable claims its window before sending, so a send abandoned mid-flight was neither sent nor
    // re-armed. The timer is cleared whichever side wins, as lib/voice/call-recording.ts does.
    start.alert ? alertWithin(agentId) : null,
    // A call in progress holds the caller's thread (00132), so the text receptionist does not answer the same person on
    // WhatsApp while they are on the phone with us. Only a caller we already know has a thread to hold. Never fatal: a
    // hold we could not take costs the guard, and refusing a call over it would cost the call.
    db && start.tenantId && start.conversationId && inbound.call_id
      ? claimControl(db, {
          tenantId: start.tenantId,
          conversationId: start.conversationId,
          holder: { kind: "call", callId: inbound.call_id },
          seconds: CALL_CONTROL_S,
        }).catch((e: unknown) => {
          L.error("retell_inbound_hold_failed", { error: e instanceof Error ? e.message : String(e) });
          return null;
        })
      : null,
    // A test of "keep my number" is proven here, as the call arrives, with the one thing the call webhook never sees:
    // the diversion headers, which may name the kept number the carrier forwarded from (lib/voice/forwarding.ts). Only a
    // forwarded line inside its test window is read, and it never throws.
    db && start.tenantId && inbound.call_id
      ? markForwardingVerified(db, start.tenantId, {
          fromE164: inbound.from_number ?? null,
          toE164: inbound.to_number ?? null,
          startedAtIso: new Date().toISOString(),
          callId: inbound.call_id,
          diverted: divertedNumbers(inbound.custom_sip_headers),
        })
      : null,
  ]);

  L.info("retell_inbound", {
    facts: start.facts,
    memory: start.memory,
    facts_chars: start.variables.business_facts.length,
    hold: held,
    // How long the call waited, and how much of it was the plan: the budget is Retell's ten seconds.
    plan_ms: planMs,
    late: start.late,
    // Which greeting the caller heard: the standard, the business's own (with the AI clause added or not), paused, or the
    // standard because its own denied being automated (decision 0051). Which words, the version table says.
    greeting: start.greetingSource,
    ms: Date.now() - t0,
  });
  // The workspace's voice, for this call alone (Retell's agent_override): the saved agent is never changed for it. And
  // the settings version the facts were composed from, as the call's metadata, which every later delivery carries: the
  // call webhook writes it on the row (decision 0069, R6).
  return json(200, {
    call_inbound: {
      dynamic_variables: start.variables,
      ...(start.voiceId || start.voiceSpeed !== null
        ? {
            agent_override: {
              agent: {
                ...(start.voiceId ? { voice_id: start.voiceId } : {}),
                ...(start.voiceSpeed !== null ? { voice_speed: start.voiceSpeed } : {}),
              },
            },
          }
        : {}),
      ...(start.configVersion !== null ? { metadata: { config_version: start.configVersion } } : {}),
    },
  });
}
