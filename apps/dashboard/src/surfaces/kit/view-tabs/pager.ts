/**
 * The strip under a thumb (docs/superpowers/specs/2026-09-25-swipe-between-tabs-design.md, and one motion for every
 * strip, 2026-10-08): what kit/motion/swipe.ts `touchSwipe` is handed for a page to walk. A swipe across the page walks the
 * strip drawn over it. The finger carries the page (the deck's view, kit/motion/view-deck.ts) and the strip's
 * highlight together; let go past the line, the tab beside the lit one is pressed, so a swipe is exactly a tap; short
 * of it, both settle back. `touchSwipe` stays the one reader of a touch: this only says what a page is.
 */
import { viewDeck } from "../motion/view-deck";
import { glideDrag, glideHome } from "./glide";
import { OWN_TOUCH } from "./own-touch";

/** A page to walk, as `touchSwipe` asks for one: whether there is one each side, and the finger's three words. */
export interface ViewPage {
  prev: boolean;
  next: boolean;
  /** The finger is `dx` across; `open` says the side it is going to has a page (else the drag is touchSwipe's give). */
  drag(dx: number, step: 1 | -1, open: boolean): void;
  /** Let go short of the line, or the touch was taken away. */
  settle(): void;
  /** Let go past the line, at `speed` pixels a millisecond: the page beside. */
  go(step: 1 | -1, speed: number): void;
}

/**
 * The page under the strip drawn over `view`, for a touch that began at `from`: null where the touch is another's,
 * where no strip is drawn, where a page takes the screen over (an open thread, a person's page: its strip is the list's,
 * drawn again under it only while a thumb carries it back to that list, kit/motion/held-list.ts), and where the page does
 * not travel its own width (a desk, where a finger carries nothing).
 */
export function viewPager(view: Element, from: EventTarget | null): ViewPage | null {
  const began = from as { closest?: (selector: string) => unknown } | null;
  if (began && began.closest && began.closest(OWN_TOUCH)) return null;
  if (view.querySelector?.("[data-takeover]")) return null;
  const strip = view.parentElement ? view.parentElement.querySelector<HTMLElement>(".stabs") : null;
  if (!strip || strip.getClientRects().length === 0) return null;
  const tabs = Array.from(strip.querySelectorAll<HTMLElement>(".stabs-tab"));
  const at = tabs.findIndex((tab) => tab.classList.contains("active"));
  const lit = tabs[at];
  if (!lit || !viewDeck.walks()) return null;
  let toward = lit;
  return {
    prev: at > 0,
    next: at < tabs.length - 1,
    drag: (dx, step, open) => {
      const gone = viewDeck.drag(dx);
      toward = (open ? tabs[at + step] : null) ?? lit;
      glideDrag(strip, lit, toward, toward === lit ? 0 : gone);
    },
    settle: () => glideHome(strip, lit, toward, viewDeck.settle()),
    go: (step, speed) => {
      viewDeck.letGo(speed);
      const beside = tabs[at + step];
      if (beside) beside.click();
    },
  };
}
