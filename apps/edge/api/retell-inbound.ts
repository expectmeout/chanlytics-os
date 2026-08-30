/**
 * Retell inbound-call webhook — fires when a call arrives on the number.
 * Looks up the caller's cross-channel history and injects a compact summary as
 * a dynamic variable the voice prompt reads from.
 * Auth: ?key=<RETELL_FN_SECRET> on the URL.
 *
 * THIS ENDPOINT SPEAKS STORED CONVERSATION BACK TO A CALLER, so getting the
 * tenant right is not bookkeeping — it decides whose words come out of the
 * agent's mouth. It previously read the thread store keyed on the caller's bare
 * phone number with no tenant resolution of any kind, so a customer shared
 * between two businesses would have had the last six turns of one business's
 * WhatsApp conversation read into the other's phone call.
 *
 * It now resolves the tenant from the agent the call arrived on — the same
 * routing every other voice endpoint uses — and when it cannot, it returns NO
 * context rather than guessing. A caller treated as new is a small loss; a
 * caller read someone else's conversation is not recoverable.
 */
import { normalizePhone, resolveSystemPrompt, describeNow } from "../lib/workspace/contracts.js";
import { json } from "../lib/http.js";
import { pg } from "../lib/pg.js";
import { resolveChannel, readLeadContext, describeLead } from "../lib/workspace/db.js";
import { loadTenantRuntime } from "../lib/tenant-runtime.js";
import { logger } from "../lib/log.js";

/**
 * What the agent is told when the business's own facts could not be read.
 *
 * It must never be omitted and never be empty. Retell leaves an unsupplied
 * variable in the prompt AS the literal `{{business_facts}}`, and treats ""
 * as a real value that also skips the agent-level default — so the two ways
 * of saying "we have nothing" are an agent reading its own placeholder aloud,
 * or an agent with no knowledge and no idea that it has none. This is the
 * third option: no facts, and told so.
 */
const FACTS_UNAVAILABLE =
  "The business's details could not be loaded for this call. Do not state opening hours, prices, services or an address from memory — you do not have them. Say you will have someone confirm, offer to take a message, and offer to text the booking link.";

export async function POST(request: Request): Promise<Response> {
  if (new URL(request.url).searchParams.get("key") !== process.env.RETELL_FN_SECRET) {
    return json(401, { ok: false });
  }
  const raw = await request.text();
  let body: { call_inbound?: { from_number?: string; agent_id?: string } } = {};
  try { body = JSON.parse(raw); } catch { /* fall through with empty body */ }
  const inbound = body.call_inbound || {};
  const from = String(inbound.from_number || "").replace(/^\+/, "");
  const agentId = inbound.agent_id;

  const L = logger({ from, agent_id: agentId });
  let context = "";
  let facts = "";

  // NOT gated on the caller's number. Who is calling decides the memory; the
  // business's own hours and services are owed to every call, including the
  // ones that arrive with no caller ID at all.
  try {
    const db = pg();
    const routed = db && agentId ? await resolveChannel(db, "voice", agentId) : null;
    if (!routed) {
      // No tenant means no namespace we are entitled to read. Silence here
      // costs a returning caller their recognition; the alternative costs a
      // stranger their privacy.
      L.warn("inbound_ctx_unrouted");
    } else {
      // Both reads at once. Retell gives this webhook ten seconds before it
      // gives up on the call, and two round trips in series is how a slow
      // day turns into a dropped one.
      const phone = from ? normalizePhone(from) : null;
      const [rt, lead] = await Promise.all([
        loadTenantRuntime(db!, routed),
        // Postgres, not the Blob mirror. Same rows, same rules, same order
        // as the WhatsApp receptionist reads — a customer who texted this
        // morning and phones this afternoon is talking to ONE receptionist,
        // and it should not have a thinner memory on the phone.
        phone ? readLeadContext(db!, routed.tenantId, phone, 12) : Promise.resolve(null),
      ]);

      // The SAME composition the WhatsApp receptionist is given, asked for in
      // its spoken form. Not a copy of the hours kept in Retell's dashboard —
      // a second copy is how two channels start disagreeing about when the
      // business opens, and only one of them can be corrected from here.
      if (rt.brain) {
        // The clock rides INSIDE business_facts rather than as a variable of
        // its own. Substitution happens once, at call start, so there is no
        // cache to protect here — and a second variable would mean asking
        // every owner to edit their Retell prompt again.
        facts = `${resolveSystemPrompt(rt.brain, "voice", rt.timezone)}\n\n${describeNow(rt.timezone)}`;
      } else {
        L.warn("inbound_facts_missing", { config_broken: !!rt.configBroken });
      }

      if (lead) {
        const lines = lead.history.map(
          (h) => `${h.role === "user" ? "Customer" : "Business"}: ${String(h.content).slice(0, 160)}`,
        );
        const parts = [describeLead(lead)];
        if (lines.length) {
          parts.push("Recent interactions on this number (calls and messages):");
          parts.push(lines.join("\n"));
        }
        context = parts.join("\n");
      }
    }
  } catch (e) {
    L.error("inbound_ctx_failed", { error: e instanceof Error ? e.message : String(e) });
  }

  L.info("retell_inbound", { has_context: !!context, has_facts: !!facts, facts_chars: facts.length });
  return json(200, {
    call_inbound: {
      dynamic_variables: {
        caller_context: context || "New caller - no prior interactions on record.",
        business_facts: facts || FACTS_UNAVAILABLE,
      },
    },
  });
}
