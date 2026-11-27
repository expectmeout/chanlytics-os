/**
 * The shortcuts sheet (moved from legacy/components/shortcuts.jsx, the one-system plan's step 7b): every key the app
 * answers to, listed from one table (contracts' SHORTCUTS through `__chrome`). It opens on "?" outside a field and from
 * the account menu's Keyboard shortcuts row on a desk, which calls `openShortcuts()` (a phone needs no keys, and the row
 * is not drawn there); Escape and the backdrop close it. The frame imports it, and the account menu `openShortcuts`.
 */
import { Fragment, useEffect, useRef, useState } from "react";
import { useRootFlag } from "../kit/motion/root-flags";
import { frameChrome } from "./frame-window";
import { Icon } from "../kit/icon/icon";
import { Sheet } from "../kit/sheet/sheet";

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
  // Open, it holds the page (aria-modal), said on the document's root (kit/motion/root-flags.ts).
  useRootFlag("modalOpen", open && !!chrome);
  // Shut, it draws nothing: the kit's Sheet plays its leaving as it goes (kit/sheet/sheet.tsx useLeavesWhenLetGo).
  if (!open || !chrome) return null;
  const groups = chrome.shortcutGroups(chrome.shortcuts);
  return (
    <Sheet
      open={open}
      onClose={() => setOpen(false)}
      title="Keyboard shortcuts"
      kicker
      close={{ label: "Close", glyph: <Icon name="x" size={13} /> }}
      testid="shortcuts-sheet"
    >
      {groups.map((g) => (
        <section key={g.group} className="sc-group">
          <div className="more-header">{g.group}</div>
          {g.items.map((s) => (
            <div key={s.does} className="sc-row">
              <span>{s.does}</span>
              <span className="sc-keys">
                {s.keys.map((k, i) => (
                  <Fragment key={k}>
                    {i > 0 && <span className="sc-keys-sep">{sepOf(s.keys, k)}</span>}
                    <kbd className="kbd">{k}</kbd>
                  </Fragment>
                ))}
              </span>
            </div>
          ))}
        </section>
      ))}
    </Sheet>
  );
}
