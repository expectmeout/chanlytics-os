/**
 * What the deal sheet hands the deal route (0008): the body for a move, or what is wrong with it under the field
 * it names before a round trip (dealSheetBody), and the field a refusal the route answered is about
 * (dealSheetRefusal). The sheet's words and its draft are deal-sheet.ts's.
 */
import {
  wallClockAt,
  zoneDayKey,
  isRealDate,
  normalizeLink,
  whyNotALink,
  DEAL_REFUSALS,
  type DealClearable,
  type DealLostReason,
  type DealPer,
  type DealStage,
  parseAmount,
  DEAL_NOTE_MAX,
  DEAL_SHEET_WORDS,
  dealSheetMessage,
  type DealSheetDraft,
  type DealSheetField,
} from "@chanlytics/contracts";
import type { DealVM, DealSheetMode } from "@chanlytics/contracts";

const STAGE_OF: Record<DealSheetMode, DealStage> = {
  propose: "proposed",
  edit: "proposed",
  again: "proposed",
  won: "won",
  lost: "lost",
  ended: "ended",
};

/** The route's body for a move (the deal route and window.__recordDeal's DealBody). */
export interface DealSheetBody {
  stage: DealStage;
  deal_id?: string;
  version?: number;
  service?: string;
  when?: string;
  amount_cents?: number;
  per?: DealPer;
  note?: string;
  message_id?: string;
  form_note?: string;
  proposal_url?: string;
  valid_until?: string;
  lost_reason?: DealLostReason;
  clear?: DealClearable[];
}

/** What is wrong, said under the field it names; null names none, and the sheet says it by its Save. */
export interface DealSheetProblem {
  field: DealSheetField | null;
  words: string;
}

export type DealSheetOutcome = { body: DealSheetBody; send: { text: string } | null } | { problem: DealSheetProblem };

/**
 * The body the deal route takes for what the sheet holds (0008), or what is wrong with it, under the field it names,
 * before a round trip. A new proposal names its service; a move names its row and the version the page saw. A move
 * keeps what it is not told, so `clear` names every field the person emptied: the link, the value, the valid-until
 * day. Amounts are read by parseAmount and links by normalizeLink (whyNotALink says what is wrong with one). A day
 * other than today is noon on it by the business's clock; today is now, so the record keeps the minute it was made.
 * `send` is the words to send once the record lands, when the switch is on and the person can be sent to; the
 * message must still carry the link, or "Sent" could never be read back from the thread.
 */
export function dealSheetBody(
  mode: DealSheetMode,
  draft: DealSheetDraft,
  deal: DealVM | null,
  opts: { tz: string; nowMs: number; canSend: boolean },
): DealSheetOutcome {
  const moving = mode !== "propose";
  if (moving && !deal?.id) return problem(null, DEAL_SHEET_WORDS.moved);
  const parts: DealSheetParts = { body: { stage: STAGE_OF[mode] }, clear: [] };
  if (moving && deal?.id) {
    parts.body.deal_id = deal.id;
    if (deal.version !== null && deal.version !== undefined) parts.body.version = deal.version;
  }
  const shapes = mode === "propose" || mode === "edit" || mode === "again";
  if (shapes || mode === "won") {
    const refused = valueInto(parts, draft, moving ? deal : null);
    if (refused) return refused;
  }
  return shapes
    ? proposalOutcome(parts, draft, deal, { mode, canSend: opts.canSend })
    : dayOutcome(parts, mode, draft, opts);
}

/** The body as it is made, and the fields a move empties: `clear` rides the body only when it names one. */
interface DealSheetParts {
  body: DealSheetBody;
  clear: DealClearable[];
}

const problem = (field: DealSheetField | null, words: string): DealSheetOutcome => ({ problem: { field, words } });

const partsOutcome = (parts: DealSheetParts, send: { text: string } | null): DealSheetOutcome => ({
  body: parts.clear.length ? { ...parts.body, clear: parts.clear } : parts.body,
  send,
});

/** The value, where the mode asks for one: an emptied value clears what the deal held (`moved`, null on a new one). */
function valueInto(parts: DealSheetParts, draft: DealSheetDraft, moved: DealVM | null): DealSheetOutcome | null {
  const typed = draft.value.trim();
  if (typed) {
    const cents = parseAmount(typed);
    if (cents === null) return problem("value", DEAL_SHEET_WORDS.problems.amount);
    parts.body.amount_cents = cents;
    parts.body.per = draft.per;
  } else if (moved?.amountCents !== null && moved?.amountCents !== undefined) parts.clear.push("amount");
  return null;
}

/** A proposal's shape: its link, the day it is good until, its service, and the words to send once it lands. */
function proposalOutcome(
  parts: DealSheetParts,
  draft: DealSheetDraft,
  deal: DealVM | null,
  { mode, canSend }: { mode: DealSheetMode; canSend: boolean },
): DealSheetOutcome {
  const problems = DEAL_SHEET_WORDS.problems;
  const typed = draft.link.trim();
  let url: string | null = null;
  if (typed) {
    url = normalizeLink(typed);
    if (!url) return problem("link", whyNotALink(typed) ?? DEAL_REFUSALS.bad_link);
    parts.body.proposal_url = url;
  } else if (mode !== "propose" && deal?.proposal) parts.clear.push("proposal_url");
  if (draft.validUntil) {
    if (!isRealDate(draft.validUntil)) return problem("validUntil", problems.day);
    parts.body.valid_until = draft.validUntil;
  } else if (mode === "edit" && deal?.validUntil) parts.clear.push("valid_until");
  if (mode === "propose" && draft.service.trim()) parts.body.service = draft.service.trim();
  if (!((mode === "propose" || mode === "again") && draft.send && canSend)) return partsOutcome(parts, null);
  if (!url) return problem("link", problems.sendNeedsLink);
  const text = dealSheetMessage(draft).trim();
  if (!text.includes(url)) return problem("message", problems.messageLink);
  return partsOutcome(parts, { text });
}

/** A yes, a pass, an end: the day it happened, never one still to come, and what the mode keeps of it. */
function dayOutcome(
  parts: DealSheetParts,
  mode: DealSheetMode,
  draft: DealSheetDraft,
  opts: { tz: string; nowMs: number },
): DealSheetOutcome {
  const problems = DEAL_SHEET_WORDS.problems;
  const today = zoneDayKey(opts.nowMs, opts.tz);
  if (!isRealDate(draft.when)) return problem("when", problems.day);
  if (draft.when > today) return problem("when", problems.future);
  if (draft.when !== today) parts.body.when = new Date(wallClockAt(opts.tz, draft.when, 12, 0)).toISOString();
  if (mode === "won") {
    if (draft.how === "customer_message" && draft.messageId) parts.body.message_id = draft.messageId;
    if (draft.how === "form" && draft.formNote.trim()) {
      if (draft.formNote.trim().length > DEAL_NOTE_MAX) return problem("how", problems.tooLong);
      parts.body.form_note = draft.formNote.trim();
    }
  }
  if (mode === "lost") {
    if (draft.reason) parts.body.lost_reason = draft.reason;
    if (draft.note.trim()) {
      if (draft.note.trim().length > DEAL_NOTE_MAX) return problem("note", DEAL_REFUSALS.note_too_long);
      parts.body.note = draft.note.trim();
    }
  }
  return partsOutcome(parts, null);
}

/** The field each refusal of the door is about (DEAL_REFUSALS). */
const REFUSAL_FIELD: Record<string, DealSheetField> = {
  bad_link: "link",
  bad_amount: "value",
  bad_per: "value",
  note_too_long: "note",
  service_too_long: "service",
  already_open: "service",
  bad_reason: "reason",
};

/**
 * A refusal the route answered, under the field it names: the route says the door's sentence (DEAL_REFUSALS), so the
 * sentence says which field. One the sheet cannot place (a deal moved since, an ended engagement) names none.
 */
export function dealSheetRefusal(message: string | null | undefined): DealSheetProblem {
  const words = (message ?? "").trim() || DEAL_SHEET_WORDS.failed;
  const code = Object.keys(DEAL_REFUSALS).find((k) => DEAL_REFUSALS[k] === words);
  return { field: (code && REFUSAL_FIELD[code]) || null, words };
}
