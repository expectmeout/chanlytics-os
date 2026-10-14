/**
 * Whether the page is in front (the wiring's second audit, lane R9: S8-9, S10-3). In a browser it is the document's own
 * visibility. In the phone app each tab is a page of its own, kept open behind the others once visited, and a covered page
 * may still call itself visible: the shell says which tab is in front (contracts ShellMessage `front`, legacy-bridge/
 * app-bridge.ts), and a page behind counts as hidden. A hidden page reads nothing for the feed but what it must (hearing/
 * passes.ts), makes nothing again by the clock (hearing/clock.ts), and reads what it held as it comes in front.
 */

/** The phone app's word that this page's tab is behind another; false in a browser, where the document says. */
let behind = false;

/** The event a page coming in front or going behind is told by, beside the document's own `visibilitychange`. */
const FRONT_EVENT = "chanly:front";

/** The shell says this page's tab is in front, or behind: listeners hear it as a change of visibility. */
export function setPageBehind(isBehind: boolean, win: Window = window): void {
  if (behind === isBehind) return;
  behind = isBehind;
  win.dispatchEvent(new Event(FRONT_EVENT));
}

/** Whether nobody is looking at this page: its document is hidden, or its phone tab is behind another. */
export function pageHidden(): boolean {
  return behind || (typeof document !== "undefined" && document.visibilityState === "hidden");
}

/** Hear the page come in front or go behind, by either measure; answers the stop. */
export function hearFront(fn: () => void, win: Window = window): () => void {
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", fn);
  win.addEventListener(FRONT_EVENT, fn);
  return () => {
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", fn);
    win.removeEventListener(FRONT_EVENT, fn);
  };
}
