/**
 * Whether the kit's sheet rises from the bottom edge: the window under the kit's one breakpoint (kit.css, 900px, as
 * frame-verbs' onAPhone asks it), kept current as the window changes size. A page whose sheet takes another shape on a
 * phone reads it: New conversation's first step is a phone's small job there (`shape="job"`), as New proposal's is, and
 * a pane beside the page on a desk. Before the window is read (a server) it is a desk's.
 */
import { useSyncExternalStore } from "react";
import { onAPhone } from "../../frame-verbs";

/** The kit's one breakpoint, the width onAPhone asks about. */
const KIT_PHONE_QUERY = "(max-width: 900px)";

/** Hears the window cross the kit's width; a window that cannot say (no matchMedia) is never heard. */
function watchWidth(onChange: () => void): () => void {
  const list = typeof window.matchMedia === "function" ? window.matchMedia(KIT_PHONE_QUERY) : null;
  list?.addEventListener?.("change", onChange);
  return () => list?.removeEventListener?.("change", onChange);
}

/** What a server draws: a desk's. */
const onADesk = (): boolean => false;

/** Whether the kit's sheet is a phone's now, drawn again as the window crosses the width. */
export const useOnAPhone = (): boolean => useSyncExternalStore(watchWidth, onAPhone, onADesk);
