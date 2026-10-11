/**
 * Campaigns' home as the route draws it (decision 0015, step 7): what the address opens the page on. `campaigns` is the home,
 * `campaigns/moment:<id>` a playbook open in its drawer, `campaigns/new` (and `new:every`, `new:moment:<trigger>`,
 * `new:edit:<id>`) the composer (address.ts). The address is read from the path, never from the route params, because a move
 * from the home to a moment, or from one composer to the other, is a change of the path alone (workspace.ts goToRoute) and
 * the page follows it, one mount across them all.
 */
import { Suspense, lazy } from "react";
import { usePathname } from "next/navigation";
import { isAdsParam, routeOfPath } from "@chanlytics/contracts";
import { demoSession } from "../../legacy-verbs";
import { CampaignsHome } from "./home-page";

// The Ads view is a page of its own: its code is its own chunk, fetched only when an Ads address is opened in a demo session.
const AdsPage = lazy(() => import("../ads/ads-page").then((m) => ({ default: m.AdsPage })));

/** What stands where the Ads page will be while its chunk loads: the page's own box, quiet, so the pane keeps its height. */
function AdsReading() {
  return <div className="cmh ads" aria-busy="true" />;
}

export function CampaignsRoute() {
  const route = routeOfPath(usePathname()) ?? "campaigns";
  // The route's second word, as the shell reads its param (`campaigns/moment:pb-1/x` names moment:pb-1).
  const param = route.split("/")[1] || null;
  // `campaigns/ads…` is the Ads view, a page of its own on a mount of its own (routes.ts adsChrome), in a demo session only:
  // a real workspace has no ads to read yet, so an Ads address is the home.
  if (param && isAdsParam(param) && demoSession()) {
    return (
      <Suspense fallback={<AdsReading />}>
        <AdsPage param={param} />
      </Suspense>
    );
  }
  return <CampaignsHome param={param} />;
}
