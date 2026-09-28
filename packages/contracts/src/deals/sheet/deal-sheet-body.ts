/**
 * What the deal sheet hands the deal route (0008): the body for a move, or what is wrong with it under the field
 * it names before a round trip (dealSheetBody), and the field a refusal the route answered is about
 * (dealSheetRefusal). The sheet's words and its draft are deal-sheet.ts's.
 */
import { wallClockAt, zoneDayKey } from "../../shared/clock";
import { isRealDate } from "../../config/workspace-config/config-schema";
import { normalizeLink, whyNotALink } from "../../shared/link";
import { DEAL_REFUSALS, type DealClearable, type DealLostReason, type DealPer, type DealStage } from "../deal-words";
import { parseAmount } from "../deal-amount";
import type { DealVM } from "../deal-vm";
import type { DealSheetMode } from "./deal-acts";
import {
  DEAL_NOTE_MAX,
  DEAL_SHEET_WORDS,
  dealSheetMessage,
  type DealSheetDraft,
  type DealSheetField,
} from "./deal-sheet";

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
  const P = DEAL_SHEET_WORDS.problems;
  const problem = (field: DealSheetField | null, words: string): DealSheetOutcome => ({ problem: { field, words } });
  const moving = mode !== "propose";
  if (moving && !deal?.id) return problem(null, DEAL_SHEET_WORDS.moved);
  const body: DealSheetBody = { stage: STAGE_OF[mode] };
  if (moving && deal?.id) {
    body.deal_id = deal.id;
    if (deal.version !== null && deal.version !== undefined) body.version = deal.version;
  }
  const clear: DealClearable[] = [];

  // The value, where the mode asks for one: an emptied value clears what the deal held.
  const shapes = mode === "propose" || mode === "edit" || mode === "again";
  if (shapes || mode === "won") {
    const typed = draft.value.trim();
    if (typed) {
      const cents = parseAmount(typed);
      if (cents === null) return problem("value", P.amount);
      body.amount_cents = cents;
      body.per = draft.per;
    } else if (moving && deal?.amountCents !== null && deal?.amountCents !== undefined) clear.push("amount");
  }

  if (shapes) {
    const typed = draft.link.trim();
    let url: string | null = null;
    if (typed) {
      url = normalizeLink(typed);
      if (!url) return problem("link", whyNotALink(typed) ?? DEAL_REFUSALS.bad_link);
      body.proposal_url = url;
    } else if (moving && deal?.proposal) clear.push("proposal_url");
    if (draft.validUntil) {
      if (!isRealDate(draft.validUntil)) return problem("validUntil", P.day);
      body.valid_until = draft.validUntil;
    } else if (mode === "edit" && deal?.validUntil) clear.push("valid_until");
    if (mode === "propose" && draft.service.trim()) body.service = draft.service.trim();
    let send: { text: string } | null = null;
    if ((mode === "propose" || mode === "again") && draft.send && opts.canSend) {
      if (!url) return problem("link", P.sendNeedsLink);
      const text = dealSheetMessage(draft).trim();
      if (!text.includes(url)) return problem("message", P.messageLink);
      send = { text };
    }
    return { body: clear.length ? { ...body, clear } : body, send };
  }

  // A yes, a pass, an end: the day it happened, never one still to come.
  const today = zoneDayKey(opts.nowMs, opts.tz);
  if (!isRealDate(draft.when)) return problem("when", P.day);
  if (draft.when > today) return problem("when", P.future);
  if (draft.when !== today) body.when = new Date(wallClockAt(opts.tz, draft.when, 12, 0)).toISOString();
  if (mode === "won") {
    if (draft.how === "customer_message" && draft.messageId) body.message_id = draft.messageId;
    if (draft.how === "form" && draft.formNote.trim()) {
      if (draft.formNote.trim().length > DEAL_NOTE_MAX) return problem("how", P.tooLong);
      body.form_note = draft.formNote.trim();
    }
  }
  if (mode === "lost") {
    if (draft.reason) body.lost_reason = draft.reason;
    if (draft.note.trim()) {
      if (draft.note.trim().length > DEAL_NOTE_MAX) return problem("note", DEAL_REFUSALS.note_too_long);
      body.note = draft.note.trim();
    }
  }
  return { body: clear.length ? { ...body, clear } : body, send: null };
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
