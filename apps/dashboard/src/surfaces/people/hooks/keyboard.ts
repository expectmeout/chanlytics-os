/**
 * The page's one keyboard listener's rule (moved whole from legacy/pages/people.jsx usePlPlace, decision 0015). A
 * keyboard walks the rows the way the Inbox walks threads: J/K or ↓/↑ move the cursor, x or Space selects the row under
 * it, Enter opens it, / goes to the search, Esc clears the selection. Never while typing,
 * never with a modifier, never behind a menu or a sheet. The cursor's row shows its actions, as a hovered row does
 * (clients.css).
 */
import { PL_CONTROL, PL_OVERLAY, plTyping } from "../words";

/** What the listener reads, left by the view as its draw ends: this draw's rows, cursor and doors, and the view's own. */
export interface KeyDoors {
  ids: readonly string[];
  cursor: string | null;
  move: (step: number) => void;
  toggle: (id: string) => void;
  selected: boolean;
  clearSel: () => void;
  focusSearch: () => void;
  /** What Enter opens. */
  open?: (id: string) => void;
  /** Whether a row may be selected. */
  canSelect?: boolean;
  sheetOpen?: boolean;
  closeSheet?: (() => void) | null;
  /** Under Leads: the peek, the plan panel, F and C. */
  peekOpen?: boolean;
  closePeek?: () => void;
  finderOpen?: boolean;
  closeFinder?: () => void;
  canFind?: boolean;
  find?: () => void;
  call?: ((id: string) => void) | null;
  /** Under Leads, while the pile is on (00423): A, L and N press its rail, Z undoes, Esc leaves it. */
  pile?: { press: (key: "a" | "l" | "n") => void; undo: () => void; leave: () => void } | null;
}

/** The pile's keys: its rail's three, Undo, and the way out; false for any other key. */
function pileKey(k: NonNullable<KeyDoors["pile"]>, e: KeyboardEvent): boolean {
  const key = e.key.toLowerCase();
  if (key === "a" || key === "l" || key === "n") k.press(key);
  else if (key === "z") k.undo();
  else if (key === "escape") k.leave();
  else return false;
  e.preventDefault();
  return true;
}

/**
 * The page's own overlays first, in the order Esc closes them: the peek, the plan panel, the sheets. The Columns menu is
 * the kit's (table/columns-menu.tsx), in PL_OVERLAY while it is open, and closes on its own Esc.
 */
function ownOverlayKey(k: KeyDoors, e: KeyboardEvent): boolean {
  // The peek holds only Esc -- J and K keep walking the rows behind it, and the peek follows the cursor -- so it is not
  // in PL_OVERLAY either.
  if (e.key === "Escape" && k.peekOpen) {
    e.preventDefault();
    if (k.closePeek) k.closePeek();
    return true;
  }
  // The plan panel holds every key while it is open: its answer row, its pickers and its buttons are its own.
  if (k.finderOpen) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (k.closeFinder) k.closeFinder();
    }
    return true;
  }
  // The page's own sheet holds every key: on a desk the Pipeline's New proposal. The kit's sheets (the Lists sheet, a
  // phone's small jobs) are in PL_OVERLAY and close on their own Esc.
  if (k.sheetOpen) {
    if (e.key === "Escape" && k.closeSheet) {
      e.preventDefault();
      k.closeSheet();
    }
    return true;
  }
  return false;
}

/** A key that walks or acts on the rows: the cursor, the selection, Enter, and under Leads C. */
function rowKey(k: KeyDoors, e: KeyboardEvent, from: Element | null): void {
  // Enter and Space on a focused button, link, box, tab or menu item are that control's: they opened the profile under
  // the cursor, or selected its row, instead of pressing what had focus.
  if ((e.key === "Enter" || e.key === " ") && from && from.closest && from.closest(PL_CONTROL)) return;
  const down = e.key === "ArrowDown" || e.key === "j" || e.key === "J";
  const up = e.key === "ArrowUp" || e.key === "k" || e.key === "K";
  // A held key walks on; a held x, Space or Enter acts once, so a row is not selected and unselected over and over.
  if (e.repeat && !(down || up)) return;
  if (down || up) {
    e.preventDefault();
    k.move(down ? 1 : -1);
  } else if (e.key === "Enter" && k.cursor) {
    e.preventDefault();
    if (k.open) k.open(k.cursor);
  } else if ((e.key === " " || e.key === "x" || e.key === "X") && k.cursor && k.canSelect) {
    e.preventDefault();
    k.toggle(k.cursor);
  }
  // C calls the lead under the cursor from the owner's own phone, and arms the call question.
  else if ((e.key === "c" || e.key === "C") && k.cursor && k.call) {
    e.preventDefault();
    k.call(k.cursor);
  }
}

export function onPageKey(k: KeyDoors | null, e: KeyboardEvent): void {
  // Where the key was pressed, not where focus is now: React hears it first, and a field's own Esc can close the field and
  // take focus with it, so the body had focus by the time this heard an Esc typed in the list's name.
  const from = e.target && (e.target as Node).nodeType === 1 ? (e.target as Element) : document.activeElement;
  // A key an earlier listener took (the ? sheet's Esc) is not the page's.
  if (!k || e.defaultPrevented || plTyping(from) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (ownOverlayKey(k, e)) return;
  // Anything else open over the page has the keys: a menu, the notifications or a sidebar menu listens from when it
  // opens, after this listener, so it is still on the page as this one hears the key; the ? sheet takes its Esc.
  if (document.querySelector(PL_OVERLAY)) return;
  if (k.pile && pileKey(k.pile, e)) return;
  if (e.key === "/") {
    e.preventDefault();
    k.focusSearch();
    return;
  }
  // Esc clears a selection wherever focus is, a bulk-bar button included.
  if (e.key === "Escape") {
    if (k.selected) {
      e.preventDefault();
      k.clearSel();
    }
    return;
  }
  // F opens Ask on the Leads scope (spec F7), for whoever may find; the gate says why to everyone else, at the button, so
  // the key is simply not theirs.
  if ((e.key === "f" || e.key === "F") && k.canFind) {
    e.preventDefault();
    if (k.find) k.find();
    return;
  }
  if (!k.ids.length) return;
  rowKey(k, e, from);
}
