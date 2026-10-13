/**
 * What the Leads page reads (moved from legacy/pages/leads-real.jsx, decision 0015): one read per view, the rows the box
 * and the chips leave shown, a row's photo asked for as it is rested on, and the cells' context that holds still.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { LeadRowVM, LeadSort, PersonRowVM } from "@chanlytics/contracts";
import { refusalToast } from "../../legacy-verbs";
import type { Flash } from "../../people/types";
import { leadPhotoWarm } from "../peek/seams";
import { leadsMore, leadsView, type LeadsSurface } from "../surface";
import { leadCallHandle } from "../cells/call-menu";
import type { LeadCallHandle, LeadCellCtx } from "../cells/types";
import type { ReachOutLines } from "../reach-out/lines";
import type { LeadView } from "./state";

/** How long a row is rested on before its photo is asked for: a pointer swept down the list asks for none. */
const PHOTO_REST_MS = 120;

/**
 * One read per view (PRD 0.5, the review's E8): the address says which search, list and class, and this member's own
 * view says the sort. Every key goes at once, and the surface drops an answer a newer ask supersedes, so a slow page of
 * the old view never lands on the new one.
 */
export const useLeadsRead = ({
  leadView,
  viewRoute,
  sortBy,
  sortDir,
  plFlash,
  pileList = null,
}: {
  leadView: LeadView;
  viewRoute: string;
  sortBy: string;
  sortDir: string;
  plFlash: Flash;
  /** The pile's list (00423): under its sort, the list its adds go to, which the read puts with the decided. */
  pileList?: string | null;
}) => {
  useEffect(() => {
    void leadsView({
      searchId: leadView.searchId,
      list: leadView.list,
      cls: leadView.cls,
      chips: {},
      sort: sortBy as LeadSort,
      dir: sortDir === "desc" ? "desc" : "asc",
      pileList,
    });
  }, [viewRoute, sortBy, sortDir, pileList]); // eslint-disable-line react-hooks/exhaustive-deps
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
  return { leadsMoreBusy, leadsMore: loadMore };
};

/**
 * The leads loaded, filtered at once by the box (their name, their kind and their area) and by one criterion of the
 * Excluded view. A sentence is not sent anywhere: words to chips is release C.
 */
export const useLeadRows = ({
  leads,
  q,
  chip,
  fitChip,
  leadView,
  viewRoute,
  sortBy,
  sortDir,
}: {
  leads: LeadsSurface;
  q: string;
  chip: string | null;
  fitChip: string | null;
  leadView: LeadView;
  viewRoute: string;
  sortBy: string;
  sortDir: string;
}) => {
  const leadShown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = leads.rows;
    if (chip) list = list.filter((l) => l.excludedBy === chip);
    if (fitChip) list = list.filter((l) => l.fit === fitChip);
    if (!needle) return list;
    return list.filter(
      (l) =>
        l.name.toLowerCase().includes(needle) ||
        (l.category || "").toLowerCase().includes(needle) ||
        (l.area || "").toLowerCase().includes(needle),
    );
  }, [leads.rows, q, chip, fitChip]);
  const filtered = !!q.trim() || !!chip || !!fitChip || !!leadView.cls || leadView.list !== "all";
  const shownIds = leadShown.map((r) => r.id);
  // The surface holds the view the address names, in the order this page asked for: a sort is a read too (never the
  // page's to re-order; leads_page's order is the one rule), and the rows on screen are the old order until it lands.
  const viewLanded = leads.route === viewRoute && leads.view.sort === sortBy && leads.view.dir === sortDir;
  return { leadShown, filtered, shownIds, viewLanded };
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
type CellValues = Pick<
  LeadCellCtx,
  "values" | "mixedFits" | "hasCenter" | "canFind" | "peopleRows" | "stageShown" | "reachOut"
>;
type Kept = (CellValues & { ctx: LeadCellCtx }) | null;

const sameValues = (k: CellValues, v: CellValues) =>
  k.values === v.values &&
  k.mixedFits === v.mixedFits &&
  k.hasCenter === v.hasCenter &&
  k.canFind === v.canFind &&
  k.peopleRows === v.peopleRows &&
  k.stageShown === v.stageShown &&
  k.reachOut === v.reachOut;

/**
 * A cell context for the Leads scope that changes only when a value a cell draws from changes. The doors go to the page's
 * latest closures through `acts`, so the object itself is kept across draws (in `kept`) and a memoised row handed it is
 * left alone. People's rows ride in it (a converted lead's Client pill reads the person's deal, 0004): People publishes a
 * fresh array each time it lands, so the context is new then and the rows redraw -- on a cold load of Leads the rows paint
 * before the people. `stageShown` is whether the Stage column is drawn: then it says each lead's state, and the name's tag
 * gives way, so a row says it once. `reachOut` is the open search's reach-out lines (Reach out Part 6, H8). `callMenu` ties
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
    reachOut?: ReachOutLines | null;
  },
  callMenu: LeadCallHandle,
): LeadCellCtx => {
  const now: CellValues = { ...v, stageShown: v.stageShown ?? false, reachOut: v.reachOut ?? null };
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
