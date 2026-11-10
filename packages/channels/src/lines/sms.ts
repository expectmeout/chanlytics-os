/**
 * SMS on a Chanlytics line, the pure parts: Twilio's inbound webhook read
 * into one shape and made into the one inbound shape the receptionist reads
 * (inboundFromSms, decision 0001), the signature every inbound request must
 * carry, the footer the first reply carries, and the words a held text
 * shows. Nothing here touches the network; the edge supplies fetch and the
 * vault, the tests supply fixtures.
 *
 * Verified against Twilio's docs on 2026-09-07: the inbound parameters
 * (MessageSid, From, To, Body, NumMedia, MediaContentType0, OptOutType,
 * MessagingServiceSid) and the X-Twilio-Signature rule — HMAC-SHA1 of the
 * exact URL plus every POST field sorted by name with its value appended,
 * keyed with the auth token of the account the number belongs to, base64.
 */
import {
  CONVERSATION_OPT_IN_PATTERN,
  LINE_CODES_MAX,
  LINE_CODES_WITHIN_MS,
  MARKETING_OPT_IN_PATTERN,
  oneTimeCodeOf,
  utf8Bytes,
  type LineCodeDto,
} from "@chanlytics/contracts";
import type { ReceivedText } from "./lines";
import type { InboundMessage } from "../inbound/inbound";
import { asksToStop } from "../inbound/stop-request";

/** Twilio's inbound message, the fields the product reads. */
export interface SmsInbound {
  messageSid: string;
  /** E.164 as Twilio sends it. */
  from: string;
  to: string;
  body: string;
  numMedia: number;
  mediaTypes: string[];
  /** Twilio's own opt-out handling, when it fired: STOP · START · HELP. */
  optOutType: "STOP" | "START" | "HELP" | null;
  messagingServiceSid: string | null;
  accountSid: string | null;
}

/** The form fields of one inbound webhook as one object; null when it is not a message. */
export function smsInboundFrom(form: Record<string, string>): SmsInbound | null {
  const messageSid = form.MessageSid || form.SmsSid || "";
  const from = form.From || "";
  const to = form.To || "";
  if (!messageSid || !from || !to) return null;
  const numMedia = Math.max(0, Number.parseInt(form.NumMedia || "0", 10) || 0);
  const mediaTypes: string[] = [];
  for (let i = 0; i < numMedia; i++) {
    const t = form[`MediaContentType${i}`];
    if (t) mediaTypes.push(t);
  }
  const opt = (form.OptOutType || "").toUpperCase();
  return {
    messageSid,
    from,
    to,
    body: form.Body ?? "",
    numMedia,
    mediaTypes,
    optOutType: opt === "STOP" || opt === "START" || opt === "HELP" ? opt : null,
    messagingServiceSid: form.MessagingServiceSid || null,
    accountSid: form.AccountSid || null,
  };
}

/** The sender's digits: the thread key, the same form a WhatsApp id takes, so one person is one thread on both wires. */
const senderDigits = (s: SmsInbound): string => s.from.replace(/[^\d]/g, "");

/** What a text says: its words, with its pictures noted after them; null when it has no words. */
function textWithPictures(s: SmsInbound): string | null {
  const words = s.body.trim();
  if (!words) return null;
  return s.numMedia > 0 ? `${words} [with ${s.numMedia === 1 ? "a picture" : `${s.numMedia} pictures`}]` : words;
}

/**
 * The inbound text as the one inbound shape (inbound.ts, decision 0001), read from Twilio's fields. Words are a text,
 * and a picture with words is answered for its words with the picture noted; a picture alone, or nothing, is
 * "unsupported", which the receptionist acknowledges as it does a sticker. The sender's digits are their id, the same
 * form a WhatsApp id takes, so one person is one thread across both wires. It came the second it reached us. A stop is
 * the carriers' own words for a line, which hold every word and sentence the normaliser reads as one and more
 * (stop-request.ts), or the carrier's verdict, which outranks the words.
 */
export function inboundFromSms(smsInbound: SmsInbound, nowMs = Date.now()): InboundMessage & { channel: "sms" } {
  const digits = senderDigits(smsInbound);
  const body = textWithPictures(smsInbound);
  const carrier = mergeConsent(carrierConsent(smsInbound), smsKeywordConsent(smsInbound.body));
  return {
    channel: "sms",
    externalId: smsInbound.messageSid,
    identity: { externalId: digits, phoneE164: digits ? `+${digits}` : null, email: null },
    profileName: null,
    type: body ? "text" : "media",
    kind: body ? "text" : "unsupported",
    rawType: body ? "text" : smsInbound.numMedia > 0 ? "image" : "unsupported",
    body,
    channelTsIso: new Date(Math.floor(nowMs / 1000) * 1000).toISOString(),
    media: null,
    consent: {
      optOut: !!carrier?.optOut,
      optIn: (body !== null && CONVERSATION_OPT_IN_PATTERN.test(body)) || !!carrier?.optIn,
      optInMarketing: body !== null && MARKETING_OPT_IN_PATTERN.test(body),
    },
    referral: null,
  };
}

/**
 * What the carrier already decided about this text, and what the carriers'
 * own words say.
 *
 * Twilio recognises the standard opt-out and opt-in words itself, acts on
 * them at the carrier, and says so in OptOutType -- but only when Advanced
 * Opt-Out is switched on for the Messaging Service, so the words are read as
 * well. Either source is enough: a number the carrier has blocked is
 * unreachable whatever our record says, so the record must agree with the
 * carrier. Neither is applied to WhatsApp, which has no carrier rule.
 */
export interface CarrierConsent {
  optOut: boolean;
  optIn: boolean;
}

export function carrierConsent(smsInbound: Pick<SmsInbound, "optOutType">): CarrierConsent | null {
  if (smsInbound.optOutType === "STOP") return { optOut: true, optIn: false };
  if (smsInbound.optOutType === "START") return { optOut: false, optIn: true };
  return null;
}

/**
 * The carriers' opt-out words, and the same request written as a sentence (stop-request.ts), whole-message. Opt-in
 * words stay the product's own (START, UNSTOP, RESUME).
 */
export function smsKeywordConsent(body: string | null | undefined): CarrierConsent | null {
  if (!asksToStop(body, "sms")) return null;
  return { optOut: true, optIn: false };
}

export function mergeConsent(
  carrierConsent: CarrierConsent | null,
  consentRecord: CarrierConsent | null,
): CarrierConsent | null {
  if (!carrierConsent) return consentRecord;
  if (!consentRecord) return carrierConsent;
  return {
    optOut: carrierConsent.optOut || consentRecord.optOut,
    optIn: carrierConsent.optIn || consentRecord.optIn,
  };
}

/**
 * The codes among a number's recent texts, as the page says them: the ones sent within LINE_CODES_WITHIN_MS of `nowMs`,
 * newest first, at most LINE_CODES_MAX, each with the instant the provider says it was sent. The provider's list is read
 * for the number (recentTexts); nothing here is stored.
 */
export function lineCodesFrom(texts: readonly ReceivedText[], nowMs: number): LineCodeDto[] {
  return [...texts]
    .filter((t) => nowMs - t.atMs <= LINE_CODES_WITHIN_MS)
    .sort((a, b) => b.atMs - a.atMs)
    .flatMap((t): LineCodeDto[] => {
      const read = oneTimeCodeOf(t.body);
      return read ? [{ code: read.code, from: read.from, at: new Date(t.atMs).toISOString() }] : [];
    })
    .slice(0, LINE_CODES_MAX);
}

/**
 * The carrier's verdict on the way OUT, as carrierConsent is its verdict on
 * the way in.
 *
 * Twilio refuses a text to a number that replied STOP to it with 21610,
 * "attempt to send to unsubscribed recipient": the person's own no, which the
 * carrier kept and we never heard -- it went to the carrier, or came before
 * the line's webhook pointed here. The number is unreachable whatever our
 * record says, so the send door (core deliver.ts) records it as the STOP it is
 * and refuses as it refuses a recorded no. Every other code -- an unregistered
 * line (30034), a bad number, a limit -- is a failure of ours, and stays one.
 */
export const SMS_OPTED_OUT_CODE = 21610;

export function smsRefusalOf(row: { ok: boolean; code?: number | null }): "opted_out" | null {
  return !row.ok && row.code === SMS_OPTED_OUT_CODE ? "opted_out" : null;
}

/**
 * What the first reply to a number carries, once. Carrier guidance for A2P
 * traffic: the rates disclosure, how to stop, and how to get help -- the third
 * was missing while every sample the campaign files promised it.
 */
export const SMS_FOOTER = "Msg & data rates may apply. Reply STOP to opt out, HELP for help.";
/** Twilio's ceiling for one message body. */
export const SMS_MAX_CHARS = 1600;

/** The reply as it goes out: the footer on the first reply to this person, and never over the ceiling. */
export function smsBody(reply: string, isFirstReply: boolean): string {
  const text = reply.trim();
  // A reply that already says how to stop ("Reply STOP to …") carries the disclosure itself; a STOP said any other way
  // does not.
  const footer = isFirstReply && !/\breply stop\b/i.test(text) ? `\n${SMS_FOOTER}` : "";
  // The words are cut, never the footer: the disclosure the campaign filing promises on a first text is the one part
  // that must arrive whole, so it is kept and the reply makes room for it.
  const room = SMS_MAX_CHARS - footer.length;
  const words = text.length > room ? `${text.slice(0, room - 1)}…` : text;
  return `${words}${footer}`;
}

/** The hold while the carriers have not approved the line: the Inbox's reason and its words. */
export const SMS_HELD_REASON = "carriers";
export const SMS_HELD_DETAILS =
  "This text arrived on your line before the carriers approved it for texting, so the receptionist did not answer. It is kept here; answer it yourself, or wait for the approval on Setup.";

/** Where a line's texts arrive: beside the voice webhooks, on the same edge. */
export function smsInboundUrl(fnUrl: string): string {
  return `${fnUrl.replace(/\/api\/retell-fn$/, "")}/api/inbound-sms`;
}

/** Where the carrier's word on a text we sent arrives: the StatusCallback on every send. */
export function smsStatusUrl(fnUrl: string): string {
  return `${fnUrl.replace(/\/api\/retell-fn$/, "")}/api/sms-status`;
}

/** One status callback's fields as one object; null when it is not one. */
export interface SmsStatus {
  messageSid: string;
  /** Twilio's word: queued, accepted, sending, sent, delivered, undelivered, failed, canceled, read. */
  status: string;
  /** The carrier's reason when it refused, as Twilio numbers it (30007 filtered, 30003 unreachable, ...). */
  errorCode: string | null;
  /** The number the text left from: the line. */
  from: string;
  /** The person it went to. */
  to: string;
  messagingServiceSid: string | null;
  accountSid: string | null;
}

export function smsStatusFrom(form: Record<string, string>): SmsStatus | null {
  const messageSid = form.MessageSid || form.SmsSid || "";
  const status = (form.MessageStatus || form.SmsStatus || "").toLowerCase();
  const from = form.From || "";
  const to = form.To || "";
  if (!messageSid || !status || !from || !to) return null;
  return {
    messageSid,
    status,
    errorCode: form.ErrorCode ? String(form.ErrorCode) : null,
    from,
    to,
    messagingServiceSid: form.MessagingServiceSid || null,
    accountSid: form.AccountSid || null,
  };
}

/**
 * The row's word for the carrier's. The row is already `sent` when the
 * provider accepted the text, so only what the carrier adds is recorded:
 * delivered, read, or a refusal. The interim words (queued, accepted,
 * sending, scheduled) say nothing the row does not know, and are ignored.
 */
export function smsStatusToRow(status: string): "sent" | "delivered" | "read" | "failed" | null {
  switch (status) {
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "undelivered":
    case "failed":
    case "canceled":
      return "failed";
    default:
      return null;
  }
}

/** The exact string Twilio signs: the URL as requested, then each POST field sorted by name with its value appended. */
export function twilioSignedString(url: string, form: Record<string, string>): string {
  return (
    url +
    Object.keys(form)
      .sort()
      .map((k) => `${k}${form[k]}`)
      .join("")
  );
}

/** HMAC-SHA1 of the signed string with the auth token, base64 — the value of X-Twilio-Signature. */
export async function signTwilio(authToken: string, url: string, form: Record<string, string>): Promise<string> {
  const key = await crypto.subtle.importKey("raw", utf8Bytes(authToken), { name: "HMAC", hash: "SHA-1" }, false, [
    "sign",
  ]);
  const mac = await crypto.subtle.sign("HMAC", key, utf8Bytes(twilioSignedString(url, form)));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

/** Constant-time equality on the two base64 strings. */
export function sameSignature(first: string, second: string): boolean {
  if (first.length !== second.length) return false;
  let diff = 0;
  for (let i = 0; i < first.length; i++) diff |= first.charCodeAt(i) ^ second.charCodeAt(i);
  return diff === 0;
}

export async function verifyTwilioSignature(
  authToken: string,
  url: string,
  form: Record<string, string>,
  header: string | null,
): Promise<boolean> {
  if (!header) return false;
  return sameSignature(await signTwilio(authToken, url, form), header);
}
