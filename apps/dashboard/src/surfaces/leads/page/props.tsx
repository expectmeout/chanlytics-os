/**
 * What LeadsScope is handed, in its order (moved from legacy/pages/leads-real.jsx, decision 0015): the rail, the list's
 * head and the table; the band, the map, the bench and the list's empty state; the selection and its bulk bar, and the
 * rail's doors; a kept search's acts, the plan panel and the peek; the strip, the next page and the first day.
 */
import type { RefObject } from "react";
import {
  isLeadList,
  type leadBand,
  leadMapPlot,
  leadKindKey,
  leadMonthPlanFacts,
  leadReviewGroups,
  leadsRoute,
  type leadsStanding,
  type LeadArea,
  type LeadClass,
  type LeadIdeaDto,
  type LeadRowVM,
  type LeadSearchDto,
  type LeadSearchPlan,
  type LeadsBulkInput,
} from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import type { usePlControls } from "../../people/hooks/use-controls";
import type { usePlPlace } from "../../people/hooks/use-place";
import type { PeopleRead, TableEmpty } from "../../people/types";
import type { ReviewDoors } from "../bench/types";
import type { LeadCellCtx } from "../cells/types";
import {
  bulkLeads,
  checkLeadsAgain,
  peekVMFor,
  readSuggestions,
  warmLeadsView as warmView,
  type LeadsSurface,
} from "../surface";
import { ReachOutLeadsStrip, type ReachOutLines } from "../reach-out/lines";
import type { LeadLists } from "../reach-out/lists";
import type { LeadRail } from "../scope/rail";
import type { LeadActs } from "./acts";
import type { LeadsNav } from "./peek-hooks";
import type { RailRoutes, StripActs } from "./routes";
import type { FinderActs, SearchActs } from "./search-acts";
import type { LeadsState, LeadView } from "./state";

type Controls = ReturnType<typeof usePlControls<LeadRowVM, LeadCellCtx>>;
type Place = Pick<ReturnType<typeof usePlPlace>, "cursor" | "setCursor" | "rowBudget" | "toggleAll">;

/** Everything the page holds this draw, as one bag the five builders read. */
export type LeadsPage = Controls &
  LeadsState &
  LeadActs &
  FinderActs &
  SearchActs &
  RailRoutes &
  StripActs &
  Place & {
    people: PeopleRead;
    leads: LeadsSurface;
    /** The table's element for the kit's swap rise (kit/motion): the rows rise as a view's rows land. */
    swap: RefObject<HTMLTableElement | null>;
    nav: LeadsNav;
    onOpenProfile: (id: string) => void;
    leadView: LeadView;
    leadShown: LeadRowVM[];
    filtered: boolean;
    shownIds: string[];
    viewLanded: boolean;
    deckMove: (step: number) => void;
    closePeek: () => void;
    leadsMore: () => Promise<void>;
    leadsMoreBusy: boolean;
    rail: LeadRail;
    standing: ReturnType<typeof leadsStanding>;
    openSearch: LeadSearchDto | null;
    band: ReturnType<typeof leadBand>;
    cellCtxLeads: LeadCellCtx;
    reachOut: ReachOutLines | null;
    lists: LeadLists;
  };

/**
 * A phone's Select walks a selection as People's does (people/page/screen.tsx selectStep; Ruben, 10 Oct 2026): Select
 * starts one, Select all then takes every lead shown, and once they all are (or all that match), Cancel ends it.
 */
const leadsSelectStep = (p: LeadsPage) => {
  const { phone, selectMode, sel, leadShown, allMatching, setSel, setAllMatching } = p;
  const selecting = (phone && selectMode) || leadShown.some((l) => sel.has(l.id));
  if (!selecting) return { word: "Select", press: () => p.setSelectMode(true) };
  if (allMatching || leadShown.every((l) => sel.has(l.id))) return { word: "Cancel", press: p.clearSelection };
  return {
    word: "Select all",
    press: () => {
      setSel(new Set(leadShown.map((l) => l.id)));
      setAllMatching(false);
    },
  };
};

/** The sorts a phone's Leads offers, as a desk's headings give them (leads_page's p_sort); Nearest where a search has a centre. */
const LD_PHONE_SORTS: readonly { by: string; dir: "asc" | "desc"; label: string; near?: boolean }[] = [
  { by: "fit", dir: "asc", label: "Best fit first" },
  { by: "rating", dir: "desc", label: "Highest rated first" },
  { by: "found", dir: "desc", label: "Newest found first" },
  { by: "distance", dir: "asc", label: "Nearest first", near: true },
  { by: "business", dir: "asc", label: "Name, A to Z" },
];
const leadsSortItems = (p: LeadsPage) =>
  LD_PHONE_SORTS.filter((s) => !s.near || p.cellCtxLeads.hasCenter).map((s) => ({
    label: s.label,
    checked: p.sortBy === s.by && p.sortDir === s.dir,
    onClick: () => p.pickSort(s.by, s.dir),
  }));

/** A list of your own (Reach out Part 7, 00242: `via` import or chosen): no area to draw or widen, and no round strip. */
const isOwnList = (s: LeadSearchDto | null) => isLeadList(s);

/** The rail, the list's head and the table. */
export const leadsListProps = (p: LeadsPage) => {
  const {
    leads,
    rail,
    leadView,
    openSearch,
    leadShown,
    reachOut,
    lists,
    setListsOpen,
    setQ,
    setChip,
    setFitChip,
    goto,
  } = p;
  // What the phone's bar says it is showing: the search that is open, or the list, and its count apart, which the bar never
  // shortens (Task 18; PeoplePhoneBar's listCount).
  const openList = rail.lists.find((l) => l.id === leadView.list);
  const railLabel = openSearch ? openSearch.name : openList ? openList.label : "All leads";
  const railCount = openSearch ? (openSearch.round ? openSearch.round.counted : 0) : openList ? openList.count : null;
  return {
    surface: leads,
    // The ideas, less any the workspace is already searching for in that place (a search started since they were
    // written, or one the ideas were written beside): the server writes new ones once that round ends.
    ideas: leads.suggestions
      ? { ...leads.suggestions, items: leads.suggestions.items.filter((i) => !searchedAlready(i, leads.searches)) }
      : null,
    rail,
    railLabel,
    railCount,
    listTitle: openList ? openList.label : "All leads",
    listsOpen: p.listsOpen,
    onLists: () => setListsOpen(true),
    onCloseLists: () => setListsOpen(false),
    standing: p.standing,
    view: leadView,
    search: openSearch,
    strip:
      lists.stripOf(openSearch) ||
      (!isOwnList(openSearch) ? p.ldStrip(openSearch, new Date(), { offered: leads.offered }) : null),
    reachOutStrip: openSearch && reachOut ? <ReachOutLeadsStrip leads={reachOut} /> : null,
    rows: leadShown,
    swapRef: p.swap,
    rowBudget: p.rowBudget,
    phone: p.phone,
    // The rows drawn are the last view's, or its last order, until the surface holds the one the address names in the
    // order asked (a view read before paints at once; one not yet read is on its way): said, not left looking right and
    // being wrong.
    loading: !p.viewLanded,
    total: leads.counts[leadView.list] ?? leads.counts.all,
    columns: p.columns,
    layout: p.layout,
    colOptions: p.colOptions,
    onPickColumn: p.pickColumn,
    cellCtx: p.cellCtxLeads,
    sortBy: p.sortBy,
    sortDir: p.sortDir,
    onSort: p.onSort,
    // A phone's New search: the first day's question, for the view it was pressed on.
    newSearch: p.phone && p.newSearchAt === JSON.stringify(p.leadView),
    onNewSearch: (on: boolean) => {
      p.setNewSearchAt(on ? JSON.stringify(p.leadView) : null);
      // A workspace that has searched was never read its ideas: ask for them as the question opens.
      if (on && !p.leads.suggestions) void readSuggestions();
    },
    // A phone's bar: Select, Sort and Import as People's Select, Sort and Export stand; Select mode is a phone's alone.
    selectMode: p.phone && p.selectMode,
    select: leadsSelectStep(p),
    sortItems: leadsSortItems(p),
    q: p.q,
    onQ: setQ,
    searchRef: p.searchRef,
    scrollRef: p.scrollRef,
    scrolled: p.scrolledX,
    onScrolled: p.setScrolledX,
    filtered: p.filtered,
    onClearFilters: () => {
      setQ("");
      setChip(null);
      setFitChip(null);
      goto({ list: "all", cls: null });
    },
  };
};

/** What the list says when it is empty: Needs review done, a search waiting on its answer, a list of your own, or none yet. */
const emptyOf = (p: LeadsPage): TableEmpty => {
  const { leadView, openSearch, canFind, openFind } = p;
  if (leadView.cls === "review")
    return { title: "Nothing needs a look.", body: "Every lead here has been checked or decided.", action: null };
  if (!leadView.cls && p.waitsOn(leadView.searchId))
    return { title: "Nothing is counted yet.", body: "It is waiting for your answer above.", action: null };
  return (
    p.lists.emptyOf(openSearch) || {
      title: "No leads in this view yet.",
      body: "Describe the businesses you want and Claude finds them.",
      action: canFind ? { label: "Find leads", onClick: openFind } : null,
    }
  );
};

/** How wide a widened area may grow, and the radius an area without one is taken to have, in metres. */
const WIDEST_RADIUS_M = 60_000;
const USUAL_RADIUS_M = 8_000;

/** The search's area, twice as wide (to 60 km at most): the round a "Look further out" opens. */
const widen = (p: LeadsPage) => {
  const s = p.openSearch;
  if (!s || !s.plan || !s.plan.area) return;
  const a = s.plan.area;
  void p.onStripAction("nearby", {
    ...s.plan,
    area: { ...a, radius_m: Math.min(WIDEST_RADIUS_M, Math.round((a.radius_m || USUAL_RADIUS_M) * 2)) },
  });
};

/** The band, the map, the bench and the list's empty state. */
export const leadsBandProps = (p: LeadsPage) => {
  const { mapOpen, leadShown, openSearch, leadView, leads, setValues } = p;
  const ownList = isOwnList(openSearch);
  return {
    band: p.band,
    // The same leads, on the ground (D5): the plot is contracts', from the points the door returned and the area the
    // search asked for. A view whose leads the source placed nowhere has no map to draw.
    mapOpen,
    onMap: p.setMapOpen,
    // The phone's bar shows the map's switch only where the rows the source placed give it something to draw. A list of
    // your own (Part 7) has no area to draw or widen: no map.
    canMap: !ownList && leadShown.some((l) => !!l.point),
    mapPick: p.mapPick,
    onMapPick: p.setMapPick,
    plot:
      mapOpen && !ownList
        ? leadMapPlot(leadShown, (openSearch && openSearch.plan && openSearch.plan.area) || null)
        : null,
    onWiden: () => widen(p),
    // Needs review, as a workbench (D5): the groups are contracts', the pile is the rows this view loaded, and the month
    // is the surface's, so what a press costs is a number the owner can see.
    benchGroups: leadView.cls === "review" ? leadReviewGroups(leads.rows, openSearch) : [],
    benchGroup: p.benchGroup,
    onBenchGroup: p.setBenchGroup,
    month: leads.month,
    onNearby: (area: LeadArea) => {
      if (openSearch) void p.onStripAction("nearby", { ...openSearch.plan, area });
    },
    fit: p.fitChip,
    onPickFit: p.setFitChip,
    values: p.values,
    onValues: (v: boolean) => {
      setValues(v);
      try {
        if (window.localStorage) window.localStorage.setItem("leads.values", v ? "1" : "0");
      } catch {
        /* a private window: the choice lives for the page */
      }
    },
    empty: emptyOf(p),
  };
};

/**
 * Needs review's resolvers (D3). Keep and Exclude go through the bulk door (00145), which takes the member's own door once
 * per lead; Check again through its own, so the bar never offers what no door can do.
 */
const reviewDoors = (p: LeadsPage): ReviewDoors => {
  const { leads, openSearch, leadSaid, leadView } = p;
  const inSearch = leadView.searchId ? { search_id: leadView.searchId } : {};
  return {
    actsFor: (ids) => {
      const groups = leadReviewGroups(
        leads.rows.filter((l) => ids.indexOf(l.id) >= 0),
        openSearch,
      );
      return [...new Set(groups.flatMap((g) => g.acts))];
    },
    canCheckAgain: true,
    onCheckAgain: (ids) => leadSaid(() => checkLeadsAgain(ids)),
    onKeep: (ids) => leadSaid(() => bulkLeads({ by: "ids", action: "keep", ids, ...inSearch })),
    onExclude: (ids) => leadSaid(() => bulkLeads({ by: "ids", action: "exclude", ids, ...inSearch })),
  };
};

/** The view a selection of "all that match" stands for, and the file of it: the list, the search, the class and the sort. */
const bulkViewOf = (p: LeadsPage) => {
  const { leadView, sortBy, sortDir } = p;
  return {
    list: leadView.list,
    ...(leadView.searchId ? { search: leadView.searchId } : {}),
    ...(leadView.cls ? { class: leadView.cls } : {}),
    sort: sortBy,
    dir: sortDir,
  } as Extract<LeadsBulkInput, { by: "view" }>["view"];
};

/** The rail picks as People's does (railToggle): a list or a search, one at a time; the class and the chip start over. */
const railDoors = (p: LeadsPage) => {
  const { nav, phone, setChip, setListsOpen, pickListRoute, pickSearchRoute, goto } = p;
  return {
    // On a phone the press is in the Lists sheet: it opens the row and the sheet closes, so the page it opened is what the
    // owner sees next. It stood open over the page, and a second press on the row took them back out.
    onPickList: (id: string) => {
      setChip(null);
      nav(pickListRoute(id, phone));
      if (phone) setListsOpen(false);
    },
    onPickSearch: (id: string) => {
      setChip(null);
      nav(pickSearchRoute(id, phone));
      if (phone) setListsOpen(false);
    },
    // The row under the pointer reads its view ahead of the press (the surface holds it; warmLeadsView).
    onWarmList: (id: string) => void warmView(pickListRoute(id)),
    onWarmSearch: (id: string) => void warmView(pickSearchRoute(id)),
    onPickClass: (cls: LeadClass | null) => {
      setChip(null);
      goto({ cls });
    },
  };
};
/** The selection and its bulk bar, and the rail's doors. */
export const leadsBulkProps = (p: LeadsPage) => {
  const { sel, setSel, setAllMatching, allMatching, phone, bulkSheet, setBulkSheet, leadShown, nav } = p;
  const bulkView = bulkViewOf(p);
  return {
    sel,
    onToggle: p.toggleSel,
    onToggleAll: p.toggleAll,
    onClearSel: p.clearSelection,
    onSelectIds: (ids: string[]) => {
      setSel(new Set(ids));
      setAllMatching(false);
    },
    review: reviewDoors(p),
    allMatching,
    onSelectAllMatching: () => setAllMatching(true),
    bulkView,
    bulkBusy: p.leadBusy,
    onBulk: p.bulkLeads,
    bulkWhy: p.bulkWhy,
    onBulkWhy: p.setBulkWhy,
    bulkSheet: phone ? bulkSheet : null,
    onBulkSheet: setBulkSheet,
    onBulkNotAFit: p.bulkNotAFit,
    onCopyEmails: p.copyEmails,
    cursor: p.cursor,
    onCursor: p.setCursor,
    canFind: p.canFind,
    canExport: p.canExport,
    importDoor: p.lists.importDoor,
    listsNode: p.lists.node,
    // Write to them (Part 7): the rows chosen and shown, never all that match (a view is not a list of ids).
    writeToThem: p.lists.writeAct({
      ids: allMatching ? [] : leadShown.filter((l) => sel.has(l.id)).map((l) => l.id),
      phone,
      shut: () => setBulkSheet(null),
    }),
    exportHref: api().url("GET leads/export", { query: bulkView }),
    ...railDoors(p),
    chip: p.chip,
    onPickChip: p.setChip,
    onNeedsYou: (id: string) => nav(leadsRoute({ searchId: id, list: "all", cls: "excluded" })),
    exportHrefFor: p.exportHrefFor,
    searchWordsFor: p.searchWordsFor,
  };
};

/** Whether an idea's kind is already searched for in its place: by the plan's own key and the area's label. */
const searchedAlready = (idea: LeadIdeaDto, searches: LeadSearchDto[]): boolean => {
  const plan = idea.plan;
  if (!plan) return false;
  const place = plan.area.label.toLowerCase();
  // A list brought in has a plan with no area (00242): it is no place searched.
  return searches.some(
    (s) =>
      leadKindKey(s.plan.category_key || s.plan.name) === idea.category_key &&
      !!s.plan.area &&
      s.plan.area.label.toLowerCase() === place,
  );
};

/**
 * A plan opened from a search itself has no Ask turn's facts: the month the page reads, and the search's nearby areas,
 * stand in (contracts leadMonthPlanFacts). None until a first page has said the month, or with no plan.
 */
const monthFactsOf = (p: LeadsPage) => {
  const { finder, leads } = p;
  if (!finder.plan || !leads.month) return null;
  const id = finder.more ? finder.more.searchId : null;
  const s = id ? leads.searches.find((x) => x.id === id) || null : null;
  // An idea's plan brings what past searches measured of its kind (00398).
  const idea = finder.idea;
  const prior = idea ? { of: finder.plan.name, counts: idea.prior || null } : null;
  return leadMonthPlanFacts(leads.month, finder.plan.count, (s && s.round && s.round.nearby) || [], prior);
};

/** The plan panel: its state as the panel reads it, and its moves. */
const finderProps = (p: LeadsPage) => {
  const { finder, setFinder, closeFinder, openFind } = p;
  return {
    finderOpen: finder.open,
    finderStage: finder.stage,
    finderWords: finder.words,
    finderProposal: finder.proposal,
    finderRefusal: finder.refusal,
    finderBusy: p.leadBusy,
    finderPlan: finder.plan,
    finderFacts: monthFactsOf(p),
    finderChanged: !!finder.plan && finder.plan.version > ((finder.proposal?.payload?.plan?.version as number) || 1),
    finderTrace: finder.trace,
    finderPick: finder.pick,
    onFinderWords: (words: string) => setFinder({ words }),
    onFinderAnswer: p.finderAnswer,
    onFinderApprove: p.finderApprove,
    onFinderChangePlan: (plan: LeadSearchPlan) => setFinder({ plan }),
    onFinderPick: (pick: string | null) => setFinder({ pick }),
    // Change what I asked: under a question it is the answer row; on a plan born from the strip it is Ask, with what the
    // search asked for in the field (the panel composes nothing, spec F5).
    onFinderBack: () => {
      if (finder.more && finder.more.answer) {
        setFinder({ stage: "compose" });
        return;
      }
      closeFinder();
      openFind(finder.words);
    },
    onCloseFinder: closeFinder,
    finderAnswering: finder.more && finder.more.answer ? finder.more : null,
  };
};

/** A kept search's acts, the plan panel, and the peek. */
export const leadsPeekProps = (p: LeadsPage) => {
  const { peekId, shownIds, deckMove, setPeekId, setRemoveError, setRemoving, setRenaming, lightboxId, setLightboxId } =
    p;
  return {
    renaming: p.renaming,
    onRename: setRenaming,
    onRenameSave: p.renameSearch,
    onRenameCancel: () => setRenaming(null),
    removing: p.removing,
    onRemoveAsk: (s: NonNullable<LeadsPage["removing"]>) => {
      setRemoveError(null);
      setRemoving(s);
    },
    onUndo: (s: { id: string }) => p.undoRound(s.id),
    onRemoveYes: p.removeSearch,
    onRemoveNo: () => {
      setRemoving(null);
      setRemoveError(null);
    },
    removeBusy: p.leadBusy,
    removeError: p.removeError,
    onFindNewOnes: p.findNewOnes,
    onSearchAgain: p.searchAgain,
    onFind: p.openFind,
    onIdea: (idea: LeadIdeaDto) => p.openIdea(idea, p.leads.month ? p.leads.month.left : null),
    ...finderProps(p),
    peek: peekId ? peekVMFor(peekId) : null,
    // Where this lead sits in the pile, and the two ways through it (D5). Moving the deck moves the page's own cursor as J
    // and K do, so the rows behind the peek move with it.
    deck:
      peekId && shownIds.indexOf(peekId) >= 0
        ? {
            at: shownIds.indexOf(peekId) + 1,
            of: shownIds.length,
            onPrev: () => deckMove(-1),
            onNext: () => deckMove(1),
          }
        : null,
    peekMode: p.peekMode,
    onPeekMode: p.setPeekMode,
    armed: p.armed,
    onArmed: p.setArmed,
    draft: p.draft,
    onDraftState: p.setDraft,
    // On a phone, while Select is on or anyone is selected a tap on a row selects it, as on People (the face is the checkbox).
    onPeek: p.phone && (p.selectMode || p.leadShown.some((l) => p.sel.has(l.id))) ? p.toggleSel : setPeekId,
    onPeekId: setPeekId,
    onOpenPerson: p.onOpenProfile,
    flash: p.plFlash,
    onClosePeek: p.closePeek,
    onExpandPhoto: setLightboxId,
    lightbox: lightboxId ? peekVMFor(lightboxId) : null,
    onCloseLightbox: () => setLightboxId(null),
    onCall: p.callLead,
    onKeep: p.keepLead,
    onExclude: p.excludeLead,
    onPutBack: p.putBackLead,
    onCopy: p.copyLead,
    onCopyPhone: p.copyPhone,
    onLogCall: p.logLeadCall,
  };
};

/** The strip, the next page, and the first day. */
export const leadsFootProps = (p: LeadsPage) => {
  const { leads, leadLine, setLeadLine } = p;
  return {
    onStripAction: p.onStripAction,
    onTakeOffered: p.takeOffered,
    onMore: p.leadsMore,
    loadingMore: p.leadsMoreBusy,
    // The first day: no search kept AND no lead held. A list brought in keeps no search, and its leads are there to
    // work, so its rail and its table stand: the first day drew over them (7 Oct 2026).
    firstDay: leads.searches.length === 0 && leads.counts.all === 0 && !leads.readFailed,
    onImport: p.lists.openImport,
    lineOpen: !!leadLine,
    lineDraft: leadLine ? leadLine.draft : "",
    lineError: leadLine ? leadLine.error : null,
    lineBusy: !!(leadLine && leadLine.busy),
    onOpenLine: () =>
      setLeadLine({ draft: leads.suggestions ? leads.suggestions.business_line : "", error: null, busy: false }),
    onLineDraft: (draft: string) => setLeadLine((l) => ({ busy: false, ...l, draft, error: null })),
    onSaveLine: p.saveBusinessLine,
    onCancelLine: () => setLeadLine(null),
    onNewIdeas: p.newIdeas,
    toastNode: p.toastNode,
  };
};

export type LeadsScopeProps = ReturnType<typeof leadsListProps> &
  ReturnType<typeof leadsBandProps> &
  ReturnType<typeof leadsBulkProps> &
  ReturnType<typeof leadsPeekProps> &
  ReturnType<typeof leadsFootProps>;
