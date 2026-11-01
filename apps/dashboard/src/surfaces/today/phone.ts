/**
 * Whether Today is drawn as a phone's: under tokens.css `--bp-phone` (720px), the width its phone block in
 * dashboard-a-v2.css takes (the phone canvas, 28 Oct 2026). The head, the order of the page, the walk through Need you
 * and the day card read this one answer, kept current as the window changes size. The frame's own head turns at the
 * kit's 900px (kit/head/frame-head.tsx), and is left to it.
 */
import { useSyncExternalStore } from "react";

const TODAY_PHONE_QUERY = "(max-width: 720px)";

/** The query's list, asked for once: the store's snapshot reads it on every draw. */
let phoneList: MediaQueryList | null | undefined;
const phoneQuery = (): MediaQueryList | null => {
  if (phoneList === undefined)
    phoneList =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia(TODAY_PHONE_QUERY)
        : null;
  return phoneList;
};

const watchPhone = (fn: () => void): (() => void) => {
  const q = phoneQuery();
  q?.addEventListener?.("change", fn);
  return () => q?.removeEventListener?.("change", fn);
};

/** Whether Today is a phone's now: the store's snapshot. */
const todayOnPhone = (): boolean => !!phoneQuery()?.matches;

/** Whether Today is a phone's, drawn again when the window crosses the width. */
export const useTodayOnPhone = (): boolean => useSyncExternalStore(watchPhone, todayOnPhone, () => false);
