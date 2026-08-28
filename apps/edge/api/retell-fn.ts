/**
 * Retell custom function: send_booking_link
 * Mid-call, the voice agent calls this to text the caller the booking link on
 * WhatsApp via an approved utility template. Returns a short string the voice
 * agent speaks from.
 *
 * This was the fourth WhatsApp send path and the only one behind no door at
 * all: it posted straight to the Graph API on env credentials, with the
 * business name and booking link hardcoded in the file, and it knew nothing
 * about tenants, consent, or the messages table. So a customer who texted STOP
 * — refused by the webhook, the reply route and the send job — could phone the
 * salon and be sent a template anyway, and the send appeared in no thread, no
 * inbox and no metric.
 *
 * It now goes through the same door as every other send:
 *   agent_id -> tenant_channels(kind='voice')  (the routing every voice
 *               endpoint already used; this one simply never asked)
 *   -> tenant runtime for the persona facts and the per-tenant credentials
 *   -> consent, checked with the same predicate as the send job
 *   -> sendTemplate (bounded by the adapter's timeout, returns instead of throwing)
 *   -> recorded in messages, so the business can see what it sent
 *
 * Every refusal still answers HTTP 200 with a `result` sentence: the voice
 * agent SPEAKS this string, so an error status would make it say nothing at all
 * while the caller waits.
 */
import { json } from "../lib/http.js";
import { pg } from "../lib/pg.js";
import { loadTenantRuntime, waCfgFor } from "../lib/tenant-runtime.js";
import { resolveChannel, resolveOutboundTarget, recordOutbound } from "../lib/workspace/db.js";
import { isOptedOutContact } from "../lib/workspace/contracts.js";
import { sendTemplate } from "../lib/workspace/channels.js";

const BOOKING_TEMPLATE = { name: "booking_link_v1", language: "en_US" };

/** Spoken when we cannot send. Never names a fallback number we cannot verify. */
const CANNOT_SEND =
  "I could not send the text just now. Let the caller know they can book online, and offer to have someone follow up.";

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  // Retell custom-function calls are authenticated via the shared-secret header
  // configured on the tool (Retell does not HMAC-sign these like webhooks).
  if (request.headers.get("x-fn-secret") !== process.env.RETELL_FN_SECRET) {
    return json(401, { ok: false, error: "bad_secret" });
  }

  let body: {
    call?: { call_id?: string; from_number?: string; agent_id?: string };
    args?: { phone_number?: string };
  } = {};
  try { body = JSON.parse(raw); } catch { /* fall through with empty body */ }
  const call = body.call || {};
  const args = body.args || {};

  const digits = (s: string | undefined) => String(s || "").replace(/[^\d]/g, "");
  const caller = digits(call.from_number);
  const asked = digits(args.phone_number);
  // The agent may collect a different number, but a caller must not be able to
  // talk it into texting an arbitrary third party: a number we were GIVEN only
  // qualifies if that person is already a contact of this business.
  const target = asked || caller;
  const isCaller = !!target && target === caller;

  const log = (event: string, extra: Record<string, unknown> = {}) =>
    console.log(event, JSON.stringify({ call_id: call.call_id, agent_id: call.agent_id, ...extra }));

  if (!target || target.length < 10) {
    log("retell_fn_no_number");
    return json(200, { result: "I could not determine a valid mobile number. Ask the caller to read it back, or offer to book them on the call." });
  }

  const db = pg();
  if (!db || !call.agent_id) {
    // No routing key means no tenant, and no tenant means we do not know whose
    // business this is or whose number to send from. Silence beats guessing.
    console.error("retell_fn_unroutable", JSON.stringify({ has_db: !!db, agent_id: call.agent_id ?? null }));
    return json(200, { result: CANNOT_SEND });
  }

  const routed = await resolveChannel(db, "voice", call.agent_id);
  if (!routed) {
    console.error("retell_fn_unknown_agent", call.agent_id);
    return json(200, { result: CANNOT_SEND });
  }

  const rt = await loadTenantRuntime(db, routed);
  const brain = rt.brain;
  if (!brain) {
    // Same rule the receptionist follows: a business with no configured profile
    // does not speak in a voice we invented for it.
    log("retell_fn_no_persona", { tenant: routed.tenantId });
    return json(200, { result: CANNOT_SEND });
  }

  try {
    const targetE164 = `+${target}`;
    const contact = await resolveOutboundTarget(db, {
      tenantId: routed.tenantId,
      phoneE164: targetE164,
      // A first-time CALLER legitimately has no contact row yet and gets one.
      // A number merely spoken to the agent must already belong to this business.
      create: isCaller,
    });

    if (!contact) {
      log("retell_fn_refused_third_party", { tenant: routed.tenantId });
      return json(200, {
        result: "I can only text the number the caller is phoning from. Ask them to call from that mobile, or offer to book them on the call.",
      });
    }

    if (isOptedOutContact(contact)) {
      log("retell_fn_refused_opted_out", { tenant: routed.tenantId });
      return json(200, {
        result: "That number has asked us to stop sending messages, so I cannot text them. Offer to book them on the call instead.",
      });
    }

    const params = [brain.business_name, brain.booking_link.replace(/^https?:[/][/]/, "")];
    const sent = await sendTemplate(waCfgFor(rt), target, {
      name: BOOKING_TEMPLATE.name,
      language: BOOKING_TEMPLATE.language,
      params,
    });

    if (!sent.ok) {
      console.error("booking_link_send_failed", sent.status, sent.errorBody);
      // Recorded as a failed row rather than dropped: the business should see
      // that it tried and could not reach them.
      await recordOutbound(db, {
        tenantId: routed.tenantId,
        conversationId: contact.conversationId,
        contactId: contact.contactId,
        sender: "ai",
        type: "template",
        body: `[booking link] ${params.join(" — ")}`,
        externalId: null,
        status: "failed",
        meta: { source: "voice_booking_link", call_id: call.call_id ?? null, http_status: sent.status },
      }).catch((e) => console.error("retell_fn_record_failed", e instanceof Error ? e.message : e));
      return json(200, {
        result: `The text could not be delivered — that number may not have WhatsApp. Tell the caller they can book online, or reach the salon on ${brain.phone_display}.`,
      });
    }

    await recordOutbound(db, {
      tenantId: routed.tenantId,
      conversationId: contact.conversationId,
      contactId: contact.contactId,
      sender: "ai",
      type: "template",
      body: `[booking link] ${params.join(" — ")}`,
      externalId: sent.wamid,
      status: "sent",
      meta: { source: "voice_booking_link", call_id: call.call_id ?? null },
    }).catch((e) => console.error("retell_fn_record_failed", e instanceof Error ? e.message : e));

    log("retell_fn_sent", { tenant: routed.tenantId, wamid: sent.wamid });
    return json(200, { result: "Booking link sent to their WhatsApp. Confirm they should see it momentarily." });
  } catch (e) {
    // A thrown repository call must not become a 500: the voice agent would go
    // silent mid-sentence with a customer on the line.
    console.error("retell_fn_failed", e instanceof Error ? e.message : e);
    return json(200, { result: CANNOT_SEND });
  }
}
