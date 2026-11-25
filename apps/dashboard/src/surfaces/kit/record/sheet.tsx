/**
 * The record kit's sheet: a list you scroll, in room of its own beside the page (from the bottom, on a phone), drawn by
 * the kit's one sheet (kit/sheet/sheet.tsx `Sheet`, on Base UI's Dialog), so a phone has one sheet with one head, one
 * Close, one foot and one set of behaviours (Ruben, 25 Nov 2026: "one design"). It is the house's props over that sheet:
 * a head with its name, the line under it and the round Close; an optional strip of tools (a search, an Add); the rows,
 * which scroll; and a foot that holds still, with the page's act in it. The kit knows nothing about what the sheet lists.
 *
 *   <RecordSheet id="services" title="…" sub="…" onClose={close} tools={<search/>} foot={<save/>}>…rows…</RecordSheet>
 *
 * A sheet that saves as a fold does takes the fold's foot props instead of drawing its own: `onSave`, `saving`,
 * `saveLabel`, `savingLabel`, `cancelLabel`, `gate`, `footNote` and `confirm`, as RecordFold takes them. Then it draws the
 * fold's foot (RecordFoot) after the page's `foot`, or the page's ask in its place while one is asked (never while the
 * save is out: fold.tsx says why a question stands alone); its Cancel is `onClose`, and on a phone it is not drawn, the
 * Close doing what it did (kit.css, "One design for every sheet on a phone"). While the save is out nothing closes it
 * (Escape, the wash, a pull, the Close: `busy`), and Ctrl or Cmd with Enter saves, by the fold's rule (recKeys). A sheet
 * with a foot of its own passes none of them and is drawn as it was.
 *
 * What the kit's sheet does is its own: modal, focus held inside it and given back to what opened it, Escape and a press
 * on the wash asking the page to close it (an Escape something in it took first stays that one's: a combobox's list
 * closing), a pull down on a phone, Back where it is asked (`backCloses`), its height gliding. The record kit adds its
 * focus hold (focus.ts useRecFocusHold): focus that went with what held it -- an Undo left where a row was, gone with the
 * row put back; an ask's button, gone with the ask -- comes back to the field the person was in, or to the first of them
 * when that went too. `focusOn` ({ row }) names an element of the sheet by the data-rec-row the page put on it, and focus
 * goes to its first tab stop: a new object each time, as RecordFold's is, so the same row named twice is focused twice.
 * A toast is still the house's undo (.claude/skills/chanlytics-interface/shell.md, Decisions) and may echo an inline Undo,
 * but it is drawn outside the sheet, where Tab cannot reach it, so it is never the only way back.
 *
 * `open` is the page's, and a page that draws the sheet only while it is open (most do) leaves it true: let go of while
 * open, the kit's sheet leaves the way it came all the same. `back` is a step's way back (Add people's lists). `className` is a
 * page's own class beside the kit's (a wider sheet, a body of its own), and `testid` names the sheet when the page's tests
 * know it by another name than `rec-sheet-<id>`; its Close is `<testid>-close`.
 */
import { useRef } from "react";
import type { MouseEvent, ReactNode } from "react";
import { Icon } from "../icon/icon";
import { Sheet, type SheetBack } from "../sheet/sheet";
import { recKeys, useRecFocusHold, useRecFocusOn } from "./focus";
import type { FocusOn } from "./focus";
import { RecordFoot } from "./says";

interface RecordSheetProps {
  /** Whether it is open: the page's, and true where the page draws it only while it is. */
  open?: boolean;
  id?: string | null;
  title: ReactNode;
  sub?: ReactNode;
  onClose: (e?: MouseEvent<HTMLButtonElement>) => void;
  tools?: ReactNode;
  /** The tools on the title's line, between it and the Close, where a strip under the head would stand (the kit's Sheet's). */
  toolsInLine?: boolean;
  foot?: ReactNode;
  closeLabel?: string;
  className?: string;
  testid?: string | null;
  focusOn?: FocusOn | null;
  onSave?: ((e?: MouseEvent<HTMLButtonElement>) => void) | null;
  saving?: boolean;
  saveLabel?: ReactNode;
  savingLabel?: ReactNode;
  cancelLabel?: ReactNode;
  gate?: Record<string, unknown> | null;
  footNote?: ReactNode;
  confirm?: ReactNode;
  children?: ReactNode;
  /** Back closes it, as the kit's Sheet's does (sheet/back.ts): named in the address where it is a name. */
  backCloses?: boolean | string;
  /** Where it is a step of another (Add people's lists), the way back to it, before the title (the kit's Sheet's). */
  back?: SheetBack | null;
  /**
   * On a phone it keeps the height it opened at, whatever comes and goes in it (Add people: a way switched, a note
   * written, a list read): its head never moves under the thumb (the kit's Sheet's `steady`).
   */
  steady?: boolean;
  /**
   * On a desk it is as tall as what it holds, its foot under its last row, never past the window's height (the kit's
   * Sheet's `fit`).
   */
  fit?: boolean;
}

/** The foot's acts while a question is asked in their place: the page's ask, and never while the save is out. */
const askOf = (props: RecordSheetProps) => (props.onSave && !props.saving ? props.confirm || null : null);

/** The sheet's foot, which holds still: the page's own, and where the sheet saves as a fold does, the fold's. */
function sheetFoot(props: RecordSheetProps) {
  const { id = null, foot = null, onSave = null, onClose, saving = false, saveLabel = "Save" } = props;
  const { savingLabel = "Saving…", cancelLabel = "Cancel", gate = null, footNote = null } = props;
  const ask = askOf(props);
  if (!foot && !onSave) return undefined;
  return (
    <>
      {foot}
      {ask}
      {onSave && !ask ? (
        <RecordFoot
          saveTestid={id ? `rec-sheet-save-${id}` : undefined}
          cancelTestid={id ? `rec-sheet-cancel-${id}` : undefined}
          onSave={onSave}
          onCancel={onClose}
          saving={saving}
          saveLabel={saveLabel}
          savingLabel={savingLabel}
          cancelLabel={cancelLabel}
          gate={gate}
          footNote={footNote}
        />
      ) : null}
    </>
  );
}

/** A list you scroll, in room of its own beside the page (from the bottom, on a phone): the kit's sheet. */
export function RecordSheet(props: RecordSheetProps) {
  const { open = true, id = null, onClose, focusOn = null, saving = false, onSave = null, gate = null } = props;
  // The sheet as it is on the page, for the focus rules.
  const box = useRef<HTMLElement | null>(null);
  // Where the person was, in its tools or its rows; the head's Close when it holds no field at all. The rules are
  // focus.ts's, the fold's own.
  const hold = useRecFocusHold(open, box, ".rec-sheet-tools, .rec-sheet-body", ".rec-sheet-close");
  useRecFocusOn(open, box, focusOn);
  // Ctrl or Cmd with Enter saves; Escape is the kit's sheet's, which asks `close` below.
  const keys = recKeys({ onSave, saving, refused: !!(gate && gate["aria-disabled"]) });
  // Nothing cancels a save that is out: the save is on its way, and closes the sheet when the server takes it.
  const close = () => {
    if (!saving) onClose();
  };
  const foot = sheetFoot(props);
  return (
    <Sheet
      open={open}
      onClose={close}
      // With an id, its title and its line keep the ids a page's fields may be named by (`rec-sheet-<id>-title`).
      title={id ? <span id={`rec-sheet-${id}-title`}>{props.title}</span> : props.title}
      sub={id && props.sub ? <span id={`rec-sheet-${id}-sub`}>{props.sub}</span> : (props.sub ?? undefined)}
      close={{ label: props.closeLabel ?? "Close", glyph: <Icon name="x" size={13} /> }}
      back={props.back ?? null}
      tools={props.tools ?? undefined}
      toolsInLine={props.toolsInLine}
      foot={foot}
      asking={!!(foot && askOf(props))}
      busy={saving}
      steady={props.steady}
      fit={props.fit}
      backCloses={props.backCloses}
      onKeyDown={keys}
      onFocus={hold.onFocus}
      className={props.className || undefined}
      testid={props.testid || (id ? `rec-sheet-${id}` : undefined)}
      ref={box}
    >
      {props.children}
    </Sheet>
  );
}
