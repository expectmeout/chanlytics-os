/**
 * A call on the wire: the call DTO, whether an inbound caller left with nothing (`abandonedCall`), and why a
 * call ended, in the owner's words. The call's row is call-vm.ts; Live and Today read these too.
 */

export interface CallDto {
  id: string;
  retell_call_id: string;
  direction: "inbound" | "outbound";
  call_type: string | null;
  status: string;
  from_e164: string | null;
  from_raw: string | null;
  to_e164: string | null;
  started_at: string | null;
  ended_at: string | null;
  /** Moves on every provider event — the heartbeat isLiveCall() reads. */
  updated_at?: string | null;
  duration_ms: number | null;
  disconnection_reason: string | null;
  sentiment: string | null;
  call_successful: boolean | null;
  in_voicemail: boolean | null;
  summary: string | null;
  /** From the post-call analysis (calls.wanted …): what the caller wanted in
   *  plain words, how it ended, what to do next, the name they gave. Absent
   *  on calls analysed before the schema existed. */
  wanted?: string | null;
  outcome?: string | null;
  follow_up?: string | null;
  caller_name?: string | null;
  /** The address they spelled out (analysis.caller_email), as normalizeEmail
   *  stores it, or absent: a suggestion for the person's page, never applied
   *  to the contact by itself, like the name beside it. */
  caller_email?: string | null;
  /** Turns. `start`/`end` (seconds) are the turn's first and last word; `words` is
   *  the raw provider shape and is stripped by the list route (F15). */
  transcript_object: Array<{
    role?: string;
    content?: string;
    start?: number;
    end?: number;
    words?: Array<{ start?: number; end?: number }>;
  }> | null;
  /** storage_path and provider_url are stripped server-side — audio is only
   *  reachable through the signed-URL route. */
  recording: { fetch_state?: string; mime?: string | null; bytes?: number } | null;
  conversation_id: string | null;
  contact_id: string | null;
  message_id: string | null;
  contact: { display_name: string | null; wa_profile_name: string | null; phone_e164: string | null } | null;
}

/**
 * A caller who reached the receptionist and left with nothing.
 *
 * DELIBERATELY NOT "missed". This product already uses that word for exactly
 * one thing — `status === "not_connected"`, a dial that never connected — and
 * the Ask assistant, the day's snapshot and the conversations page all read it
 * that way. Today keeps those out of the attention region on purpose: an
 * attempt is not a call.
 *
 * This is the inbound one nobody had a word for. Somebody rang the business,
 * the receptionist began to speak, and they hung up a few seconds later. The
 * product filed it as `handled`, because technically it was, and Today either
 * dropped the row or labelled it "No summary from the voice provider" — our
 * machine's problem, not their departure. For a salon it is the most
 * commercially interesting event of the day, and the only lost one that leaves
 * a phone number behind.
 *
 * Fifteen seconds because the greeting carries a recording notice and the AI
 * disclosure and takes most of ten: a caller gone before that heard a machine
 * start talking and nothing else.
 *
 * The reason must be the CUSTOMER leaving. The receptionist ending a call, a
 * transfer to a person, and a call that ran out of time are all endings
 * somebody chose.
 */
export const ABANDONED_MS = 15_000;

export function abandonedCall(
  dto: Pick<CallDto, "direction" | "status" | "duration_ms" | "disconnection_reason" | "in_voicemail" | "outcome">,
): boolean {
  if (dto.direction !== "inbound") return false;
  // A dial that never connected is the other thing entirely, and a call that
  // reached voicemail already has its own row.
  if (dto.status === "not_connected" || reachedVoicemail(dto)) return false;
  const ms = dto.duration_ms;
  if (typeof ms !== "number" || ms <= 0 || ms >= ABANDONED_MS) return false;
  return dto.disconnection_reason === "user_hangup";
}

/**
 * Whether a call reached a voicemail, by any of the three signals its row can carry: the provider's analysis flag
 * (in_voicemail, missing when the analysis did not run), the ending the provider recorded (voicemail_reached), and the
 * outcome our own analysis gave. THE reading: the outcome ladder, an abandoned call, Today's rows and figures and a
 * person's history ask it, so a pill cannot say Handled beside "Reached voicemail".
 */
export function reachedVoicemail(dto: Pick<CallDto, "in_voicemail" | "disconnection_reason" | "outcome">): boolean {
  return dto.in_voicemail === true || dto.disconnection_reason === "voicemail_reached" || dto.outcome === "voicemail";
}

/**
 * Whether a call is a "missed call": a dial that never connected (`missed`, what the call view models carry for status
 * not_connected) and the customer's own. The one the receptionist placed and nobody answered is not missed by anyone
 * (callAttemptWords). Every caller says who dialled; a row whose direction was never recorded (null) is a customer's.
 */
export function missedCall(c: { missed: boolean; direction: "inbound" | "outbound" | null }): boolean {
  return c.missed && c.direction !== "outbound";
}

/**
 * A dial that never connected, by who dialled: a customer's is a missed call; one the receptionist placed and
 * nobody answered is not "missed" by anyone. The bell, the person page and the call row said "Missed call" for
 * both, and the bell named the BUSINESS's own number under it (the 2 Oct 2026 audit).
 */
export function callAttemptWords(direction: "inbound" | "outbound"): string {
  return missedCall({ missed: true, direction }) ? "Missed call" : "Call didn't connect";
}

/** Why the call ended, in words a salon owner uses. */
export const DISCONNECTION_LABELS: Record<string, string> = {
  user_hangup: "Customer hung up",
  agent_hangup: "Receptionist ended the call",
  call_transfer: "Transferred to a person",
  voicemail_reached: "Reached voicemail",
  dial_no_answer: "No answer",
  dial_busy: "Line was busy",
  dial_failed: "Call couldn't connect",
  inactivity: "Ended after silence",
  max_duration_reached: "Hit the call length limit",
  concurrency_limit_reached: "Line was busy — all agents in use",
  user_declined: "Customer declined the call",
  marked_as_spam: "Flagged as spam by the carrier",
  // The endings the Live page's own controls produce, and the provider's
  // newer names for a transfer.
  manual_stopped: "Ended from the dashboard",
  call_take_over: "A person took over the call",
  transfer_bridged: "Transferred to a person",
  transfer_cancelled: "Transfer did not go through",
};
