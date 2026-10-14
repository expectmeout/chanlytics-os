/**
 * Say it (the sheets as verbs, 14 Oct 2026, step 5): a line at the top of the deal sheet and the note sheet where a
 * member says what happened in their own words ("won the website, 1,200 a month, send the contract Friday"), and Ask
 * fills the sheet's fields from it. Nothing is saved: the sheet is filled, the member reads it, and Save is theirs, through
 * the verb the sheet always commits. POST people/[id]/say asks the model for one verb's fields, in the shape below, and
 * keeps of the answer only what each field's own rule takes (the door's limits, a real day, a web address).
 *
 * What the model fills follows the house's convention (new-conversation/person-draft.ts): every property required, ""
 * for what was not said, no nullable. What a sheet takes of an answer is said here too (`dealFill`, `noteFill`), so the
 * sheet only merges it. No zod here, so a sheet reads these (decision 0024); what the route parses is say-it-schema.ts.
 */
import { isRealDate } from "../../config/workspace-config/config-rules";
import { DEAL_LOST_REASONS, DEAL_PERS, type DealLostReason, type DealPer } from "../../deals/deal-words";
import { NOTE_MAX } from "../../notes/person-notes";
import { NO_DAY, type StepDraft, type StepSheetVM } from "../../notes/step-sheet";
import type { DealSheetDraft, DealSheetVM } from "../../deals/sheet/deal-sheet";
import { foldName } from "../../calendar/service-offer";

/** The sheets a line may fill. */
export const SAY_IT_VERBS = ["deal", "note"] as const;
export type SayItVerb = (typeof SAY_IT_VERBS)[number];

/** How long a line may be: a few sentences, never a transcript. */
export const SAY_IT_MAX = 600;

/** A deal's fields as the model fills them: "" where the words did not say it. */
export const SAY_IT_DEAL_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["service", "value", "per", "link", "valid_until", "lost_reason", "note"],
  properties: {
    service: { type: "string" },
    /** The amount as digits, no currency or separators ("1200", "89.50"). */
    value: { type: "string" },
    per: { type: "string", enum: ["", ...DEAL_PERS] },
    link: { type: "string" },
    /** A day, as 2026-09-30. */
    valid_until: { type: "string" },
    lost_reason: { type: "string", enum: ["", ...DEAL_LOST_REASONS] },
    note: { type: "string" },
  },
} as const;

/** A note's fields as the model fills them: its words, a day where it is a step, and whether the receptionist reads it. */
export const SAY_IT_NOTE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["body", "day", "team_only"],
  properties: {
    body: { type: "string" },
    /** A day, as 2026-09-30, where they said when; "" for a note with none. */
    day: { type: "string" },
    team_only: { type: "boolean" },
  },
} as const;

/** The model's answer for a deal, as the route reads it (say-it-schema.ts). */
export interface SayItDealAnswer {
  service: string;
  value: string;
  per: string;
  link: string;
  valid_until: string;
  lost_reason: string;
  note: string;
}
/** The model's answer for a note, as the route reads it. */
export interface SayItNoteAnswer {
  body: string;
  day: string;
  team_only: boolean;
}

/** What a deal sheet is filled with: only what was said, each field as the sheet holds it. */
export interface SayItDealFill {
  service: string;
  value: string;
  per: DealPer | "";
  link: string;
  validUntil: string;
  reason: DealLostReason | "";
  note: string;
}

/** What a note sheet is filled with: its words, its day ("" for none) and who reads it. */
export interface SayItNoteFill {
  what: string;
  day: string;
  teamOnly: boolean;
}

/** What POST people/[id]/say answers: one sheet's fill. */
export type SayItDto = { verb: "deal"; deal: SayItDealFill } | { verb: "note"; note: SayItNoteFill };

/** The line's words. */
export const SAY_IT_WORDS = {
  label: "Say it",
  placeholder: {
    deal: "Website, 1,200 a month, valid to the 30th",
    note: "Prefers mornings; call them back Friday",
  },
  go: "Fill it in",
  busy: "Reading…",
  filled: "Filled in from what you said. Check it, then save.",
  empty: "Nothing in that fits these fields. Try saying it another way.",
  failed: "Could not read that just now.",
} as const;

const DEAL_PER_SET: readonly string[] = DEAL_PERS;
const DEAL_REASON_SET: readonly string[] = DEAL_LOST_REASONS;

/** An amount as the sheet's box holds one: digits and one point, or "" where none was said. */
function amountOf(raw: string): string {
  const digits = raw.replace(/[^0-9.]/g, "");
  return /^\d{1,9}(\.\d{1,2})?$/.test(digits) ? digits : "";
}

/**
 * What a deal sheet keeps of an answer, field by field by its own rule: a service and a note within the door's
 * limits, an amount that reads as one, a per and a reason of their sets, a real day, and a link as given (the sheet's
 * Save judges it with the one normalizer, as it judges a typed one).
 */
export function dealFill(a: SayItDealAnswer): SayItDealFill {
  const day = a.valid_until.trim();
  return {
    service: a.service.trim().slice(0, 80),
    value: amountOf(a.value),
    per: DEAL_PER_SET.includes(a.per) ? (a.per as DealPer) : "",
    link: a.link.trim().slice(0, 600),
    validUntil: isRealDate(day) ? day : "",
    reason: DEAL_REASON_SET.includes(a.lost_reason) ? (a.lost_reason as DealLostReason) : "",
    note: a.note.trim().slice(0, 200),
  };
}

/** What a note sheet keeps of an answer: its words within a note's limit, a real day or none, who reads it. */
export function noteFill(a: SayItNoteAnswer): SayItNoteFill {
  const day = a.day.trim();
  return { what: a.body.trim().slice(0, NOTE_MAX), day: isRealDate(day) ? day : "", teamOnly: a.team_only };
}

/** Whether an answer filled anything at all: a fill of nothing is said, never drawn as a sheet emptied. */
export function sayItFilled(dto: SayItDto): boolean {
  if (dto.verb === "note") return !!dto.note.what;
  const d = dto.deal;
  return !!(d.service || d.value || d.per || d.link || d.validUntil || d.reason || d.note);
}

/**
 * What a deal sheet takes of a fill: each field the sheet draws, where something was said for it. A service is one of
 * the sheet's own (its select's), matched by name, case and accents aside; one it does not offer is left as it is.
 */
export function dealSheetFill(
  sheet: Pick<DealSheetVM, "service" | "link" | "value" | "validUntil" | "reason" | "note">,
  fill: SayItDealFill,
): Partial<DealSheetDraft> {
  const patch: Partial<DealSheetDraft> = {};
  const service = sheet.service?.options.find((o) => foldName(o.label) === foldName(fill.service));
  if (fill.service && service) patch.service = service.value;
  if (fill.link && sheet.link) patch.link = fill.link;
  if (fill.value && sheet.value) patch.value = fill.value;
  if (fill.per && sheet.value) patch.per = fill.per;
  if (fill.validUntil && sheet.validUntil) patch.validUntil = fill.validUntil;
  if (fill.reason && sheet.reason) patch.reason = fill.reason;
  if (fill.note && sheet.note) patch.note = fill.note;
  return patch;
}

/**
 * What the note sheet takes of a fill: its words, who reads it, and its day -- one of the sheet's choices where it is
 * one, the date field where it is not, and "No day" for a note where none was said (a step keeps the day it has).
 */
export function noteSheetFill(sheet: Pick<StepSheetVM, "kind" | "days">, fill: SayItNoteFill): Partial<StepDraft> {
  const day = fill.day
    ? { day: fill.day, picking: !sheet.days.some((c) => c.key === fill.day) }
    : sheet.kind === "note"
      ? { day: NO_DAY, picking: false }
      : {};
  return { what: fill.what, teamOnly: fill.teamOnly, ...day };
}
