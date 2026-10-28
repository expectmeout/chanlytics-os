/**
 * One send of the booking link on a call, on the channel it goes by: the gate the receptionist obeys, asked for that
 * channel, the send door (deliver), and what the caller is told of either. The door that reads the call, the workspace
 * and the caller is call-booking-link.ts, which sends the WhatsApp message; the text it falls back to is here
 * (linkByText).
 *
 * BY TEXT WHEN WHATSAPP CANNOT CARRY IT (the live walk's SET-2, 28 Oct 2026). A call used to send the link as an
 * approved WhatsApp message and nothing else, so a caller with no WhatsApp, a workspace with no approved booking-link
 * message, or a number Meta refused was offered a follow-up instead. Now the link goes by text from the workspace's
 * texting line in each of those cases, and when the caller says they do not use WhatsApp (`by: "text"`). Never when the
 * person, the thread or the workspace said no: those refusals are the same whatever carries the message, and are said
 * as they are. Never when Meta's answer is not known: the caller may have the message already, and two is worse than one.
 *
 * A text to the caller is a reply, as the WhatsApp message is (the owner's decision of 2026-09-10, kept on the gate
 * below): they placed the call, asked for the link, and it goes to the number they are calling from, so only their no
 * stops it. A number somebody merely spoke aloud starts a conversation, and needs that person's own yes covering texts
 * (contracts mayMessageFor, asked on channel "sms"). The door holds a text to a line the carriers approved and to no
 * promotion (core textRefusal), re-reads the person's no at the wire, and records the carrier's STOP (Twilio 21610) as
 * theirs. The words open with the business's name and end with how to stop, as every sample the carriers approved does.
 */
import { json } from "../http.js";
import type { pg } from "../pg.js";
import { smsSenderForTenant, smsWire } from "../sms/sms.js";
import {
  deliver,
  outboundGate,
  refusalScript,
  textRefusal,
  type DeliveryRefusal,
  type OutboundRefusal,
} from "../packages/core.js";
import { countSentToday, emitEvent, textLineFacts, type OutboundTarget } from "../packages/db.js";
import { NO_LINK_DETAILS, senderWords, type AskedPurpose } from "../packages/contracts.js";
import type { Logger } from "../log.js";

type Db = NonNullable<ReturnType<typeof pg>>;

/** meta.source stamped on voice-initiated sends, by WhatsApp or by text — also the key the daily cap counts. */
export const VOICE_SEND_SOURCE = "voice_booking_link";

/** Per THREAD per day, whatever carried it. A caller asking twice in one call is normal; thirty is not. */
const VOICE_SENDS_PER_DAY = 3;

/**
 * The link to the caller answers them; to a number they named it starts a conversation. Either way it is about the call
 * they are on: theirs (contracts MessageAbout, decision D1), and no playbook's run, so no moment's (Delivery.trigger).
 */
export const onTheCall = (isCaller: boolean) => ({ proactive: !isCaller, about: "theirs" as const, trigger: null });

/** Where a refused send is said and recorded: the thread it would have joined, the call that asked, the modes read. */
export interface RefusedAt {
  tenantId: string;
  conversationId: string;
  callId: string | undefined;
  publishedNumber: string | null;
  mode: string;
  personMode: string | null;
}

/** What a send on the call is made with, whichever channel carries it: read once by the door (call-booking-link.ts). */
export interface LinkLeg {
  db: Db;
  L: Logger;
  /** The person the link goes to, as the door resolved them: the caller, or a contact the caller named. */
  contact: OutboundTarget;
  /** Their number, in the international digits contacts are keyed on. */
  target: string;
  isCaller: boolean;
  /** The workspace paused for billing. */
  paused: boolean;
  /** The receptionist's mode for this person: theirs where the owner set one, else the workspace's. */
  replyMode: string;
  /** The Autonomy tab's Booking row holds bookings for a person (contracts bookingHeld). */
  held: boolean;
  at: RefusedAt;
  /** The business's name and its booking link, as the text says them. */
  business: { name: string; link: string };
  /** The language the booking-link WhatsApp message was approved in, which the text is written in too; null with none. */
  language: string | null;
}

/**
 * Every gate the conversational receptionist obeys, in one decision, for the channel this send goes by.
 *
 * This path used to check consent and stop. So a booking link would land in a thread a human had already taken over —
 * the exact interruption pause exists to prevent — and it kept sending after a workspace had switched its receptionist
 * to 'ask'. Both are the same class of bug: a second sender assembled by hand instead of going through the same door.
 *
 * WHOSE NUMBER decides whether this send is proactive. Texting the person on the line ANSWERS them: they placed the
 * call, they asked for the link, and the number is the one they are calling from — `resolveOutboundTarget` was given
 * `create: isCaller` for that same reason. Texting a number somebody merely spoke aloud STARTS a conversation with a
 * third party who has not asked for anything, and that needs their own recorded yes, on the channel it goes by.
 *
 * KEPT BY THE OWNER'S DECISION (2026-09-10), after the review of #313 asked whether a caller should need a recorded yes
 * as well. Requiring one would block the booking link on almost every first call, and texting the person who asked for
 * it, at the number they are calling from, is a reply rather than outreach. It holds for a text as for WhatsApp.
 */
export async function gateOnTheCall(leg: LinkLeg, channel: "whatsapp" | "sms", purpose: AskedPurpose) {
  return outboundGate({
    // The row whole (an `OutboundTarget` is a `PurposeBearing`): no field's name re-mapped by hand to get wrong.
    contact: leg.contact,
    purpose,
    ...onTheCall(leg.isCaller),
    channel, // the delivery that follows: the yes it needs is one for this channel
    paused: leg.paused,
    pausedUntilMs: leg.contact.pausedUntil ? new Date(leg.contact.pausedUntil).getTime() : null,
    replyMode: leg.replyMode,
    bookingHeld: leg.held,
    // NOT caught to zero. This count IS the runaway guard, and a read that failed is the condition most likely to
    // accompany a runaway: a database that cannot answer "how many today" reading as "none today" opens the cap
    // exactly when it is needed. A throw leaves the door's catch to tell the caller we could not send, which is the
    // truth. Both channels carry the same source, so the cap counts the link however it went.
    sentToday: await countSentToday(leg.db, {
      tenantId: leg.at.tenantId,
      conversationId: leg.at.conversationId,
      source: VOICE_SEND_SOURCE,
    }),
    dailyCap: VOICE_SENDS_PER_DAY,
    nowMs: Date.now(),
  });
}

/**
 * A send refused before any row existed, by the gate or by the Autonomy tab's booking hold: said to the caller, and
 * recorded. Every other refusal in the product lands somewhere durable -- the door writes message.send_blocked, a
 * broadcast marks its recipient, a failed send flags the thread -- and this one was a line on stdout, so "she says she
 * never got the link" had no answer. The door's own kind, naming the thread rather than a message, because the refusal
 * came before any row existed to name. The caller is on the line, so the agent is told what to SAY -- never that a
 * colleague is mid-thread with them, or what our policy is.
 */
export async function refusedOnTheCall(
  db: Db,
  L: Logger,
  refusal: OutboundRefusal,
  at: RefusedAt,
  channel: "whatsapp" | "sms",
): Promise<Response> {
  L.info("retell_fn_refused", { tenant_id: at.tenantId, reason: refusal, mode: at.mode, person_mode: at.personMode });
  await emitEvent(db, at.tenantId, "message.send_blocked", "conversation", at.conversationId, {
    reason: refusal,
    source: VOICE_SEND_SOURCE,
    channel,
    call_id: at.callId ?? null,
  });
  return json(200, { result: refusalScript(refusal, at.publishedNumber, channel) });
}

/**
 * What the wire's refusal is said as on a call. An erased person is spoken of as one who asked us to stop, which is
 * what they did. Email's refusals and outreach's cannot arise on a phone's wire; the compiler cannot know that. The
 * call names the refusals it has words for, and for any other one, "it could not be sent" is the true thing to say.
 */
export function saidOfTheWire(r: DeliveryRefusal): OutboundRefusal {
  if (r === "erased") return "opted_out";
  if (r === "superseded_by_human") return "human_has_it";
  return r === "opted_out" ||
    r === "not_opted_in" ||
    r === "no_marketing_consent" ||
    r === "paused" ||
    r === "human_has_it" ||
    r === "sms_carries_no_promotions"
    ? r
    : "policy_hold";
}

/** Why the link went by text: the caller asked, or WhatsApp could not carry it (no approved message, no WhatsApp, Meta's no). */
type TextAfter = "caller_asked" | "no_template" | "no_whatsapp" | "whatsapp_refused";

/** Spoken once the text is on its way: it comes as a text, whatever the call said before. */
const TEXT_SENT =
  "Booking link sent to them by text message. Tell them it comes as a text and should be on their phone in a moment.";

/** Spoken when the text went because WhatsApp refused it: what happened, so the caller is not waiting on WhatsApp. */
const TEXT_AFTER_WHATSAPP =
  "The WhatsApp message could not be delivered, so the booking link was sent by text message instead. Tell them it comes as a text and should be on their phone in a moment.";

/** Spoken when the carrier refused the text in the moment: the number most likely takes no texts (a landline). */
const textNotDelivered = (publishedNumber: string | null) =>
  publishedNumber
    ? `The text message could not be delivered — that number may not take texts. Tell the caller they can book online, or reach us on ${publishedNumber}, and take ${NO_LINK_DETAILS} so the team can follow up.`
    : `The text message could not be delivered — that number may not take texts. Tell the caller they can book online, and take ${NO_LINK_DETAILS} so the team can follow up.`;

/** Spoken when the text may not have gone, for any reason of ours: never that it went, never the caller's phone. */
const TEXT_UNSURE = `The text message may not have gone out. Tell the caller they can book online, and take ${NO_LINK_DETAILS} so the team can follow up.`;

/**
 * The booking link by text from the workspace's texting line, or null when it has none the door would send on (core
 * textRefusal: active with the carriers, no test filing), and the door then says what it said before. The gate is asked
 * again for this channel: a yes covering WhatsApp is not one covering texts, and the day's cap counts what just failed.
 */
export async function linkByText(leg: LinkLeg, after: TextAfter): Promise<Response | null> {
  const { db, L, at } = leg;
  if (textRefusal("conversational", await textLineFacts(db, at.tenantId)) !== null) return null;
  const gate = await gateOnTheCall(leg, "sms", "conversational");
  if (!gate.allowed) return refusedOnTheCall(db, L, gate.refusal ?? "policy_hold", at, "sms");
  const w = senderWords(leg.language);
  // The door every send leaves through, on the workspace's own texting line (smsSenderForTenant; none, or one that could
  // not be read, the door says), recorded in the caller's thread either way, and told this call (onCall).
  const out = await deliver(
    { db, wire: { sms: smsWire(await smsSenderForTenant(db, at.tenantId)) } },
    {
      tenantId: at.tenantId,
      conversationId: at.conversationId,
      contactId: leg.contact.contactId,
      to: leg.target,
      channel: "sms",
      sender: "ai",
      // A reply to their own request, never an offer: the texting line carries none.
      purpose: "conversational",
      ...onTheCall(leg.isCaller),
      body: `${w.linkAsked(leg.business.name, leg.business.link)}\n${w.textStop}.`,
      onCall: at.callId,
      meta: { source: VOICE_SEND_SOURCE, call_id: at.callId ?? null, by: "text", after },
    },
  );
  if (out.outcome === "refused") {
    L.info("retell_fn_refused_at_wire", { tenant_id: at.tenantId, reason: out.reason, channel: "sms" });
    return json(200, { result: refusalScript(saidOfTheWire(out.reason), at.publishedNumber, "sms") });
  }
  if (out.outcome === "failed") {
    L.error("booking_link_text_failed", { tenant_id: at.tenantId, status: out.status, reason: out.reason });
    const refusedThere = out.reason === "provider" && !out.mayHaveGone;
    return json(200, { result: refusedThere ? textNotDelivered(at.publishedNumber) : TEXT_UNSURE });
  }
  L.info("retell_fn_texted", { tenant_id: at.tenantId, sid: out.externalId, after });
  return json(200, { result: after === "whatsapp_refused" ? TEXT_AFTER_WHATSAPP : TEXT_SENT });
}
