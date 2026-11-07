/**
 * What the board's controls do that is more than a state change (moved from legacy/pages/calendar.jsx CalendarReal,
 * decision 0015): the calendar read now and what came of it said, and the swipe that walks the days. Each takes what it
 * acts on and returns the handler the page hands its control: plain functions the page calls, never hooks. The booking
 * link is copied in place by the kit's Menu (board-parts.tsx), and the hours and rules are a sheet.
 */
import type { useFrameToast } from "../frame-verbs";
import { surfaceValue } from "../surface-values";
import { OWN_TOUCH } from "../kit/view-tabs/own-touch";
import type { ViewPage } from "../kit/view-tabs/pager";
import { flushChange } from "./shell-verbs";
import { calendar } from "./verbs";

type Flash = ReturnType<typeof useFrameToast>[1];

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

/**
 * A swipe across the days walks them on a phone (kit/motion/swipe.ts touchSwipe, read as every page's swipe is: past a
 * third, or a flick): the step ‹ and › take, drawn at once, in place. Nothing follows the finger, settles back or comes in
 * from a side: every end of a move stepped the days a pixel on an iPhone (spec 2026-11-03, a still Calendar on a phone).
 * Never from what keeps its own touch: the strips' one list (the kit's OWN_TOUCH: a dialog, a sheet, a menu, a toast), but
 * for the pane itself (`el`), which says it keeps its own touch so the frame's strip of views does not walk under the
 * same finger.
 */
export function swipePagesOf(move: (n: number) => void) {
  return (el: Element, from: EventTarget | null): ViewPage | null => {
    const near = from as { closest?: (selector: string) => unknown } | null;
    const owner = near && near.closest ? near.closest(OWN_TOUCH) : null;
    return owner && owner !== el
      ? null
      : { prev: true, next: true, drag: stayPut, settle: stayPut, go: (step) => flushChange(() => move(step)) };
  };
}

/** What the days do under a finger: nothing. */
const stayPut = (): void => {};
