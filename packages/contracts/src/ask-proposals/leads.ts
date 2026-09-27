/**
 * The lead finder's card: a search planned in Ask, or the answer to a search that stopped to ask.
 */
import { leadQuestionRoute, leadsRoute } from "../leads/leads";
import { asText, idIn, rec, type ProposalSpecAboveOperator } from "./spec";

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
    const plan = (pl.plan ?? {}) as { count?: number; terms?: string[] };
    return `Finding ${plan.count ?? ""} ${plan.terms?.[0] ?? "businesses"}. It carries on if you leave; Leads shows it.`.replace(
      /\s+/g,
      " ",
    );
  },
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
