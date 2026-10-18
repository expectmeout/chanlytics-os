import { foldName } from "../../calendar/service-offer.js";
import { visitDay } from "../../calendar/calendar-people.js";
import { visitStateOf } from "../../calendar/calendar-words.js";
import { clockDate } from "../../shared/clock.js";
import { DEAL_LINE_NONE, DEAL_STAGE_WORDS } from "../deal-words.js";
import { waitingOnProposal } from "../deal-waits.js";
import { consultationsWithoutProposal } from "../deal-consultations.js";
import { stateTone } from "../../shell/tone.js";
import { followUpWords } from "../../playbooks/playbooks.js";
import { act, consultedService, dealNextAct, followUpOn, sentOf } from "./deal-acts.js";
export const DEAL_CARD_WORDS = {
  title: "Deal",
  /** The person page's pane of them (canvas A): one row a deal, and the act under the rows for one more. */
  titleMany: "Deals",
  another: "Start another proposal",
  proposal: "Proposal",
  engagement: "Engagement",
  consultation: "Consultation",
  noLink: "No link yet",
  /** The opened deal's copy of its link, said in place once it has copied (the kit's copy, canvas A). */
  copyLink: "Copy the link",
  copied: "Copied",
  notSent: "Not sent yet",
  /** A message carrying the link is queued, in the seconds its send can be undone. */
  sending: "Sending",
  openLink: "Open the proposal in a new tab"
};
function sentWords(sent, tz, nowMs) {
  const at = Date.parse(sent.at);
  const day = Number.isFinite(at) ? ` ${clockDate(at, tz, nowMs)}` : "";
  const on = sent.via === "WhatsApp" ? " on WhatsApp" : sent.via === "Email" ? " by email" : sent.via === "Text" ? " as a text" : "";
  return `Sent${day}${on}`;
}
function consultationWas(atMs, tz, nowMs) {
  const day = visitDay(atMs, tz, nowMs);
  return `${DEAL_CARD_WORDS.consultation} was ${day === "Today" ? "today" : day}`;
}
function namesService(title, service) {
  const words = (s) => foldName(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const said = words(title);
  const named = words(service);
  return named.length > 0 && said.some((_, i) => named.every((w, j) => said[i + j] === w));
}
function consultedDealOf(p, open) {
  if ((p.consultedMs ?? null) === null && !p.consultationVisit) return null;
  const title = p.consultationTitle ?? "";
  return title && open.find((d) => !!d.service && namesService(title, d.service)) || open[0] || null;
}
function stepsOf(p, deal, tz, nowMs, consultation) {
  const day = (ms) => ms === null ? null : clockDate(ms, tz, nowMs);
  const won = deal.stage === "won";
  const tone = stateTone("deal", deal.stage);
  const steps = [];
  const consulted = p.consultedMs ?? null;
  if (consultation) {
    const done = consulted !== null && consulted <= nowMs;
    steps.push({
      key: "consultation",
      label: DEAL_CARD_WORDS.consultation,
      day: done ? day(consulted) : null,
      word: done ? visitStateOf(p.lastVisitLine?.mark ?? null, consulted, nowMs)?.text ?? null : null,
      at: done ? "done" : "ahead",
      tone: null
    });
  }
  steps.push({
    key: "proposal",
    label: DEAL_STAGE_WORDS.proposed,
    word: null,
    day: day(deal.proposedMs ?? (won ? null : deal.sinceMs)),
    at: won ? "done" : "current",
    tone: won ? null : tone
  });
  steps.push({
    key: "client",
    label: DEAL_STAGE_WORDS.won,
    word: null,
    day: won ? day(deal.sinceMs) : null,
    at: won ? "current" : "ahead",
    tone: won ? tone : null
  });
  return steps;
}
function cardOf(p, deal, nowMs, tz, consultation) {
  const won = deal.stage === "won";
  const next = dealNextAct(p, nowMs, deal);
  const facts = [];
  const flags = [];
  if (!won) {
    const sent = sentOf(p, deal);
    facts.push(
      !deal.proposal ? DEAL_CARD_WORDS.noLink : deal.proposal.sending ? DEAL_CARD_WORDS.sending : sent ? sentWords(sent, tz, nowMs) : DEAL_CARD_WORDS.notSent
    );
    if (deal.validUntil && !deal.validUntil.lapsed) facts.push(deal.validUntil.words);
    if (deal.validUntil?.lapsed) flags.push({ words: deal.validUntil.words, tone: "warn" });
    if ((sent || !deal.proposal) && waitingOnProposal({ deal, askedMs: p.askedMs ?? null }, nowMs, p.dealPace ?? null)) {
      const fu = followUpOn(p, deal);
      flags.push(
        fu?.kind === "will" ? { words: followUpWords(fu, tz, nowMs), tone: "info" } : { words: `Nothing back in ${deal.waitingDays ?? 0} days`, tone: "warn" }
      );
    }
  }
  const others = won ? [act("ended")] : [act("won"), act("lost"), act("edit")];
  const nextMode = next ? next.mode : null;
  return {
    id: deal.id,
    stage: won ? "won" : "proposed",
    title: deal.service ?? (won ? DEAL_CARD_WORDS.engagement : DEAL_CARD_WORDS.proposal),
    value: deal.amount,
    steps: stepsOf(p, deal, tz, nowMs, consultation),
    link: !won && deal.proposal ? { url: deal.proposal.url, host: deal.proposal.host } : null,
    facts,
    flags,
    // How long this workspace's proposals usually take, once five are decided (0008, amended): said beside the wait.
    pace: !won && p.dealPace ? p.dealPace.words : null,
    next,
    // Each move once: the one the card leads with is not said again among the quiet ones.
    more: others.filter((o) => o.mode !== nextMode),
    step: dealStepOf(p.noteList, deal.id)
  };
}
export function dealStepOf(notes, dealId) {
  if (!dealId) return null;
  const open = (notes ?? []).map((n, i) => ({ n, i, step: n.step })).filter(
    (x) => x.n.dealId === dealId && !!x.step && !x.step.done
  ).sort((a, b) => a.step.day.day.localeCompare(b.step.day.day) || b.i - a.i);
  const first = open[0];
  if (!first) return null;
  return {
    id: first.n.id,
    version: first.n.version,
    words: first.n.body,
    day: first.step.day,
    forWho: first.n.forWho,
    mine: first.n.mine
  };
}
function quietOf(p, nowMs, tz) {
  const deals = p.deals ?? (p.deal ? [p.deal] : []);
  const closed = [...deals].filter((d) => d.stage === "lost" || d.stage === "ended").sort((a, b) => (b.sinceMs ?? 0) - (a.sinceMs ?? 0))[0] ?? null;
  const consulted = p.consultedMs ?? null;
  const fresh = consulted !== null && consultationsWithoutProposal([{ consultedMs: consulted, deal: p.deal, nextVisitMs: p.nextVisitMs ?? null }], nowMs).length > 0;
  const sub = fresh && consulted !== null ? consultationWas(consulted, tz, nowMs) : null;
  if (!closed)
    return {
      words: DEAL_LINE_NONE,
      sub,
      act: act("propose", { service: consultedService(p) }),
      dealId: null,
      primary: fresh
    };
  const day = closed.sinceMs === null ? null : clockDate(closed.sinceMs, tz, nowMs);
  const said = closed.stage === "lost" ? [closed.service, day ? `${DEAL_STAGE_WORDS.lost} ${day}` : DEAL_STAGE_WORDS.lost, closed.reason?.words ?? null] : [closed.service, day ? `${DEAL_STAGE_WORDS.ended} ${day}` : DEAL_STAGE_WORDS.ended];
  const again = !fresh && closed.stage === "lost";
  return {
    words: said.filter((x) => !!x).join(" \xB7 "),
    sub,
    act: again ? act("again") : act("propose", { service: consultedService(p) }),
    dealId: again ? closed.id : null,
    primary: fresh
  };
}
export function dealCardsOf(p, nowMs, tz) {
  const deals = p.deals ?? (p.deal ? [p.deal] : []);
  const open = deals.filter((d) => d.stage === "proposed" || d.stage === "won");
  if (!open.length) return { cards: [], quiet: quietOf(p, nowMs, tz) };
  const consulted = consultedDealOf(p, open);
  return { cards: open.map((d) => cardOf(p, d, nowMs, tz, d === consulted)), quiet: null };
}
