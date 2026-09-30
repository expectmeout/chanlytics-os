/**
 * What the record kit still asks of the shell's frame (decision 0015, the record family): each a thin wrapper that calls
 * the window's own where it is and does what the JSX did where it is not (the standalone mockup, a test's stand-in
 * window). The kit's TSX reads no `window` name itself; it imports these, as a surface imports `legacy-verbs.ts`.
 *
 * The frame owns every one of them: `touchSwipe`, `trapTab`, `tabStops` and `leaveOverlay` are data-bits' (the pull that
 * closes a sheet, Tab kept inside a dialog, the tab stops of a part, a sheet's still copy leaving), `__tip` the app's one
 * tooltip, `__chrome` the chrome's words, `__tabMemory` the tab's kept work, `ReactDOM` the page's portal, and the rest
 * are the browser's own (`matchMedia`, the window's listeners, `getSelection`, the console). Each line is deleted on the
 * day its owner moves. They read the window as they are called, never when this loads, since the app publishes what the
 * frame owns after the kit loads and a test builds its window after that.
 */
import type { KeyboardEvent, ReactNode } from "react";

declare global {
  interface Window {
    tabStops?: (root: Element) => HTMLElement[];
    trapTab?: (e: KeyboardEvent, root: Element | null) => void;
    leaveOverlay?: (sheet: Element, wash: Element | null) => void;
  }
}

/** A fact's words and tone, as the chrome says them (`__chrome.state`); nothing where the chrome is not published. */
export function factWords(source: unknown): { tone: string; label: string } | undefined {
  return window.__chrome && window.__chrome.state ? window.__chrome.state("fact", source) : undefined;
}

/** The app's one tooltip, shown at a mark now (a finger has no hover). Nothing where it is not drawn. */
export function showTip(el: Element | null): void {
  if (window.__tip) window.__tip.show(el);
}

/** The tab stops inside a part, in order (data-bits `tabStops`); none where the frame has no such verb. */
export function tabStops(root: Element): HTMLElement[] {
  return window.tabStops ? window.tabStops(root) : [];
}

/** Tab and Shift+Tab kept inside a dialog (data-bits `trapTab`). */
export function trapTab(e: KeyboardEvent, root: Element | null): void {
  window.trapTab?.(e, root);
}

/** A sheet that React has let go of, played out from a still copy (data-bits `leaveOverlay`). */
export function leaveOverlay(sheet: Element, wash: Element | null): void {
  window.leaveOverlay?.(sheet, wash);
}

/** The tab's memory of a page's work half-done (`__tabMemory`): nothing where the tab keeps none (the standalone mockup). */
export function tabMemory(): NonNullable<Window["__tabMemory"]> | undefined {
  return window.__tabMemory;
}

/** Draw `node` into `root` (the page's `ReactDOM.createPortal`), or in place where there is no root or no portal. */
export function portal(node: ReactNode, root: Element | null): ReactNode {
  return root && window.ReactDOM && window.ReactDOM.createPortal ? window.ReactDOM.createPortal(node, root) : node;
}

/** The browser's media query, or none where the window cannot answer one. */
export function mediaQuery(query: string): MediaQueryList | null {
  return typeof window.matchMedia === "function" ? window.matchMedia(query) : null;
}

/** What the person has selected on the page, if the browser can say. */
export function pageSelection(): Selection | null {
  return typeof window.getSelection === "function" ? window.getSelection() : null;
}

/** A listener on the window. */
export function listen<K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void): void {
  window.addEventListener(type, fn);
}

/** A listener let go of. */
export function unlisten<K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void): void {
  window.removeEventListener(type, fn);
}

/** Report an error where the window has a console; a listener that throws is reported and the rest still hear. */
export function logError(err: unknown): void {
  if (window.console) window.console.error(err);
}
