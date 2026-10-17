import { escapeHtml } from "../shared/html.js";
import { senderWords } from "./sender-words.js";
const offerWhy = (w, who, why) => why === "asked" ? w.offerAsked(who) : w.offerCustomer(who);
function offerParts(address, f) {
  const parts = { address: address?.trim() ?? "", url: f.unsubscribeUrl.trim() };
  if (!parts.address || !parts.url) throw new Error("emailFoot: an offer foot names where and how to stop");
  return parts;
}
function coldParts(business, address, f, link) {
  const parts = {
    why: f.why.trim(),
    business: business.trim(),
    address: address?.trim() ?? "",
    url: f.unsubscribeUrl?.trim() ?? ""
  };
  if (!parts.why || !parts.business || !parts.address || link && !parts.url)
    throw new Error("emailFoot: a cold foot names why, who, where and how to stop");
  return parts;
}
export function emailFoot(business, address, foot, language) {
  const w = senderWords(language);
  if (foot.kind === "cold") {
    const p = coldParts(business, address, foot, false);
    return [p.why, w.marketing, `${p.business} \xB7 ${p.address}`, `${w.noThanks}.`].join("\n");
  }
  const who = business.trim() || w.us;
  if (foot.kind === "offer") {
    const p = offerParts(address, foot);
    return [offerWhy(w, who, foot.why), `${who} \xB7 ${p.address}`, `${w.unsubscribe}: ${p.url}`].join("\n");
  }
  const where = address?.trim();
  const facts = foot.facts;
  const why = typeof facts.proposal_link === "string" ? w.visitProposal(who) : typeof facts.visit_when === "string" ? w.visitBooked(who) : w.visitInTouch(who);
  return where ? `${why}
${w.emailStop}
${who} \xB7 ${where}` : `${why}
${w.emailStop}`;
}
export function emailFootHtml(business, address, foot, language) {
  const w = senderWords(language);
  if (foot.kind === "cold") {
    const p2 = coldParts(business, address, foot, true);
    return `<p>${escapeHtml(p2.why)}<br>${escapeHtml(w.marketing)}<br>${escapeHtml(p2.business)} \xB7 ${escapeHtml(p2.address)}<br>${escapeHtml(w.noThanks)} \xB7 <a href="${escapeHtml(p2.url)}">${escapeHtml(w.unsubscribe)}</a></p>`;
  }
  const who = business.trim() || w.us;
  const p = offerParts(address, foot);
  return `<p>${escapeHtml(offerWhy(w, who, foot.why))}<br>${escapeHtml(`${who} \xB7 ${p.address}`)}<br><a href="${escapeHtml(p.url)}">${escapeHtml(w.unsubscribe)}</a></p>`;
}
