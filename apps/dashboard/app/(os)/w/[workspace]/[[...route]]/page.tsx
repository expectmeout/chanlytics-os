"use client";

import { usePathname } from "next/navigation";
import { routeOfPath } from "@chanlytics/contracts";
import { TodayRoute } from "@/surfaces/today/today-route";

/**
 * Every route of a workspace that has no page of its own yet: it draws nothing, and leaves the route to the frame's
 * legacy table (the layout above). A surface that moves to TSX takes its route off this page by having a `page.tsx`
 * of its own beside it, and its row leaves `pages/app-routes.jsx` in the same change (decision 0015).
 *
 * The one route it does draw is the workspace itself: `/w/<slug>` names no route, which is Today (`routeOfAddress`), so
 * the home is Today's page, as `/w/<slug>/today` is.
 */
export default function RoutePage() {
  return routeOfPath(usePathname()) === "" ? <TodayRoute /> : null;
}
