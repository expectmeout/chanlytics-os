export const ABANDONED_MS = 15e3;
export function abandonedCall(dto) {
  if (dto.direction !== "inbound") return false;
  if (neverConnected(dto) || reachedVoicemail(dto)) return false;
  if (dto.disconnection_reason !== "user_hangup") return false;
  if (Array.isArray(dto.transcript_object) && dto.transcript_object.length) {
    return !dto.transcript_object.some((t) => t?.role === "user" && (t.content ?? "").trim() !== "");
  }
  if (dto.turns && typeof dto.caller_spoke === "boolean") return !dto.caller_spoke;
  const ms = dto.duration_ms;
  return typeof ms === "number" && ms > 0 && ms < ABANDONED_MS;
}
export function neverConnected(dto) {
  return dto.status === "not_connected";
}
export function recordingStateOf(dto) {
  const at = dto.recording?.fetch_state;
  if (at === "stored") return "ready";
  if (at === "failed" || at === "purged") return at;
  return dto.recording ? "pending" : "none";
}
export function endedHowOf(dto) {
  const why = dto.disconnection_reason;
  return why ? DISCONNECTION_LABELS[why] ?? why.replace(/_/g, " ") : null;
}
export function reachedVoicemail(dto) {
  return dto.in_voicemail === true || dto.disconnection_reason === "voicemail_reached" || dto.outcome === "voicemail";
}
export function missedCall(c) {
  return c.missed && c.direction !== "outbound";
}
export function callAttemptWords(direction) {
  return missedCall({ missed: true, direction }) ? "Missed call" : "Call didn't connect";
}
export const CALL_OUTCOME_WORDS = {
  live: "Live",
  missed: "Never connected",
  failed: "Call failed",
  handled: "Handled",
  abandoned: "Hung up early",
  callback: "Asked for a call back",
  voicemail: "Reached voicemail"
};
export const DISCONNECTION_LABELS = {
  user_hangup: "Customer hung up",
  agent_hangup: "Receptionist ended the call",
  call_transfer: "Transferred to a person",
  voicemail_reached: "Reached voicemail",
  dial_no_answer: "No answer",
  dial_busy: "Line was busy",
  dial_failed: "Call couldn't connect",
  inactivity: "Ended after silence",
  max_duration_reached: "Hit the call length limit",
  concurrency_limit_reached: "Line was busy \u2014 all agents in use",
  user_declined: "Customer declined the call",
  marked_as_spam: "Flagged as spam by the carrier",
  // The endings the Live page's own controls produce, and the provider's
  // newer names for a transfer.
  manual_stopped: "Ended from the dashboard",
  call_take_over: "A person took over the call",
  transfer_bridged: "Transferred to a person",
  transfer_cancelled: "Transfer did not go through"
};
