/**
 * What a save says under a fold: when it crosses between a record that composes and one that does not, when what
 * is typed is more than the save would take (config-rules.ts PROFILE_LIMITS, the table the schema is built from), and
 * when a message spells out a detail its name would keep current.
 */
import { PROFILE_LIMITS } from "../workspace-config/config-rules";
import { count, pluralGrouped } from "./counts";

/**
 * What a save says when it crosses the line the resolver draws between a record it composes from and one it answers
 * with the stored prompt (config.ts `hasProfile`).
 *
 * Emptying the last field the resolver composes from hands the receptionist its stored prompt instead: on a sparse
 * record the prompt fell from 2,128 characters to 240, with the hand-off token and every rule line gone. The first such
 * field does the reverse, and the prompt grows from 240 to 1,939. Either way far more changes than the field's own
 * line, so the row says so beside that line. It is not a refusal: the save still goes. Which way a save crosses is the
 * bridge's to decide (legacy-bridge/business-tab.ts, `profileCrossing`), from `hasProfile` over the stored brain's
 * profile and the next one's; these are the words.
 */
export const PROFILE_CROSSING_WORDS = {
  stops: "Saved like this, it stops being given your details and answers from its stored instructions.",
  starts: "Saved like this, it starts being given your details, with today's instructions kept beneath them.",
} as const;

export type ProfileCrossing = keyof typeof PROFILE_CROSSING_WORDS;

/* ------------------------------------ what a fold will not take ------------------------------------ */

/** What `profileRefusal` will say a sentence for: the caps a fold refuses AT, and the one range a language sits in. */
export type ProfileRefusalKey =
  | "tone"
  | "services"
  | "serviceName"
  | "serviceMinutes"
  | "servicePrice"
  | "languages"
  | "language"
  | "reasons"
  | "reason"
  | "consultFirst"
  | "consultFirstLine"
  | "ruleNotes"
  | "ruleNote"
  | "notes"
  | "noteTitle"
  | "noteText"
  | "closures"
  | "closureNote"
  | "shifts"
  | "instructions"
  | "message";

/**
 * What a fold says under the box when what is typed is more than the save would take.
 *
 * Each sentence names the same unit as the limit it is written from, and the limit is the schema's, so the two cannot
 * disagree: the page said "At most 2,000 characters" beside a check reading `t.length > 2000`, the one number written
 * twice in one line. `seen` is what was measured -- characters, rows, a day's shifts -- and is said back where the
 * sentence has a place for it; `of` names what it was measured on, a day for `shifts` and the word itself for
 * `language`. A key that is not one of these is a TypeError, since the page is untyped.
 */
export function profileRefusal(key: ProfileRefusalKey, seen?: number, of?: string): string {
  const L = PROFILE_LIMITS;
  const chars = (max: number): string =>
    `At most ${count(max)} characters${seen === undefined ? "." : ` — this is ${count(seen)}.`}`;
  const lines = (max: number, one: string, many: string): string =>
    `At most ${pluralGrouped(max, one, many)}, one to a line${seen === undefined ? "." : ` — this is ${count(seen)}.`}`;
  const words: Record<ProfileRefusalKey, () => string> = {
    tone: () => chars(L.tone),
    services: () => `At most ${pluralGrouped(L.services, "service", "services")}.`,
    serviceName: () => chars(L.serviceName),
    serviceMinutes: () => `At most ${count(L.serviceMinutes)} minutes, a whole day.`,
    servicePrice: () => chars(L.servicePrice),
    languages: () => `At most ${pluralGrouped(L.languages, "language", "languages")}.`,
    language: () => `“${of ?? ""}” is not a language's name: ${L.languageMin} to ${L.languageMax} characters.`,
    reasons: () => lines(L.reasons, "reason", "reasons"),
    reason: () => `Each reason is at most ${count(L.reason)} characters.`,
    consultFirst: () => lines(L.consultFirst, "service", "services"),
    consultFirstLine: () => `Each service is at most ${count(L.consultFirstLine)} characters.`,
    ruleNotes: () => lines(L.ruleNotes, "note", "notes"),
    ruleNote: () => `Each note is at most ${count(L.ruleNote)} characters.`,
    notes: () => `At most ${pluralGrouped(L.notes, "note", "notes")}.`,
    noteTitle: () =>
      `A note's title is at most ${count(L.noteTitle)} characters${seen === undefined ? "." : ` — this is ${count(seen)}.`}`,
    noteText: () =>
      `A note's text is at most ${count(L.noteText)} characters${seen === undefined ? "." : ` — this is ${count(seen)}.`}`,
    closures: () => `At most ${pluralGrouped(L.closures, "closed day", "closed days")}. Dates that have passed can go.`,
    closureNote: () => chars(L.closureNote),
    shifts: () =>
      `At most ${pluralGrouped(L.shifts, "shift", "shifts")} in a day — ${of ?? "that day"} has ${count(seen ?? 0)}.`,
    instructions: () => chars(L.instructions),
    message: () => chars(L.message),
  };
  const say = Object.prototype.hasOwnProperty.call(words, key) ? words[key] : null;
  if (!say) {
    throw new TypeError(
      `profileRefusal knows the tab's own caps (${Object.keys(words).join(", ")}), not ${JSON.stringify(key)}.`,
    );
  }
  return say();
}

/**
 * A detail written OUT in one of the three messages, where the name for it would keep it current.
 *
 * `{business}`, `{booking link}` and `{phone}` are filled in as each message goes out, so a message that spells the
 * link or the number instead says what was true when it was typed and nothing after: a workspace that changed its
 * booking link went on sending the old one, in its own name. The link is known exactly (the brain holds it); a number
 * is recognised by its shape, since the one a customer would ring need not be the one on file.
 *
 * Answers "link", "number" or null, most-certain first: a message holding both is told about the link, which is the
 * one the page can name exactly.
 */
const WRITTEN_OUT_NUMBER = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
export function writtenOutDetail(
  text: string | null | undefined,
  bookingLink: string | null | undefined,
): "link" | "number" | null {
  const said = typeof text === "string" ? text : "";
  const link = typeof bookingLink === "string" ? bookingLink.trim() : "";
  if (link && said.includes(link)) return "link";
  return WRITTEN_OUT_NUMBER.test(said) ? "number" : null;
}
