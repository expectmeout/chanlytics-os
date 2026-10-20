/**
 * Where the page on screen stands, as the frame's head says it in Glass (the interface kit's step 5.4): the canvases open
 * every page the same way, the page's name with one sentence beside it, and the page's own act at the right of the row of
 * views. A page that has left the shell says its standing here as it draws (`useStanding`), and the frame's head
 * (frame-head.tsx) reads it; a page that says nothing is named by the crumbs the frame drew, which the frame tells here
 * (`crumbsShown`, through the chrome bridge). One head for every page, fed from one place.
 *
 * A plain store, not the surface seam: the standing is what the page says of itself, not a read from the workspace.
 * Classic reads none of it: the frame leaves no place for the head there, and the head draws nothing.
 *
 * The head can also stand as it stood over another page (`headUnder`): while a thumb carries a row's page back to the
 * list held under it (kit motion/held-list.ts), the head says what it said over that list as the row opened, its strip of
 * views with it (`stripShown`, told by the frame's strip), so what lies under the page is the screen it goes back to and
 * nothing of it is drawn as the page goes.
 */
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { nothing } from "../../legacy-parts";
import type { ReactNode } from "react";
import type { SurfaceViews } from "../../routes";

interface Standing {
  /** The page's name; the last crumb's words where the page says none. Null: the page draws its own head (a person's
   *  hero, canvas P3), so the frame draws no name and no way back, only the date. */
  title?: ReactNode | null;
  /** Where the page stands, in one line beside the name. */
  sentence?: ReactNode;
  /** The sentence under the name rather than beside it, where the name is a whole sentence (Today's greeting). */
  stacked?: boolean;
  /** The page's own act, at the right of the row of views; the frame's act where the page names none. */
  act?: ReactNode;
  /** The way back, above the name on a desk and in the date's place on a phone: the crumb before the last where unsaid; null
   *  for none. */
  back?: BackWay | null;
  /**
   * What a phone's top bar says at its centre once the page's own head has scrolled away (a person's name and the dot
   * of their state, canvas A's hand-off); none while the head is on screen, and none on a desk.
   */
  bar?: BarTitle | null;
}

/** The top bar's centre on a phone: a name, and the dot of where they stand in its tone, with the word for a reader. */
interface BarTitle {
  name: string;
  tone: string;
  word: string;
}

export interface BackWay {
  label: string;
  go: () => void;
  /** What stands with the way back in the date's place: a person's "‹ 4 of 24 ›" (canvas A), beside it on a desk and in
   *  the bell's place on a phone, where the bell stands down for it (components.css). */
  after?: ReactNode;
}

/** A crumb as the frame draws it: its words, and where it goes (`to`), or the page's own move there (`go`). */
export type ShownCrumb = string | { label: string; to?: string | null; go?: () => void };

interface Said {
  token: symbol;
  standing: Standing;
}

/** The strip of views the frame drew over the page on screen (frame/surface-tabs.tsx): the route and views it drew. */
export interface StripAt {
  page: string;
  param?: string | null;
  views?: SurfaceViews | null;
}

/** The head as it stands over a page: what the page said, the crumbs, and the strip of views, or none. */
export interface HeadAt {
  standing: Standing | null;
  crumbs: readonly ShownCrumb[];
  strip: StripAt | null;
}

let said: Said | null = null;
let crumbs: readonly ShownCrumb[] = [];
let strip: StripAt | null = null;
/** The head as it stood over the page a carried page goes back to; null while nothing is carried. */
let under: HeadAt | null = null;
const standingWatchers = new Set<() => void>();

const tellStandingWatchers = (): void => {
  for (const fn of standingWatchers) fn();
};

const subscribe = (fn: () => void): (() => void) => {
  standingWatchers.add(fn);
  return () => standingWatchers.delete(fn);
};

const standingNow = (): Standing | null => (under ? under.standing : (said?.standing ?? null));
const crumbsNow = (): readonly ShownCrumb[] => (under ? under.crumbs : crumbs);
const underNow = (): HeadAt | null => under;
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

/** The crumbs the frame drew for the page on screen (frame/app-shell.tsx, through the chrome bridge). */
export function crumbsShown(shown: readonly ShownCrumb[]): void {
  if (shown === crumbs) return;
  crumbs = shown;
  tellStandingWatchers();
}

export function useCrumbsShown(): readonly ShownCrumb[] {
  return useSyncExternalStore(subscribe, crumbsNow, noCrumbsEver);
}

/** The strip the frame drew, told by the strip once it is drawn (null where it drew none), for the head kept as it stands. */
export function stripShown(drawn: StripAt | null): void {
  strip = drawn;
}

/** The head as it stands now, over the page on screen: kept by a list held under the row it opens (held-list.ts). */
export const headNow = (): HeadAt => ({ standing: said?.standing ?? null, crumbs, strip });

/**
 * The head stands as it stood over another page (`head`), until it is given null: while a thumb carries a page back to
 * the list held under it, so what the frame draws over that list is drawn as the list had it.
 */
export function headUnder(head: HeadAt | null): void {
  if (head === under) return;
  under = head;
  tellStandingWatchers();
}

/** The head the frame stands as while a page is carried back (headUnder), drawn again as it comes and goes; null for none. */
export function useHeadUnder(): HeadAt | null {
  return useSyncExternalStore(subscribe, underNow, nothing);
}

/** A crumb's words. */
export const crumbLabel = (c: ShownCrumb): string => (typeof c === "string" ? c : c.label);

/** What is said and drawn, put back to nothing: for a test that draws pages one after another. */
export function forgetStanding(): void {
  said = null;
  crumbs = noCrumbs;
  strip = null;
  under = null;
  tellStandingWatchers();
}
