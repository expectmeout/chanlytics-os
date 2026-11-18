/**
 * The questions a lead's own preview offers first, written for its business (decision 0079, amended 18 November 2026):
 * what the model is asked as the preview is built (the registry's preview_starters route), the shape it answers in, and
 * the one reader of that answer and of the list the preview's workspace keeps (config `preview.starters`).
 *
 *   previewStartersAskOf      what the model is told: the business's kind, and what its receptionist was given to know
 *   previewStartersWrittenOf  the questions as written, read for what each is: short, a customer's, and never a price
 *                             it would refuse or a time to come in (many businesses go to the customer)
 *
 * The page offers these where some were written, and the ones it makes from the record where none were
 * (lead-preview.ts previewPageOf). Nothing here is told to the receptionist: a question is something a customer says.
 */
import { DATA_NOT_INSTRUCTIONS, fenced } from "../ai/fence";
import { calendarHoursLines } from "../calendar/words/labels";
import type { BusinessProfile } from "../config/workspace-config/business-profile";

/** The questions a page offers of the ones written. */
export const PREVIEW_STARTERS_MOST = 3;

/** A question's length, in characters: a customer's first message, never a paragraph. */
const QUESTION_LEAST = 8;
const QUESTION_MOST = 90;

/** What the model is told of the record, at most: its services by name, and the things it was told that fit no field. */
const SERVICES_TOLD = 12;
const NOTES_TOLD = 8;
const NOTE_TOLD_MAX = 240;

/** What the model is asked for: three first messages, in a customer's words, that this business's receptionist can take. */
export const PREVIEW_STARTERS_SYSTEM = [
  "You write the first messages customers send a small business, for a page where its owner tries their own automated assistant by pressing one.",
  "What the assistant knows of the business comes in a <record> block.",
  DATA_NOT_INSTRUCTIONS,
  "Write three messages a real customer of this business would send, each about a different thing, each the way that customer types it on a phone: one short plain sentence about a real situation someone brings to this kind of business.",
  "At least two are answered by the record. One may be something urgent or personal that the assistant would pass on to the business.",
  "Never ask what something costs, in any words: the assistant gives no price, fee, quote or estimate.",
  "Never ask for a day or a time to come in or be seen, and never try to book one: the assistant sees no calendar.",
  "Never name the business, and never ask about a service, a place or a rule the record does not hold.",
  "Write in the language the business's own words in the record are in, and in English where that is unclear.",
].join("\n");

/** The JSON schema the questions are answered in (Anthropic's structured output), the shape previewStartersWrittenOf reads. */
export const PREVIEW_STARTERS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: { questions: { type: "array", items: { type: "string" } } },
} as const;

/** What the questions are written from: the lead's listing, and the record its receptionist was just given. */
export interface PreviewStartersKnown {
  business: string;
  /** The listing's own word for what the business is ("Barber shop"), or none. */
  kind: string | null;
  /** A business the finder found by its area, with no street: it goes to its customers. */
  goesToCustomers: boolean;
  profile: Pick<BusinessProfile, "hours" | "address" | "services" | "notes" | "booking_rules"> | null | undefined;
}

const oneLine = (text: string, max: number): string => text.replace(/\s+/g, " ").trim().slice(0, max);

/** What the model is told: each thing the receptionist knows on a line of its own, someone else's words in their fence. */
export function previewStartersAskOf(known: PreviewStartersKnown): string {
  const profile = known.profile;
  const hours = calendarHoursLines(profile?.hours ?? null);
  const services = (profile?.services ?? []).map((service) => service.name.trim()).filter(Boolean);
  const notes = (profile?.notes ?? []).slice(0, NOTES_TOLD);
  const rules = profile?.booking_rules?.notes ?? [];
  const lines = [
    `Name: ${oneLine(known.business, 120)}`,
    known.kind?.trim() ? `Kind of business: ${oneLine(known.kind, 80)}` : null,
    known.goesToCustomers
      ? "Where: it has no street address customers come to. It goes to its customers."
      : profile?.address?.trim()
        ? `Where: ${oneLine(profile.address, 200)}`
        : null,
    hours.length ? `Hours: ${hours.join("; ")}` : "Hours: not known.",
    services.length
      ? `Services: ${services.slice(0, SERVICES_TOLD).join(", ")}${services.length > SERVICES_TOLD ? ", and more" : ""}`
      : "Services: not known.",
    ...rules.map((rule) => `Rule: ${oneLine(rule, NOTE_TOLD_MAX)}`),
    ...notes.map((note) => `It was told · ${oneLine(note.title, 80)}: ${oneLine(note.text, NOTE_TOLD_MAX)}`),
  ];
  return fenced("record", lines.filter((line): line is string => !!line).join("\n"));
}

/**
 * A question about what something costs, in the words that are a price's alone: the preview's receptionist quotes none.
 * "Charge" and "rate" count only where they are money's ("do you charge", "your rates"), since a thing that will not
 * charge and a thing someone rates are ordinary questions of other trades.
 */
const ASKS_A_PRICE =
  /\b(?:how much|pric(?:e[sd]?|ing)|cost(?:s|ing)?|fees?|quotes?|estimates?|cheap\w*|discounts?|coupons?)\b|\b(?:you|they) charge\b|\bcharge (?:for|per|extra)\b|\b(?:your|hourly|daily|flat) rates?\b|[$€£]/i;

/** A question that asks when the customer may come in: many businesses go to the customer, and it sees no calendar. */
const ASKS_A_VISIT_TIME =
  /\bcome in\b|\b(?:come|stop|drop|swing) by\b|\bwhat time (?:can|could|should|may) i\b|\bwhen (?:can|could|should|may) i (?:come|stop|drop|bring|get in|be seen)\b/i;

/** A link or an address: a question holds neither. */
const HOLDS_A_LINK = /https?:|www\.|\S@\S/i;

/** One question as it is offered, or null: a short line of a customer's, within the rule. */
function questionOf(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["“'‘]+|["”'’]+$/g, "")
    .trim();
  if (text.length < QUESTION_LEAST || text.length > QUESTION_MOST) return null;
  if (HOLDS_A_LINK.test(text) || ASKS_A_PRICE.test(text) || ASKS_A_VISIT_TIME.test(text)) return null;
  return text;
}

/**
 * The questions written for a business, read for what each is: the model's list, or the one its workspace keeps (the
 * same reading, so a list stored by an older or a newer build is held to today's rule). Each once, the first
 * PREVIEW_STARTERS_MOST; none for anything that is not a list.
 */
export function previewStartersWrittenOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const kept: string[] = [];
  for (const item of raw) {
    const question = questionOf(item);
    if (question && !kept.some((held) => held.toLowerCase() === question.toLowerCase())) kept.push(question);
    if (kept.length === PREVIEW_STARTERS_MOST) break;
  }
  return kept;
}
