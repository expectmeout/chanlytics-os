/**
 * Whether a message is a one-time code some other service sent: the one reader of it (one predicate per rule). A texting
 * line's door reads it before a text is kept (apps/edge/lib/sms), and the receptionist's verb reads it for every wire
 * before anything is answered (packages/core/src/inbound/ingest.ts), so a WhatsApp message and a text are judged by the
 * same words. Moved here from channels (3 Nov 2026), where the verb could not reach it and kept a looser rule of its own
 * that set aside customers this one answers ("Hi! Your security code is 4512.") and answered codes this one reads.
 */

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
/**
 * How long the code lasts ("It expires in 10 minutes"): a sender's sign beside a sender's kind of code, as the warning is.
 * A customer's gate or door code does not run out in minutes.
 */
const EXPIRES = /\b(?:expires|is valid) (?:in|for) \d+ (?:minutes?|mins?|hours?)\b/i;
/** "Use 482913 to sign in to your account": signing in to an account is a sender's words; a front desk's sign-in is not. */
const USE_FOR_ACCOUNT = new RegExp(String.raw`\b(?:use|enter) ${CODE} to (?:sign|log) in to your account\b`, "iu");
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
  const expires = EXPIRES.test(body);
  const [, name, kind, digits] = YOUR_NAME_CODE.exec(body) ?? [];
  const sender = serviceName(name);
  // A customer's kind beside a name ("Your Airbnb access code is 4512, don't share it") is a customer's: no warning mends it.
  const signed = (k: string | undefined) => sendersKind(k) || (k === undefined && warned);
  if (digits && sender && signed(kind)) return { code: digits, from: sender };
  const [, kindWord, kindOnly] = YOUR_KIND_CODE.exec(body) ?? [];
  if (kindOnly && sendersKind(kindWord) && (warned || expires)) return { code: kindOnly, from: null };
  const [, named, namedBy, namedKind] = CODE_IS_YOUR_NAME.exec(body) ?? [];
  const namedFrom = serviceName(namedBy);
  if (named && namedFrom && signed(namedKind)) return { code: named, from: namedFrom };
  const [, unnamed, unnamedKind] = CODE_IS_YOUR_KIND.exec(body) ?? [];
  if (unnamed && (sendersKind(unnamedKind) || warned)) return { code: unnamed, from: null };
  const [, used] = USE_TO_VERIFY.exec(body) ?? [];
  if (used && warned) return { code: used, from: null };
  const [, forAccount] = USE_FOR_ACCOUNT.exec(body) ?? [];
  if (forAccount) return { code: forAccount, from: null };
  if (ANDROID_TAG.test(body)) {
    const found = [...body.matchAll(new RegExp(CODE, "gu"))].map((m) => m[1]);
    const only = found.length === 1 ? found[0] : undefined;
    if (only) return { code: only, from: null };
  }
  return null;
}
