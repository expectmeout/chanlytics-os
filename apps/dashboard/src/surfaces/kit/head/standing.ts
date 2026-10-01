/**
 * Where the page on screen stands, as the frame's head says it in Glass (the interface kit's step 5.4): the canvases open
 * every page the same way, the page's name with one sentence beside it, and the page's own act at the right of the row of
 * views. A page that has left the shell says its standing here as it draws (`useStanding`), and the frame's head
 * (frame-head.tsx) reads it; a page that says nothing is named by the crumbs the frame drew, which the frame tells here
 * (`crumbsShown`, through the chrome bridge). One head for every page, fed from one place.
 *
 * A plain store, not the surface seam: the standing is what the page says of itself, not a read from the workspace.
 * Classic reads none of it: the frame leaves no place for the head there, and the head draws nothing.
 */
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

interface Standing {
  /** The page's name; the last crumb's words where the page says none. */
  title?: ReactNode;
  /** Where the page stands, in one line beside the name. */
  sentence?: ReactNode;
  /** The sentence under the name rather than beside it, where the name is a whole sentence (Today's greeting). */
  stacked?: boolean;
  /** The page's own act, at the right of the row of views; the frame's act where the page names none. */
  act?: ReactNode;
  /** The way back, above the name: the crumb before the last where unsaid; null for none. */
  back?: BackWay | null;
}

export interface BackWay {
  label: string;
  go: () => void;
}

/** A crumb as the frame draws it: its words, and where it goes (`to`), or the page's own move there (`go`). */
export type ShownCrumb = string | { label: string; to?: string | null; go?: () => void };

interface Said {
  token: symbol;
  standing: Standing;
}

let said: Said | null = null;
let crumbs: readonly ShownCrumb[] = [];
const standingWatchers = new Set<() => void>();

const tellStandingWatchers = (): void => {
  for (const fn of standingWatchers) fn();
};

const subscribe = (fn: () => void): (() => void) => {
  standingWatchers.add(fn);
  return () => standingWatchers.delete(fn);
};

const standingNow = (): Standing | null => said?.standing ?? null;
const crumbsNow = (): readonly ShownCrumb[] => crumbs;
const nothing = (): null => null;
const noCrumbs: readonly ShownCrumb[] = [];
const noCrumbsEver = (): readonly ShownCrumb[] => noCrumbs;

/**
 * Say where this page stands, on every draw, and unsay it as the page leaves. Null says nothing (a page in Classic,
 * where no head is drawn, still calls this: a hook is called every time or never).
 */
export function useStanding(standing: Standing | null): void {
  const token = useRef<symbol | null>(null);
  token.current ??= Symbol("standing");
  useLayoutEffect(() => {
    const mine = token.current as symbol;
    if (!standing) return undefined;
    said = { token: mine, standing };
    tellStandingWatchers();
    return () => {
      if (said?.token === mine) {
        said = null;
        tellStandingWatchers();
      }
    };
  });
}

/** What the page on screen said, drawn again when it says otherwise. */
export function useStandingSaid(): Standing | null {
  return useSyncExternalStore(subscribe, standingNow, nothing);
}

/** What the page on screen said, read once: for a test that draws a page and asks what it told the head. */
export const standingSaid = (): Standing | null => standingNow();

/** The crumbs the frame drew for the page on screen (app-shell.jsx, through the chrome bridge). */
export function crumbsShown(shown: readonly ShownCrumb[]): void {
  if (shown === crumbs) return;
  crumbs = shown;
  tellStandingWatchers();
}

export function useCrumbsShown(): readonly ShownCrumb[] {
  return useSyncExternalStore(subscribe, crumbsNow, noCrumbsEver);
}

/** A crumb's words. */
export const crumbLabel = (c: ShownCrumb): string => (typeof c === "string" ? c : c.label);

/** What is said and drawn, put back to nothing: for a test that draws pages one after another. */
export function forgetStanding(): void {
  said = null;
  crumbs = noCrumbs;
  tellStandingWatchers();
}
