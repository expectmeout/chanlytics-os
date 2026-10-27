/**
 * The rows of a long list a page draws: the ones on screen and a few either side, never all of them (the strips review,
 * 18 Oct 2026; decision 0054's row for @tanstack/react-virtual, taken there). People's 150 rows, Leads' 300 and every row
 * of Conversations and the Inbox were built whole each time their tab was pressed: 7,500 elements for Leads before it
 * could be seen, about a second at a phone's speed, and as much again to take them down on the way out.
 *
 * A list draws the parts this answers in its own element (a table's rows, a listbox's options): each row it is given, and
 * between them a gap, which the list draws as an empty element of its own kind holding the room of the rows not drawn
 * (`RowGap`). So a table stays a table and a phone's rows stay its cards, and the page's selectors and keys hold. Rows the
 * list must always have drawn (`keep`: the keyboard's cursor, the row open beside the list) are drawn wherever they are,
 * so a key that moves to one finds it, and focus never lands on nothing.
 *
 * Where the list scrolls is found, never told: the list's own element where it scrolls its rows itself, else the nearest
 * box that scrolls it, else the window (a phone, where the window scrolls the page). The virtualizer is @tanstack/react-virtual's (its core, which it re-exports), the job's standard,
 * here and nowhere else.
 */
import { useLayoutEffect, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  Virtualizer,
  defaultRangeExtractor,
  elementScroll,
  measureElement as boxOf,
  observeElementOffset,
  observeElementRect,
  observeWindowOffset,
  observeWindowRect,
  windowScroll,
  type Range,
  type Rect,
  type VirtualizerOptions,
} from "@tanstack/react-virtual";
import { inHeldList, isDocumentScroller, movingScrollerOf } from "../motion/page-scroll";

/** A part of the list as drawn: a row, by its index, or the room of the rows between two drawn ones. */
export type ShownPart = { kind: "row"; index: number } | { kind: "gap"; key: string; height: number };

export interface ShownRows {
  /** What to draw, in order. */
  parts: readonly ShownPart[];
  /** Put on the element the rows are drawn in (a table's body, a listbox): where the list starts and what scrolls it. */
  listRef: (el: Element | null) => void;
  /** Put on each drawn row's element, with `data-index` set to its index: its height is measured, not guessed. */
  measure: (el: Element | null) => void;
}

/** The rows drawn on either side of the screen's. */
const OVERSCAN = 6;
/** A list this short is drawn whole: the window would cost more than it saves. */
const WHOLE_UNDER = 40;
/** The screen's height before the list has measured its box (a phone's, most often): enough to draw the first screen. */
const FIRST_SCREEN_PX = 900;

type Scroller = Element | Window;
type Deck = Virtualizer<Window, Element> | Virtualizer<Element, Element>;
/** What the virtualizer is told whatever scrolls the list. */
interface Told {
  count: number;
  estimateSize: (index: number) => number;
  getItemKey: (index: number) => string | number;
  overscan: number;
  scrollMargin: number;
  initialRect: Rect;
  rangeExtractor: (range: Range) => number[];
}

/**
 * The box that scrolls the list down its length, or the window when none does (a phone's): page-scroll.ts's
 * `movingScrollerOf`, as the virtualizer is told it, asked from the list's own element. Conversations' rows box scrolls
 * itself (conversations.css .cv-rows); asked from its parent, nothing above it scrolled on a desk, the window was heard,
 * which never moves there, and the first screen's rows stayed drawn under a scrolled box (27 Oct 2026).
 */
function listScrollerOf(el: Element): Scroller {
  const box = movingScrollerOf(el, { self: true });
  return isDocumentScroller(box) ? window : box;
}

/** Where the list starts in what its scroller scrolls: the room above it, which the rows' own offsets count from. */
function marginOf(el: Element, scroller: Scroller): number {
  // A list that scrolls itself starts under its own padding, however far it is scrolled.
  if (scroller === el) return Number.parseFloat(getComputedStyle(el).paddingTop) || 0;
  const top = el.getBoundingClientRect().top;
  if (scroller instanceof Window) return top + window.scrollY;
  return top - scroller.getBoundingClientRect().top + scroller.scrollTop;
}

/**
 * The scroller's observers, deaf while the list is held under what it opened (kit motion/held-list.ts): the window then
 * scrolls what stands over the list, and a list that heard it drew the rows of the page's top under a thumb carrying that
 * page back to it. Held, it draws the rows it drew as it was left.
 */
type Observers<S extends Element | Window> = Pick<
  VirtualizerOptions<S, Element>,
  "observeElementRect" | "observeElementOffset"
>;
function unlessHeld<S extends Element | Window>(observe: Observers<S>, held: () => boolean): Observers<S> {
  return {
    observeElementRect: (instance, cb) =>
      observe.observeElementRect(instance, (rect) => {
        if (!held()) cb(rect);
      }),
    observeElementOffset: (instance, cb) =>
      observe.observeElementOffset(instance, (offset, isScrolling) => {
        if (!held()) cb(offset, isScrolling);
      }),
  };
}

/**
 * The room a row takes beyond its own box: its margins, and the gap the list it is drawn in leaves after it, neither of
 * which the virtualizer measures. The room of the rows not drawn came out short by them (2px a row on a phone's Inbox), so
 * a list moved under what stood over it as rows came and went from being drawn: the row a thread was opened from, kept
 * drawn, stood 4px off under the thread and jumped back as the thread went (20 Oct 2026).
 */
function roomAround(el: Element, gap: number): number {
  const s = getComputedStyle(el);
  return (Number.parseFloat(s.marginTop) || 0) + (Number.parseFloat(s.marginBottom) || 0) + gap;
}

/** What the list the rows are drawn in says of itself: whether it is held, and the gap it leaves between two rows. */
interface ListSays {
  held: () => boolean;
  gap: number;
}

/** The virtualizer's options for the window, or for a box that scrolls. */
function windowOptions(
  w: Window,
  told: Told,
  changed: (sync: boolean) => void,
  list: ListSays,
): VirtualizerOptions<Window, Element> {
  return {
    ...told,
    measureElement: (el, entry, instance) => boxOf(el, entry, instance) + roomAround(el, list.gap),
    getScrollElement: () => w,
    ...unlessHeld<Window>(
      { observeElementRect: observeWindowRect, observeElementOffset: observeWindowOffset },
      list.held,
    ),
    scrollToFn: windowScroll,
    onChange: (_, sync) => changed(sync),
  };
}
function boxOptions(
  box: Element,
  told: Told,
  changed: (sync: boolean) => void,
  list: ListSays,
): VirtualizerOptions<Element, Element> {
  return {
    ...told,
    measureElement: (el, entry, instance) => boxOf(el, entry, instance) + roomAround(el, list.gap),
    getScrollElement: () => box,
    ...unlessHeld<Element>({ observeElementRect, observeElementOffset }, list.held),
    scrollToFn: elementScroll,
    onChange: (_, sync) => changed(sync),
  };
}

/**
 * The parts to draw from the virtualizer's rows: each row, and a gap wherever two drawn rows are not neighbours. A row's
 * room holds the list's gap after it (roomAround), and the element standing for the rows not drawn is given one by the
 * list as a row is, so it is that much shorter than their room.
 */
function partsDrawn(v: Deck, gap: number): ShownPart[] {
  const margin = v.options.scrollMargin;
  const parts: ShownPart[] = [];
  const room = (key: string, height: number) => parts.push({ kind: "gap", key, height: Math.max(0, height - gap) });
  let end = 0;
  for (const item of v.getVirtualItems()) {
    const start = item.start - margin;
    if (start > end) room(`gap-${item.index}`, start - end);
    parts.push({ kind: "row", index: item.index });
    end = item.end - margin;
  }
  const total = v.getTotalSize();
  if (total > end) room("gap-end", total - end);
  return parts;
}

const allRows = (count: number): ShownPart[] => Array.from({ length: count }, (_, index) => ({ kind: "row", index }));

/**
 * What a long list draws before it has found where it scrolls (its first draw, gone by the first paint): its first screen,
 * the rows it must keep wherever they are (the cursor's), and the room between at the guessed height.
 */
function firstParts(count: number, keep: readonly number[], estimate: number): ShownPart[] {
  const parts = allRows(Math.min(count, WHOLE_UNDER));
  let end = WHOLE_UNDER;
  for (const i of [...new Set(keep)].filter((k) => k >= WHOLE_UNDER && k < count).sort((x, y) => x - y)) {
    if (i > end) parts.push({ kind: "gap", key: `gap-${i}`, height: (i - end) * estimate });
    parts.push({ kind: "row", index: i });
    end = i + 1;
  }
  if (count > end) parts.push({ kind: "gap", key: "gap-end", height: (count - end) * estimate });
  return parts;
}
/** What a list drawn whole measures: nothing, one function for the page's life so a row's memo holds. */
const NO_MEASURE = (): void => undefined;

/**
 * The parts of a list of `count` rows to draw, and the ref for the element they are drawn in. `estimate` a row's height before it is measured; `keyOf` a row's key, so a row keeps its measure as rows move; `keep`
 * the indexes always drawn. A short list, a list in a browser that cannot watch it, and a test's draw it whole.
 */
export function useShownRows({
  count,
  estimate,
  keyOf,
  keep = [],
}: {
  count: number;
  estimate: number;
  keyOf?: (index: number) => string;
  keep?: readonly number[];
}): ShownRows {
  const whole = count < WHOLE_UNDER || typeof window === "undefined" || typeof ResizeObserver !== "function";
  const [, drawAgain] = useReducer((n: number) => n + 1, 0);
  const [at, setAt] = useState<{ scroller: Scroller; margin: number; gap: number } | null>(null);
  const atNow = useRef(at);
  atNow.current = at;
  // The element the rows are drawn in, as React puts it in the page: a list drawn only once it has rows is found then.
  const [list, setList] = useState<Element | null>(null);
  const listNow = useRef(list);
  listNow.current = list;
  const held = () => inHeldList(listNow.current);
  const kept = useRef(keep);
  kept.current = keep;
  const changed = (sync: boolean) => (sync ? flushSync(drawAgain) : drawAgain());
  const told: Told = {
    count,
    estimateSize: () => estimate,
    getItemKey: keyOf ?? ((i) => i),
    overscan: OVERSCAN,
    scrollMargin: at?.margin ?? 0,
    initialRect: {
      width: 0,
      height: typeof window === "undefined" ? FIRST_SCREEN_PX : window.innerHeight || FIRST_SCREEN_PX,
    },
    rangeExtractor: (range: Range) => {
      const shown = defaultRangeExtractor(range);
      const more = kept.current.filter((i) => i >= 0 && i < range.count && !shown.includes(i));
      return more.length ? [...shown, ...more].sort((a, b) => a - b) : shown;
    },
  };
  // One virtualizer for the box the list scrolls in, made again only if that box changes (a phone turned past its width).
  const deck = useRef<{ scroller: Scroller; v: Deck } | null>(null);
  const scroller = whole ? null : (at?.scroller ?? null);
  const gap = at?.gap ?? 0;
  const says: ListSays = { held, gap };
  if (scroller && deck.current?.scroller !== scroller) {
    deck.current = {
      scroller,
      v:
        scroller instanceof Window
          ? new Virtualizer(windowOptions(scroller, told, changed, says))
          : new Virtualizer(boxOptions(scroller, told, changed, says)),
    };
  }
  const v = scroller ? (deck.current?.v ?? null) : null;
  if (v instanceof Virtualizer && scroller) {
    if (scroller instanceof Window)
      (v as Virtualizer<Window, Element>).setOptions(windowOptions(scroller, told, changed, says));
    else (v as Virtualizer<Element, Element>).setOptions(boxOptions(scroller, told, changed, says));
  }
  // Where the list scrolls and where it starts in it, found once it is in the page and again as the page around it moves
  // (a band above the list that comes or goes, the window's width).
  useLayoutEffect(() => {
    const el = list;
    if (whole || !el) return undefined;
    const find = () => {
      // Held, it stands where it was left and out of the page's flow: where it starts in its scroller is as it was.
      if (inHeldList(el)) return;
      const box = listScrollerOf(el);
      const margin = marginOf(el, box);
      const gap = Number.parseFloat(getComputedStyle(el).rowGap) || 0;
      setAt((was) =>
        was && was.scroller === box && Math.abs(was.margin - margin) < 1 && was.gap === gap
          ? was
          : { scroller: box, margin, gap },
      );
    };
    // Found already (a list shown again after it was kept hidden, people-route.tsx): the watcher below looks again once the
    // page is laid out, rather than asking every box above it for its style in the middle of the draw that shows it.
    const was = atNow.current;
    if (!was || !(was.scroller instanceof Window || was.scroller.contains(el))) find();
    const watch = new ResizeObserver(find);
    if (el.parentElement) watch.observe(el.parentElement);
    window.addEventListener("resize", find);
    return () => {
      watch.disconnect();
      window.removeEventListener("resize", find);
    };
  }, [whole, list]);
  useLayoutEffect(() => (v ? v._didMount() : undefined), [v]);
  useLayoutEffect(() => {
    if (v) v._willUpdate();
  });
  if (!v)
    return { parts: whole ? allRows(count) : firstParts(count, keep, estimate), listRef: setList, measure: NO_MEASURE };
  return { parts: partsDrawn(v, gap), listRef: setList, measure: v.measureElement };
}
