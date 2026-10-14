/**
 * The Leads surface's shapes (surface.ts): the view a page reads, and what the surface publishes for it. Apart from the
 * surface's reads and acts, so the page's types and its state read them without the module that fetches.
 */
import type {
  LeadChips,
  LeadClass,
  LeadCounts,
  LeadList,
  LeadMonthDto,
  LeadPileCountsDto,
  LeadRowVM,
  LeadSearchDto,
  LeadSort,
  LeadSuggestionsDto,
} from "@chanlytics/contracts";

export interface LeadsView {
  searchId: string | null;
  list: LeadList;
  cls: LeadClass | null;
  chips: Partial<LeadChips>;
  sort: LeadSort;
  dir: "asc" | "desc";
  /** The pile's list (sort pile, 00426): the list its adds go to, whose leads it puts with the decided. */
  pileList?: string | null;
}
export interface LeadsSurface {
  searches: LeadSearchDto[];
  counts: LeadCounts;
  rows: LeadRowVM[];
  next: { key: string; id: string } | null;
  /** How many rows a refresh found that are not drawn, under a sort that is not the order found. */
  offered: number;
  view: LeadsView;
  /** The view as a route, for the address and for Ask's citations: clients/leads:s-<search>:l-<list>. */
  route: string;
  suggestions: LeadSuggestionsDto | null;
  /** The month's standing (D5): what the workbench says a press costs. Null until a first page has answered. */
  month: LeadMonthDto | null;
  /** The pile's progress line (sort pile of one search, 00426), from whichever first page last answered one. */
  pile: LeadPileCountsDto | null;
  /**
   * The leads the peek read on their own because no page loaded holds them (PR 9: a link to a lead, one far down a
   * view), as rows: what the page's acts look a lead up in when it is not among `rows`. Never drawn as rows.
   */
  peeked: LeadRowVM[];
  tz: string;
  readFailed: boolean;
  fetchedAt: number;
  /** The cards that find leads now (00430 lead_cards_live): the people card's doors are drawn only once it is one. */
  cardsLive: readonly string[];
  /**
   * When the searches were last asked for (LeadsLoaded.readAt), epoch ms: the bell judges a lead question's kept notice only
   * by a read that began after it. fetchedAt is the publish time, which moves on a republish with no read.
   */
  readAt?: number;
}
