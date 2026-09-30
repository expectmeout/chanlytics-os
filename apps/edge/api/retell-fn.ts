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
import { json, refuse } from "../lib/http.js";
import { pg } from "../lib/pg.js";
import { loadTenantRuntime, waCfgFor } from "../lib/tenant-runtime.js";
import { effectiveReplyMode } from "../lib/packages/core.js";
import {
  emitEvent,
  resolveChannel,
  resolveOutboundTarget,
  countSentToday,
  personReplyMode,
  templatesFor,
} from "../lib/packages/db.js";
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
} from "../lib/packages/contracts.js";
import { deliver, whatsappSender } from "../lib/packages/core.js";
import { outboundGate, refusalScript, type OutboundRefusal } from "../lib/receptionist/outbound-gate.js";
import { voiceDoorAuth } from "../lib/voice/voice-door-auth.js";
import { logger, errField, door, type Logger } from "../lib/log.js";

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
 * `bookingTemplate` asks the three questions that matter -- approved, fillable
 * from the workspace's own facts, carrying the booking link -- and a workspace
 * with none is told so in words a caller can hear.
 *
 * The PURPOSE comes from the template's own category again. It used to be
 * declared here, because the hand-written row said `marketing` and
 * purposeOfTemplate fails closed, which would have refused the link to every
 * first-time caller. The starter shipped in its place is `utility`, Meta's own
 * word for a message answering a request the person just made -- so the label
 * agrees with the use, and the fail-closed guarantee is back where it belongs.
 */
/** Spoken when the workspace has no template approved for this. Names the real cause; never blames the caller's phone. */
const NO_TEMPLATE =
  "This business has not set up its booking-link WhatsApp message yet, so I cannot send it. Tell the caller they can book online, take their name, and say someone will follow up.";

/** meta.source stamped on voice-initiated sends — also the key the daily cap counts. */
const VOICE_SEND_SOURCE = "voice_booking_link";
/** Per THREAD per day. A caller asking twice in one call is normal; thirty is not. */
const VOICE_SENDS_PER_DAY = 3;

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

/** Where a refused send is said and recorded: the thread it would have joined, the call that asked, the modes read. */
interface RefusedAt {
  tenantId: string;
  conversationId: string;
  callId: string | undefined;
  publishedNumber: string | null;
  mode: string;
  personMode: string | null;
}

/**
 * A send refused before any row existed, by the gate or by the Autonomy tab's booking hold: said to the caller, and
 * recorded. Every other refusal in the product lands somewhere durable -- the door writes message.send_blocked, a
 * broadcast marks its recipient, a failed send flags the thread -- and this one was a line on stdout, so "she says she
 * never got the link" had no answer. The door's own kind, naming the thread rather than a message, because the refusal
 * came before any row existed to name. The caller is on the line, so the agent is told what to SAY -- never that a
 * colleague is mid-thread with them, or what our policy is.
 */
async function refusedOnTheCall(db: Db, L: Logger, refusal: OutboundRefusal, at: RefusedAt): Promise<Response> {
  L.info("retell_fn_refused", { tenant_id: at.tenantId, reason: refusal, mode: at.mode, person_mode: at.personMode });
  await emitEvent(db, at.tenantId, "message.send_blocked", "conversation", at.conversationId, {
    reason: refusal,
    source: VOICE_SEND_SOURCE,
    channel: "whatsapp",
    call_id: at.callId ?? null,
  });
  return json(200, { result: refusalScript(refusal, at.publishedNumber) });
}

export const POST = door(async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  // The signature, or the tool's x-fn-secret header while this door still reads one. Whether Retell signs
  // custom-function calls is what the log answers (voice-door-auth.ts); this file used to say it did not.
  if (!voiceDoorAuth("fn", request, raw).ok) {
    return refuse(401, "bad_secret");
  }

  let body: {
    call?: { call_id?: string; from_number?: string; agent_id?: string };
    args?: { phone_number?: string };
  } = {};
  try {
    body = JSON.parse(raw);
  } catch {
    /* fall through with empty body */
  }
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

  const L = logger({ call_id: call.call_id, agent_id: call.agent_id });

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
    // workspace that genuinely has none is told THAT, which is a different and
    // equally true thing, and the difference is what a business needs to hear
    // to fix it.
    const booking = bookingTemplate(await templatesFor(db, routed.tenantId));
    if (!booking) {
      // Unless it holds its bookings. Under the hold the link would not go whichever template there was, so the hold is
      // the reason given, and recorded as the gate records it. Answered first, the missing template told a caller of a
      // workspace holding its bookings that they "can book online", the one thing the workspace chose not to have said.
      if (held) return refusedOnTheCall(db, L, "booking_needs_a_person", refusedAt);
      L.info("retell_fn_no_template", { tenant_id: routed.tenantId });
      return json(200, { result: NO_TEMPLATE });
    }
    // Meta's own word for what this message is, read from the row a sync wrote.
    // purposeOfTemplate fails closed, so a category we do not have reads as a
    // promotion and the offers answer is required -- which is the safe way to
    // be wrong about somebody else's label.
    const purpose = purposeOfTemplate(booking.category);

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
      purpose,
      proactive: !isCaller,
      paused: rt.paused,
      pausedUntilMs: contact.pausedUntil ? new Date(contact.pausedUntil).getTime() : null,
      replyMode,
      bookingHeld: held,
      // NOT caught to zero. This count IS the runaway guard, and a read that
      // failed is the condition most likely to accompany a runaway: a database
      // that cannot answer "how many today" reading as "none today" opens the
      // cap exactly when it is needed. A throw leaves the outer catch to tell
      // the caller we could not send, which is the truth.
      sentToday: await countSentToday(db, {
        tenantId: routed.tenantId,
        conversationId: contact.conversationId,
        source: VOICE_SEND_SOURCE,
      }),
      dailyCap: VOICE_SENDS_PER_DAY,
      nowMs: Date.now(),
    });

    if (!gate.allowed) return refusedOnTheCall(db, L, gate.refusal!, refusedAt);

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
      businessName: brain.business_name,
      bookingLink: brain.booking_link?.replace(/^https?:[/][/]/, "") ?? null,
    });
    // The door every send leaves through. It re-reads consent, the pause and
    // the workspace's status at the wire, sends on the TENANT's credentials
    // (none is a refusal, said to the caller as a policy hold: the agent must
    // never text on another business's line), and records the row either way.
    const out = await deliver(
      { db, wire: { whatsapp: whatsappSender(waCfgFor(rt)) } },
      {
        tenantId: routed.tenantId,
        conversationId: contact.conversationId,
        contactId: contact.contactId,
        to: target,
        channel: "whatsapp",
        sender: "ai",
        purpose,
        proactive: !isCaller,
        body: renderTemplate(booking.body_preview, params) || `[booking link] ${params.join(" — ")}`,
        template: { name: booking.name, language: booking.language, params },
        meta: { source: VOICE_SEND_SOURCE, call_id: call.call_id ?? null },
      },
    );

    if (out.outcome === "refused") {
      // The wire found what the gate could not see a moment ago. An erased
      // person is spoken of as one who asked us to stop, which is what they did.
      L.info("retell_fn_refused_at_wire", { tenant_id: routed.tenantId, reason: out.reason });
      // This send is on WhatsApp, so email's refusals and outreach's cannot arise
      // here; the compiler cannot know that. The call names the refusals it has
      // words for, and for any other one, "it could not be sent" is the true
      // thing to say on a call.
      const r = out.reason;
      const script: OutboundRefusal =
        r === "erased"
          ? "opted_out"
          : r === "superseded_by_human"
            ? "human_has_it"
            : r === "opted_out" ||
                r === "not_opted_in" ||
                r === "no_marketing_consent" ||
                r === "paused" ||
                r === "human_has_it" ||
                r === "sms_carries_no_promotions"
              ? r
              : "policy_hold";
      return json(200, { result: refusalScript(script, publishedNumber) });
    }
    if (out.outcome === "failed") {
      if (out.reason === "no_credentials") {
        L.info("retell_fn_no_credentials", { tenant_id: routed.tenantId });
        return json(200, { result: refusalScript("policy_hold", publishedNumber) });
      }
      L.error("booking_link_send_failed", { tenant_id: routed.tenantId, status: out.status, reason: out.reason });
      return json(200, {
        result: publishedNumber
          ? `The WhatsApp message could not be delivered — that number may not have WhatsApp. Tell the caller they can book online, or reach us on ${publishedNumber}.`
          : "The WhatsApp message could not be delivered — that number may not have WhatsApp. Tell the caller they can book online, and take their name.",
      });
    }

    L.info("retell_fn_sent", { tenant_id: routed.tenantId, wamid: out.externalId });
    return json(200, { result: "Booking link sent to their WhatsApp. Confirm they should see it momentarily." });
  } catch (e) {
    // A thrown repository call must not become a 500: the voice agent would go
    // silent mid-sentence with a customer on the line.
    L.error("retell_fn_failed", { error: errField(e) });
    return json(200, { result: CANNOT_SEND });
  }
});
