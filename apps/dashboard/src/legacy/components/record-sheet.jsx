/* global React, Icon */
// Chanlytics record kit: the sheet.
//
// A list you scroll gets room of its own, beside the page (from the bottom, on a phone): a head with its name, the
// line under it and a Close; an optional strip of tools (a search, an Add); the rows, which scroll; and a foot that
// holds still, with the page's act in it. The page behind stays readable under a wash, and takes no presses while
// the sheet is open; a press on the wash keeps focus where it was. The kit knows nothing about what the sheet lists.
//
//   <RecordSheet id="services" title="…" sub="…" onClose={close} tools={<search/>} foot={<save/>}>…rows…</RecordSheet>
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
// taken out. A new object each time, as RecordFold's is, so the same row named twice is focused twice. `busy` says the
// sheet's save is out (aria-busy, which record.css draws its boxes by, as it does a fold's).
//
// It is drawn in the app's root (.app-root) rather than where the page put it. There, People's row keys hold still
// while it is open, as they do for the phone's lists sheet and for any dialog in .app-root (PL_OVERLAY,
// clients-a.jsx); and there no pane's layout reaches it -- a Settings pane sizes its every child to the prose
// column, and animates itself in with a transform that would pin a fixed sheet to the pane.

const { useRef: useSheetRef, useEffect: useSheetEffect, useCallback: useSheetCallback } = React;

const RecordSheet = ({
  id = null, title, sub = null, onClose, tools = null, foot = null, closeLabel = "Close", className = "", testid = null,
  focusOn = null, busy = false, children = null,
}) => {
  const closeRef = useSheetRef(onClose);
  closeRef.current = onClose;
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
          Shift+Tab walks the page behind the modal. The wash still takes the press, so nothing behind it does. */}
      <div className="rec-sheet-backdrop" aria-hidden="true" onMouseDown={(e) => e.preventDefault()} />
      <section
        ref={place}
        className={`rec-sheet${className ? ` ${className}` : ""}`}
        role="dialog"
        aria-modal={true}
        aria-labelledby={titleId}
        aria-label={titleId ? undefined : typeof title === "string" ? title : undefined}
        aria-describedby={subId}
        aria-busy={busy || undefined}
        tabIndex={-1}
        onFocus={hold ? hold.onFocus : undefined}
        onKeyDown={(e) => { if (e.key === "Tab") window.trapTab(e, e.currentTarget); else onEscape(e); }}
        data-testid={testid || (id ? `rec-sheet-${id}` : undefined)}
      >
        <header className="rec-sheet-head">
          <div className="rec-sheet-heading">
            <h2 className="rec-sheet-title" id={titleId}>{title}</h2>
            {sub ? <p className="rec-sheet-sub" id={subId}>{sub}</p> : null}
          </div>
          <button type="button" className="rec-sheet-close" aria-label={closeLabel} onClick={onClose}>
            <Icon name="x" size={13} />
          </button>
        </header>
        {tools ? <div className="rec-sheet-tools">{tools}</div> : null}
        <div className="rec-sheet-body">{children}</div>
        {foot ? <footer className="rec-sheet-foot">{foot}</footer> : null}
      </section>
    </>
  );
  const root = document.querySelector ? document.querySelector(".app-root") : null;
  return root && window.ReactDOM && window.ReactDOM.createPortal ? window.ReactDOM.createPortal(node, root) : node;
};

Object.assign(window, { RecordSheet });
