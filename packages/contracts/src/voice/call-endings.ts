/**
 * How a call ended, decided once (decision 0092): every ending the voice provider names, with what the owner reads and
 * whether Today shows it as a call worth an ear. This is the owner's half of the one table, the half a page reads; the
 * platform's half (what the platform reads, whose it is, whether it pages, what mends it) is call-endings-platform.ts,
 * held by the compiler to exactly these reasons, so the words a page loads are only the ones it says.
 *
 * The provider's endings were spelled in three lists that had drifted apart: the owner's labels (16, with no word for a
 * provider's credit running out or any error), the Health page's words and its "ours to mend" notes (11), and Today's
 * four "worth an ear". An owner read a provider code for a call that failed on our side, and the platform was never
 * told that its own inbound webhook had failed a call (`error_inbound_webhook`). The three are now read from here
 * (DISCONNECTION_LABELS in conversations/call-dto.ts, Today's calls worth an ear in today/today-rows.ts, the Health
 * page's words in console/health-parts.ts through the platform's half), and an ending the provider adds that this table
 * does not name is said in plain words by `callEndingOf`, never as its code, and fails voice/call-endings.test.mjs until
 * it is given its row.
 */

/** What an owner reads for a call that ended this way, and whether Today shows it as one worth an ear. */
export interface CallEndingForOwner {
  /** What the owner reads on the call: the Inbox's card, the call page, the notice. */
  owner: string;
  /** Today shows the call as one worth an ear: somebody rang and was not served. */
  needsEar: boolean;
}

/** An ending of ours, as the owner reads it: never the provider's account, its credit or its error's name. */
const OURS = { owner: "The phone service had a problem on our side", needsEar: true } as const;

/** Every ending the provider names, as of its call-object reference (October 2026), and the two Live's controls make. */
export const CALL_ENDINGS_FOR_OWNERS = {
  user_hangup: { owner: "Customer hung up", needsEar: false },
  agent_hangup: { owner: "Receptionist ended the call", needsEar: false },
  call_transfer: { owner: "Transferred to a person", needsEar: false },
  transfer_bridged: { owner: "Transferred to a person", needsEar: false },
  transfer_cancelled: { owner: "Transfer did not go through", needsEar: true },
  voicemail_reached: { owner: "Reached voicemail", needsEar: false },
  machine_detected: { owner: "Reached an answering machine", needsEar: false },
  ivr_reached: { owner: "Reached an automated menu", needsEar: false },
  dial_no_answer: { owner: "No answer", needsEar: true },
  dial_busy: { owner: "Line was busy", needsEar: false },
  dial_failed: { owner: "Call couldn't connect", needsEar: false },
  user_declined: { owner: "Customer declined the call", needsEar: false },
  error_user_not_joined: { owner: "The caller never joined", needsEar: false },
  registered_call_timeout: { owner: "The caller never joined", needsEar: false },
  inactivity: { owner: "Ended after silence", needsEar: true },
  marked_as_spam: { owner: "Flagged as spam by the carrier", needsEar: true },
  scam_detected: { owner: "Ended as a likely scam", needsEar: false },
  max_duration_reached: { owner: "Hit the call length limit", needsEar: false },
  manual_stopped: { owner: "Ended from the dashboard", needsEar: false },
  call_take_over: { owner: "A person took over the call", needsEar: false },
  concurrency_limit_reached: { owner: "Line was busy — all agents in use", needsEar: true },
  credit_exhausted: OURS,
  no_valid_payment: OURS,
  error_inbound_webhook: OURS,
  error_llm_websocket_open: OURS,
  error_llm_websocket_lost_connection: OURS,
  error_llm_websocket_runtime: OURS,
  error_llm_websocket_corrupt_payload: OURS,
  error_frontend_corrupted_payload: OURS,
  error_twilio: OURS,
  error_no_audio_received: OURS,
  error_asr: OURS,
  error_retell: OURS,
  error_unknown: OURS,
} as const satisfies Record<string, CallEndingForOwner>;

/** An ending the provider names and this table holds. */
export type CallEndingReason = keyof typeof CALL_ENDINGS_FOR_OWNERS;

/** Whether a reason is one the table holds. */
export const isCallEndingReason = (r: string | null | undefined): r is CallEndingReason =>
  typeof r === "string" && Object.prototype.hasOwnProperty.call(CALL_ENDINGS_FOR_OWNERS, r);

/** What an owner reads for each ending (conversations/call-dto.ts DISCONNECTION_LABELS). */
export const CALL_ENDING_OWNER_WORDS: Record<string, string> = Object.fromEntries(
  Object.entries(CALL_ENDINGS_FOR_OWNERS).map(([r, e]) => [r, e.owner]),
);
/** The endings Today shows as a call worth an ear (today/today-rows.ts). */
export const CALL_ENDINGS_NEEDING_AN_EAR: readonly string[] = Object.entries(CALL_ENDINGS_FOR_OWNERS)
  .filter(([, e]) => e.needsEar)
  .map(([r]) => r);
