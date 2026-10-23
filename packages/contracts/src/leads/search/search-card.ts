/**
 * A search's card in Ask (lead_search, people_search), the one way a new search is planned and approved (Ruben, 23 Oct
 * 2026: an idea opens Ask with its card, and a change is said to Ask, which updates the card): what it finds as rows,
 * what its one press asks for within the month, the line under it, which earlier card a new one replaces, and the card
 * waiting in a thread as the model is told it. Derived here once, for the Line that draws the card, the route that saves
 * the turn and the turn that is told it. Pure, and read in the browser.
 */
import type { AskCardSheet, AskMessageVM, AskProposal, AskProposalOutcome } from "../../ask/ask";
import { rec } from "../../ask-proposals/spec";
import type { LeadPlanFacts } from "../lead-dtos";
import { leadPlanAsk, leadPlanFactLine } from "../lead-plan";
import { peoplePlanAsk, peoplePlanFactLine, peoplePlanOf, peoplePlanRows, type PeopleMonth } from "./people-plan";
import type { LeadSearchPlan } from "./plan";
import { lowerFirst, planArea, planWho } from "./sentence";

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** Whether a card answers a search that stopped to ask (spec G4) rather than starting one. */
const answersOne = (payload: unknown): boolean => {
  const am = rec(rec(payload).amends);
  return typeof am.search_id === "string" && !!am.search_id;
};

/**
 * A card that starts a new search: a places search that answers none, or a people search. A step of one of Ask's plans
 * (`plan`) is the plan's to press, never one of these.
 */
export const startsSearch = (p: Pick<AskProposal, "kind" | "payload" | "plan">): boolean =>
  !p.plan && ((p.kind === "lead_search" && !answersOne(p.payload)) || p.kind === "people_search");

/**
 * A places plan as the rows its card draws: who it finds, the words Google Maps is searched with, where and how far
 * around, how many, what each must have (on its listing, or read from its site; a nice-to-have only ranks it), what it
 * leaves out (and anyone already the owner's), and which contact shows first.
 */
function leadPlanRows(plan: LeadSearchPlan): Array<{ label: string; value: string }> {
  const km = Math.round(plan.area.radius_m / 1000);
  // A ZIP's area is said as it is searched, near it; a city or a state by its name.
  const place = plan.area.kind === "zip" && plan.area.zip ? `Near ${plan.area.zip}` : planArea(plan.area);
  const must = plan.criteria.map(
    (c) =>
      `${cap(lowerFirst(c.text))}${c.standard === "seen" ? " (on its listing)" : ""}${c.required ? "" : ", nice to have"}`,
  );
  return [
    { label: "Finds", value: cap(planWho(plan)) },
    { label: "Searched as", value: plan.terms.join(" · ") },
    { label: "Where", value: km > 0 ? `${place}, about ${km} km around` : place },
    { label: "How many", value: String(plan.count) },
    ...(must.length ? [{ label: "Must have", value: must.join(" · ") }] : []),
    {
      label: "Leave out",
      value: [...plan.exclusions.map((e) => cap(lowerFirst(e.text))), "Anyone already yours"].join(" · "),
    },
    {
      label: "Shows first",
      value: plan.contact === "email" ? "The email, or the phone" : "The phone, or the email when it checks out",
    },
  ];
}

/** What a search's card draws and what its press sends: its rows, the line under them, the press and the plan it posts. */
export interface SearchCardView {
  sheet: AskCardSheet;
  /** How long, what it uses of the month, what it skips: one line under the rows. */
  foot: string;
  /** Where a people search's people come from, said before anything is spent; null for a places search. */
  source: string | null;
  /** The one press: what it says, and whether it can be pressed. */
  press: { label: string; disabled: boolean };
  /** The card as its press commits it: the count the month has room for, and nothing else changed. */
  commit: AskProposal;
}

/** Whether a card's facts are a places plan's, as its builder read them (planFacts): they say how many leads are left. */
const isPlanFacts = (v: unknown): v is LeadPlanFacts => typeof rec(v).leadsLeft === "number";

/** A people card's month as its builder read it: the leads left, and the day they renew where it said. */
const monthOf = (v: unknown): PeopleMonth | null => {
  const f = rec(v);
  return typeof f.leads_left === "number"
    ? { left: f.leads_left, renewsOn: typeof f.renews_on === "string" ? f.renews_on : "" }
    : null;
};

/**
 * A search's card as the Line draws it, or null for any other card. The press asks for what the month has room for
 * (leadPlanAsk, peoplePlanAsk) and the rows' first hold says why when that is fewer than the plan's count; a criterion
 * the listing cannot show holds the press until it is said another way, in Ask. The plan's version is never touched: a
 * new search starts at its first (lead_search_create).
 */
export function searchCardView(p: AskProposal): SearchCardView | null {
  const pl = rec(p.payload);
  if (p.kind === "lead_search" && !answersOne(pl) && pl.plan && typeof pl.plan === "object") {
    const plan = pl.plan as LeadSearchPlan;
    const facts = isPlanFacts(pl.facts) ? pl.facts : null;
    const ask = leadPlanAsk(plan, facts);
    const cannot =
      facts?.cannotSee && plan.criteria.some((c) => c.key === facts.cannotSee?.key && c.standard === "seen");
    const holds = [
      ...(ask.covers ? [ask.covers] : []),
      ...(cannot && facts?.cannotSee
        ? [
            `A listing doesn't show “${facts.cannotSee.text}”, so it can't be confirmed. Say “${facts.cannotSee.likely}” instead, or take it out.`,
          ]
        : []),
    ];
    return {
      sheet: { holds, rows: leadPlanRows(plan) },
      foot: leadPlanFactLine(plan, facts),
      source: null,
      press: { label: ask.label, disabled: ask.count < 1 || !!cannot },
      commit: { ...p, payload: { ...pl, plan: { ...plan, count: ask.count } } },
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
      commit: { ...p, payload: { ...pl, plan: { ...plan, count: ask.count } } },
    };
  }
  return null;
}

/** What a card a newer one replaced says it became. */
export const SEARCH_CARD_REPLACED = "Changed below.";

/** The outcome a replaced card is kept with: set aside, never pressed, its receipt the words above. */
export const replacedOutcome = (atMs: number): AskProposalOutcome => ({
  state: "dismissed",
  receipt: SEARCH_CARD_REPLACED,
  atMs,
  undo: null,
});

/**
 * The cards of a thread a turn's new search card replaces: once a turn makes a card that starts a search, every earlier
 * one that starts a search and still waits is set aside, so one search card in a thread can be pressed, the newest (a
 * change said to Ask made a second card while the first could still start its own search).
 */
export function searchCardsReplaced(
  earlier: ReadonlyArray<Pick<AskMessageVM, "id" | "proposals">>,
  made: ReadonlyArray<Pick<AskProposal, "kind" | "payload" | "plan">>,
): Array<{ messageId: string; proposalId: string }> {
  if (!made.some(startsSearch)) return [];
  return earlier.flatMap((m) =>
    (m.proposals ?? [])
      .filter((p) => !p.outcome && startsSearch(p))
      .map((p) => ({ messageId: m.id, proposalId: p.id })),
  );
}

/**
 * A turn's cards, the idea's mark kept (plan.from): a card that replaces one an idea made is still that idea followed,
 * however it was changed in Ask before it started (the ideas' own measure of whether they are followed, 00398).
 */
export function withIdeaCarried<P extends Pick<AskProposal, "kind" | "payload" | "plan">>(
  earlier: ReadonlyArray<Pick<AskMessageVM, "proposals">>,
  made: readonly P[],
): P[] {
  const fromIdea = earlier.some((m) =>
    (m.proposals ?? []).some((p) => !p.outcome && startsSearch(p) && rec(rec(p.payload).plan).from === "idea"),
  );
  if (!fromIdea) return [...made];
  return made.map((p) =>
    startsSearch(p) && rec(p.payload).plan
      ? { ...p, payload: { ...p.payload, plan: { ...rec(rec(p.payload).plan), from: "idea" } } }
      : p,
  );
}

/** A conversation's turns with the answer that landed after them, the cards it replaced set aside (searchCardsReplaced). */
export function withAnswerLanded<M extends Pick<AskMessageVM, "id" | "proposals">>(
  messages: readonly M[],
  landed: M,
  atMs: number,
): M[] {
  const gone = new Set(searchCardsReplaced(messages, landed.proposals ?? []).map((r) => r.proposalId));
  const kept = gone.size
    ? messages.map((m) =>
        (m.proposals ?? []).some((p) => gone.has(p.id))
          ? { ...m, proposals: m.proposals.map((p) => (gone.has(p.id) ? { ...p, outcome: replacedOutcome(atMs) } : p)) }
          : m,
      )
    : [...messages];
  return [...kept, landed];
}

/**
 * A plan as find takes it (propose_lead_search's input), so a change said to Ask is the same plan with that change: the
 * card's own words, the area as a city and its state or a ZIP, each criterion and what it leaves out.
 */
function placesAskOf(plan: LeadSearchPlan): Record<string, unknown> {
  const a = plan.area;
  const where =
    a.kind === "zip" && a.zip
      ? { zip: a.zip, region: a.state }
      : { city: planArea(a).replace(new RegExp(`,\\s*${a.state}$`), ""), region: a.state };
  return {
    looking_for: "local_businesses",
    country: "US",
    count: plan.count,
    who: planWho(plan),
    ...(plan.category_key ? { category_key: plan.category_key } : {}),
    terms: plan.terms,
    ...where,
    contact: plan.contact,
    criteria: plan.criteria.map((c) => ({ text: c.text, standard: c.standard, required: c.required })),
    leave_out: plan.exclusions.map((e) => ({ words: e.text })),
    asked: plan.asked,
  };
}

/** A people plan as find takes it: its titles, its states (none is the US), and the directory's own filters. */
function peopleAskOf(raw: unknown): Record<string, unknown> | null {
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
    asked: p.asked,
  };
}

/**
 * The search card waiting in a thread for its press, as the turn's words tell the model of it, or null where none waits:
 * its title and its plan as find takes it. A cold turn knew it by its title alone and planned a change again from that,
 * losing what the card must have, leaves out and is searched as; so a change is find again with this plan, changed only
 * where the person said, and the new card replaces this one.
 */
export function waitingSearchWords(waiting: readonly AskProposal[]): string | null {
  const card = [...waiting].reverse().find(startsSearch);
  if (!card) return null;
  const pl = rec(card.payload);
  const ask =
    card.kind === "people_search" ? peopleAskOf(pl.plan) : pl.plan ? placesAskOf(pl.plan as LeadSearchPlan) : null;
  if (!ask) return null;
  return `A search card waits in this thread for their press, “${card.title}” (${card.id}), planned as find would take it: ${JSON.stringify(ask)}. When they change it, call find again with this plan, changed only where they said (keep its words, place, criteria and what it leaves out otherwise; a places plan names who_one too): the new card replaces this one. Answer about it from this, without reading it again.`;
}
