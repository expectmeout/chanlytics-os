/**
 * A change of tab holds the page still (canvas A): what the tab holds is what changes, so the head, the figures and the
 * strip stay where they stood on screen. Scrolled past the strip (it stands stuck under the top bar), the tab picked begins
 * right under it, or where this visit left it if it was read before, never at the depth the last tab was scrolled to; not
 * yet scrolled to the strip, the page holds where it is. A shorter tab never pulls the page up under the reader: the
 * tab's panes are at least the room under the stuck strip (`--tab-room` on the scroller, `.cl-prof-deck`'s least height,
 * clients.css), so the strip's place is always one the page can stand at. Measured, never guessed: the strip's own height
 * and where it sticks are the stylesheet's.
 *
 * Before (13 Oct 2026, Ruben: "going from history to about cause like a layout shift"): a phone's About took the figures
 * away above the strip, so the strip jumped about 200px up, and a tab shorter than the depth read clamped the scroll, so
 * the head and the figures dropped back into view as the tab before slid out.
 */
import { useCallback, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import type { PersonTab } from "@chanlytics/contracts";

/** Where the strip stands in the scroller: the scroll at which it sticks, and the scroll now. */
interface StripPlace {
  stickAt: number;
  top: number;
}

const px = (v: string) => Number.parseFloat(v) || 0;

/** The strip's stand and the tab's panes on screen (a still copy of the tab before is not them), or null on a thin record. */
function stripParts(scroller: HTMLElement): { stand: HTMLElement; deck: HTMLElement } | null {
  const stand = scroller.querySelector<HTMLElement>(".cl-prof-strip-stand");
  const deck = scroller.querySelector<HTMLElement>(".cl-prof-deck:not(.view-leaving)");
  return stand && deck ? { stand, deck } : null;
}

/** Where the strip sticks: the scroll at which the tab's panes begin right under it, stuck. */
function stripPlace(scroller: HTMLElement): StripPlace | null {
  const parts = stripParts(scroller);
  if (!parts) return null;
  const { stand, deck } = parts;
  const gap = px(getComputedStyle(deck.parentElement ?? deck).rowGap);
  const deckAt = deck.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  const stickAt = Math.max(0, deckAt - gap - stand.offsetHeight - px(getComputedStyle(stand).top));
  return { stickAt, top: scroller.scrollTop };
}

/**
 * The room under the stuck strip, said on the scroller as `--tab-room`: the scroller's height less where the strip sticks,
 * the strip, the gap under it and the page's foot. Called as the scroller's height changes (person-real.tsx useRailHeld).
 */
export function holdTabRoom(scroller: HTMLElement): void {
  const parts = stripParts(scroller);
  if (!parts) return;
  const { stand, deck } = parts;
  const page = scroller.firstElementChild;
  const foot = page ? px(getComputedStyle(page).paddingBottom) : 0;
  const gap = px(getComputedStyle(deck.parentElement ?? deck).rowGap);
  const room = scroller.clientHeight - px(getComputedStyle(stand).top) - stand.offsetHeight - gap - foot;
  scroller.style.setProperty("--tab-room", `${Math.max(0, Math.round(room))}px`);
}

/**
 * The page's scroll across a change of tab. Answers what the page calls as a tab is pressed, before it is drawn: it notes
 * where the reader was in the tab they leave. Once the tab picked is drawn, the scroller is put where it begins.
 */
export function useTabScroll(scroller: RefObject<HTMLElement | null>, tab: PersonTab): (from: PersonTab) => void {
  // How far past the strip each tab was read this visit; a tab read from its top is 0.
  const depths = useRef(new Map<PersonTab, number>());
  const leaving = useRef<{ stuck: boolean } | null>(null);
  useLayoutEffect(() => {
    const was = leaving.current;
    leaving.current = null;
    const el = scroller.current;
    if (!was || !was.stuck || !el) return;
    const place = stripPlace(el);
    if (place) el.scrollTop = place.stickAt + (depths.current.get(tab) ?? 0);
  }, [tab, scroller]);
  return useCallback(
    (from: PersonTab) => {
      const el = scroller.current;
      const place = el ? stripPlace(el) : null;
      if (!place) return;
      // At its place exactly, the strip stands stuck (a tab begun under it is read from there).
      const stuck = place.top >= place.stickAt - 1;
      depths.current.set(from, stuck ? Math.max(0, place.top - place.stickAt) : 0);
      leaving.current = { stuck };
    },
    [scroller],
  );
}
