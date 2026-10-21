import { isIdentifierName, shortName } from "../../conversations/thread-contact.js";
import { dealIsOpen } from "../deal-vm.js";
import { DEAL_STAGE_WORDS } from "../deal-words.js";
import { EMAIL_CANT_REACH, emailFactWords, repliesWords } from "../../people/person-reach.js";
import { act, consultedService } from "../sheet/deal-acts.js";
import { DEAL_CARD_WORDS, consultationStepOf, dealCardsOf } from "../sheet/deal-card.js";
import { GROUP_WORDS, PIPELINE_WORDS } from "./pipeline-words.js";
export function pipelinePeekOf(row, group, deals = null) {
  const p = row.person;
  const facts = [];
  if (p.nextVisit) facts.push({ id: "next", words: `Coming up \xB7 ${p.nextVisit}` });
  const n = row.next;
  const known = deals ?? (p.deal ? [p.deal] : []);
  const onCard = !!n?.dealId && known.some((d) => d.id === n.dealId && dealIsOpen(d));
  if (n && !onCard) facts.push({ id: "step", words: `${PIPELINE_WORDS.columns.next} \xB7 ${n.words} \xB7 ${n.when}` });
  const deal = [row.service, row.value].filter(Boolean).join(" \xB7 ");
  return {
    id: row.id,
    dealId: row.deal?.id ?? null,
    name: row.name,
    initials: p.initials,
    numeric: isIdentifierName(row.name),
    stopped: p.stopped,
    sub: deal || (group === "consultations" ? DEAL_CARD_WORDS.consultation : GROUP_WORDS[group]),
    group,
    facts
  };
}
export function pipelinePeekDetail(p) {
  const W = PIPELINE_WORDS.peek.reach;
  const reach = [];
  if (p.phone && !(p.consent && p.consent.dnc))
    reach.push({ id: "phone", label: W.phone, words: p.phone, copy: p.phone });
  if (p.email)
    reach.push({ id: "email", label: W.email, words: emailFactWords(p.email, p.emailSuppressed), copy: p.email });
  const replies = p.hasChat ? repliesWords(p.replyVia, p.replyWindow, { optedOut: p.stopped, who: p.name, emailStopped: p.emailSuppressed }) : null;
  if (replies && !(p.email && replies === EMAIL_CANT_REACH))
    reach.push({ id: "replies", label: W.replies, words: replies, copy: null });
  return { reach };
}
function stepsOf(track, card, held) {
  const label = {
    consultation: DEAL_CARD_WORDS.consultation,
    proposal: DEAL_STAGE_WORDS.proposed,
    client: DEAL_STAGE_WORDS.won
  };
  return track.map((s) => {
    const said = card ? card.steps.find((c) => c.key === s.key) : null;
    const own = !said && s.key === "consultation" && s.at === "done" ? held : null;
    return {
      key: s.key,
      label: label[s.key],
      day: said ? said.day : own ? own.day : null,
      word: said ? said.word : own ? own.word : null,
      at: s.at,
      tone: s.tone === "plain" ? null : s.tone
    };
  });
}
function closedStand(d, chip) {
  if (!chip) return null;
  return d.reason ? { words: `${d.word} \xB7 ${chip.words}`, tone: chip.tone } : chip;
}
export function pipelineSheetOf(row, p, nowMs, tz) {
  const d = row.deal;
  const held = p ? consultationStepOf(p, nowMs, tz) : null;
  const card = p && d && dealIsOpen(d) ? dealCardsOf(p, nowMs, tz).cards.find((c) => c.id === d.id) ?? null : null;
  const others = p && p.deals ? p.deals.filter((o) => o.id && o.id !== (d?.id ?? null) && dealIsOpen(o)).map((o) => ({ dealId: o.id, title: o.service ?? o.word, words: o.said })) : [];
  const base = { steps: stepsOf(row.track, card, held), others };
  if (card) {
    const asks = card.next?.id === "follow-up";
    const another = { act: { ...act("propose"), label: DEAL_CARD_WORDS.another }, dealId: null };
    return {
      ...base,
      card,
      stand: null,
      ask: asks ? { question: PIPELINE_WORDS.sheet.ask(shortName(row.name)), yes: act("won"), no: act("lost") } : null,
      lead: card.next ? { act: card.next, dealId: card.id } : null,
      more: [
        ...card.more.filter((m) => !asks || m.id !== "won" && m.id !== "lost").map((m) => ({ act: m, dealId: card.id })),
        another
      ]
    };
  }
  const ahead = !d && row.track[0]?.key === "consultation" && row.track[0].at === "current";
  const over = !d && held && row.chip ? { words: PIPELINE_WORDS.sheet.noProposal, tone: row.chip.tone } : null;
  const stand = ahead ? null : over ?? (d && !dealIsOpen(d) ? closedStand(d, row.chip) : row.chip);
  if (!p || d && dealIsOpen(d)) return { ...base, card: null, stand, ask: null, lead: null, more: [] };
  const lead = d && d.stage === "lost" ? { act: act("again"), dealId: d.id } : { act: act("propose", { service: consultedService(p) }), dealId: null };
  return { ...base, card: null, stand, ask: null, lead, more: [] };
}
