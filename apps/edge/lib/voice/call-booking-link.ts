/**
 * Retell custom function: send_booking_link
 * Mid-call, the voice agent calls this to send the caller the booking link on
 * WhatsApp via an approved utility template, or by text from the workspace's
 * texting line when WhatsApp cannot carry it (call-link-send.ts linkByText, the
 * live walk's SET-2, 28 Oct 2026). Returns a short string the voice agent
 * speaks from.
 *
 * The door is api/retell-fn.ts: `door(sendBookingLinkOnCall)`, which names the request the platform's way (log.ts).
 * Everything a delivery does is here, in the order the door had it: the knock is checked (voiceDoorAuth), the call
 * routed to its workspace, the voice gate asked, and the link sent through deliver(); every refusal still answers HTTP
 * 200 with a `result` sentence, because the agent speaks that string. The gate and the text are call-link-send.ts's,
 * which both channels' sends share.
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
 *   -> the voice gate (outboundGate): consent with this message's purpose,
 *      the pause, the reply mode, the daily cap — decided once, so the agent
 *      is told what to SAY
 *   -> deliver(), the door every send leaves through: it re-reads consent,
 *      the pause and the workspace's status at the wire, sends on the
 *      tenant's credentials, and records the row so the business can see
 *      what it sent
 *
 * Every refusal still answers HTTP 200 with a `result` sentence: the voice
 * agent SPEAKS this string, so an error status would make it say nothing at all
 * while the caller waits.
 */
import { json } from "../http.js";
import { pg } from "../pg.js";
import { isRehearsalCall, rehearsalOfToolCall, rehearsalRouting } from "./rehearsal-call.js";
import { loadTenantRuntime, waCfgFor } from "../tenant-runtime.js";
import { effectiveReplyMode, deliver, whatsappSender, type Delivered } from "../packages/core.js";
import {
  messageByExternalId,
  resolveChannel,
  resolveOutboundTarget,
  personReplyMode,
  templatesToSend,
} from "../packages/db.js";
import {
  bookingHeld,
  bookingTemplate,
  inboxSlots,
  NO_LINK_DETAILS,
  normalizePhone,
  offersBookingLink,
  purposeOfTemplate,
  renderTemplate,
  resolveFacts,
  resolveParams,
  REHEARSAL_TOOL_WORDS,
  SECOND_MS,
} from "../packages/contracts.js";
import { refusalScript } from "../packages/core.js";
import { refusedOutLoud, voiceDoorAuth } from "./voice-door-auth.js";
import {
  gateOnTheCall,
  linkByText,
  onTheCall,
  refusedOnTheCall,
  saidOfTheWire,
  VOICE_SEND_SOURCE,
  type LinkLeg,
  type RefusedAt,
} from "./call-link-send.js";
import { logger, errField } from "../log.js";

/**
 * Which template this path sends is the WORKSPACE'S to answer, not this file's.
 *
 * It named one by literal -- booking_link_v1/en_US -- right for exactly one
 * workspace and a guaranteed failure for every other, including every newly
 * created one. Worse, that row had been written straight into the database and
 * marked approved with NO meta_id, so Meta had never seen it and the send
 * failed there too: the caller heard "that number may not have WhatsApp",
 * which named the wrong cause entirely. The Inbox and the composer left the
 * same literal behind for the same reason (legacy-bridge inbox-verbs.ts); this
 * was the last caller holding it.
 *
 * `bookingTemplate` asks the questions that matter -- approved, fillable
 * from the workspace's own facts, carrying the booking link, and one this product
 * can send whole (a picture for a heading is refused by Meta; the row carries
 * the components it is judged by) -- and a workspace with none is told so in
 * words a caller can hear.
 *
 * The PURPOSE comes from the template's own category again. It used to be
 * declared here, because the hand-written row said `marketing` and
 * purposeOfTemplate fails closed, which would have refused the link to every
 * first-time caller. The starter shipped in its place is `utility`, Meta's own
 * word for a message answering a request the person just made -- so the label
 * agrees with the use, and the fail-closed guarantee is back where it belongs.
 */
/**
 * Spoken when the workspace has no template approved for this and no texting line to send it by instead. Names the real
 * cause; never blames the caller's phone.
 */
const NO_TEMPLATE =
  "This business has not set up its booking-link WhatsApp message yet, so I cannot send it. Tell the caller they can book online, take their name, and say someone will follow up.";

/** Spoken when the caller asked for a text and the workspace has no texting line the carriers approved. */
const NO_TEXT_LINE = `This business cannot send text messages yet, so nothing was sent. Tell the caller they can book online, and take ${NO_LINK_DETAILS} so the team can follow up.`;

/**
 * How long the tool waits for WhatsApp's own answer about the send before it speaks (decision 0073, R14), and how often
 * it looks. Meta takes the message at once and says a moment later whether it reached the phone; a number with no
 * WhatsApp is refused in that moment. Said while the caller is still on the line, a failure is one they can act on.
 */
const RECEIPT_WAIT_MS = 3 * SECOND_MS;
const RECEIPT_LOOK_MS = SECOND_MS / 2;

/** What WhatsApp said of the send within the wait: it reached the phone, it failed, or nothing yet. */
type Receipt = "delivered" | "failed" | null;

/**
 * WhatsApp's answer about a send, waited for (RECEIPT_WAIT_MS): the receipt door (inbound webhook) moves the message's
 * status as Meta's statuses arrive, and this reads it back. A read that fails is no answer, never a failure.
 */
async function sendReceiptOf(db: Db, tenantId: string, wamid: string): Promise<Receipt> {
  const until = Date.now() + RECEIPT_WAIT_MS;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, RECEIPT_LOOK_MS));
    const m = await messageByExternalId(db, tenantId, wamid).catch(() => null);
    if (m?.status === "failed") return "failed";
    if (m?.status === "delivered" || m?.status === "read") return "delivered";
  }
  return null;
}

/** Spoken when WhatsApp refused the send in the moment after it was taken: the number most likely has no WhatsApp. */
const notDelivered = (publishedNumber: string | null) =>
  publishedNumber
    ? `The WhatsApp message could not be delivered — that number may not have WhatsApp. Tell the caller they can book online, or reach us on ${publishedNumber}, and take ${NO_LINK_DETAILS} so the team can follow up.`
    : `The WhatsApp message could not be delivered — that number may not have WhatsApp. Tell the caller they can book online, and take ${NO_LINK_DETAILS} so the team can follow up.`;

/**
 * What the receptionist says once Meta took the message: Meta's own answer is waited for a moment (R14), so a number
 * with no WhatsApp is said while the caller is on the line, and one that reached the phone is said as there. A number
 * WhatsApp refused is sent the link by text where there is a texting line, without waiting on the text's own answer:
 * the caller has already waited for one.
 */
async function sentOutLoud(leg: LinkLeg, wamid: string | null): Promise<Response> {
  const { db, L, at } = leg;
  const receipt = wamid ? await sendReceiptOf(db, at.tenantId, wamid) : null;
  L.info("retell_fn_sent", { tenant_id: at.tenantId, wamid, receipt });
  if (receipt === "failed")
    return (await linkByText(leg, "whatsapp_refused")) ?? json(200, { result: notDelivered(at.publishedNumber) });
  return json(200, {
    result:
      receipt === "delivered"
        ? "Booking link delivered to their WhatsApp. Tell them it is on their phone now."
        : "Booking link sent to their WhatsApp. Confirm they should see it momentarily.",
  });
}

/**
 * Spoken to a knock the door turned away, before anything is read or sent. A 401 has no words, so a call whose knock
 * this edge refused (Retell's own, unsigned, once the signature is required) went silent mid-call; voiceDoorAuth logs
 * the knock under the switch (11 Oct 2026). Only a call back is offered.
 */
const KNOCK_REFUSED = "I can't send anything just now. Take the caller's name and say someone will call them back.";

/** Spoken when we cannot send. Never names a fallback number we cannot verify. */
const CANNOT_SEND =
  "I could not send the WhatsApp message just now. Let the caller know they can book online, and offer to have someone follow up.";

/**
 * Spoken when the business has no booking link: one that quotes each job (the first run's decision 2). Its prompt says
 * to leave the tool alone; this is the answer if the agent reaches for it anyway, since the tool is on the one shell
 * every workspace shares.
 */
const NO_LINK = `This business has no booking link, so nothing was sent. Take ${NO_LINK_DETAILS}, and say the team will follow up.`;

type Db = NonNullable<ReturnType<typeof pg>>;

/**
 * The tool call as Retell sends it, the call and what the agent filled in: a number to send to, and `by: "text"` when
 * the caller said they do not use WhatsApp. A body that is not JSON is an empty one.
 */
function toolCallOf(raw: string): {
  call: { call_id?: string; from_number?: string; agent_id?: string; call_type?: string };
  args: { phone_number?: string; by?: string };
} {
  let body: {
    call?: { call_id?: string; from_number?: string; agent_id?: string; call_type?: string };
    args?: { phone_number?: string; by?: string };
  } = {};
  try {
    body = JSON.parse(raw);
  } catch {
    /* fall through with empty body */
  }
  return { call: body.call || {}, args: body.args || {} };
}

/**
 * The booking-link tool on a rehearsal: nothing sent, nobody's number read (decision 0069, D4). The link is on the
 * owner's screen, and the receptionist says it is on its way, as on a call on the line; a workspace with no link is
 * told so, as on the line; a web call no rehearsal is (the provider's own test) is told nothing can be sent.
 */
async function rehearsalBookingLink(
  call: { call_id?: string; call_type?: string },
  L: ReturnType<typeof logger>,
): Promise<Response> {
  const db = pg();
  const r = db ? await rehearsalOfToolCall(db, call) : null;
  if (!db || !r) {
    L.info("retell_fn_rehearsal", { shown: false });
    return json(200, { result: CANNOT_SEND });
  }
  const rt = await loadTenantRuntime(db, rehearsalRouting(r.tenant_id));
  if (!rt.brain) return json(200, { result: CANNOT_SEND });
  if (!offersBookingLink(rt.brain)) return json(200, { result: NO_LINK });
  L.info("retell_fn_rehearsal", { tenant_id: r.tenant_id, shown: true });
  return json(200, { result: REHEARSAL_TOOL_WORDS.bookingLink });
}

/**
 * The link where WhatsApp is not to carry it: the caller said they do not use it on this number, or the workspace has
 * no booking-link message Meta approved. By text where there is a texting line (linkByText); otherwise what was said
 * before, or, to a caller who asked for a text, that this business cannot send one yet.
 */
async function withoutWhatsapp(leg: LinkLeg, after: "caller_asked" | "no_template"): Promise<Response> {
  const text = await linkByText(leg, after);
  if (text) return text;
  // Unless it holds its bookings. Under the hold the link would not go whichever template there was, so the hold is
  // the reason given, and recorded as the gate records it. Answered first, the missing template told a caller of a
  // workspace holding its bookings that they "can book online", the one thing the workspace chose not to have said.
  if (leg.held) return refusedOnTheCall(leg.db, leg.L, "booking_needs_a_person", leg.at, "whatsapp");
  if (after === "caller_asked") {
    leg.L.info("retell_fn_no_texting_line", { tenant_id: leg.at.tenantId });
    return json(200, { result: NO_TEXT_LINE });
  }
  leg.L.info("retell_fn_no_template", { tenant_id: leg.at.tenantId });
  return json(200, { result: NO_TEMPLATE });
}

/**
 * The link as the workspace's approved WhatsApp message (decision 0073, R14): the gate asked for WhatsApp, the door, and
 * Meta's own answer waited for. Where WhatsApp cannot carry it -- no WhatsApp of the workspace's own, or Meta refused the
 * number -- it goes by text instead (linkByText); where the person, the thread or the workspace said no, it does not go
 * at all, and that is said.
 */
async function byWhatsapp(
  leg: LinkLeg,
  booking: Awaited<ReturnType<typeof templatesToSend>>[number],
  wa: ReturnType<typeof waCfgFor>,
): Promise<Response> {
  const { db, L, at } = leg;
  // Meta's own word for what this message is, read from the row a sync wrote.
  // purposeOfTemplate fails closed, so a category we do not have reads as a
  // promotion and the offers answer is required -- which is the safe way to
  // be wrong about somebody else's label.
  const purpose = purposeOfTemplate(booking.category);
  const gate = await gateOnTheCall(leg, "whatsapp", purpose);
  if (!gate.allowed) return refusedOnTheCall(db, L, gate.refusal ?? "policy_hold", at, "whatsapp");

  // The template's OWN slots, filled from the workspace's facts the way the
  // Inbox and broadcasts fill them (I6): the business's name and its booking
  // link, in whatever order this template asks for them. The pair used to be
  // positional, which only held while one hand-written template was the only
  // one this path could send.
  const params = resolveParams(inboxSlots(booking), {
    // No name: a caller is often somebody nobody has met yet, and the one
    // fact this path holds about them is the number they are ringing from.
    // resolveParams writes "there", which is true, rather than a gap.
    firstName: null,
    businessName: leg.business.name,
    bookingLink: leg.business.link.replace(/^https?:[/][/]/, "") || null,
  });
  // The door every send leaves through: it re-reads consent, the pause and the workspace's status at the wire, sends
  // on the TENANT's credentials (none is a refusal, said as a policy hold: never another business's line), records
  // the row either way, and is told this call (onCall), whose own hold on the caller's thread is no person's.
  const out = await deliver(
    { db, wire: { whatsapp: whatsappSender(wa) } },
    {
      tenantId: at.tenantId,
      conversationId: at.conversationId,
      contactId: leg.contact.contactId,
      to: leg.target,
      channel: "whatsapp",
      sender: "ai",
      purpose,
      ...onTheCall(leg.isCaller),
      body: renderTemplate(booking.body_preview, params) || `[booking link] ${params.join(" — ")}`,
      template: { name: booking.name, language: booking.language, params },
      onCall: at.callId,
      meta: { source: VOICE_SEND_SOURCE, call_id: at.callId ?? null },
    },
  );

  if (out.outcome === "refused") {
    // The wire found what the gate could not see a moment ago: the person's no, which no other channel gets round.
    L.info("retell_fn_refused_at_wire", { tenant_id: at.tenantId, reason: out.reason });
    return json(200, { result: refusalScript(saidOfTheWire(out.reason), at.publishedNumber, "whatsapp") });
  }
  if (out.outcome === "failed") return await whatsappFailed(leg, out);
  return await sentOutLoud(leg, out.externalId ?? null);
}

/**
 * A WhatsApp send that failed, said in the caller's terms. Where the failure is certain -- the workspace has no WhatsApp
 * of its own, or Meta said no before it took anything -- the link goes by text where there is a line. Where Meta's answer
 * is not known (it may have taken it all the same), nothing is sent again: two messages are worse than one.
 */
async function whatsappFailed(leg: LinkLeg, out: Extract<Delivered, { outcome: "failed" }>): Promise<Response> {
  const { L, at } = leg;
  const none = out.reason === "no_credentials" || out.reason === "no_sender_for_channel";
  if (out.reason === "no_credentials") L.info("retell_fn_no_credentials", { tenant_id: at.tenantId });
  else L.error("booking_link_send_failed", { tenant_id: at.tenantId, status: out.status, reason: out.reason });
  const certain = none || (out.reason === "provider" && !out.mayHaveGone);
  const text = certain ? await linkByText(leg, none ? "no_whatsapp" : "whatsapp_refused") : null;
  if (text) return text;
  return json(200, {
    result:
      out.reason === "no_credentials"
        ? refusalScript("policy_hold", at.publishedNumber, "whatsapp")
        : notDelivered(at.publishedNumber),
  });
}

export async function sendBookingLinkOnCall(request: Request): Promise<Response> {
  const raw = await request.text();
  // The signature, or the tool's x-fn-secret header while this door still reads one. Whether Retell signs
  // custom-function calls is what the log answers (voice-door-auth.ts); this file used to say it did not.
  if (!voiceDoorAuth("fn", request, raw).ok) return refusedOutLoud("fn", KNOCK_REFUSED);

  const { call, args } = toolCallOf(raw);

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

  const L = logger({ call_id: call.call_id, agent_id: call.agent_id });

  if (isRehearsalCall(call)) return rehearsalBookingLink(call, L);

  if (!target) {
    // normalizePhone already rejects anything that cannot be a phone number,
    // which is a better test than a hand-written length check.
    L.info("retell_fn_no_number");
    return json(200, {
      result:
        "I could not determine a valid mobile number. Ask the caller to read it back, or offer to book them on the call.",
    });
  }

  const db = pg();
  if (!db || !call.agent_id) {
    // No routing key means no tenant, and no tenant means we do not know whose
    // business this is or whose number to send from. Silence beats guessing.
    L.error("retell_fn_unroutable", { has_db: !!db, agent_id: call.agent_id ?? null });
    return json(200, { result: CANNOT_SEND });
  }

  const routed = await resolveChannel(db, "voice", call.agent_id);
  if (!routed) {
    L.error("retell_fn_unknown_agent", { agent_id: call.agent_id });
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
    L.info("retell_fn_no_persona", { tenant_id: routed.tenantId });
    return json(200, { result: CANNOT_SEND });
  }
  if (!offersBookingLink(brain)) {
    L.info("retell_fn_no_link", { tenant_id: routed.tenantId });
    return json(200, { result: NO_LINK });
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
      L.info("retell_fn_refused_third_party", { tenant_id: routed.tenantId });
      return json(200, {
        result:
          "I can only send WhatsApp messages to the number the caller is phoning from. Ask them to call from that mobile, or offer to book them on the call.",
      });
    }

    // The person's own receptionist mode wins here too. A caller the owner
    // has set to Never is someone the receptionist stays away from — on
    // WhatsApp, and when they phone and ask for a text. Looked up per call,
    // never cached; a failed lookup keeps the workspace mode.
    const workspaceMode = rt.policy?.reply?.mode ?? "ask";
    const personMode = await personReplyMode(db, routed.tenantId, contact.contactId).catch((e: unknown) => {
      L.error("retell_fn_person_mode_failed", { error: errField(e) });
      return null;
    });
    const replyMode = effectiveReplyMode({ replyMode: workspaceMode }, personMode);
    // The Autonomy pane's BOOKING row, read through the same predicate the text
    // receptionist reads it through. This path read the REPLY row, so a
    // workspace that asked to confirm its own bookings had its phone agent send
    // the link anyway while its WhatsApp receptionist was being held for the
    // same request (steps.ts layerTwo takes the link back out of a reply).
    const held = bookingHeld(rt.policy);
    const refusedAt: RefusedAt = {
      tenantId: routed.tenantId,
      conversationId: contact.conversationId,
      callId: call.call_id,
      publishedNumber,
      mode: replyMode,
      personMode,
    };

    // WHICH template, asked of the workspace. A read that fails throws to the
    // outer catch and the caller is told we could not send, which is true; a
    // workspace that genuinely has none is told THAT, or sent the link by text,
    // which is a different and equally true thing, and the difference is what a
    // business needs to hear to fix it.
    const booking = bookingTemplate(await templatesToSend(db, routed.tenantId));
    const leg: LinkLeg = {
      db,
      L,
      contact,
      target,
      isCaller,
      paused: rt.paused,
      replyMode,
      held,
      at: refusedAt,
      business: { name: brain.business_name, link: brain.booking_link ?? "" },
      // The text is written in the language the WhatsApp message was approved in: the one the owner chose for it.
      language: booking?.language ?? null,
    };
    // The caller said they do not use WhatsApp on this number, or there is no message Meta approved: WhatsApp has none.
    if (args.by === "text" || !booking)
      return await withoutWhatsapp(leg, args.by === "text" ? "caller_asked" : "no_template");
    return await byWhatsapp(leg, booking, waCfgFor(rt));
  } catch (e) {
    // A thrown repository call must not become a 500: the voice agent would go
    // silent mid-sentence with a customer on the line.
    L.error("retell_fn_failed", { error: errField(e) });
    return json(200, { result: CANNOT_SEND });
  }
}
