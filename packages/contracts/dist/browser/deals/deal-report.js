import { leadAnd } from "../leads/leads.js";
import { plural } from "../shared/words.js";
import { DEAL_STAGE_WORDS, isDealLostReason } from "./deal-words.js";
import { amountTotalsWords, amountWords } from "./deal-amount.js";
import { yesWaitWords } from "./deal-waits.js";
const DEAL_OUTCOMES_TITLE = "What became of the proposals";
const DEAL_OUTCOME_WORDS = {
  won: "Became clients",
  waiting: "Still waiting",
  lost: DEAL_STAGE_WORDS.lost
};
function cameFromSaid(key, n) {
  switch (key) {
    case "whatsapp":
      return "came from WhatsApp";
    case "sms":
      return "came by text";
    case "email":
      return "came by email";
    case "call":
      return "came by phone";
    case "calendar":
      return "came from your calendar";
    case "manual":
      return n === 1 ? "was added by hand" : "were added by hand";
    case "import":
      return "came from your imported history";
    case "lead":
      return "came from Leads";
    case "ad":
      return "came from an ad";
    default:
      return null;
  }
}
const DEAL_LOST_REASON_SAID = {
  price: "price",
  timing: "timing",
  elsewhere: "going elsewhere",
  no_reply: "no reply",
  not_a_fit: "not being a fit",
  other: "something else"
};
const upper = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function medianLine(days, clients) {
  if (days === null || !clients) return null;
  const wait = yesWaitWords(days);
  return clients === 1 ? `${upper(wait)} to a yes.` : `Median ${wait} to a yes.`;
}
function sourcesLine(sources, clients) {
  if (!clients) return null;
  const top = sources.filter((s) => s.count > 0 && cameFromSaid(s.came_from, s.count) !== null).sort((a, b) => b.count - a.count)[0];
  if (!top) return null;
  const said = cameFromSaid(top.came_from, top.count);
  return clients === 1 ? `Your new client ${said}.` : `${top.count} of ${clients} new clients ${said}.`;
}
function reasonsLine(reasons, passed) {
  const given = reasons.filter((r) => r.count > 0 && isDealLostReason(r.reason)).sort((a, b) => b.count - a.count);
  const said = given.reduce((s, r) => s + r.count, 0);
  if (!said || !passed) return null;
  const top = given[0].count;
  const tied = given.filter((r) => r.count === top);
  const names = upper(leadAnd(tied.map((r) => DEAL_LOST_REASON_SAID[r.reason])));
  const none = Math.max(0, passed - said);
  if (given.length === 1) {
    if (passed === 1) return `${names} was the reason given for passing.`;
    return `${names} was the ${none ? "only reason" : "reason"} given for passing, ${top} of ${passed}.`;
  }
  const runnerUp = given.find((r) => r.count < top)?.count ?? 0;
  const end = none > 0 && (tied.length > 1 || runnerUp + none >= top) ? `; ${none} gave no reason.` : ".";
  return tied.length > 1 ? `${names} were the most common reasons for passing, ${top} each of ${passed}${end}` : `${names} was the most common reason for passing, ${top} of ${passed}${end}`;
}
function openLine(open) {
  if (!open.count) return null;
  const worth = amountTotalsWords(open.amounts);
  if (!worth) return `${plural(open.count, "proposal", "proposals")} still open.`;
  return open.count === 1 ? `${worth} still open in 1 proposal.` : `${worth} still open across ${open.count} proposals.`;
}
export function toDealReportVM(dto, within) {
  if (!dto || !dto.any) return { present: false, headline: "", stock: "", outcomes: null, lines: [] };
  const headline = dto.sent === 0 ? `No proposals went out ${within}.` : `${plural(dto.sent, "proposal", "proposals")} went out ${within}.`;
  const monthly = dto.monthly_cents > 0 ? amountWords(dto.monthly_cents, "month") : null;
  const stock = dto.clients === 0 ? "No clients right now." : `${plural(dto.clients, "client", "clients")} now${monthly ? ` \xB7 ${monthly}` : ""}.`;
  const outcomes = dto.sent === 0 ? null : {
    title: DEAL_OUTCOMES_TITLE,
    max: dto.sent,
    rows: ["won", "waiting", "lost"].map((id) => ({
      id,
      label: DEAL_OUTCOME_WORDS[id],
      value: dto[id],
      display: `${dto[id]}  ${Math.round(dto[id] / dto.sent * 100)}%`
    }))
  };
  const said = [
    ["median", medianLine(dto.median_days_to_yes, dto.won)],
    ["sources", sourcesLine(dto.sources, dto.won)],
    ["reasons", reasonsLine(dto.reasons, dto.lost)],
    ["open", openLine(dto.open)]
  ];
  const lines = said.flatMap(([id, text]) => text ? [{ id, text }] : []);
  return { present: true, headline, stock, outcomes, lines };
}
