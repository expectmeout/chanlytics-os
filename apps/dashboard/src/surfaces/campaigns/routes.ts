/**
 * What the frame says around Campaigns' pages: the crumbs each address wears and the strip of its views. Campaigns is
 * Sequences (decision 0060; the home that stood here went in S6), with Messages and, where it is drawn, Ads beside it in the
 * strip. Every Campaigns address but Ads is Sequences' mount and crumbs (`campaigns/sequences…`, and the sheets Campaigns
 * opens over it, `campaigns/new…`, `campaigns/message:<name>`); the home's and a campaign's addresses land on Sequences.
 * Sent's sheets keep their addresses (`broadcasts/run:<run>/sheet`, `broadcasts/get-yes`, `broadcasts/to-send`), beside
 * Sequences' list and under its strip; Sent's own list lands on Sequences. Campaigns' crumbs are People's and Reports' kind:
 * its first view, Sequences' list, is Campaigns alone, and anything under it goes back to it, the strip saying the view.
 */
import {
  ADS_ROUTE,
  ADS_WORDS,
  CAMPAIGN_ROOMS,
  MESSAGES_ROUTE,
  RUN_UNNAMED_WORDS,
  TO_SEND_ALL_WORDS,
  TO_SEND_ROUTE,
  SEQUENCES_ROUTE,
  SEQUENCE_WORDS,
  isAdsParam,
  isMessagesParam,
  parseAds,
  parseSequencesRoute,
  routeOfPath,
  runDecidedOnItsPage,
  runTitleOf,
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
      { id: "sequences", label: SEQUENCE_WORDS.title, to: SEQUENCES_ROUTE, testid: "campaigns-view-sequences" },
      { id: "messages", label: ADS_WORDS.messagesTab, to: MESSAGES_ROUTE, testid: "campaigns-view-messages" },
      ...ads,
    ],
  };
}

/**
 * Sequences' crumbs (decision 0060): Campaigns alone on the list, Campaigns' first view (as People's and Reports' first
 * views are their page's name alone, the strip saying which view), and under it the sequence open, named once the list
 * holds it, or a new one. Every address is the one mount of Campaigns, the page following its own address.
 */
function sequencesChrome(): { crumbs: Crumb[]; mount: string; act: null; views: SurfaceViews; pane: true } {
  const route = typeof window === "undefined" ? null : routeOfPath(window.location.pathname);
  const place = route ? parseSequencesRoute(route) : null;
  const list = surfaceValue("sequences");
  const named = place?.view === "record" ? (list?.sequences.find((q) => q.id === place.id)?.name ?? null) : null;
  return {
    crumbs: named
      ? [CAMPAIGNS, named]
      : place?.view === "new"
        ? [CAMPAIGNS, SEQUENCE_WORDS.newSequence]
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

/**
 * Messages' crumbs as the view of Campaigns it is (`campaigns/messages`, 19 Oct 2026): Campaigns, then Messages, under
 * Campaigns' one mount, so a switch to it from Sequences is no new page: the view kept beside Sequences is shown.
 */
function messagesViewChrome(): { crumbs: Crumb[]; mount: string; act: null; views: SurfaceViews; pane: true } {
  return {
    crumbs: [CAMPAIGNS, ADS_WORDS.messagesTab],
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
 * (contracts doorOf): Campaigns › Messages, in the strip beside Sequences, for the frame it stands in until it has moved.
 */
export function messagesChrome(): { crumbs: Crumb[]; views?: SurfaceViews } {
  return { crumbs: [CAMPAIGNS, ADS_WORDS.messagesTab], views: campaignsViews("messages") };
}

/** Sent's one list of every email handed to its owner, from each reach-out they send themselves (00429), as its param. */
const TO_SEND_PARAM = TO_SEND_ROUTE.slice("broadcasts/".length);

/**
 * What the Broadcasts page is handed for a param (`broadcasts/<param>`): a run's id for `run:<id>`, the "Get their yes"
 * section for `get-yes`, the one To send for `to-send`, and any other word as the audience the composer opens on.
 */
export function broadcastsProps(param: string | null): {
  initialSegment: string | null;
  initialRun: string | null;
  initialYes: boolean;
  initialToSend: boolean;
} {
  const run = param && param.startsWith("run:") ? param.slice(4) : null;
  const yes = param === "get-yes";
  const toSend = param === TO_SEND_PARAM;
  return {
    initialSegment: run || yes || toSend ? null : param,
    initialRun: run,
    initialYes: yes,
    initialToSend: toSend,
  };
}

/**
 * Sent's sheets' crumbs: `broadcasts/run:<id>` opens one broadcast, named for it once the list holds it; `broadcasts/get-yes`
 * Get their yes; `broadcasts/to-send` the one To send (00429); any other param is the audience the composer opens on, named
 * by the page's own rule (a list or a kept list with this id) and its own label. Every address is one mount, beside
 * Sequences' list, so the strip is Campaigns', on Sequences, and the page is its panes.
 */
export function broadcastsChrome({ param }: { param: string | null }): {
  crumbs: Crumb[];
  mount: string;
  views: SurfaceViews;
  pane: true;
} {
  const data = surfaceValue("broadcasts");
  const runId = param && param.startsWith("run:") ? param.slice(4) : null;
  const getYes = param === "get-yes";
  const toSend = param === TO_SEND_PARAM;
  const audience = runId || getYes || toSend ? null : param;
  // Sent's row for the run, else its own read's (a run older than the newest fifty): the crumb is never "Broadcast".
  const run = runId ? ((data?.rows || []).find((r) => r.id === runId) ?? rememberedRun(runId)) : null;
  // The audiences are their own read (broadcasts/audiences-surface.ts): the composer's, where an audience's address lands.
  const list = audience
    ? (surfaceValue("audiences")?.audiences || []).find(
        (a) => (a.kind === "saved" || a.kind === "list") && a.id === audience,
      )
    : null;
  // Sent's list went to Sequences (D3: a run is a day of its sequence's History): its sheets go back to Campaigns' list.
  return {
    mount: "broadcasts",
    views: campaignsViews("sequences"),
    pane: true,
    // A run waiting for its decision is named as its sheet's head names it (runTitleOf); one that went keeps its day.
    crumbs: runId
      ? [CAMPAIGNS, run ? (runDecidedOnItsPage(run) ? runTitleOf(run) : run.name) : RUN_UNNAMED_WORDS]
      : getYes
        ? [CAMPAIGNS, "Get their yes"]
        : toSend
          ? [CAMPAIGNS, TO_SEND_ALL_WORDS.title]
          : list
            ? [CAMPAIGNS, list.label]
            : [CAMPAIGN_ROOMS.home],
  };
}
