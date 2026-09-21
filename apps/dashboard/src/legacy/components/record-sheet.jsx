/* global React, Icon */
// Chanlytics record kit: the sheet.
//
// A list you scroll gets room of its own, beside the page (from the bottom, on a phone): a head with its name, the
// line under it and a Close; an optional strip of tools (a search, an Add); the rows, which scroll; and a foot that
// holds still, with the page's act in it. The page behind stays readable under a wash, and takes no presses while
// the sheet is open. The kit knows nothing about what the sheet lists.
//
//   <RecordSheet id="services" title="…" sub="…" onClose={close} tools={<search/>} foot={<save/>}>…rows…</RecordSheet>
//
// It is a dialog, and modal: role="dialog" with aria-modal, named by its heading and described by the line under
// it (with an `id`; without one, named by its title). As it opens, focus moves to the sheet itself, so a screen
// reader names it; as it closes, focus goes back to whatever opened it. Escape closes it, once, unless something in
// it took the key first (a combobox's list closing): from inside the sheet its own handler hears the key first and
// takes it, so a fold around it does not cancel as well; with focus outside it (a press on the wash), the window
// hears it.
//
// It is drawn in the app's root (.app-root) rather than where the page put it. There, People's row keys hold still
// while it is open, as they do for the phone's lists sheet and for any dialog in .app-root (PL_OVERLAY,
// clients-a.jsx); and there no pane's layout reaches it -- a Settings pane sizes its every child to the prose
// column, and animates itself in with a transform that would pin a fixed sheet to the pane.

const { useRef: useSheetRef, useEffect: useSheetEffect, useCallback: useSheetCallback } = React;

const RecordSheet = ({ id = null, title, sub = null, onClose, tools = null, foot = null, closeLabel = "Close", children = null }) => {
  const closeRef = useSheetRef(onClose);
  closeRef.current = onClose;
  const opener = useSheetRef(null);
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
      <div className="rec-sheet-backdrop" aria-hidden="true" />
      <section
        ref={place}
        className="rec-sheet"
        role="dialog"
        aria-modal={true}
        aria-labelledby={titleId}
        aria-label={titleId ? undefined : typeof title === "string" ? title : undefined}
        aria-describedby={subId}
        tabIndex={-1}
        onKeyDown={onEscape}
        data-testid={id ? `rec-sheet-${id}` : undefined}
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
