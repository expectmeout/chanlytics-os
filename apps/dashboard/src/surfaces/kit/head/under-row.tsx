/**
 * A list's own rows over its rows (Inbox's Needs you, Waiting, Handled and its search; People's Everyone, search, Select,
 * Sort and Export), drawn on a phone in the frame's top under its row of views (`.pg-under-slot`, frame/shell-chrome.tsx),
 * where they hold still as the window scrolls the rows under them, as the name, the views and the coral act do (Ruben,
 * 25 Nov 2026: "it should not be draggable up or down should be static outside of the motion ux we have for the table
 * rows so that it is always visible like the menu and coral button"). The Calendar's bar stands there the same way
 * (kit/head/standing.ts `under`): stuck in the page instead, it stepped a pixel or two under the thumb as the window scrolled.
 *
 * A portal, not the head's `under`: the rows stay in their list's tree, with its state, its refs and its context, and go
 * with it. In the page's own flow where the frame's top is no box of its own (a desk: display: contents), and while the
 * page says it stands down (`away`: a thread or a person that takes the screen over, under which the list is held).
 */
import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** The frame's place under its row of views (frame/shell-chrome.tsx glassHead `pg-under`). */
const UNDER_PLACE = "pg-under";

/** The frame's place under its views, where the frame's top is a box of its own (a phone's); null elsewhere. */
function underPlaceNow(on: boolean): HTMLElement | null {
  const found = on ? document.getElementById(UNDER_PLACE) : null;
  const top = found?.closest<HTMLElement>(".frame-top") ?? null;
  return found && top && getComputedStyle(top).display !== "contents" ? found : null;
}

/** Whether the page has been drawn in the browser once: from then a draw may look for the frame's place as it draws. */
let pageUp = false;

/**
 * The frame's place under its views, where the frame's top is a box of its own (a phone's); null elsewhere or while away.
 * Asked on every draw (a lookup and one style read): the frame draws its top again as the route lands, and a phone turned to
 * a desk's width makes it no box, so a place found once may have left the document or stopped being one.
 *
 * Found in the draw itself once the page is up, so the rows move into the frame's top in the draw that brings their list
 * back: found a draw later, the list came back under a top measured without them (kit/motion/held-list.ts measures it as
 * it puts the list back), and stood a frame 44 px too high under it before the top's height caught up (Back from a
 * conversation, 25 Nov 2026). The first draw, which the prerendered page is matched against, draws them in the list.
 */
function useUnderPlace(on: boolean): HTMLElement | null {
  const [place, setPlace] = useState<HTMLElement | null>(null);
  const now = pageUp ? underPlaceNow(on) : place;
  // The first draw's place, found once it is in the document; every draw after looks for itself (`now`).
  useLayoutEffect(() => {
    pageUp = true;
    const found = underPlaceNow(on);
    setPlace((had) => (had === found ? had : found));
  }, [on]);
  return now;
}

export function UnderRow({
  children,
  away = false,
  className,
}: {
  children: ReactNode;
  /** The page stands down: a page over it takes the screen, or the rows have no row of their own here (a desk's line). */
  away?: boolean;
  /** The rows' own name in the frame's top, for their layout there. */
  className: string;
}) {
  const place = useUnderPlace(!away);
  if (!place) return <>{children}</>;
  return createPortal(
    <div className={`under-row ${className}`} data-testid="under-row">
      {children}
    </div>,
    place,
  );
}
