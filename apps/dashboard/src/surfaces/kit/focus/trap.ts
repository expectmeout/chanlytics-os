/**
 * Focus in a dialog (moved from legacy/components/data-bits.jsx, the one-system plan's step 2).
 *
 * Tab stays inside a modal: Tab and Shift+Tab walk a dialog's own controls and wrap round, so focus never leaves it for the
 * page behind: call trapTab(e, box) from the dialog's keydown when e.key is "Tab". It counts only what Tab actually stops
 * at (tabStops(box)), not a control taken out of the tab order (tabindex -1: a radiogroup's unchosen options) nor one with
 * no box on screen (a closed fold's head and fields, hidden). Counting either, the wrap waited on a control Tab never
 * reached, and focus walked out of an aria-modal dialog.
 *
 * A dialog holds focus while it is open: trapFocus(box) puts focus into the dialog (the box itself, so a phone's keyboard
 * stays down), keeps Tab inside it (trapTab), and its release puts focus back on the control that opened it, as the record
 * kit's sheet does. Escape is the page's own. dialogRef(key) is the ref that does it for an element's life, one per key as
 * `leaving` is, carrying `leaving`'s way out too. The modals outside the record kit take one of these.
 */

const TAB_STOP_KINDS = "button, a[href], input, select, textarea, [tabindex]";

/** What Tab stops at inside a box: enabled, in the tab order, and drawn. */
export const tabStops = (box: Element): HTMLElement[] =>
  Array.from(box.querySelectorAll<HTMLElement>(TAB_STOP_KINDS)).filter(
    (el) => !(el as HTMLButtonElement).disabled && el.tabIndex >= 0 && el.getClientRects().length > 0,
  );

/** Keep Tab inside `box`: from the dialog's keydown when the key is Tab. */
export const trapTab = (
  e: { shiftKey: boolean; preventDefault: () => void },
  box: Element | null | undefined,
): void => {
  if (!box || !("querySelectorAll" in box)) return;
  const stops = tabStops(box);
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) {
    e.preventDefault();
    return;
  }
  const at = document.activeElement;
  if (e.shiftKey && (at === first || at === box)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && at === last) {
    e.preventDefault();
    first.focus();
  }
};

// What had focus outside every modal: a sheet that autofocuses a field has taken focus by the time it is held.
let focusedOutside: EventTarget | null = null;
let hearing = false;

/** Note what has focus outside every modal, from the boot on (the installer runs it once, where the page loads). */
export function hearFocusOutside(): void {
  if (hearing || typeof document === "undefined" || !document.addEventListener) return;
  hearing = true;
  document.addEventListener("focusin", (e) => {
    const t = e.target as Element | null;
    if (!(t && t.closest && t.closest('[aria-modal="true"]'))) focusedOutside = e.target;
  });
}

/** Hold focus in `box` while it is open; what it returns gives focus back to where it came from. */
export const trapFocus = (box: HTMLElement | null): (() => void) => {
  if (!box || !box.addEventListener) return () => {};
  const at = document.activeElement;
  const from = (at && box.contains(at) && focusedOutside ? focusedOutside : at) as HTMLElement | null;
  if (!box.contains(at)) {
    if (box.getAttribute("tabindex") === null) box.setAttribute("tabindex", "-1");
    box.focus({ preventScroll: true });
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Tab") trapTab(e, box);
  };
  box.addEventListener("keydown", onKey);
  return () => {
    box.removeEventListener("keydown", onKey);
    if (from && from !== document.body && from.isConnected !== false && from.focus) from.focus({ preventScroll: true });
  };
};

const dialogRefs = new Map<string, (el: HTMLElement | null) => void>();

/** The ref that holds focus in its element for the element's life, with `leaving`'s way out: one per key. */
export const dialogRef = (key: string): ((el: HTMLElement | null) => void) => {
  const had = dialogRefs.get(key);
  if (had) return had;
  const leave = window.leaving ? window.leaving(key) : null;
  let release: (() => void) | null = null;
  const ref = (el: HTMLElement | null) => {
    if (release) {
      release();
      release = null;
    }
    if (el) release = trapFocus(el);
    if (leave) leave(el);
  };
  dialogRefs.set(key, ref);
  return ref;
};
