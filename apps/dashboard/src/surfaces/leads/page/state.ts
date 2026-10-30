/**
 * The Leads page's own state (moved from legacy/pages/leads-real.jsx, decision 0015): the surface it reads, the view the
 * address names, and everything the scope draws from that is the page's to hold. Every component of the scope is hookless,
 * from its rail to its bulk bar (../scope/), and everything it needs is a prop; LeadsReal holds it through the hooks here
 * and beside, one concern each, called in the order it always called its hooks.
 */
import { useReducer, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { leadsRoute, parseLeadsRoute, type LeadBand, type LeadReachFilter } from "@chanlytics/contracts";
import { useSurface } from "../../use-surface";
import type { LeadsSurface } from "../surface";
import type { Armed, DraftState, PeekMode } from "../peek/types";
import type { FinderState } from "../finder/types";
import type { LeadRail } from "../scope/rail";

/** The viewer's Values ⁄ Signals choice, read in a try: a private window or blocked storage answers Signals. */
const ldValuesPref = (): boolean => {
  try {
    return !!window.localStorage && window.localStorage.getItem("leads.values") === "1";
  } catch {
    return false;
  }
};

/** Before the first read: no searches, no rows, nothing counted. */
const PL_NO_LEADS: LeadsSurface = {
  searches: [],
  counts: { all: 0, ready: 0, nurture: 0, converted: 0, said_no: 0, not_a_fit: 0 },
  rows: [],
  next: null,
  offered: 0,
  view: { searchId: null, list: "all", cls: null, chips: {}, sort: "fit", dir: "asc" },
  route: "clients/leads",
  suggestions: null,
  month: null,
  pile: null,
  peeked: [],
  tz: "UTC",
  readFailed: false,
  fetchedAt: 0,
  cardsLive: [],
};

/**
 * The Leads surface (surface.ts): the searches, the counts, the rows of one view, how many a refresh found and is holding
 * back, and the first day's suggestions. Its own key, so a People refresh does not draw Leads again and the other way round.
 */
export const useLeads = (): LeadsSurface => useSurface("leads") ?? PL_NO_LEADS;

export type LeadView = NonNullable<ReturnType<typeof parseLeadsRoute>>;
const NO_VIEW: LeadView = { searchId: null, list: "all", cls: null, chips: {}, peek: null };

/**
 * Which search, which list and which class this address names (contracts parseLeadsRoute). The address is the one place
 * the Leads view's list lives, so the rail, the table and the saved view agree. The view's own route has no lead open
 * over it: the page stays mounted across its views, so what belongs to a view follows `viewRoute`, never the address
 * itself; a lead opened over a view is the same view, and must not read it again or drop what is selected.
 */
export const leadsViewAt = (route: string | null) => {
  const leadView = parseLeadsRoute(route || "clients/leads") || NO_VIEW;
  const viewRoute = leadsRoute({ searchId: leadView.searchId, list: leadView.list, cls: leadView.cls });
  const addrPeek = leadView.peek || null;
  // The rail's row, as a name of its own: what a saved view carries and what a read is keyed by.
  return { leadView, viewRoute, addrPeek, leadList: leadView.list };
};

/**
 * The plan panel's state (Tasks 9, 10; spec F5): whether it is open and at which stage, the words, the card an answer
 * brought back (`proposal`), what was refused, the plan the card shows and the owner is editing, the trace line while
 * Claude reads, which of the sentence's words has its picker open (`pick`), and whose round a plan opened from a strip's
 * next step belongs to (`more`). A plan opens one way, with everything the card shows at once and the last card's refusal
 * and picker gone, and the panel closes one way; between, the panel and the amend turn set a field at a time. A move that
 * changes nothing keeps the state, as a setter handed the value it holds did.
 */
const LEAD_FINDER_SHUT: FinderState = {
  open: false,
  stage: "compose",
  words: "",
  proposal: null,
  refusal: null,
  plan: null,
  trace: null,
  pick: null,
  more: null,
};
type FinderMove = { open: Partial<FinderState> } | { close: true } | { set: Partial<FinderState> };
const leadFinderStep = (f: FinderState, move: FinderMove): FinderState => {
  const next: FinderState =
    "open" in move
      ? { ...f, ...move.open, open: true, refusal: null, pick: null }
      : "close" in move
        ? { ...f, open: false, more: null }
        : { ...f, ...move.set };
  return (Object.keys(next) as (keyof FinderState)[]).every((k) => Object.is(next[k], f[k])) ? f : next;
};

/** The moves: open a plan (`{ stage, words, proposal, plan, more }`), close it, set fields. */
const leadFinderMoves = (moveFinder: Dispatch<FinderMove>) => ({
  openFinder: (card: Partial<FinderState>) => moveFinder({ open: card }),
  closeFinder: () => moveFinder({ close: true }),
  setFinder: (fields: Partial<FinderState>) => moveFinder({ set: fields }),
});

/** The first day's "Not right? Change it": the line being rewritten, what is wrong with it, and whether it is saving. */
export interface LeadLine {
  draft: string;
  error: string | null;
  busy: boolean;
  /** Write it for me in flight: the line being written from the whole picture. */
  writing?: boolean;
  /** The line as it was written for the owner, where it was: while the draft is still it, there is nothing to save. */
  written?: string | null;
}

type RailSearch = LeadRail["searches"][number];
/** One of the band's fits (D5): the strong ones, the ones worth a look, the long shots. */
type LeadFit = LeadBand["fits"][number]["id"];

/** The page's own state. */
export const useLeadsState = () => {
  // The phone's list picker: the rail, as a sheet.
  const [listsOpen, setListsOpen] = useState(false);
  const [peekId, setPeekId] = useState<string | null>(null);
  // The plan panel, one state and three moves on it (leadFinderStep, above).
  const [finder, moveFinder] = useReducer(leadFinderStep, LEAD_FINDER_SHUT);
  // The first day's "Not right? Change it" (Task 17): the line the owner is rewriting, or null when the form is closed.
  // Saving it keeps the line with no items, so the read that follows asks Claude again -- which is the only control that
  // renews the suggestions, and why their age is never drawn.
  const [leadLine, setLeadLine] = useState<LeadLine | null>(null);
  // The five whys, asked once for a whole selection (Task 15).
  const [bulkWhy, setBulkWhy] = useState(false);
  // The peek's own pane ("info" while it is just showing the lead; "why" and "draft" are Tasks 15 and 13) and the draft
  // it is holding.
  const [peekMode, setPeekMode] = useState<PeekMode>("info");
  const [draft, setDraft] = useState<DraftState | null>(null);
  // "Did you send it?" after a draft, "How did the call go?" after a call. `asked` turns true only once the tab is
  // theirs again (leadArmOnReturn, Task 13), so nothing is asked while they are away.
  const [armed, setArmed] = useState<Armed | null>(null);
  // D5: the row's Values ⁄ Signals choice (kept per viewer), the photo expanded, and the band's fit filter.
  const [values, setValues] = useState(ldValuesPref());
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [fitChip, setFitChip] = useState<LeadFit | null>(null);
  // The Filter's reach (contracts leadReaches): only the leads with a checked email, a checked phone, or both. Kept with
  // the view's place, as the map is, so Back puts it back and another view starts without it.
  const [reach, setReach] = useState<LeadReachFilter[]>([]);
  const [benchGroup, setBenchGroup] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  // A phone's New search: the first day's question over the page (Ruben, 10 Oct 2026), held for the view it was pressed on,
  // so a search opened, a list picked or Back ends it with nothing to clear.
  const [newSearchAt, setNewSearchAt] = useState<string | null>(null);
  const [mapPick, setMapPick] = useState<string | null>(null);
  // One criterion of the Excluded view, from the chips at its head.
  const [chip, setChip] = useState<string | null>(null);
  // The search being renamed, and the one being removed: each asked where the search is, on the rail.
  const [renaming, setRenaming] = useState<RailSearch | null>(null);
  const [removing, setRemoving] = useState<RailSearch | null>(null);
  const [leadBusy, setLeadBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  return {
    listsOpen,
    setListsOpen,
    peekId,
    setPeekId,
    finder,
    ...leadFinderMoves(moveFinder),
    leadLine,
    setLeadLine,
    bulkWhy,
    setBulkWhy,
    peekMode,
    setPeekMode,
    draft,
    setDraft,
    armed,
    setArmed,
    values,
    setValues,
    lightboxId,
    setLightboxId,
    fitChip,
    setFitChip,
    reach,
    setReach,
    benchGroup,
    setBenchGroup,
    mapOpen,
    setMapOpen,
    newSearchAt,
    setNewSearchAt,
    mapPick,
    setMapPick,
    chip,
    setChip,
    renaming,
    setRenaming,
    removing,
    setRemoving,
    leadBusy,
    setLeadBusy,
    removeError,
    setRemoveError,
  };
};
export type LeadsState = ReturnType<typeof useLeadsState>;
export type SetLeadLine = Dispatch<SetStateAction<LeadLine | null>>;
