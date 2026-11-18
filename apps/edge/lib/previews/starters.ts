/**
 * The questions a lead's own preview offers first, written for its business as the preview is built (decision 0079,
 * amended 18 November 2026): one short read by the smallest model (the registry's preview_starters route), told the
 * listing's kind and what the receptionist was just given to know (startersAskOf), its answer read in code (contracts
 * previewStartersWrittenOf: a customer's short line, never a price, never a time to come in). The build keeps them
 * beside the receptionist, in the preview's own workspace.
 *
 * A call of the preview's own, and not a part of the website's read: that read is every customer's first run too, a
 * lead with no site (or one that could not be read) has a kind and a listing to write from, and the questions are held
 * to what the receptionist knows, which is settled only once the site's facts are worn.
 *
 * Platform-spent, as the website's read is, on the preview's own workspace. Never the build's failure: no model, too
 * little time left, a refusal or an answer that cannot be read all write none, and the page then offers the questions it
 * makes from the record, as every preview did before.
 */
import {
  ANSWER_JSON_ONLY,
  DATA_NOT_INSTRUCTIONS,
  SECOND_MS,
  calendarHoursLines,
  fenced,
  modelRoute,
  previewStartersWrittenOf,
  valueAt,
  type BusinessProfile,
  type TenantId,
} from "@chanlytics/contracts";
import { askJson, promptHashOf } from "../ai/model.js";
import { errField, logger } from "../shared/log.js";

/** The most the writing may take of the build's time, its fallback's try included. */
const STARTERS_CALL_MS = 12 * SECOND_MS;
/** The least worth starting it with: under this, the build is nearly out of time and the receptionist's write comes first. */
const STARTERS_LEAST_MS = 3 * SECOND_MS;

/** What the model is told of the record, at most: its services by name, and the things it was told that fit no field. */
const SERVICES_TOLD = 12;
const NOTES_TOLD = 8;
const NOTE_TOLD_MAX = 240;

/** What the model is asked for: three first messages, in a customer's words, that this business's receptionist can take. */
const STARTERS_SYSTEM = [
  "You write the first messages customers send a small business, for a page where its owner tries their own automated assistant by pressing one.",
  "What the assistant knows of the business comes in a <record> block.",
  DATA_NOT_INSTRUCTIONS,
  "Write three messages a real customer of this business would send, each about a different thing, each the way that customer types it on a phone: one plain sentence of ten words at most, about a real situation someone brings to this kind of business.",
  "At least two are answered by the record. One may be something urgent or personal that the assistant would pass on to the business.",
  "Never ask what something costs, in any words: the assistant gives no price, fee, quote or estimate.",
  "Never ask for a day or a time to come in or be seen, and never try to book one: the assistant sees no calendar.",
  "Never name the business, and never ask about a service, a place or a rule the record does not hold.",
  "Write in the language the business's own words in the record are in, and in English where that is unclear.",
].join("\n");

/** The JSON schema the questions are answered in (Anthropic's structured output): a list, read by previewStartersWrittenOf. */
const STARTERS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: { questions: { type: "array", items: { type: "string" } } },
} as const;

/** What the questions are written from: the lead's listing, and the record its receptionist was just given. */
export interface StartersKnown {
  business: string;
  /** The listing's own word for what the business is ("Barber shop"), or none. */
  kind: string | null;
  /** A business the finder found by its area, with no street: it goes to its customers. */
  goesToCustomers: boolean;
  profile: Pick<BusinessProfile, "hours" | "address" | "services" | "notes" | "booking_rules"> | null | undefined;
}

/** A value of the record on one line, at most `max` characters of it. */
const toldLine = (text: string, max: number): string => text.replace(/\s+/g, " ").trim().slice(0, max);

/** Where the business is, as the model is told it: that it goes to its customers, else its address, else no line. */
function whereLine(known: StartersKnown): string | null {
  if (known.goesToCustomers) return "Where: it has no street address customers come to. It goes to its customers.";
  const address = known.profile?.address?.trim();
  return address ? `Where: ${toldLine(address, 200)}` : null;
}

/** What the model is told: each thing the receptionist knows on a line of its own, someone else's words in their fence. */
function startersAskOf(known: StartersKnown): string {
  const profile = known.profile;
  const hours = calendarHoursLines(profile?.hours ?? null);
  const services = (profile?.services ?? []).map((service) => service.name.trim()).filter(Boolean);
  const more = services.length > SERVICES_TOLD ? ", and more" : "";
  const lines = [
    `Name: ${toldLine(known.business, 120)}`,
    known.kind?.trim() ? `Kind of business: ${toldLine(known.kind, 80)}` : null,
    whereLine(known),
    hours.length ? `Hours: ${hours.join("; ")}` : "Hours: not known.",
    services.length ? `Services: ${services.slice(0, SERVICES_TOLD).join(", ")}${more}` : "Services: not known.",
    ...(profile?.booking_rules?.notes ?? []).map((rule) => `Rule: ${toldLine(rule, NOTE_TOLD_MAX)}`),
    ...(profile?.notes ?? [])
      .slice(0, NOTES_TOLD)
      .map((note) => `It was told · ${toldLine(note.title, 80)}: ${toldLine(note.text, NOTE_TOLD_MAX)}`),
  ];
  return fenced("record", lines.filter((line): line is string => !!line).join("\n"));
}

/** The questions' writer, as the build is handed it: the real one, or a test's. */
export type StartersWriter = (
  known: StartersKnown,
  build: { tenantId: TenantId; previewId: string; deadline: number },
) => Promise<string[]>;

/** The questions written for one business: at most three, or none where they could not be written. Never throws. */
export const writePreviewStarters: StartersWriter = async (known, { tenantId, previewId, deadline }) => {
  const ms = Math.min(STARTERS_CALL_MS, deadline - Date.now());
  if (ms < STARTERS_LEAST_MS) return [];
  try {
    const answered = await askJson({
      purpose: "preview_starters",
      system: STARTERS_SYSTEM,
      user: startersAskOf(known),
      schema: STARTERS_SCHEMA,
      maxTokens: modelRoute("preview_starters").maxTokens,
      plainJsonHint: ANSWER_JSON_ONLY,
      deadlineMs: ms,
      signal: AbortSignal.timeout(ms),
      for: { tenantId, subjectId: previewId, promptHash: promptHashOf(STARTERS_SYSTEM) },
    });
    return previewStartersWrittenOf(valueAt(answered?.answer, "questions"));
  } catch (e) {
    logger({ tenant_id: tenantId }).warn("preview_build_failed", {
      preview_id: previewId,
      step: "starters",
      error: errField(e),
    });
    return [];
  }
};
