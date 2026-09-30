/**
 * What the board's controls do that is more than a state change (moved from legacy/pages/calendar.jsx CalendarReal,
 * decision 0015): the booking link copied, the calendar read now and what came of it said, the hours and rules folded open, and
 * the swipe that walks the days. Each takes what it acts on and returns the handler the page hands its control: plain
 * functions the page calls, never hooks.
 */
import type { RefObject } from "react";
import type { useLegacyToast } from "../legacy-verbs";
import { surfaceValue } from "../surface-values";
import { flushChange, ownTouchSelector } from "./shell-verbs";
import { calendar } from "./verbs";

type Flash = ReturnType<typeof useLegacyToast>[1];

/** The booking link, copied: said once it is, or where it is when the browser would not. */
export function copyLinkAct(bookingLink: string | null, flash: Flash) {
  return async () => {
    try {
      await navigator.clipboard.writeText(bookingLink ?? "");
      flash({ msg: <>Booking link copied.</> });
    } catch {
      flash({ tone: "warn", msg: <>Could not copy — the link is {bookingLink}</> });
    }
  };
}

/**
 * The owner's Refresh (C2): the calendar itself, now, and what came of it, in the words the read found -- the board read
 * itself every five minutes and offered no way to ask sooner. One read at a time.
 */
export function refreshAct(p: { refreshing: boolean; setRefreshing: (on: boolean) => void; flash: Flash }) {
  const { refreshing, setRefreshing, flash } = p;
  return async () => {
    if (refreshing) return;
    setRefreshing(true);
    let landed: boolean;
    try {
      landed = await calendar.refresh({ fresh: true });
    } catch {
      landed = false;
    } finally {
      setRefreshing(false);
    }
    const f = surfaceValue("calendar")?.vm.feed ?? null;
    if (!landed || !f) {
      flash({ tone: "warn", msg: <>Couldn't reach Chanlytics — the board is as it was.</> });
      return;
    }
    if (f.state === "ok" && !f.stale) {
      flash({ msg: <>Read your calendar just now.</> });
      return;
    }
    const why = f.problem ? ` ${f.problem}` : "";
    flash({
      tone: "warn",
      msg:
        f.state === "ok" ? (
          <>Couldn't refresh your calendar — showing the last good read.{why}</>
        ) : (
          <>Still couldn't read your calendar.{why}</>
        ),
    });
  };
}

/** The hours and rules fold open (the page glides them into view) or away (the page glides up with them), never held still. */
export function aboutToggleAct(p: {
  aboutOpen: boolean;
  setAboutOpen: (open: boolean) => void;
  aboutRef: RefObject<HTMLDivElement | null>;
}) {
  const { aboutOpen, setAboutOpen, aboutRef } = p;
  return () => {
    const opening = !aboutOpen;
    flushChange(() => setAboutOpen(opening));
    const panel = aboutRef.current;
    if (!opening || !panel || !panel.scrollIntoView) return;
    const still = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    panel.scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" });
  };
}

/**
 * A swipe across the days walks them on a phone (data-bits touchSwipe, a page that stays): the step ‹ and › take, drawn at
 * once so the next days are what comes in. Never from what keeps its own touch: the strips' one list (surface-tabs.jsx
 * ST_OWN_TOUCH: a dialog, a sheet, a menu, a toast).
 */
export function swipePagesOf(move: (n: number) => void) {
  return (_el: Element, from: EventTarget | null) => {
    const own = ownTouchSelector();
    const near = from as { closest?: (selector: string) => unknown } | null;
    return near && near.closest && own && near.closest(own)
      ? null
      : { prev: true, next: true, stays: true, go: (step: number) => flushChange(() => move(step)) };
  };
}
