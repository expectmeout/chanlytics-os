/**
 * How a call ended, as the platform reads it (decision 0092): the platform's half of the one table of the provider's
 * endings, beside the owner's half in call-endings.ts. Each ending says what the Health page reads, whose it is, whether
 * it pages the platform, and for an ending of ours what mends it. It is held to exactly the owner's half's reasons
 * (`satisfies Record<CallEndingReason, …>`), so the two halves cannot drift apart; it is read by the edge (a call that
 * ended our way pages, call-event.ts) and the Console (console/health-parts.ts), never by a workspace's pages.
 *
 * Whose an ending is: the caller's (they hung up, never answered, were spam), the business's (its receptionist or a
 * person ended or took the call, or a transfer to its line did not go through), or the platform's (the provider's
 * account, our webhook, a provider's error): only the platform's page the platform, since the platform is the one that
 * can mend them, and an owner is told "a problem on our side", never the provider's account or its credit.
 */
import {
  CALL_ENDINGS_FOR_OWNERS,
  isCallEndingReason,
  type CallEndingForOwner,
  type CallEndingReason,
} from "./call-endings";

/** Whose an ending is: who could have done otherwise. */
export type CallEndingWhose = "caller" | "business" | "platform";

/** An ending as the platform reads it. */
interface CallEndingForPlatform {
  /** What the platform reads on the Health page, in a sentence's middle ("the call …"). */
  platform: string;
  whose: CallEndingWhose;
  /** The platform is paged when a call ends this way: something of ours is broken for every call until it is mended. */
  pages: boolean;
  /** For an ending of the platform's, what mends it: the Health page's note and the page's body. */
  mend?: string;
}

/** An ending whole: what the owner reads, and what the platform reads. */
export type CallEnding = CallEndingForOwner & CallEndingForPlatform;

/** An ending of the caller's or the business's: said, never paged. */
const said = (platform: string, whose: "caller" | "business"): CallEndingForPlatform => ({
  platform,
  whose,
  pages: false,
});

/** An error of the provider's, or ours as it reached the provider: the caller was failed, and the platform is told. */
const providerError = (platform: string, mend: string): CallEndingForPlatform => ({
  platform,
  whose: "platform",
  pages: true,
  mend,
});

const CALL_ENDINGS_FOR_PLATFORM = {
  user_hangup: said("hung up", "caller"),
  agent_hangup: said("the receptionist ended it", "business"),
  call_transfer: said("passed to a person", "business"),
  transfer_bridged: said("passed to a person", "business"),
  transfer_cancelled: said("a transfer did not go through", "business"),
  voicemail_reached: said("reached voicemail", "caller"),
  machine_detected: said("reached an answering machine", "caller"),
  ivr_reached: said("reached an automated menu", "caller"),
  dial_no_answer: said("nobody answered", "caller"),
  dial_busy: said("the line was busy", "caller"),
  dial_failed: said("the call couldn't connect", "caller"),
  user_declined: said("the customer declined it", "caller"),
  error_user_not_joined: said("the caller never joined", "caller"),
  registered_call_timeout: said("the caller never joined in time", "caller"),
  inactivity: said("went quiet", "caller"),
  marked_as_spam: said("flagged as spam by the carrier", "caller"),
  scam_detected: said("ended as a likely scam", "caller"),
  max_duration_reached: said("ran past the longest a call may last", "business"),
  manual_stopped: said("ended from the dashboard", "business"),
  call_take_over: said("a person took it over", "business"),
  concurrency_limit_reached: {
    platform: "too many calls at once",
    whose: "platform",
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
} as const satisfies Record<CallEndingReason, CallEndingForPlatform>;

/** Every ending the table holds, whole: the owner's half and the platform's. */
export const CALL_ENDINGS = Object.fromEntries(
  Object.keys(CALL_ENDINGS_FOR_OWNERS).map((r) => [r, callEndingOf(r)]),
) as Record<CallEndingReason, CallEnding>;

/**
 * The ending a reason names, or one in plain words for a reason the table does not hold yet: an `error_` the provider
 * adds is the platform's and pages, anything else is said as the words its code is made of, the caller's, and no page.
 * Null for a call with no reason.
 */
export function callEndingOf(reason: string | null | undefined): CallEnding | null {
  if (!reason) return null;
  if (isCallEndingReason(reason)) return { ...CALL_ENDINGS_FOR_OWNERS[reason], ...CALL_ENDINGS_FOR_PLATFORM[reason] };
  const words = reason.replace(/_/g, " ");
  if (reason.startsWith("error"))
    return {
      owner: "The phone service had a problem on our side",
      needsEar: true,
      ...providerError(words, "The voice provider's log has the call: look it up by its time."),
    };
  return { owner: words.charAt(0).toUpperCase() + words.slice(1), needsEar: false, ...said(words, "caller") };
}

/** What the Health page says of each ending (console/health-parts.ts). */
export const CALL_ENDING_PLATFORM_WORDS: Record<string, string> = Object.fromEntries(
  Object.entries(CALL_ENDINGS_FOR_PLATFORM).map(([r, e]) => [r, e.platform]),
);
/** What mends each ending that is the platform's (console/health-parts.ts). */
export const CALL_ENDING_MENDS: Record<string, string> = Object.fromEntries(
  Object.entries(CALL_ENDINGS_FOR_PLATFORM).flatMap(([r, e]) => ("mend" in e && e.mend ? [[r, e.mend]] : [])),
);
