/**
 * What the frame says around Campaigns' pages: the crumbs each address wears and the strip of its views. Campaigns is
 * Sequences (decision 0060; the home that stood here went in S6), with Content and Forms beside it in the strip, and Ads, where
 * it is drawn, the last of Content's Made views (Campaigns in three tabs, 23 Nov 2026). Every Campaigns address but Content's,
 * Ads' and Forms' is Sequences' mount and crumbs (`campaigns/sequences…`, the one New among them, and
 * Messages, a message open in it at its home, `campaigns/messages/<name>`); the home's and a campaign's addresses land on Sequences, and the
 * composer's (`campaigns/new…`) on New. A run is at its home under its sequence (`campaigns/sequences/<id>/runs/<run>`, the
 * Campaigns wiring review's lane 2), crumbed under its sequence. Sent draws nothing of its own: its list, a run's sheet, To
 * send and Get their yes land on Sequences, the run's home, the Inbox's Needs you and People (lanes 2, 4 and 7), and an
 * address that reaches it some other way wears Campaigns' crumbs. Campaigns' crumbs are People's and Reports' kind:
 * its first view, Sequences' list, is Campaigns alone, and anything under it goes back to it, the strip saying the view.
 */
import {
  ADS_ROUTE,
  ADS_WORDS,
  CAMPAIGN_ROOMS,
  CONTENT_ROUTE,
  CONTENT_WORDS,
  FORMS_ROUTE,
  RUN_UNNAMED_WORDS,
  SEQUENCES_ROUTE,
  isAdsParam,
  isContentParam,
  isFormsParam,
  parseAds,
  parseSequencesRoute,
  routeOfPath,
  runDecidedOnItsPage,
  runTitleOf,
  sequenceRoute,
} from "@chanlytics/contracts";
import { adsShown } from "./ads/shown";
import { adsNeedingNow, hearAdsNeeding } from "./ads/needs-you";
import { contentTabRoute } from "./home/left-at";
import { onSurfaceValue, surfaceValue } from "../surface-values";
import { isSurfaceFailed } from "@/bridge/surface-status";
import { warmsOnItsOwn } from "@/bridge/workspace";
import type { SurfaceViews } from "../routes";
// MOCKUP: the crumb names an ad the page has read (the store remembers them) until the wiring lane's surface holds real ones.
import { adNameOf } from "./ads/crumb-names";
import { rememberedRun } from "./broadcasts/run-names";

/** A crumb: its words, and where it goes. */
type Crumb = string | { label: string; to: string };

/** The Forms view's word on the strip and in its crumb. */
const FORMS_TAB = "Forms";

/** Campaigns, the first crumb of every address under it: the way back to Sequences' list, Campaigns' first view. */
const CAMPAIGNS: Crumb = { label: CAMPAIGN_ROOMS.home, to: SEQUENCES_ROUTE };

/**
 * What needs the owner anywhere in Content, said amber on its tab (Campaigns in three tabs: one signal at the top, each view
 * keeping its own meaning under it): Made's pieces that need them, as Content last read them, and what needs them in Ads,
 * as the Ads page last read it (ads/needs-you.ts). Nothing before either has been read.
 */
const contentNeedsNow = (): number | null => {
  const count = (surfaceValue("content")?.dto?.tally.needs ?? 0) + adsNeedingNow();
  return count > 0 ? count : null;
};

/**
 * Whether Content's count is on its way: its page not read yet, where its read is being made (Content's own as the view is
 * shown; ahead of its press from another view once the frame is idle, home/route.tsx, where a frame may read with nobody
 * reaching) and has not failed. The strip then keeps the tab the room of the figure it last said (the kit's kept-room.ts):
 * read a moment after Campaigns was drawn, the figure came beside Content and pushed Forms along (Ruben, 28 Nov 2026).
 * What needs the owner in Ads is read later still, once Content is shown and idle, and is not waited for here.
 */
const contentNeedsComing = (): boolean =>
  surfaceValue("content") === undefined && !isSurfaceFailed("content") && warmsOnItsOwn();

/** What moves Content's count: Content's read published, and what needs the owner in Ads noted (the strip hears both). */
const hearContentNeeds = (redraw: () => void): (() => void) => {
  const stops = [onSurfaceValue("content", redraw), hearAdsNeeding(redraw)];
  return () => stops.forEach((stop) => stop());
};

/**
 * Campaigns | Content | Forms, Campaigns' three views, as the frame's strip draws them (the one Reports and People use), for
 * every workspace: what goes out, each message inside the campaign that sends it (Messages folded in, 17 Nov 2026: Campaigns,
 * one tab), what Ask made for the business (decision 0125) with Ads, what you pay to show people who don't have your number,
 * as the last of Made's views where it is drawn (Campaigns in three tabs, 23 Nov 2026: a page holds three tabs at most), and
 * what a business asks people for. Content's tab, pressed from another view, reopens where Content was left (home/left-at.ts).
 */
function campaignsViews(picked: "sequences" | "content" | "forms"): SurfaceViews {
  return {
    name: "campaigns",
    label: ADS_WORDS.viewsLabel,
    testid: "campaigns-views",
    picked,
    heard: hearContentNeeds,
    tabs: [
      { id: "sequences", label: CAMPAIGN_ROOMS.sequences, to: SEQUENCES_ROUTE, testid: "campaigns-view-sequences" },
      {
        id: "content",
        label: CONTENT_WORDS.tab,
        to: picked === "content" ? CONTENT_ROUTE : contentTabRoute(adsShown()),
        testid: "campaigns-view-content",
        badge: contentNeedsNow,
        coming: contentNeedsComing,
        tone: "warn",
      },
      // Forms, the last of Campaigns' views (00680): what a business asks people for, with no website.
      { id: "forms", label: FORMS_TAB, to: FORMS_ROUTE, testid: "campaigns-view-forms" },
    ],
  };
}

/**
 * What a run's crumb says (lane 2: the run open at its home): Sent's row for it, else its own read's (a run older than the
 * newest fifty), named as its screen's head names it -- a run waiting for its decision by its sheet's title (runTitleOf),
 * one that went by its day's name -- and never "Broadcast".
 */
function runCrumbOf(runId: string): string {
  const run = (surfaceValue("broadcasts")?.rows || []).find((r) => r.id === runId) ?? rememberedRun(runId);
  return run ? (runDecidedOnItsPage(run) ? runTitleOf(run) : run.name) : RUN_UNNAMED_WORDS;
}

/**
 * Sequences' crumbs (decision 0060): Campaigns alone on the list, Campaigns' first view (as People's and Reports' first
 * views are their page's name alone, the strip saying which view), and under it the sequence open, named once the list
 * holds it, or a new one; a run open under its sequence, the sequence a crumb back to its History, the days it is one of.
 * Every address is the one mount of Campaigns, the page following its own address.
 */
function sequencesChrome(): { crumbs: Crumb[]; mount: string; act: null; views: SurfaceViews; pane: true } {
  const route = typeof window === "undefined" ? null : routeOfPath(window.location.pathname);
  const place = route ? parseSequencesRoute(route) : null;
  const list = surfaceValue("sequences");
  const rec = place?.view === "record" ? place : null;
  const named = rec ? (list?.sequences.find((q) => q.id === rec.id)?.name ?? null) : null;
  // A run open under its sequence: the sequence, where the list names it, a crumb back to the History it is a day of.
  const runCrumbs = (seqId: string, run: string): Crumb[] => [
    CAMPAIGNS,
    ...(named ? [{ label: named, to: sequenceRoute(seqId, "history") }] : []),
    runCrumbOf(run),
  ];
  return {
    crumbs: rec?.run
      ? runCrumbs(rec.id, rec.run)
      : named
        ? [CAMPAIGNS, named]
        : place?.view === "new"
          ? [CAMPAIGNS, CAMPAIGN_ROOMS.new]
          : [CAMPAIGN_ROOMS.home],
    mount: "campaigns",
    act: null,
    views: campaignsViews("sequences"),
    // A list and a record beside it, as Sent is: each scrolls inside itself, and a record's foot stands at the screen's edge.
    pane: true,
  };
}

/** Content, a crumb back to its own first view, Made: the crumb over Ads, the last of Made's views. */
const CONTENT: Crumb = { label: CONTENT_WORDS.tab, to: CONTENT_ROUTE };

/**
 * Ads' crumbs: Campaigns, Content, then Ads, and under it the ad open in its drawer or the composer; the strip lights Content,
 * since Ads is the last of Made's views (Campaigns in three tabs). Campaigns' one mount, as Content's, so a switch to it is no
 * new page: the view kept beside the others is shown, under the head where theirs stands (Ruben, 10 Nov 2026: on a mount of
 * its own its head stood 7px lower, and a press on its tab said Reading).
 */
function adsChrome(param: string): { crumbs: Crumb[]; mount: string; act: null; views: SurfaceViews; pane: true } {
  const at = parseAds(param);
  const ads = { label: ADS_WORDS.adsTab, to: ADS_ROUTE };
  // An ad the page has not read (a link before it loaded) names none until the wiring lane's surface holds real ones.
  const named = at.ad ? adNameOf(at.ad) : null;
  return {
    crumbs: named
      ? [CAMPAIGNS, CONTENT, ads, named]
      : at.compose
        ? [CAMPAIGNS, CONTENT, ads, ADS_WORDS.newAd]
        : [CAMPAIGNS, CONTENT, ADS_WORDS.adsTab],
    mount: "campaigns",
    act: null,
    views: campaignsViews("content"),
    pane: true,
  };
}

/**
 * Content's crumbs: Campaigns, then Content. Campaigns' one mount, as Sequences' and Forms', so a switch to it is no new page:
 * the view kept beside them is shown.
 */
function contentChrome(): { crumbs: Crumb[]; mount: string; act: null; views: SurfaceViews; pane: true } {
  return {
    crumbs: [CAMPAIGNS, CONTENT_WORDS.tab],
    mount: "campaigns",
    act: null,
    views: campaignsViews("content"),
    pane: true,
  };
}

/**
 * Forms' crumbs: Campaigns, then Forms. Campaigns' one mount, as Content's, so a switch to it is no new page.
 */
function formsChrome(): { crumbs: Crumb[]; mount: string; act: null; views: SurfaceViews; pane: true } {
  return {
    crumbs: [CAMPAIGNS, FORMS_TAB],
    mount: "campaigns",
    act: null,
    views: campaignsViews("forms"),
    pane: true,
  };
}

/**
 * Campaigns' crumbs: Ads' for `campaigns/ads…` where it is drawn (ads/shown.ts), Content's for `campaigns/content` and for an
 * Ads address where Ads is not drawn (it opens Made), and Sequences' for every other address, the sheets Campaigns opens over it among them, and
 * Messages' old addresses, which land on it (contracts retiredRouteOf). Every address is one mount, the page's own.
 */
export function campaignsChrome({ param }: { param: string | null }): {
  crumbs: Crumb[];
  mount: string;
  act: null;
  views?: SurfaceViews;
  pane?: boolean;
} {
  if (param && isAdsParam(param)) return adsShown() ? adsChrome(param) : contentChrome();
  if (isContentParam(param)) return contentChrome();
  if (isFormsParam(param)) return formsChrome();
  return sequencesChrome();
}

/**
 * Messages' chrome at its old route (`messages`, the path `templates`), which lands on Campaigns' list as it loads
 * (contracts retiredRouteOf: Messages folded into Campaigns, 17 Nov 2026): Campaigns, its strip on its list, for the frame
 * it stands in until it has moved.
 */
export function messagesChrome(): { crumbs: Crumb[]; views?: SurfaceViews } {
  return { crumbs: [CAMPAIGN_ROOMS.home], views: campaignsViews("sequences") };
}

/**
 * Sent's crumbs while its address lands (broadcasts/route.tsx): every address of it is retired (contracts retiredRouteOf),
 * so it is Campaigns', on Sequences, the strip Campaigns'.
 */
export function broadcastsChrome(): { crumbs: Crumb[]; mount: string; views: SurfaceViews; pane: true } {
  return { mount: "broadcasts", views: campaignsViews("sequences"), pane: true, crumbs: [CAMPAIGN_ROOMS.home] };
}
