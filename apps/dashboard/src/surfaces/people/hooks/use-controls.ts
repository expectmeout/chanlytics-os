/**
 * A list page's controls, before it knows its rows (moved whole from legacy/pages/people.jsx usePlControls, decision
 * 0015; its table's state is the kit's since decision 0083).
 * - scope: "people" | "leads" | "pipeline", whose saved view this is (memberships.views, and this device's copy).
 * - cols: every column the page declares; colCtx: what the workspace is, which says which of them it shows.
 * - people: the People surface, which carries the workspace's copy of every view, Leads' included.
 * - sortFirst: `{ by, dir }`, the sort before anyone chose one; sortThen: the page's tiebreak after it.
 * - railRow: under Leads, the rail's row, which its saved view carries too.
 * - extraDefaults: the page's own keys in its saved view, beside the sort and the columns, with their defaults (the
 *   Pipeline's `{ layout }`). A value of another type than its default's is not the member's choice, and the default stands.
 *
 * The sort, the words, the filters, the columns, their widths and order and the selection are the table's state, in the
 * kit's atoms (kit/table/state.ts), made here before the rows; what this hook hands the page of them (`sel`, `q`,
 * `sortBy`) is read from those atoms, never a copy. Beside them it keeps what is the page's: a phone's sheet and Select
 * mode, the toast, the claim that "all N that match" are picked, and the box's and the pane's elements.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { canDo } from "../../legacy-verbs";
import {
  columnsIn,
  shownColumnsOf,
  sortShownOf,
  type DataColumn,
  type SortDir,
  type TableRow,
} from "../../kit/table/columns";
import { sortingFor, useTableState, type SortThen } from "../../kit/table/state";
import type { View, ViewStore } from "../../kit/table/view";
import { PL_NO_PEOPLE, PL_PHONE_QUERY, plPhoneNow } from "../words";
import { usePeopleToast } from "../shell-verbs";
import type { PeopleRead } from "../types";
import { heardListScroll } from "./scroller";
import { plLoadView, plSaveView, plViewSaver } from "./view-store";

/** How long after a list stops scrolling it stops being said to (the pane's data-scrolling, which hides the hover tips). */
const SCROLLING_CLEARS_MS = 160;

/** Where People's three scopes keep their views: this device, and the workspace one save at a time. */
const VIEW_STORE: ViewStore = { load: plLoadView, save: plSaveView, saver: plViewSaver };

interface ControlsArgs<R extends TableRow, X, C> {
  scope: string;
  cols: readonly DataColumn<R, X, C>[];
  colCtx: C;
  people: PeopleRead;
  sortFirst: { by: string; dir: SortDir };
  sortThen?: SortThen;
  railRow?: string | null;
  extraDefaults?: View | null;
}

/** A desk's columns where a phone draws cards. */
const NO_COLUMNS: readonly never[] = [];

/** A selection's sheet, Select people, and whether the window is a phone's width. */
function usePhoneControls() {
  // A selection on a phone: the step its sheet is on (null when shut), and More › Select people, a selection begun with
  // nobody picked yet. The page's, so its one keyboard listener shuts the sheet on Esc and the sheet is hookless.
  const [bulkSheet, setBulkSheet] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [phone, setPhone] = useState(plPhoneNow);
  useEffect(() => {
    const mq = window.matchMedia ? window.matchMedia(PL_PHONE_QUERY) : null;
    if (!mq || !mq.addEventListener) return undefined;
    const on = () => setPhone(!!mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return { bulkSheet, setBulkSheet, selectMode, setSelectMode, phone };
}

/**
 * The box's and the pane that scrolls. D5: a list that is moving shows no hover: the pane carries data-scrolling while
 * the list scrolls, and the tips and cards hide under it (leads.css). Heard where the list's box scrolls
 * (heardListScroll): on a desktop the table's own, inside the pane, whose scroll the pane never heard, so the cards stayed
 * up over a moving list; on a phone the window. A menu scrolling inside the pane is not the list moving. One listener for
 * the page's life, taken down with it.
 */
function useSearchAndScroll() {
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !el.addEventListener) return undefined;
    let t: ReturnType<typeof setTimeout> | null = null;
    const stop = heardListScroll(el, () => {
      el.setAttribute("data-scrolling", "1");
      if (t) clearTimeout(t);
      t = setTimeout(() => el.removeAttribute("data-scrolling"), SCROLLING_CLEARS_MS);
    });
    return () => {
      stop();
      if (t) clearTimeout(t);
    };
  }, []);
  return { searchRef, scrollRef };
}

export function usePlControls<R extends TableRow, X, C>(args: ControlsArgs<R, X, C>) {
  const { cols, colCtx, people, sortFirst } = args;
  const phoneState = usePhoneControls();
  const { phone, setSelectMode, setBulkSheet } = phoneState;
  const canExport = canDo("export");
  const [toastNode, plFlash] = usePeopleToast();
  const landed = people !== PL_NO_PEOPLE;
  const table = useTableState({
    scope: args.scope,
    columns: cols,
    first: sortFirst,
    sortThen: args.sortThen,
    saved: ((landed && people.views && people.views[args.scope]) || null) as View | null,
    landed,
    store: VIEW_STORE,
    railRow: args.railRow,
    extraDefaults: args.extraDefaults,
  });
  // "Select all 1,240 that match": the bulk bar hands the view's filters to the server instead of a list of ids. A claim
  // about the server's view, not the table's state (kit/table/state.ts).
  const [allMatching, setAllMatching] = useState(false);
  // Clearing a selection lets go of everything that came with it: the view "all N that match" stood for, the
  // Select-people mode and the sheet's step. Esc, ✕ and Clear all clear it here.
  const clearSelection = () => {
    table.setSelected(new Set());
    setAllMatching(false);
    setSelectMode(false);
    setBulkSheet(null);
  };
  const search = useSearchAndScroll();
  // The columns this workspace declares (Visits needs a calendar), each headed in its words; held still while what the
  // workspace is does not change, so a memoised row sees the same list from one draw to the next.
  const colKey = JSON.stringify(colCtx);
  const declared = useMemo(() => columnsIn(cols, colCtx), [cols, colKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // The columns a desk draws: every one this scope can show that this member has not turned off, in their order. A
  // phone draws one card a row instead, and its sort is its menu's.
  const deskColumns = useMemo(
    () => shownColumnsOf(declared, table.visibility, table.order),
    [declared, table.visibility, table.order],
  );
  const chosen = table.chosen;
  // The order a desk's table stands in is one its member can see (sortShownOf); the member's sort stays theirs.
  const shown = phone ? chosen : sortShownOf(deskColumns, chosen, sortFirst);
  // What the table sorts by: the order it shows, with the page's tiebreak (kit/table/use-data-table.ts `sorting`).
  const applied = useMemo(
    () => sortingFor(shown.by, shown.dir, table.sortThen),
    [shown.by, shown.dir], // eslint-disable-line react-hooks/exhaustive-deps -- the tiebreak is the page's for its life
  );
  return {
    phone,
    bulkSheet: phoneState.bulkSheet,
    setBulkSheet,
    selectMode: phoneState.selectMode,
    setSelectMode,
    canExport,
    toastNode,
    plFlash,
    /** The table's state: what the table and its Columns menu are drawn from. */
    table,
    declared,
    sel: table.selected,
    setSel: table.setSelected,
    toggleSel: table.toggleSelected,
    allMatching,
    setAllMatching,
    clearSelection,
    sortBy: shown.by,
    sortDir: shown.dir,
    applied,
    /** A press on a heading: the one lit turns its order round, whichever the member last chose. */
    onSort: (key: string) => table.pressSort(key, shown),
    /** A sort the member picked from a menu rather than a heading (a phone's more-menu): theirs, like a heading's. */
    pickSort: (by: string, dir: string) => table.setSort(by, dir === "desc" ? "desc" : "asc"),
    columns: phone ? NO_COLUMNS : deskColumns,
    // What a file of the people shown follows: the desk's columns, whichever the screen draws.
    fileColumns: deskColumns,
    q: table.words,
    setQ: table.setWords,
    searchRef: search.searchRef,
    scrollRef: search.scrollRef,
    extraView: table.extra,
    setExtraView: table.setExtra,
  };
}
