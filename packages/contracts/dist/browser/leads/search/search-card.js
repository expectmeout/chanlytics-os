import { rec } from "../../ask-proposals/spec.js";
import { leadPlanAsk, leadPlanFactLine } from "../lead-plan.js";
import { peoplePlanAsk, peoplePlanFactLine, peoplePlanOf, peoplePlanRows } from "./people-plan.js";
import { lowerFirst, planArea, planWho } from "./sentence.js";
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
const answersOne = (payload) => {
  const am = rec(rec(payload).amends);
  return typeof am.search_id === "string" && !!am.search_id;
};
export const startsSearch = (p) => !p.plan && (p.kind === "lead_search" && !answersOne(p.payload) || p.kind === "people_search");
function leadPlanRows(plan) {
  const km = Math.round(plan.area.radius_m / 1e3);
  const place = plan.area.kind === "zip" && plan.area.zip ? `Near ${plan.area.zip}` : planArea(plan.area);
  const must = plan.criteria.map(
    (c) => `${cap(lowerFirst(c.text))}${c.standard === "seen" ? " (on its listing)" : ""}${c.required ? "" : ", nice to have"}`
  );
  return [
    { label: "Finds", value: cap(planWho(plan)) },
    { label: "Searched as", value: plan.terms.join(" \xB7 ") },
    { label: "Where", value: km > 0 ? `${place}, about ${km} km around` : place },
    { label: "How many", value: String(plan.count) },
    ...must.length ? [{ label: "Must have", value: must.join(" \xB7 ") }] : [],
    {
      label: "Leave out",
      value: [...plan.exclusions.map((e) => cap(lowerFirst(e.text))), "Anyone already yours"].join(" \xB7 ")
    },
    {
      label: "Shows first",
      value: plan.contact === "email" ? "The email, or the phone" : "The phone, or the email when it checks out"
    }
  ];
}
const isPlanFacts = (v) => typeof rec(v).leadsLeft === "number";
const monthOf = (v) => {
  const f = rec(v);
  return typeof f.leads_left === "number" ? { left: f.leads_left, renewsOn: typeof f.renews_on === "string" ? f.renews_on : "" } : null;
};
export function searchCardView(p) {
  const pl = rec(p.payload);
  if (p.kind === "lead_search" && !answersOne(pl) && pl.plan && typeof pl.plan === "object") {
    const plan = pl.plan;
    const facts = isPlanFacts(pl.facts) ? pl.facts : null;
    const ask = leadPlanAsk(plan, facts);
    const cannot = facts?.cannotSee && plan.criteria.some((c) => c.key === facts.cannotSee?.key && c.standard === "seen");
    const holds = [
      ...ask.covers ? [ask.covers] : [],
      ...cannot && facts?.cannotSee ? [
        `A listing doesn't show \u201C${facts.cannotSee.text}\u201D, so it can't be confirmed. Say \u201C${facts.cannotSee.likely}\u201D instead, or take it out.`
      ] : []
    ];
    return {
      sheet: { holds, rows: leadPlanRows(plan) },
      foot: leadPlanFactLine(plan, facts),
      source: null,
      press: { label: ask.label, disabled: ask.count < 1 || !!cannot },
      commit: { ...p, payload: { ...pl, plan: { ...plan, count: ask.count } } }
    };
  }
  if (p.kind === "people_search") {
    const plan = peoplePlanOf(pl.plan);
    if (!plan) return null;
    const month = monthOf(pl.facts);
    const ask = peoplePlanAsk(plan, month);
    const rights = rec(pl.facts).rights;
    return {
      sheet: { holds: ask.covers ? [ask.covers] : [], rows: peoplePlanRows(plan) },
      foot: peoplePlanFactLine(plan, month),
      source: typeof rights === "string" && rights ? rights : null,
      press: { label: ask.label, disabled: ask.count < 1 },
      commit: { ...p, payload: { ...pl, plan: { ...plan, count: ask.count } } }
    };
  }
  return null;
}
export const SEARCH_CARD_REPLACED = "Changed below.";
export const replacedOutcome = (atMs) => ({
  state: "dismissed",
  receipt: SEARCH_CARD_REPLACED,
  atMs,
  undo: null
});
export function searchCardsReplaced(earlier, made) {
  if (!made.some(startsSearch)) return [];
  return earlier.flatMap(
    (m) => (m.proposals ?? []).filter((p) => !p.outcome && startsSearch(p)).map((p) => ({ messageId: m.id, proposalId: p.id }))
  );
}
export function withIdeaCarried(earlier, made) {
  const fromIdea = earlier.some(
    (m) => (m.proposals ?? []).some((p) => !p.outcome && startsSearch(p) && rec(rec(p.payload).plan).from === "idea")
  );
  if (!fromIdea) return [...made];
  return made.map(
    (p) => startsSearch(p) && rec(p.payload).plan ? { ...p, payload: { ...p.payload, plan: { ...rec(rec(p.payload).plan), from: "idea" } } } : p
  );
}
export function withAnswerLanded(messages, landed, atMs) {
  const gone = new Set(searchCardsReplaced(messages, landed.proposals ?? []).map((r) => r.proposalId));
  const kept = gone.size ? messages.map(
    (m) => (m.proposals ?? []).some((p) => gone.has(p.id)) ? { ...m, proposals: m.proposals.map((p) => gone.has(p.id) ? { ...p, outcome: replacedOutcome(atMs) } : p) } : m
  ) : [...messages];
  return [...kept, landed];
}
function placesAskOf(plan) {
  const a = plan.area;
  const where = a.kind === "zip" && a.zip ? { zip: a.zip, region: a.state } : { city: planArea(a).replace(new RegExp(`,\\s*${a.state}$`), ""), region: a.state };
  return {
    looking_for: "local_businesses",
    country: "US",
    count: plan.count,
    who: planWho(plan),
    ...plan.category_key ? { category_key: plan.category_key } : {},
    terms: plan.terms,
    ...where,
    contact: plan.contact,
    criteria: plan.criteria.map((c) => ({ text: c.text, standard: c.standard, required: c.required })),
    leave_out: plan.exclusions.map((e) => ({ words: e.text })),
    asked: plan.asked
  };
}
function peopleAskOf(raw) {
  const p = peoplePlanOf(raw);
  if (!p) return null;
  return {
    looking_for: "people_at_companies",
    country: "US",
    count: p.count,
    who: p.name,
    terms: p.titles,
    region: p.states.length ? p.states.join(", ") : "US",
    seniority: p.seniority,
    industries: p.industries,
    keywords: p.keywords ?? [],
    company_sizes: p.sizes,
    asked: p.asked
  };
}
export function waitingSearchWords(waiting) {
  const card = [...waiting].reverse().find(startsSearch);
  if (!card) return null;
  const pl = rec(card.payload);
  const ask = card.kind === "people_search" ? peopleAskOf(pl.plan) : pl.plan ? placesAskOf(pl.plan) : null;
  if (!ask) return null;
  return `A search card waits in this thread for their press, \u201C${card.title}\u201D (${card.id}), planned as find would take it: ${JSON.stringify(ask)}. When they change it, call find again with this plan, changed only where they said (keep its words, place, criteria and what it leaves out otherwise; a places plan names who_one too): the new card replaces this one. Answer about it from this, without reading it again.`;
}
