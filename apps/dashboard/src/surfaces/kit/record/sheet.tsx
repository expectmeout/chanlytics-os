/**
 * The record kit: the sheet (moved whole from legacy/components/record-sheet.jsx, decision 0015: the kit's one
 * implementation, which seed-globals publishes as window.RecordSheet for the pages that have not moved).
 *
 * A list you scroll gets room of its own, beside the page (from the bottom, on a phone): a head with its name, the line
 * under it and a Close; an optional strip of tools (a search, an Add); the rows, which scroll; and a foot that holds
 * still, with the page's act in it. The page behind stays readable under a wash, and takes no presses while the sheet is
 * open; a press on the wash is the sheet's Close (Cancel, where the page asks first about what was typed), as the fold's
 * is, and on a phone a pull down on the sheet from its top is the same (data-bits touchSwipe): a full screen with one
 * small X in its corner was the only way out. The kit knows nothing about what the sheet lists.
 *
 *   <RecordSheet id="services" title="…" sub="…" onClose={close} tools={<search/>} foot={<save/>}>…rows…</RecordSheet>
 *
 * A sheet that saves as a fold does takes the fold's foot props instead of drawing its own: `onSave`, `saving`,
 * `saveLabel`, `savingLabel`, `cancelLabel`, `gate`, `footNote` and `confirm`, as RecordFold takes them. Then the kit
 * draws the fold's foot (RecordFoot) after the page's `foot`, with the page's ask above it, not while the save is out;
 * Cancel is `onClose`; and while the save is out nothing cancels it (Escape, the head's Close, Cancel) and Ctrl or Cmd
 * with Enter saves, by the fold's rule (recKeys). A sheet with a foot of its own (the playbook composer's) passes none of
 * them and is drawn as it was.
 *
 * `className` is a page's own class beside the kit's (a wider sheet, a body of its own), and `testid` names the sheet
 * when the page's tests know it by another name than `rec-sheet-<id>`.
 *
 * It is a dialog, and modal: role="dialog" with aria-modal, named by its heading and described by the line under it
 * (with an `id`; without one, named by its title). As it opens, focus moves to the sheet itself, so a screen reader
 * names it; as it closes, focus goes back to whatever opened it. Tab and Shift+Tab walk its own controls and wrap round
 * (data-bits trapTab, which counts only what Tab stops at): aria-modal tells a screen reader that nothing outside the
 * sheet is there, so focus that left it would be lost. Escape closes it, once, unless something in it took the key first
 * (a combobox's list closing): from inside the sheet its own handler hears the key first and takes it, so a fold around
 * it does not cancel as well; with focus somewhere outside it, the window hears it.
 *
 * So anything a sheet needs must be reachable inside it, because Tab stays there. A row taken out of the list leaves an
 * inline Undo where it was. The toast is still the house's undo (legacy CLAUDE.md) and may echo it, but it is drawn
 * outside the sheet, where Tab cannot reach it, so it is never the only way back.
 *
 * And focus stays in it while it is open, by the fold's own rules (focus.ts useRecFocusHold, useRecFocusOn): one rule,
 * where the sheet once kept copies of them in part. Focus that went with what held it -- an Undo left where a row was,
 * gone with the row put back; an ask's button, gone with the ask; a toast's Undo, gone with the toast -- comes back to
 * the field the person was in, in the tools or the rows, or to the first of them when that went too: it landed on the
 * page's body, outside the dialog, where Tab walks the page behind it, and then on the dialog itself. Focus a person put
 * somewhere is left there. `focusOn` ({ row }) names an element of the sheet by the data-rec-row the page put on it, and
 * focus goes to its first tab stop: a row a list has just been given, or the Undo left where a row was taken out. A new
 * object each time, as RecordFold's is, so the same row named twice is focused twice. `saving` says the sheet's save is
 * out (aria-busy, which record.css draws its boxes by, as it does a fold's).
 *
 * It is drawn in the app's root (.app-root) rather than where the page put it. There, People's row keys hold still while
 * it is open, as they do for the phone's lists sheet and for any dialog in .app-root (PL_OVERLAY); and there no pane's
 * layout reaches it -- a Settings pane sizes its every child to the prose column, and animates itself in with a transform
 * that would pin a fixed sheet to the pane. The first run is drawn in place of the app's chrome, with no .app-root
 * (app-shell.jsx), and its shell (.fr-shell) is the root there.
 */
import { useCallback, useEffect, useRef } from "react";
import type { MouseEvent, ReactNode, RefObject } from "react";
import { Icon } from "../icon/icon";
import { recKeys, recPhoneQuery, useRecFocusHold, useRecFocusOn } from "./focus";
import type { FocusOn } from "./focus";
import { recPortalRoot } from "./leaving";
import { RecordFoot } from "./says";
import { touchSwipe } from "../../legacy-verbs";
import { leaveOverlay, listen, portal, trapTab, unlisten } from "./shell-verbs";

interface RecordSheetProps {
  id?: string | null;
  title: ReactNode;
  sub?: ReactNode;
  onClose: (e?: MouseEvent<HTMLButtonElement>) => void;
  tools?: ReactNode;
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
}

// The sheet rises from the bottom at the kit's one phone width (record.css, focus.ts recPhoneQuery): there a pull down
// on it is its Close.
const recSheetFromBottom = () => {
  const q = recPhoneQuery();
  return !!(q && q.matches);
};

/** The sheet's head: its name, the line under it, and a Close. */
function sheetHead(props: RecordSheetProps) {
  const { id = null, title, sub = null, onClose, closeLabel = "Close", saving = false } = props;
  const titleId = id ? `rec-sheet-${id}-title` : undefined;
  const subId = id && sub ? `rec-sheet-${id}-sub` : undefined;
  return (
    <header className="rec-sheet-head">
      <div className="rec-sheet-heading">
        <h2 className="rec-sheet-title" id={titleId}>
          {title}
        </h2>
        {sub ? (
          <p className="rec-sheet-sub" id={subId}>
            {sub}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className="rec-sheet-close"
        aria-label={closeLabel}
        aria-disabled={saving || undefined}
        onClick={(e) => {
          if (saving) {
            e.preventDefault();
            return;
          }
          if (onClose) onClose(e);
        }}
      >
        <Icon name="x" size={13} />
      </button>
    </header>
  );
}

/** The sheet's foot, which holds still: the page's own, and where the sheet saves as a fold does, the fold's. */
function sheetFoot(props: RecordSheetProps) {
  const { id = null, foot = null, onSave = null, onClose, saving = false, saveLabel = "Save" } = props;
  const { savingLabel = "Saving…", cancelLabel = "Cancel", gate = null, footNote = null, confirm = null } = props;
  return foot || onSave ? (
    <footer className="rec-sheet-foot">
      {foot}
      {onSave ? (
        <>
          {saving ? null : confirm}
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
        </>
      ) : null}
    </footer>
  ) : null;
}

/** What the sheet's frame is given by the component that owns its hooks. */
interface SheetHooks {
  place: (el: HTMLElement | null) => void;
  hold: ReturnType<typeof useRecFocusHold>;
  closeRef: RefObject<(() => void) | null>;
  onEscape: (e: { key: string; defaultPrevented: boolean; preventDefault: () => void }) => void;
}

/** The wash and the sheet beside it: the wash's press is the sheet's Close, and nothing while a save is out. */
function sheetNode(props: RecordSheetProps, h: SheetHooks) {
  const { id = null, className = "", testid = null, saving = false, onSave = null, gate = null } = props;
  const { tools = null, children = null } = props;
  const titleId = id ? `rec-sheet-${id}-title` : undefined;
  const subId = id && props.sub ? `rec-sheet-${id}-sub` : undefined;
  const { title } = props;
  return (
    <>
      {/* A press on the wash keeps focus where it was: a mousedown's default would hand it to the page's body, where
          Shift+Tab walks the page behind the modal. The press itself is the sheet's Close -- the head's, so a page
          that asks first about what was typed asks here too -- and nothing while a save is out (closeRef). */}
      <div
        className="rec-sheet-backdrop"
        aria-hidden="true"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (h.closeRef.current) h.closeRef.current();
        }}
      />
      {/* eslint-disable-next-line jsx-a11y-x/no-noninteractive-element-interactions -- a modal dialog takes its own focus and keys */}
      <section
        ref={h.place}
        className={`rec-sheet${className ? ` ${className}` : ""}`}
        role="dialog"
        aria-modal={true}
        aria-labelledby={titleId}
        aria-label={titleId ? undefined : typeof title === "string" ? title : undefined}
        aria-describedby={subId}
        aria-busy={saving || undefined}
        tabIndex={-1}
        {...touchSwipe({
          onDown: () => {
            if (h.closeRef.current) h.closeRef.current();
          },
          when: recSheetFromBottom,
        })}
        onFocus={h.hold.onFocus}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            trapTab(e, e.currentTarget);
            return;
          }
          if (e.key === "Enter" && onSave) {
            recKeys({ onSave, saving, refused: !!(gate && gate["aria-disabled"]) })(e);
            return;
          }
          h.onEscape(e);
        }}
        data-testid={testid || (id ? `rec-sheet-${id}` : undefined)}
      >
        {sheetHead(props)}
        {tools ? <div className="rec-sheet-tools">{tools}</div> : null}
        <div className="rec-sheet-body">{children}</div>
        {sheetFoot(props)}
      </section>
    </>
  );
}

/** A list you scroll, in room of its own beside the page (from the bottom, on a phone). */
export function RecordSheet(props: RecordSheetProps) {
  const { onClose, focusOn = null, saving = false } = props;
  const closeRef = useRef<(() => void) | null>(onClose);
  // Nothing cancels a save that is out: the save is on its way, and closes the sheet when the server takes it.
  closeRef.current = saving ? null : onClose;
  const opener = useRef<Element | null>(null);
  // The sheet as it is on the page, for the fold's focus rules below: a callback ref (place) sets it.
  const box = useRef<HTMLElement | null>(null);
  // Where the person was, in its tools or its rows; the head's Close when it holds no field at all. The rules are
  // focus.ts's, the fold's own.
  const hold = useRecFocusHold(true, box, ".rec-sheet-tools, .rec-sheet-body", ".rec-sheet-close");
  useRecFocusOn(true, box, focusOn);
  const onEscape: SheetHooks["onEscape"] = (e) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    e.preventDefault();
    if (closeRef.current) closeRef.current();
  };
  // One listener for the sheet's life, reading the latest close: a sheet open over a keyboard's focus elsewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onEscape(e);
    listen("keydown", onKey);
    return () => unlisten("keydown", onKey);
  }, []);
  // A callback ref, not an effect: React calls it with the sheet as the sheet opens and with null as it goes, which
  // is exactly when focus moves in and when it goes back.
  // What stood behind the sheet as it opened, and when: as React lets go of it, a still copy of both plays out the way
  // it came (data-bits leaveOverlay, components.css [data-leaving]). React takes the wash first, so it is held here.
  const wash = useRef<Element | null>(null);
  const since = useRef(0);
  const place = useCallback((el: HTMLElement | null) => {
    const was = box.current;
    box.current = el;
    if (el) {
      wash.current = el.previousElementSibling || null;
      since.current = Date.now();
      opener.current = document.activeElement;
      if (el.focus) el.focus();
      return;
    }
    // Not from a frame mounted and let go of at once (StrictMode's check in development).
    if (was && Date.now() - since.current > 60) leaveOverlay(was, wash.current);
    wash.current = null;
    const back = opener.current as HTMLElement | null;
    opener.current = null;
    if (back && back.focus && back.isConnected !== false) back.focus();
  }, []);
  return portal(sheetNode(props, { place, hold, closeRef, onEscape }), recPortalRoot());
}
