/**
 * Which side a view arrives from, for a page that holds its own views (Reports' lenses, Settings' sections): the view
 * is an element the page keys by `id`, and it wears the answer as `data-slide`, which is how the deck knows to bring
 * it in (view-deck.ts). The frame says the same of its own strips (legacy/pages/app-shell.jsx useViewFade).
 *
 * Decided as the view changes, in the draw that mounts it, and kept for that view's life: the page draws again while
 * the view stands (a save, a read landing), and an answer that changed then would be read as a second arrival.
 */
import { useRef } from "react";

type Slide = "next" | "prev";

/** The side `id` arrives from, by where it and the view before it stand in `order`; none for the first view drawn, or one off the strip. */
export function useSlide(order: readonly string[], id: string): Slide | undefined {
  const seen = useRef<{ id: string | null; slide: Slide | undefined }>({ id: null, slide: undefined });
  if (seen.current.id !== id) {
    const was = seen.current.id === null ? -1 : order.indexOf(seen.current.id);
    const at = order.indexOf(id);
    seen.current = { id, slide: was < 0 || at < 0 || was === at ? undefined : at > was ? "next" : "prev" };
  }
  return seen.current.slide;
}
