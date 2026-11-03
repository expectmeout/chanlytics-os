/**
 * How a call ended, decided once (decision 0092): every ending the voice provider names, each with what the owner reads,
 * what the platform reads, whose it is, whether Today shows it as a call worth an ear, and whether it pages the platform.
 *
 * The provider's endings were spelled in three lists that had drifted apart: the owner's labels (16, with no word for a
 * provider's credit running out or any error), the Health page's words and its "ours to mend" notes (11), and Today's
 * four "worth an ear". An owner read a provider code for a call that failed on our side, and the platform was never
 * told that its own inbound webhook had failed a call (`error_inbound_webhook`). The three are now read from here
 * (DISCONNECTION_LABELS in conversations/call-dto.ts, the Health page's words in console/health-parts.ts, Today's
 * calls worth an ear in today/today-rows.ts), and an ending the provider adds that this table does not name is said
 * in plain words by `callEndingOf`, never as its code, and fails voice/call-endings.test.mjs until it is given its row.
 *
 * Whose an ending is: the caller's (they hung up, never answered, were spam), the business's (its receptionist or a
 * person ended or took the call, or a transfer to its line did not go through), or the platform's (the provider's
 * account, our webhook, a provider's error): only the platform's page the platform, since the platform is the one that
 * can mend them, and an owner is told "a problem on our side", never the provider's account or its credit.
 */

/** Whose an ending is: who could have done otherwise. */
export type CallEndingWhose = "caller" | "business" | "platform";

export interface CallEnding {
  /** What the owner reads on the call: the Inbox's card, the call page, the notice. */
  owner: string;
  /** What the platform reads on the Health page, in a sentence's middle ("the call …"). */
  platform: string;
  whose: CallEndingWhose;
  /** Today shows the call as one worth an ear: somebody rang and was not served. */
  needsEar: boolean;
  /** The platform is paged when a call ends this way: something of ours is broken for every call until it is mended. */
  pages: boolean;
  /** For an ending of the platform's, what mends it: the Health page's note and the page's body. */
  mend?: string;
}

/** An error of the provider's, or ours as it reached the provider: the caller was failed, and the platform is told. */
const providerError = (platform: string, mend: string): CallEnding => ({
  owner: "The phone service had a problem on our side",
  platform,
  whose: "platform",
  needsEar: true,
  pages: true,
  mend,
});

/** Every ending the provider names, as of its call-object reference (October 2026), and the two Live's controls make. */
export const CALL_ENDINGS = {
  user_hangup: { owner: "Customer hung up", platform: "hung up", whose: "caller", needsEar: false, pages: false },
  agent_hangup: {
    owner: "Receptionist ended the call",
    platform: "the receptionist ended it",
    whose: "business",
    needsEar: false,
    pages: false,
  },
  call_transfer: {
    owner: "Transferred to a person",
    platform: "passed to a person",
    whose: "business",
    needsEar: false,
    pages: false,
  },
  transfer_bridged: {
    owner: "Transferred to a person",
    platform: "passed to a person",
    whose: "business",
    needsEar: false,
    pages: false,
  },
  transfer_cancelled: {
    owner: "Transfer did not go through",
    platform: "a transfer did not go through",
    whose: "business",
    needsEar: true,
    pages: false,
  },
  voicemail_reached: {
    owner: "Reached voicemail",
    platform: "reached voicemail",
    whose: "caller",
    needsEar: false,
    pages: false,
  },
  machine_detected: {
    owner: "Reached an answering machine",
    platform: "reached an answering machine",
    whose: "caller",
    needsEar: false,
    pages: false,
  },
  ivr_reached: {
    owner: "Reached an automated menu",
    platform: "reached an automated menu",
    whose: "caller",
    needsEar: false,
    pages: false,
  },
  dial_no_answer: { owner: "No answer", platform: "nobody answered", whose: "caller", needsEar: true, pages: false },
  dial_busy: { owner: "Line was busy", platform: "the line was busy", whose: "caller", needsEar: false, pages: false },
  dial_failed: {
    owner: "Call couldn't connect",
    platform: "the call couldn't connect",
    whose: "caller",
    needsEar: false,
    pages: false,
  },
  user_declined: {
    owner: "Customer declined the call",
    platform: "the customer declined it",
    whose: "caller",
    needsEar: false,
    pages: false,
  },
  error_user_not_joined: {
    owner: "The caller never joined",
    platform: "the caller never joined",
    whose: "caller",
    needsEar: false,
    pages: false,
  },
  registered_call_timeout: {
    owner: "The caller never joined",
    platform: "the caller never joined in time",
    whose: "caller",
    needsEar: false,
    pages: false,
  },
  inactivity: { owner: "Ended after silence", platform: "went quiet", whose: "caller", needsEar: true, pages: false },
  marked_as_spam: {
    owner: "Flagged as spam by the carrier",
    platform: "flagged as spam by the carrier",
    whose: "caller",
    needsEar: true,
    pages: false,
  },
  scam_detected: {
    owner: "Ended as a likely scam",
    platform: "ended as a likely scam",
    whose: "caller",
    needsEar: false,
    pages: false,
  },
  max_duration_reached: {
    owner: "Hit the call length limit",
    platform: "ran past the longest a call may last",
    whose: "business",
    needsEar: false,
    pages: false,
  },
  manual_stopped: {
    owner: "Ended from the dashboard",
    platform: "ended from the dashboard",
    whose: "business",
    needsEar: false,
    pages: false,
  },
  call_take_over: {
    owner: "A person took over the call",
    platform: "a person took it over",
    whose: "business",
    needsEar: false,
    pages: false,
  },
  concurrency_limit_reached: {
    owner: "Line was busy — all agents in use",
    platform: "too many calls at once",
    whose: "platform",
    needsEar: true,
    pages: true,
    mend: "The voice provider's plan takes too few calls at once for this workspace.",
  },
  credit_exhausted: providerError(
    "the voice provider's credit ran out",
    "Top up the voice provider's credit: every call fails until it is.",
  ),
  no_valid_payment: providerError(
    "the voice provider has no valid payment on file",
    "Put a valid payment method on the voice provider's account: every call fails until it is.",
  ),
  error_inbound_webhook: providerError(
    "our inbound-call webhook failed it",
    "The edge's /api/retell-inbound did not answer the provider: read its log for the call's time (retell_inbound).",
  ),
  error_llm_websocket_open: providerError(
    "the receptionist's model could not be reached",
    "The voice provider could not open the receptionist's model: look the call up in the provider's log by its time.",
  ),
  error_llm_websocket_lost_connection: providerError(
    "the receptionist's model dropped mid-call",
    "The voice provider lost the receptionist's model mid-call: look the call up in the provider's log by its time.",
  ),
  error_llm_websocket_runtime: providerError(
    "the receptionist's model failed mid-call",
    "The receptionist's model failed mid-call: look the call up in the provider's log by its time.",
  ),
  error_llm_websocket_corrupt_payload: providerError(
    "the receptionist's model sent what the provider could not read",
    "The receptionist's model answered in a shape the provider refused: look the call up in its log by its time.",
  ),
  error_frontend_corrupted_payload: providerError(
    "the provider could not read the call's audio",
    "The voice provider could not read the call's audio: look the call up in its log by its time.",
  ),
  error_twilio: providerError(
    "the phone company's side failed",
    "The phone company failed the call: read the line's carrier log for the call's time.",
  ),
  error_no_audio_received: providerError(
    "no audio reached the provider",
    "No audio reached the voice provider: check the line's trunk and its forwarding.",
  ),
  error_asr: providerError(
    "the provider could not hear the caller",
    "The voice provider's speech recognition failed: look the call up in its log by its time.",
  ),
  error_retell: providerError(
    "the voice provider failed",
    "The voice provider failed the call: look it up in its log by its time, and its status page.",
  ),
  error_unknown: providerError(
    "an error the provider didn't name",
    "The voice provider's log has the call: look it up by its time.",
  ),
} as const satisfies Record<string, CallEnding>;

/** An ending the provider names and this table holds. */
export type CallEndingReason = keyof typeof CALL_ENDINGS;

/** Whether a reason is one the table holds. */
export const isCallEndingReason = (r: string | null | undefined): r is CallEndingReason =>
  typeof r === "string" && Object.prototype.hasOwnProperty.call(CALL_ENDINGS, r);

/**
 * The ending a reason names, or one in plain words for a reason the table does not hold yet: an `error_` the
 * provider adds is the platform's and pages, anything else is said as the words its code is made of, the caller's,
 * and no page. Null for a call with no reason.
 */
export function callEndingOf(reason: string | null | undefined): CallEnding | null {
  if (!reason) return null;
  if (isCallEndingReason(reason)) return CALL_ENDINGS[reason];
  const words = reason.replace(/_/g, " ");
  if (reason.startsWith("error"))
    return providerError(words, "The voice provider's log has the call: look it up by its time.");
  return {
    owner: words.charAt(0).toUpperCase() + words.slice(1),
    platform: words,
    whose: "caller",
    needsEar: false,
    pages: false,
  };
}

/** Each reason the table holds, by one of its fields: the shape the three old lists had, read from the one table. */
function byField<K extends "owner" | "platform">(k: K): Record<string, string> {
  return Object.fromEntries(Object.entries(CALL_ENDINGS).map(([r, e]) => [r, e[k]]));
}

/** What an owner reads for each ending (conversations/call-dto.ts DISCONNECTION_LABELS). */
export const CALL_ENDING_OWNER_WORDS: Record<string, string> = byField("owner");
/** What the Health page says of each ending (console/health-parts.ts). */
export const CALL_ENDING_PLATFORM_WORDS: Record<string, string> = byField("platform");
/** What mends each ending that is the platform's (console/health-parts.ts). */
export const CALL_ENDING_MENDS: Record<string, string> = Object.fromEntries(
  Object.entries(CALL_ENDINGS).flatMap(([r, e]) => ("mend" in e && e.mend ? [[r, e.mend]] : [])),
);
/** The endings Today shows as a call worth an ear (today/today-rows.ts). */
export const CALL_ENDINGS_NEEDING_AN_EAR: readonly string[] = Object.entries(CALL_ENDINGS)
  .filter(([, e]) => e.needsEar)
  .map(([r]) => r);
