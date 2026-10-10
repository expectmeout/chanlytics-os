/**
 * SMS on a Chanlytics line, the pure parts: Twilio's inbound webhook read
 * into one shape, that shape handed to the WhatsApp handler as the message
 * it already knows how to answer, the signature every inbound request must
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
import { LINE_CODES_MAX, LINE_CODES_WITHIN_MS, utf8Bytes, type LineCodeDto } from "@chanlytics/contracts";
import type { ReceivedText } from "./lines";
import type { NormalizedInbound, WaRawMessage } from "../whatsapp";
import { asksToStop } from "../stop-request";

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

/**
 * The inbound text as the WhatsApp handler's message. Words are words; a
 * picture with words is answered for its words and the picture is noted; a
 * picture alone is "unsupported", which the handler acknowledges as it does
 * a sticker. The sender's digits are the thread key, the same form a
 * WhatsApp id takes, so one person is one thread across both channels.
 */
export function smsAsWaMessage(s: SmsInbound, nowMs = Date.now()): WaRawMessage {
  const digits = s.from.replace(/[^\d]/g, "");
  const words = s.body.trim();
  const base = { from: digits, id: s.messageSid, timestamp: String(Math.floor(nowMs / 1000)) };
  if (words)
    return {
      ...base,
      type: "text",
      text: {
        body: s.numMedia > 0 ? `${words} [with ${s.numMedia === 1 ? "a picture" : `${s.numMedia} pictures`}]` : words,
      },
    };
  return { ...base, type: s.numMedia > 0 ? "image" : "unsupported" };
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

export function carrierConsent(s: Pick<SmsInbound, "optOutType">): CarrierConsent | null {
  if (s.optOutType === "STOP") return { optOut: true, optIn: false };
  if (s.optOutType === "START") return { optOut: false, optIn: true };
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

export function mergeConsent(a: CarrierConsent | null, b: CarrierConsent | null): CarrierConsent | null {
  if (!a) return b;
  if (!b) return a;
  return { optOut: a.optOut || b.optOut, optIn: a.optIn || b.optIn };
}

/** The normalized message with the carrier's verdict added to its own. Either source is enough. */
export function withCarrierConsent(n: NormalizedInbound, c: CarrierConsent | null): NormalizedInbound {
  if (!c) return n;
  return { ...n, optOut: n.optOut || c.optOut, optIn: n.optIn || c.optIn };
}

/* ---- A one-time code texted to a line by some other service ---- */

/** The longest text taken for a code: a sender's is a line or two, and a customer's paragraph that mentions one is not. */
const ONE_TIME_CODE_MAX_CHARS = 320;
/** A code as a sender writes it: four to eight digits, or six to eight digits split by one dash or space (788-963, 123 456). */
const CODE_DIGITS = String.raw`(\d{3,4}[ -]\d{3,4}|\d{4,8})`;
/** A code on its own: no digit or letter against either side of it. */
const CODE = String.raw`(?<![\d\w])${CODE_DIGITS}(?![\d\w])`;
/** The words a sender puts between its name and "code". */
const CODE_KIND = String.raw`(?:verification|security|confirmation|login|log-in|sign-in|access|one-time|authentication)`;
/**
 * The kinds that are a sender's sign on their own. Security, access and confirmation are not: a customer's alarm, gate or
 * booking has one too ("Your access code is 4512, don't share it"), so with them only the warning and a sender's name count.
 */
const SENDERS_KIND = /^(?:verification|login|log-in|sign-in|one-time|authentication) ?$/i;
const sendersKind = (kind: string | undefined): boolean => kind !== undefined && SENDERS_KIND.test(kind);
/** The sender's name: one to three words, which a test of its own (serviceName) holds to what a brand looks like. */
const CODE_NAME = String.raw`([\p{L}\d&.'’-]+(?: [\p{L}\d&.'’-]+){0,2}?)`;
const CODE_WORD = String.raw`(?:code|passcode|otp|pin)`;
/**
 * Where a sender's phrase ends: the end of the text, a stop, a comma or a new line. A customer goes on ("your Rewards code
 * 123456 doesn't work", "your Summer code 2024 and it said invalid"); a sender's code, or its word "code", ends the phrase.
 */
const ENDS = String.raw`(?=[ \t]*(?:$|[.,;!\r\n]))`;
/** "Your WhatsApp code: 788-963", "Your Chase one-time code is 482913.": the code straight after the word, ending the phrase. */
const YOUR_NAME_CODE = new RegExp(
  String.raw`\byour ${CODE_NAME} (${CODE_KIND} )?${CODE_WORD}\b[ :]{0,3}(?:is\b[ :]{0,3})?${CODE}${ENDS}`,
  "iu",
);
/** "Your verification code is 123456.": a kind of code and no name. */
const YOUR_KIND_CODE = new RegExp(
  String.raw`\byour (${CODE_KIND}) ${CODE_WORD}\b[ :]{0,3}(?:is\b[ :]{0,3})?${CODE}${ENDS}`,
  "iu",
);
/** "123456 is your verification code": a kind of code and no name. */
const CODE_IS_YOUR_KIND = new RegExp(String.raw`${CODE} is your (${CODE_KIND}) ${CODE_WORD}\b${ENDS}`, "iu");
/** "G-123456 is your Google verification code.", "123 456 is your Instagram code.". */
const CODE_IS_YOUR_NAME = new RegExp(
  String.raw`${CODE} is your ${CODE_NAME} (${CODE_KIND} )?${CODE_WORD}\b${ENDS}`,
  "iu",
);
/** "Use 482913 to verify your account": a code a sender says what to do with. */
const USE_TO_VERIFY = new RegExp(String.raw`\b(?:use|enter) ${CODE} to (?:verify|activate|authenticate)\b`, "iu");
/** The warning every sender puts beside a code. A customer who shares a gate code may write it too, so it is never enough alone. */
const DONT_SHARE = /\b(?:don'?t|do not|never) share (?:this|the|your|it)\b/i;
/** The mark Android's SMS retriever asks every sender to put first. */
const ANDROID_TAG = /^\s*<#>\s/;
/** What a customer's own sentence calls a thing that is not a sender, and the kinds of code: never the name of a service. */
const NOT_A_SERVICE =
  /^(?:door|gate|garage|locker|lock|building|entry|promo|discount|coupon|gift|referral|booking|appointment|order|reservation|alarm|wi-?fi|security|verification|confirmation|login|log-in|sign-in|access|one-time|authentication)$/i;

/** A name as a brand writes it: each word has a capital in it (WhatsApp, Apple ID, iCloud) and none is a thing a customer owns. */
function serviceName(name: string | undefined): string | null {
  if (!name) return null;
  return name.split(" ").every((w) => /\p{Lu}/u.test(w) && !NOT_A_SERVICE.test(w)) ? name : null;
}

/**
 * Whether a text is a one-time code some service sent (Meta's, when an owner connects the line's number to WhatsApp), and
 * which. The receptionist never answers one, no person or message is made of it, and its delivery is not kept
 * (apps/edge/lib/sms), so the rule is conservative on purpose: a text taken for a code silences a customer for good, and
 * one missed is only answered as it was. It is a text of at most 320 characters with no question mark, in a sender's own
 * shape, with a sender's own sign beside it:
 *   - "your <Name> [kind] code <code>" or "<code> is your <Name> [kind] code", the phrase ending there, and a sender's kind
 *     of code named (verification, one-time, login, sign-in, authentication: never security, access or confirmation, which a
 *     customer's alarm, gate or booking has too, and which rule the text out) or, with no kind named, the warning not to
 *     share it ("Your WhatsApp code: 788-963 / Don't share this code with others");
 *   - "your <kind> code <code>" with a sender's kind and the warning; "<code> is your <kind> code" with a sender's kind or
 *     the warning;
 *   - "use <code> to verify" (or activate, authenticate: never confirm or sign in, a gate's words too) and the warning;
 *   - a leading `<#>`, Android's retriever mark, and exactly one code.
 * A customer's text has the words of one at most ("the gate code is 4512, don't share it", "your Rewards code 123456
 * doesn't work", "I tried your Summer code 2024"): none of them is a sender's shape and sign together. Digits only, four to
 * eight. It answers the code as it was written, and the name of the service when the text says one.
 */
export function oneTimeCodeOf(body: string): { code: string; from: string | null } | null {
  if (body.length > ONE_TIME_CODE_MAX_CHARS || body.includes("?")) return null;
  const warned = DONT_SHARE.test(body);
  const [, name, kind, digits] = YOUR_NAME_CODE.exec(body) ?? [];
  const sender = serviceName(name);
  // A customer's kind beside a name ("Your Airbnb access code is 4512, don't share it") is a customer's: no warning mends it.
  const signed = (k: string | undefined) => sendersKind(k) || (k === undefined && warned);
  if (digits && sender && signed(kind)) return { code: digits, from: sender };
  const [, kindWord, kindOnly] = YOUR_KIND_CODE.exec(body) ?? [];
  if (kindOnly && sendersKind(kindWord) && warned) return { code: kindOnly, from: null };
  const [, named, namedBy, namedKind] = CODE_IS_YOUR_NAME.exec(body) ?? [];
  const namedFrom = serviceName(namedBy);
  if (named && namedFrom && signed(namedKind)) return { code: named, from: namedFrom };
  const [, unnamed, unnamedKind] = CODE_IS_YOUR_KIND.exec(body) ?? [];
  if (unnamed && (sendersKind(unnamedKind) || warned)) return { code: unnamed, from: null };
  const [, used] = USE_TO_VERIFY.exec(body) ?? [];
  if (used && warned) return { code: used, from: null };
  if (ANDROID_TAG.test(body)) {
    const found = [...body.matchAll(new RegExp(CODE, "gu"))].map((m) => m[1]);
    const only = found.length === 1 ? found[0] : undefined;
    if (only) return { code: only, from: null };
  }
  return null;
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

export function smsRefusalOf(r: { ok: boolean; code?: number | null }): "opted_out" | null {
  return !r.ok && r.code === SMS_OPTED_OUT_CODE ? "opted_out" : null;
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
  const withFooter = isFirstReply && !text.includes("STOP") ? `${text}\n${SMS_FOOTER}` : text;
  return withFooter.length > SMS_MAX_CHARS ? `${withFooter.slice(0, SMS_MAX_CHARS - 1)}…` : withFooter;
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
export async function twilioSignature(authToken: string, url: string, form: Record<string, string>): Promise<string> {
  const key = await crypto.subtle.importKey("raw", utf8Bytes(authToken), { name: "HMAC", hash: "SHA-1" }, false, [
    "sign",
  ]);
  const mac = await crypto.subtle.sign("HMAC", key, utf8Bytes(twilioSignedString(url, form)));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

/** Constant-time equality on the two base64 strings. */
export function sameSignature(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyTwilioSignature(
  authToken: string,
  url: string,
  form: Record<string, string>,
  header: string | null,
): Promise<boolean> {
  if (!header) return false;
  return sameSignature(await twilioSignature(authToken, url, form), header);
}
