/**
 * People › Leads, the real surface (moved from legacy/pages/leads-real.jsx, decision 0015): LeadsReal and what only it
 * reads. People's App Router page draws it for the addresses under `clients/leads` (../../people/people-route.tsx), over
 * People's two hooks (usePlControls before the view works out its rows, usePlPlace after), the kit's table between them
 * (decision 0083), and the Leads surface (useSurface("leads")). Its state is the hooks beside it, one concern each, called in the order it always called them; its
 * acts are plain functions over the draw's state; and what it hands LeadsScope comes from the five builders (props.tsx).
 */
import { useEffect } from "react";
import { BAR_LINE_WORDS, leadBand, leadRail, leadsStanding, type LeadRowVM } from "@chanlytics/contracts";
import { navigate } from "../../legacy-verbs";
import { useSwapMotion } from "../../kit/motion/use-swap-motion";
import { TABLE_BODIES } from "../../kit/table/data-table";
import { useDataTable } from "../../kit/table/use-data-table";
import { usePlControls } from "../../people/hooks/use-controls";
import type { ColCtx } from "../../people/types";
import { usePeople } from "../../people/hooks/use-people";
import { usePlPlace } from "../../people/hooks/use-place";
import { LEAD_COLUMNS } from "../cells/columns";
import type { LeadCellCtx } from "../cells/types";
import { leadPeekEscape } from "../peek/seams";
import { useLeadLists } from "../reach-out/lists";
import { LeadsScope } from "../scope/scope";
import { usePageSearch } from "../../kit/head/page-search";
import type { ScopeView } from "../../people/scope-view";
import { useLeadPileView } from "../pile/page-pile";
import { useBulkAdd } from "../scope/bulk-add";
import { useLeadPile } from "../pile/use-pile";
import { useLeadAim } from "../sheet/use-aim";
import { leadActs, type LeadActs } from "./acts";
import { useLeadPeek, useLeadPeekAddress, type LeadsNav } from "./peek-hooks";
import {
  leadsBandProps,
  leadsBulkProps,
  leadsFootProps,
  leadsListProps,
  leadsPeekProps,
  type LeadsPage,
} from "./props";
import { leadChipsOf, leadNarrowings, useLeadCells, useLeadChipsAddress, useLeadRows, useLeadsRead } from "./reads";
import { leadRailRoutes, leadStripActs } from "./routes";
import { leadFinderActs, leadSearchActs } from "./search-acts";
import { leadsViewAt, useLeads, useLeadsState } from "./state";

interface LeadsRealProps {
  onOpenProfile?: (id: string) => void;
  /** The address the page shows (`clients/leads…`): which search, list and class, and the lead open over them. */
  leadsRoute?: string | null;
  onNavigate?: LeadsNav | null;
  /** What People's page says of this scope it keeps (people/scope-view.ts): the deck's seat and the side it comes in from. */
  scopeView?: ScopeView;
}

const NO_PROFILE = (): void => undefined;

/** A cell's doors, to this draw's acts: Keep, Exclude and Put back show on the row at once, so a cell never waits on one. */
const cellDoors = (
  acts: LeadActs,
  open: (id: string | null) => void,
  expand: (id: string | null) => void,
  openPerson: (id: string) => void,
) => ({
  onOpen: open,
  onOpenPerson: openPerson,
  onExpand: expand,
  onCall: acts.callLead,
  onCopy: acts.copyLead,
  onCopyPhone: acts.copyPhone,
  onLogCall: acts.logLeadCall,
  onKeep: (id: string) => void acts.keepLead(id),
  onExclude: (id: string) => void acts.excludeLead(id),
  onPutBack: (id: string) => void acts.putBackLead(id),
});

/**
 * The view the page shows: the surfaces it reads, the address's view, People's controls, the page's own state, the rows
 * the box leaves shown, each view's place, and the peek with its address. The hooks the page always called first, in order.
 */
function useLeadsView({ leadsRoute, onNavigate }: { leadsRoute: string | null; onNavigate: LeadsNav | null }) {
  // The workspace's copy of every view rides with the People surface (usePlControls), and so do the first day's facts
  // about the calendar and the people.
  const people = usePeople();
  const leads = useLeads();
  // A rail pick swaps the rows in with the kit's rise, as People's and the Inbox's lists do: when the rows of the view
  // land (the surface's `route` is the view its rows are of), not when the pick is made over the last view's rows.
  const swap = useSwapMotion<HTMLTableElement>(leads.route, TABLE_BODIES);
  const nav: LeadsNav = onNavigate || ((to, opts) => navigate(to, opts));
  const { leadView, viewRoute, addrPeek, leadList } = leadsViewAt(leadsRoute);
  const hasCenter = leads.searches.some((s) => s.plan && s.plan.area && !!s.plan.area.center);
  // The columns this scope draws with: the Leads scope's (LEAD_COLUMNS).
  const controls = usePlControls<LeadRowVM, LeadCellCtx, ColCtx>({
    scope: "leads",
    cols: LEAD_COLUMNS,
    colCtx: { hasCenter },
    people,
    sortFirst: { by: "fit", dir: "asc" },
    railRow: leadList,
  });
  const { plFlash, sortBy, sortDir } = controls;
  const st = useLeadsState();
  const { peekId, setPeekId, peekMode, setPeekMode, armed, setArmed, setLightboxId } = st;
  const { setBenchGroup, mapOpen, setMapOpen, setMapPick, setBulkWhy } = st;
  // The Excluded view's chip, the band's fit and the Filter's reach: the table's filters, kept in the address and
  // handed to the read with the box's words (00500: the read narrows).
  const narrow = leadNarrowings(controls.table);
  const chips = leadChipsOf(narrow);
  // Where Add goes, for the lead sheet and the pile alike (sheet/use-aim.ts: one choice per search, the door's answers kept
  // by lead). The pile walks the rows in the order the page has them (To decide is the pile): nothing moves under it.
  const aim = useLeadAim({ searches: leads.searches, searchId: leadView.searchId });
  const pile = useLeadPile({ flash: plFlash, aim });
  const order = { sortBy, sortDir };
  const read = useLeadsRead({ leadView, viewRoute, ...order, plFlash, chips, words: controls.table.words });
  // The view's rows as the table shows them: as the read answered them, in its order and narrowed by its filters.
  const model = useDataTable({
    state: controls.table,
    columns: controls.declared,
    data: leads.rows,
    server: { sorting: true, filtering: true },
  });
  const rows = useLeadRows({
    leads,
    leadShown: model.rows,
    asked: controls.table.narrowed,
    chips,
    q: read.readWords,
    leadView,
    ...order,
  });
  const { leadShown, shownIds, viewLanded } = rows;
  // "All that match" is a claim about what the filters keep, and its N moves with them: a claim taken before a filter
  // changed goes back to the rows picked, and the bar says the new N before an act.
  const { setAllMatching } = controls;
  const filtersKey = `${viewRoute}|${JSON.stringify(chips)}|${read.readWords}`;
  useEffect(() => {
    setAllMatching(false);
  }, [filtersKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useLeadChipsAddress({ leadView, addrPeek, narrow, nav });
  // Each view keeps its place by the address's view without its chips (viewRoute), its map with it; its chips are the
  // address's. The selection goes with the view, never with a narrowing: a chip, as the box, the fit and the Filter, keeps
  // it (decision 0083, §6.8), and the bars act on the rows shown.
  const place = usePlPlace({
    controls,
    page: "leads",
    view: viewRoute,
    ids: shownIds,
    noun: "lead",
    landed: viewLanded,
    selectionOf: viewRoute,
    extra: { map: mapOpen },
    onPlace: (at, again) => {
      setMapOpen(!!at.map);
      // The chips are the address's (useLeadChipsAddress): a view opened again starts with the ones its address says.
      if (again) {
        setBenchGroup(null);
        setMapPick(null);
        setLightboxId(null);
        setBulkWhy(false);
      }
    },
  });
  const { cursor, setCursor } = place;
  const deckMove = useLeadPeek({
    peekId,
    setPeekId,
    shownIds,
    leadShown,
    cursor,
    setCursor,
    peekMode,
    armed,
    setArmed,
  });
  useLeadPeekAddress({
    leadView,
    viewRoute,
    addrPeek,
    peekId,
    setPeekId,
    setCursor,
    setPeekMode,
    setArmed,
    setDraft: st.setDraft,
    nav,
  });
  return {
    people,
    leads,
    swap,
    nav,
    leadView,
    viewRoute,
    hasCenter,
    controls,
    st,
    narrow,
    model,
    read,
    rows,
    place,
    deckMove,
    pile,
    aim,
  };
}

/**
 * Everything the page hands LeadsScope this draw: its acts over the view, the keyboard's doors, the rail and the standing
 * line, the open search's reach-out and the lists of one's own, the cells' context, and the strip's steps.
 */
function useLeadsPage(v: ReturnType<typeof useLeadsView>, onOpenProfile: (id: string) => void): LeadsPage {
  const { people, leads, swap, nav, leadView, hasCenter, controls, st, narrow, model, read, rows, place } = v;
  const { deckMove, pile, aim } = v;
  const { canExport, plFlash, setSel, setAllMatching, pickSort, columns } = controls;
  const { peekId, setPeekId, finder, closeFinder, peekMode, setPeekMode, armed, setArmed } = st;
  const { values, lightboxId, setLightboxId } = st;
  const acts = leadActs({ leads, leadView, plFlash, setSel, setAllMatching, ...st });
  const { canFind, callLead } = acts;
  // A list of your own (Reach out Part 7): the rail's Import leads, the bar's Write to them, and the sheets they open; and
  // Find people (00430), which a people search's Search again and a people idea open filled in.
  const lists = useLeadLists({ flash: plFlash, peopleLive: leads.cardsLive.includes("people_at_companies") });
  const finderActs = leadFinderActs({ leadView, nav, plFlash, ...st });
  const searches = leadSearchActs({ leads, nav, plFlash, ...acts, ...st, openFindPeople: lists.openFindPeople });
  // One press backs out one step: the question the peek asked, then the pane it opened, then the peek itself
  // (leadPeekEscape, Task 12). Esc and the peek's own close.
  const closePeek = () =>
    leadPeekEscape({
      mode: peekMode,
      armed,
      setMode: setPeekMode,
      setArmed,
      setPeekId,
      lightbox: lightboxId,
      setLightbox: setLightboxId,
    });
  const openSearch = acts.searchById(leadView.searchId);
  // The pile (00426): what the lead sheet draws of it while it is on, the door into it, and the keys it takes.
  const piled = useLeadPileView({
    pile,
    aim,
    leads,
    openSearch,
    cls: leadView.cls,
    peekId,
    setPeekId,
  });
  // What the keyboard's one listener reads (usePlPlace): Enter peeks the lead, and the Leads scope's own overlays.
  place.keysWith({
    open: setPeekId,
    canSelect: canFind || canExport,
    // The Lists sheet and the selection's are the kit's, in PL_OVERLAY while open, each closed on its own Esc.
    peekOpen: !!peekId || !!lightboxId,
    // The order OUT here is the page's: the peek, the plan panel, the selection.
    closePeek,
    finderOpen: finder.open,
    // Esc lets an answer go as the close button does.
    closeFinder,
    canFind,
    find: finderActs.openFind,
    call: callLead,
    pile: piled.keys,
  });
  // The band (D5): the search's whole shape, and whether its fits differ (which is when a row wears its fit).
  const band = leadBand(openSearch);
  // What a cell needs. The acts are this draw's closures (over the view, the busy flag), so the context hands out doors to
  // the latest: it changes only when a value a cell draws from changes. The Stage column, drawn, says each lead's state,
  // and the name's tag does not say it again.
  const cellCtxLeads = useLeadCells({
    leadShown: rows.leadShown,
    doors: cellDoors(acts, setPeekId, setLightboxId, onOpenProfile),
    values: {
      values,
      mixedFits: !!(band && band.mixed),
      hasCenter,
      canFind,
      peopleRows: people.rows,
      stageShown: columns.some((c) => c.key === "stage"),
    },
  });
  // Add and Later for the leads chosen and shown (never all that match: an add is of leads, not of a view's filters); what
  // an add leaves out stays selected.
  const chosen = controls.allMatching ? [] : rows.leadShown.filter((l) => controls.sel.has(l.id)).map((l) => l.id);
  const bulkAdd = useBulkAdd({
    ids: chosen,
    aim,
    search: openSearch ? { id: openSearch.id, name: openSearch.name } : null,
    flash: plFlash,
    busy: !!st.leadBusy,
    onDone: (keep) => {
      setSel(new Set(keep));
      setAllMatching(false);
    },
  });
  const routes = leadRailRoutes({ leadView, nav, searchById: acts.searchById });
  const strip = leadStripActs({
    openSearch,
    ...acts,
    ...finderActs,
    ...searches,
    ...routes,
    pickSort,
    ...st,
    openFindPeople: lists.openFindPeople,
  });
  return {
    ...controls,
    ...st,
    ...narrow,
    model,
    ...acts,
    ...finderActs,
    ...searches,
    ...routes,
    ...strip,
    ...read,
    ...rows,
    cursor: place.cursor,
    setCursor: place.setCursor,
    toggleAll: place.toggleAll,
    people,
    leads,
    swap,
    nav,
    onOpenProfile,
    leadView,
    deckMove,
    closePeek,
    rail: leadRail(leads.counts, leads.searches, new Date(), openSearch ? openSearch.id : null),
    standing: leadsStanding(leads.counts, leads.searches),
    openSearch,
    band,
    cellCtxLeads,
    lists,
    pileSheet: piled.view,
    pileUp: piled.up,
    pileDoor: piled.door,
    aim,
    bulkAdd: chosen.length ? bulkAdd : null,
    // Add opened at New for the search's own picker, which chooses the leads first (props.tsx newSequenceFor).
    bulkAsk: bulkAdd.ask,
  };
}

export const LeadsReal = ({
  onOpenProfile = NO_PROFILE,
  leadsRoute = null,
  onNavigate = null,
  scopeView,
}: LeadsRealProps) => {
  const p = useLeadsPage(useLeadsView({ leadsRoute, onNavigate }), onOpenProfile);
  const foot = leadsFootProps(p);
  // On a desk the leads' search is the bar's line (page-search.ts); a phone's is the box in its bar, and the first day,
  // whose page is its question alone, has none.
  usePageSearch(
    p.phone || foot.firstDay
      ? null
      : { label: BAR_LINE_WORDS.leads, value: p.q, onValue: p.setQ, inputRef: p.searchRef },
  );
  // A scope People's page keeps: its root is the deck's view (people/scope-view.ts).
  return (
    <LeadsScope
      scopeView={scopeView}
      {...leadsListProps(p)}
      {...leadsBandProps(p)}
      {...leadsBulkProps(p)}
      {...leadsPeekProps(p)}
      {...foot}
    />
  );
};
