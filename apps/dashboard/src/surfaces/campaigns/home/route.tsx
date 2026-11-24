/**
 * Campaigns as the route draws it: its views, Sequences (decision 0060), Content and, where it is drawn, Ads, and the toast
 * every press under it says its word in (route-toast.ts). Messages, which was a view beside Sequences (D4: the Library),
 * folded into Campaigns (Campaigns, one tab, 17 Nov 2026): every message is inside the campaign that sends it, or at the
 * list's foot, and opens over the page it is pressed on (surfaces/see); its list's address lands on Sequences, and a
 * message's own (`campaigns/messages/<name>`) opens the message over Sequences' list. The home that stood here went in S6: its address and a campaign's (`campaigns`,
 * `campaigns/in:<group>`, `campaigns/moment:<id>[:people]`) land on Sequences, or on the campaign's sequence, by the one
 * table of retired addresses (contracts retiredRouteOf): every edge moves them before the page is asked, and one that
 * reaches it some other way (a history entry from before) is replaced here. `campaigns/ads…` is the Ads view, where it is
 * drawn: kept apart, with its own code and reads, and shown as the last of Content's Made views, so the strip lights Content
 * and the deck moves nothing between the two (Campaigns in three tabs, 23 Nov 2026); where Ads is not drawn it is Content.
 * The address is read from the path, never from the route params: a move between two of its addresses is a change of the
 * path alone (workspace.ts goToRoute), and the page follows it, one mount across them all.
 *
 * Sequences, Content and, where it is drawn, Ads are kept, as People's scopes are (people/people-route.tsx): each drawn from the first time it is
 * shown, or ahead of that, hidden, once the frame is idle on any other (useViewsAhead), and hidden under React's Activity
 * while another is shown, so a press on the strip, or a swipe to it, shows a view already drawn, its rows, its search and
 * its place as they were left, and nothing of it lands after the slide. They were two pages: a switch put the old one away,
 * drew nothing for 600 ms on a phone while the new one was built, then drew it (the tabs review of 19 Oct 2026); and
 * Messages was drawn ahead from Sequences alone, so a swipe to it from Content cut to "Reading…" and then to the page,
 * each popping in where the other views slid (the phone review, 17 Nov 2026). Each view's root is the deck's
 * (kit/motion/view-deck.ts), so the view arriving comes in from its tab's side and the one leaving goes by a copy of
 * itself; a view not drawn yet when its tab is pressed comes in the same way, by the box that says it is reading
 * (ViewReading), which the page takes over as it lands.
 */
import { Activity, Suspense, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ADS_ROUTE,
  CONTENT_ROUTE,
  FORMS_ROUTE,
  LIFECYCLE_WORDS,
  SEQUENCES_ROUTE,
  isAdsParam,
  isContentParam,
  isFormsParam,
  messageOfRoute,
  retiredRouteOf,
  routeOfPath,
} from "@chanlytics/contracts";
import { aheadWhenIdle } from "@/bridge/workspace";
import { useHeadHeld } from "../../kit/head/standing";
import { viewDeck } from "../../kit/motion/view-deck";
import { refreshSurface, replaceRoute, useFrameToast } from "../../frame-verbs";
import type { CmView } from "../parts/split";
import { surfaceValue } from "../../surface-values";
import { waitForAdsFirstRead } from "../ads/first-read";
import { useAdsShown } from "../ads/shown";
import { useWhatsAppListAsked } from "../parts/whatsapp-list";
import { noteContentLeft } from "./left-at";
import { openSeeOver } from "../../see/see-over";
// Each view's code is a chunk of its own (campaigns-code.tsx), fetched where the view is drawn: once the frame is idle on another
// view, at its press, or beside the frame's own where a load opens on it (opening.ts), its first draw held for it.
import {
  MessagePaneProvider,
  adsCode,
  adsPageNow,
  contentCode,
  contentPageNow,
  formsPageNow,
  sequencesPageNow,
} from "./campaigns-code";
import { CampaignsToast } from "./route-toast";

// Content readied ahead (content/warm.ts): its page read in, and its first screen's pictures asked for, from the page's chunk.
const contentWarm = () => import("../content/warm").then((m) => m.warmContent());

/**
 * What stands where a view will be while its code is out: the page's own root, with the shell's quiet words after their
 * beat. It is the view the deck moves, on the view's seat and from its side (`view`), so a view pressed before it was drawn
 * ahead still comes in from its tab's side as one that was, and the page, swapped in where it stood, takes its arrival over
 * (kit/motion/view-deck.ts arrive). It stood on no seat: the view leaving was hidden at once, the box popped in, and the
 * page popped in after it (the phone review, 17 Nov 2026).
 */
function ViewReading({ view }: { view: CmView }) {
  return (
    <div
      ref={view.ref}
      data-slide={view.slide}
      className="cm-split"
      aria-busy="true"
      data-testid="campaigns-view-reading"
    >
      <div className="route-reading" role="status">
        {LIFECYCLE_WORDS.reading}
      </div>
    </div>
  );
}

/** An Ads address where Ads is not drawn opens Content's Made, and its draw is said for the page the address is (PRIMARY_PART). */
const ADS_SHOWN_AS_MADE: { page: string; part: string } = { page: "ads", part: "page" };

/**
 * Campaigns' kept views, each at its place on the strip: Ads, only where it is drawn (ads/shown.ts), at Content's, since it is
 * the last of Made's views (Campaigns in three tabs), so a move between the two slides nothing.
 */
type View = "sequences" | "content" | "ads" | "forms";
const STRIP_PLACE: Readonly<Record<View, number>> = { sequences: 0, content: 1, ads: 1, forms: 2 };
/** The deck's one seat for Campaigns' views. */
const VIEW_SEAT = "campaigns-view";

/**
 * Which views are drawn (each kept from then), the address each was last at (hidden, Sequences keeps the record or list it
 * was left on), and the side the view shown comes in from: the view before it, on the draw that
 * changes it.
 */
function useKeptViews(view: View, route: string, ahead: { others: boolean; content: boolean }) {
  const drawn = useRef(new Set<View>());
  drawn.current.add(view);
  // Sequences, drawn hidden once the frame is idle on any view (useViewsAhead).
  if (ahead.others) drawn.current.add("sequences");
  // Content, once its code and its read are in (useViewsAhead): drawn hidden, so its press shows it whole.
  if (ahead.content) drawn.current.add("content");
  const sequencesAt = useRef(SEQUENCES_ROUTE);
  if (view === "sequences") sequencesAt.current = route;
  const adsAt = useRef(ADS_ROUTE);
  if (view === "ads") adsAt.current = route;
  // Content keeps the piece left open, and the view of Made, as Sequences keeps its record.
  const contentAt = useRef(CONTENT_ROUTE);
  if (view === "content") contentAt.current = route;
  // Forms keeps the form left open, and the part of its sheet.
  const formsAt = useRef(FORMS_ROUTE);
  if (view === "forms") formsAt.current = route;
  const before = useRef<View | null>(null);
  const was = before.current;
  useEffect(() => {
    before.current = view;
  });
  const slide: CmView["slide"] =
    was && STRIP_PLACE[was] !== STRIP_PLACE[view]
      ? STRIP_PLACE[view] > STRIP_PLACE[was]
        ? "next"
        : "prev"
      : undefined;
  const seat = viewDeck.view(VIEW_SEAT);
  const viewOf = (v: View): CmView => ({ ref: seat, slide: v === view ? slide : undefined, shown: v === view });
  return {
    drawn: drawn.current,
    sequencesAt: sequencesAt.current,
    adsAt: adsAt.current,
    contentAt: contentAt.current,
    formsAt: formsAt.current,
    viewOf,
  };
}

/**
 * The reads a view drawn hidden draws from, made where they are not held, so it is drawn with its rows and nothing of it
 * lands after the slide that shows it: Sequences' list, which only its own page reads (onDemand), and the playbooks read,
 * the business's channels a running campaign's Waiting is said from and the month's emails on Campaigns' head (Campaigns,
 * one tab: they were the Messages list's), which is kept until it is asked for (surface-registry keepUntilDrawn).
 */
function readKeptViews(view: View): void {
  if (view !== "sequences" && surfaceValue("sequences") === undefined) void refreshSurface("sequences");
  if (surfaceValue("playbooks") === undefined) void refreshSurface("playbooks");
}

/**
 * The other views, drawn ahead once the frame is idle on this one (`others`, true from then), where the frame may fetch with
 * nobody reaching (workspace.ts warmsOnItsOwn): their code fetched and each one's own read made (readKeptViews), so the
 * first press on the strip, or a swipe to it, shows a view drawn whole. React draws a hidden Activity at the lowest
 * priority, behind anything on screen.
 *
 * On Ads it waits for the page's own first read as well (ads/first-read.ts): that read is the page's, made once its code is
 * in and not by the boot, so an idle frame with the boot in is not yet a page whose reads are. Nothing held Sequences' list,
 * or Sequences drawn hidden, behind it: which went first was left to how long each took.
 *
 * Content is readied the same way from any other view: its code and its page read, its first screen's pictures asked for behind
 * them (content/warm.ts), and once its read is in it is drawn hidden too (`content`). It was the one view a press built from
 * nothing: "Reading…", then its tiles, then each picture fading in, where Sequences was simply there (Ruben, 12
 * Nov 2026); and drawn hidden only once its pictures had come, it was still that, a swipe soon after landing (17 Nov 2026).
 */
function useViewsAhead(view: View, adsShown: boolean): { others: boolean; content: boolean } {
  const [ahead, setAhead] = useState(false);
  const [contentReady, setContentReady] = useState(false);
  useEffect(() => {
    if (ahead || typeof window === "undefined") return undefined;
    let live = true;
    let stop: (() => void) | null = null;
    const start = () => {
      if (!live) return;
      stop = aheadWhenIdle(() => {
        readKeptViews(view);
        // Ads' code, fetched and not drawn: its page reads its own example when it is first shown.
        if (adsShown && view !== "ads") adsCode.warm();
        if (view !== "content") {
          contentCode.warm();
          // Drawn hidden once it holds what it shows; one that could not be readied is drawn as it is pressed, as before.
          void contentWarm().then(
            () => setContentReady(true),
            () => undefined,
          );
        }
        setAhead(true);
      });
    };
    if (view === "ads") void waitForAdsFirstRead().then(start);
    else start();
    return () => {
      live = false;
      stop?.();
    };
  }, [ahead, view, adsShown]);
  return { others: ahead, content: contentReady };
}

/**
 * Which view an address is. `campaigns/content` is the Content view, and `campaigns/ads…` the Ads view where it is drawn
 * (ads/shown.ts): a workspace without it has no ads to read, so its Ads address opens Content's Made, where Ads would be.
 */
function viewOf(param: string | null, adsShown: boolean): View {
  if (param && isAdsParam(param)) return adsShown ? "ads" : "content";
  if (isContentParam(param)) return "content";
  if (isFormsParam(param)) return "forms";
  // Messages folded into Campaigns (Campaigns, one tab, 17 Nov 2026): its addresses are Sequences', a message's opening
  // the message over the list (useMessageOpensOverTheList).
  return "sequences";
}

/**
 * A message's own address (contracts messageRoute) opens the message over Campaigns' list, the one sheet a message is
 * (Campaigns, one tab, call C8): Messages, where it opened, is no view of Campaigns any more. The address is replaced by
 * the list's, and once the list is the page the message is opened over it (see-over.ts), one entry, so Back closes it.
 */
function useMessageOpensOverTheList(route: string): void {
  const message = messageOfRoute(route);
  const pending = useRef<string | null>(null);
  useEffect(() => {
    if (!message) return;
    pending.current = message;
    replaceRoute(SEQUENCES_ROUTE);
  }, [message]);
  useEffect(() => {
    const name = pending.current;
    if (!name || route !== SEQUENCES_ROUTE) return;
    pending.current = null;
    openSeeOver({ kind: "message", name });
  }, [route]);
}

export function CampaignsRoute() {
  const route = routeOfPath(usePathname()) ?? "campaigns";
  // The route's second word, as the shell reads its param (`campaigns/content` names Content).
  const param = route.split("/")[1] || null;
  // The mount's toast: a send made in New, which closes as it sends, says so here, with its Stop (route-toast.ts).
  const [toastNode, flash] = useFrameToast();
  // One head over every view: what the view leaving said stands until the one arriving says its own (standing.ts).
  useHeadHeld();
  // WhatsApp's own list, asked quietly as Campaigns opens, whichever view is on screen (parts/whatsapp-list.ts).
  useWhatsAppListAsked();
  const adsShown = useAdsShown();
  const landing = retiredRouteOf(route);
  useMessageOpensOverTheList(route);
  const view = viewOf(param, adsShown);
  // Each view is a chunk of its own (campaigns-code.tsx), most often fetched before the press, and on a load that opens on it
  // before the first draw (opening.ts): then the view is drawn at once, and only a press that beat it waits under the Suspense
  // below. Taken once for the mount, which follows every address, so a view drawn is never swapped for another.
  const [SequencesPage] = useState(sequencesPageNow);
  const [ContentPage] = useState(contentPageNow);
  const [AdsPage] = useState(adsPageNow);
  const [FormsPage] = useState(formsPageNow);
  const ahead = useViewsAhead(view, adsShown);
  const kept = useKeptViews(view, landing ?? route, ahead);
  useEffect(() => {
    if (landing) replaceRoute(landing);
  }, [landing]);
  // Content's tab, pressed from another view, reopens where Content or Ads was left (left-at.ts, which keeps their places alone).
  const shownAt = landing ?? route;
  useEffect(() => noteContentLeft(shownAt), [shownAt]);
  return (
    <CampaignsToast value={flash}>
      {kept.drawn.has("sequences") ? (
        <Activity mode={view === "sequences" ? "visible" : "hidden"}>
          {/* The message's pane, handed down to the step editor (parts/message-pane.ts). */}
          <Suspense fallback={<ViewReading view={kept.viewOf("sequences")} />}>
            <MessagePaneProvider>
              <SequencesPage route={kept.sequencesAt} view={kept.viewOf("sequences")} />
            </MessagePaneProvider>
          </Suspense>
        </Activity>
      ) : null}
      {/* Content, a view kept beside the others on the same mount (decision 0125). */}
      {kept.drawn.has("content") ? (
        <Activity mode={view === "content" ? "visible" : "hidden"}>
          <Suspense fallback={<ViewReading view={kept.viewOf("content")} />}>
            <ContentPage
              route={kept.contentAt}
              view={kept.viewOf("content")}
              markedAs={param && isAdsParam(param) && !adsShown ? ADS_SHOWN_AS_MADE : undefined}
            />
          </Suspense>
        </Activity>
      ) : null}
      {/* Ads, a view kept beside the others on the same mount (Ruben, 10 Nov 2026: it was a page of its own, so a press on
          its tab put Campaigns away, said Reading, and drew its head 7px lower than the other views'), drawn as the last of
          Content's Made views, under Content's bar (ads/content-bar.tsx). */}
      {adsShown && kept.drawn.has("ads") ? (
        <Activity mode={view === "ads" ? "visible" : "hidden"}>
          <Suspense fallback={<ViewReading view={kept.viewOf("ads")} />}>
            <AdsPage param={kept.adsAt.split("/")[1] || "ads"} view={kept.viewOf("ads")} />
          </Suspense>
        </Activity>
      ) : null}
      {/* Forms, a view kept beside the others on the same mount (00680): drawn from the first time it is shown. */}
      {kept.drawn.has("forms") ? (
        <Activity mode={view === "forms" ? "visible" : "hidden"}>
          <Suspense fallback={<ViewReading view={kept.viewOf("forms")} />}>
            <FormsPage route={kept.formsAt} view={kept.viewOf("forms")} />
          </Suspense>
        </Activity>
      ) : null}
      {toastNode}
    </CampaignsToast>
  );
}
