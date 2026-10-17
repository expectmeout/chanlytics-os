export const SELLS_BY = ["booking", "proposal"];
export const SELLS_BY_QUESTION = "How customers buy";
export const SELLS_BY_WORDS = {
  booking: { label: "They book an appointment", sentence: "Bookings and reminders." },
  proposal: { label: "Some get a proposal first", sentence: "Adds proposals, a Pipeline and Deals in Reports." }
};
export function isSellsBy(s) {
  return typeof s === "string" && SELLS_BY.includes(s);
}
export const SELLS_BY_REFUSAL = "How customers buy: they book an appointment, or some get a proposal first.";
export function dealsAreOn(sellsBy) {
  return sellsBy === "proposal";
}
export function bookingLinkOptional(sellsBy) {
  return dealsAreOn(sellsBy);
}
export const BOOKING_LINK_NEEDED = "The receptionist needs a booking link to send anyone who wants to book.";
export const SELLS_BY_FIRST = "booking";
export const CONSULT_FIRST_DEAL_HINT = "A consultation for these is the first step of a deal.";
export function sellsByVM(answer) {
  const said = isSellsBy(answer) ? answer : null;
  const on = dealsAreOn(said);
  const verb = said ? "Change" : "Choose";
  return {
    question: SELLS_BY_QUESTION,
    value: said ? SELLS_BY_WORDS[said].label : null,
    empty: "Not said yet",
    act: said ? "Change" : "Choose one",
    name: `${verb} ${SELLS_BY_QUESTION.toLowerCase()}`,
    choices: SELLS_BY.map((a) => ({ value: a, label: SELLS_BY_WORDS[a].label, hint: SELLS_BY_WORDS[a].sentence })),
    refusal: SELLS_BY_REFUSAL,
    first: said ?? SELLS_BY_FIRST,
    dealsOn: on,
    consultHint: on ? CONSULT_FIRST_DEAL_HINT : null
  };
}
export function sellsBySaved(was, now) {
  if (dealsAreOn(now)) return "Saved \u2014 deals are on.";
  return dealsAreOn(was) ? "Saved \u2014 deals are off. Any already recorded are kept." : "Saved \u2014 customers book an appointment.";
}
