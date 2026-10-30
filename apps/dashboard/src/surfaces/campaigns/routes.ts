/**
 * What the frame says around Campaigns' pages: the crumbs each address wears and the strip of its views. Campaigns is
 * Sequences (decision 0060; the home that stood here went in S6), with Messages and, where it is drawn, Ads beside it in the
 * strip. Every Campaigns address but Ads is Sequences' mount and crumbs (`campaigns/sequences…`, the one New among them, and
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
  MESSAGES_ROUTE,
  RUN_UNNAMED_WORDS,
  SEQUENCES_ROUTE,
  isAdsParam,
  isMessagesParam,
  messageOfRoute,
  parseAds,
  parseSequencesRoute,
  routeOfPath,
  runDecidedOnItsPage,
  runTitleOf,
  sequenceRoute,
} from "@chanlytics/contracts";
import { adsShown } from "./ads/shown";
import { surfaceValue } from "../surface-values";
import type { SurfaceViews } from "../routes";
// MOCKUP: the crumb names an ad the page has read (the store remembers them) until the wiring lane's surface holds real ones.
import { adNameOf } from "./ads/crumb-names";
import { rememberedRun } from "./broadcasts/run-names";

/** A crumb: its words, and where it goes. */
type Crumb = string | { label: string; to: string };

/**
 * Whether Ads is drawn: a demo session, or a workspace whose Ads preview is on (ads/shown.ts), from a sample, so nothing of it
 * (its strip, its chrome, its page) reaches any other workspace. The frame draws a chrome in the browser, but a test reads one
 * with no window.
 */
const inDemo = (): boolean => adsShown();

/** Campaigns, the first crumb of every address under it: the way back to Sequences' list, Campaigns' first view. */
const CAMPAIGNS: Crumb = { label: CAMPAIGN_ROOMS.home, to: SEQUENCES_ROUTE };

/**
 * Sequences | Messages | Ads, Campaigns' views, as the frame's strip draws them (the one Reports and People use): what goes
 * out on its own, the messages it sends (D4: the Library is Messages), and, where it is drawn, what you pay to show people
 * who don't have your number.
 */
function campaignsViews(picked: "sequences" | "messages" | "ads"): SurfaceViews {
  const ads = inDemo() ? [{ id: "ads", label: ADS_WORDS.adsTab, to: ADS_ROUTE, testid: "campaigns-view-ads" }] : [];
  return {
    name: "campaigns",
    label: ADS_WORDS.viewsLabel,
    testid: "campaigns-views",
    picked,
    tabs: [
      { id: "sequences", label: CAMPAIGN_ROOMS.sequences, to: SEQUENCES_ROUTE, testid: "campaigns-view-sequences" },
      { id: "messages", label: ADS_WORDS.messagesTab, to: MESSAGES_ROUTE, testid: "campaigns-view-messages" },
      ...ads,
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

/**
 * Ads' crumbs: Campaigns, then Ads, and under it the ad open in its drawer or the composer. One mount for every Ads address,
 * a page that scrolls, where Sequences' list and record are panes.
 */
function adsChrome(param: string): { crumbs: Crumb[]; mount: string; act: null; views: SurfaceViews; pane: false } {
  const at = parseAds(param);
  const ads = { label: ADS_WORDS.adsTab, to: ADS_ROUTE };
  // An ad the page has not read (a link before it loaded) names none until the wiring lane's surface holds real ones.
  const named = at.ad ? adNameOf(at.ad) : null;
  return {
    crumbs: named
      ? [CAMPAIGNS, ads, named]
      : at.compose
        ? [CAMPAIGNS, ads, ADS_WORDS.newAd]
        : [CAMPAIGNS, ADS_WORDS.adsTab],
    mount: ADS_ROUTE,
    act: null,
    views: campaignsViews("ads"),
    pane: false,
  };
}

/** A message's title, by its name, as the settings read holds it; null before it is read, or for a name it no longer has. */
function messageTitleOf(name: string): string | null {
  return surfaceValue("settings")?.messages?.find((m) => m.name === name)?.title || null;
}

/**
 * Messages' crumbs as the view of Campaigns it is (`campaigns/messages`, 19 Oct 2026): Campaigns, then Messages, under
 * Campaigns' one mount, so a switch to it from Sequences is no new page: the view kept beside Sequences is shown. A message
 * open in it (its home, `campaigns/messages/<name>`) is named once the settings read holds it, Messages a crumb back.
 */
function messagesViewChrome(): { crumbs: Crumb[]; mount: string; act: null; views: SurfaceViews; pane: true } {
  const route = typeof window === "undefined" ? null : routeOfPath(window.location.pathname);
  const name = route ? messageOfRoute(route) : null;
  const title = name ? messageTitleOf(name) : null;
  return {
    crumbs: title
      ? [CAMPAIGNS, { label: ADS_WORDS.messagesTab, to: MESSAGES_ROUTE }, title]
      : [CAMPAIGNS, ADS_WORDS.messagesTab],
    mount: "campaigns",
    act: null,
    views: campaignsViews("messages"),
    pane: true,
  };
}

/**
 * Campaigns' crumbs: the Ads view's for `campaigns/ads…` where it is drawn (a demo session's), Messages' for
 * `campaigns/messages`, and Sequences' for every other address, the sheets Campaigns opens over it among them. Every
 * address is one mount, the page's own.
 */
export function campaignsChrome({ param }: { param: string | null }): {
  crumbs: Crumb[];
  mount: string;
  act: null;
  views?: SurfaceViews;
  pane?: boolean;
} {
  if (inDemo() && param && isAdsParam(param)) return adsChrome(param);
  if (isMessagesParam(param)) return messagesViewChrome();
  return sequencesChrome();
}

/**
 * Messages' chrome at its old route (`messages`, the path `templates`), which lands on `campaigns/messages` as it loads
 * (contracts retiredRouteOf): Campaigns › Messages, in the strip beside Sequences, for the frame it stands in until it has moved.
 */
export function messagesChrome(): { crumbs: Crumb[]; views?: SurfaceViews } {
  return { crumbs: [CAMPAIGNS, ADS_WORDS.messagesTab], views: campaignsViews("messages") };
}

/**
 * Sent's crumbs while its address lands (broadcasts/route.tsx): every address of it is retired (contracts retiredRouteOf),
 * so it is Campaigns', on Sequences, the strip Campaigns'.
 */
export function broadcastsChrome(): { crumbs: Crumb[]; mount: string; views: SurfaceViews; pane: true } {
  return { mount: "broadcasts", views: campaignsViews("sequences"), pane: true, crumbs: [CAMPAIGN_ROOMS.home] };
}
