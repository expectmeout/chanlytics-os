/**
 * What the record kit still asks of the shell's frame (decision 0015, the record family): each a thin wrapper that calls
 * the frame's own where it is and does what the JSX did where it is not (the standalone mockup, a test's stand-in
 * window). The kit's TSX reads no `window` name itself; it imports these, as a surface imports `frame-verbs.ts`.
 *
 * The frame owns every one of them: `tabStops` is the frame's (the tab stops of a part); the app's one tooltip, the
 * chrome's words and the tab's kept work are the parts the bridge provides (provided.ts `tip`, `chrome`, `tabMemory`,
 * decision 0151); the rest are the browser's own (`matchMedia`, the window's listeners, `getSelection`, the console).
 * Each line is deleted on the day its owner moves. They ask as they are called, never when this loads, since the app
 * installs what the frame owns after the kit loads and a test builds its world after that.
 */
import { provided, type BridgeParts } from "@/bridge/provided";
import { tabStops } from "../focus/trap";

declare global {
  interface Window {
    tabStops?: (root: Element) => HTMLElement[];
  }
}

/** A fact's words and tone, as the chrome says them (`chrome.state`); nothing where the chrome is not installed. */
export function factWords(source: unknown): { tone: string; label: string } | undefined {
  return provided("chrome")?.state("fact", source);
}

/** The app's one tooltip, shown at a mark now (a finger has no hover). Nothing where it is not drawn. */
export function showTip(el: Element | null): void {
  const tip = provided("tip");
  if (el && tip) tip.show(el);
}

/** The tab stops inside a part, in order (kit/focus/trap.ts). */
export { tabStops };

/** The tab's memory of a page's work half-done (`tabMemory`): nothing where the tab keeps none (the standalone mockup). */
export function tabMemory(): BridgeParts["tabMemory"] | undefined {
  return provided("tabMemory");
}

/** The browser's media query, or none where the window cannot answer one. */
export function mediaQuery(query: string): MediaQueryList | null {
  return typeof window.matchMedia === "function" ? window.matchMedia(query) : null;
}

/**
 * Whether the pointer a person mostly uses is a finger: the house's one test for a touch screen (frame-verbs
 * `focusAsDrawn` says what it is and why), asked through the kit's own verb for a query.
 */
export function onTouchScreen(): boolean {
  return !!mediaQuery("(pointer: coarse)")?.matches;
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
