/**
 * Whether Campaigns is on a phone: the kit's one breakpoint, under which the open thing is the screen and over which a pane
 * sits beside the list (parts/split.tsx). A module of its own and small, so the frame's route chunk can ask it (home/left-at.ts)
 * without the split's parts.
 */

const CM_PHONE_QUERY = "(max-width: 900px)";

/** The window's query for a phone's width; null with no window (a prerender) or no matchMedia. */
export const cmPhoneQuery = (): MediaQueryList | null =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(CM_PHONE_QUERY) : null;

/** Whether the window is a phone's now, read once: for work done before a page is drawn (content/warm.ts). */
export const cmPhoneNow = (): boolean => !!cmPhoneQuery()?.matches;
