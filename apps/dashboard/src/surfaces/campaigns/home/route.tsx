/**
 * Campaigns as the route draws it: Sequences (decision 0060), every address of it, and the sheets Campaigns opens over it
 * (sheets.tsx: the composer at `campaigns/new…`, a message at `campaigns/message:<name>`). The home that stood here went
 * in S6: its address and a campaign's (`campaigns`, `campaigns/in:<group>`, `campaigns/moment:<id>[:people]`) land on
 * Sequences, or on the campaign's sequence (contracts sequenceLandingOf), the address replaced so a link kept from before
 * opens what it names. `campaigns/ads…` is the Ads view, where it is drawn. The address is read from the path, never from
 * the route params: a move between two of its addresses is a change of the path alone (workspace.ts goToRoute), and the
 * page follows it, one mount across them all.
 */
import { Suspense, lazy, useEffect } from "react";
import { usePathname } from "next/navigation";
import { isAdsParam, routeOfPath, sequenceLandingOf } from "@chanlytics/contracts";
import { replaceRoute } from "../../legacy-verbs";
import { useAdsShown } from "../ads/shown";
import { MessagePaneProvider } from "./message-drawer";
import { CampaignsSheets } from "./sheets";

// The Ads view is a page of its own: its code is its own chunk, fetched only when an Ads address is opened where Ads is drawn.
const AdsPage = lazy(() => import("../ads/ads-page").then((m) => ({ default: m.AdsPage })));

// Sequences is its own chunk too, fetched as the page draws: the pages that share Campaigns' parts never carry it.
const SequencesPage = lazy(() => import("../sequences/sequences-page").then((m) => ({ default: m.SequencesPage })));

/** What stands where a view will be while its chunk loads: the page's own box, quiet, so the pane keeps its height. */
function ViewReading() {
  return <div className="cmh ads" aria-busy="true" />;
}

export function CampaignsRoute() {
  const route = routeOfPath(usePathname()) ?? "campaigns";
  // The route's second word, as the shell reads its param (`campaigns/new:to:list-1` names new:to:list-1).
  const param = route.split("/")[1] || null;
  const adsShown = useAdsShown();
  const landing = sequenceLandingOf(route);
  useEffect(() => {
    if (landing) replaceRoute(landing);
  }, [landing]);
  // `campaigns/ads…` is the Ads view, a page of its own on a mount of its own (routes.ts adsChrome), in a demo session or a
  // workspace whose Ads preview is on (ads/shown.ts) only: any other has no ads to read yet, so an Ads address is Sequences.
  if (param && isAdsParam(param) && adsShown) {
    return (
      <Suspense fallback={<ViewReading />}>
        <AdsPage param={param} />
      </Suspense>
    );
  }
  return (
    <>
      {/* The message's pane, which the message drawer holds, handed down to the step editor (parts/message-pane.ts). */}
      <Suspense fallback={<ViewReading />}>
        <MessagePaneProvider>
          <SequencesPage route={landing ?? route} />
        </MessagePaneProvider>
      </Suspense>
      <CampaignsSheets param={param} />
    </>
  );
}
