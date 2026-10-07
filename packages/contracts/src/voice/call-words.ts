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
 * What a call's analysis left for the owner beyond what the caller wanted: the to-do the receptionist noted ("To do: Call
 * back to confirm the bridal trial") and what the caller gave about themselves ("Gave their name as ...", "Gave their
 * email as ..."), in the words every surface says them in. Each is only what the call's own row holds: a call with no
 * follow-up has no to-do, a name or an address nobody spelled is not guessed, and none of it is written to the person --
 * a suggestion for their page, never applied by itself.
 */
export interface CallNotes {
  todo: string | null;
  gave: string[];
}

/** The to-do the receptionist noted on a call, as a line: null when it noted none. */
export function callTodoWords(followUp: string | null | undefined): string | null {
  const said = followUp?.trim();
  return said ? `To do: ${said}` : null;
}

/** What the call's analysis left, from the call's own row (the call DTO has these three). */
export function callNotesOf(a: {
  follow_up?: string | null;
  caller_name?: string | null;
  caller_email?: string | null;
}): CallNotes {
  const name = a.caller_name?.trim();
  const email = a.caller_email?.trim();
  return {
    todo: callTodoWords(a.follow_up),
    gave: [name ? `Gave their name as ${name}` : "", email ? `Gave their email as ${email}` : ""].filter(Boolean),
  };
}

/** The lines a surface draws for them, the to-do first: what a card or a history row says under the call. */
export function callNoteLines(n: CallNotes): string[] {
  return n.todo ? [n.todo, ...n.gave] : n.gave;
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
