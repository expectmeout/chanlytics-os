/**
 * The lead finder's cards: a search planned in Ask, or the answer to a search that stopped to ask; and leads added to a
 * reach-out fed by a list (00426), whose first email still waits for its owner's say on its run (a card never approves
 * a run).
 */
import { leadQuestionRoute, leadsRoute } from "../leads/leads";
import type { LeadSearchPlan } from "../leads/search/plan";
import { planWho } from "../leads/search/sentence";
import { SEQUENCES_ROUTE, sequenceRoute } from "../sequences/sequence-address";
import { asText, idIn, rec, type ProposalSpec, type ProposalSpecAboveOperator } from "./spec";

/** The search a lead card answers (spec G4), when it answers one rather than starting its own. */
const amendsOf = (pl: Record<string, unknown> | undefined): { search_id: string; name?: unknown } | null => {
  const am = (pl?.amends ?? null) as { search_id?: unknown; name?: unknown } | null;
  return am && typeof am.search_id === "string" && am.search_id ? (am as { search_id: string; name?: unknown }) : null;
};

export const leadSearchSpec: ProposalSpecAboveOperator = {
  needs: "partner",
  doing: "start a lead search",
  gate: "find",
  commit: ({ payload: pl }) => {
    const am = amendsOf(pl);
    // The card answers the search that asked (spec G4): the route sets the answer's version and count.
    if (am)
      return {
        route: "POST lead-searches/[id]/answer",
        params: { id: am.search_id },
        body: { answer: "include", plan: pl.plan },
      };
    // The thread the card was planned in rides beside the plan (the Ask route set it on the card), so the search keeps
    // it and the answer to its question lands there (00172). A card from before has none.
    const threadId = typeof pl.thread_id === "string" && pl.thread_id ? pl.thread_id : null;
    return { route: "POST lead-searches", body: threadId ? { ...(pl.plan as object), thread_id: threadId } : pl.plan };
  },
  receipt: ({ payload: pl }) => {
    const am = amendsOf(pl);
    if (am) return `Answered. ${asText(am.name) || "The search"} carries on with your answer; Leads shows it.`;
    const plan = (pl.plan ?? {}) as Partial<LeadSearchPlan>;
    // Who it finds as the card said them ("law firms"), not the first word it is searched with ("law firm").
    const who =
      plan.name && plan.area && plan.terms && plan.criteria ? planWho(plan as LeadSearchPlan) : plan.terms?.[0];
    return `Finding ${plan.count ?? ""} ${who ?? "businesses"}. It carries on if you leave; Leads shows it.`.replace(
      /\s+/g,
      " ",
    );
  },
  // The search it started (an answer started none), for a later step of Ask's plan that names it: a follow-up on it.
  made: ({ payload }, data) => (amendsOf(payload) ? null : idIn(rec(data), "search_id")),
  undo: {
    // An answer carries the round on; there is nothing to undo (Stop is the strip's).
    label: ({ payload }) => (amendsOf(payload) ? null : "Stop the search"),
    window: "ten_minutes",
    record: (p, data) => (amendsOf(p.payload) ? null : { search_id: rec(data).search_id }),
    // An operator's route undoing a partner's card: stopping a search spends nothing (route-policy.json).
    call: (u) => ({ route: "POST lead-searches/[id]/stop", params: { id: asText(u.search_id) } }),
    receipt: () => "Stopping. Whatever it found is kept, and the emails already found are still checked.",
  },
  open: ({ payload }, outcome) => {
    // A card that answers a search opens on that search, on the pile it asked about; a card approved opens on the
    // search it made, which the commit kept for its undo.
    const am = amendsOf(payload);
    if (am) return leadQuestionRoute(am.search_id);
    const sid = idIn(rec(outcome?.undo), "search_id");
    return sid ? leadsRoute({ searchId: sid, list: "all", cls: null }) : "clients/leads";
  },
};

/**
 * A people search planned in Ask (the people card, 00430): the owner's or a partner's, as a places search is, and
 * committed through its own door (POST lead-searches/people), with the thread it was planned in. A people search never
 * stops to ask, so a card only starts one; its undo stops it, as a places search's does.
 */
export const peopleSearchSpec: ProposalSpecAboveOperator = {
  needs: "partner",
  doing: "start a people search",
  gate: "find",
  commit: ({ payload: pl }) => {
    const threadId = typeof pl.thread_id === "string" && pl.thread_id ? pl.thread_id : null;
    return { route: "POST lead-searches/people", body: { plan: pl.plan, via: "ask", thread_id: threadId } };
  },
  receipt: ({ payload: pl }) => {
    const plan = (pl.plan ?? {}) as { count?: number; name?: string };
    const n = typeof plan.count === "number" ? plan.count : null;
    // The count is companies, as the card and the sheet say it.
    const what = n === null ? "companies" : `${n} ${n === 1 ? "company" : "companies"}`;
    return `Finding up to ${what}${plan.name ? `: ${plan.name}` : ""}. Each lands on Leads once its address checks out.`;
  },
  undo: {
    label: () => "Stop the search",
    window: "ten_minutes",
    record: (_p, data) => ({ search_id: rec(data).search_id }),
    call: (u) => ({ route: "POST lead-searches/[id]/stop", params: { id: asText(u.search_id) } }),
    receipt: () => "Stopping. Whatever it found is kept, and the addresses already found are still checked.",
  },
  open: (_p, outcome) => {
    const sid = idIn(rec(outcome?.undo), "search_id");
    return sid ? leadsRoute({ searchId: sid, list: "all", cls: null }) : "clients/leads";
  },
};

/**
 * Leads added to a reach-out fed by a list (00426 reach_out_add): an operator's, as the add door is. The add itself sends
 * nothing: its reach-out's next run plans the first email, and that run waits for its owner's say (a list-fed one always
 * does), so the receipt says so. Undo takes them back off the list, while nothing has left for them (lead_undo).
 */
export const reachOutAddSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => ({
    route: "POST reach-outs/[id]/leads",
    params: { id: asText(pl.root_id) },
    body: { lead_ids: Array.isArray(pl.lead_ids) ? pl.lead_ids.filter((x) => typeof x === "string") : [] },
  }),
  receipt: ({ payload: pl }, data) => {
    const added = Number(rec(data).added ?? 0);
    const name = asText(pl.name) || "the sequence";
    return added > 0
      ? `Added ${added === 1 ? "1 lead" : `${added} leads`} to “${name}”. Nothing goes to them until you give its next batch your OK.`
      : `None could be added to “${name}”.`;
  },
  undo: {
    label: () => "Take them back",
    window: "ten_minutes",
    record: (_p, data) => {
      const d = rec(data);
      return typeof d.op_id === "string" ? { op_id: d.op_id, version: Number(d.version ?? 1) } : null;
    },
    call: (u) => ({
      route: "POST lead-operations/[id]/undo",
      params: { id: asText(u.op_id) },
      body: { version: Number(u.version ?? 1) },
    }),
    receipt: () => "Taken back off its list. Nothing had been written to them.",
  },
  open: ({ payload }) => {
    const id = idIn(payload, "root_id");
    return id ? sequenceRoute(id) : SEQUENCES_ROUTE;
  },
};
