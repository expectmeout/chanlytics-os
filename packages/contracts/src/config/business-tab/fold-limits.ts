/**
 * What a save says under a fold: when it crosses between a record that composes and one that does not, when what
 * is typed is more than the save would take (PROFILE_LIMITS, read off the schema), and when a message spells out
 * a detail its name would keep current.
 */
import { BrainConfigSchema } from "../workspace-config/brain-config";
import {
  BookingRulesSchema,
  BusinessProfileSchema,
  ClosureSchema,
  INSTRUCTIONS_MAX,
} from "../workspace-config/business-profile";
import { MAX_CLOSURES, MAX_INTERVALS_PER_DAY } from "../workspace-config/config-schema";
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
  stops:
    "Saved like this, the receptionist stops being given the details on this page and answers from its stored instructions.",
  starts:
    "Saved like this, the receptionist starts being given the details on this page, and the instructions it follows today are carried in beneath them.",
} as const;

export type ProfileCrossing = keyof typeof PROFILE_CROSSING_WORDS;

/* ------------------------------------ what a fold will not take ------------------------------------ */

/**
 * The most of each thing a fold of the tab may hold, read off the schema that would refuse the save.
 *
 * Every one of these was a literal in the page (`BT_LIMITS`, pages/business-tab-folds.jsx) beside a sentence carrying
 * the same number a second time, so a cap widened in the schema left the page offering less than the save would take
 * and the sentence naming a number neither of them used. Read here, the schema is the one place a number lives, and
 * `profileRefusal` below writes the sentence from this table -- the way `bookingRuleRefusal` writes the five booking
 * rules' from `BookingRulesSchema`'s own bounds.
 *
 * `closures` and `shifts` are the two the save's own checks already published (`MAX_CLOSURES`,
 * `MAX_INTERVALS_PER_DAY`); they are here so a fold asks one table rather than two.
 *
 * Built inside a call marked pure, as GUARDRAIL_KEYS is: a top-level call is a side effect to the bundler, which
 * would keep this in the four dists that bundle contracts and never use it.
 */
export const PROFILE_LIMITS: Readonly<Record<ProfileLimitKey, number>> = /* @__PURE__ */ (() => {
  // A cap, however the schema states it: a string's own `maxLength`, or an array's `max_length` check.
  const cap = (schema: unknown): number => {
    const s = schema as {
      maxLength?: number | null;
      def?: { checks?: { _zod?: { def?: { check?: string; maximum?: number } } }[] };
    };
    if (typeof s.maxLength === "number") return s.maxLength;
    for (const c of s.def?.checks ?? []) {
      const d = c?._zod?.def;
      if (d?.check === "max_length" && typeof d.maximum === "number") return d.maximum;
    }
    throw new TypeError(
      "PROFILE_LIMITS: the schema states no maximum, so the page would offer a size the save refuses.",
    );
  };
  const floor = (schema: unknown): number => {
    const s = schema as { minLength?: number | null };
    if (typeof s.minLength !== "number") throw new TypeError("PROFILE_LIMITS: the schema states no minimum.");
    return s.minLength;
  };
  const opt = <T>(schema: { unwrap(): T }): T => schema.unwrap();
  const p = BusinessProfileSchema.shape;
  const service = opt(p.services).element.shape;
  const note = opt(p.notes).element.shape;
  const rules = BookingRulesSchema.shape;
  const minutes = opt(service.duration_min) as unknown as { maxValue: number | null };
  if (minutes.maxValue == null) throw new TypeError("PROFILE_LIMITS: a service's minutes state no maximum.");
  return {
    tone: cap(opt(p.tone)),
    services: cap(opt(p.services)),
    serviceName: cap(service.name),
    serviceMinutes: minutes.maxValue,
    servicePrice: cap(opt(service.price_note)),
    languages: cap(opt(p.languages)),
    languageMin: floor(opt(p.languages).element),
    languageMax: cap(opt(p.languages).element),
    reasons: cap(opt(p.escalate_when)),
    reason: cap(opt(p.escalate_when).element),
    consultFirst: cap(opt(rules.consult_first)),
    consultFirstLine: cap(opt(rules.consult_first).element),
    ruleNotes: cap(opt(rules.notes)),
    ruleNote: cap(opt(rules.notes).element),
    notes: cap(opt(p.notes)),
    noteTitle: cap(note.title),
    noteText: cap(note.text),
    closureNote: cap(opt(ClosureSchema.shape.note)),
    closures: MAX_CLOSURES,
    shifts: MAX_INTERVALS_PER_DAY,
    instructions: INSTRUCTIONS_MAX,
    message: cap(BrainConfigSchema.shape.fallbacks.shape.greeting),
  };
})();

/** Everything `PROFILE_LIMITS` holds a number for; `profileRefusal` says what each one refuses in. */
export type ProfileLimitKey =
  | "tone"
  | "services"
  | "serviceName"
  | "serviceMinutes"
  | "servicePrice"
  | "languages"
  | "languageMin"
  | "languageMax"
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
