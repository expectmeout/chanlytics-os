/**
 * The page's own search, said to the frame's top bar (the page heads canvas, H2, 31 Oct 2026: "one line to search or
 * ask"). On a desk the line in the bar's middle is Ask's, and on a page that searches a list it is that list's search as
 * well: the words narrow the list as they are typed, and Enter (or the line's Ask) hands them to Ask, which scopes the
 * question to the page as ⌘K does. The list's own box stood a row lower, inside its pane, while the bar's middle stood
 * empty on every page. On a phone the bar has no line (Ask is the tab bar's circle), so the page keeps its box there.
 *
 * One page says one search at a time: the page on screen, as the head's standing is (kit/head/standing.ts). It says it
 * on every draw and takes it back as it goes; what it says is its own state, so the list and the line never differ.
 */
import { useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from "react";

export interface PageSearch {
  /** The line's words while it is empty, and its name to a reader: "Search people, or ask about them". */
  label: string;
  /** What is typed, the page's own state. */
  value: string;
  /** The page's own setter: the list narrows as the words change. */
  onValue: (q: string) => void;
  /** The page's own ref to its box, so its key (/) finds the line where the line is its box. */
  inputRef?: RefObject<HTMLInputElement | null>;
  /** The line's test id where it is this page's search: the one the page's box carried. */
  testid?: string;
}

interface Said {
  token: symbol;
  search: PageSearch;
}

let lineSaid: Said | null = null;
const lineWatchers = new Set<() => void>();
const tellLine = () => lineWatchers.forEach((fn) => fn());

const watch = (fn: () => void): (() => void) => {
  lineWatchers.add(fn);
  return () => {
    lineWatchers.delete(fn);
  };
};

const unsayLine = (mine: symbol) => {
  if (lineSaid?.token !== mine) return;
  lineSaid = null;
  tellLine();
};

/**
 * Where the bar has no line: the kit's one breakpoint, a phone's and a tablet's width (the band People's and the Pipeline's
 * phone shapes read too), so a page draws its own box exactly where it draws its phone shape. A desk has the line.
 */
const NO_LINE_QUERY = "(max-width: 900px)";

const noLineQuery = (): MediaQueryList | null =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(NO_LINE_QUERY) : null;

const watchLine = (fn: () => void): (() => void) => {
  const q = noLineQuery();
  q?.addEventListener?.("change", fn);
  return () => q?.removeEventListener?.("change", fn);
};

/** Whether the bar over the page has its line, kept current as the window changes size; a desk's where nothing says. */
function useBarHasLine(): boolean {
  return useSyncExternalStore(
    watchLine,
    () => !noLineQuery()?.matches,
    () => true,
  );
}

/**
 * Say the page's search to the bar while the page is drawn, again on every draw so the line holds what the list does, and
 * take it back as the page goes; and say whether the bar took it. Where the bar has no line (a phone, a tablet) nothing is
 * said and the page draws its own box; null says there is none (a view with nothing to search, Leads' first day). The
 * words are never taken back between two draws, so the line keeps its focus as they are typed.
 */
export function usePageSearch(search: PageSearch | null): boolean {
  const line = useBarHasLine();
  const token = useRef<symbol | null>(null);
  token.current ??= Symbol("page-search");
  const shown = line ? search : null;
  useLayoutEffect(() => {
    const mine = token.current as symbol;
    return () => unsayLine(mine);
  }, []);
  useLayoutEffect(() => {
    const mine = token.current as symbol;
    // The page on screen says its search or none: none is none, whoever said one before it.
    if (!shown) {
      if (lineSaid) {
        lineSaid = null;
        tellLine();
      }
      return;
    }
    lineSaid = { token: mine, search: shown };
    tellLine();
  });
  return !!shown;
}

/** The search the page on screen said, or none: what the bar's line is. */
export function usePageSearchSaid(): PageSearch | null {
  return useSyncExternalStore(
    watch,
    () => lineSaid?.search ?? null,
    () => null,
  );
}

/** The search said now, read once: for a test that draws a page and asks what it told the bar. */
export const pageSearchSaid = (): PageSearch | null => lineSaid?.search ?? null;
