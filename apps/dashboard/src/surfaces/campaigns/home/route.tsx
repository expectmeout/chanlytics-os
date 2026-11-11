/**
 * Campaigns as the route draws it: its views, Sequences (decision 0060) and Messages (D4: the Library is Messages, at
 * `campaigns/messages`, a message open in it at `campaigns/messages/<name>`, its home), and the toast every press under it
 * says its word in (route-toast.ts). A message pressed on Sequences opens over it, as one pressed anywhere does
 * (surfaces/see): its drawer over Sequences (`campaigns/message:<name>`) went, and lands on its home. The home that stood here went in S6: its address and a campaign's (`campaigns`,
 * `campaigns/in:<group>`, `campaigns/moment:<id>[:people]`) land on Sequences, or on the campaign's sequence, by the one
 * table of retired addresses (contracts retiredRouteOf): every edge moves them before the page is asked, and one that
 * reaches it some other way (a history entry from before) is replaced here. `campaigns/ads…` is the Ads view, where it is
 * drawn. The address is read from the path, never from the route params: a move between two of its addresses is
 * a change of the path alone (workspace.ts goToRoute), and the page follows it, one mount across them all.
 *
 * Sequences, Messages, Content and, where it is drawn, Ads are kept, as People's scopes are (people/people-route.tsx): each drawn from the first time it is
 * shown, or ahead of that, hidden, once the frame is idle on the other (useViewsAhead), and hidden under React's Activity
 * while the other is shown, so a press on the strip shows a view already drawn, its rows, its search and its place as they
 * were left. They were two pages: a switch put the old one away, drew nothing for 600 ms on a phone while the new one was
 * built, then drew it (the tabs review of 19 Oct 2026). Each view's root is the deck's (kit/motion/view-deck.ts), so the
 * view arriving comes in from its tab's side and the one leaving goes by a copy of itself.
 */
import { Activity, Suspense, lazy, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ADS_ROUTE,
  LIFECYCLE_WORDS,
  MESSAGES_ROUTE,
  SEQUENCES_ROUTE,
  isAdsParam,
  isContentParam,
  isMessagesParam,
  retiredRouteOf,
  routeOfPath,
} from "@chanlytics/contracts";
import { aheadWhenIdle } from "@/bridge/workspace";
import { viewDeck } from "../../kit/motion/view-deck";
import { refreshSurface, replaceRoute, useFrameToast } from "../../frame-verbs";
import type { CmView } from "../parts/split";
import { surfaceValue } from "../../surface-values";
import { useAdsShown } from "../ads/shown";
import { MessagePaneProvider, sequencesPageNow, useMessagesView } from "./campaigns-code";
import { CampaignsToast } from "./route-toast";

// The Ads view's code is its own chunk, fetched where Ads is drawn: once the frame is idle on another view, or at its press.
const adsCode = () => import("../ads/ads-page").then((m) => ({ default: m.AdsPage }));
const AdsPage = lazy(adsCode);
// The Content view's code, a chunk of its own, fetched where Content is drawn: once the frame is idle on another view, or at its press.
const contentCode = () => import("../content/page").then((m) => ({ default: m.ContentPage }));
const ContentPage = lazy(contentCode);

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

/** Campaigns' kept views, in the strip's order: Ads only where it is drawn (ads/shown.ts). */
type View = "sequences" | "messages" | "content" | "ads";
const VIEW_ORDER: readonly View[] = ["sequences", "messages", "content", "ads"];
/** The deck's one seat for Campaigns' views. */
const VIEW_SEAT = "campaigns-view";

/**
 * Which views are drawn (each kept from then), the address each was last at (hidden, Sequences keeps the record or list it
 * was left on, Messages the message), and the side the view shown comes in from: the view before it, on the draw that
 * changes it.
 */
function useKeptViews(view: View, route: string, ahead: boolean) {
  const drawn = useRef(new Set<View>());
  drawn.current.add(view);
  if (ahead) drawn.current.add(view === "sequences" ? "messages" : "sequences");
  const sequencesAt = useRef(SEQUENCES_ROUTE);
  if (view === "sequences") sequencesAt.current = route;
  const messagesAt = useRef(MESSAGES_ROUTE);
  if (view === "messages") messagesAt.current = route;
  const adsAt = useRef(ADS_ROUTE);
  if (view === "ads") adsAt.current = route;
  const before = useRef<View | null>(null);
  const was = before.current;
  useEffect(() => {
    before.current = view;
  });
  const slide: CmView["slide"] =
    was && was !== view ? (VIEW_ORDER.indexOf(view) > VIEW_ORDER.indexOf(was) ? "next" : "prev") : undefined;
  const seat = viewDeck.view(VIEW_SEAT);
  const viewOf = (v: View): CmView => ({ ref: seat, slide: v === view ? slide : undefined, shown: v === view });
  return {
    drawn: drawn.current,
    sequencesAt: sequencesAt.current,
    messagesAt: messagesAt.current,
    adsAt: adsAt.current,
    viewOf,
  };
}

/**
 * The other view, drawn ahead once the frame is idle on this one (true from then), where the frame may fetch with nobody
 * reaching (workspace.ts warmsOnItsOwn): its code fetched and, for Sequences, its list read, which only its own page reads
 * (onDemand), so the first press on the strip shows it drawn. React draws a hidden Activity at the lowest priority, behind
 * anything on screen.
 */
function useViewsAhead(view: View, adsShown: boolean): boolean {
  const [ahead, setAhead] = useState(false);
  useEffect(() => {
    if (ahead || typeof window === "undefined") return undefined;
    return aheadWhenIdle(() => {
      if (view !== "sequences" && surfaceValue("sequences") === undefined) void refreshSurface("sequences");
      // Ads' code, fetched and not drawn: its page reads its own example when it is first shown.
      if (adsShown && view !== "ads") void adsCode();
      // Content's code, fetched and not drawn: its read is its own, made when it is first shown.
      if (view !== "content") void contentCode();
      setAhead(true);
    });
  }, [ahead, view, adsShown]);
  return ahead;
}

/**
 * Which view an address is. `campaigns/content` is the Content view, and `campaigns/ads…` the Ads view where it is drawn
 * (ads/shown.ts): a workspace without it has no ads to read, so its Ads address is Sequences.
 */
function viewOf(param: string | null, adsShown: boolean): View {
  if (param && isAdsParam(param) && adsShown) return "ads";
  if (isContentParam(param)) return "content";
  return isMessagesParam(param) ? "messages" : "sequences";
}

export function CampaignsRoute() {
  const route = routeOfPath(usePathname()) ?? "campaigns";
  // The route's second word, as the shell reads its param (`campaigns/messages/welcome` names Messages).
  const param = route.split("/")[1] || null;
  // The mount's toast: a send made in New, which closes as it sends, says so here, with its Stop (route-toast.ts).
  const [toastNode, flash] = useFrameToast();
  const adsShown = useAdsShown();
  const landing = retiredRouteOf(route);
  const view = viewOf(param, adsShown);
  // Sequences is a chunk of its own (campaigns-code.tsx), most often fetched before the press: then the page is drawn at once,
  // and only a press that beat it waits under the Suspense below. Taken once for the mount, which follows every address.
  const [SequencesPage] = useState(sequencesPageNow);
  const ahead = useViewsAhead(view, adsShown);
  const kept = useKeptViews(view, landing ?? route, ahead);
  // Messages' code, a chunk of Campaigns' own: asked for once the view is drawn, shown or ahead.
  const Messages = useMessagesView(kept.drawn.has("messages"));
  useEffect(() => {
    if (landing) replaceRoute(landing);
  }, [landing]);
  return (
    <CampaignsToast value={flash}>
      {kept.drawn.has("sequences") ? (
        <Activity mode={view === "sequences" ? "visible" : "hidden"}>
          {/* The message's pane, handed down to the step editor (parts/message-pane.ts). */}
          <Suspense fallback={<ViewReading />}>
            <MessagePaneProvider>
              <SequencesPage route={kept.sequencesAt} view={kept.viewOf("sequences")} />
            </MessagePaneProvider>
          </Suspense>
        </Activity>
      ) : null}
      {kept.drawn.has("messages") ? (
        <Activity mode={view === "messages" ? "visible" : "hidden"}>
          {Messages ? <Messages view={kept.viewOf("messages")} route={kept.messagesAt} /> : <ViewReading />}
        </Activity>
      ) : null}
      {/* Content, a view kept beside the others on the same mount (decision 0125). */}
      {kept.drawn.has("content") ? (
        <Activity mode={view === "content" ? "visible" : "hidden"}>
          <Suspense fallback={<ViewReading />}>
            <ContentPage view={kept.viewOf("content")} />
          </Suspense>
        </Activity>
      ) : null}
      {/* Ads, a view kept beside the other two on the same mount (Ruben, 10 Nov 2026: it was a page of its own, so a press on
          its tab put Campaigns away, said Reading, and drew its head 7px lower than Messages'). */}
      {adsShown && kept.drawn.has("ads") ? (
        <Activity mode={view === "ads" ? "visible" : "hidden"}>
          <Suspense fallback={<ViewReading />}>
            <AdsPage param={kept.adsAt.split("/")[1] || "ads"} view={kept.viewOf("ads")} />
          </Suspense>
        </Activity>
      ) : null}
      {toastNode}
    </CampaignsToast>
  );
}
