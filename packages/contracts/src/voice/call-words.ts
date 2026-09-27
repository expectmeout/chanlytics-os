/**
 * The words of a call's outcome: the choices the phone receptionist's
 * post-call analysis picks from, what each says on a surface, and the tidy
 * of a provider summary written before the analysis carried what the caller
 * wanted.
 */

/** How a call ended for the caller. The agent's analysis picks one; the CHECK on calls.outcome admits the same six. */
export const CALL_OUTCOMES = [
  "answered",
  "booking_link_sent",
  "callback_needed",
  "voicemail",
  "no_request",
  "other",
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

/** What a surface says for each outcome. */
export const CALL_OUTCOME_WORDS: Record<CallOutcome, string> = {
  answered: "Question answered",
  booking_link_sent: "Booking link sent",
  callback_needed: "Needs a call back",
  voicemail: "Reached voicemail",
  no_request: "No request made",
  other: "Handled",
};

export function callOutcomeOf(v: unknown): CallOutcome | null {
  return typeof v === "string" && (CALL_OUTCOMES as readonly string[]).includes(v) ? (v as CallOutcome) : null;
}

/** The outcome's words, or null when the call has none on record. */
export function callOutcomeWords(v: unknown): string | null {
  const o = callOutcomeOf(v);
  return o ? CALL_OUTCOME_WORDS[o] : null;
}

/**
 * A provider summary from before the analysis carried what the caller
 * wanted reads "The user called Marisa's Beauty Salon to inquire about…".
 * Nobody says that. The opening is folded to "Called to inquire about…"
 * without touching a word of the rest, so nothing is invented; a summary
 * that opens any other way is kept as it is.
 */
export function tidyCallSummary(text: string | null | undefined): string | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const folded = t.replace(
    /^The (?:user|caller|customer) (?:called|phoned|contacted|reached out to) [^.,;]*? (to|and) /i,
    (_m, joiner: string) => (joiner.toLowerCase() === "to" ? "Called to " : "Called and "),
  );
  return folded.charAt(0).toUpperCase() + folded.slice(1);
}
