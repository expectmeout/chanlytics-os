/**
 * The Setup card's code (pages/setup-card-body.tsx), a chunk of its own, and the wait Today's first draw has for it. Loaded
 * with the frame (override.ts imports it), not with Today's page: the frame opens its gate before the page's own chunk has
 * run, so a wait the page's module said came after the gate had opened, and the card still landed over the queue
 * (measured on a production build, 27 Oct 2026: the gate open at 707 ms, the queue drawn at 751, the wait said at 752, the
 * card at 793). Where Today is the page the tab opens on, its fetch starts here, as the frame loads; anywhere else the
 * card's own module asks for it as Today's page loads (pages/setup-card.tsx), as it did.
 */
import { codeOnce } from "@/lib/code-once";
import { firstDrawWaitsFor } from "@/legacy-bridge/surface-status";
import { routePartsOf } from "@/legacy-bridge/surface-registry";
import { routeOnScreen } from "@/legacy-bridge/workspace";

/** The card's code: asked for once; a fetch that failed is asked for again as the card draws. */
export const setupCardCode = codeOnce(() => import("./pages/setup-card-body"));

/** Whether the tab opened on Today; false where there is no page (a node test's stand-in window). */
function todayOnScreen(): boolean {
  if (typeof window === "undefined" || typeof window.location?.pathname !== "string") return false;
  return routePartsOf(routeOnScreen()).page === "today";
}

if (todayOnScreen())
  firstDrawWaitsFor(
    "today",
    setupCardCode().then(
      () => undefined,
      () => undefined,
    ),
  );
