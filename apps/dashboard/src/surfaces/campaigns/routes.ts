/**
 * What the frame says around Campaigns' pages (moved from the rows `drawPlaybooks`, `drawTemplates` and `drawBroadcasts` of
 * legacy/pages/app-routes.jsx, decision 0015, step 7; then Campaigns' home, 3 Oct 2026): the crumbs each address wears, by the
 * address's own word (`campaigns/moment:<playbook>`, `campaigns/new`, `broadcasts/run:<run>`, `broadcasts/get-yes`, `broadcasts/to-send`,
 * `broadcasts/<list>`, which lands on `campaigns/new:to:<list>`) and by what the surface holds, so a crumb names a playbook or a run only once it has been read. The
 * frame asks these as it draws (src/surfaces/routes.ts). Campaigns is one page, its home (`campaigns`), and the other two are
 * its rooms, Sent (the shell's `broadcasts`) and the Library (`messages`, the path's `templates`); the old Playbooks list,
 * `outbound`, lands on the home (contracts doorOf). Every crumb's first word, Campaigns, goes back to the home.
 */
import {
  ADS_ROUTE,
  ADS_WORDS,
  CAMPAIGN_ROOMS,
  LIFECYCLE_WORDS,
  TO_SEND_ALL_WORDS,
  TO_SEND_ROUTE,
  SEQUENCES_ROUTE,
  SEQUENCE_WORDS,
  isAdsParam,
  isSequencesParam,
  parseAds,
  parseSequencesRoute,
  routeOfPath,
  templateTitle,
} from "@chanlytics/contracts";
import { adsShown } from "./ads/shown";
import { sequencesShown } from "./sequences/shown";
import { surfaceValue } from "../surface-values";
import type { SurfaceViews } from "../routes";
// MOCKUP: the crumb names an ad the page has read (the store remembers them) until the wiring lane's surface holds real ones.
import { adNameOf } from "./ads/crumb-names";
import { parseHome } from "./home/address";

/** A crumb: its words, and where it goes. */
type Crumb = string | { label: string; to: string };

/**
 * Whether Ads is drawn: a demo session, or a workspace whose Ads preview is on (ads/shown.ts), from a sample, so nothing of it
 * (its strip, its chrome, its page) reaches any other workspace. The frame draws a chrome in the browser, but a test reads one
 * with no window.
 */
const inDemo = (): boolean => adsShown();

/** Campaigns, the first crumb of every address: the way back to the home. */
const CAMPAIGNS: Crumb = { label: CAMPAIGN_ROOMS.home, to: "campaigns" };

/**
 * Messages | Ads, Campaigns' two views, as the frame's strip draws them (the one Reports and People use): what goes out to
 * people who have your number, and what you pay to show people who don't. Library and Sent are rooms of Messages and draw no
 * strip, as before.
 */
function campaignsViews(picked: "sequences" | "messages" | "ads"): SurfaceViews {
  // Sequences first (decision 0060), where its preview is on, and Messages then the Library (D4); Ads last, where it is drawn.
  const preview = sequencesShown();
  const sequences = preview
    ? [{ id: "sequences", label: SEQUENCE_WORDS.title, to: SEQUENCES_ROUTE, testid: "campaigns-view-sequences" }]
    : [];
  const ads = inDemo() ? [{ id: "ads", label: ADS_WORDS.adsTab, to: ADS_ROUTE, testid: "campaigns-view-ads" }] : [];
  return {
    name: "campaigns",
    label: ADS_WORDS.viewsLabel,
    testid: "campaigns-views",
    picked,
    tabs: [
      ...sequences,
      {
        id: "messages",
        label: ADS_WORDS.messagesTab,
        to: preview ? "messages" : "campaigns",
        testid: "campaigns-view-messages",
      },
      ...ads,
    ],
  };
}

/**
 * Sequences' crumbs (decision 0060): Campaigns, then Sequences, and under it the sequence open, named once the list holds
 * it, or a new one. Every address is the one mount of Campaigns, the page following its own address.
 */
function sequencesChrome(): { crumbs: Crumb[]; mount: string; act: null; views: SurfaceViews; pane: true } {
  const route = typeof window === "undefined" ? null : routeOfPath(window.location.pathname);
  const place = route ? parseSequencesRoute(route) : null;
  const list = surfaceValue("sequences");
  const named = place?.view === "record" ? (list?.sequences.find((q) => q.id === place.id)?.name ?? null) : null;
  const sequences = { label: SEQUENCE_WORDS.title, to: SEQUENCES_ROUTE };
  return {
    crumbs: named
      ? [CAMPAIGNS, sequences, named]
      : place?.view === "new"
        ? [CAMPAIGNS, sequences, SEQUENCE_WORDS.newSequence]
        : [CAMPAIGNS, SEQUENCE_WORDS.title],
    mount: "campaigns",
    act: null,
    views: campaignsViews("sequences"),
    // A list and a record beside it, as Sent is: each scrolls inside itself, and a record's foot stands at the screen's edge.
    pane: true,
  };
}

/** Ads' crumbs: Campaigns, then Ads, and under it the ad open in its drawer or the composer. One mount for every Ads address. */
function adsChrome(param: string): { crumbs: Crumb[]; mount: string; act: null; views: SurfaceViews } {
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
  };
}

/**
 * The home's crumbs: `campaigns/moment:<id>` opens one playbook (or reach-out) in its drawer, named once the surfaces hold it,
 * and `campaigns/new` the composer. Every address is one mount, the page's own: a moment opening is no new page. A real
 * workspace's New message is the page's own, in its head; the top bar has no act. `campaigns/ads…` is the Ads view's, and
 * so is the strip of Messages | Ads: a demo session's alone. A real workspace is given what it was before Ads, for every
 * param (no `views`), and an `ads…` param is the home's.
 */
export function campaignsChrome({ param }: { param: string | null }): {
  crumbs: Crumb[];
  mount: string;
  act: null;
  views?: SurfaceViews;
  pane?: boolean;
} {
  const demo = inDemo();
  if (demo && param && isAdsParam(param)) return adsChrome(param);
  const sequences = sequencesShown();
  if (sequences && isSequencesParam(param)) return sequencesChrome();
  const at = parseHome(param);
  const playbooks = surfaceValue("playbooks");
  const chains = surfaceValue("reach_outs");
  const rows = playbooks ? playbooks.rows : [];
  // A playbook's name, or a reach-out's, once the surfaces hold it: an address names either by its id. Before, the word
  // the drawer's head says of a campaign the page does not hold yet.
  const nameOf = (id: string): string =>
    rows.find((p) => p.id === id)?.name ??
    (Array.isArray(chains) ? chains : []).find((c) => c.root_id === id)?.name ??
    LIFECYCLE_WORDS.ledger.kicker;
  const open = at.moment;
  const named = open ? nameOf(open) : null;
  const editing = at.compose && at.compose.mode === "every" ? at.compose.edit : null;
  const edited = editing ? nameOf(editing) : null;
  return {
    crumbs: named
      ? [CAMPAIGNS, named]
      : at.message
        ? [CAMPAIGNS, templateTitle(at.message, null)]
        : edited
          ? [CAMPAIGNS, edited]
          : at.compose
            ? [CAMPAIGNS, CAMPAIGN_ROOMS.newMessage]
            : [CAMPAIGN_ROOMS.home],
    mount: "campaigns",
    act: null,
    ...(demo ? { views: campaignsViews("messages") } : {}),
  };
}

/**
 * The Library's chrome: where the Sequences preview is on (decision 0060, D4), it is Campaigns › Messages, in the strip of
 * views beside Sequences; anywhere else a room of the home, as before (no `views`).
 */
export function messagesChrome(): { crumbs: Crumb[]; views?: SurfaceViews } {
  if (!sequencesShown()) return { crumbs: [CAMPAIGNS, CAMPAIGN_ROOMS.library] };
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
 * Broadcasts' crumbs: `broadcasts/run:<id>` opens one broadcast, named for it once the list holds it; `broadcasts/get-yes`
 * lands on the "Get their yes" section; `broadcasts/to-send` on the one To send (00429); any other param is the audience
 * the composer opens on, named by the page's own
 * rule (a list or a kept list with this id) and its own label. Every address is one mount.
 */
export function broadcastsChrome({ param }: { param: string | null }): { crumbs: Crumb[]; mount: string } {
  const data = surfaceValue("broadcasts");
  const runId = param && param.startsWith("run:") ? param.slice(4) : null;
  const getYes = param === "get-yes";
  const toSend = param === TO_SEND_PARAM;
  const audience = runId || getYes || toSend ? null : param;
  const run = runId && data ? (data.rows || []).find((r) => r.id === runId) : null;
  const list =
    audience && data
      ? (data.audiences || []).find((a) => (a.kind === "saved" || a.kind === "list") && a.id === audience)
      : null;
  const sent = { label: CAMPAIGN_ROOMS.sent, to: "broadcasts" };
  return {
    mount: "broadcasts",
    crumbs: runId
      ? [CAMPAIGNS, sent, run ? run.name : "Broadcast"]
      : getYes
        ? [CAMPAIGNS, sent, "Get their yes"]
        : toSend
          ? [CAMPAIGNS, sent, TO_SEND_ALL_WORDS.title]
          : list
            ? [CAMPAIGNS, sent, list.label]
            : [CAMPAIGNS, CAMPAIGN_ROOMS.sent],
  };
}
