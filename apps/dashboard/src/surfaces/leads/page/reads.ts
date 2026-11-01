/**
 * What the Leads page reads (moved from legacy/pages/leads-real.jsx, decision 0015): one read per view and its filters (the
 * read narrows, 00500), the chips kept in the address, a row's photo asked for as it is rested on, and the cells' context
 * that holds still.
 */
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  leadReachOf,
  leadsRoute,
  type LeadBand,
  type LeadChips,
  type LeadReachFilter,
  type LeadRowVM,
  type LeadSort,
  type PersonRowVM,
} from "@chanlytics/contracts";
import type { TableState } from "../../kit/table/state";
import { refusalToast } from "../../legacy-verbs";
import { placeLoad } from "../../people/shell-verbs";
import type { Flash } from "../../people/types";
import { leadPhotoWarm } from "../peek/seams";
import { leadsMore, leadsView, type LeadsSurface } from "../surface";
import { leadCallHandle } from "../cells/call-menu";
import type { LeadCallHandle, LeadCellCtx } from "../cells/types";
import type { LeadsNav } from "./peek-hooks";
import type { LeadView } from "./state";

/** How long a row is rested on before its photo is asked for: a pointer swept down the list asks for none. */
const PHOTO_REST_MS = 120;

/** How long the box's words wait for quiet before they are read: People's server search waits as long. */
const WORDS_READ_MS = 250;

/** The chips a view's filters name, as its route and its read say them (contracts LeadChips). */
export const leadChipsOf = (n: {
  chip: string | null;
  fitChip: LeadChips["fit"] | null;
  reach: readonly LeadReachFilter[];
}): LeadChips => ({
  ...(n.chip ? { excluded_by: n.chip } : {}),
  ...(n.fitChip ? { fit: n.fitChip } : {}),
  ...(n.reach.length ? { reach: [...n.reach] } : {}),
});

/** The words a view's place keeps (use-place.ts): what its box says again as it opens, and what its read asks. */
const placeWordsOf = (view: string): string => {
  const p = placeLoad("leads", view);
  return p && typeof p.q === "string" ? p.q.trim() : "";
};

/** One key for a set of chips: the route's own segments, so two sets that say the same view are one key. */
const chipsKey = (c: LeadChips) => leadsRoute({ chips: c });

/**
 * One read per view (PRD 0.5, the review's E8): the address says which search, list, class and chips, the box the words,
 * and this member's own view says the sort. Every key goes at once, and the surface drops an answer a newer ask supersedes,
 * so a slow page of the old view never lands on the new one. The words are read once typing stops (WORDS_READ_MS).
 */
export const useLeadsRead = ({
  leadView,
  viewRoute,
  sortBy,
  sortDir,
  plFlash,
  pileList = null,
  chips,
  words,
}: {
  leadView: LeadView;
  viewRoute: string;
  sortBy: string;
  sortDir: string;
  plFlash: Flash;
  /** The pile's list (00426): under its sort, the list its adds go to, which the read puts with the decided. */
  pileList?: string | null;
  /** The view's chips (the table's filters, kept in the address). */
  chips: LeadChips;
  /** The box's words, as typed. */
  words: string;
}) => {
  // The words the read asks, held with the view they were typed in: a view opened reads with the words its place keeps
  // (the box says them again on the same draw's place), at once and never the last view's; typed words after the wait.
  const [asked, setAsked] = useState(() => ({ view: viewRoute, q: words.trim() || placeWordsOf(viewRoute) }));
  const q = asked.view === viewRoute ? asked.q : placeWordsOf(viewRoute);
  useEffect(() => {
    const t = setTimeout(() => setAsked({ view: viewRoute, q: words.trim() }), WORDS_READ_MS);
    return () => clearTimeout(t);
  }, [words]); // eslint-disable-line react-hooks/exhaustive-deps
  const chipped = chipsKey(chips);
  useEffect(() => {
    void leadsView({
      searchId: leadView.searchId,
      list: leadView.list,
      cls: leadView.cls,
      chips,
      q,
      sort: sortBy as LeadSort,
      dir: sortDir === "desc" ? "desc" : "asc",
      pileList,
    });
  }, [viewRoute, chipped, q, sortBy, sortDir, pileList]); // eslint-disable-line react-hooks/exhaustive-deps
  // The next page, its own flag, so the button says Loading… while THIS is out and not while a Keep is, and a second press
  // while it loads asks for nothing.
  const [leadsMoreBusy, setLeadsMoreBusy] = useState(false);
  const loadMore = async () => {
    if (leadsMoreBusy) return;
    setLeadsMoreBusy(true);
    try {
      await leadsMore();
    } catch (e) {
      plFlash(refusalToast({ message: e instanceof Error ? e.message : undefined }, "No more leads loaded"));
    } finally {
      setLeadsMoreBusy(false);
    }
  };
  return { leadsMoreBusy, leadsMore: loadMore, readWords: q };
};

/** One of the band's fits (D5): the strong ones, the ones worth a look, the long shots. */
type LeadFit = LeadBand["fits"][number]["id"];
const NO_REACH: LeadReachFilter[] = [];

/**
 * The page's narrowings, each a filter of the table's (kit/table/state.ts) on its column (cells/columns.tsx): one
 * criterion of the Excluded view (`f_excluded`), a fit, and the Filter's reach (`f_reach`: a checked email, a checked
 * phone, or both). The Filter is kept with the view's place, as the map is, so Back puts it back and another view starts
 * without it.
 */
export const leadNarrowings = (table: TableState) => {
  const reach = table.filterOf("f_reach");
  return {
    chip: (table.filterOf("f_excluded") as string | null) ?? null,
    setChip: (why: string | null) => table.setFilter("f_excluded", why),
    fitChip: (table.filterOf("fit") as LeadFit | null) ?? null,
    setFitChip: (fit: LeadFit | null) => table.setFilter("fit", fit),
    reach: Array.isArray(reach) ? leadReachOf(reach) : NO_REACH,
    setReach: (r: readonly LeadReachFilter[]) => table.setFilter("f_reach", r.length ? leadReachOf(r) : null),
  };
};
export type LeadNarrowings = ReturnType<typeof leadNarrowings>;

/**
 * The chips and the address say one view (00500): a chip, the fit or the Filter picked writes the address in place of the
 * last, so Back is the view before and not the chip before; an address that moved (Back, a link, a rail pick) gives the
 * table its chips. The first draw takes the address's, so a link opens filtered.
 */
export const useLeadChipsAddress = ({
  leadView,
  addrPeek,
  narrow,
  nav,
}: {
  leadView: LeadView;
  addrPeek: string | null;
  narrow: LeadNarrowings;
  nav: LeadsNav;
}) => {
  const inAddress = chipsKey(leadView.chips);
  const asked = leadChipsOf(narrow);
  const inTable = chipsKey(asked);
  // The address's chips last taken in, and the chips this hook wrote to the address and is waiting to see: a draw
  // between the write and the address that follows it is not a Back.
  const seen = useRef<string | null>(null);
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (inAddress !== seen.current) {
      seen.current = inAddress;
      const ours = sent.current === inAddress;
      sent.current = null;
      if (!ours && inAddress !== inTable) {
        narrow.setChip(leadView.chips.excluded_by ?? null);
        narrow.setFitChip(leadView.chips.fit ?? null);
        narrow.setReach(leadView.chips.reach ?? NO_REACH);
      }
      return;
    }
    if (inTable === inAddress || sent.current === inTable) return;
    sent.current = inTable;
    const { searchId, list, cls } = leadView;
    nav(leadsRoute({ searchId, list, cls, chips: asked, peek: addrPeek }), { replace: true });
  }, [inAddress, inTable]); // eslint-disable-line react-hooks/exhaustive-deps
};

/**
 * The leads the read answered, as the table shows them (the read narrows and orders them, 00500). `asked` is whether the
 * box, a chip, a fit or the Filter narrows the view; `narrowed` whether it does and the server has not counted what it
 * keeps: then "all that match" is no claim the bars can make.
 */
export const useLeadRows = ({
  leads,
  leadShown,
  asked,
  chips,
  q,
  leadView,
  sortBy,
  sortDir,
}: {
  leads: LeadsSurface;
  leadShown: LeadRowVM[];
  asked: boolean;
  chips: LeadChips;
  /** The words the read was asked (useLeadsRead's, once typing stopped). */
  q: string;
  leadView: LeadView;
  sortBy: string;
  sortDir: string;
}) => {
  const filtered = asked || !!leadView.cls || leadView.list !== "all";
  const shownIds = leadShown.map((r) => r.id);
  // The surface holds the view the address names with its chips and words, in the order this page asked for: a sort and
  // a filter are reads too (never the page's to re-order or narrow; leads_page is the one rule), and the rows on screen
  // are the last answer until this one lands.
  const { searchId, list, cls } = leadView;
  const viewLanded =
    leads.route === leadsRoute({ searchId, list, cls, chips }) &&
    (leads.view.q ?? "") === q &&
    leads.view.sort === sortBy &&
    leads.view.dir === sortDir;
  const narrowed = asked && !leads.viewCounts;
  return { leadShown, filtered, asked, narrowed, shownIds, viewLanded };
};

/**
 * A lead's band photo, asked for as its row is rested on, touched or reached by Tab (leadPhotoWarm). After a beat and only
 * the last row: a pointer swept down the list passes over every row, and asking for each photo it crossed would be a
 * burst Google's photo service answers with refusals.
 */
const useLeadPhotoWarm = (leadShown: readonly LeadRowVM[]) => {
  const warmRest = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warmLeadPhoto = (id: string) => {
    if (warmRest.current) clearTimeout(warmRest.current);
    warmRest.current = setTimeout(() => {
      warmRest.current = null;
      const r = leadShown.find((x) => x.id === id);
      if (r && r.tile) leadPhotoWarm(r.tile.band);
    }, PHOTO_REST_MS);
  };
  useEffect(
    () => () => {
      if (warmRest.current) clearTimeout(warmRest.current);
    },
    [],
  );
  return warmLeadPhoto;
};

/** The doors a lead's cell calls, the page's latest closures behind one context that holds still. */
type LeadCellDoors = Pick<
  LeadCellCtx,
  | "onWarm"
  | "onOpen"
  | "onOpenPerson"
  | "onExpand"
  | "onCall"
  | "onCopy"
  | "onCopyPhone"
  | "onLogCall"
  | "onKeep"
  | "onExclude"
  | "onPutBack"
>;
type CellValues = Pick<LeadCellCtx, "values" | "mixedFits" | "hasCenter" | "canFind" | "peopleRows" | "stageShown">;
type Kept = (CellValues & { ctx: LeadCellCtx }) | null;

const sameValues = (k: CellValues, v: CellValues) =>
  k.values === v.values &&
  k.mixedFits === v.mixedFits &&
  k.hasCenter === v.hasCenter &&
  k.canFind === v.canFind &&
  k.peopleRows === v.peopleRows &&
  k.stageShown === v.stageShown;

/**
 * A cell context for the Leads scope that changes only when a value a cell draws from changes. The doors go to the page's
 * latest closures through `acts`, so the object itself is kept across draws (in `kept`) and a memoised row handed it is
 * left alone. People's rows ride in it (a converted lead's Client pill reads the person's deal, 0004): People publishes a
 * fresh array each time it lands, so the context is new then and the rows redraw -- on a cold load of Leads the rows paint
 * before the people. `stageShown` is whether the Stage column is drawn: then it says each lead's state, and the name's tag
 * gives way, so a row says it once. `callMenu` ties
 * the rows' Call to their one menu, the same handle for the page's life.
 */
const leadCellCtxFor = (
  acts: RefObject<LeadCellDoors | null>,
  kept: RefObject<Kept>,
  v: {
    values: boolean;
    mixedFits: boolean;
    hasCenter: boolean;
    canFind: boolean;
    peopleRows: readonly PersonRowVM[];
    stageShown?: boolean;
  },
  callMenu: LeadCallHandle,
): LeadCellCtx => {
  const now: CellValues = { ...v, stageShown: v.stageShown ?? false };
  const k = kept.current;
  if (k && sameValues(k, now)) return k.ctx;
  const door = (name: keyof LeadCellDoors) => (id: string) => {
    const a = acts.current;
    if (a) a[name](id);
  };
  const ctx: LeadCellCtx = {
    onOpen: door("onOpen"),
    onOpenPerson: door("onOpenPerson"),
    onExpand: door("onExpand"),
    ...now,
    onCall: door("onCall"),
    onCopy: door("onCopy"),
    onCopyPhone: door("onCopyPhone"),
    onLogCall: door("onLogCall"),
    // The row under a pointer or a finger, or reached by Tab (people/table/table.tsx): its photo is asked for before a press.
    onWarm: door("onWarm"),
    onKeep: door("onKeep"),
    onExclude: door("onExclude"),
    onPutBack: door("onPutBack"),
    callMenu,
  };
  kept.current = { ...now, ctx };
  return ctx;
};

/**
 * The cells' context for this draw: the page's acts behind doors that hold still (the refs), the row's photo asked for as
 * it is rested on, and the values a cell draws from. What a cell needs, kept while nothing it draws from changed.
 */
export const useLeadCells = ({
  leadShown,
  doors,
  values,
}: {
  leadShown: readonly LeadRowVM[];
  doors: Omit<LeadCellDoors, "onWarm">;
  values: Parameters<typeof leadCellCtxFor>[2];
}): LeadCellCtx => {
  const acts = useRef<LeadCellDoors | null>(null);
  const kept = useRef<Kept>(null);
  const warm = useLeadPhotoWarm(leadShown);
  const [callMenu] = useState(leadCallHandle);
  acts.current = { onWarm: warm, ...doors };
  return leadCellCtxFor(acts, kept, values, callMenu);
};
