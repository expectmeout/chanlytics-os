export const CALL_OUTCOMES = [
  "answered",
  "booking_link_sent",
  "callback_needed",
  "voicemail",
  "no_request",
  "other"
];
export const CALL_OUTCOME_WORDS = {
  answered: "Question answered",
  booking_link_sent: "Booking link sent",
  callback_needed: "Needs a call back",
  voicemail: "Reached voicemail",
  no_request: "No request made",
  other: "Handled"
};
export function callOutcomeOf(v) {
  return typeof v === "string" && CALL_OUTCOMES.includes(v) ? v : null;
}
export function callOutcomeWords(v) {
  const o = callOutcomeOf(v);
  return o ? CALL_OUTCOME_WORDS[o] : null;
}
export function callTodoWords(followUp) {
  const said = followUp?.trim();
  return said ? `To do: ${said}` : null;
}
export function callNotesOf(a) {
  const name = a.caller_name?.trim();
  const email = a.caller_email?.trim();
  return {
    todo: callTodoWords(a.follow_up),
    gave: [name ? `Gave their name as ${name}` : "", email ? `Gave their email as ${email}` : ""].filter(Boolean)
  };
}
export function callNoteLines(n) {
  return n.todo ? [n.todo, ...n.gave] : n.gave;
}
export function tidyCallSummary(text) {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const folded = t.replace(
    /^The (?:user|caller|customer) (?:called|phoned|contacted|reached out to) [^.,;]*? (to|and) /i,
    (_m, joiner) => joiner.toLowerCase() === "to" ? "Called to " : "Called and "
  );
  return folded.charAt(0).toUpperCase() + folded.slice(1);
}
