/**
 * Where the rail's rows, the view's own controls and the strip's steps go (moved from legacy/pages/leads-real.jsx,
 * decision 0015): the address of the view with one thing changed, and each step of the strip through its route.
 */
import {
  leadsRoute,
  planVersionOf,
  type LeadClass,
  type LeadList,
  type LeadPeoplePlan,
  type LeadSearchDto,
  type LeadSearchPlan,
} from "@chanlytics/contracts";
import { railToggle } from "../../people/rail/rail-kit";
import { LEAD_ROUND_MAKERS, leadStrip } from "../finder/strip";
import type { FinderState } from "../finder/types";
import { answerSearch, leadsTakeOffered, stopSearch } from "../surface";
import type { LeadAnswer } from "./acts";
import type { LeadsNav } from "./peek-hooks";
import type { LeadView } from "./state";
import type { ReactNode } from "react";

type ViewPatch = { searchId?: string | null; list?: LeadList; cls?: LeadClass | null };

export const leadRailRoutes = ({
  leadView,
  nav,
  searchById,
}: {
  leadView: LeadView;
  nav: LeadsNav;
  searchById: (id: string | null) => LeadSearchDto | null;
}) => {
  const goto = (patch: ViewPatch) =>
    nav(leadsRoute({ searchId: leadView.searchId, list: leadView.list, cls: leadView.cls, ...patch }));
  // Where a rail row's press goes (railToggle: one row at a time; the picked row pressed again shows all leads). On a
  // phone the rail is a sheet, and a press opens the row and nothing else: the sheet closes on it, so a press that went
  // back to All leads would close the sheet on a page the owner did not ask for (Ruben, 25 Sep).
  const pickListRoute = (id: string, open = false) =>
    leadsRoute({
      searchId: null,
      list: ((open ? id : railToggle(leadView.searchId ? null : leadView.list, id as LeadList)) || "all") as LeadList,
      cls: null,
    });
  // A search waiting on its question opens on the places the question is about (a question is only ever asked about
  // places left out); its counted view is empty while it waits.
  const waitsOn = (id: string | null) => {
    const s = id ? searchById(id) : null;
    return !!(s && s.round && s.round.state === "waiting_on_owner");
  };
  const pickSearchRoute = (id: string, open = false) => {
    const to = open ? id : railToggle(leadView.searchId, id);
    return leadsRoute({ searchId: to, list: "all", cls: to && waitsOn(to) ? "excluded" : null });
  };
  return { goto, pickListRoute, waitsOn, pickSearchRoute };
};
export type RailRoutes = ReturnType<typeof leadRailRoutes>;

const isPlan = (arg: unknown): arg is LeadSearchPlan =>
  !!arg && typeof arg === "object" && "version" in arg && !!arg.version;
const searchIdOf = (arg: unknown): string | null =>
  arg && typeof arg === "object" && "searchId" in arg && typeof arg.searchId === "string" ? arg.searchId : null;

/**
 * What each strip control does (Task 10 step 6). Every act goes out through its route; the six that would make a new
 * round open the plan card instead, because nothing that counts against the month may start without the owner approving
 * what runs.
 */
export const leadStripActs = (a: {
  openSearch: LeadSearchDto | null;
  leadAct: (fn: () => Promise<LeadAnswer>, said: ReactNode) => Promise<void>;
  searchAnswerOf: (s: LeadSearchDto) => Omit<NonNullable<FinderState["more"]>, "searchId" | "purpose">;
  openPlanFor: (s: LeadSearchDto, plan: LeadSearchPlan, how: "answer" | "more") => void;
  goto: (patch: ViewPatch) => void;
  undoRound: (searchId: string | null | undefined) => Promise<void>;
  setSortBy: (by: string) => void;
  setSortDir: (dir: string) => void;
  openFinder: (card: Partial<FinderState>) => void;
  /** Find people, filled in with a people search's plan: its strip's Find more like these (00429). */
  openFindPeople: (from?: LeadPeoplePlan | null) => void;
}) => {
  const { openSearch, leadAct, searchAnswerOf, openPlanFor, goto, undoRound, setSortBy, setSortDir, openFinder } = a;
  // "12 new": the view read again in its order. The strip's door and the list head's are this one.
  const takeOffered = () => leadsTakeOffered();
  const onStripAction = (id: string, arg?: unknown) => {
    const s = openSearch;
    if (!s) return undefined;
    if (id === "stop")
      return leadAct(() => stopSearch(s.id), <>Stopping. The emails of what was found are still being checked.</>);
    if (id === "keep") return leadAct(() => answerSearch(s.id, "keep"), <>Carrying on.</>);
    if (id === "stop_here")
      return leadAct(() => answerSearch(s.id, "stop"), <>Stopped. The ones already found are yours.</>);
    // The no that changes the search: the plan panel opens its answer row under the question, empty; what comes back from
    // Ask is a card that amends this search, and approving it commits through Ask's door, which answers the round; it
    // never starts a second search.
    if (id === "change") {
      openFinder({
        stage: "compose",
        words: "",
        proposal: null,
        plan: null,
        more: { searchId: s.id, purpose: "topup", ...searchAnswerOf(s) },
      });
      return undefined;
    }
    if (id === "excluded" || id === "review") return goto({ cls: arg as LeadClass });
    // "12 new", Sort by fit and the round's undo need no plan, whatever the search.
    if (id === "take_offered") return takeOffered();
    if (id === "undo") return undoRound(searchIdOf(arg));
    // Sort by fit is a new read of the same view, not a re-order of the rows on the page: the sort is the page's own
    // state and the read asks the surface for it (E8).
    if (id === "sort_fit") {
      setSortBy("fit");
      setSortDir("asc");
      return undefined;
    }
    // A people search's next step is its own sheet, filled in with its plan (00429): never a places door.
    if (id === "people_more") {
      a.openFindPeople(s.people ?? null);
      return undefined;
    }
    const plan = s.plan;
    if (!plan) return undefined;
    // Include takes the thing it asked about back out of the plan, which planVersionOf makes a new version of: the plan
    // goes as the owner approved it; the route sets the version and the count the round reserved (G1).
    if (id === "include")
      return openPlanFor(
        s,
        planVersionOf(plan, { exclusions: plan.exclusions.filter((x) => x.key !== arg) }),
        "answer",
      );
    if (LEAD_ROUND_MAKERS.indexOf(id) >= 0) return openPlanFor(s, isPlan(arg) ? arg : plan, "more");
    return undefined;
  };
  return { ldStrip: leadStrip, takeOffered, onStripAction };
};
export type StripActs = ReturnType<typeof leadStripActs>;
