/**
 * One sheet for every deal move, and the deal where the work is (0008).
 *
 * The deal sheet (legacy components/deal-sheet.jsx) is the only place a deal is created or moved: a new proposal, the
 * proposal edited, a passed one proposed again, a yes, a pass, an end. Everything it says is here -- each mode's
 * title, fields, words and defaults (dealSheetFor), the body the deal route takes (dealSheetBody), the field a refusal
 * names (dealSheetRefusal), and whether the proposal can go now (dealSendOf) -- so the sheet says nothing of its own.
 * So is the person page's deal card (dealCardsOf): its steps, its line, its one next act (dealNextAct) and the quiet
 * line where no deal is open; and the thread's Deal group (dealMenuActs). Pure.
 *
 * "Here" is now this folder. This module holds the sheet's words and what it opens with (dealSheetFor); the body
 * and a refusal's field are deal-sheet-body.ts's; the modes, the send, the acts and the thread's Deal group are
 * deal-acts.ts's; the card is deal-card.ts's.
 */
import { zoneDayKey } from "../../shared/clock";
import { normalizeLink } from "../../shared/link";
import {
  DEAL_LOST_REASONS,
  DEAL_LOST_REASON_WORDS,
  DEAL_PERS,
  DEAL_PER_WORDS,
  type DealLostReason,
  type DealPer,
  type DealStage,
} from "../deal-words";
import { amountWords } from "../deal-amount";
import type { DealVM } from "../deal-vm";
import { proposalMessage } from "../../people/person-reach";
import { consultedService, dealSendOf, type DealPerson, type DealSend, type DealSheetMode } from "./deal-acts";

/* --------------------------------------------- the sheet ---------------------------------------------------- */

/** Every word the sheet says. */
export const DEAL_SHEET_WORDS = {
  titles: {
    // Each move's sheet is titled by its act (DEAL_ACT_WORDS; deal-sheet.test.mjs holds them together). Written out:
    // a title read off another object would keep these words in every package that bundles contracts.
    propose: "New proposal",
    edit: "Edit proposal",
    again: "Propose again",
    won: "Mark as client",
    lost: "Mark as passed",
    ended: "End the engagement",
  } satisfies Record<DealSheetMode, string>,
  save: {
    propose: "Record",
    edit: "Save",
    again: "Record",
    won: "Mark as client",
    lost: "Record",
    ended: "End it",
  } satisfies Record<DealSheetMode, string>,
  withSend: "Record and send",
  saving: "Saving…",
  sending: "Sending…",
  service: { label: "Service", any: "Any service" },
  link: {
    label: "Proposal link",
    hint: "A Google Doc, a PDF or any page you would send them.",
    placeholder: "docs.example.com/proposal",
  },
  value: {
    label: "Value",
    hint: "Optional. Only you see it: the receptionist never says a figure.",
    placeholder: "2,500",
    per: "How often",
  },
  agreed: {
    label: "Agreed amount",
    hint: "Optional.",
    fromProposal: "The proposal's value, unless they agreed another.",
  },
  validUntil: { label: "Valid until", hint: "Optional." },
  when: { won: "When they said yes", lost: "When they passed", ended: "When it ended" },
  reason: { label: "Why they passed" },
  note: { label: "Note", hint: "Optional. Only your team sees it.", placeholder: "In their words, or yours" },
  how: {
    label: "How they said yes",
    none: "Not recorded",
    message: "In their own message",
    form: "Signed elsewhere",
    which: "Their message",
    where: "Where it was signed",
    wherePlaceholder: "DocuSign, Sep 20",
  },
  message: { label: "Message", hint: "Sent as written. It has to carry the link." },
  discard: {
    question: "Discard your changes?",
    detail: "Nothing here has been recorded.",
    yes: "Yes, discard",
    no: "Keep editing",
  },
  reading: "Reading…",
  gone: "This person is not in your workspace.",
  moved: "Their deal has moved on since this was opened. Close this and look again.",
  failed: "Could not record this.",
  /** The stage's word a recorded move is said in. */
  done: {
    propose: "Proposal out",
    edit: "Proposal saved",
    again: "Proposal out",
    won: "Client",
    lost: "Passed",
    ended: "Ended",
  } satisfies Record<DealSheetMode, string>,
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
    tooLong: "At most 200 characters.",
  },
} as const;

/** A field the sheet can draw. */
export type DealSheetField =
  "service" | "link" | "value" | "validUntil" | "when" | "reason" | "note" | "how" | "send" | "message";

/** What a person has typed and chosen in the sheet. */
export interface DealSheetDraft {
  service: string;
  link: string;
  value: string;
  per: DealPer;
  validUntil: string;
  when: string;
  reason: DealLostReason | "";
  note: string;
  how: "" | "customer_message" | "form";
  messageId: string;
  formNote: string;
  send: boolean;
  /** The send's words once the person changed them; null follows the link (proposalMessage). */
  message: string | null;
}

/** Most a note or a signed-elsewhere line may hold: the door's and the route's own cap. */
export const DEAL_NOTE_MAX = 200;

export interface DealSheetVM {
  mode: DealSheetMode;
  title: string;
  /** Who, and which of their deals: "Daniela Reyes · Ad management". */
  sub: string;
  /** The deal a move moves; null for a new proposal. */
  deal: DealVM | null;
  /** Said in place of the fields when the deal is no longer where it was when the sheet was opened for it. */
  blocked: string | null;
  service: { label: string; options: { value: string; label: string }[] } | null;
  link: { label: string; hint: string; placeholder: string } | null;
  value: {
    label: string;
    hint: string;
    placeholder: string;
    perLabel: string;
    pers: { value: DealPer; label: string }[];
  } | null;
  validUntil: { label: string; hint: string } | null;
  when: { label: string; max: string } | null;
  reason: { label: string; options: { value: DealLostReason; label: string }[] } | null;
  note: { label: string; hint: string; placeholder: string; max: number } | null;
  how: {
    label: string;
    options: { value: DealSheetDraft["how"]; label: string }[];
    which: string;
    messages: { value: string; label: string }[];
    where: string;
    wherePlaceholder: string;
    max: number;
  } | null;
  send: (DealSend & { message: { label: string; hint: string } }) | null;
  /** What the sheet opens with. */
  draft: DealSheetDraft;
  save: { label: string; withSend: string | null; saving: string; sending: string };
  /** The word a recorded move is said in. */
  done: string;
}

/** Where each mode may move a deal from: the stage its deal must be at. */
const MOVES_FROM: Record<Exclude<DealSheetMode, "propose">, DealStage> = {
  edit: "proposed",
  again: "lost",
  won: "proposed",
  lost: "proposed",
  ended: "won",
};

const DRAFT_EMPTY: DealSheetDraft = {
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
  message: null,
};

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The deal a move is about: the one it was opened for, else the person's current one. */
function targetOf(mode: DealSheetMode, p: DealPerson, dealId: string | null | undefined): DealVM | null {
  if (mode === "propose") return null;
  const deals = p.deals ?? (p.deal ? [p.deal] : []);
  if (dealId) return deals.find((d) => d.id === dealId) ?? (p.deal && p.deal.id === dealId ? p.deal : null);
  return p.deal;
}

/**
 * The sheet for a mode (0008): its title, the fields it draws with their words, and what it opens with. A new
 * proposal asks which service only where the profile lists two or more, takes the link left on a person with no deal
 * at all, and sends by default where it can; a passed one proposed again keeps its link and value and asks the day
 * again; an edit starts from the proposal as it stands; a yes starts from the proposal's value; a pass, an end and a
 * yes are dated today by the business's calendar. `target` names the deal a move is for (a person may hold one open
 * deal per service) and a new proposal's service.
 */
export function dealSheetFor(
  mode: DealSheetMode,
  p: DealPerson,
  nowMs: number,
  tz: string,
  target: { dealId?: string | null; service?: string | null } = {},
): DealSheetVM {
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
    label: [`“${m.words}”`, m.via, m.when].filter(Boolean).join(" · "),
  }));
  const pers = DEAL_PERS.map((x) => ({ value: x, label: capital(DEAL_PER_WORDS[x]) }));
  // The deal's amount as a box shows it ("$2,500", without how often: the sheet asks that apart); parseAmount reads
  // it back to the same cents.
  const valueOf = (deal && amountWords(deal.amountCents, null, deal.currency)) || "";
  const draft: DealSheetDraft = {
    ...DRAFT_EMPTY,
    ...(mode === "propose"
      ? {
          service: target.service?.trim() || consultedService(p) || "",
          // The link left on the person (00154) is theirs only with no deal at all (proposalLinkOf).
          link: !p.deal && p.proposal ? p.proposal.url : "",
        }
      : {}),
    ...(mode === "again" || mode === "edit"
      ? { link: deal?.proposal?.url ?? "", value: valueOf, per: deal?.per ?? "once" }
      : {}),
    ...(mode === "edit" ? { validUntil: deal?.validUntil?.day ?? "" } : {}),
    ...(mode === "won" ? { value: valueOf, per: deal?.per ?? "once", messageId: p.ownMessages?.[0]?.id ?? "" } : {}),
    ...(dated ? { when: today } : {}),
    ...(send ? { send: send.can } : {}),
  };
  const open = !blocked;
  return {
    mode,
    title: W.titles[mode],
    sub: [p.name, deal?.service ?? null].filter((x): x is string => !!x).join(" · "),
    deal,
    blocked,
    service:
      open && mode === "propose" && services.length > 1
        ? {
            label: W.service.label,
            options: [{ value: "", label: W.service.any }, ...services.map((s) => ({ value: s, label: s }))],
          }
        : null,
    link: open && shapes ? { ...W.link } : null,
    value:
      open && (shapes || mode === "won")
        ? {
            label: mode === "won" ? W.agreed.label : W.value.label,
            hint: mode === "won" ? (valueOf ? W.agreed.fromProposal : W.agreed.hint) : W.value.hint,
            placeholder: W.value.placeholder,
            perLabel: W.value.per,
            pers,
          }
        : null,
    validUntil: open && shapes ? { ...W.validUntil } : null,
    when: open && dated ? { label: W.when[mode], max: today } : null,
    reason:
      open && mode === "lost"
        ? {
            label: W.reason.label,
            options: DEAL_LOST_REASONS.map((r) => ({ value: r, label: DEAL_LOST_REASON_WORDS[r] })),
          }
        : null,
    note: open && mode === "lost" ? { ...W.note, max: DEAL_NOTE_MAX } : null,
    how:
      open && mode === "won"
        ? {
            label: W.how.label,
            options: [
              { value: "", label: W.how.none },
              ...(messages.length ? [{ value: "customer_message" as const, label: W.how.message }] : []),
              { value: "form", label: W.how.form },
            ],
            which: W.how.which,
            messages,
            where: W.how.where,
            wherePlaceholder: W.how.wherePlaceholder,
            max: DEAL_NOTE_MAX,
          }
        : null,
    send: open && send ? { ...send, message: { ...W.message } } : null,
    draft,
    save: {
      label: W.save[mode],
      withSend: proposing && send?.can ? W.withSend : null,
      saving: W.saving,
      sending: W.sending,
    },
    done: W.done[mode],
  };
}

/** The words a send carries: the person's own, once they changed them, else the proposal's sentence with the link. */
export function dealSheetMessage(draft: Pick<DealSheetDraft, "link" | "message">): string {
  if (draft.message !== null) return draft.message;
  const typed = draft.link.trim();
  return typed ? proposalMessage(normalizeLink(typed) ?? typed) : "";
}

/** Whether the person has changed anything the sheet opened with: what the registry asks before it is thrown away. */
export function dealSheetDirty(draft: DealSheetDraft, opened: DealSheetDraft): boolean {
  const keys = Object.keys(DRAFT_EMPTY) as (keyof DealSheetDraft)[];
  return (
    keys.some((k) => k !== "message" && draft[k] !== opened[k]) || dealSheetMessage(draft) !== dealSheetMessage(opened)
  );
}

/**
 * The draft once the person was read again with the sheet open (0008): a teammate's move since, or a held copy the
 * page painted first. What was changed here stays; every field left as it opened takes the fresh value, and the fresh
 * draft becomes what the sheet opened with, so a Save changes only what was typed here, and clears only what was
 * emptied here.
 */
export function dealSheetMerge(draft: DealSheetDraft, opened: DealSheetDraft, fresh: DealSheetDraft): DealSheetDraft {
  const keys = Object.keys(DRAFT_EMPTY) as (keyof DealSheetDraft)[];
  return keys.reduce<DealSheetDraft>((out, k) => (draft[k] === opened[k] ? out : { ...out, [k]: draft[k] }), {
    ...fresh,
  });
}
