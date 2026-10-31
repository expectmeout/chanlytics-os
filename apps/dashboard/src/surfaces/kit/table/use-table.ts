/**
 * TanStack Table's React binding, the kit's own (decision 0083): table-core's `constructTable` and its render-phase
 * reactivity, with React's hooks read from "react" as every kit module reads them. The official adapter
 * (`@tanstack/react-table` 9.3.1, `dist/useTable.js` and `dist/Subscribe.js`) is these same lines over the same core
 * functions, but it names React's client hooks in an ESM import, which the suite's react-server React cannot link
 * ("does not provide an export named 'createContext'", the lane's step 0): carried here, the app and its node tests run
 * one binding. An upgrade of table-core re-reads those two files and keeps this one equal to them.
 *
 * The store's primitives come from `@tanstack/store`, the copy table-core names: its atoms and this binding's must be one
 * store instance (table-core's `RenderPhaseReactivityPrimitives`), and table-core makes every atom it keeps through the
 * bindings handed it here.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { batch, createAtom, shallow } from "@tanstack/store";
import { constructTable } from "@tanstack/table-core";
import type { RowData, Table, TableFeatures, TableOptions } from "@tanstack/table-core";
import { createRenderPhaseSource, renderPhaseReactivity } from "@tanstack/table-core/reactivity";
import { table_publishExternalState, table_setOptions } from "@tanstack/table-core/static-functions";

/** What a slice of the table's state is read from: a value now, and a notice when it moves. */
interface Source<S> {
  get: () => S;
  subscribe: (listener: (value: S) => void) => { unsubscribe: () => void };
}

/**
 * On a server there is no layout to wait for: the adapter's own choice, made as the hook runs (a module read before
 * React's hooks are in place, as the suite's stub puts them, would hold none).
 */
function useCommitEffect(effect: () => void): void {
  (typeof window === "undefined" ? useEffect : useLayoutEffect)(effect);
}

/**
 * A slice of a source, as React draws it: re-read when the source moves, and kept by reference while it compares equal
 * (shallowly, as the adapter's `useSelector` compares), so a component drawn from it draws again only when what it reads
 * changed.
 */
export function useSlice<S, T>(source: Source<S>, select: (state: S) => T): T {
  const kept = useRef<{ value: T } | null>(null);
  const subscribe = useCallback(
    (notify: () => void) => {
      const sub = source.subscribe(() => notify());
      return () => sub.unsubscribe();
    },
    [source],
  );
  const read = (): T => {
    const next = select(source.get());
    const was = kept.current;
    if (was && shallow(was.value, next)) return was.value;
    kept.current = { value: next };
    return next;
  };
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * A table: built once, its options synchronised on every draw, and what it published since this draw's state committed
 * made known after the commit, as the adapter does. It reads no state into the component that holds it: a part that
 * must follow a slice reads it with `useSlice(table.store, …)` where it is drawn, so a drag of a column's edge or a
 * box ticked draws only what reads them.
 */
export function useTable<TFeatures extends TableFeatures, TData extends RowData>(
  options: TableOptions<TFeatures, TData>,
): Table<TFeatures, TData> {
  const [{ table, source }] = useState(() => {
    const made = constructTable({
      ...options,
      features: { coreReactivityFeature: renderPhaseReactivity({ createAtom, batch }), ...options.features },
    });
    return { table: made, source: createRenderPhaseSource(made.store, shallow) };
  });
  table_setOptions(table, (prev) => ({ ...prev, ...options }), { syncExternalState: false });
  const controlled = table.options.state;
  const drawn = source.get();
  useCommitEffect(() => {
    source.markCommitted(drawn);
    table_publishExternalState(table, controlled ?? null, shallow);
  });
  return table;
}
