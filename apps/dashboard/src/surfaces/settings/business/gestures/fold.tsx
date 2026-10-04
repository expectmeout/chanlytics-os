// Chanlytics — Settings › Business: the fold (BtFold) and the sheet (BtSheet). See common.tsx for the page's gestures as a whole.

import { useEffect } from "react";
import type { ReactNode } from "react";
import { FieldError } from "../../../kit/field-error/field-error";
import { RecordFold } from "../../../kit/record/fold";
import { recFolds } from "../../../kit/record/registry";
import { RecordRow } from "../../../kit/record/row";
import { RecordSheet } from "../../../kit/record/sheet";
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
  useBtChanged,
  btOpening,
} from "./common";
import { type BtEditDoor, useBtEditor, type BtEditor } from "./editor";

/* ------------------------------------ a set of fields, under the row that states them ------------------------------------ */

/** What a fold's row says at rest. */
interface BtFoldRow {
  value?: ReactNode;
  empty?: ReactNode;
  hint?: ReactNode;
  wrong?: ReactNode;
  children?: ReactNode;
  act?: string;
  name?: string;
}

/** What a body is handed (BtFold's contract says each). */
type BtFields<D> = BtEditor<D>["fields"];

interface BtFoldProps<D = unknown> {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  row?: BtFoldRow;
  rest?: ((args: { request: () => void; can: boolean }) => ReactNode) | null;
  wide?: boolean;
  lines?: boolean;
  saveLabel?: ReactNode;
  said?: ReactNode;
  footNote?: ReactNode;
  channel?: BtChannel;
  canEdit?: boolean;
  gate?: BtGate;
  flash?: Flash;
  saver?: BtSaver | null;
  check?: ((draft: D) => BtProblems | null | undefined) | null;
  door?: BtEditDoor<D> | null;
  after?: ((draft: D) => void) | null;
  body: (fields: BtFields<D>) => ReactNode;
}

/** A fold's props with the JSX's defaults applied, once. */
function btFoldProps<D>(p: BtFoldProps<D>) {
  return {
    id: p.id,
    label: p.label,
    hint: dflt(p.hint, null),
    row: dflt(p.row, {}),
    rest: dflt(p.rest, null),
    wide: dflt(p.wide, false),
    lines: dflt(p.lines, false),
    saveLabel: dflt(p.saveLabel, "Save"),
    said: dflt(p.said, BT_SAVED),
    footNote: dflt(p.footNote, null),
    channel: dflt(p.channel, "whatsapp"),
    canEdit: dflt(p.canEdit, true),
    gate: dflt(p.gate, null),
    flash: dflt(p.flash, btSkipFlash),
    saver: dflt(p.saver, null),
    check: dflt(p.check, null),
    door: dflt(p.door, null),
    after: dflt(p.after, null),
    body: p.body,
  };
}
type BtFoldR<D> = ReturnType<typeof btFoldProps<D>>;

/**
 * What the row draws at rest: in the fold's place while it is closed, and handed to the fold (`behind`), which draws
 * it behind its sheet while it is open, so the card under the wash keeps its height (kit/record/fold.tsx).
 * Hookless, so drawing it or not moves no cell.
 */
function btFoldAtRest<D>(r: BtFoldR<D>, e: BtEditor<D>, has: boolean) {
  const { row, canEdit, gate } = r;
  return r.rest ? (
    r.rest({ request: e.request, can: e.can })
  ) : (
    <RecordRow
      id={r.id}
      label={r.label}
      value={row.value}
      empty={row.empty}
      hint={has ? null : row.hint}
      wrong={row.wrong}
      settled={e.settled}
      act={
        canEdit && e.stored
          ? {
              label: row.act || (has ? "Change" : "Add one"),
              name: row.name || undefined,
              onClick: () => e.request(),
              gate,
            }
          : null
      }
    >
      {row.children || null}
    </RecordRow>
  );
}

/**
 * One of this page's folds: at rest a RecordRow, and while it is edited the kit's fold (RecordFold, kit/record/fold.tsx)
 * drawn as a sheet beside the page (`frame="sheet"`: from the bottom on a phone, from the right on a desktop), which
 * holds the gesture itself -- its focus, its keys, what saving writes and its foot. A sheet, never a fold under its
 * row, at any width: an editor opening in place pushed everything under it down by up to 546px (23 Sep), and the
 * page holds still only once nothing on it opens in place. What is the page's is the
 * editor (useBtEditor, above), once, for every fold and the sheet: the draft, what stops a save, the save through the
 * tab's one saver, what the receptionist will be told, and the two asks. A card draws its fields (`body`) and what its
 * row says at rest (`row`); nothing else.
 *
 * `body` draws the fields. It is drawn on every render, open or not: a body may hold hooks (a menu, a field's id), and
 * rows that come and go are drawn hookless, as everything that comes and goes here is (this file's header). It is handed all of this, and takes nothing else from its card, `flash` least of all:
 *   draft                 the draft as it stands: what is stored, while the fold is closed;
 *   open                  whether the fold is open, for a body that draws less while it is not;
 *   problems              what stopped the last Save, by field key;
 *   readOnly              the fold's save is out: every box takes it (kit/record/fold.tsx says why);
 *   update(fn, keys)      the draft as `fn` makes it of the LATEST one. `keys` are the field keys whose sentences the
 *                         change answers; left out, all of them. It ANSWERS WHETHER IT TOOK THE CHANGE: while the save
 *                         is out it takes none, and whoever would say "Removed…" says it only of a change that was made;
 *   change(fn, words)     a change that is said: taken, it toasts `words.said`, with an Undo when `words.back` is given
 *                         (the draft as `back` makes it of the latest one; it does nothing once the fold has closed,
 *                         since the draft it would put something back into went with it). Refused, it says nothing: a
 *                         body that toasted for itself said "Removed the Mon shift at 14:00", with an Undo, of a shift
 *                         that was still there. `words.keys` as for update;
 *   rows(list)            a list inside the draft, with every rule a list has, ONCE: see below;
 *   press(fn)             the props of a press that changes the draft (an add, a remove). While the fold saves it
 *                         refuses the way Save does: focusable, aria-disabled (never `disabled`, which lets go of
 *                         focus), and doing nothing:  <button type="button" {...press(() => shifts.removeAt(n, said))}>
 *   focus(row)            focus to the first box of the element the body spread `data-rec-row={row}` on;
 *   opened, opening       the draft it opened with, and how many times it has opened (useBtEditor says why).
 *
 * `rows({ id, name, max, blank, keysOf, key, full, list, put })` answers { canAdd, add(), setAt(i, patch), removeAt(i,
 * said), waiting(), row(i) } for one list of the draft, named by `id`, which is required ("closures", one day's
 * "hours-mon", "services"): the closed days (the draft itself), or one day's shifts (`list`
 * reads it out of the draft and `put` writes it back; left out, the draft is the list). Each body once had to remember
 * all of this, and the cap was forgotten in the one place nobody looks: a toast's Undo put a fifth shift on a Monday
 * that takes four.
 *   the cap        `max`, in all three places: `canAdd` is what the body offers Add by, `add()` appends `blank()` only
 *                  while there is room, and a removed row is PUT BACK only while there is room, the Undo saying `full`
 *                  when there is not;
 *   the removal    the row is captured from the latest draft before it goes, comes back between the same two rows it
 *                  went from, whatever else was taken out or put back since, and `said(row)` is toasted only when the
 *                  change was taken. removeAt answers the toast's Undo itself (false when nothing went), for a body
 *                  that offers it where the row was too; either puts it back once. `waiting()` is every row an Undo may
 *                  still put back, in the list's order, each with where it would go (`at`);
 *   the sentences  `keysOf(i)` are row i's field keys and `key` the list's own (too many). A change to row i answers
 *                  its keys; a removal moves every later row up a place, so it answers them all;
 *   the focus      `name(i)` names row i, and the body spreads `row(i)` on the element that holds its boxes. A row that
 *                  was just added takes focus in its first box (the kit's useRecFocus, through RecordFold's focusOn):
 *                  it stayed on Add.
 * The caps themselves are folds.ts's LIMITS, which the save's checks read too. A list is changed through
 * rows(), never through `update`: rows() is where the cap, the Undo and the index live, and a body that added or
 * removed a row with `update` had none of the three.
 *
 * `row` is what the row at rest draws: { value, empty, hint, wrong, children, act, name }. `hint` is drawn while the
 * row is empty, where it says what empty means; a row that has its fact states it and stops, at every width (24 Sep:
 * the phone's rule, record.css, for the whole tab -- a desktop read "It answers in whichever of these a customer
 * uses." under every list of languages). A BtRow's hint is the same. `act` and `name` replace the
 * act's words and its name where "Change" or "Add one" and the label say nothing together. `rest({ request, can })`
 * draws something else at rest in the row's place: the create card's empty state, for a fold with no fact to state
 * yet, or the first run's language chips, which state the row's facts their own way. Hookless, and its act carries the
 * fold's id as `data-rec-act`, where the fold gives focus back as it closes. `can` is whether there is anything to open
 * it onto, as a row's act asks before it offers one; NOT whether the role may: the create card's act is its primary
 * one, shown to a role that may not press it and saying why at the press, where a row's own act is simply absent. A
 * fold with a `rest` and no fact in its row (`row.value`) states nothing yet, so its untouched Save is judged rather
 * than closed (useBtEditor's `nothingYet`); one whose row holds its fact closes on it, as a row's does.
 * `check(draft)` is the card's own check, beside problemsOf: { fieldKey: sentence } for what the draft does not hold.
 * `door` is for a fold the settings save does not write (how customers buy, which is the workspace's as the zone is):
 * { initial, save(draft, done), pending() }, the fold's own way out in place of the tab's saver, as a row's door is
 * (BtRow). It opens on `initial`, is judged by `check` alone, and says nothing it will tell the receptionist; with
 * nothing stored yet (`initial` null) its untouched Save is judged, as a `rest` fold's is, so a Save with nothing
 * chosen says why under the choice rather than closing as if it had saved. `after(draft)` runs once the fold's save is
 * taken, with the draft it saved: the create card sends what the settings do not hold through its own door then.
 *
 * What it will say is its blocks whole, under "Your receptionist will be told", with the lines that go under "It will
 * no longer be told", and before them the sentence for a save that crosses the resolver's line and each block's own
 * note (willSay's `caveat`: the rules' block says which of its lines the Autonomy tab wrote, the hand-off's that it is
 * always sent). A fold whose fields are LINES of a block other rows write too (`lines`: the voice and the languages are
 * lines of Who you are, beside the name, the address and the link) says only the lines its draft changes, as a row does,
 * under "It will be told": the whole block would say eight lines about a change to one, and say them before anything
 * was typed.
 */
export function BtFold<D = unknown>(props: BtFoldProps<D>) {
  const r = btFoldProps(props);
  const { id, row, rest, door, lines, gate } = r;
  const has = !(row.value == null || row.value === "" || row.value === false);
  const e = useBtEditor<D>({
    id,
    canEdit: r.canEdit,
    gate,
    flash: r.flash,
    saver: r.saver,
    said: r.said,
    channel: r.channel,
    check: r.check,
    door,
    after: r.after,
    nothingYet: (!!rest && !has) || !!(door && door.initial == null),
    prefix: `rec-fold-${id}`,
  });
  const found = e.fields.problems;
  const will = e.will;
  const note = will ? [will.note, lines ? null : will.caveat].filter(Boolean).join(" ") || null : null;
  const says = will ? (lines ? will.added : will.whole) : null;
  const changed = useBtChanged(says);
  const goneChanged = useBtChanged(will ? will.removed : null);
  const atRest = btFoldAtRest(r, e, has);
  return (
    <>
      {e.open ? null : atRest}
      <RecordFold
        frame="sheet"
        behind={atRest}
        id={id}
        label={r.label}
        hint={r.hint}
        open={e.open}
        wide={r.wide}
        says={says}
        changed={changed}
        goneChanged={goneChanged}
        saysLabel={lines ? "It will be told" : "Your receptionist will be told"}
        gone={will ? will.removed : null}
        goneLabel="It will no longer be told"
        note={note}
        footNote={r.footNote}
        focusOn={e.focusOn}
        confirm={e.asks.confirm}
        onSave={e.submit}
        onCancel={e.asks.cancel}
        saving={e.busy}
        saveLabel={r.saveLabel}
        gate={gate}
      >
        {/* With no draft to hand it (btWorkedOut, above) the body is not drawn: it would throw on nothing. */}
        {e.stored ? r.body(e.fields) : null}
        {/* A refusal that is not this fold's to fix (a stored day that closes before it opens, met while saving the
            closures) stops this save too, and is said once, here, naming where. */}
        <FieldError id={`bt-${id}-elsewhere`} message={found.elsewhere || null} testid={`rec-fold-${id}-elsewhere`} />
      </RecordFold>
    </>
  );
}

/* ------------------------------------ a list you scroll, beside the page ------------------------------------ */

/** What a sheet's tools, body and told line are handed: a fold body's, and `will`, what willSay answers. */
type BtSheetFields<D> = BtFields<D> & { will: BtWillSay | null };

interface BtSheetProps<D = unknown> {
  id: string;
  title: ReactNode;
  sub?: ReactNode;
  className?: string;
  saveLabel?: ReactNode | ((fields: BtSheetFields<D>) => ReactNode);
  said?: ReactNode;
  footNote?: ReactNode;
  channel?: BtChannel;
  canEdit?: boolean;
  gate?: BtGate;
  flash?: Flash;
  saver?: BtSaver | null;
  tools?: ((fields: BtSheetFields<D>) => ReactNode) | null;
  told?: ((fields: BtSheetFields<D>) => ReactNode) | null;
  body: (fields: BtSheetFields<D>) => ReactNode;
}

/** A sheet's props with the JSX's defaults applied, once. */
function btSheetProps<D>(p: BtSheetProps<D>) {
  return {
    id: p.id,
    title: p.title,
    sub: dflt(p.sub, null),
    className: dflt(p.className, ""),
    saveLabel: dflt(p.saveLabel, "Save"),
    said: dflt(p.said, BT_SAVED),
    footNote: dflt(p.footNote, null),
    channel: dflt(p.channel, "whatsapp"),
    canEdit: dflt(p.canEdit, true),
    gate: dflt(p.gate, null),
    flash: dflt(p.flash, btSkipFlash),
    saver: dflt(p.saver, null),
    tools: dflt(p.tools, null),
    told: dflt(p.told, null),
    body: p.body,
  };
}

/**
 * One of this page's sheets: the kit's RecordSheet (kit/record/sheet.tsx), a modal dialog beside the page (from the bottom,
 * on a phone), over the same editor a fold is (useBtEditor): the one open at a time, the asks, the draft, the checks,
 * the one job and the saver. It is not a fold, and the registry opens it just the same: it holds the registry under its
 * id as a fold does (useRecordFold, inside the editor), and is open while the registry says so. So opening it with a
 * fold open asks about that fold's changes, opening a fold with it open asks about its own, and the gap line's
 * door opens it by its id, guarded like any row.
 *
 * It has no row of its own. A card draws the row that states the list, whose act asks the registry for this id
 * (recFolds.request); the page draws the sheet.
 *
 * The page draws it LAST of everything on it that holds a hook. It holds its editor's hooks on every draw, and the kit's
 * RecordSheet holds more and is drawn only while it is open. Last was the tests' old stub's rule (a sheet drawn before a
 * card read that card's cells as its own); the stub now keeps each component's hooks where it sits, so it stays last
 * as a habit, not a need. Its rows are drawn hookless, as everything that comes and goes here is.
 *
 * Escape and the head's Close are the foot's Cancel, with its ask: nothing typed is thrown away unasked, and nothing
 * cancels a save that is out; Ctrl or Cmd with Enter saves. The foot, its asks and its keys are the kit's, as a fold's
 * are (RecordSheet takes RecordFold's foot props), drawn in the sheet, above its Save, since Tab never leaves a modal
 * dialog.
 * `tools(fields)`, `body(fields)` and `told(fields)` are the page's: the strip above the rows, the rows, and a line of
 * its own above the foot (what it will be told); each is handed what a fold's body is (BtFold's contract) and `will`,
 * what willSay answers. `saveLabel` is words, or a function of the fields. Nothing of them is drawn while it is closed.
 */
export function BtSheet<D = unknown>(props: BtSheetProps<D>) {
  const r = btSheetProps(props);
  const { id, tools, told, gate } = r;
  const e = useBtEditor<D>({
    id,
    canEdit: r.canEdit,
    gate,
    flash: r.flash,
    saver: r.saver,
    said: r.said,
    channel: r.channel,
    prefix: `rec-sheet-${id}`,
  });
  // The registry counts what is on the page by id, and lets go of the open id when the last of them goes, as it does for
  // a fold (kit/record/fold.tsx drawn). The sheet is drawn only while it is open, so this, which is drawn on every draw, is
  // what the page's going takes with it: the rail's "Yes, leave" left the sheet the open one, and it opened again by
  // itself when the tab was next drawn.
  useEffect(() => recFolds.drawn(id), [id]);
  if (!e.open || !e.stored) return null;
  const f = { ...e.fields, will: e.will };
  // The foot is the kit's, as a fold's is (RecordSheet takes RecordFold's foot props): Save and Cancel, the ask above
  // them and not while the save is out. What is the page's above it: what it will be told, and a refusal that is not
  // this list's to fix, said once, as a fold says it.
  return (
    <RecordSheet
      id={id}
      title={r.title}
      sub={r.sub}
      className={r.className}
      onClose={e.asks.cancel}
      focusOn={e.focusOn}
      tools={tools ? tools(f) : null}
      foot={
        <>
          {told ? told(f) : null}
          <FieldError
            id={`bt-${id}-elsewhere`}
            message={f.problems.elsewhere || null}
            testid={`rec-sheet-${id}-elsewhere`}
          />
        </>
      }
      onSave={e.submit}
      saving={e.busy}
      saveLabel={typeof r.saveLabel === "function" ? r.saveLabel(f) : r.saveLabel}
      gate={gate}
      footNote={r.footNote}
      confirm={e.asks.confirm}
    >
      {r.body(f)}
    </RecordSheet>
  );
}

/**
 * Whether the sheet `id` could open over the saver's base: a read to save onto, and a draft its part of the record can
 * be worked out as. The editor's own test (btOpening, which useBtEditor asks), for the row that opens a sheet the page
 * draws elsewhere, last: a fold offers no act while its draft cannot be worked out, and the row that opens a sheet
 * offered one that opened nothing.
 */
BtSheet.opens = (id: string, saver: BtSaver | null) => btOpening(id, saver).can;
