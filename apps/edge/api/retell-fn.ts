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
 *   -> consent, checked with the same predicate as the send job — `mayMessageFor`,
 *      asked with this message's purpose, so the bar is the message's and not
 *      this file's
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
import { effectiveReplyMode } from "../lib/reply-posture.js";
import { resolveChannel, resolveOutboundTarget, recordOutbound, countSentToday, personReplyMode } from "../lib/workspace/db.js";
import { normalizePhone, resolveFacts } from "../lib/workspace/contracts.js";
import { sendTemplate } from "../lib/workspace/channels.js";
import { outboundGate, refusalScript } from "../lib/outbound-gate.js";

/**
 * The one template this path sends.
 *
 * `purpose` IS STATED HERE, and deliberately not read from `templates.category`.
 * On the live workspace that row's category is `marketing`, so
 * `purposeOfTemplate` would call this send promotional and refuse it to every
 * caller who has not separately asked for offers - which is every first-time
 * caller, and which is the over-block migration 00095 exists to remove arriving in
 * a new place.
 *
 * The two are answering different questions and only one of them is about consent.
 * Meta's `category` is a WhatsApp PRICING and template-policy label; it is not a
 * statement about US carrier consent, and WhatsApp is not 10DLC. The consent
 * question here is answered by the call itself: the customer placed it, asked out
 * loud for this link, and the number it goes to is the one they are calling from
 * (which is why `resolveOutboundTarget` is given `create: isCaller`). A message
 * containing exactly what its recipient just requested is solicited, whatever
 * Meta's billing tier calls it.
 *
 * So the BROADCAST path and this path treat the same template differently, on
 * purpose: a booking link sent to a list nobody asked from is promotional and needs
 * the offers answer; the same words sent to the person who just asked for them are
 * not. Before this, the two differed because one of them had simply never been
 * asked the question - now they differ because the purpose does, declared at each
 * site with its reason.
 *
 * (Recategorising `booking_link_v1` to `utility` at Meta would make the label agree
 * with the use, and is worth doing - but the consent decision above does not wait
 * on it, and must not be silently reversed by a template sync.)
 */
const BOOKING_TEMPLATE = { name: "booking_link_v1", language: "en_US", purpose: "conversational" as const };
/** meta.source stamped on voice-initiated sends — also the key the daily cap counts. */
const VOICE_SEND_SOURCE = "voice_booking_link";
/** Per THREAD per day. A caller asking twice in one call is normal; thirty is not. */
const VOICE_SENDS_PER_DAY = 3;

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

  // normalizePhone, not a hand-rolled digit strip. `args.phone_number` is a
  // free-text field the voice model fills from whatever the caller SAYS out
  // loud, so it routinely arrives as a bare 10-digit national number — while
  // contacts.phone_e164 is keyed on full international digits. Comparing raw
  // digits therefore failed to recognise a client's own number, refused them
  // their booking link, and would have handed Meta a number with no country
  // code. The repo has owned this normalizer since Slice 1 and, until now, no
  // code anywhere called it.
  const caller = normalizePhone(call.from_number);
  const asked = normalizePhone(args.phone_number);
  // The agent may collect a different number, but a caller must not be able to
  // talk it into texting an arbitrary third party: a number we were GIVEN only
  // qualifies if that person is already a contact of this business.
  const target = asked ?? caller;
  const isCaller = !!target && target === caller;

  const log = (event: string, extra: Record<string, unknown> = {}) =>
    console.log(event, JSON.stringify({ call_id: call.call_id, agent_id: call.agent_id, ...extra }));

  if (!target) {
    // normalizePhone already rejects anything that cannot be a phone number,
    // which is a better test than a hand-written length check.
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
  // The number a caller is told to ring, through the same resolver the prompt
  // uses: the published override when a business set one, otherwise the line
  // this receptionist answers. Reading brain.phone_display straight from the
  // document is what let a salon send callers to its transfer number.
  const publishedNumber = brain ? resolveFacts(brain, rt.known).phone_display.value : null;
  if (!brain) {
    // Same rule the receptionist follows: a business with no configured profile
    // does not speak in a voice we invented for it.
    log("retell_fn_no_persona", { tenant: routed.tenantId });
    return json(200, { result: CANNOT_SEND });
  }

  try {
    const contact = await resolveOutboundTarget(db, {
      tenantId: routed.tenantId,
      phoneE164: target,
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

    // The person's own receptionist mode wins here too. A caller the owner
    // has set to Never is someone the receptionist stays away from — on
    // WhatsApp, and when they phone and ask for a text. Looked up per call,
    // never cached; a failed lookup keeps the workspace mode.
    const workspaceMode = rt.policy?.reply?.mode ?? "ask";
    const personMode = await personReplyMode(db, routed.tenantId, contact.contactId).catch((e: unknown) => {
      console.error("retell_fn_person_mode_failed", e instanceof Error ? e.message : e);
      return null;
    });
    const replyMode = effectiveReplyMode({ drFallback: false, replyMode: workspaceMode }, personMode);

    // Every gate the conversational receptionist obeys, in one decision.
    //
    // This path used to check consent and stop. So a booking link would land in
    // a thread a human had already taken over — the exact interruption pause
    // exists to prevent — and it kept sending after a workspace had switched
    // its receptionist to 'ask'. Both are the same class of bug: a second
    // sender assembled by hand instead of going through the same door.
    //
    // WHOSE NUMBER decides whether this send is proactive, and it is the last
    // hole in this path. Texting the person on the line ANSWERS them: they placed
    // the call, they asked for the link, and the number is the one they are
    // calling from — `resolveOutboundTarget` was given `create: isCaller` for
    // that same reason. Texting a number somebody merely spoke aloud STARTS a
    // conversation with a third party who has not asked for anything, and that
    // needs their own recorded yes. Passing `optedOut` alone could not tell the
    // two apart, so it let the second case through.
    //
    // KEPT BY THE OWNER'S DECISION (2026-09-10), after the review of #313 asked
    // whether a caller should need a recorded yes as well. Requiring one would block
    // the booking link on almost every first call, and texting the person who asked
    // for it, at the number they are calling from, is a reply rather than outreach.
    const gate = outboundGate({
      // The row whole: `OutboundTarget` is a `PurposeBearing`, checked by the compiler,
      // so there is no hand re-mapping here to get one field's name wrong.
      contact,
      purpose: BOOKING_TEMPLATE.purpose,
      proactive: !isCaller,
      paused: rt.paused,
      pausedUntilMs: contact.pausedUntil ? new Date(contact.pausedUntil).getTime() : null,
      replyMode,
      sentToday: await countSentToday(db, {
        tenantId: routed.tenantId,
        conversationId: contact.conversationId,
        source: VOICE_SEND_SOURCE,
      }).catch(() => 0),
      dailyCap: VOICE_SENDS_PER_DAY,
      nowMs: Date.now(),
    });

    if (!gate.allowed) {
      log("retell_fn_refused", { tenant: routed.tenantId, reason: gate.refusal, mode: replyMode, person_mode: personMode });
      // The caller is on the line, so the agent is told what to SAY — never
      // that a colleague is mid-thread with them, or what our policy is.
      return json(200, { result: refusalScript(gate.refusal!, publishedNumber) });
    }

    const params = [brain.business_name, brain.booking_link.replace(/^https?:[/][/]/, "")];
    // No credentials is a refusal, said to the caller as a policy hold: the
    // agent must never text on another business's line.
    const waCfg = waCfgFor(rt);
    if (!waCfg) {
      log("retell_fn_no_credentials", { tenant: routed.tenantId });
      return json(200, { result: refusalScript("policy_hold", publishedNumber) });
    }
    // Graph wants bare digits; normalizePhone guarantees the leading "+".
    const sent = await sendTemplate(waCfg, target.slice(1), {
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
        meta: { source: VOICE_SEND_SOURCE, call_id: call.call_id ?? null, http_status: sent.status },
      }).catch((e) => console.error("retell_fn_record_failed", e instanceof Error ? e.message : e));
      return json(200, {
        result: publishedNumber
          ? `The text could not be delivered — that number may not have WhatsApp. Tell the caller they can book online, or reach us on ${publishedNumber}.`
          : "The text could not be delivered — that number may not have WhatsApp. Tell the caller they can book online, and take their name.",
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
      meta: { source: VOICE_SEND_SOURCE, call_id: call.call_id ?? null },
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
