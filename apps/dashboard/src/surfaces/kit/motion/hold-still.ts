/**
 * A switch holds still (moved from legacy/components/data-bits.jsx, the one-system plan's step 2). A tab, a filter or a
 * fold changes what is drawn beside it, and on a phone the page moved under the thumb that pressed it: the person's History
 * tabs went 328px down the screen for Consent and 439px for Visits (23 Sep), because a shorter list made the page shorter and
 * the browser pulled the scroll back to fit. `holdStill(control, change)` runs the change, drawn at once, and keeps the
 * control where it was on the screen:
 * - where the page came out too short to stay where it stood, what scrolls is given the difference as room at its foot
 *   (padding, under everything on it, never between two things) and put back where it was. The room gives itself back as
 *   the page is scrolled up, never more than keeps what is on the screen where it is, and is gone once none is needed, so
 *   no blank stays at the foot;
 * - a control that moved anyway (what changed was above it: a list shrinking over its "Show fewer") is scrolled back to
 *   where it was.
 * A control the change took with it (Mark all read, a form's "Not right?") still has the page held where it stood. Where
 * nothing scrolls (on a phone the window does: mobile.css) the change just runs. One landing later is not held.
 */

/** The room a scroller was given, and the padding it had of its own: one per scroller, grown by each switch. */
interface Room {
  extra: number;
  own: number;
  inline: string;
  onScroll: () => void;
}

const holdScroller = (from: Element): HTMLElement | null => {
  for (
    let n = from && from.parentElement;
    n && n !== document.body && n !== document.documentElement;
    n = n.parentElement
  ) {
    const over = window.getComputedStyle ? window.getComputedStyle(n).overflowY : "visible";
    if ((over === "auto" || over === "scroll") && n.scrollHeight > n.clientHeight + 1) return n;
  }
  const page = document.scrollingElement as HTMLElement | null;
  return page && page.scrollHeight > page.clientHeight + 1 ? page : null;
};

const holdRooms = new WeakMap<HTMLElement, Room>();
const scrollTargetOf = (box: HTMLElement): HTMLElement | Window => (box === document.scrollingElement ? window : box);

const holdRoom = (box: HTMLElement, more: number) => {
  let room = holdRooms.get(box);
  if (!room) {
    const made: Room = {
      extra: 0,
      own: parseFloat(window.getComputedStyle(box).paddingBottom) || 0,
      inline: box.style.paddingBottom || "",
      onScroll: () => {},
    };
    const release = () => {
      box.style.paddingBottom = made.inline;
      scrollTargetOf(box).removeEventListener("scroll", made.onScroll);
      holdRooms.delete(box);
    };
    // Scrolled up, the page needs less of it: what keeps the screen where it is, and nothing once that is none.
    made.onScroll = () => {
      if (!box.isConnected) {
        release();
        return;
      }
      const need = Math.ceil(box.scrollTop + box.clientHeight - (box.scrollHeight - made.extra));
      if (need <= 0) {
        release();
        return;
      }
      if (need < made.extra) {
        made.extra = need;
        box.style.paddingBottom = `${made.own + need}px`;
      }
    };
    scrollTargetOf(box).addEventListener("scroll", made.onScroll, { passive: true });
    holdRooms.set(box, made);
    room = made;
  }
  room.extra += more;
  box.style.paddingBottom = `${room.own + room.extra}px`;
};

/** Run `change`, drawn at once, keeping `control` where it was on the screen (see the header). */
export const holdStill = (control: Element | null | undefined, change: () => void): void => {
  const run = () => {
    if (typeof change === "function") change();
  };
  if (!control || !control.isConnected || !control.getBoundingClientRect) {
    run();
    return;
  }
  const box = holdScroller(control);
  const was = control.getBoundingClientRect().top;
  const at = box ? box.scrollTop : 0;
  // Drawn now, so where the page and the control landed are read before anything is painted.
  const flush = window.ReactDOM && window.ReactDOM.flushSync;
  if (flush) flush(run);
  else run();
  if (!box) return;
  // Pulled back: the page came out shorter than where it stood. The difference goes under everything, and the page back.
  const pulled = Math.ceil(at - box.scrollTop);
  if (pulled >= 1) {
    holdRoom(box, pulled);
    box.scrollTop = at;
  }
  if (!control.isConnected) return;
  const moved = control.getBoundingClientRect().top - was;
  if (Math.abs(moved) >= 1) box.scrollTop += moved;
};
