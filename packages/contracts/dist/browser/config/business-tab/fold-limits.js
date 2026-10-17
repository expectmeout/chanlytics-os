import { PROFILE_LIMITS } from "../workspace-config/config-rules.js";
import { count, pluralGrouped } from "./counts.js";
export const PROFILE_CROSSING_WORDS = {
  stops: "Saved like this, it stops being given your details and answers from its stored instructions.",
  starts: "Saved like this, it starts being given your details, with today's instructions kept beneath them."
};
export function profileRefusal(key, seen, of) {
  const L = PROFILE_LIMITS;
  const chars = (max) => `At most ${count(max)} characters${seen === void 0 ? "." : ` \u2014 this is ${count(seen)}.`}`;
  const lines = (max, one, many) => `At most ${pluralGrouped(max, one, many)}, one to a line${seen === void 0 ? "." : ` \u2014 this is ${count(seen)}.`}`;
  const words = {
    tone: () => chars(L.tone),
    services: () => `At most ${pluralGrouped(L.services, "service", "services")}.`,
    serviceName: () => chars(L.serviceName),
    serviceMinutes: () => `At most ${count(L.serviceMinutes)} minutes, a whole day.`,
    servicePrice: () => chars(L.servicePrice),
    languages: () => `At most ${pluralGrouped(L.languages, "language", "languages")}.`,
    language: () => `\u201C${of ?? ""}\u201D is not a language's name: ${L.languageMin} to ${L.languageMax} characters.`,
    reasons: () => lines(L.reasons, "reason", "reasons"),
    reason: () => `Each reason is at most ${count(L.reason)} characters.`,
    consultFirst: () => lines(L.consultFirst, "service", "services"),
    consultFirstLine: () => `Each service is at most ${count(L.consultFirstLine)} characters.`,
    ruleNotes: () => lines(L.ruleNotes, "note", "notes"),
    ruleNote: () => `Each note is at most ${count(L.ruleNote)} characters.`,
    notes: () => `At most ${pluralGrouped(L.notes, "note", "notes")}.`,
    noteTitle: () => `A note's title is at most ${count(L.noteTitle)} characters${seen === void 0 ? "." : ` \u2014 this is ${count(seen)}.`}`,
    noteText: () => `A note's text is at most ${count(L.noteText)} characters${seen === void 0 ? "." : ` \u2014 this is ${count(seen)}.`}`,
    closures: () => `At most ${pluralGrouped(L.closures, "closed day", "closed days")}. Dates that have passed can go.`,
    closureNote: () => chars(L.closureNote),
    shifts: () => `At most ${pluralGrouped(L.shifts, "shift", "shifts")} in a day \u2014 ${of ?? "that day"} has ${count(seen ?? 0)}.`,
    instructions: () => chars(L.instructions),
    message: () => chars(L.message)
  };
  const say = Object.prototype.hasOwnProperty.call(words, key) ? words[key] : null;
  if (!say) {
    throw new TypeError(
      `profileRefusal knows the tab's own caps (${Object.keys(words).join(", ")}), not ${JSON.stringify(key)}.`
    );
  }
  return say();
}
const WRITTEN_OUT_NUMBER = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
export function writtenOutDetail(text, bookingLink) {
  const said = typeof text === "string" ? text : "";
  const link = typeof bookingLink === "string" ? bookingLink.trim() : "";
  if (link && said.includes(link)) return "link";
  return WRITTEN_OUT_NUMBER.test(said) ? "number" : null;
}
