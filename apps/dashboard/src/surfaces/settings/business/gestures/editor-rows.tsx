// Chanlytics — Settings › Business: the lists an editor's draft keeps, each with every rule a list has (`rows()`, BtFold's
// contract), and the shapes they share with the editor (editor.tsx). See common.tsx for the page's gestures as a whole.

import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { FocusOn } from "../../../kit/record/focus";
import {
  type Flash,
  type BtProblems,
  dflt,
  type BtAsk,
  BT_UNDO_REPLACED,
  btListNamed,
  type BtPutBack,
  BtPutBacks,
  type BtRowDoor,
} from "./common";

export interface BtEditDoor<D> extends BtRowDoor<D> {
  initial: D | null;
}

/** A toast's Undo, which may be pressed again: true once it has put the row back. */
export type BtAgain = (() => boolean) & { id?: number };

/**
 * What the registry, an Undo and a keystroke read: the latest draft, whatever the page has drawn since.
 * `backs` are the rows taken out of the draft's lists that an Undo may still put back (BtPutBacks), `agains` each one's
 * Undo by its id, and `produced` each list as its own rows() last left it (rows, below).
 */
export interface BtLive<D> {
  draft: D | null;
  opened: D | null;
  /** What the box shows until it is typed in, where that is not what is stored (BtFold's `opensOn`); `opened` stays what is. */
  shown: D | null;
  open: boolean;
  opening: number;
  backs: readonly BtPutBack[];
  agains: Map<number, BtAgain>;
  produced: Map<string, unknown>;
  seq: number;
  door: BtEditDoor<D> | null;
  settled?: boolean;
}

/** What an editor's acts share: the live record, the draft's setters, the asks. */
export interface BtEd<D> {
  l: BtLive<D>;
  flash: Flash;
  ask: BtAsk;
  out: () => boolean;
  setDraft: Dispatch<SetStateAction<D | null>>;
  setProblems: Dispatch<SetStateAction<BtProblems | null>>;
  setFocusOn: Dispatch<SetStateAction<FocusOn | null>>;
}

/** What the box opened on: what it shows in place of what is stored, else what is. */
export const btOpenedOn = <D,>(l: BtLive<D>): D | null => (l.shown != null ? l.shown : l.opened);

/** The latest draft: what was typed, else what it opened with. */
export const btLatest = <D,>(l: BtLive<D>): D => (l.draft != null ? l.draft : btOpenedOn(l)) as D;

export type BtUpdate<D> = (fn: (draft: D) => D, keys?: string[]) => boolean;

/** A toast's Undo of a change, made for the opening it was offered in: true once it has put the change back. */
export type BtUndo<D> = (fn: (draft: D) => D) => () => boolean;

/** What `rows()` is handed for one list of the draft. */
interface BtListOpts<D> {
  id: string;
  name?: ((i: number) => string) | null;
  max?: number;
  blank?: () => unknown;
  keysOf?: (i: number) => string[];
  key?: string | null;
  full?: string | null;
  list?: (draft: D) => unknown[] | null | undefined;
  put?: (draft: D, list: unknown[]) => D;
}

/** One list of the draft, as its opts say it, with the helpers its acts share. */
interface BtListCx<D> {
  ed: BtEd<D>;
  update: BtUpdate<D>;
  undo: BtUndo<D>;
  id: string;
  name: ((i: number) => string) | null;
  max: number;
  full: string | null;
  keysOf: (i: number) => string[];
  list: (draft: D) => unknown[] | null | undefined;
  put: (draft: D, list: unknown[]) => D;
  latest: () => unknown[];
  own: (keys: string[]) => string[];
  noted: () => void;
  settle: () => void;
  changed: BtUpdate<D>;
}

const btWholeList = <D,>(d: D) => d as unknown[];

const btListCx = <D,>(ed: BtEd<D>, update: BtUpdate<D>, undo: BtUndo<D>, o: BtListOpts<D>): BtListCx<D> => {
  // Required, and refused loudly: two lists rows() could not tell apart would share their put-backs (BtPutBacks).
  const id = btListNamed(o.id, "rows()");
  const list = dflt(o.list, btWholeList);
  const key = dflt(o.key, null);
  const drafted = () => btLatest(ed.l);
  // The list as its own rows() last left it. Replaced whole from outside (a day's hours copied over another's, a
  // week put back by its copy's Undo), it is no longer that list, and a row waiting to go back into it has no place:
  // its put-backs are dropped, and their Undo says so. Known by the list's value, not by a flag a caller must set.
  const noted = () => {
    ed.l.produced.set(id, list(drafted()));
  };
  const settle = () => {
    const p = ed.l.produced;
    if (p.has(id) && p.get(id) !== list(drafted())) {
      ed.l.backs = BtPutBacks.dropped(ed.l.backs, id);
      p.delete(id);
    }
  };
  const changed: BtUpdate<D> = (fn, keys) => {
    settle();
    const taken = update(fn, keys);
    if (taken) noted();
    return taken;
  };
  return {
    ed,
    update,
    undo,
    id,
    name: dflt(o.name, null),
    max: dflt(o.max, Infinity),
    full: dflt(o.full, null),
    keysOf: dflt(o.keysOf, () => []),
    list,
    put: dflt(o.put, (_d: D, l: unknown[]) => l as D),
    latest: () => list(drafted()) || [],
    own: (keys) => (key ? keys.concat([key]) : keys),
    noted,
    settle,
    changed,
  };
};

const btListAdd = <D,>(cx: BtListCx<D>, blank: () => unknown) => {
  const { list, put, max } = cx;
  let at = -1;
  const taken = cx.changed((d) => {
    const rows = list(d) as unknown[];
    if (rows.length >= max) return d;
    at = rows.length;
    return put(d, [...rows, blank()]);
  }, cx.own([]));
  if (taken && at >= 0 && cx.name) cx.ed.setFocusOn({ row: cx.name(at) });
  return taken;
};

/**
 * A removed row's Undo, as its toast and the body's own offer of it both press it: whichever is pressed first puts the
 * row back, once; the other then has nothing left to put back, and the row is where it was either way.
 */
const btAgain = <D,>(cx: BtListCx<D>, id: number, back: () => boolean, opening: number): BtAgain => {
  const l = cx.ed.l;
  let done = false;
  return Object.assign(
    () => {
      if (done) return true;
      // From an earlier opening, or once the editor has closed, that is what it says, before anything about the
      // list it no longer belongs to (the quality review's P2: it said the list was full).
      if (!l.open || l.opening !== opening) return back();
      cx.settle();
      if (!BtPutBacks.find(l.backs, id)) {
        cx.ed.flash({ tone: "warn", msg: <>{BT_UNDO_REPLACED}</> });
        return false;
      }
      if (cx.latest().length >= cx.max) {
        if (cx.full) cx.ed.flash({ tone: "warn", msg: <>Not put back — {cx.full}</> });
        return false;
      }
      if (!back()) return false;
      done = true;
      cx.noted();
      l.backs = BtPutBacks.restored(l.backs, id);
      return true;
    },
    { id },
  );
};

// Answers the Undo it toasted (false when nothing was removed), for a body that offers the same Undo where the
// row was: a sheet, whose Tab ring the toast is outside (kit/record/sheet.tsx). Whichever is pressed first puts the row
// back, once; the other then has nothing left to put back, and the row is where it was either way. Its `id` names
// the put-back among `waiting()`. Where the row goes back is BtPutBacks': between the same two rows it went from.
const btListRemove = <D,>(
  cx: BtListCx<D>,
  i: number,
  said: ReactNode | ((row: unknown) => ReactNode),
): BtAgain | false => {
  const l = cx.ed.l;
  cx.settle();
  const gone = cx.latest()[i];
  if (gone === undefined) return false;
  // Every row after it moves up a place, and its sentences with it: they are all asked again at Save.
  const moved = cx.latest().flatMap((_, j) => (j >= i ? cx.keysOf(j) : []));
  if (
    !cx.changed(
      (d) =>
        cx.put(
          d,
          (cx.list(d) as unknown[]).filter((_, j) => j !== i),
        ),
      cx.own(moved),
    )
  )
    return false;
  l.seq += 1;
  const id = l.seq;
  l.backs = BtPutBacks.taken(l.backs, cx.id, i, { id, row: gone });
  // Read as it runs: its place has moved with every change since. What goes back is a copy, so a row put back
  // counts as changed wherever "changed" is told by identity (the services sheet's search never hides one). A row
  // that is a word, not an object (a language), goes back as itself: spread, "Spanish" came back as { 0: "S", … }.
  const back = cx.undo((d) => {
    const w = BtPutBacks.find(l.backs, id);
    const copy = gone !== null && typeof gone === "object" ? { ...gone } : gone;
    const rows = cx.list(d) as unknown[];
    const at = w ? w.at : rows.length;
    return cx.put(d, [...rows.slice(0, at), copy, ...rows.slice(at)]);
  });
  const again = btAgain(cx, id, back, l.opening);
  l.agains.set(id, again);
  cx.ed.flash({ msg: typeof said === "function" ? said(gone) : said, undo: again });
  return again;
};

/**
 * The lists a body keeps in its draft, each with every rule a list has: the cap, the removal and its Undo, the sentences
 * a change answers and the focus an added row takes (BtFold's contract says each).
 */
export const btEditorRows =
  <D,>(ed: BtEd<D>, update: BtUpdate<D>, undo: BtUndo<D>, now: D) =>
  (o: BtListOpts<D>) => {
    const cx = btListCx(ed, update, undo, o);
    const blank = dflt(o.blank, () => ({}));
    return {
      canAdd: (cx.list(now) || []).length < cx.max,
      row: (i: number): Record<string, string> => (cx.name ? { "data-rec-row": cx.name(i) } : {}),
      add: () => btListAdd(cx, blank),
      setAt: (i: number, patch: Record<string, unknown>) =>
        cx.changed(
          (d) =>
            cx.put(
              d,
              (cx.list(d) as unknown[]).map((x, j) => (j === i ? Object.assign({}, x, patch) : x)),
            ),
          cx.own(cx.keysOf(i)),
        ),
      removeAt: (i: number, said: ReactNode | ((row: unknown) => ReactNode)) => btListRemove(cx, i, said),
      // The rows of this list an Undo may still put back, in the list's order: { id, at, row, back }. `at` is how many
      // of the list's rows come before it now, which is where a body draws the Undo it offers in the row's place.
      waiting: () => {
        cx.settle();
        return BtPutBacks.of(ed.l.backs, cx.id).map((b) => ({
          id: b.id,
          at: b.at,
          row: b.row,
          back: ed.l.agains.get(b.id),
        }));
      },
    };
  };
