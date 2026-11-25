/**
 * The record kit: the fold (moved whole from legacy/components/record-fold.jsx, decision 0015: the kit's one
 * implementation, which the pages import).
 *
 * Two of the kit's three gestures (spec §5): the fold, a set of fields opened under the row that states them, and the
 * inline editor, one value edited in its row (inline.tsx); the sheet is sheet.tsx. The two share what they have in common
 * rather than holding two copies of it: focus in as they open, back as they close, and back to where the person was when
 * what held it leaves the page under it (useRecFocus, focus.ts); Escape and Ctrl or Cmd with Enter (recKeys); what saving
 * writes (RecordSays); and their hold on the registry (useRecDrawn). Save and Cancel are the fold's foot (RecordFoot,
 * which the sheet draws too) and the inline editor's two presses where its row's act was.
 *
 * A set of fields opens under the row that states them. Its head keeps the row's label where it was and puts the page's
 * hint where the value was; its act becomes Close. Under its fields, a fold can show what saving it will write, exactly as
 * the inline editor does, through the one RecordSays: the lines it adds (`says`, under the page's own eyebrow,
 * `saysLabel`), the lines it takes away (`gone`, under `goneLabel`), and a sentence of the page's before them (`note`)
 * where the save reaches past its own lines. Its foot carries its own Save and Cancel, and a line of the page's beside
 * them (`footNote`: not `note`, which is RecordSays' sentence wherever the kit says it). The page decides what its fields
 * are and what saving does; the kit knows none of it. Whether it is open comes from the registry, through useRecordFold
 * (hooks.ts): the `open` prop stays, but a fold drawn open without the registry holds no guard.
 *
 *   const rules = useRecordFold("booking_rules", { dirty: changed });
 *   <RecordFold id="booking_rules" label="Booking rules" hint="…" open={rules.open} says={block} saysLabel="…"
 *               onSave={save} onCancel={rules.close} saving={busy} gate={gate("settings", "change the booking rules")}>
 *     …fields…
 *   </RecordFold>
 *
 * Its fields, what saving writes and its foot sit under the value, past the label column the rows keep. A fold whose own
 * grid carries a label column (a week's days, each named) is `wide`: its fields take the fold's whole width, and what
 * saving writes and the foot keep the indent. record.css draws both.
 *
 * On a phone (the record kit's width, recPhoneQuery, kept current as the window changes size) an open fold is a sheet
 * rising from the bottom instead: the kit's one sheet (kit/sheet/sheet.tsx `Sheet`, on Base UI's Dialog), its title the
 * fold's label, the line under it its hint, its round Close the fold's Cancel, its rows the fields and what saving writes,
 * its foot the fold's. It is modal: focus is held in it, and Escape, a press on the wash, a pull down and its Close all ask
 * the fold's Cancel (nothing while the save is out). Focus comes and goes by the fold's own rules (useRecFocus): to its
 * first field as it opens (the sheet itself on a touch screen), back to its row's act as it closes. The page never learns
 * which frame drew it: the fold is called the same way, holds the same hooks in the same order, open or closed, at either
 * width, and its registry, its asks and its save are the page's. A width crossed while it is open draws it again in the
 * other frame, still open, with focus in its first field; what was typed is the page's, and stays.
 *
 * `frame` is where an open fold is drawn. "row", the default, is the fold under its row on a desktop and the sheet on a
 * phone (the person's page). "sheet" is the sheet at every width: beside the page on a desktop, as RecordSheet's is, and
 * from the bottom on a phone. A fold drawn as a sheet is drawn so open or shut (`open`), so it leaves the way it came,
 * as every kit sheet does. Settings › Business draws every fold this way: an editor that opened under its
 * row pushed everything under it down by up to 546px, and the page held still only once nothing on it opened in place.
 * The row the fold opens from stays drawn in its card behind the sheet (`behind`), so the card keeps its height under the
 * wash, whichever width drew it.
 *
 * A fold whose fields save themselves -- a choice recorded as it is made, a person's consent or their receptionist -- is
 * given no `onSave`: it draws no foot, and Close is its only act. Everything else is the fold's as ever: one open at a
 * time, a sheet on a phone, focus in and back, Escape.
 *
 * A page may draw a fold only while it is open, or keep it and flip `open`. Closed, it is `hidden`, whole: its head and
 * its Close go with its fields, out of sight, the tab order and the accessibility tree, and the row it opens from is what
 * shows. (`inert` would do the last two, but React 18 and 19 spell it differently; `hidden` they share.) Either way it
 * unfolds as it appears (record.css, @starting-style).
 *
 * Escape cancels, unless something inside the fold took the key first (a combobox's list closing); Ctrl or Cmd with
 * Enter saves. As it opens, focus moves to the first thing in it to type into or press, since the act that opened it has
 * gone; as it closes, focus that went with it comes back to that row's act (data-rec-act).
 *
 * `confirm` is the page's ask (its Confirm), drawn in the foot's place while it is asked: the section's own "Discard
 * your changes?", or the registry's `asking`. A question stands alone: Save and Cancel are not drawn beside its two
 * answers (four presses in two colours, Ruben, 7 Oct 2026), and come back with "Keep editing", as focus comes back into
 * the fold (useRecFocus).
 * `focusOn` ({ row }) names a row a list in it has just been given, by the data-rec-row the page put on it: focus goes to
 * that row's first box. A new object each time, so the same row named twice is focused twice. `changed` and
 * `goneChanged` are the lines of `says` and `gone` the draft has just changed, for RecordSays to mark. Not while it
 * saves: nothing asks whether to discard a change that is on its way (registry.ts says what happens to an ask
 * meanwhile), and the fold says it is busy.
 */
import { useRef } from "react";
import type { MouseEvent, ReactNode, RefObject } from "react";
import { Icon } from "../icon/icon";
import { Sheet } from "../sheet/sheet";
import { recFirstIn, useRecFocus, useRecDrawn, useRecPhone, recKeys } from "./focus";
import type { FocusOn } from "./focus";
import type { FoldId } from "./registry";
import { RecordFoot, RecordSays } from "./says";
import { onTouchScreen } from "./shell-verbs";

/** A fold's Cancel: what Close, the foot's Cancel, a press on the wash and Escape all do. */
type CancelFold = (e?: MouseEvent<HTMLElement>) => void;

interface RecordFoldProps {
  id: FoldId;
  label: ReactNode;
  hint?: ReactNode;
  open?: boolean;
  says?: string | null;
  saysLabel?: ReactNode;
  gone?: string | null;
  goneLabel?: ReactNode;
  note?: ReactNode;
  footNote?: ReactNode;
  confirm?: ReactNode;
  focusOn?: FocusOn | null;
  changed?: number[] | null;
  goneChanged?: number[] | null;
  /** Beside the folded lines in a sheet: what is worth knowing without opening them ("Changed"). */
  saysMark?: ReactNode;
  /** A sentence about whose lines they are, drawn inside the fold with them (RecordSays' `aside`). */
  saysAside?: ReactNode;
  onSave?: ((e?: MouseEvent<HTMLButtonElement>) => void) | null;
  onCancel?: CancelFold | null;
  saving?: boolean;
  saveLabel?: ReactNode;
  savingLabel?: ReactNode;
  cancelLabel?: ReactNode;
  closeLabel?: string;
  gate?: Record<string, unknown> | null;
  wide?: boolean;
  behind?: ReactNode;
  frame?: string;
  children?: ReactNode;
}

/** What one draw of a fold works out once, for whichever frame draws it. */
interface FoldDraw {
  /** The fold's box: the `div` under its row, or the kit's sheet where it is one. */
  box: RefObject<HTMLDivElement | null>;
  ask: ReactNode;
  foot: ReactNode;
  told: ReactNode;
  cancel: CancelFold;
  keys: ReturnType<typeof recKeys>;
  onFocus: ReturnType<typeof useRecFocus>;
}

/**
 * What saving writes, drawn under the fold's fields: in a sheet, folded behind one line (RecordSays' `folded`), so the
 * fields are the sheet and the composer's words are one press away (Ruben, 10 Oct 2026: the sheets "too wordy, too
 * explanatory"); under its row, on show, as it always was.
 */
function foldTold(props: RecordFoldProps, sheet: boolean) {
  const { id, says = null, saysLabel = null, gone = null, goneLabel = null, note = null } = props;
  const { changed = null, goneChanged = null, saysMark = null, saysAside = null } = props;
  return (
    <RecordSays
      folded={sheet}
      mark={saysMark}
      aside={saysAside}
      id={`rec-fold-${id}-says`}
      testid={`rec-fold-says-${id}`}
      text={says}
      label={saysLabel}
      gone={gone}
      goneLabel={goneLabel}
      note={note}
      changed={changed}
      goneChanged={goneChanged}
    />
  );
}

/** The fold's foot: its own Save and Cancel, drawn only where the fold saves. */
function foldFoot(props: RecordFoldProps) {
  const { id, onSave, onCancel, saving = false, saveLabel = "Save", savingLabel = "Saving…" } = props;
  const { cancelLabel = "Cancel", gate = null, footNote = null } = props;
  return onSave ? (
    <RecordFoot
      saveTestid={`rec-fold-save-${id}`}
      cancelTestid={`rec-fold-cancel-${id}`}
      onSave={onSave}
      onCancel={onCancel}
      saving={saving}
      saveLabel={saveLabel}
      savingLabel={savingLabel}
      cancelLabel={cancelLabel}
      gate={gate}
      footNote={footNote}
    />
  ) : null;
}

/**
 * The fold as a sheet: the kit's one sheet (kit/sheet/sheet.tsx), its title the fold's label, the line under it its hint,
 * its round Close the fold's Cancel, its rows the fields and what saving writes, its foot the fold's (the ask in its place
 * while one is asked, which the foot says, data-asking, for kit.css to give the words their room). Escape, a press on the
 * wash, a pull down on a phone and its Close all ask the fold's Cancel, and nothing while the save is out (`busy`). As it
 * opens, focus goes to its first field where the pointer is a mouse, and to the sheet itself on a touch screen (focus.ts,
 * useRecFocus's rule), where Base UI places it.
 *
 * What the page draws at rest in the fold's place, its row, stays in the card behind the sheet while it is open
 * (`behind`), at every width the sheet is drawn at: a card a row shorter under the wash grew back as the sheet left,
 * which its leaving would have put on show. Behind the modal sheet it is a picture of the row, not the row: a box that
 * lays out as nothing (record.css), so the card is as it was, aria-hidden and inert, so its act can be neither pressed,
 * focused nor read out. `inert` is set through the ref, since React 18 and 19 spell the prop differently (this file's
 * header).
 */
function foldSheet(props: RecordFoldProps, d: FoldDraw, open: boolean) {
  const { id, label, hint = null, saving = false, closeLabel = "Close", behind = null, children = null } = props;
  const first = () => {
    const el = d.box.current;
    return !el || onTouchScreen() ? el : (recFirstIn(el, ".rec-fold-inner", ".rec-sheet-close") ?? el);
  };
  // The label and the hint keep the ids a page's own fields are named and described by (`rec-fold-<id>-label`).
  const drawn = (
    <Sheet
      open={open}
      onClose={() => d.cancel()}
      title={<span id={`rec-fold-${id}-label`}>{label}</span>}
      sub={hint ? <span id={`rec-fold-${id}-hint`}>{hint}</span> : undefined}
      close={{ label: closeLabel, glyph: <Icon name="x" size={13} /> }}
      foot={d.ask || d.foot || undefined}
      asking={!!d.ask}
      busy={saving}
      onKeyDown={d.keys}
      onFocus={d.onFocus}
      initialFocus={first}
      className="rec-fold-sheet"
      testid={`rec-fold-${id}`}
      ref={d.box}
    >
      <div className="rec-fold-inner">
        {children}
        {d.told}
      </div>
    </Sheet>
  );
  const shield = (n: HTMLElement | null) => {
    if (n) n.setAttribute("inert", "");
  };
  return open && behind ? (
    <>
      <div key="behind" className="rec-fold-behind" aria-hidden="true" ref={shield}>
        {behind}
      </div>
      {drawn}
    </>
  ) : (
    drawn
  );
}

/** The fold under its row: a head that keeps the row's label and gives the hint the value's place, and its Close. */
function foldRow(props: RecordFoldProps, d: FoldDraw) {
  const {
    id,
    label,
    hint = null,
    open = true,
    saving = false,
    closeLabel = "Close",
    wide = false,
    children = null,
  } = props;
  const labelId = `rec-fold-${id}-label`;
  const closeId = `rec-fold-${id}-close`;
  return (
    // eslint-disable-next-line jsx-a11y-x/no-noninteractive-element-interactions -- the fold takes its own focus and keys (Escape, Ctrl+Enter)
    <div
      ref={d.box}
      className="rec-fold"
      role="group"
      // Focusable by the fold's own rule and never by Tab: on a touch screen it opens on itself (focus.ts).
      tabIndex={-1}
      aria-labelledby={labelId}
      aria-busy={saving || undefined}
      data-open={open ? "true" : "false"}
      hidden={open ? undefined : true}
      data-wide={wide ? "true" : undefined}
      data-testid={`rec-fold-${id}`}
      onFocus={d.onFocus}
      onKeyDown={d.keys}
    >
      <div className="rec-fold-head">
        <span className="rec-fold-label" id={labelId}>
          {label}
        </span>
        <span className="rec-fold-hint">{hint}</span>
        {/* Close is Cancel (above). Not disabled while the fold saves, as Save is not. */}
        <button
          type="button"
          className="rec-fold-close"
          id={closeId}
          aria-labelledby={`${closeId} ${labelId}`}
          aria-disabled={saving || undefined}
          onClick={d.cancel}
          data-testid={`rec-fold-close-${id}`}
        >
          {closeLabel}
        </button>
      </div>
      <div className="rec-fold-body">
        <div className="rec-fold-inner">
          {children}
          {d.told}
          {d.ask || d.foot}
        </div>
      </div>
    </div>
  );
}

/** A set of fields, opened under the row that states them (a sheet on a phone, or at every width with frame="sheet"). */
export function RecordFold(props: RecordFoldProps) {
  const { id, open = true, saving = false, confirm = null, focusOn = null, gate = null, frame = "row" } = props;
  const { onSave, onCancel } = props;
  const box = useRef<HTMLDivElement | null>(null);
  const ask = saving ? null : confirm;
  // Every hook here is called on every draw, whichever frame is drawn: the frame is a value, never a hook of its own,
  // so the fold holds the same hooks open or closed, as a sheet or under its row (the tests' stub throws as React does
  // when a component's hooks change in number). The phone query is read whatever `frame` says, so a fold given one frame
  // and then the other holds the same hooks too.
  const phone = useRecPhone();
  // Drawn as a sheet, open or shut, so it leaves the way it came; open, it is the sheet.
  const asSheet = frame === "sheet" || phone;
  const sheet = open && asSheet;
  const onFocus = useRecFocus(id, open, box, {
    inner: ".rec-fold-inner",
    fallback: sheet ? ".rec-sheet-close" : ".rec-fold-close",
    focusOn,
    frame: sheet,
  });
  useRecDrawn(id);
  const refused = !!(gate && gate["aria-disabled"]);
  // A sheet's Escape is the kit's sheet's, which asks the Cancel below; under its row the fold hears it itself.
  const keys = recKeys({ onCancel: asSheet ? null : onCancel, onSave, saving, refused });
  // Close, the foot's Cancel and a press on a phone's wash are one Cancel, and none acts while the fold saves (recKeys
  // says why): Close once cancelled then, where the foot's Cancel and Escape did not.
  const cancel: CancelFold = (e) => {
    if (saving) {
      if (e && e.preventDefault) e.preventDefault();
      return;
    }
    if (onCancel) onCancel(e);
  };
  const told = foldTold(props, sheet);
  const draw: FoldDraw = { box, ask, foot: foldFoot(props), told, cancel, keys, onFocus };
  return asSheet ? foldSheet(props, draw, sheet) : foldRow(props, draw);
}
