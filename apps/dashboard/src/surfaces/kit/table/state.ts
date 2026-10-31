/**
 * A table's state, in one place (decision 0083, §3 and §14 rule 1): table-core's slices as atoms, made before the
 * rows, since a page reads its sort, its words and its selection before it knows its rows (a sort is a read of Leads';
 * the words search People's server). The table the rows arrive in is plugged into these atoms (use-data-table.ts
 * `atoms:`), and owns no copy of them: every slice has this one owner, and nothing beside it holds a sort, a column, a
 * width, an order, a filter or a selection.
 *
 * Beside the slices, by name, the two things a view keeps that are not table-core's: the row height (a look) and a
 * page's own keys (`extra`). The view a member saved is read into the atoms as the page opens, and the atoms are written
 * back to it as they change (`useSavedView`, below), under the rules the engine before this one kept: the workspace's
 * copy wins once read; nothing is written back before it is known unless the member changed something here; a drag is
 * saved when it ends, never while it is under way.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { batch, createAtom, type Atom } from "@tanstack/store";
import type {
  ColumnFiltersState,
  ColumnOrderState,
  ColumnSizingState,
  ColumnVisibilityState,
  RowSelectionState,
  SortingState,
  columnResizingState,
} from "@tanstack/table-core";
import {
  choicesFrom,
  firstDirOf,
  isLocked,
  reordered,
  visibilityDefaults,
  visibilityOf,
  type AnyDataColumn,
  type Density,
  type SortDir,
} from "./columns";
import { fromView, toView, viewKey, type View, type ViewParts, type ViewStore } from "./view";
import { useSlice } from "./use-table";

/** Table-core's slices, each one atom the table is handed. */
export interface TableAtoms {
  sorting: Atom<SortingState>;
  globalFilter: Atom<string>;
  columnFilters: Atom<ColumnFiltersState>;
  columnVisibility: Atom<ColumnVisibilityState>;
  columnOrder: Atom<ColumnOrderState>;
  columnSizing: Atom<ColumnSizingState>;
  columnResizing: Atom<columnResizingState>;
  rowSelection: Atom<RowSelectionState>;
}

/** A sort's entry: a column's id and its way. */
export interface SortEntry {
  id: string;
  desc: boolean;
}

/**
 * The entries a sort by `key` adds after it: the page's tiebreak, which the table applies where the browser sorts and
 * the heading never shows (only the first entry is the member's). People's: most recent contact first.
 */
export type SortThen = (key: string, desc: boolean) => readonly SortEntry[];

const NO_THEN: SortThen = () => [];

/** No drag under way. */
const RESTING: columnResizingState = {
  startOffset: null,
  startSize: null,
  deltaOffset: null,
  deltaPercentage: null,
  isResizingColumn: false,
  columnSizingStart: [],
};

/** A sort as the atom holds it: the member's entry first, then the page's tiebreak. */
export const sortingFor = (key: string, dir: SortDir, then: SortThen = NO_THEN): SortingState => [
  { id: key, desc: dir === "desc" },
  ...then(key, dir === "desc"),
];

/** The member's sort, out of the atom's: its first entry. */
export const chosenSortOf = (
  sorting: SortingState,
  first: { by: string; dir: SortDir },
): { by: string; dir: SortDir } => {
  const head = sorting[0];
  return head ? { by: head.id, dir: head.desc ? "desc" : "asc" } : first;
};

/** The rows selected, as a set of their ids. */
export const selectedOf = (selection: RowSelectionState): Set<string> =>
  new Set(Object.keys(selection).filter((id) => selection[id]));

/** A set of ids, as the selection atom holds it. */
const selectionFrom = (ids: Iterable<string>): RowSelectionState => {
  const out: RowSelectionState = {};
  for (const id of ids) out[id] = true;
  return out;
};

/** Whether a filter or the words leave a loaded row out: then the rows shown are fewer than the view holds. */
export const narrowedBy = (filters: ColumnFiltersState, words: string): boolean =>
  filters.length > 0 || words.trim() !== "";

export interface TableStateArgs {
  /** Whose saved view this is: "people", "leads", "pipeline" (memberships.views, and this device's copy). */
  scope: string;
  /** Every column the page declares, whatever the workspace shows (a saved view names any of them). */
  columns: readonly AnyDataColumn[];
  /** The sort before anyone chose one. */
  first: { by: string; dir: SortDir };
  /** The page's tiebreak after the member's sort (where the browser sorts). */
  sortThen?: SortThen;
  /** The workspace's copy of this scope's view, once the read that carries it has landed (`landed`). */
  saved: View | null;
  landed: boolean;
  store: ViewStore;
  /** Leads' rail row, which its saved view carries first; `undefined` for a scope whose view has none. */
  railRow?: string | null;
  /** The page's own keys in its view, with their defaults (the Pipeline's `{ layout }`). */
  extraDefaults?: View | null;
}

/** What the table's DOM leaves for the acts that measure it: the box that scrolls, and the measure Fit all asks for. */
export interface TableDom {
  scroll: HTMLElement | null;
  measure: ((table: HTMLTableElement) => Record<string, number>) | null;
}

/** The atoms as the view opens: the member's view, read with care, over the page's defaults. */
function atomsFrom(parts: ViewParts, columns: readonly AnyDataColumn[], then: SortThen): TableAtoms {
  return {
    sorting: createAtom<SortingState>(sortingFor(parts.by, parts.dir, then)),
    globalFilter: createAtom(""),
    columnFilters: createAtom<ColumnFiltersState>([]),
    columnVisibility: createAtom<ColumnVisibilityState>(visibilityOf(columns, parts.columns)),
    columnOrder: createAtom<ColumnOrderState>(parts.order),
    columnSizing: createAtom<ColumnSizingState>(parts.widths),
    columnResizing: createAtom<columnResizingState>(RESTING),
    rowSelection: createAtom<RowSelectionState>({}),
  };
}

/** The view's parts as the atoms hold them now. */
function partsNow(
  atoms: TableAtoms,
  own: { density: Atom<Density>; extra: Atom<View | null> },
  columns: readonly AnyDataColumn[],
  first: { by: string; dir: SortDir },
): ViewParts {
  const sort = chosenSortOf(atoms.sorting.get(), first);
  return {
    by: sort.by,
    dir: sort.dir,
    columns: choicesFrom(columns, atoms.columnVisibility.get()),
    widths: atoms.columnSizing.get(),
    order: atoms.columnOrder.get(),
    density: own.density.get(),
    extra: own.extra.get(),
  };
}

/** The table's elements, none until it is drawn. */
const noDom = (): TableDom => ({ scroll: null, measure: null });

/** Set every slice a view holds, in one batch, by the page's columns and its sort's tiebreak. */
function takeView(
  slices: { atoms: TableAtoms; own: { density: Atom<Density>; extra: Atom<View | null> } },
  parts: ViewParts,
  rules: { columns: readonly AnyDataColumn[]; then: SortThen },
): void {
  const { atoms, own } = slices;
  const { columns, then } = rules;
  batch(() => {
    atoms.sorting.set(sortingFor(parts.by, parts.dir, then));
    atoms.columnVisibility.set(visibilityOf(columns, parts.columns));
    atoms.columnOrder.set(parts.order);
    atoms.columnSizing.set(parts.widths);
    own.density.set(parts.density);
    if (parts.extra) own.extra.set(parts.extra);
  });
}

/**
 * The view saved as the atoms change. Every save sends every key the page owns, because member_view_set replaces the
 * page's whole object (00113): a save of the sort alone would lose the columns. The workspace's copy rides with the
 * People surface, which on a cold open of Leads lands after the page is up: until it has been seen nothing is saved
 * back, unless the member chose something here, which stands; when it arrives it is taken, once, and taking it is not a
 * change to save back either.
 */
function useSavedView(
  a: TableStateArgs,
  atoms: TableAtoms,
  own: { density: Atom<Density>; extra: Atom<View | null> },
  initialKey: string,
) {
  const { scope, columns, first, store } = a;
  const then = a.sortThen ?? NO_THEN;
  const saver = useRef<((view: View) => void) | null>(null);
  if (!saver.current) saver.current = store.saver(scope);
  const savedKey = useRef(initialKey);
  const viewKnown = useRef(a.landed);
  const viewTouched = useRef(false);
  const railRow = useRef(a.railRow);
  railRow.current = a.railRow;
  const save = useCallback(() => {
    // A drag under way is no choice yet: its width is saved when it ends.
    if (atoms.columnResizing.get().isResizingColumn) return;
    const view = toView(partsNow(atoms, own, columns, first), railRow.current);
    store.save(scope, view);
    const key = viewKey(view);
    if (key === savedKey.current) return;
    if (!viewKnown.current && !viewTouched.current) return;
    savedKey.current = key;
    if (saver.current) saver.current(view);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- one saver for the page's life, over atoms made once
  // Saved as a slice moves. A change that moves several (a view taken whole, a drag's end) is one batch, each slice
  // telling once: the first save carries the whole view, and the rest find nothing new to send.
  useEffect(() => {
    const soon = () => save();
    const subs = [
      atoms.sorting.subscribe(soon),
      atoms.columnVisibility.subscribe(soon),
      atoms.columnOrder.subscribe(soon),
      atoms.columnSizing.subscribe(soon),
      atoms.columnResizing.subscribe(soon),
      own.density.subscribe(soon),
      own.extra.subscribe(soon),
    ];
    return () => subs.forEach((s) => s.unsubscribe());
  }, [save]); // eslint-disable-line react-hooks/exhaustive-deps -- the atoms are the page's for its life
  // The rail's row is the address's, and the view carries it: a row picked is a change to save.
  useEffect(save, [a.railRow, save]);
  // The workspace's copy, the first time it is known.
  useEffect(() => {
    if (viewKnown.current || !a.landed) return;
    viewKnown.current = true;
    if (viewTouched.current || !a.saved) return;
    const parts = fromView(a.saved, columns, partsNow(atoms, own, columns, first), a.extraDefaults);
    savedKey.current = viewKey(toView(parts, railRow.current));
    takeView({ atoms, own }, parts, { columns, then });
  }, [a.landed]); // eslint-disable-line react-hooks/exhaustive-deps -- once, as the copy lands
  return viewTouched;
}

/** The acts on widths and places: a drag's live width and its end, a reset, a move, Fit all, and the way back. */
function sizingActs(
  atoms: TableAtoms,
  dom: TableDom,
  touch: () => void,
  before: { current: ColumnSizingState | null },
) {
  return {
    /** A drag of a column's edge begins: the widths as they stood are kept, for a drag that ends with nothing to keep. */
    startSizing: (key: string) => {
      before.current = atoms.columnSizing.get();
      atoms.columnResizing.set({ ...RESTING, isResizingColumn: key });
    },
    /** A column's width, live while a drag is under way (`commit` false), and final once it ends or a key sets it. */
    sizeColumn: (key: string, px: number, commit: boolean) =>
      batch(() => {
        atoms.columnSizing.set((s) => ({ ...s, [key]: px }));
        if (!commit) return;
        touch();
        before.current = null;
        atoms.columnResizing.set(RESTING);
      }),
    /** A drag that ended with no width to keep: the widths go back to where they stood. */
    cancelSizing: () =>
      batch(() => {
        const was = before.current;
        before.current = null;
        if (was) atoms.columnSizing.set(was);
        atoms.columnResizing.set(RESTING);
      }),
    /** Give one column back its declared width (the fill column, the room left). */
    resetWidth: (key: string) => {
      touch();
      atoms.columnSizing.set((s) => {
        const rest = { ...s };
        delete rest[key];
        return rest;
      });
    },
    /** The columns a member may move that are drawn, in a new order (columns.ts `movedBy`, `movedTo`). */
    moveColumns: (next: readonly string[]) => {
      const order = reordered(atoms.columnOrder.get(), next);
      if (!order) return;
      touch();
      atoms.columnOrder.set(order);
    },
    /** Every column the width of what it holds: the table leaves the measure (`dom.measure`) as it draws. */
    fitAll: () => {
      const table = dom.scroll?.querySelector("table");
      const fits = table && dom.measure ? dom.measure(table) : null;
      if (!fits || !Object.keys(fits).length) return;
      touch();
      atoms.columnSizing.set((s) => ({ ...s, ...fits }));
    },
    /** Every width and place back to the page's own. */
    resetLayout: () => {
      touch();
      batch(() => {
        atoms.columnSizing.set({});
        atoms.columnOrder.set([]);
      });
    },
  };
}

/** The acts on what the view shows of its rows: the words, a page's filters, and the selection. */
function narrowingActs(atoms: TableAtoms) {
  return {
    setWords: (q: string | ((was: string) => string)) =>
      atoms.globalFilter.set((was) => (typeof q === "function" ? q(was) : q)),
    /** A page's narrowing on its filter's column: a value keeps the rows it names, none lets them all show. */
    setFilter: (id: string, value: unknown) =>
      atoms.columnFilters.set((fs) => {
        const rest = fs.filter((f) => f.id !== id);
        return value === null || value === undefined ? rest : [...rest, { id, value }];
      }),
    clearFilters: () =>
      batch(() => {
        atoms.columnFilters.set([]);
        atoms.globalFilter.set("");
      }),
    setSelected: (next: Set<string> | ((was: Set<string>) => Set<string>)) =>
      atoms.rowSelection.set((s) => selectionFrom(typeof next === "function" ? next(selectedOf(s)) : next)),
  };
}

/** The view's slices as the page draws them: it draws again when one moves (never for a width, which a drag moves). */
function useViewSlices(atoms: TableAtoms, own: { density: Atom<Density>; extra: Atom<View | null> }) {
  const same = <T>(x: T): T => x;
  const selection = useSlice(atoms.rowSelection, same);
  const selected = useMemo(() => selectedOf(selection), [selection]);
  return {
    sorting: useSlice(atoms.sorting, same),
    words: useSlice(atoms.globalFilter, same),
    filters: useSlice(atoms.columnFilters, same),
    selected,
    visibility: useSlice(atoms.columnVisibility, same),
    order: useSlice(atoms.columnOrder, same),
    density: useSlice(own.density, same),
    extra: useSlice(own.extra, same),
  };
}

/**
 * The table's state for a page: its atoms, read as the page draws, and the acts that change them. Each act a member
 * makes on the view (a sort, a column, a width, an order, the row height, a page's own key) says so (`touch`), so what
 * they chose here is saved and the workspace's copy is not taken over it; the words, the filters and the selection are
 * the view's place and its moment, never the saved view.
 */
export function useTableState(a: TableStateArgs) {
  const { columns, first } = a;
  const then = a.sortThen ?? NO_THEN;
  const [made] = useState(() => {
    const remembered = { ...a.store.load(a.scope), ...((a.landed && a.saved) || {}) };
    const parts = fromView(remembered, columns, first, a.extraDefaults);
    const row = a.railRow !== undefined ? (remembered.list as string) || "all" : undefined;
    return {
      atoms: atomsFrom(parts, columns, then),
      own: { density: createAtom<Density>(parts.density), extra: createAtom<View | null>(parts.extra) },
      initialKey: viewKey(toView(parts, row)),
      dom: noDom(),
    };
  });
  const { atoms, own, dom } = made;
  const touched = useSavedView(a, atoms, own, made.initialKey);
  const sizingBefore = useRef<ColumnSizingState | null>(null);
  const touch = () => {
    touched.current = true;
  };
  const slices = useViewSlices(atoms, own);
  // One function for the page's life: a memoised row is handed it.
  const toggleSelected = useCallback(
    (id: string) =>
      atoms.rowSelection.set((s) => {
        const n = { ...s };
        if (n[id]) delete n[id];
        else n[id] = true;
        return n;
      }),
    [], // eslint-disable-line react-hooks/exhaustive-deps -- the atom is the page's for its life
  );
  const setSort = (by: string, dir: SortDir) => {
    touch();
    atoms.sorting.set(sortingFor(by, dir, then));
  };
  return {
    atoms,
    own,
    dom,
    columns,
    first,
    sortThen: then,
    ...slices,
    /** The member's sort: the atom's first entry. */
    chosen: chosenSortOf(slices.sorting, first),
    narrowed: narrowedBy(slices.filters, slices.words),
    filterOf: (id: string): unknown => slices.filters.find((f) => f.id === id)?.value ?? null,
    touch,
    setSort,
    /**
     * A press on a heading: the one drawn lit (`shown`) turns its order round; another starts the column's own way
     * (`sort.first`: a name at A, the soonest first; else the most first).
     */
    pressSort: (key: string, shown: { by: string; dir: SortDir }) =>
      setSort(key, shown.by === key ? (shown.dir === "asc" ? "desc" : "asc") : firstDirOf(columns, key)),
    ...narrowingActs(atoms),
    toggleSelected,
    /** Show or hide one column; the fill column and the row's acts are not the member's to hide. */
    toggleColumn: (key: string) => {
      const c = columns.find((x) => x.key === key);
      if (!c || isLocked(c) || c.hidden) return;
      touch();
      atoms.columnVisibility.set((v) => ({ ...visibilityDefaults(columns), ...v, [key]: v[key] === false }));
    },
    setDensity: (d: Density) => {
      touch();
      own.density.set(d);
    },
    ...sizingActs(atoms, dom, touch, sizingBefore),
    /** One of the page's own keys, chosen: theirs, saved with the rest of the view. */
    setExtra: (patch: View) => {
      touch();
      own.extra.set((x) => ({ ...(x || {}), ...patch }));
    },
  };
}
export type TableState = ReturnType<typeof useTableState>;
