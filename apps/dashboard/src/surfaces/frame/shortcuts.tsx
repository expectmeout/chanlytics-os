/**
 * The shortcuts sheet (moved from legacy/components/shortcuts.jsx, the one-system plan's step 7b): every key the app
 * answers to, listed from one table (contracts' SHORTCUTS through `__chrome`). It opens on "?" outside a field and from
 * the account menu's Keyboard shortcuts row on a desk, which calls `openShortcuts()` (a phone needs no keys, and the row
 * is not drawn there); Escape and the backdrop close it. The frame's JSX draws it by its old name (`ShortcutsSheet`,
 * published by frame-globals.ts with `openShortcuts`) until the frame itself is TypeScript (step 7e).
 */
import { Fragment, useEffect, useRef, useState } from "react";
import { frameChrome, frameGlyph } from "./frame-window";

// The sheet's own opener, handed here while the sheet is drawn: openShortcuts() asks it. A door is a call to the sheet
// that answers it, never an event on the window (shortcuts:open had a listener and no sender, and nothing said so).
let scOpener: (() => void) | null = null;

/** Open the sheet, where it is drawn. */
export const openShortcuts = (): void => {
  if (scOpener) scOpener();
};

/** "⌘1 to ⌘9": the word between a range's two keys; nothing between keys pressed together. */
const sepOf = (keys: readonly string[], k: string) => (keys.length === 2 && /^⌘[19]$/.test(k) ? "to" : "");

export function ShortcutsSheet() {
  const Glyph = frameGlyph();
  const [open, setOpen] = useState(false);
  // Whether the sheet is up, for the one listener below.
  const shown = useRef(false);
  shown.current = open;
  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      // An Esc that closes the sheet is taken: this listener hears it before a page's does, and by then the sheet is
      // gone, so People cleared its selection behind it. An Esc with the sheet closed is left to the page.
      if (e.key === "Escape") {
        if (shown.current) {
          e.preventDefault();
          setOpen(false);
        }
        return;
      }
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey && !(frameChrome()?.typing(e.target) ?? false)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    scOpener = onOpen;
    window.addEventListener("keydown", onKey);
    return () => {
      if (scOpener === onOpen) scOpener = null;
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  const chrome = frameChrome();
  if (!open || !chrome) return null;
  const groups = chrome.shortcutGroups(chrome.shortcuts);
  return (
    <>
      <div className="sb-sheet-backdrop" role="presentation" onClick={() => setOpen(false)} />
      <div
        className="sb-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        ref={window.dialogRef ? window.dialogRef("shortcuts") : undefined}
        data-testid="shortcuts-sheet"
      >
        <div className="sb-sheet-head">
          <span className="sb-sheet-title">Keyboard shortcuts</span>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setOpen(false)} aria-label="Close">
            <Glyph name="x" size={14} />
          </button>
        </div>
        {groups.map((g) => (
          <div key={g.group}>
            <div className="sb-sheet-group">{g.group}</div>
            {g.items.map((s) => (
              <div key={s.does} className="sb-sheet-row">
                <span>{s.does}</span>
                <span className="sb-sheet-keys">
                  {s.keys.map((k, i) => (
                    <Fragment key={k}>
                      {i > 0 && <span className="sb-sheet-sep">{sepOf(s.keys, k)}</span>}
                      <kbd className="kbd">{k}</kbd>
                    </Fragment>
                  ))}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
