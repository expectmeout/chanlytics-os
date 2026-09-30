/**
 * The rows' place, once the view has worked out its rows: the cursor, where each view was left, the first rows, and the
 * page's one keyboard listener (moved whole from legacy/pages/people.jsx usePlPlace, decision 0015).
 * - controls: usePlControls' answer, whose words, selection and scrolling pane these are.
 * - page: "people" | "leads" | "pipeline", whose places the tab keeps (tab-memory.ts); view: the view the rows are of.
 * - ids: the rows shown, in their order. noun: what the table calls a row (table.tsx), its rows' id.
 * - landed: whether the rows on screen are this view's, in the order asked; a place's scroll waits for them.
 * - selectionOf: what a selection belongs to; when it changes, the selection goes.
 * - extra, onPlace(p, again): what else a view's place holds (Leads' map), and the view's own part of putting one back
 *   (`again`: a view opened after the first).
 * - windowed: a long list draws a window of its rows (PL_WINDOW_ROWS), grown as its foot comes near and as the cursor walks
 *   past it; false for a table in sections (the Pipeline's groups), which draws every row after its first frame.
 *   Said by every caller: a default would be a branch of this function's, which is at its cap.
 * The hooks are called in the order the one function called them.
 */
import { useEffect, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { placeLoad, placeSave } from "../shell-verbs";
import type { Place } from "../shell-verbs";
import { usePlRowWindow } from "../table/row-window";
import { onPageKey } from "./keyboard";
import type { KeyDoors } from "./keyboard";
import { ldScroller } from "./scroller";

/** How long a scroll is left to settle before the view's place is kept. */
const PLACE_SAVE_DELAY_MS = 200;

/** What the page's one hook of controls hands this hook: the words in the box, the selection, the menu and the scrolling pane. */
export interface PlaceControls {
  phone: boolean;
  setSearchOpen: Dispatch<SetStateAction<boolean>>;
  setBulkSheet: Dispatch<SetStateAction<string | null>>;
  selectMode: boolean;
  setSelectMode: Dispatch<SetStateAction<boolean>>;
  sel: ReadonlySet<string>;
  setSel: Dispatch<SetStateAction<Set<string>>>;
  toggleSel: (id: string) => void;
  setAllMatching: Dispatch<SetStateAction<boolean>>;
  clearSelection: () => void;
  colsOpen: boolean;
  setColsOpen: Dispatch<SetStateAction<boolean>>;
  colsButton: RefObject<HTMLButtonElement | null>;
  q: string;
  setQ: Dispatch<SetStateAction<string>>;
  searchRef: RefObject<HTMLInputElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
}
type Controls = PlaceControls;

interface PlaceArgs {
  controls: Controls;
  page: string;
  view: string;
  ids: readonly string[];
  noun: string;
  landed?: boolean;
  selectionOf: string;
  extra?: Record<string, unknown> | null;
  onPlace?: ((p: Place, again: boolean) => void) | null;
  windowed: boolean;
}

/**
 * The selection goes with the VIEW, not with the words in the box: someone who selects forty, types a name to find two
 * more and clears it again still has their forty. Both bars count and act on only the rows they show (shown AND
 * selected), so a row the words hide is never acted on unseen; "all N that match" is a claim about what is shown, so the
 * words do take that back.
 */
function useSelectionResets(controls: Controls, selectionOf: string) {
  const { setBulkSheet, setSelectMode, setSel, setAllMatching, q } = controls;
  useEffect(() => {
    setSel(new Set());
    setAllMatching(false);
    setSelectMode(false);
    setBulkSheet(null);
  }, [selectionOf]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setAllMatching(false);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * The cursor, and the rows drawn: a window of a long list, reaching a place that is to be put back. The cursor's row takes
 * focus, so a screen reader says it and Tab carries on from it, and is scrolled to (under the sticky header:
 * scroll-padding-top). Not when focus is already on it or in it: a row focused by Tab or a click put the cursor here
 * itself (onFocus). A cursor that came back with the view (the page keeps the owner's place, below) marks its row and
 * takes nothing: the list has just been put back where it was, and a scrollIntoView after that moved it on again.
 */
function useCursor({
  page,
  view,
  ids,
  noun,
  windowed,
}: Pick<PlaceArgs, "page" | "view" | "ids" | "noun" | "windowed">) {
  const [cursor, setCursor] = useState<string | null>(null);
  // The rows drawn: a window of a long list (table/row-window.ts), reaching a place that is to be put back.
  const [place] = useState(() => placeLoad(page, view));
  const { budget: rowBudget, reach } = usePlRowWindow({ place, windowed, ids, cursor });
  useEffect(() => {
    setCursor((c) => (c && ids.includes(c) ? c : null));
  }, [ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const moveCursor = (step: number) => {
    // A row the cursor walks to is drawn: the window reaches past it, so the row is there to take focus.
    reach((cursor === null ? -1 : ids.indexOf(cursor)) + step);
    setCursor((c) => {
      const i = c ? ids.indexOf(c) : -1;
      return ids[step > 0 ? Math.min(ids.length - 1, i + 1) : Math.max(0, i - 1)] ?? null;
    });
  };
  const cursorCameBack = useRef<string | null>(null);
  useEffect(() => {
    if (!cursor || !document.getElementById) return;
    if (cursorCameBack.current === cursor) {
      cursorCameBack.current = null;
      return;
    }
    cursorCameBack.current = null;
    // The row's id wears the table's own noun (table.tsx), so the cursor and the peek's focus rule find the same element
    // under Leads as under People.
    const row = document.getElementById(`${noun}-${cursor}`);
    const active = document.activeElement;
    if (!row || row === active || (active && row.contains && row.contains(active))) return;
    if (row.focus) row.focus({ preventScroll: true });
    if (row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
  }, [cursor]); // eslint-disable-line react-hooks/exhaustive-deps
  return { cursor, setCursor, rowBudget, reach, moveCursor, cursorCameBack };
}

/**
 * The page keeps the owner's place in each view (placeLoad), each with its own words in the box, its cursor and its
 * scroll, and under Leads its map. Leads stays mounted from one view to the next, so a view that is opened -- by the first
 * draw, the rail, Back -- is given ITS place, or none, and never the last view's filters. People's views keep theirs the
 * same way: everyone, a smart list, a kept list or a state -- a search typed on a list was gone after a trip to a profile.
 */
function usePlaceKeeper(
  a: Pick<PlaceArgs, "controls" | "page" | "view" | "landed" | "extra" | "onPlace">,
  cursor: {
    cursor: string | null;
    setCursor: (c: string | null) => void;
    reach: (i: number) => void;
    cursorCameBack: { current: string | null };
  },
) {
  const { controls, page, view, landed = true, extra = null, onPlace = null } = a;
  const { q, setQ, scrollRef } = controls;
  const placeOf = useRef<string | undefined>(undefined); // the view whose place the state below holds
  const placeNow = useRef<{ view: string; place: Place } | null>(null); // that view and its place as last drawn: what a scroll is saved with
  const placeTop = useRef(0);
  const placeDue = useRef<{ view: string; top: number; q: string; fresh: boolean } | null>(null); // a scroll position waiting for its view's rows
  useEffect(() => {
    const p = placeLoad(page, view) || {};
    setQ((p.q as string) || "");
    cursor.cursorCameBack.current = (p.cursor as string) || null;
    cursor.setCursor((p.cursor as string) || null);
    if (onPlace) onPlace(p, placeOf.current !== undefined);
    placeTop.current = (p.top as number) || 0;
    cursor.reach(Math.ceil(placeTop.current / 40));
    placeDue.current = { view, top: (p.top as number) || 0, q: (p.q as string) || "", fresh: true };
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  // Saved as it changes. The draw that opens a view still holds the last view's state, so it saves nothing.
  const extraKey = extra ? JSON.stringify(extra) : "";
  useEffect(() => {
    if (placeOf.current !== view) {
      placeOf.current = view;
      return;
    }
    placeSave(page, view, { q, cursor: cursor.cursor, ...extra, top: placeTop.current });
  }, [view, q, cursor.cursor, extraKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (placeOf.current === view) placeNow.current = { view, place: { q, cursor: cursor.cursor, ...extra } };
  // The list goes back to where it was once the rows on screen are this view's (the surface says which view it holds) AND
  // are the ones its own words leave. Scrolled before the view landed, it would be the last view's rows that moved.
  // Scrolled on the draw that opens the view -- which still draws every row, the words being put back only on the next --
  // the browser re-anchored the list as the words shrank it: 500 became 122 on production. Words that are no longer the
  // place's are the owner's, typed since: they have moved on, and nothing is put back.
  useEffect(() => {
    const due = placeDue.current;
    if (!due || due.view !== view) return;
    if (q !== due.q) {
      if (!due.fresh) placeDue.current = null;
      due.fresh = false;
      return;
    }
    due.fresh = false;
    if (!landed) return;
    placeDue.current = null;
    const sc = ldScroller(scrollRef.current);
    if (sc) sc.scrollTop = due.top;
  }, [view, landed, q]); // eslint-disable-line react-hooks/exhaustive-deps
  // How far the list is scrolled, heard on the pane in the capture phase: a scroll does not bubble, and on a desktop the
  // box that scrolls is the table's own, inside the pane. Saved once it settles, with the place as last drawn.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !el.addEventListener) return undefined;
    let t: ReturnType<typeof setTimeout> | null = null;
    const on = (e: Event) => {
      const sc = e && (e.target as HTMLElement | null);
      if (!sc || sc !== ldScroller(el)) return;
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        const now = placeNow.current;
        // A scroll while a view's place still waits for its rows is the browser fitting the rows before them.
        if (!now || placeDue.current) return;
        placeTop.current = sc.scrollTop;
        placeSave(page, now.view, { ...now.place, top: sc.scrollTop });
      }, PLACE_SAVE_DELAY_MS);
    };
    el.addEventListener("scroll", on, { passive: true, capture: true });
    return () => {
      el.removeEventListener("scroll", on, { capture: true });
      if (t) clearTimeout(t);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

export function usePlPlace(args: PlaceArgs) {
  const { controls, page, view, ids, noun, landed, selectionOf, extra, onPlace, windowed } = args;
  const {
    phone,
    setSearchOpen,
    selectMode,
    sel,
    setSel,
    toggleSel,
    setAllMatching,
    clearSelection,
    colsOpen,
    setColsOpen,
    colsButton,
    searchRef,
  } = controls;
  useSelectionResets(controls, selectionOf);
  const cursor = useCursor({ page, view, ids, noun, windowed });
  usePlaceKeeper({ controls, page, view, landed, extra, onPlace }, cursor);
  // One listener for the page's life, reading what the latest render left in `keys`: the Calendar's pattern. It was taken
  // down and added again on every render, and / had a second listener of its own.
  const keys = useRef<KeyDoors | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onPageKey(keys.current, e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // What the keyboard's one listener reads, left by the view as its draw ends: this draw's rows, cursor and doors, and the
  // view's own (`own`: what Enter opens, whether a row may be selected, the sheets, and under Leads the peek, the plan
  // panel, F and C).
  const keysWith = (own: Partial<KeyDoors>) => {
    keys.current = {
      ids,
      cursor: cursor.cursor,
      move: cursor.moveCursor,
      toggle: toggleSel,
      // sel.size, not the rows shown as the bar counts them: Esc can still drop a selection nobody can see. A
      // Select-people selection with nobody picked yet is one too.
      selected: sel.size > 0 || (phone && selectMode),
      clearSel: clearSelection,
      // On a phone the field is the bar's, behind its button: / opens it, and the field takes focus as it draws.
      focusSearch: () => {
        if (phone) setSearchOpen(true);
        if (searchRef.current) searchRef.current.focus();
      },
      menuOpen: colsOpen,
      closeMenu: () => {
        setColsOpen(false);
        if (colsButton.current) colsButton.current.focus();
      },
      ...own,
    };
  };
  const toggleAll = () => {
    setAllMatching(false);
    setSel((s) => (ids.length && ids.every((id) => s.has(id)) ? new Set() : new Set(ids)));
  };
  return { cursor: cursor.cursor, setCursor: cursor.setCursor, rowBudget: cursor.rowBudget, keysWith, toggleAll };
}
