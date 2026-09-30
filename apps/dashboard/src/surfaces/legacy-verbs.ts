/**
 * The few verbs a surface that has left the shell still asks of a page that has not (decision 0015).
 *
 * A TSX surface reads no `window.*` name, so a verb a legacy page owns reaches it through the bridge: one function
 * here, which calls the window's own where it is, and does what the legacy page did where it is not (the standalone
 * mockup, a test's stand-in window). Each is a line to delete on the day its owner moves: the role gate with the role
 * store (the frame's step), `holdStill` and `askAbout` with the pages that publish them, `listRoute` with People,
 * `refreshSurface` and the toast with the frame, `navigate` with the frame's address. A surface never imports a legacy file, and
 * never reads the window itself; it imports this.
 *
 * Nothing here is new behaviour: each reads what the pages it stands in for read, in the same words.
 */
import type { ReactNode } from "react";

/** What a toast says, as the shell's one flash takes it (data-bits `usePPToast`). */
interface LegacyFlash {
  tone?: string;
  msg: ReactNode;
}

declare global {
  interface Window {
    CHANLY?: { nav?: (route: string) => void };
    canDo?: (action: string) => boolean;
    holdStill?: (el: Element | null | undefined, change: () => void) => void;
    askAbout?: (about: { prompt?: string; mode?: string; thread?: string }) => void;
    __listRoute?: (id: string) => string;
    __refreshSurface?: (key: string) => Promise<void>;
    usePPToast?: () => [ReactNode, (flash: LegacyFlash) => void];
  }
}

/** Go to a route, the way a legacy page does (`CHANLY.nav`): the frame's own move, which keeps its Back and its address. */
export function navigate(route: string): void {
  window.CHANLY?.nav?.(route);
}

/** Whether the person acting may do what a role gate names (data-bits `canDo`): with no role store, they may. */
export function canDo(action: string): boolean {
  return window.canDo ? window.canDo(action) : false;
}

/** Whether the session declared itself a demo (`window.__DEMO_MODE`, which the seeds set false wherever nothing set it). */
export function demoSession(): boolean {
  return !!window.__DEMO_MODE;
}

/**
 * A change that moves what is drawn beside the control that made it, run so the control stays where it was (data-bits
 * `holdStill`); where the page has no such verb, just the change.
 */
export function holdStill(control: Element | null | undefined, change: () => void): void {
  if (window.holdStill) window.holdStill(control, change);
  else change();
}

/** Open Ask on a question (the Line asks it, or opens on the scope). Nothing where Ask is not drawn. */
export function askAbout(about: { prompt?: string; mode?: string; thread?: string }): void {
  window.askAbout?.(about);
}

/** Where a People list is, by its id: the list picked (People's own rule), or People itself before its lists are read. */
export function listRoute(id: string): string {
  return window.__listRoute ? window.__listRoute(id) : "clients";
}

/** Read one surface again by its key (a failed read's Retry): the runner's own, which the cache, the status and the pill follow. */
export function refreshSurface(key: string): Promise<void> | undefined {
  return window.__refreshSurface?.(key);
}

/** Whether a retry can be pressed at all: the runner published its verb. */
export function canRefreshSurfaces(): boolean {
  return !!window.__refreshSurface;
}

/** The shell's toast: its node, to be drawn by the page, and the flash that raises one. Nothing to draw where the shell has none. */
export function useLegacyToast(): [ReactNode, (flash: LegacyFlash) => void] {
  return window.usePPToast ? window.usePPToast() : [null, () => undefined];
}
