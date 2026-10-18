/**
 * People › Leads, the real surface (moved from legacy/pages/leads-real.jsx, decision 0015): LeadsReal and what only it
 * reads. People's App Router page draws it for the addresses under `clients/leads` (../../people/people-route.tsx), over
 * People's two hooks (usePlControls before the view works out its rows, usePlPlace after) and the Leads surface
 * (useSurface("leads")). Its state is the hooks beside it, one concern each, called in the order it always called them; its
 * acts are plain functions over the draw's state; and what it hands LeadsScope comes from the five builders (props.tsx).
 */
import { leadBand, leadRail, leadsStanding, type LeadRowVM } from "@chanlytics/contracts";
import { navigate } from "../../legacy-verbs";
import { useSwapMotion } from "../../kit/motion/use-swap-motion";
import { TABLE_BODIES } from "../../people/table/table";
import { usePlControls } from "../../people/hooks/use-controls";
import { usePeople } from "../../people/hooks/use-people";
import { usePlPlace } from "../../people/hooks/use-place";
import { LEAD_COLUMNS, LEAD_PHONE_COLUMNS } from "../cells/columns";
import type { LeadCellCtx } from "../cells/types";
import { leadPeekEscape } from "../peek/seams";
import { useReachOutLeads } from "../reach-out/lines";
import { useLeadLists } from "../reach-out/lists";
import { LeadsScope } from "../scope/scope";
import { useLeadPileView } from "../pile/page-pile";
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
import { useLeadCells, useLeadRows, useLeadsRead } from "./reads";
import { leadRailRoutes, leadStripActs } from "./routes";
import { leadFinderActs, leadSearchActs } from "./search-acts";
import { leadsViewAt, useLeads, useLeadsState } from "./state";

interface LeadsRealProps {
  onOpenProfile?: (id: string) => void;
  /** The address the page shows (`clients/leads…`): which search, list and class, and the lead open over them. */
  leadsRoute?: string | null;
  onNavigate?: LeadsNav | null;
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
  const controls = usePlControls<LeadRowVM, LeadCellCtx>({
    scope: "leads",
    cols: LEAD_COLUMNS,
    phoneCols: LEAD_PHONE_COLUMNS,
    colCtx: { hasCenter },
    people,
    sortFirst: { by: "fit", dir: "asc" },
    railRow: leadList,
  });
  const { plFlash, sortBy, sortDir, q } = controls;
  const st = useLeadsState();
  const { peekId, setPeekId, peekMode, setPeekMode, armed, setArmed, setLightboxId } = st;
  const { chip, setChip, fitChip, setFitChip, setBenchGroup, mapOpen, setMapOpen, setMapPick, setBulkWhy } = st;
  // The pile (00426): while it is on for the search the address names, the read is the database's pile order, with the
  // list its adds go to.
  // Where Add goes, for the lead sheet and the pile alike (sheet/use-aim.ts: one choice per search, the door's answers kept
  // by lead).
  const aim = useLeadAim({ searches: leads.searches, searchId: leadView.searchId });
  const pile = useLeadPile({ flash: plFlash, aim });
  const piled = pile.on && pile.searchId === leadView.searchId;
  const order = piled ? { sortBy: "pile", sortDir: "asc" } : { sortBy, sortDir };
  const pileList = piled && aim.target ? aim.target.listId : null;
  const read = useLeadsRead({ leadView, viewRoute, ...order, plFlash, pileList });
  const rows = useLeadRows({ leads, q, chip, fitChip, leadView, viewRoute, ...order });
  const { leadShown, shownIds, viewLanded } = rows;
  // Each view keeps its place by the address's view (viewRoute), its map with it. A view opened after the first starts with
  // none of the last one's filters.
  const place = usePlPlace({
    controls,
    page: "leads",
    view: viewRoute,
    ids: shownIds,
    noun: "lead",
    landed: viewLanded,
    selectionOf: `${viewRoute}|${chip}`,
    extra: { map: mapOpen },
    windowed: true,
    onPlace: (at, again) => {
      setMapOpen(!!at.map);
      if (again) {
        setChip(null);
        setFitChip(null);
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
  const { people, leads, swap, nav, leadView, hasCenter, controls, st, read, rows, place, deckMove, pile, aim } = v;
  const { canExport, plFlash, setSel, setAllMatching, setSortBy, setSortDir, columns } = controls;
  const { peekId, setPeekId, finder, closeFinder, peekMode, setPeekMode, armed, setArmed } = st;
  const { values, lightboxId, setLightboxId } = st;
  const acts = leadActs({ leads, leadView, plFlash, setSel, setAllMatching, ...st });
  const { canFind, callLead } = acts;
  const finderActs = leadFinderActs({ leadView, nav, plFlash, ...st });
  // A list of your own (Reach out Part 7): the rail's Import leads, the bar's Write to them, and the sheets they open; and
  // Find people (00430), which a people search's Search again opens filled in.
  const lists = useLeadLists({ flash: plFlash, peopleLive: leads.cardsLive.includes("people_at_companies") });
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
  // Leads while a reach-out writes (Reach out Part 6, H8): the open search's lines, or null. Present from the first draw.
  const reachOut = useReachOutLeads(openSearch ? openSearch.id : null);
  // The pile (00426): what the lead sheet draws of it while it is on, the door into it, and the keys it takes.
  const piled = useLeadPileView({
    pile,
    aim,
    leads,
    openSearch,
    cls: leadView.cls,
    hasChain: !!(reachOut && reachOut.dto.lines),
    phone: !!controls.phone,
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
      reachOut,
    },
  });
  const routes = leadRailRoutes({ leadView, nav, searchById: acts.searchById });
  const strip = leadStripActs({
    openSearch,
    ...acts,
    ...finderActs,
    ...searches,
    ...routes,
    setSortBy,
    setSortDir,
    ...st,
    openFindPeople: lists.openFindPeople,
  });
  return {
    ...controls,
    ...st,
    ...acts,
    ...finderActs,
    ...searches,
    ...routes,
    ...strip,
    ...read,
    ...rows,
    cursor: place.cursor,
    setCursor: place.setCursor,
    rowBudget: place.rowBudget,
    toggleAll: place.toggleAll,
    people,
    leads,
    swap,
    nav,
    onOpenProfile,
    leadView,
    deckMove,
    closePeek,
    rail: leadRail(leads.counts, leads.searches),
    standing: leadsStanding(leads.counts, leads.searches),
    openSearch,
    band,
    cellCtxLeads,
    reachOut,
    lists,
    pileSheet: piled.view,
    pileUp: piled.up,
    pileDoor: piled.door,
    aim,
  };
}

export const LeadsReal = ({ onOpenProfile = NO_PROFILE, leadsRoute = null, onNavigate = null }: LeadsRealProps) => {
  const p = useLeadsPage(useLeadsView({ leadsRoute, onNavigate }), onOpenProfile);
  return (
    <LeadsScope
      {...leadsListProps(p)}
      {...leadsBandProps(p)}
      {...leadsBulkProps(p)}
      {...leadsPeekProps(p)}
      {...leadsFootProps(p)}
    />
  );
};
