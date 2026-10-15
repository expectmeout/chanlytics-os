/**
 * Campaigns' home as the route draws it (decision 0015, step 7): what the address opens the page on. `campaigns` is the home,
 * `campaigns/moment:<id>` a playbook open in its drawer, `campaigns/new` (and `new:every`, `new:moment:<trigger>`,
 * `new:edit:<id>`) the composer (address.ts). The address is read from the path, never from the route params, because a move
 * from the home to a moment, or from one composer to the other, is a change of the path alone (workspace.ts goToRoute) and
 * the page follows it, one mount across them all.
 */
import { Suspense, lazy, useEffect } from "react";
import { usePathname } from "next/navigation";
import { isAdsParam, isSequencesParam, routeOfPath, sequenceLandingOf } from "@chanlytics/contracts";
import { replaceRoute } from "../../legacy-verbs";
import { useAdsShown } from "../ads/shown";
import { useSequencesShown } from "../sequences/shown";
import { CampaignsHome } from "./home-page";

// The Ads view is a page of its own: its code is its own chunk, fetched only when an Ads address is opened where Ads is drawn.
const AdsPage = lazy(() => import("../ads/ads-page").then((m) => ({ default: m.AdsPage })));

// The Sequences view (decision 0060) is a page of its own too, behind its preview: its own chunk, with its stylesheet.
const SequencesPage = lazy(() => import("../sequences/sequences-page").then((m) => ({ default: m.SequencesPage })));

/** What stands where the Ads page will be while its chunk loads: the page's own box, quiet, so the pane keeps its height. */
function AdsReading() {
  return <div className="cmh ads" aria-busy="true" />;
}

export function CampaignsRoute() {
  const route = routeOfPath(usePathname()) ?? "campaigns";
  // The route's second word, as the shell reads its param (`campaigns/moment:pb-1/x` names moment:pb-1).
  const param = route.split("/")[1] || null;
  const adsShown = useAdsShown();
  const sequencesShown = useSequencesShown();
  // Where the preview is on, the home and a campaign's drawer land on Sequences (contracts sequenceLandingOf), the address
  // replaced, so a link kept from before (a bell row, Activity, a mail) opens what it names.
  const landing = sequencesShown ? sequenceLandingOf(route) : null;
  useEffect(() => {
    if (landing) replaceRoute(landing);
  }, [landing]);
  // `campaigns/sequences…` is the Sequences view, in a workspace whose preview is on (sequences/shown.ts) only: anywhere
  // else it is the home.
  if ((isSequencesParam(param) || landing) && sequencesShown) {
    return (
      <Suspense fallback={<AdsReading />}>
        <SequencesPage route={landing ?? route} />
      </Suspense>
    );
  }
  // `campaigns/ads…` is the Ads view, a page of its own on a mount of its own (routes.ts adsChrome), in a demo session or a
  // workspace whose Ads preview is on (ads/shown.ts) only: any other has no ads to read yet, so an Ads address is the home.
  if (param && isAdsParam(param) && adsShown) {
    return (
      <Suspense fallback={<AdsReading />}>
        <AdsPage param={param} />
      </Suspense>
    );
  }
  return <CampaignsHome param={param} />;
}
