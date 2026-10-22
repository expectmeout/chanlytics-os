import { isRealDate } from "../../config/workspace-config/config-rules.js";
import { DEAL_LOST_REASONS, DEAL_PERS } from "../../deals/deal-words.js";
import { NOTE_MAX } from "../../notes/person-notes.js";
import { NO_DAY } from "../../notes/step-sheet.js";
import { foldName } from "../../calendar/service-offer.js";
export const SAY_IT_VERBS = ["deal", "note"];
export const SAY_IT_MAX = 600;
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
    note: { type: "string" }
  }
};
export const SAY_IT_NOTE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["body", "day", "team_only"],
  properties: {
    body: { type: "string" },
    /** A day, as 2026-09-30, where they said when; "" for a note with none. */
    day: { type: "string" },
    team_only: { type: "boolean" }
  }
};
export const SAY_IT_WORDS = {
  label: "Say it",
  placeholder: {
    deal: "Website, 1,200 a month, valid to the 30th",
    note: "Prefers mornings; call them back Friday"
  },
  // The press inside the box's end (21 Oct 2026): one word fits beside what was typed.
  go: "Fill",
  busy: "Reading\u2026",
  filled: "Filled in from what you said. Check it, then save.",
  empty: "Nothing in that fits these fields. Try saying it another way.",
  failed: "Could not read that just now."
};
const DEAL_PER_SET = DEAL_PERS;
const DEAL_REASON_SET = DEAL_LOST_REASONS;
function amountOf(raw) {
  const digits = raw.replace(/[^0-9.]/g, "");
  return /^\d{1,9}(\.\d{1,2})?$/.test(digits) ? digits : "";
}
export function dealFill(a) {
  const day = a.valid_until.trim();
  return {
    service: a.service.trim().slice(0, 80),
    value: amountOf(a.value),
    per: DEAL_PER_SET.includes(a.per) ? a.per : "",
    link: a.link.trim().slice(0, 600),
    valid_until: isRealDate(day) ? day : "",
    reason: DEAL_REASON_SET.includes(a.lost_reason) ? a.lost_reason : "",
    note: a.note.trim().slice(0, 200)
  };
}
export function noteFill(a) {
  const day = a.day.trim();
  return { what: a.body.trim().slice(0, NOTE_MAX), day: isRealDate(day) ? day : "", team_only: a.team_only };
}
export function sayItFilled(dto) {
  if (dto.verb === "note") return !!dto.note.what;
  const d = dto.deal;
  return !!(d.service || d.value || d.per || d.link || d.valid_until || d.reason || d.note);
}
export function dealSheetFill(sheet, fill) {
  const patch = {};
  const service = sheet.service?.options.find((o) => foldName(o.label) === foldName(fill.service));
  if (fill.service && service) patch.service = service.value;
  if (fill.link && sheet.link) patch.link = fill.link;
  if (fill.value && sheet.value) patch.value = fill.value;
  if (fill.per && sheet.value) patch.per = fill.per;
  if (fill.valid_until && sheet.validUntil) patch.validUntil = fill.valid_until;
  if (fill.reason && sheet.reason) patch.reason = fill.reason;
  if (fill.note && sheet.note) patch.note = fill.note;
  return patch;
}
export function noteSheetFill(sheet, fill) {
  const day = fill.day ? { day: fill.day, picking: !sheet.days.some((c) => c.key === fill.day) } : sheet.kind === "note" ? { day: NO_DAY, picking: false } : {};
  return { what: fill.what, teamOnly: fill.team_only, ...day };
}
