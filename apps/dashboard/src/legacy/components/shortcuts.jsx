/* global React, Icon */
// The shortcuts sheet: every key the app answers to, listed from one table
// (contracts/chrome.ts through window.__chrome). Opens on "?" outside a
// field and from the account menu; Escape and the backdrop close it.
const ShortcutsSheet = () => {
  const [open, setOpen] = React.useState(false);
  // Whether the sheet is up, for the one listener below.
  const shown = React.useRef(false);
  shown.current = open;
  React.useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e) => {
      // An Esc that closes the sheet is taken: this listener hears it before a page's does, and by then the sheet is
      // gone, so People cleared its selection behind it. An Esc with the sheet closed is left to the page.
      if (e.key === "Escape") { if (shown.current) { e.preventDefault(); setOpen(false); } return; }
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey && !(window.__chrome && window.__chrome.typing(e.target))) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("shortcuts:open", onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("shortcuts:open", onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  if (!open || !window.__chrome) return null;
  const groups = window.__chrome.shortcutGroups(window.__chrome.shortcuts);
  return (
    <>
      <div className="sb-sheet-backdrop" role="presentation" onClick={() => setOpen(false)} />
      <div className="sb-sheet" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" ref={window.dialogRef ? window.dialogRef("shortcuts") : undefined} data-testid="shortcuts-sheet">
        <div className="sb-sheet-head">
          <span className="sb-sheet-title">Keyboard shortcuts</span>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setOpen(false)} aria-label="Close"><Icon name="x" size={14} /></button>
        </div>
        {groups.map((g) => (
          <div key={g.group}>
            <div className="sb-sheet-group">{g.group}</div>
            {g.items.map((s) => (
              <div key={s.does} className="sb-sheet-row">
                <span>{s.does}</span>
                <span className="sb-sheet-keys">{s.keys.map((k, i) => <React.Fragment key={k}>{i > 0 && <span className="sb-sheet-sep">{s.keys.length === 2 && /^⌘[19]$/.test(k) ? "to" : ""}</span>}<kbd className="kbd">{k}</kbd></React.Fragment>)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
};

window.ShortcutsSheet = ShortcutsSheet;
