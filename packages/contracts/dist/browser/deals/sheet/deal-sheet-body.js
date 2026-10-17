import { wallClockAt, zoneDayKey } from "../../shared/clock.js";
import { isRealDate } from "../../config/workspace-config/config-rules.js";
import { normalizeLink, whyNotALink } from "../../shared/link.js";
import { DEAL_REFUSALS } from "../deal-words.js";
import { parseAmount } from "../deal-amount.js";
import {
  DEAL_NOTE_MAX,
  DEAL_SHEET_WORDS,
  dealSheetMessage
} from "./deal-sheet.js";
const STAGE_OF = {
  propose: "proposed",
  edit: "proposed",
  again: "proposed",
  won: "won",
  lost: "lost",
  ended: "ended"
};
export function dealSheetBody(mode, draft, deal, opts) {
  const P = DEAL_SHEET_WORDS.problems;
  const problem = (field, words) => ({ problem: { field, words } });
  const moving = mode !== "propose";
  if (moving && !deal?.id) return problem(null, DEAL_SHEET_WORDS.moved);
  const body = { stage: STAGE_OF[mode] };
  if (moving && deal?.id) {
    body.deal_id = deal.id;
    if (deal.version !== null && deal.version !== void 0) body.version = deal.version;
  }
  const clear = [];
  const shapes = mode === "propose" || mode === "edit" || mode === "again";
  if (shapes || mode === "won") {
    const typed = draft.value.trim();
    if (typed) {
      const cents = parseAmount(typed);
      if (cents === null) return problem("value", P.amount);
      body.amount_cents = cents;
      body.per = draft.per;
    } else if (moving && deal?.amountCents !== null && deal?.amountCents !== void 0) clear.push("amount");
  }
  if (shapes) {
    const typed = draft.link.trim();
    let url = null;
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
    let send = null;
    if ((mode === "propose" || mode === "again") && draft.send && opts.canSend) {
      if (!url) return problem("link", P.sendNeedsLink);
      const text = dealSheetMessage(draft).trim();
      if (!text.includes(url)) return problem("message", P.messageLink);
      send = { text };
    }
    return { body: clear.length ? { ...body, clear } : body, send };
  }
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
const REFUSAL_FIELD = {
  bad_link: "link",
  bad_amount: "value",
  bad_per: "value",
  note_too_long: "note",
  service_too_long: "service",
  already_open: "service",
  bad_reason: "reason"
};
export function dealSheetRefusal(message) {
  const words = (message ?? "").trim() || DEAL_SHEET_WORDS.failed;
  const code = Object.keys(DEAL_REFUSALS).find((k) => DEAL_REFUSALS[k] === words);
  return { field: code && REFUSAL_FIELD[code] || null, words };
}
