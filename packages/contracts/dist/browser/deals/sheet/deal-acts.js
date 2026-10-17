import { DEAL_ACT_WORDS } from "../deal-words.js";
import { waitingOnProposal } from "../deal-waits.js";
import { consultationHappened, consultServiceOf, noProposalSince } from "../deal-consultations.js";
import { EMAIL_CANT_REACH, mayReach, proposalAction, proposalMessage } from "../../people/person-reach.js";
export const DEAL_SHEET_MODES = ["propose", "edit", "again", "won", "lost", "ended"];
export function isDealSheetMode(s) {
  return typeof s === "string" && DEAL_SHEET_MODES.includes(s);
}
export const DEAL_SEND_WHY = {
  window: "Their WhatsApp window has closed. Record it now, and send it from their thread when they write next.",
  stopped: "They asked not to be messaged.",
  // The Replies row's own sentence (person-reach.ts), not a second one.
  emailStopped: EMAIL_CANT_REACH,
  none: "There is no conversation with them yet."
};
export function dealSendOf(p) {
  const on = p.replyVia === "Email" ? "by email" : p.replyVia === "Text" ? "as a text" : "on WhatsApp";
  const label = `Send it now ${on}`;
  const reach = mayReach(p);
  if (!reach) {
    const stopped = p.consent.state === "opted_out" || p.consent.dnc;
    const why = stopped ? DEAL_SEND_WHY.stopped : p.openThread ? DEAL_SEND_WHY.emailStopped : DEAL_SEND_WHY.none;
    return { can: false, reach, why, label };
  }
  if (!proposalAction({ via: p.replyVia, window: p.replyWindow, emailStopped: p.emailSuppressed }, null).ready)
    return { can: false, reach, why: DEAL_SEND_WHY.window, label };
  return { can: true, reach, why: null, label };
}
export function proposalFollowUp(url) {
  return `Just checking the proposal reached you. Here it is again: ${url}`;
}
export const DEAL_ACT_HINTS = {
  /** A send where only an approved message can go: it opens their thread, which offers those. */
  approved: "Only an approved message reaches them until they write again; their thread offers those"
};
const MODE_OF = {
  propose: "propose",
  again: "again",
  edit: "edit",
  won: "won",
  lost: "lost",
  ended: "ended",
  send: null,
  "follow-up": null
};
export const act = (id, extra = {}) => ({
  id,
  label: DEAL_ACT_WORDS[id],
  mode: MODE_OF[id],
  ...extra.text !== void 0 ? { text: extra.text } : {},
  ...extra.hint !== void 0 ? { hint: extra.hint } : {},
  ...extra.service ? { service: extra.service } : {}
});
export function consultedService(p) {
  if (!p.consultationTitle) return null;
  const named = consultServiceOf(
    p.consultationTitle,
    (p.services ?? []).map((name) => ({ name })),
    { consult_first: p.consultFirst ?? [] }
  );
  const open = (p.deals ?? (p.deal ? [p.deal] : [])).some(
    (d) => d.service === named && (d.stage === "proposed" || d.stage === "won")
  );
  return named && !open ? named : null;
}
export function sentOf(p, deal) {
  const url = deal.proposal?.url ?? null;
  if (!url) return null;
  if (deal.proposal && deal.proposal.sent !== void 0) return deal.proposal.sent ?? null;
  return p.proposal && p.proposal.url === url ? p.proposal.sent ?? null : null;
}
export function followUpOn(p, deal) {
  return deal === p.deal || deal.id !== null && deal.id === p.deal?.id ? p.followUp ?? null : null;
}
export function dealNextAct(p, nowMs, deal = p.deal) {
  if (!deal || deal.stage === "ended") return act("propose", { service: consultedService(p) });
  if (deal.stage === "won") return null;
  if (deal.stage === "lost") return act("again");
  const url = deal.proposal?.url ?? null;
  if (!url) return act("edit");
  if (deal.proposal?.sending) return act("won");
  const send = dealSendOf(p);
  const sent = sentOf(p, deal);
  const words = (text) => send.can ? { text } : { hint: DEAL_ACT_HINTS.approved };
  if (!sent && send.reach) return act("send", words(proposalMessage(url)));
  if (sent && send.reach && followUpOn(p, deal)?.kind !== "will" && waitingOnProposal({ deal, askedMs: p.askedMs ?? null }, nowMs, p.dealPace ?? null))
    return act("follow-up", words(proposalFollowUp(url)));
  return act("won");
}
export function dealMenuActs(deal) {
  if (!deal || deal.stage === "ended") return [act("propose")];
  if (deal.stage === "proposed") return [act("send"), act("won"), act("lost"), act("edit")];
  if (deal.stage === "won") return [act("ended")];
  return [act("again")];
}
export function calendarPeekDeal(block, people, nowMs) {
  const who = block.person;
  const row = who && people && people.dealsOn ? (people.rows ?? []).find((r) => r.id === who.id) : void 0;
  if (!who || !row) return { stage: null, start: null };
  const deal = row.deal ?? null;
  const endMs = Date.parse(block.end);
  const over = block.consultation && Number.isFinite(endMs) && endMs < nowMs && consultationHappened(block.visit);
  return {
    stage: deal ? deal.stage : null,
    start: over && noProposalSince(deal, endMs) ? { act: act("propose"), personId: who.id, service: block.consultService } : null
  };
}
