// Chanlytics — Settings › Business: the page's three gestures.
//
// A row edited in its place (BtRow, over the kit's RecordInline), a set of fields opened in a sheet beside the page
// (BtFold, over the kit's RecordFold drawn as a sheet at every width, so nothing on the page moves), and a list too
// long for a fold, in a sheet of its own (BtSheet, over the kit's RecordSheet); the two questions every one asks before anything typed is thrown away (useBtAsk, btAsks); and the
// editor a fold and a sheet both are (useBtEditor), written once. The kit (surfaces/kit/record) holds the gesture
// itself -- focus, keys, the foot, the registry that keeps one editor open; what is the page's is here, once, for every
// row, fold and sheet of every card: the draft, what stops a save, the save through the tab's one saver
// (saver.ts) or a row's or a fold's own door, and what the receptionist will be told (folds.ts
// willSay).
// A card (who.tsx, open.tsx, offer.tsx, answers.tsx) draws its
// rows' values and its folds' and sheets' fields, and nothing of this.
//
// The cards import BtRow, BtFold and BtSheet. The row and the
// fold are drawn on every render (closed, the kit hides them whole), and what comes and goes inside them (a row at
// rest, a Confirm, a note) holds no hook. That shape was the tests' old stub React's rule -- every hook on a page as a
// cell in one order -- and is no longer anyone's: the stub keeps each component's hooks where it sits, as React does
// (tooling/scripts/tests/_hook-frames.mjs). It stands because it works, not because it must.
//
// The JSX had BtRow, BtFold and useBtEditor each as one function. Here each is a hook that holds what is stateful and
// a few plain functions that work out one thing from it (what the row will say, the dispute, the foot's asks, one
// list's acts), so no function is over the kit's limits; every hook is called in the order the JSX called it.

import { useRef, useState } from "react";
import { Confirm } from "../../../kit/confirm/confirm";
import type { useRecordFold } from "../../../kit/record/hooks";
import type { GateProps, LegacyFlash } from "../../../legacy-verbs";
import { businessTabSave } from ".././saver";
import type { BusinessTabSave } from ".././saver";
import { pageConsole } from ".././shell";

/** A toast, as the tab's cards hand it down (usePPToast's). */
export type Flash = (flash: LegacyFlash) => void;
/** The tab's one saver (save.tsx). */
export type BtSaver = BusinessTabSave["saver"];
/** The config a save would go on (the saver's base), or null when nothing is read to save onto. */
export type BtBase = ReturnType<BtSaver["base"]>;
/** The channel a row's or a fold's words are read on; null is none. */
export type BtChannel = "whatsapp" | "voice" | null;
/** What stopped a save, by field key. */
export type BtProblems = Record<string, string>;
/** A role gate's props (legacy-verbs gate), or none. */
export type BtGate = GateProps | null;
/** What a save says once the server has taken it. */
export type BtWillSay = ReturnType<BusinessTabSave["willSay"]>;

/** A default applies to a value that is `undefined`, as a destructured default does, and to nothing else (null stays). */
export const dflt = <T,>(value: T | undefined, otherwise: T): T => (value === undefined ? otherwise : value);

export const btSkipFlash: Flash = () => undefined;

/* ------------------------------------ one value, edited where it is stated ------------------------------------ */

// What the four rows that are only words say once the server has taken a change: the canvas's Edit-Inline words. The
// two number rows keep the sentences they have always said (PublishedNumberRow, HandoffRow).
export const BT_SAVED = "Saved — the receptionist picks it up within a minute";

export const btNoCheck = () => null;

/**
 * Something a row or a fold works out AS IT DRAWS, tried: its answer, or `otherwise` when it throws, with the fault
 * reported. The page is untyped, the helpers it asks (folds.ts, the bridge) throw on a draft they were not
 * written for (a switch a body left out, a bridge function the standalone mockup lacks), and a throw while drawing is
 * the shell's error boundary's: the whole of Settings replaced by "something went wrong", over one fold's footer. What
 * cannot be worked out is not drawn; the page stays, and what was typed with it.
 */
export const btWorkedOut = <T,>(what: string, fn: () => T, otherwise: T | null = null): T | null => {
  try {
    return fn();
  } catch (err) {
    const log = pageConsole();
    if (log) log.error(`Settings › Business could not work out ${what}.`, err);
    return otherwise;
  }
};
/**
 * The two questions an open editor asks before anything typed is thrown away, for a row edited in its place and for a
 * fold alike: Cancel's own, and the registry's, when another row is asked for (or the gap line's door is pressed)
 * while this one holds changes. Each gesture held a copy of this block, and both copies had the same fault: Cancel armed
 * its question, another row's act drew the registry's over it, "Keep editing" took the registry's away, and Cancel's
 * was still armed behind it, so the owner was asked the same thing twice. They are ONE question: whichever is on
 * screen, its answer answers both.
 *
 * useBtAsk() holds whether Cancel's is armed (the one hook here; it stands where each gesture's `arm` stood). btAsks
 * builds, from it and the gesture's own close and reset, the `cancel` the kit's foot and Escape call and the `confirm`
 * the kit draws in Save's place. A gesture's reset disarms, as it always did.
 *
 * Not every Cancel asks. In an editor that holds ONE value (`light`: a row edited in its place, the calendar's
 * address, the booking tool picked from a list) the editor's own Cancel, Close, Escape and wash close it at once,
 * whatever was typed: the person has said they are done with it, typing it again costs a breath, and a question over
 * one word is in the way (Ruben, 7 Oct 2026, of "Where your bookings come from"). Moving away by another act is not
 * that decision, so it still asks, whatever the editor holds: another row's act, the rail, a step of the first run and
 * the tab closing all go through the registry, which is told of anything typed as before (a person who typed a name and
 * pressed the next thing may believe it was kept). An editor of several fields, a list or a sentence asks on its own
 * Cancel too. Every one of these questions wears the quiet tone a discard has (kit/confirm).
 */
export const useBtAsk = () => {
  const [armed, setArmed] = useState(false);
  return { armed, arm: () => setArmed(true), disarm: () => setArmed(false) };
};
export type BtAsk = ReturnType<typeof useBtAsk>;

interface BtAsksArgs {
  ask: BtAsk;
  fold: ReturnType<typeof useRecordFold>;
  prefix: string;
  busy: boolean;
  dirty: boolean;
  /** One value, typed again in a breath: the editor's own Cancel throws it away without asking. */
  light?: boolean;
  close: () => void;
  reset: () => void;
}
export const btAsks = ({ ask, fold, prefix, busy, dirty, light = false, close, reset }: BtAsksArgs) => {
  // The question and its two answers, and nothing under them: "Discard changes?" says what the press does
  // (Ruben, 10 Oct 2026: a line saying nothing was saved said the question again).
  const words = {
    question: "Discard changes?",
    detail: null,
    yes: "Discard",
    no: "Keep editing",
  };
  return {
    // Not while it saves: the save is on its way, and closes the editor when the server takes it (kit/record/fold.tsx).
    cancel: () => {
      if (busy) return;
      if (dirty && !light) {
        ask.arm();
        return;
      }
      close();
    },
    confirm: fold.asking ? (
      <Confirm
        {...words}
        discard
        onYes={() => {
          reset();
          fold.discard();
        }}
        onNo={() => {
          ask.disarm();
          fold.stay();
        }}
        testid={`${prefix}-ask`}
      />
    ) : ask.armed ? (
      <Confirm {...words} discard onYes={close} onNo={ask.disarm} testid={`${prefix}-cancel`} />
    ) : null,
  };
};

/**
 * Which lines of a block of what a save will say the draft has just changed, for the kit to mark (RecordSays'
 * `changed`) and record.css to wash, once (spec §9, item 3). The block drawn last is kept, and a new one is compared
 * with it as it is drawn (changedLines): the answer holds until the block changes again, so a draw that changes
 * nothing leaves the mark where it is, on the same line, which does not wash twice. A block that goes (the editor
 * closed, or a draft its checks refuse) is forgotten, so the next one to appear is arriving, not changing.
 */
export const useBtChanged = (text: string | null | undefined) => {
  const seen = useRef<{ text: string | null; changed: ReturnType<BusinessTabSave["changedLines"]> }>({
    text: null,
    changed: [],
  });
  const now = typeof text === "string" && text !== "" ? text : null;
  if (now !== seen.current.text)
    seen.current = { text: now, changed: businessTabSave.changedLines(seen.current.text, now) };
  return seen.current.changed;
};

// What a toast's Undo says when it can put nothing back: the fold it was in has closed, or its save is out, or the list
// the row came from was replaced whole since (a day's hours copied over another's).
export const BT_UNDO_CLOSED = "Not put back — the editor it was in has closed. Open it again to change it.";
export const BT_UNDO_SAVING = "Not put back — this is being saved.";
export const BT_UNDO_REPLACED = "Not put back — the list it came from was replaced since, so it has no place to go.";

/* ------------------------------------ the rows an Undo may still put back ------------------------------------ */

// A list is known by its name, always: two lists rows() could not tell apart would share their put-backs, and a removal
// in one would move the other's (Monday's shifts moved Tuesday's, the quality review's P1).
export const btListNamed = (list: unknown, who = "BtPutBacks"): string => {
  if (typeof list !== "string" || list === "") {
    throw new TypeError(
      `${who} needs the list's name (a services list, "closures", one day's "hours-mon"), not ${JSON.stringify(list)}.`,
    );
  }
  return list;
};

/** A row taken out of a list, waiting to go back. */
export interface BtPutBack {
  id: number;
  list: string;
  at: number;
  row: unknown;
}

/**
 * The rows taken out of the lists of a draft that an Undo may still put back, as a pure value: an array of
 * { id, list, at, row }, each list's in that list's own order, `at` being how many of the list's rows come before it.
 * Nothing here changes what it is handed; each answers the next value.
 *
 * A row goes back between the same two rows it was taken from, whatever was taken out or put back since. So a put-back
 * moves with the rows around it: a row taken out before it moves it up a place, and one put back before it moves it
 * down one, in its own list and no other. Each Undo once kept the index its row had when it went, so with Service 6 out
 * and then Service 3, Service 6's went back between 7 and 8 (the spec review's repro).
 *   taken(backs, list, i, { id, row })  row i of `list` went. It is placed after every put-back already waiting before
 *                                       row i and before every one after it, so two in one gap go back in their order.
 *   restored(backs, id)                 the put-back `id` is a row again: every one after it in its list moves down.
 *   dropped(backs, list)                `list` was replaced whole from outside its rows(): its put-backs have no place.
 *   of(backs, list), find(backs, id)    a list's, in order; one by its id, or null.
 */
export const BtPutBacks = Object.freeze({
  none: Object.freeze<BtPutBack[]>([]),
  taken(backs: readonly BtPutBack[], list: string, i: number, entry: { id: number; row: unknown }): BtPutBack[] {
    btListNamed(list);
    const after = backs.findIndex((b) => b.list === list && b.at > i);
    const moved = backs.map((b) => (b.list === list && b.at > i ? { ...b, at: b.at - 1 } : b));
    const where = after < 0 ? moved.length : after;
    return [...moved.slice(0, where), { id: entry.id, list, at: i, row: entry.row }, ...moved.slice(where)];
  },
  restored(backs: readonly BtPutBack[], id: number): readonly BtPutBack[] {
    const k = backs.findIndex((b) => b.id === id);
    const back = backs[k];
    if (!back) return backs;
    const { list } = back;
    return backs.filter((_, j) => j !== k).map((b, j) => (j >= k && b.list === list ? { ...b, at: b.at + 1 } : b));
  },
  dropped(backs: readonly BtPutBack[], list: string): BtPutBack[] {
    btListNamed(list);
    return backs.filter((b) => b.list !== list);
  },
  of(backs: readonly BtPutBack[], list: string): BtPutBack[] {
    btListNamed(list);
    return backs.filter((b) => b.list === list);
  },
  find(backs: readonly BtPutBack[], id: number): BtPutBack | null {
    return backs.find((b) => b.id === id) || null;
  },
});
// What a Save says when its own checks could not run: nothing was sent, and the editor stays open with what was typed.
export const BT_UNCHECKED =
  "Not saved — this could not be checked, so nothing was sent. Try again, and tell us if it keeps happening.";

/** The row's own way out in place of the tab's saver: the timezone, which is the workspace's. */
export interface BtRowDoor<D> {
  save: (draft: D, done: () => void) => void;
  pending: () => unknown;
}

/** What an editor opens over (btOpening). */
export interface BtOpening<D> {
  base: BtBase;
  stored: { draft: D } | null;
  can: boolean;
}

/**
 * What an editor opens over, and whether it can open at all: the config its save will go on (the saver's base), the
 * draft its part of it opens as, which the body is drawn with while it is closed, and `can`, which needs both. The
 * draft is tried, like everything else worked out as the page draws (btWorkedOut): an editor whose part of the record
 * cannot be read opens nothing and offers no act, and its row still says what it says. One test, for the editor and for
 * a row that opens a sheet drawn elsewhere (BtSheet.opens): the row once asked a copy of it.
 */
export const btOpening = <D,>(id: string, saver: BtSaver | null): BtOpening<D> => {
  const base = saver ? saver.base() : null;
  const stored = btWorkedOut(`the draft the ${id} fold opens with`, () => ({
    draft: businessTabSave.draftOf(id, base || {}) as D,
  }));
  return { base, stored, can: !!base && !!stored };
};
