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
import { normalizePhone } from "../lib/workspace/contracts.js";
import { json } from "../lib/http.js";
import { pg } from "../lib/pg.js";
import { resolveChannel, readLeadContext, describeLead } from "../lib/workspace/db.js";
import { logger } from "../lib/log.js";

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

  if (from) {
    try {
      const db = pg();
      const routed = db && agentId ? await resolveChannel(db, "voice", agentId) : null;
      if (!routed) {
        // No tenant means no namespace we are entitled to read. Silence here
        // costs a returning caller their recognition; the alternative costs a
        // stranger their privacy.
        L.warn("inbound_ctx_unrouted");
      } else {
        // Postgres, not the Blob mirror. Same rows, same rules, same order
        // as the WhatsApp receptionist reads — a customer who texted this
        // morning and phones this afternoon is talking to ONE receptionist,
        // and it should not have a thinner memory on the phone.
        const phone = normalizePhone(from);
        const lead = phone ? await readLeadContext(db!, routed.tenantId, phone, 12) : null;
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
  }

  L.info("retell_inbound", { has_context: !!context });
  return json(200, {
    call_inbound: {
      dynamic_variables: {
        caller_context: context || "New caller - no prior interactions on record.",
      },
    },
  });
}
