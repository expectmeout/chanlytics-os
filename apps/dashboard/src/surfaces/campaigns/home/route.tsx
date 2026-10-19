/**
 * Campaigns as the route draws it: its two views, Sequences (decision 0060) and Messages (D4: the Library is Messages, at
 * `campaigns/messages`), the sheet Campaigns opens over them (sheets.tsx: a message at `campaigns/message:<name>`), and the
 * toast every press under it says its word in (route-toast.ts). The home that stood here went in S6: its address and a campaign's (`campaigns`,
 * `campaigns/in:<group>`, `campaigns/moment:<id>[:people]`) land on Sequences, or on the campaign's sequence, by the one
 * table of retired addresses (contracts retiredRouteOf): every edge moves them before the page is asked, and one that
 * reaches it some other way (a history entry from before) is replaced here. `campaigns/ads…` is the Ads view, where it is
 * drawn. The address is read from the path, never from the route params: a move between two of its addresses is
 * a change of the path alone (workspace.ts goToRoute), and the page follows it, one mount across them all.
 *
 * Sequences and Messages are kept, as People's scopes are (people/people-route.tsx): each drawn from the first time it is
 * shown, or ahead of that, hidden, once the frame is idle on the other (useViewsAhead), and hidden under React's Activity
 * while the other is shown, so a press on the strip shows a view already drawn, its rows, its search and its place as they
 * were left. They were two pages: a switch put the old one away, drew nothing for 600 ms on a phone while the new one was
 * built, then drew it (the tabs review of 19 Oct 2026). Each view's root is the deck's (kit/motion/view-deck.ts), so the
 * view arriving comes in from its tab's side and the one leaving goes by a copy of itself.
 */
import { Activity, Suspense, lazy, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  LIFECYCLE_WORDS,
  SEQUENCES_ROUTE,
  isAdsParam,
  isMessagesParam,
  retiredRouteOf,
  routeOfPath,
} from "@chanlytics/contracts";
import { warmsOnItsOwn } from "@/legacy-bridge/workspace";
import { viewDeck } from "../../kit/motion/view-deck";
import { refreshSurface, replaceRoute, useLegacyToast } from "../../legacy-verbs";
import type { CmView } from "../parts/split";
import { surfaceValue } from "../../surface-values";
import { useAdsShown } from "../ads/shown";
import { MessagePaneProvider, sequencesPageNow, useMessagesView } from "./campaigns-code";
import { CampaignsToast } from "./route-toast";
import { CampaignsSheets } from "./sheets";

// The Ads view is a page of its own: its code is its own chunk, fetched only when an Ads address is opened where Ads is drawn.
const AdsPage = lazy(() => import("../ads/ads-page").then((m) => ({ default: m.AdsPage })));

/** What stands where a view will be while its chunk loads: the page's own box, and the shell's quiet words after their beat. */
function ViewReading() {
  return (
    <div className="cmh ads" aria-busy="true">
      <div className="route-reading" role="status">
        {LIFECYCLE_WORDS.reading}
      </div>
    </div>
  );
}

/** Campaigns' two kept views, in the strip's order. */
type View = "sequences" | "messages";
const VIEW_ORDER: readonly View[] = ["sequences", "messages"];
/** The deck's one seat for Campaigns' views. */
const VIEW_SEAT = "campaigns-view";

/**
 * Which views are drawn (each kept from then), the address Sequences was last at (hidden, it keeps the record or list it
 * was left on), and the side the view shown comes in from: the view before it, on the draw that changes it.
 */
function useKeptViews(view: View, route: string, ahead: boolean) {
  const drawn = useRef(new Set<View>());
  drawn.current.add(view);
  if (ahead) drawn.current.add(view === "sequences" ? "messages" : "sequences");
  const sequencesAt = useRef(SEQUENCES_ROUTE);
  if (view === "sequences") sequencesAt.current = route;
  const before = useRef<View | null>(null);
  const was = before.current;
  useEffect(() => {
    before.current = view;
  });
  const slide: CmView["slide"] =
    was && was !== view ? (VIEW_ORDER.indexOf(view) > VIEW_ORDER.indexOf(was) ? "next" : "prev") : undefined;
  const seat = viewDeck.view(VIEW_SEAT);
  const viewOf = (v: View): CmView => ({ ref: seat, slide: v === view ? slide : undefined, shown: v === view });
  return { drawn: drawn.current, sequencesAt: sequencesAt.current, viewOf };
}

/** How long an idle frame on one view may wait before the other is drawn ahead, hidden. */
const AHEAD_IDLE_MS = 3000;

/**
 * The other view, drawn ahead once the frame is idle on this one (true from then), where the frame may fetch with nobody
 * reaching (workspace.ts warmsOnItsOwn): its code fetched and, for Sequences, its list read, which only its own page reads
 * (onDemand), so the first press on the strip shows it drawn. React draws a hidden Activity at the lowest priority, behind
 * anything on screen.
 */
function useViewsAhead(view: View): boolean {
  const [ahead, setAhead] = useState(false);
  useEffect(() => {
    if (ahead || typeof window === "undefined" || !warmsOnItsOwn()) return undefined;
    const go = () => {
      if (view === "messages" && surfaceValue("sequences") === undefined) void refreshSurface("sequences");
      setAhead(true);
    };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(go, { timeout: AHEAD_IDLE_MS });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(go, AHEAD_IDLE_MS);
    return () => window.clearTimeout(id);
  }, [ahead, view]);
  return ahead;
}

export function CampaignsRoute() {
  const route = routeOfPath(usePathname()) ?? "campaigns";
  // The route's second word, as the shell reads its param (`campaigns/message:welcome` names message:welcome).
  const param = route.split("/")[1] || null;
  // The mount's toast: a send made in New, which closes as it sends, says so here, with its Stop (route-toast.ts).
  const [toastNode, flash] = useLegacyToast();
  const adsShown = useAdsShown();
  const landing = retiredRouteOf(route);
  const view: View = isMessagesParam(param) ? "messages" : "sequences";
  // Sequences is a chunk of its own (campaigns-code.tsx), most often fetched before the press: then the page is drawn at once,
  // and only a press that beat it waits under the Suspense below. Taken once for the mount, which follows every address.
  const [SequencesPage] = useState(sequencesPageNow);
  const ahead = useViewsAhead(view);
  const kept = useKeptViews(view, landing ?? route, ahead);
  // Messages' code, a chunk of Campaigns' own: asked for once the view is drawn, shown or ahead.
  const Messages = useMessagesView(kept.drawn.has("messages"));
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
    <CampaignsToast value={flash}>
      {kept.drawn.has("sequences") ? (
        <Activity mode={view === "sequences" ? "visible" : "hidden"}>
          {/* The message's pane, which the message drawer holds, handed down to the step editor (parts/message-pane.ts). */}
          <Suspense fallback={<ViewReading />}>
            <MessagePaneProvider>
              <SequencesPage route={kept.sequencesAt} view={kept.viewOf("sequences")} />
            </MessagePaneProvider>
          </Suspense>
        </Activity>
      ) : null}
      {kept.drawn.has("messages") ? (
        <Activity mode={view === "messages" ? "visible" : "hidden"}>
          {Messages ? <Messages view={kept.viewOf("messages")} /> : <ViewReading />}
        </Activity>
      ) : null}
      <CampaignsSheets param={param} flash={flash} />
      {toastNode}
    </CampaignsToast>
  );
}
