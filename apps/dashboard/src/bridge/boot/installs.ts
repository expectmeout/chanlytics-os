/**
 * What the frame installs as it loads, in the order it does, each with why it stands where it does: the boot FrameApp
 * runs at its module scope (`bootFrame()`), before React draws anything. A list of its own so a node test can run it
 * and read it (tests/shell/boot/frame-boot.test.mjs), where FrameApp itself draws in a browser alone (`#frame-shell`).
 *
 * The order is the boot's contract: what a page reads at its first draw is installed before React draws, the cache is
 * restored before anything measures a page, and the route gate and the registry exist before the frame's first render.
 * A step a test looks for is found by the function it runs (`run: installBilling`), or by its name where it runs several.
 */
import { PRIMARY_PART } from "@chanlytics/contracts";
import { authErrorInHash } from "@/auth/hash-error";
import { hearPartReady, installPageSpeed, type SpeedShell } from "@/client/page-speed";
import { pageReport } from "@/client/page-report";
import { publicEnv } from "@/lib/public-env";
import { warmCampaignsCode, warmCampaignsSoon } from "@/surfaces/campaigns/home/campaigns-code";
import { campaignsOpensOn } from "@/surfaces/campaigns/home/opening";
import { installBroadcasts } from "@/surfaces/campaigns/broadcasts/verbs";
import { installPlaybooks } from "@/surfaces/campaigns/playbooks/verbs";
import { warmSequenceRoute } from "@/surfaces/campaigns/sequences/verbs";
import { installCalendar } from "@/surfaces/calendar/verbs";
import { calendarRunsOverride, readRunsSoon } from "@/surfaces/calendar/runs-surface";
import { installFirstRows } from "@/surfaces/frame/first-rows";
import { installTip } from "@/surfaces/frame/tip";
import { hearFocusOutside } from "@/surfaces/kit/focus/trap";
import { installLeadMap } from "@/surfaces/leads/map/lead-map";
import { installPeopleCourier, warmPersonOnScreen } from "@/surfaces/people/people-detail";
import { campaignsLensOpensOn } from "@/surfaces/reports/campaigns-one-code";
import { policiesNow } from "@/surfaces/settings/business/shell";
import { installBilling } from "@/surfaces/settings/billing/surface";
import { settingsPaneOnScreen } from "@/surfaces/settings/frame/pane-reads";
import { installSetup } from "@/surfaces/setup/override";
import { readTodaySoon } from "@/surfaces/today/first-draw-read";
import { installAppBridge } from "../app-bridge";
import { installArrival } from "../arrival";
import { installAsk } from "../ask";
import { drawComing, pageDrawn } from "../hearing/page-waits";
import { installFreshnessReports } from "../hearing/freshness";
import { installIdentity, installRoleStore } from "../identity";
import { installInboxVerbs } from "../inbox-verbs";
import { installNotifications } from "../notifications";
import { installPolicyStore } from "../policy-store";
import { provide } from "../provided";
import { installReplies } from "../reach-out/replies";
import { installShell } from "../shell";
import { hydrateSurfaceCache } from "../surface-cache";
import { readIsOut } from "../surface-data";
import {
  installRouteGate,
  installSurfaceRegistry,
  readWhatWasMissed,
  routeGateOpen,
  routePartsOf,
  routeSurfaceFor,
  routeSurfaces,
  warmWhatItDraws,
} from "../surface-registry";
import {
  getSurfaceStatuses,
  isSurfaceReady,
  markHydrated,
  onSurfaceStatusChange,
  refreshSurfaces,
} from "../surface-runner";
import { hearSurfaces } from "../surface-status";
import { installTabMemory } from "../tab-memory";
import {
  bootComing,
  getActiveWorkspace,
  hearAddress,
  onRouteAsked,
  onRouteReachedFor,
  reachFor,
  routeOnScreen,
} from "../workspace";
import { installClock } from "../zone";
import { FRAME_SURFACES } from "./surfaces";

/** A step of the boot: what it is called, and what it runs. */
export interface FrameInstall {
  readonly name: string;
  readonly run: () => void;
}

/** A route as the registry reads it (surface-registry.ts routePartsOf): its page, and every word after it. */
const routeParts = (route: string): [string, string | null] => {
  const { page, param } = routePartsOf(route);
  return [page, param];
};

/**
 * What the page's measures read of the shell (client/page-speed.ts, decision 0053): the address and its moves, the
 * surfaces a page is drawn from and whether each is read, and the gate the frame draws by.
 */
const speedShell: SpeedShell = {
  route: () => routeOnScreen(),
  hearRoute: (fn) => hearAddress(fn),
  hearAsked: onRouteAsked,
  surfacesOf: (route) => routeSurfaces(...routeParts(route)),
  ownSurface: (route) => routeSurfaceFor(...routeParts(route)),
  isRead: (key) => getSurfaceStatuses().has(key),
  isReady: isSurfaceReady,
  gateOpen: (route) => routeGateOpen(...routeParts(route)),
  hearSurfaces: onSurfaceStatusChange,
};

/** The surfaces of the frame a set of keys names, read again: what a page draws and missed, or what a press reaches for. */
const readAgain = (keys: readonly string[]) => void refreshSurfaces(FRAME_SURFACES.filter((o) => keys.includes(o.key)));
/** The same, but leaving one read only where it is drawn whose read is out already: that one is taken, not asked twice. */
const readAgainUnlessOut = (keys: readonly string[]) =>
  void refreshSurfaces(FRAME_SURFACES.filter((o) => keys.includes(o.key) && !(o.onDemand && readIsOut(o))));

/**
 * The installable shell's service worker (public/sw.js). It caches nothing and answers nothing (the workspace is live
 * data), and exists so a phone can add the app to its home screen. Production only: a worker on a dev origin outlives
 * the dev server and confuses the next session.
 */
function registerServiceWorker(): void {
  if (typeof window !== "undefined" && "serviceWorker" in navigator && publicEnv.productionBuild) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}

/**
 * Where each page's time goes: the document's visit begins at its start, and each move of the address from the press
 * that asked for it. After the cache has been restored, so a page drawn from it is said to have drawn held rows; on a
 * workspace's page alone (the home sends the tab on). Only a deployed build reports: a production build run on a laptop
 * has no commit ("dev") and would file its numbers beside the people's.
 */
function measurePages(): void {
  if (!getActiveWorkspace()) return;
  installPageSpeed(speedShell, {
    build: publicEnv.NEXT_PUBLIC_BUILD_SHA,
    report: publicEnv.productionBuild && publicEnv.NEXT_PUBLIC_BUILD_SHA !== "dev",
  });
  // What the tab could not hear or read goes beside its page speed (hearing/freshness.ts; the page-open PRD, L7).
  installFreshnessReports();
  // A phone's screen kept as it is put away, for the next visit's first paint, and what stands of the last let go in time
  // (surfaces/frame/first-rows.ts).
  installFirstRows();
}

/**
 * And one somebody is reaching for (a pointer at its row, the phone's drawer opening) reads the same now, so the press finds
 * it in or on its way (surface-registry.ts warmWhatItDraws): Reports, which no other page's boot reads. Its code too, where
 * the page is a chunk of its own the boot does not carry: Campaigns' Sequences, its sheets and the Library's pane
 * (campaigns-code.tsx). And a sequence's record, which its row under the pointer reads as People's rows read a person.
 */
function warmWhatIsReachedFor(): void {
  const warmItsReads = warmWhatItDraws(FRAME_SURFACES, readAgain);
  onRouteReachedFor((route) => {
    warmItsReads(route);
    warmCampaignsCode(route);
    warmSequenceRoute(route);
  });
}

/**
 * The page the address opens as it loads, where it is Campaigns: its code fetched now, beside the frame's own, not once the
 * page has drawn and asked for it; and a sequence's record, the reads the document's head started for it, taken into the
 * record's caches now. The record mounts only once Sequences' chunk is in, after the boot's first pass has let go of what
 * the head started and nobody took (api.ts dropPrefetched), and it asked for both again (19 Oct 2026, a local build:
 * started at 44 ms, asked again at 976 and 1,260).
 */
function warmThePageOpened(): void {
  if (typeof window === "undefined") return;
  const opened = routeOnScreen();
  warmCampaignsCode(opened);
  // And the view it opens on, Sequences or another, its first draw held for its code (campaigns/home/opening.ts).
  campaignsOpensOn(opened);
  // And Reports' Campaigns lens, whose scope's row is a chunk of its own (reports/campaigns-one-code.ts).
  campaignsLensOpensOn(opened);
  warmSequenceRoute(opened);
}

/**
 * A page's Retry: re-read ONE surface through the runner, by its key, so the cache, the status and the pill agree with
 * what is on screen. The pages' FailedRead presses this; a whole-page reload was the Team card's way.
 */
function installSurfaceRefresh(): void {
  provide("refreshSurface", async (key) => {
    const o = FRAME_SURFACES.find((s) => s.key === key);
    if (o) await refreshSurfaces([o]);
  });
}

/**
 * A refused sign-in is not a route.
 *
 * Supabase returns a failed provider sign-in in the URL fragment, and the browser carries it through the callback's
 * redirect AND through the middleware's bounce off /login when the person does have a session. It arrives here. The
 * shell once read it as a route and drew `No surface at "error=server_error&error_code=..."` -- a sign-in failure
 * wearing a routing error's clothes. A route always begins "#/" now (contracts routeOfHash), so the address cannot
 * mistake it, and it is still taken out of the address so nothing else reads it.
 *
 * In the boot for the same reason as the route gate: anything that runs in an effect is already too late, and the page
 * would draw with the fragment in its address for a frame. Replaced rather than pushed, because that address is not
 * somewhere to go Back to.
 */
function installAuthHashScrub(): void {
  const refused = authErrorInHash(window.location.hash);
  if (!refused) return;
  pageReport.warn("oauth_provider_refused", JSON.stringify(refused));
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

/** The boot, in its order. */
export const FRAME_INSTALLS: readonly FrameInstall[] = [
  // Before anything below asks for it: a boot is coming (workspace.ts bootComing), so what waits for the boot waits for
  // the one the runner starts in its effect, not for none.
  { name: "bootComing", run: bootComing },
  // And the page on screen will say when it is drawn: what other pages read waits for that too (hearing/page-waits.ts). A
  // page with a first part (contracts PRIMARY_PART) is drawn once that part's rows are, the moment its READY is measured
  // from: its gate opened a beat before its rows were on the screen (the Calendar's board 0.15 s after its frame).
  { name: "drawComing", run: drawComing },
  {
    name: "firstPartDrawn",
    run: () =>
      hearPartReady((page, part) => {
        if (PRIMARY_PART[page] === part) pageDrawn();
      }),
  },
  // First: every page says a time by the workspace's clock (zone.ts), from the first paint.
  { name: "clock", run: installClock },
  // Who is acting, which every gate asks from the first draw (identity.ts): made here, completed by `identity` below.
  { name: "roleStore", run: installRoleStore },
  // The one tooltip a control shows (frame/tip.ts), and where focus last stood outside a dialog, for it to go back to
  // when the dialog closes (kit/focus/trap.ts).
  { name: "tip", run: installTip },
  { name: "focusOutside", run: hearFocusOutside },
  // What a tab keeps for its pages -- a view's place, a half-done draft -- before any page reads it (tab-memory.ts).
  { name: "tabMemory", run: installTabMemory },
  { name: "inboxVerbs", run: installInboxVerbs },
  { name: "peopleCourier", run: installPeopleCourier },
  // The streets under the lead map, when the product hosts a basemap (surfaces/leads/map/lead-map.ts); unset, the page
  // keeps its square.
  { name: "leadMap", run: () => installLeadMap(publicEnv.NEXT_PUBLIC_LEAD_MAP_BASE) },
  // Before React: the approval chips and the matrix read the workspace's real modes from the first paint, including from
  // the cache.
  { name: "policyStore", run: () => installPolicyStore(policiesNow) },
  // The bell: fed by the rows the surfaces already hold, read state on this device, and a system alert when something
  // new needs the owner while the app is in the background. Listens for the surface events, so it must be installed
  // before the first fetch resolves.
  { name: "bell", run: installNotifications },
  { name: "ask", run: installAsk },
  { name: "broadcasts", run: installBroadcasts },
  { name: "playbooks", run: installPlaybooks },
  { name: "replies", run: installReplies },
  { name: "calendar", run: installCalendar },
  // The three, Today's face: the character, its driver and the turn reducer (mascot/index.ts). On a phone the three take
  // a page in as it arrives and notice what comes for you (arrival.ts).
  { name: "arrival", run: installArrival },
  // Inside the native shell the page speaks the bridge (app-bridge.ts): its route, its needs, the shell's asks.
  { name: "appBridge", run: installAppBridge },
  { name: "setup", run: installSetup },
  { name: "billing", run: installBilling },
  { name: "identity", run: installIdentity },
  { name: "shell", run: installShell },
  { name: "serviceWorker", run: registerServiceWorker },
  // AFTER the manifest has installed its seeds, and BEFORE React renders anything. That ordering is the whole point: a
  // refresh paints real data from the previous visit instead of a frame of mockup numbers that get corrected a moment
  // later.
  { name: "cache", run: () => markHydrated(hydrateSurfaceCache()) },
  // A tab opened on a person's page asks for them now, ahead of every surface's boot: the page is their read alone.
  { name: "personOnScreen", run: warmPersonOnScreen },
  // And one opened on a pane of Settings, what that pane draws that is no surface (Team's partner, the log, the doors).
  { name: "settingsPaneOnScreen", run: settingsPaneOnScreen },
  { name: "pageSpeed", run: measurePages },
  // Each surface's own signal (surface-status.ts): its events counted against its key, before React draws anything. The
  // pages redraw on it through `useSurface` (surface-status.ts), and FrameApp on the workspace's.
  { name: "surfaceSignals", run: () => hearSurfaces(FRAME_SURFACES) },
  // What a page draws and has not read is read once as it comes on screen (surface-registry.ts readWhatWasMissed): a
  // surface that let a message pass while its page was elsewhere (onlyOnItsPage) or that a pass left for its page
  // (keepForItsPage), and one read only where it is drawn (onDemand) that was never read or has aged. One of those whose
  // read is out already (the press's reach started it, warmWhatItDraws below) takes that read: queued behind it, a second
  // read the same rows again, and the page drew them twice (Ruben, 12 Nov 2026: Content "refreshed" as it was pressed,
  // where Sequences and Messages did not).
  { name: "missedReads", run: () => readWhatWasMissed(FRAME_SURFACES, readAgainUnlessOut) },
  { name: "reachedFor", run: warmWhatIsReachedFor },
  // Campaigns, reached for once the frame is idle: a door on every page whose list the boot does not read and whose code
  // it does not carry, so the first press finds its page, its list and its code in, as the Inbox's are.
  { name: "campaignsSoon", run: () => warmCampaignsSoon(reachFor) },
  // The Calendar's campaigns, read off the Calendar once its page has its own reads, so they come in with its weeks,
  // which every boot reads: its rows of campaigns came half a second after its meetings and pushed them down
  // (runs-surface.ts readRunsSoon). The read alone, not the reach: the Calendar's code is a press's to fetch.
  { name: "calendarRunsSoon", run: () => readRunsSoon(() => void refreshSurfaces([calendarRunsOverride])) },
  // And what Today's first draw waits for that no other page reads (Google's reviews, the drafts kept for its rows, the
  // period's headline, its cards' own reads), off Today once its page has its own reads, so a press to Today draws at once
  // (today/first-draw-read.ts readTodaySoon). Its read is out already where a press began it: that one is taken.
  { name: "todaySoon", run: () => readTodaySoon(readAgainUnlessOut) },
  { name: "pageOpened", run: warmThePageOpened },
  // The shell's route gate, in the boot, not in an effect: surfaces/frame/shell-hooks.ts computes `routeLoading`'s
  // INITIAL state during its first render, and it is a child of FrameApp: children render before parent effects run, so
  // a gate installed in one was undefined at the only moment it mattered (surface-registry.ts installRouteGate, which
  // says what that painted).
  { name: "routeGate", run: installRouteGate },
  { name: "surfaceRefresh", run: installSurfaceRefresh },
  { name: "authHashScrub", run: installAuthHashScrub },
  // Same ordering argument as the route gate: the shell decides real-vs-demo during its FIRST render, so the
  // classification must exist before React does.
  { name: "surfaceRegistry", run: installSurfaceRegistry },
];

let booted = false;

/** Run the boot, once: FrameApp calls it at its module scope, before React draws; a second call does nothing. */
export function bootFrame(): void {
  if (booted) return;
  booted = true;
  for (const step of FRAME_INSTALLS) step.run();
}
