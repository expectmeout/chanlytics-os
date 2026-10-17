import { zoneDayKey } from "../../shared/clock.js";
import { normalizeLink } from "../../shared/link.js";
import {
  DEAL_LOST_REASONS,
  DEAL_LOST_REASON_WORDS,
  DEAL_PERS,
  DEAL_PER_WORDS,
  DEAL_STAGE_WORDS
} from "../deal-words.js";
import { amountWords } from "../deal-amount.js";
import { proposalMessage } from "../../people/person-reach.js";
import { consultedService, dealSendOf } from "./deal-acts.js";
export const DEAL_SHEET_WORDS = {
  titles: {
    // Each move's sheet is titled by its act (DEAL_ACT_WORDS; deal-sheet.test.mjs holds them together). Written out:
    // a title read off another object would keep these words in every package that bundles contracts.
    propose: "New proposal",
    edit: "Edit proposal",
    again: "Propose again",
    won: "Mark as client",
    lost: "Mark as passed",
    ended: "End the engagement"
  },
  save: {
    propose: "Record",
    edit: "Save",
    again: "Record",
    won: "Mark as client",
    lost: "Record",
    ended: "End it"
  },
  withSend: "Record and send",
  saving: "Saving\u2026",
  sending: "Sending\u2026",
  service: { label: "Service", any: "Any service" },
  link: {
    label: "Proposal link",
    hint: "A doc, a PDF or any page.",
    placeholder: "docs.example.com/proposal"
  },
  value: {
    label: "Value",
    // Optional is said by the box being empty and nothing refusing it; who sees it is the one thing to say (Ruben,
    // 10 Oct 2026: "Optional." under three boxes in a row).
    hint: "Only you see it.",
    placeholder: "2,500",
    per: "How often"
  },
  agreed: {
    label: "Agreed amount",
    fromProposal: "The proposal's value, unless they agreed another."
  },
  // A day picked from the kit's month: what an empty one says, and the word that empties it (the fitted sheets).
  validUntil: { label: "Valid until", hint: null, none: "No end date", clear: "Clear" },
  when: { won: "When they said yes", lost: "When they passed", ended: "When it ended" },
  reason: { label: "Why they passed" },
  note: { label: "Note", hint: "Only your team sees it.", placeholder: "In their words, or yours" },
  how: {
    label: "How they said yes",
    none: "Not recorded",
    message: "In their own message",
    form: "Signed elsewhere",
    which: "Their message",
    where: "Where it was signed",
    wherePlaceholder: "DocuSign, Sep 20"
  },
  message: { label: "Message", hint: "It has to carry the link." },
  discard: {
    question: "Discard changes?",
    detail: null,
    yes: "Discard",
    no: "Keep editing"
  },
  reading: "Reading\u2026",
  gone: "This person is not in your workspace.",
  moved: "Their deal has moved on since this was opened. Close this and look again.",
  failed: "Could not record this.",
  /**
   * The stage's word a recorded move is said in: the stage's own (DEAL_STAGE_WORDS), so a sheet, a card and People say one
   * word (the wiring's second audit, S9-9). An edit moves no stage, and says what it did.
   */
  done: {
    propose: DEAL_STAGE_WORDS.proposed,
    edit: "Proposal saved",
    again: DEAL_STAGE_WORDS.proposed,
    won: DEAL_STAGE_WORDS.won,
    lost: DEAL_STAGE_WORDS.lost,
    ended: DEAL_STAGE_WORDS.ended
  },
  /** A deal marked as passed, its lead words in the toast before the service (canvas A, M5), with Propose again. */
  passed: "Marked as passed",
  /** The send's own toast, after the name: its Undo stops the message, never the record. */
  sent: "proposal recorded and on its way",
  /** Before the reason a send was refused, after a good record. */
  notSent: "Recorded. It did not send:",
  /** A send refused before anything said why. */
  unsent: "Recorded. It did not send.",
  problems: {
    amount: "An amount is a number, like 2,500.",
    day: "Pick a day.",
    future: "Pick today or a day before it.",
    sendNeedsLink: "Add the link to send it, or turn sending off.",
    messageLink: "The message has to carry the link.",
    tooLong: "At most 200 characters."
  }
};
export const DEAL_NOTE_MAX = 200;
const MOVES_FROM = {
  edit: "proposed",
  again: "lost",
  won: "proposed",
  lost: "proposed",
  ended: "won"
};
const DRAFT_EMPTY = {
  service: "",
  link: "",
  value: "",
  per: "once",
  validUntil: "",
  when: "",
  reason: "",
  note: "",
  how: "",
  messageId: "",
  formNote: "",
  send: false,
  message: null
};
const capital = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;
function targetOf(mode, p, dealId) {
  if (mode === "propose") return null;
  const deals = p.deals ?? (p.deal ? [p.deal] : []);
  if (dealId) return deals.find((d) => d.id === dealId) ?? (p.deal && p.deal.id === dealId ? p.deal : null);
  return p.deal;
}
const VALUE_WORDS = {
  private: DEAL_SHEET_WORDS.value.hint,
  placeholder: DEAL_SHEET_WORDS.value.placeholder,
  perLabel: DEAL_SHEET_WORDS.value.per
};
export function dealSheetFor(mode, p, nowMs, tz, target = {}) {
  const W = DEAL_SHEET_WORDS;
  const deal = targetOf(mode, p, target.dealId);
  const blocked = mode !== "propose" && (!deal || deal.stage !== MOVES_FROM[mode]) ? W.moved : null;
  const today = zoneDayKey(nowMs, tz);
  const proposing = mode === "propose" || mode === "again";
  const shapes = mode === "propose" || mode === "edit" || mode === "again";
  const dated = mode === "won" || mode === "lost" || mode === "ended";
  const send = proposing ? dealSendOf(p) : null;
  const services = p.services ?? [];
  const messages = (p.ownMessages ?? []).map((m) => ({
    value: m.id,
    label: [`\u201C${m.words}\u201D`, m.via, m.when].filter(Boolean).join(" \xB7 ")
  }));
  const pers = DEAL_PERS.map((x) => ({ value: x, label: capital(DEAL_PER_WORDS[x]) }));
  const valueOf = deal && amountWords(deal.amountCents, null, deal.currency) || "";
  const draft = {
    ...DRAFT_EMPTY,
    ...mode === "propose" ? {
      service: target.service?.trim() || consultedService(p) || "",
      // The link left on the person (00154) is theirs only with no deal at all (proposalLinkOf).
      link: !p.deal && p.proposal ? p.proposal.url : ""
    } : {},
    ...mode === "again" || mode === "edit" ? { link: deal?.proposal?.url ?? "", value: valueOf, per: deal?.per ?? "once" } : {},
    ...mode === "edit" ? { validUntil: deal?.validUntil?.day ?? "" } : {},
    ...mode === "won" ? { value: valueOf, per: deal?.per ?? "once", messageId: p.ownMessages?.[0]?.id ?? "" } : {},
    ...dated ? { when: today } : {},
    ...send ? { send: send.can } : {}
  };
  const open = !blocked;
  return {
    mode,
    title: W.titles[mode],
    sub: [p.name, deal?.service ?? null].filter((x) => !!x).join(" \xB7 "),
    deal,
    blocked,
    service: open && mode === "propose" && services.length > 1 ? {
      label: W.service.label,
      options: [{ value: "", label: W.service.any }, ...services.map((s) => ({ value: s, label: s }))]
    } : null,
    link: open && shapes ? { ...W.link } : null,
    value: open && (shapes || mode === "won") ? {
      label: mode === "won" ? W.agreed.label : W.value.label,
      ...VALUE_WORDS,
      hint: mode === "won" && valueOf ? W.agreed.fromProposal : null,
      pers
    } : null,
    validUntil: open && shapes ? { ...W.validUntil, today } : null,
    when: open && dated ? { label: W.when[mode], max: today } : null,
    reason: open && mode === "lost" ? {
      label: W.reason.label,
      options: DEAL_LOST_REASONS.map((r) => ({ value: r, label: DEAL_LOST_REASON_WORDS[r] }))
    } : null,
    note: open && mode === "lost" ? { ...W.note, max: DEAL_NOTE_MAX } : null,
    how: open && mode === "won" ? {
      label: W.how.label,
      options: [
        { value: "", label: W.how.none },
        ...messages.length ? [{ value: "customer_message", label: W.how.message }] : [],
        { value: "form", label: W.how.form }
      ],
      which: W.how.which,
      messages,
      where: W.how.where,
      wherePlaceholder: W.how.wherePlaceholder,
      max: DEAL_NOTE_MAX
    } : null,
    send: open && send ? { ...send, message: { ...W.message } } : null,
    draft,
    save: {
      label: W.save[mode],
      withSend: proposing && send?.can ? W.withSend : null,
      saving: W.saving,
      sending: W.sending
    },
    done: W.done[mode]
  };
}
export function dealSheetMessage(draft) {
  if (draft.message !== null) return draft.message;
  const typed = draft.link.trim();
  return typed ? proposalMessage(normalizeLink(typed) ?? typed) : "";
}
export function dealSheetDirty(draft, opened) {
  const keys = Object.keys(DRAFT_EMPTY);
  return keys.some((k) => k !== "message" && draft[k] !== opened[k]) || dealSheetMessage(draft) !== dealSheetMessage(opened);
}
export function dealSheetMerge(draft, opened, fresh) {
  const keys = Object.keys(DRAFT_EMPTY);
  return keys.reduce((out, k) => draft[k] === opened[k] ? out : { ...out, [k]: draft[k] }, {
    ...fresh
  });
}
