/**
 * Today as the App Router draws it (decision 0015, step 4): `today/page.tsx` and the catch-all's root both draw this,
 * and it draws the page. The address has nothing to say to the page (it reads its own surfaces, `useMoved`), and its
 * chrome (crumbs, the nav item, the top bar's act) is the surface's entry in `routes.ts`, not this module's. Where the
 * page stands is said to the head the frame draws in Glass (kit/head/frame-head.tsx).
 */
import { useTodayStanding } from "./pages/today-head";
import { DashboardA } from "./pages/today-page";

export function TodayRoute() {
  useTodayStanding();
  return <DashboardA />;
}
