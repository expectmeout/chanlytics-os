/**
 * The shapes the Leads finder passes between the page and the plan panel (moved from legacy/pages/leads-real.jsx and
 * leads-finder.jsx, decision 0015): the panel's state, whose round a plan belongs to, the card Ask brought back, and the
 * strip's view model.
 */
import type { AskProposal, LeadIdeaDto, LeadPeoplePlan, LeadPlanFacts, LeadSearchPlan } from "@chanlytics/contracts";

/** The panel's stage: the answer row (answering only), Claude reading, the plan card, and the plan starting. */
export type FinderStage = "compose" | "thinking" | "plan" | "starting";

/**
 * Whose round a plan opened from a strip's next step belongs to: `answer: true` answers the question that is still
 * waiting (with what it carries to Ask), else it is another round on the same search.
 */
export interface FinderMore {
  searchId: string;
  purpose: "topup" | "renew";
  answer: boolean;
  threadId?: string | null;
  question?: string;
  name?: string;
  asked?: string;
  leavingOut?: string[];
}

/** A lead_search card's payload, as the panel reads it: the plan, the search it amends, its title and its facts. */
export interface LeadSearchCardPayload {
  plan?: LeadSearchPlan;
  amends?: { search_id: string } | null;
  view?: { title?: string } | null;
  facts?: LeadPlanFacts | null;
}

/** The card the panel holds: Ask's proposal, or a search's own plan to run again (Search again, changed). */
export type FinderProposal =
  | (Omit<AskProposal, "payload"> & { payload: LeadSearchCardPayload & Record<string, unknown> })
  | { searchId: string; plan: LeadSearchPlan; purpose: "renew"; payload?: undefined };

/** The plan panel's state, one value the page moves a step at a time. */
export interface FinderState {
  open: boolean;
  stage: FinderStage;
  words: string;
  proposal: FinderProposal | null;
  refusal: string | null;
  plan: LeadSearchPlan | null;
  trace: string | null;
  pick: string | null;
  more: FinderMore | null;
  /** The idea the plan was opened from (00398): a new search, started through the page's own door, with its kind's prior. */
  idea: LeadIdeaDto | null;
  /**
   * A people idea's plan (decision 0070), shown as its own card to approve as a places idea's is: the people card has
   * no places plan, so it is held apart from `plan`, and only an idea opens one here.
   */
  people: LeadPeoplePlan | null;
}

/** What the amend turn and the approve take of the panel: a setter for each field, the one close, and whose round it is. */
export interface FinderSet {
  close: () => void;
  stage: (stage: FinderStage) => void;
  words: (words: string) => void;
  trace: (trace: string | null) => void;
  refusal: (refusal: string | null) => void;
  proposal: (proposal: FinderProposal | null) => void;
  plan: (plan: LeadSearchPlan | null) => void;
  pick: (pick: string | null) => void;
  more: FinderMore | null;
  /** Whether the plan is an idea's, and so a new search of its own. */
  idea: boolean;
}

/** One strip's view model: what is true of a search's latest round, and its next steps. */
export interface StripAction {
  id: string;
  label: string;
  primary?: boolean;
  arg?: unknown;
  where?: string | null;
  pile?: boolean;
}
export interface StripVM {
  state: string;
  alert: boolean;
  title: string;
  parts: string[];
  progress: number | null;
  actions: StripAction[];
}
