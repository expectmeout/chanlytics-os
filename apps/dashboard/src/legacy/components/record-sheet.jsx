/* global React, Icon */
// Chanlytics record kit: the sheet.
//
// A list you scroll gets room of its own, beside the page (from the bottom, on a phone): a head with its name, the
// line under it and a Close; an optional strip of tools (a search, an Add); the rows, which scroll; and a foot that
// holds still, with the page's act in it. The page behind stays readable under a wash, and takes no presses while
// the sheet is open; a press on the wash is the sheet's Close (Cancel, where the page asks first about what was
// typed), as the fold's is, and on a phone a pull down on the sheet from its top is the same (data-bits touchSwipe):
// a full screen with one small X in its corner was the only way out. The kit knows nothing about what the sheet lists.
//
//   <RecordSheet id="services" title="…" sub="…" onClose={close} tools={<search/>} foot={<save/>}>…rows…</RecordSheet>
//
// A sheet that saves as a fold does takes the fold's foot props instead of drawing its own: `onSave`, `saving`,
// `saveLabel`, `savingLabel`, `cancelLabel`, `gate`, `footNote` and `confirm`, as RecordFold takes them. Then the kit
// draws the fold's foot (RecordFoot) after the page's `foot`, with the page's ask above it, not while the save is out;
// Cancel is `onClose`; and while the save is out nothing cancels it (Escape, the head's Close, Cancel) and Ctrl or Cmd
// with Enter saves, by the fold's rule (recKeys). A sheet with a foot of its own (the playbook composer's) passes none
// of them and is drawn as it was.
//
// `className` is a page's own class beside the kit's (a wider sheet, a body of its own), and `testid` names the sheet
// when the page's tests know it by another name than `rec-sheet-<id>`.
//
// It is a dialog, and modal: role="dialog" with aria-modal, named by its heading and described by the line under
// it (with an `id`; without one, named by its title). As it opens, focus moves to the sheet itself, so a screen
// reader names it; as it closes, focus goes back to whatever opened it. Tab and Shift+Tab walk its own controls and
// wrap round (data-bits trapTab, which counts only what Tab stops at): aria-modal tells a screen reader that nothing
// outside the sheet is there, so focus that left it would be lost. Escape closes it, once, unless something in it
// took the key first (a combobox's list closing): from inside the sheet its own handler hears the key first and takes
// it, so a fold around it does not cancel as well; with focus somewhere outside it, the window hears it.
//
// So anything a sheet needs must be reachable inside it, because Tab stays there. A row taken out of the list leaves
// an inline Undo where it was. The toast is still the house's undo (legacy CLAUDE.md) and may echo it, but it is
// drawn outside the sheet, where Tab cannot reach it, so it is never the only way back.
//
// And focus stays in it while it is open, by the fold's own rules (record-fold.jsx useRecFocusHold, useRecFocusOn):
// one rule, where the sheet once kept copies of them in part. Focus that went with what held it -- an Undo left where a
// row was, gone with the row put back; an ask's button, gone with the ask; a toast's Undo, gone with the toast -- comes
// back to the field the person was in, in the tools or the rows, or to the first of them when that went too: it landed
// on the page's body, outside the dialog, where Tab walks the page behind it, and then on the dialog itself. Focus a
// person put somewhere is left there. `focusOn` ({ row }) names an element of the sheet by the data-rec-row the page
// put on it, and focus goes to its first tab stop: a row a list has just been given, or the Undo left where a row was
// taken out. A new object each time, as RecordFold's is, so the same row named twice is focused twice. `saving` says
// the sheet's save is out (aria-busy, which record.css draws its boxes by, as it does a fold's).
//
// It is drawn in the app's root (.app-root) rather than where the page put it. There, People's row keys hold still
// while it is open, as they do for the phone's lists sheet and for any dialog in .app-root (PL_OVERLAY,
// clients-a.jsx); and there no pane's layout reaches it -- a Settings pane sizes its every child to the prose
// column, and animates itself in with a transform that would pin a fixed sheet to the pane.

const { useRef: useSheetRef, useEffect: useSheetEffect, useCallback: useSheetCallback } = React;

// The sheet rises from the bottom at the kit's one phone width (record.css, record-fold.jsx recPhoneQuery): there a
// pull down on it is its Close. Loaded alone, without the fold kit (the playbook composer's test), it is never from
// the bottom.
const recSheetFromBottom = () => { const q = window.recPhoneQuery ? window.recPhoneQuery() : null; return !!(q && q.matches); };

const RecordSheet = ({
  id = null, title, sub = null, onClose, tools = null, foot = null, closeLabel = "Close", className = "", testid = null,
  focusOn = null, onSave = null, saving = false, saveLabel = "Save", savingLabel = "Saving…", cancelLabel = "Cancel",
  gate = null, footNote = null, confirm = null, children = null,
}) => {
  const closeRef = useSheetRef(onClose);
  // Nothing cancels a save that is out: the save is on its way, and closes the sheet when the server takes it.
  closeRef.current = saving ? null : onClose;
  const opener = useSheetRef(null);
  // The sheet as it is on the page, for the fold's focus rules below: a callback ref (place) sets it.
  const box = useSheetRef(null);
  // Where the person was, in its tools or its rows; the head's Close when it holds no field at all. The rules are
  // record-fold.jsx's, which both load lists put before this file; a page's test that loads the sheet alone (the
  // playbook composer's) draws it without them, the same way on every draw, so the hooks keep their order.
  const hold = window.useRecFocusHold ? window.useRecFocusHold(true, box, ".rec-sheet-tools, .rec-sheet-body", ".rec-sheet-close") : null;
  if (window.useRecFocusOn) window.useRecFocusOn(true, box, focusOn);
  const onEscape = (e) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    e.preventDefault();
    if (closeRef.current) closeRef.current();
  };
  // One listener for the sheet's life, reading the latest close: a sheet open over a keyboard's focus elsewhere.
  useSheetEffect(() => {
    const onKey = (e) => onEscape(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // A callback ref, not an effect: React calls it with the sheet as the sheet opens and with null as it goes, which
  // is exactly when focus moves in and when it goes back.
  const place = useSheetCallback((el) => {
    box.current = el;
    if (el) {
      opener.current = document.activeElement;
      if (el.focus) el.focus();
      return;
    }
    const back = opener.current;
    opener.current = null;
    if (back && back.focus && back.isConnected !== false) back.focus();
  }, []);
  const titleId = id ? `rec-sheet-${id}-title` : undefined;
  const subId = id && sub ? `rec-sheet-${id}-sub` : undefined;
  const node = (
    <>
      {/* A press on the wash keeps focus where it was: a mousedown's default would hand it to the page's body, where
          Shift+Tab walks the page behind the modal. The press itself is the sheet's Close -- the head's, so a page
          that asks first about what was typed asks here too -- and nothing while a save is out (closeRef). */}
      <div className="rec-sheet-backdrop" aria-hidden="true" onMouseDown={(e) => e.preventDefault()} onClick={() => { if (closeRef.current) closeRef.current(); }} />
      <section
        ref={place}
        className={`rec-sheet${className ? ` ${className}` : ""}`}
        role="dialog"
        aria-modal={true}
        aria-labelledby={titleId}
        aria-label={titleId ? undefined : typeof title === "string" ? title : undefined}
        aria-describedby={subId}
        aria-busy={saving || undefined}
        tabIndex={-1}
        {...(window.touchSwipe ? window.touchSwipe({ onDown: () => { if (closeRef.current) closeRef.current(); }, when: recSheetFromBottom }) : {})}
        onFocus={hold ? hold.onFocus : undefined}
        onKeyDown={(e) => {
          if (e.key === "Tab") { window.trapTab(e, e.currentTarget); return; }
          if (e.key === "Enter" && onSave && window.recKeys) { window.recKeys({ onSave, saving, refused: !!(gate && gate["aria-disabled"]) })(e); return; }
          onEscape(e);
        }}
        data-testid={testid || (id ? `rec-sheet-${id}` : undefined)}
      >
        <header className="rec-sheet-head">
          <div className="rec-sheet-heading">
            <h2 className="rec-sheet-title" id={titleId}>{title}</h2>
            {sub ? <p className="rec-sheet-sub" id={subId}>{sub}</p> : null}
          </div>
          <button
            type="button" className="rec-sheet-close" aria-label={closeLabel} aria-disabled={saving || undefined}
            onClick={(e) => { if (saving) { e.preventDefault(); return; } if (onClose) onClose(e); }}
          >
            <Icon name="x" size={13} />
          </button>
        </header>
        {tools ? <div className="rec-sheet-tools">{tools}</div> : null}
        <div className="rec-sheet-body">{children}</div>
        {foot || onSave ? (
          <footer className="rec-sheet-foot">
            {foot}
            {onSave ? (
              <>
                {saving ? null : confirm}
                <window.RecordFoot
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
        ) : null}
      </section>
    </>
  );
  const root = document.querySelector ? document.querySelector(".app-root") : null;
  return root && window.ReactDOM && window.ReactDOM.createPortal ? window.ReactDOM.createPortal(node, root) : node;
};

Object.assign(window, { RecordSheet });
