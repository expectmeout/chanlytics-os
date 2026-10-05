/**
 * A list page's controls, before it knows its rows (moved whole from legacy/pages/people.jsx usePlControls, decision
 * 0015).
 * - scope: "people" | "leads" | "pipeline", whose saved view this is (memberships.views, and this device's copy).
 * - cols, phoneCols: the columns a desktop may show, and a phone's one cell a row.
 * - colCtx: what a column's default depends on, `{ withCalendar }` or `{ hasCenter }`.
 * - people: the People surface, which carries the workspace's copy of every view, Leads' included.
 * - sortFirst: `{ by, dir }`, the sort before anyone chose one.
 * - railRow: under Leads, the rail's row, which its saved view carries too.
 * - extraDefaults: the page's own keys in its saved view, beside the sort and the columns, with their defaults (the
 *   Pipeline's `{ layout }`). A value of another type than its default's is not the member's choice, and the default stands.
 * The hooks are called in the order the one function called them: the width, the toast, the selection, the saved sort
 * and columns, the words in the box.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canDo } from "../../legacy-verbs";
import { PL_NO_PEOPLE, PL_PHONE_QUERY, plPhoneNow } from "../words";
import { usePeopleToast } from "../shell-verbs";
import {
  plColumnChoices,
  plColumnOptions,
  plDrawnColumns,
  plLocked,
  plShownColumns,
  plShows,
  plSortKeys,
} from "../table/columns";
import type { ColCtx, PeopleRead, TableColumn, TableCtx, TableRow } from "../types";
import { ldScroller } from "./scroller";
import { plLoadView, plSaveView, plViewSaver } from "./view-store";

/** How long after a list stops scrolling it stops being said to (the pane's data-scrolling, which hides the hover tips). */
const SCROLLING_CLEARS_MS = 160;

interface ControlsArgs<R extends TableRow, X extends TableCtx> {
  scope: string;
  cols: readonly TableColumn<R, X>[];
  phoneCols: readonly TableColumn<R, X>[];
  colCtx: ColCtx;
  people: PeopleRead;
  sortFirst: { by: string; dir: string };
  railRow?: string | null;
  extraDefaults?: Record<string, unknown> | null;
}

type View = Record<string, unknown>;

/** The phone's search (open, the bar is the field), a selection's sheet, Select people, and whether the window is a phone's width. */
function usePhoneControls() {
  // The phone's search: open, the bar is the field (PeoplePhoneBar). Words in the box keep it open.
  const [searchOpen, setSearchOpen] = useState(false);
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
  return { searchOpen, setSearchOpen, bulkSheet, setBulkSheet, selectMode, setSelectMode, phone };
}

/**
 * The selection, by id. Cleared when the view changes: a bar counting people that are no longer on screen is the kind of
 * bug bulk actions are made of. `toggleSel` is one function for the page's life: a memoised row is handed it, and a new
 * one every draw would redraw every row on every draw.
 */
function useSelection() {
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const toggleSel = useCallback(
    (id: string) =>
      setSel((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    [],
  );
  // "Select all 1,240 that match": the bulk bar hands the view's filters to the server instead of a list of ids.
  const [allMatching, setAllMatching] = useState(false);
  return { sel, setSel, toggleSel, allMatching, setAllMatching };
}

/**
 * The view the workspace remembers for this member, the sort and the columns, and what is saved of them. The view
 * (memberships.views, read with the surface) wins over what this device remembers; the device copy stays as the fallback.
 * A view is the sort and the columns, and under Leads the rail's row. Every save sends every key the page owns, because
 * member_view_set replaces the page's whole object (00113): a save of the sort alone would lose the columns.
 */
function useSavedView<R extends TableRow, X extends TableCtx>({
  scope,
  cols,
  people,
  sortFirst,
  railRow = null,
  extraDefaults = null,
}: ControlsArgs<R, X>) {
  const remembered = useMemo<View>(
    () => ({ ...plLoadView(scope), ...((people.views && people.views[scope]) || {}) }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // The sort as the page starts it: the member's where it is one this page can draw, else the page's own first.
  const firstBy = plSortKeys(cols).includes(remembered.sortBy as string) ? (remembered.sortBy as string) : sortFirst.by;
  const firstDir = remembered.sortDir === "asc" || remembered.sortDir === "desc" ? remembered.sortDir : sortFirst.dir;
  const [sortBy, setSortBy] = useState(firstBy);
  const [sortDir, setSortDir] = useState(firstDir);
  // The columns this member chose to show or hide with the Columns menu; a column they never touched keeps its default
  // (PL_COLUMNS). The menu's open state is the page's, so its one keyboard listener closes it on Esc.
  const [colChoices, setColChoices] = useState(() => plColumnChoices(cols, remembered.columns));
  const [colsOpen, setColsOpen] = useState(false);
  // Whether the table has scrolled sideways, for the hairline beside Person: kept here so the table stays hookless.
  const [scrolledX, setScrolledX] = useState(false);
  const pickExtra = (v: View | null): View | null => {
    if (!extraDefaults) return null;
    const out: View = {};
    for (const k of Object.keys(extraDefaults))
      out[k] = v && typeof v[k] === typeof extraDefaults[k] ? v[k] : extraDefaults[k];
    return out;
  };
  const [extraView, setExtraViewState] = useState(() => pickExtra(remembered));
  const viewAs = (v: {
    by: string;
    dir: string;
    columns: Record<string, boolean>;
    row: string | null | undefined;
    extra: View | null;
  }): View => ({
    ...(scope === "leads"
      ? { list: v.row, sortBy: v.by, sortDir: v.dir, columns: v.columns }
      : { sortBy: v.by, sortDir: v.dir, columns: v.columns }),
    ...(v.extra || {}),
  });
  // What the server is taken to hold: the view as the page starts it, so a view nobody touched is never written back.
  const savedView = useRef(
    JSON.stringify(
      viewAs({
        by: firstBy,
        dir: firstDir,
        columns: plColumnChoices(cols, remembered.columns),
        row: (remembered.list as string) || "all",
        extra: pickExtra(remembered),
      }),
    ),
  );
  // One saver for the page's life, so its saves go one at a time (plViewSaver), and it saves THIS scope's view: People's is
  // views.people, the Leads scope's is views.leads, and the page is remounted when the scope changes.
  const viewSaver = useRef<ReturnType<typeof plViewSaver> | null>(null);
  if (!viewSaver.current) viewSaver.current = plViewSaver(scope);
  // The workspace's copy of every view rides with the People surface. On a cold open of Leads that surface lands AFTER the
  // page is up, so `remembered` above had only this device's copy to go on -- and the page then SAVED that copy, or its
  // defaults, over what the member had chosen on another computer. Until the workspace's copy has been seen nothing is
  // saved back, unless the owner chose a sort or a column here, which stands. When the copy arrives it is taken, once;
  // taking it is not a change to save back either.
  const peopleLanded = people !== PL_NO_PEOPLE;
  const serverView = ((peopleLanded && people.views && people.views[scope]) || null) as View | null;
  const viewKnown = useRef(peopleLanded);
  const viewTouched = useRef(false);
  useEffect(() => {
    if (viewKnown.current || !peopleLanded) return;
    viewKnown.current = true;
    if (viewTouched.current || !serverView) return;
    const by = plSortKeys(cols).includes(serverView.sortBy as string) ? (serverView.sortBy as string) : sortBy;
    const dir = serverView.sortDir === "asc" || serverView.sortDir === "desc" ? serverView.sortDir : sortDir;
    const columns = plColumnChoices(cols, serverView.columns);
    const extra = pickExtra(serverView);
    savedView.current = JSON.stringify(viewAs({ by, dir, columns, row: railRow, extra }));
    setSortBy(by);
    setSortDir(dir);
    setColChoices(columns);
    if (extra) setExtraViewState(extra);
  }, [peopleLanded]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const view = viewAs({ by: sortBy, dir: sortDir, columns: colChoices, row: railRow, extra: extraView });
    plSaveView(scope, view);
    // The workspace's copy, once per change and never for the view it already holds. The choices change only when what
    // they say does (pickColumn keeps them for Person), so this runs once per change.
    const key = JSON.stringify(view);
    if (key === savedView.current) return;
    if (!viewKnown.current && !viewTouched.current) return;
    savedView.current = key;
    if (viewSaver.current) viewSaver.current(view);
  }, [sortBy, sortDir, colChoices, railRow, JSON.stringify(extraView)]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    sortBy,
    setSortBy,
    sortDir,
    setSortDir,
    colChoices,
    setColChoices,
    colsOpen,
    setColsOpen,
    scrolledX,
    setScrolledX,
    extraView,
    setExtraViewState,
    viewTouched,
  };
}

/**
 * The words in the box, and the pane that scrolls. D5: a list that is moving shows no hover: the pane carries
 * data-scrolling while the list scrolls, and the tips and cards hide under it (leads.css). Heard on the pane in the
 * capture phase: a scroll does not bubble, and on a desktop the box that scrolls is the table's own, inside the pane, so
 * the pane's own scroll never came and the cards stayed up over a moving list. Only the list's box counts (ldScroller): a
 * menu scrolling inside the pane is not the list moving. One listener for the page's life, taken down with it.
 */
function useSearchAndScroll() {
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !el.addEventListener) return undefined;
    let t: ReturnType<typeof setTimeout> | null = null;
    const on = (e: Event) => {
      if (!e || !e.target || e.target !== ldScroller(el)) return;
      el.setAttribute("data-scrolling", "1");
      if (t) clearTimeout(t);
      t = setTimeout(() => el.removeAttribute("data-scrolling"), SCROLLING_CLEARS_MS);
    };
    el.addEventListener("scroll", on, { passive: true, capture: true });
    return () => {
      el.removeEventListener("scroll", on, { capture: true });
      if (t) clearTimeout(t);
    };
  }, []);
  return { q, setQ, searchRef, scrollRef };
}

export function usePlControls<R extends TableRow, X extends TableCtx>(args: ControlsArgs<R, X>) {
  const { cols, phoneCols, colCtx } = args;
  const phoneState = usePhoneControls();
  const { phone, setSelectMode, setBulkSheet } = phoneState;
  const canExport = canDo("export");
  const [toastNode, plFlash] = usePeopleToast();
  const selection = useSelection();
  const { setSel, setAllMatching } = selection;
  // Clearing a selection lets go of everything that came with it: the view "all N that match" stood for, the
  // Select-people mode and the sheet's step. Esc, ✕ and Clear all clear it here.
  const clearSelection = () => {
    setSel(new Set());
    setAllMatching(false);
    setSelectMode(false);
    setBulkSheet(null);
  };
  const view = useSavedView(args);
  const { viewTouched, setSortBy, setSortDir, setColChoices, setExtraViewState, sortBy, colChoices } = view;
  const search = useSearchAndScroll();
  const onSort = (key: string) => {
    viewTouched.current = true;
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    // A name starts at A, the soonest visit first, and the Pipeline's Stage in its own order and its next step the
    // soonest first (Leads' stage column is a rank of its own, most first); any other number, most first.
    else {
      setSortBy(key);
      setSortDir(
        key === "name" || key === "visits" || (args.scope === "pipeline" && (key === "stage" || key === "next"))
          ? "asc"
          : "desc",
      );
    }
  };
  // A sort the member picked from a menu rather than a heading (a phone's more-menu): theirs, like a heading's.
  const pickSort = (by: string, dir: string) => {
    viewTouched.current = true;
    setSortBy(by);
    setSortDir(dir);
  };
  // One of the page's own keys, chosen: theirs, saved with the rest of the view.
  const setExtraView = (patch: Record<string, unknown>) => {
    viewTouched.current = true;
    setExtraViewState((x) => ({ ...(x || {}), ...patch }));
  };
  // The columns drawn (every one this scope can show, those this member turned off marked for a desktop to hide). Kept
  // while nothing they are made of changed, so a memoised row sees the same list from one draw to the next. On a phone
  // both scopes draw one cell a row, People's: plCardCell for a person, ldCardCell (leads-cells.jsx) for a lead, one
  // plRowCard between them.
  const colKey = JSON.stringify(colCtx);
  const columns = useMemo(
    () => (phone ? phoneCols : plShownColumns(plDrawnColumns(cols, colChoices, colCtx), phone)),
    [cols, colChoices, colKey, phone], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const colOptions = plColumnOptions(cols, colChoices, colCtx);
  // Show or hide one column; Person and the row's actions are not the member's to hide. A column put back the way its
  // default has it is no choice any more, so it follows the default again: a receptionist turned off and on again gives
  // way to Visits once a calendar connects, as it does for everyone.
  const pickColumn = (key: string) =>
    setColChoices((ch) => {
      viewTouched.current = true;
      const c = cols.find((x) => x.key === key);
      if (!c || plLocked(c)) return ch;
      const on = !plShows(c, ch, colCtx);
      const rest = { ...ch };
      delete rest[key];
      return on === plShows(c, {}, colCtx) ? rest : { ...rest, [key]: on };
    });
  // Where Esc puts focus when it closes the menu: back on the button that opened it.
  const colsButton = useRef<HTMLButtonElement>(null);
  return {
    phone,
    searchOpen: phoneState.searchOpen,
    setSearchOpen: phoneState.setSearchOpen,
    bulkSheet: phoneState.bulkSheet,
    setBulkSheet,
    selectMode: phoneState.selectMode,
    setSelectMode,
    canExport,
    toastNode,
    plFlash,
    sel: selection.sel,
    setSel,
    toggleSel: selection.toggleSel,
    allMatching: selection.allMatching,
    setAllMatching,
    clearSelection,
    sortBy,
    setSortBy,
    sortDir: view.sortDir,
    setSortDir,
    onSort,
    pickSort,
    colsOpen: view.colsOpen,
    setColsOpen: view.setColsOpen,
    scrolledX: view.scrolledX,
    setScrolledX: view.setScrolledX,
    columns,
    colOptions,
    pickColumn,
    colsButton,
    q: search.q,
    setQ: search.setQ,
    searchRef: search.searchRef,
    scrollRef: search.scrollRef,
    extraView: view.extraView,
    setExtraView,
  };
}
