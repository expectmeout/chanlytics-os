// Chanlytics — Settings › Business: the row gesture (BtRow), one value edited in its place. See common.tsx for the page's gestures as a whole.

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { FoldSection } from "@/legacy-bridge/business-tab";
import type { LegacyFlash } from "../../../legacy-verbs";
import { useRecordFold } from "../../../kit/record/hooks";
import { RecordInline } from "../../../kit/record/inline";
import { RecordRow } from "../../../kit/record/row";
import type { Brain, RowChange } from ".././save";
import { businessTabSave } from ".././saver";
import {
  type Flash,
  type BtSaver,
  type BtBase,
  type BtChannel,
  type BtGate,
  type BtWillSay,
  dflt,
  btSkipFlash,
  btNoCheck,
  btWorkedOut,
  useBtAsk,
  btAsks,
  useBtChanged,
  type BtRowDoor,
} from "./common";

/* ------------------------------------ one value, edited in its place: the row ------------------------------------ */

/** A row's one-key change with its toast's words (save.tsx PATCH_OF), or the toast the server's answer makes. */
interface BtCommit {
  change: RowChange;
  said: ReactNode | ((answer: unknown) => LegacyFlash);
}
/** The other answer a row disagrees with, and the draft that takes it (`use`). */
export interface BtDisputed<D> {
  value: ReactNode;
  source?: string | null;
  severity?: string;
  sentence?: ReactNode;
  useLabel?: ReactNode;
  use?: D | null;
}
/** What a row's body is handed. */
interface BtRowBodyArgs<D> {
  draft: D;
  set: (draft: D) => void;
  problem: string | null;
  field: {
    id: string;
    label: null;
    "aria-labelledby": string;
    "aria-describedby": string | undefined;
    readOnly: true | undefined;
  };
  gate: BtGate;
  readOnly: boolean;
  open: boolean;
}

interface BtRowProps<D = unknown> {
  id: string;
  section?: FoldSection | FoldSection[] | null;
  label: ReactNode;
  named?: string | null;
  brain: Brain;
  base?: BtBase;
  value?: ReactNode;
  empty?: ReactNode;
  hint?: ReactNode;
  source?: string | null;
  disputed?: BtDisputed<D> | null;
  wrong?: ReactNode;
  initial: D;
  storedAs?: ((draft: D) => unknown) | null;
  check?: (draft: D) => string | null | undefined;
  commit?: ((draft: D) => BtCommit) | null;
  door?: BtRowDoor<D> | null;
  body: (args: BtRowBodyArgs<D>) => ReactNode;
  channel?: BtChannel;
  canEdit?: boolean;
  gate?: BtGate;
  flash?: Flash;
  saver?: BtSaver | null;
}

/** A row's props with the JSX's defaults applied, once. */
function btRowProps<D>(p: BtRowProps<D>) {
  return {
    id: p.id,
    section: dflt(p.section, null),
    label: p.label,
    named: dflt(p.named, null),
    brain: p.brain,
    base: dflt(p.base, null),
    value: dflt(p.value, null),
    empty: dflt(p.empty, null),
    hint: dflt(p.hint, null),
    source: dflt(p.source, null),
    disputed: dflt(p.disputed, null),
    wrong: dflt(p.wrong, null),
    initial: p.initial,
    storedAs: dflt(p.storedAs, null),
    check: dflt(p.check, btNoCheck),
    commit: dflt(p.commit, null),
    door: dflt(p.door, null),
    body: p.body,
    channel: dflt(p.channel, "whatsapp"),
    canEdit: dflt(p.canEdit, true),
    gate: dflt(p.gate, null),
    flash: dflt(p.flash, btSkipFlash),
    saver: dflt(p.saver, null),
  };
}
type BtRowR<D> = ReturnType<typeof btRowProps<D>>;

/** What the registry reads when it asks whether a row holds changes, kept as it is typed. */
interface BtRowLive<D> {
  draft: D | null;
  initial: D;
  storedAs: (draft: D) => unknown;
  open: boolean;
}

/**
 * The row's state: the draft, what stopped the last save, its two asks, and the hold it keeps on the registry. Hooks in
 * the JSX's order (draft, problem, the ask, the live record, the fold, the settled flag, the reset effect).
 */
function useBtRowEditor<D>(r: BtRowR<D>) {
  const { id, door, saver, gate, flash, check, commit, canEdit, initial } = r;
  // What saving writes is save.tsx's.
  const S = businessTabSave;
  // A row of words stores its draft trimmed.
  const storedAs: (draft: D) => unknown = r.storedAs || S.trimmed;
  const [draft, setDraft] = useState<D | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const ask = useBtAsk();
  // What the registry reads when it asks whether this row holds changes. A keystroke lands here as it is typed, so a
  // press on another row straight after typing is asked about even before the page has drawn again. (The row's own
  // Cancel asks nothing: it holds one value, common.tsx's `light`.)
  const live = useRef<BtRowLive<D>>({ draft: null, initial, storedAs, open: false });
  const holds = () => {
    const l = live.current;
    return l.open && l.draft != null && !S.same(l.storedAs(l.draft), l.storedAs(l.initial));
  };
  // The tab's one saver (save.tsx): this row's save waits its turn behind any other, and goes on the
  // config current then. The registry asks whether it is out as it asks whether the row holds changes: when it needs to.
  const out = () => (door ? !!door.pending() : !!(saver && saver.pending(id)));
  const busy = out();
  const fold = useRecordFold(id, { dirty: holds, saving: out });
  // A role that may not change the business never has an editor, whatever asked for one.
  const open = fold.open && canEdit;
  live.current.initial = initial;
  live.current.storedAs = storedAs;
  live.current.open = open;
  const now = open && draft != null ? draft : initial;
  const dirty = open && !S.same(storedAs(now), storedAs(initial));
  const save = (c: BtCommit, done: () => void) => {
    if (saver) saver.save({ row: id, change: c.change, said: c.said, done, flash });
  };
  // Whether the row at rest was drawn again by its editor's save, for its value to arrive (RecordRow's `settled`, the
  // save settle): set as the save closes the editor, forgotten as it opens again.
  const settled = useRef(false);
  if (open) settled.current = false;
  const closeSaved = () => {
    settled.current = true;
    close();
  };
  // Closed by anything -- saved, cancelled, or given way to another row -- the draft goes with it, and the next
  // opening starts from what is stored.
  const reset = () => {
    live.current.draft = null;
    setDraft(null);
    setProblem(null);
    ask.disarm();
  };
  useEffect(() => {
    if (!open) reset();
  }, [open]);

  // Nothing is typed into a save that is out: the box is read-only then, and this is the same rule for whatever else
  // the row's body draws. Asked at the moment of the change: a press made before the page has drawn again is live.
  const set = (d: D) => {
    if (out()) return;
    live.current.draft = d;
    setDraft(d);
    if (problem) setProblem(null);
    if (ask.armed) ask.disarm();
  };
  const close = () => {
    reset();
    fold.close();
  };
  const refused = !!(gate && gate["aria-disabled"]);
  const asks = btAsks({ ask, fold, prefix: `rec-inline-${id}`, busy, dirty, light: true, close, reset });
  const submit = () => {
    if (busy || !open || refused) return;
    const bad = check(now);
    if (bad) {
      setProblem(bad);
      return;
    }
    // Nothing to write is nothing to send: the editor closes and says nothing, since nothing was saved.
    if (!dirty) {
      close();
      return;
    }
    // Saved with Ctrl or Cmd and Enter while Cancel's question was up: the question is answered.
    if (ask.armed) ask.disarm();
    if (door) door.save(now, closeSaved);
    else if (commit) save(commit(now), closeSaved);
    else throw new TypeError(`The ${id} row has no commit and no door to save through.`);
  };
  return { fold, open, busy, now, dirty, problem, set, save, asks, submit, settled: settled.current };
}
type BtRowEditor<D> = ReturnType<typeof useBtRowEditor<D>>;

/** What the row will say the receptionist is told: the lines of its blocks the draft changes, the line it crosses. */
interface BtRowSays {
  note: NonNullable<BtWillSay>["note"];
  says: NonNullable<BtWillSay>["added"];
  gone: NonNullable<BtWillSay>["removed"];
}

/**
 * What saving would tell the receptionist: the lines of its blocks that the draft changes, and the sentence for a
 * save that crosses the resolver's own line, from the one helper the folds ask too (folds.ts willSay,
 * which says what each part is). Only for a draft the save would send, and only while the editor is open, because
 * each call parses the whole brain and resolves a full prompt. Nothing is drawn when nothing changes: never an empty
 * "It will say".
 */
function btRowSays<D>(r: BtRowR<D>, e: BtRowEditor<D>): BtRowSays | null {
  const commit = r.commit;
  if (!(e.dirty && commit && !r.check(e.now))) return null;
  const S = businessTabSave;
  // Both brains are the saver's: the one this row's save will go on (its base), and that one with this row's patch
  // applied as the saver will apply it (patched), on a copy, so a patch that edits a nested object in place leaves
  // the base as it was. Tried, since it is worked out as the row draws (btWorkedOut).
  const on = r.base && r.base.brain ? r.base : { brain: r.brain };
  const will = btWorkedOut(`what the ${r.id} row will say`, () =>
    S.willSay({
      was: on.brain,
      next: S.patched(on, { row: r.id, change: commit(e.now).change }).brain,
      sections: r.section || (r.id as FoldSection),
      channel: r.channel,
    }),
  );
  if (will && (will.added || will.removed || will.note))
    return { note: will.note, says: will.added, gone: will.removed };
  return null;
}

/**
 * A disagreement, as the kit draws one: the other answer, in the resolver's own sentence when there is one, and one
 * press that takes it, saved through this row's own commit and gated like every press on the row. A role that may not
 * change the business reads the disagreement and is offered no press, as it is offered no act; nor is anyone, where
 * the other answer is information rather than a fill (btDispute's `use` is null). Nor where the row has no `commit`
 * to save it through (a row with a `door`, the zone's), as the will-say block asks too: the press called commit and
 * threw.
 */
function btRowDispute<D>(r: BtRowR<D>, e: BtRowEditor<D>) {
  const { disputed, commit, flash } = r;
  if (!disputed) return null;
  const use = disputed.use;
  return {
    value: disputed.value,
    source: disputed.source,
    severity: disputed.severity,
    sentence: disputed.sentence,
    useLabel: disputed.useLabel,
    onUse:
      r.canEdit && commit && use != null
        ? () => {
            if (e.busy) return;
            const bad = r.check(use);
            if (bad) {
              flash({ tone: "warn", msg: <>{bad}</> });
              return;
            }
            e.save(commit(use), () => undefined);
          }
        : undefined,
    gate: r.gate || undefined,
  };
}

/** The row at rest: its value, where it came from, and one act. */
function btRowAtRest<D>(r: BtRowR<D>, e: BtRowEditor<D>, other: ReturnType<typeof btRowDispute<D>>) {
  const { value, named, gate } = r;
  return (
    <RecordRow
      id={r.id}
      label={r.label}
      value={value}
      empty={r.empty}
      hint={value ? null : r.hint}
      source={r.source}
      disputed={other}
      wrong={r.wrong}
      settled={e.settled}
      act={
        r.canEdit
          ? {
              label: value ? "Change" : "Add one",
              name: named ? (value ? `Change the ${named}` : `Add one ${named}`) : undefined,
              onClick: () => e.fold.request(),
              gate,
            }
          : null
      }
    />
  );
}

/**
 * One of this page's rows: at rest a RecordRow, and while it is edited the kit's inline editor (RecordInline,
 * kit/record/inline.tsx), which holds the gesture itself -- its focus, its keys, what saving writes and its foot. What is the
 * page's is here: the draft, what stops a save, the save through the tab's one saver, what the receptionist will be
 * told, and the row's disagreement with its press.
 *
 * At rest the row is its value, where the value came from, and one act. The act opens the editor in the row's place.
 * What stops a save is said under the box before any round trip, never as a toast. Cancel with changes asks first, as
 * the form this replaces did (S22). When the server accepts, the editor closes and the toast says so; the surface's
 * refresh finishes behind it.
 *
 * It holds the fold registry (kit/record/fold.tsx) as a fold does, so one editor or fold is open on the page at a time:
 * opening another row closes a clean editor and asks about one holding changes, and the Settings rail and the
 * browser's unload prompt ask before its changes are thrown away. Its dirty test is bound to its id as it mounts, so
 * it is asked however the row was opened: by its own act, or by its id from the gap line's door.
 *
 * What a row writes is handed to it in four answers, the last three built from save.tsx's check, stored
 * value and patch for the row: `initial` (the draft it opens with, from what is stored), `storedAs` (what a draft would
 * store, which is what "holds changes" is judged by; not `valueOf`, which every props object already has from
 * Object.prototype, so a default for it never applies), `check` (the sentence that stops a save, or null), and
 * `commit` (the one-key change a save makes, with its toast's words). `body` draws the box; it is handed the draft, its
 * setter, what stops it, the field's own ids, whether the row's save is out (`readOnly`, which the field's props carry
 * too), and whether the editor is `open`, for a body that works out less while it is not. A disagreement on the row names the other answer and the draft that takes it (`disputed.use`), which
 * saves through the same `commit`.
 *
 * While its save is out the row is not an open, unsaved editor (kit/record/fold.tsx): its box takes no typing, since what
 * was typed under "Saving…" was dropped without a word when the save landed, and the registry is told the save is out,
 * so another row's act waits for its answer.
 *
 * `section` is the row's name to consequenceOf (FOLD_BLOCK) where it is not the row's id, or the names of each block
 * its save can change: a rename changes the line the prompt opens with and, where the stored prompt is the product's
 * own, that too. `channel` is the one the row's words are read on; the transfer number is a call's, and changes nothing
 * on WhatsApp. Null is no channel that reads them on this workspace, and the row says nothing it will say.
 *
 * `brain` is the settings read's, which the row states and opens from; `base` is the config its save will go on (the
 * saver's base()), which is what it will say is worked out on. The two differ while another save is out, or taken and
 * not read back yet.
 *
 * `door` is for a row the settings save does not write (the timezone, which is the workspace's): { save(draft, done),
 * pending() }, the row's own way out in place of the tab's saver and `commit`. Everything else is the row's as for any
 * other: one editor open, its asks, its box read-only and the registry told while its save is out. Its pending state
 * must outlive the page, as the saver does (save.tsx keeps the zone's); a door that kept it in a
 * component would draw a page come back to mid-save as not saving. Such a row writes no block of the prompt, and says
 * nothing it will say.
 *
 * `named` is what the row holds, said as a thing, where its label is a phrase: a screen reader hears the act as its
 * words and the label together, and "Change Tells customers to call" says nothing, where "Change the number customers
 * are told to call" does. A row whose label is a noun needs none ("Change Website", "Add one Address").
 */
export function BtRow<D = unknown>(props: BtRowProps<D>) {
  const r = btRowProps(props);
  const e = useBtRowEditor(r);
  const says = btRowSays(r, e);
  const other = btRowDispute(r, e);

  const changed = useBtChanged(says ? says.says : null);
  const goneChanged = useBtChanged(says ? says.gone : null);

  // The field is named by the row's own label, where the label stays (the canvas's editing row), rather than by a
  // second copy of it over the box; what it will say describes the box too. Both ids are the kit's (RecordInline).
  const field = {
    id: `bt-${r.id}`,
    label: null,
    "aria-labelledby": `rec-inline-${r.id}-key`,
    "aria-describedby": says ? `rec-inline-${r.id}-says` : undefined,
    readOnly: e.busy || undefined,
  } as const;
  // Drawn on every render, open or not: the box holds hooks of its own (RecordField's id).
  const inner = r.body({
    draft: e.now,
    set: e.set,
    problem: e.problem,
    field,
    gate: r.gate,
    readOnly: e.busy,
    open: e.open,
  });
  return (
    <>
      {e.open ? null : btRowAtRest(r, e, other)}
      <RecordInline
        id={r.id}
        label={r.label}
        open={e.open}
        disputed={other}
        says={says ? says.says : null}
        saysLabel="It will say"
        gone={says ? says.gone : null}
        goneLabel="It will no longer say"
        note={says ? says.note : null}
        confirm={e.asks.confirm}
        onSave={e.submit}
        onCancel={e.asks.cancel}
        saving={e.busy}
        gate={r.gate}
        changed={changed}
        goneChanged={goneChanged}
      >
        {inner}
      </RecordInline>
    </>
  );
}
