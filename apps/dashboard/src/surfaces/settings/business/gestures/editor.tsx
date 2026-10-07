// Chanlytics — Settings › Business: the editor a fold and a sheet both are (useBtEditor). See common.tsx for the page's gestures as a whole.

import { useEffect, useRef, useState } from "react";
import type { Dispatch, MouseEvent, ReactNode, SetStateAction } from "react";
import type { FoldSection } from "@/legacy-bridge/business-tab";
import type { FocusOn } from "../../../kit/record/focus";
import { useRecordFold } from "../../../kit/record/hooks";
import { businessTabSave } from ".././saver";
import {
  type Flash,
  type BtSaver,
  type BtChannel,
  type BtProblems,
  type BtGate,
  type BtWillSay,
  dflt,
  btSkipFlash,
  BT_SAVED,
  btWorkedOut,
  useBtAsk,
  type BtAsk,
  btAsks,
  BT_UNDO_CLOSED,
  BT_UNDO_SAVING,
  BT_UNDO_REPLACED,
  btListNamed,
  type BtPutBack,
  BtPutBacks,
  BT_UNCHECKED,
  type BtRowDoor,
  type BtOpening,
  btOpening,
} from "./common";

/* ------------------------------------ a set of fields: the editor a fold and a sheet both are ------------------------------------ */

export interface BtEditDoor<D> extends BtRowDoor<D> {
  initial: D | null;
}

/** What useBtEditor is handed. */
interface BtEditorArgs<D> {
  id: string;
  canEdit?: boolean;
  gate?: BtGate;
  flash?: Flash;
  saver?: BtSaver | null;
  said?: ReactNode;
  channel?: BtChannel;
  check?: ((draft: D) => BtProblems | null | undefined) | null;
  nothingYet?: boolean;
  door?: BtEditDoor<D> | null;
  after?: ((draft: D) => void) | null;
  /** An editor of one value: its own Cancel closes it without asking (common.tsx). */
  light?: boolean;
  prefix: string;
}

/** The arguments with the JSX's defaults applied, once. */
function btEditorArgs<D>(a: BtEditorArgs<D>) {
  return {
    id: a.id,
    canEdit: dflt(a.canEdit, true),
    gate: dflt(a.gate, null),
    flash: dflt(a.flash, btSkipFlash),
    saver: dflt(a.saver, null),
    said: dflt(a.said, BT_SAVED),
    channel: dflt(a.channel, "whatsapp"),
    check: dflt(a.check, null),
    nothingYet: dflt(a.nothingYet, false),
    door: dflt(a.door, null),
    after: dflt(a.after, null),
    light: dflt(a.light, false),
    prefix: a.prefix,
  };
}
type BtEditorR<D> = ReturnType<typeof btEditorArgs<D>>;

/** A toast's Undo, which may be pressed again: true once it has put the row back. */
type BtAgain = (() => boolean) & { id?: number };

/**
 * What the registry, an Undo and a keystroke read: the latest draft, whatever the page has drawn since.
 * `backs` are the rows taken out of the draft's lists that an Undo may still put back (BtPutBacks), `agains` each one's
 * Undo by its id, and `produced` each list as its own rows() last left it (rows, below).
 */
interface BtLive<D> {
  draft: D | null;
  opened: D | null;
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
interface BtEd<D> {
  l: BtLive<D>;
  flash: Flash;
  ask: BtAsk;
  out: () => boolean;
  setDraft: Dispatch<SetStateAction<D | null>>;
  setProblems: Dispatch<SetStateAction<BtProblems | null>>;
  setFocusOn: Dispatch<SetStateAction<FocusOn | null>>;
}

/** The latest draft: what was typed, else what it opened with. */
const btLatest = <D,>(l: BtLive<D>): D => (l.draft != null ? l.draft : l.opened) as D;

/**
 * Closed by anything -- saved, cancelled, or given way to another row -- the draft goes with it, and the next
 * opening starts from what is stored.
 */
const btEditorReset =
  <D,>(ed: BtEd<D>) =>
  () => {
    const l = ed.l;
    l.draft = null;
    l.opened = null;
    l.backs = BtPutBacks.none;
    l.agains = new Map();
    l.produced = new Map();
    ed.setDraft(null);
    ed.setProblems(null);
    ed.ask.disarm();
    ed.setFocusOn(null);
  };

type BtUpdate<D> = (fn: (draft: D) => D, keys?: string[]) => boolean;

/**
 * Nothing is typed into a save that is out (kit/record/fold.tsx): asked of the saver at the moment of the change, since an
 * Undo is pressed long after the draw that made it. It answers whether it took the change, for whoever would say so.
 */
const btEditorUpdate =
  <D,>(ed: BtEd<D>): BtUpdate<D> =>
  (fn, keys) => {
    const l = ed.l;
    if (!l.open || ed.out()) return false;
    const next = fn(btLatest(l));
    l.draft = next;
    ed.setDraft(next);
    ed.setProblems((was) => {
      if (!was || !keys) return null;
      const left = { ...was };
      keys.forEach((k) => {
        delete left[k];
      });
      return Object.keys(left).length ? left : null;
    });
    ed.ask.disarm();
    return true;
  };

/**
 * A toast's Undo outlives the editor that made the change: pressed after it has closed (cancelled, or saved and closed
 * by its save), the draft it would put something back into is gone, and pressed while the save is out nothing is
 * typed into it. Either way it says so, in the warn tone: an Undo that did nothing and said nothing read as broken.
 */
const btEditorUndo =
  <D,>(ed: BtEd<D>, update: BtUpdate<D>) =>
  (fn: (draft: D) => D) => {
    const at = ed.l.opening;
    return () => {
      if (!ed.l.open || ed.l.opening !== at) {
        ed.flash({ tone: "warn", msg: <>{BT_UNDO_CLOSED}</> });
        return false;
      }
      if (update(fn)) return true;
      ed.flash({ tone: "warn", msg: <>{BT_UNDO_SAVING}</> });
      return false;
    };
  };

/** What a change says when it is taken: the toast's words, how to put it back, and the field keys it answers. */
interface BtWords<D> {
  keys?: string[];
  said?: ReactNode;
  back?: (draft: D) => D;
}

const btEditorChange =
  <D,>(ed: BtEd<D>, update: BtUpdate<D>, undo: ReturnType<typeof btEditorUndo<D>>) =>
  (fn: (draft: D) => D, words: BtWords<D> = {}) => {
    if (!update(fn, words.keys)) return false;
    if (words.said) ed.flash({ msg: words.said, undo: words.back ? undo(words.back) : undefined });
    return true;
  };

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
  undo: ReturnType<typeof btEditorUndo<D>>;
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

const btListCx = <D,>(
  ed: BtEd<D>,
  update: BtUpdate<D>,
  undo: ReturnType<typeof btEditorUndo<D>>,
  o: BtListOpts<D>,
): BtListCx<D> => {
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
const btEditorRows =
  <D,>(ed: BtEd<D>, update: BtUpdate<D>, undo: ReturnType<typeof btEditorUndo<D>>, now: D) =>
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

/** The props of a press that changes the draft (an add, a remove). */
const btEditorPress = (busy: boolean) => (fn: (e?: MouseEvent<HTMLElement>) => void) => ({
  "aria-disabled": busy || undefined,
  onClick: (e?: MouseEvent<HTMLElement>) => {
    if (busy) {
      if (e && e.preventDefault) e.preventDefault();
      return;
    }
    fn(e);
  },
});

/** What the page's own checks refuse: the fold's (problemsOf, pure) and the card's (`check`). */
const btPageProblems =
  <D,>(a: BtEditorR<D>) =>
  (d: D): BtProblems => {
    // The page's own checks: the fold's (problemsOf, pure) and the card's (`check`), for what the draft does not hold
    // and only the page knows (the line the workspace answers on). The card's wins under a field both would speak of. A
    // door's draft is no part of the config, so only its card's.
    const S = businessTabSave;
    return Object.assign({}, a.door ? {} : S.problemsOf(a.id, d), a.check ? a.check(d) || {} : {});
  };

/** What a Save does with a draft its checks could judge: refuse it, close, go through a door, or send a job. */
interface BtJudged {
  problems?: BtProblems;
  nothing?: boolean;
  door?: boolean;
  job?: Parameters<BtSaver["save"]>[0];
}

/**
 * The checks are the helpers', and a draft they throw on is one they cannot judge: said, in the danger tone, and
 * nothing sent. `judged` is what to do next; null is a check that could not run. A door's draft is judged by its
 * card's check, and holds a change when it is not what the door opened on; it goes through the door.
 */
function btJudge<D>(
  a: BtEditorR<D>,
  o: BtOpening<D>,
  ed: BtEd<D>,
  w: { typed: D; taken: () => void },
): BtJudged | null {
  const S = businessTabSave;
  const { typed, taken } = w;
  const { id, door } = a;
  return btWorkedOut(`whether the ${id} fold may be saved`, (): BtJudged => {
    const own = btPageProblems(a)(typed);
    if (Object.keys(own).length) return { problems: own };
    if (door) return S.same(typed, door.initial) ? { nothing: true } : { door: true };
    if (!S.holdsChanges(id, o.base, typed)) return { nothing: true };
    const all = S.saveProblems(id, o.base, typed);
    if (Object.keys(all).length) return { problems: all };
    return { job: S.foldJob(id, typed, { opened: ed.l.opened, said: a.said, done: taken, flash: a.flash }) };
  });
}

/** The editor's Save. */
const btEditorSubmit =
  <D,>(
    a: BtEditorR<D>,
    o: BtOpening<D>,
    ed: BtEd<D>,
    s: { busy: boolean; open: boolean; draft: D | null; refused: boolean; close: () => void },
  ) =>
  () => {
    const { door, saver } = a;
    if (s.busy || !s.open || s.refused) return;
    // A fold nobody typed in closes at once: nothing was asked of it, so nothing of it is judged (a non-owner's
    // calendar address arrives masked, and would be refused as no address at all). Except a fold that states no fact
    // yet (`nothingYet`, the create card's): there is nothing stored for a check to judge wrongly, and every box in it
    // is one the receptionist cannot answer anyone without, so an untouched Save says what is missing under each box
    // rather than closing as if it had saved -- which is what the create form it replaces did.
    if (s.draft == null && !a.nothingYet) {
      s.close();
      return;
    }
    const typed = (s.draft != null ? s.draft : ed.l.opened) as D;
    // Taken: the editor closes, the row it closes into says so (settled), and the card's own `after` runs.
    const taken = () => {
      ed.l.settled = true;
      s.close();
      if (a.after) a.after(typed);
    };
    const judged = btJudge(a, o, ed, { typed, taken });
    if (!judged) {
      a.flash({ tone: "danger", msg: <>{BT_UNCHECKED}</> });
      return;
    }
    if (judged.problems) {
      ed.setProblems(judged.problems);
      return;
    }
    if (judged.nothing) {
      s.close();
      return;
    }
    if (ed.ask.armed) ed.ask.disarm();
    if (judged.door && door) door.save(typed, taken);
    else if (judged.job && saver) saver.save(judged.job);
  };

/**
 * What it will say is worked out as it draws, so it is tried: a draft the helpers throw on draws no block. The crossing
 * (willSay's `note`) is a save's, so it is said only of a draft whose Save sends something (holdsChanges): a draft
 * written as the save writes it can cross the resolver's line when nothing was typed (the instructions of a record
 * that composes nothing, carried into the owner's field, S4), and the fold said the details would start being given
 * of a Save that then sent nothing (the review's probe P1).
 */
function btEditorWill<D>(a: BtEditorR<D>, o: BtOpening<D>, open: boolean, now: D): BtWillSay | null {
  if (!(open && a.channel && !a.door)) return null;
  const S = businessTabSave;
  const { id, channel } = a;
  return btWorkedOut(`what the ${id} fold will say`, () => {
    if (Object.keys(btPageProblems(a)(now)).length) return null;
    if (!o.base) return null;
    const said = S.willSay({
      was: o.base.brain,
      next: S.saveFold(id, o.base, now).brain,
      sections: id as FoldSection,
      channel,
    });
    return said && said.note && !S.holdsChanges(id, o.base, now) ? { ...said, note: null } : said;
  });
}

/**
 * The editor behind one of this page's folds, and behind its sheet: the draft, what stops a save, the save through the
 * tab's one saver, what the receptionist will be told, the two asks, and every rule a list in the draft has. A fold
 * draws it under its row (BtFold, below); a list too long for a fold draws it in a sheet beside the page (BtSheet,
 * below). Both are the same editor, written once, because the services sheet needed every rule a fold keeps -- the cap
 * through an Undo, the removal said only when it happened, the row back at its index, one editor open at a time, the
 * asks -- and a second copy of them would be the one that drifts. A card never calls this: it hands BtFold or BtSheet
 * its fields.
 *
 * It follows folds.ts's contract to the letter, because an editor that did not would lose a colleague's
 * change or a workspace's prompt without a word:
 *   as it opens     the draft is draftOf(id, saver.base()), kept as `opened`. Until the editor is typed in, `opened` is
 *                   taken again from the base on every draw: an untouched fold FOLLOWS what is stored, so a colleague's
 *                   change read back into this tab is shown as it stands, said as nothing that goes, and the first
 *                   keystroke after it is a change to the week as it is now, not a save refused as "changed after you
 *                   opened it". Typed in, or while its save is out, `opened` holds still, and foldJob's refusal stands;
 *   unsaved changes the draft is not the one it opened with, asked by the registry however the editor was opened (its
 *                   own act, or its id from the gap line's door), by the Settings rail, by the browser, and by
 *                   Cancel. NOT holdsChanges, which judges what the save would WRITE: a shift typed half-way, a closed
 *                   day's note with no date yet, a day switched on with no times and a service with no name are all
 *                   dropped by the save, so they read as nothing, and Cancel threw them away without a question. The
 *                   form this replaces counted any change, and so does this. Asking once too often loses nothing;
 *   on Save         the page's own checks first (problemsOf, and the card's `check` for what only the page knows: the
 *                   line the workspace answers on), each sentence under its field: a shift typed half-way is
 *                   dropped by the save, so a week that "changes nothing" because of one must still be refused, never
 *                   closed as if saved. Then nothing to write (holdsChanges, which stays the test for whether Save
 *                   sends anything) is nothing to send, and the editor closes. Then the save's own schema
 *                   (saveProblems). Only then saver.save(foldJob(...)), never a hand-written patch. An editor nobody
 *                   typed in closes at once: nothing was asked of it, so nothing of it is judged (a non-owner's
 *                   calendar address arrives masked, and would be refused as no address at all);
 *   it will say     willSay on saveFold(id, saver.base(), draft).brain, only while it is open and only for a draft the
 *                   page's own checks pass: the whole block under "Your receptionist will be told", the lines that go,
 *                   the block's share of the prompt (`chars`), and the sentence for a save that crosses the resolver's
 *                   line, only when its Save would send something (holdsChanges). `channel` null says none (the
 *                   calendar's address and the zone are in no draft of the brain).
 *
 * `prefix` names its two asks' Confirms (rec-fold-<id>, rec-sheet-<id>). What a body is handed is `fields` in what it
 * answers, which BtFold's contract says in full.
 *
 * `door` is an editor the settings save does not write, as a row's door is (BtRow): { initial, save(draft, done),
 * pending() }. It opens with `initial`, not with a part of the config; is judged by its card's `check` alone; sends
 * through `save`, which calls `done` once taken; and has nothing to say it will tell the receptionist. `after(draft)`
 * runs once a save is taken, with the draft it saved, for a card that does something more then (create.tsx).
 */
export function useBtEditor<D>(args: BtEditorArgs<D>) {
  const a = btEditorArgs(args);
  const { id, canEdit, gate, saver, door } = a;
  const S = businessTabSave;
  const [draft, setDraft] = useState<D | null>(null);
  const [problems, setProblems] = useState<BtProblems | null>(null);
  const ask = useBtAsk();
  // The row a list was just given, or any row the body names (focus), for the kit to put focus in (rows' add).
  const [focusOn, setFocusOn] = useState<FocusOn | null>(null);
  // What the registry, an Undo and a keystroke read: the latest draft, whatever the page has drawn since.
  const live = useRef<BtLive<D>>({
    draft: null,
    opened: null,
    open: false,
    opening: 0,
    backs: BtPutBacks.none,
    agains: new Map(),
    produced: new Map(),
    seq: 0,
    door: null,
  });
  // Whether this editor's save is out: at its door, or in the tab's saver. Read through `live`, since the registry
  // holds the test it was first handed for the editor's life, and the door a card hands over is new on every draw.
  live.current.door = door;
  const out = () => (live.current.door ? !!live.current.door.pending() : !!(saver && saver.pending(id)));
  const busy = out();
  // A door opens on its own answer: there is always something to open it onto.
  const opening: BtOpening<D> = door
    ? { base: null, stored: { draft: door.initial as D }, can: true }
    : btOpening<D>(id, saver);
  const { stored, can } = opening;
  // Anything typed is something to ask about, whether or not the save would write it (the header says why).
  const holds = () => {
    const l = live.current;
    return !!(l.open && l.draft != null && !S.same(l.draft, l.opened));
  };
  const fold = useRecordFold(id, { dirty: holds, saving: out });
  // A role that may not change the business never has an editor, whatever asked for one; nor does a page with nothing
  // read to save onto, nor a part of the record its draft cannot be worked out of (btOpening).
  const open = fold.open && canEdit && can;
  const ed: BtEd<D> = { l: live.current, flash: a.flash, ask, out, setDraft, setProblems, setFocusOn };
  const reset = btEditorReset(ed);
  useEffect(() => {
    if (!open) reset();
  }, [open]);
  const now = btEditorSync(live.current, { open, draft, busy, stored });
  const dirty = open && draft != null && !S.same(draft, live.current.opened);

  const update = btEditorUpdate(ed);
  const undo = btEditorUndo(ed, update);
  const close = () => {
    reset();
    fold.close();
  };
  const refused = !!(gate && gate["aria-disabled"]);
  const asks = btAsks({ ask, fold, prefix: a.prefix, busy, dirty, light: a.light, close, reset });
  const submit = btEditorSubmit(a, opening, ed, { busy, open, draft, refused, close });
  const will = btEditorWill(a, opening, open, now);

  // What a body is handed (BtFold's contract says each). `focus(row)` puts focus in the first box of the row the body
  // named `row` (its data-rec-row), as an added row takes it; `opened` is the draft the editor opened with, and
  // `opening` counts the times it has opened, so what a body keeps of its own for one opening (a sheet's search, the
  // rows it has taken out) is known to be from an earlier one.
  const fields = {
    draft: now,
    open,
    problems: problems || {},
    readOnly: busy,
    update,
    change: btEditorChange(ed, update, undo),
    rows: btEditorRows(ed, update, undo, now),
    press: btEditorPress(busy),
    focus: (row: string) => setFocusOn({ row }),
    opened: live.current.opened,
    opening: live.current.opening,
  };
  // `can` is what gates opening (btOpening): there is a config to save onto and a draft that could be worked out of
  // it. A card's `rest` asks it before it offers its act, as a row's act asks `stored`.
  return {
    open,
    busy,
    stored,
    can,
    fields,
    will,
    asks,
    submit,
    focusOn,
    request: fold.request,
    settled: !open && !!live.current.settled,
  };
}
export type BtEditor<D> = ReturnType<typeof useBtEditor<D>>;

/**
 * What the editor works out on every draw, kept on the live record: the opening count, the settled flag, and the draft
 * it opened with. Untouched and not saving, the editor opens with what is stored NOW (the header says why); typed in,
 * what it opened with holds still, since that is what its save is judged against. Answers the draft to draw.
 */
function btEditorSync<D>(
  l: BtLive<D>,
  s: { open: boolean; draft: D | null; busy: boolean; stored: { draft: D } | null },
): D {
  if (s.open && l.opened == null) l.opening += 1;
  // Whether the row at rest was drawn again by this editor's save (RecordRow's `settled`): set as the save closes it,
  // forgotten as it opens again.
  if (s.open) l.settled = false;
  if (s.open && s.stored && (l.opened == null || (s.draft == null && l.draft == null && !s.busy)))
    l.opened = s.stored.draft;
  l.open = s.open;
  return (s.open ? (s.draft != null ? s.draft : l.opened) : s.stored ? s.stored.draft : null) as D;
}
