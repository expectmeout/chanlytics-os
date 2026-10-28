"use client";

/**
 * The Phase-A bridge (Blueprint §7): replaces Chanlytics.html's inline boot
 * script. Seeds globals, evaluates the ordered manifest, enforces the boot
 * gate, and renders ChanlyticsApp inside OUR React tree with the exact props
 * the original App wrapper passed. Prefs (theme/look/density/rail) live in
 * localStorage — view preferences only. Surface flips run through the
 * SurfaceData runner; the pill reports live/degraded per surface, carries
 * sign-out, and flags stale deployments (version heartbeat).
 */
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from "react";
import { frameDrawn, installPageSpeed, type SpeedShell } from "@/client/page-speed";
import {
  FIRST_RUN_ROUTE,
  LIFECYCLE_WORDS,
  type PendingWorkspace,
  type Theme,
  type LookPref,
} from "@chanlytics/contracts";
// The live feed's own entry: the package's index is the server's repositories, and reached the browser whole for this.
import { authErrorInHash } from "@/auth/hash-error";
import { paintThemeColor } from "./theme-color";
import { FrameHead } from "@/surfaces/kit/head/frame-head";
import { NewConversationHost } from "@/surfaces/inbox/new-conversation/host";
import { BookingToolHost } from "@/surfaces/settings/booking-tool/host";
import { loadPrefs, choosePref, documentStamps, type Prefs, type ChosenPref } from "./device-prefs";
import "./seed-globals"; // must evaluate before the manifest
import "./manifest";
// legacy.css is NOT imported here: it lives in app/(os)/layout.tsx so the
// 254KB design system ships as document <link>s and downloads in parallel
// with this chunk, rather than serially behind it.
import { workspaceOverride, switchWorkspace, type Workspace } from "./surface-data";
import { conversationsOverride } from "@/surfaces/inbox/conversations-surface";
import { inboxOverride } from "@/surfaces/inbox/surface";
import { todayOverride } from "@/surfaces/today/override";
import { settingsOverride } from "./surfaces/settings";
import { channelsOverride } from "@/surfaces/channels/surface";
import { peopleOverride } from "@/surfaces/people/surface";
import { reportsOverride } from "@/surfaces/reports/surface";
import { reportsHeadlineOverride } from "@/surfaces/reports/headline";
import { reviewsOverride } from "@/surfaces/reports/reviews-surface";
import { receptionistOverride } from "@/surfaces/reports/receptionist-surface";
import { reportsPeopleOverride } from "@/surfaces/reports/people-surface";
import { reportsCampaignsOverride } from "@/surfaces/reports/campaigns-surface";
import { SURFACE_ROUTES } from "@/surfaces/routes";
import { liveOverride } from "@/surfaces/live/surface";
import { broadcastsOverride } from "@/surfaces/campaigns/broadcasts/surface";
import { audiencesOverride } from "@/surfaces/campaigns/broadcasts/audiences-surface";
import { playbooksOverride } from "@/surfaces/campaigns/playbooks/surface";
import { warmCampaignsCode, warmCampaignsSoon } from "@/surfaces/campaigns/home/campaigns-code";
import { warmSequenceRoute } from "@/surfaces/campaigns/sequences/verbs";
import { calendarOverride } from "@/surfaces/calendar/surface";
import { calendarRunsOverride, readRunsSoon } from "@/surfaces/calendar/runs-surface";
import { todayPinsOverride } from "@/surfaces/today/pins-surface";
import { askMorningOverride } from "@/surfaces/today/ask-morning-surface";
import { replyDraftsOverride } from "@/surfaces/today/need-you/drafts-surface";
import { askMemoryOverride } from "@/surfaces/settings/memory/surface";
import { notificationsOverride } from "./surfaces/notifications";
import {
  getConnection,
  getSurfaceStatuses,
  isSurfaceReady,
  markHydrated,
  onSurfaceStatusChange,
  refreshSurfaces,
  startSurfaces,
} from "./surface-runner";
import { joinLiveFeed } from "./hearing/live-feed";
import { hydrateSurfaceCache } from "./surface-cache";
import { hearSurfaces, surfaceHook } from "./surface-status";
import { installInboxVerbs } from "./inbox-verbs";
import { installPeopleCourier, personOverride, warmPersonOnScreen } from "@/surfaces/people/people-detail";
import { leadsOverride } from "@/surfaces/leads/override";
import { installLeadMap } from "@/surfaces/leads/map/lead-map";
import { installTabMemory } from "./tab-memory";
import { installPolicyStore } from "./policy-store";
import { installNotifications } from "./notifications";
import { installAsk } from "./ask";
import { installBroadcasts } from "@/surfaces/campaigns/broadcasts/verbs";
import { installPlaybooks } from "@/surfaces/campaigns/playbooks/verbs";
import { reachOutsOverride } from "@/surfaces/campaigns/reach-out/override";
import { sequencesOverride } from "@/surfaces/campaigns/sequences/surface";
import { installReplies, repliesOverride } from "./reach-out/replies";
import { installCalendar } from "@/surfaces/calendar/verbs";
import { installMascot } from "./mascot";
import { installArrival } from "./arrival";
import { installAppBridge } from "./app-bridge";
import { installSetup, setupOverride } from "@/surfaces/setup/override";
import { googleOverride } from "./google";
import { installBilling, billingOverride } from "@/surfaces/settings/billing/surface";
import { alertsOverride } from "@/surfaces/settings/notifications/surface";
import { partnerOverride } from "@/surfaces/settings/partner/surface";
import { installIdentity } from "./identity";
import { fillDoors } from "../surfaces/frame-doors";
import { ChanlyticsApp } from "@/surfaces/frame/app-shell";
import { SURFACE_LABELS, installShell, publishShellStatus, shellStatusOf } from "./shell";
import { installClock } from "./zone";
// The handover, which the shell asks on every boot, is its own small module; the create screen is fetched as it is drawn.
import { useHandoverAsk } from "./invitations/handover";
import { codeOnce } from "@/lib/code-once";
import { useCode } from "@/lib/use-code";
import { FailedRead } from "@/surfaces/kit/empty/empty";
import { JoinedNote } from "./invitations/joined-note";
import type { OpenHandoverDto } from "@chanlytics/contracts";
import { publicEnv } from "@/lib/public-env";

/**
 * The create screen as the frame draws it (LegacyApp): for an account with no workspace yet, and from the workspace menu
 * for another. Its code (CreateWorkspace.tsx: the form, sign-up's words, the waitlist, the first run's kicker) is fetched
 * when the screen is drawn, which almost no boot does: in the frame it was about 19 KB, compressed, that every first
 * load parsed before any page could draw (the loadability review, 19 Oct 2026). The shell's quiet words stand where it
 * will be while it comes, and a fetch that failed says so, with its retry.
 */
const createScreenCode = codeOnce(() => import("./CreateWorkspace"));

function CreateWorkspace(props: ComponentProps<typeof import("./CreateWorkspace").default>) {
  const { loaded: screen, failed, retry } = useCode(createScreenCode, true);
  if (screen) return <screen.default {...props} />;
  if (failed) return <FailedRead kind="line" what="this page" onRetry={retry} testid="create-workspace-failed" />;
  return (
    <div className="route-reading" role="status">
      {LIFECYCLE_WORDS.reading}
    </div>
  );
}

// Before anything below asks for it: a boot is coming (workspace.ts bootComing), so what waits for the boot waits for the one
// the runner starts in its effect, not for none.
bootComing();
// First: every page says a time by the workspace's clock (zone.ts), from the first paint.
installClock();
// What a tab keeps for its pages -- a view's place, a half-done draft -- before any page reads it (tab-memory.ts).
installTabMemory();
installInboxVerbs();
installPeopleCourier();
// The streets under the lead map, when the product hosts a basemap (surfaces/leads/map/lead-map.ts); unset, the page keeps its square.
installLeadMap(publicEnv.NEXT_PUBLIC_LEAD_MAP_BASE);
// After the manifest (which seeds window.POLICY) and before React: the
// approval chips and the matrix read the workspace's real modes from the
// first paint, including from the cache.
installPolicyStore();
// The bell: fed by the rows the surfaces already hold, read state on this
// device, and a system alert when something new needs the owner while the
// app is in the background. Listens for the surface events, so it must be
// installed before the first fetch resolves.
installNotifications();
installAsk();
installBroadcasts();
installPlaybooks();
installReplies();
installCalendar();
// The three, Today's face: the character, its driver and the turn reducer (mascot/index.ts).
installMascot();
// On a phone the three take a page in as it arrives and notice what comes for you (arrival.ts).
installArrival();
// Inside the native shell the page speaks the bridge (app-bridge.ts): its route, its needs, the shell's asks.
installAppBridge();
installSetup();
installBilling();
installIdentity();
installShell();
// The installable shell's service worker (public/sw.js). It caches nothing
// and answers nothing — the workspace is live data — and exists so a phone
// can add the app to its home screen. Production only: a worker on a dev
// origin outlives the dev server and confuses the next session.
if (typeof window !== "undefined" && "serviceWorker" in navigator && publicEnv.productionBuild) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// Runs at module scope — AFTER the manifest has installed its seeds, and
// BEFORE React renders anything. That ordering is the whole point: a refresh
// paints real data from the previous visit instead of a frame of mockup
// numbers that get corrected a moment later.
markHydrated(hydrateSurfaceCache());
// A tab opened on a person's page asks for them now, ahead of every surface's boot: the page is their read alone.
warmPersonOnScreen();

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
// Where each page's time goes: the document's visit begins at its start, and each move of the address from the press
// that asked for it. After the cache has been restored, so a page drawn from it is said to have drawn held rows; on a
// workspace's page alone (the home sends the tab on). Only a deployed build reports: a production build run on a laptop
// has no commit ("dev") and would file its numbers beside the people's.
if (getActiveWorkspace())
  installPageSpeed(speedShell, {
    build: publicEnv.NEXT_PUBLIC_BUILD_SHA,
    report: publicEnv.productionBuild && publicEnv.NEXT_PUBLIC_BUILD_SHA !== "dev",
  });

// The mockup's own data-before-mount contract (boot gate): the shell's contracts and the seeded charter, which the frame's
// helpers publish (surfaces/frame/frame-globals.ts). The frame itself is imported (surfaces/frame/app-shell.tsx, the
// one-system plan's step 7e). The seeded Inbox (INBOX_DATA) is a demo session's alone: a real session's is its first
// read's, which no page waits on to mount (X6-1).
const REQUIRED = ["CHANLY", "POLICY"] as const;

// leadsOverride rides beside peopleOverride: Leads is the other scope of that page.
const SURFACES = [
  workspaceOverride,
  conversationsOverride,
  inboxOverride,
  todayOverride,
  settingsOverride,
  // The channels the workspace is reached on, read once for Connections, the Library, Live and the composers (surfaces/channels).
  channelsOverride,
  peopleOverride,
  leadsOverride,
  reportsOverride,
  // Today's period line and Worth a look: one small read of the period Reports shows (surfaces/reports/headline.ts).
  reportsHeadlineOverride,
  // The Reviews lens's own read, folded once: its figures, its cards and its head (surfaces/reports/reviews-surface.ts).
  reviewsOverride,
  // The Receptionist lens's own read, as the route gave it: the page folds it (surfaces/reports/receptionist-surface.ts).
  receptionistOverride,
  // The People lens's own read, as the route gave it: the page folds it (surfaces/reports/people-surface.ts).
  reportsPeopleOverride,
  // The Campaigns lens's own reads, each as its route gave it: the page folds them (surfaces/reports/campaigns-surface.ts).
  reportsCampaignsOverride,
  liveOverride,
  broadcastsOverride,
  playbooksOverride,
  // Who each audience a broadcast offers reaches, read where a composer is drawn (surfaces/campaigns/broadcasts/audiences-surface.ts).
  audiencesOverride,
  // A reach-out's chains and their emails (Part 4 PR 8): Playbooks' rows and Templates' email rows.
  reachOutsOverride,
  // Campaigns › Sequences (decision 0060): its list, read where its view is drawn (surfaces/campaigns/sequences/surface.ts).
  sequencesOverride,
  repliesOverride,
  // The partner's account (0012): on the person, read once, beside the rest.
  partnerOverride,
  // What reaches this member's phones: read where Settings › Notifications is drawn (ROUTE_DRAWS).
  alertsOverride,
  // Campaigns over the Calendar's days, read where the Calendar draws them (surfaces/calendar/runs-surface.ts).
  calendarRunsOverride,
  // The counts of the lists pinned to Today, read where Today draws them (surfaces/today/pins-surface.ts; R10).
  todayPinsOverride,
  // Ask's morning, read where Today draws its ideas in Need you, and what Ask remembers, where Settings › Memory is drawn (decision 0070).
  askMorningOverride,
  askMemoryOverride,
  // The drafts Ask kept for the rows of Need you, read with Today's own first reads (surfaces/today/need-you/drafts-surface.ts).
  replyDraftsOverride,
  calendarOverride,
  notificationsOverride,
  setupOverride,
  googleOverride,
  billingOverride,
  // A person's page: the one person on screen, read again when what the page draws of them changes (people-detail.ts).
  personOverride,
];
/**
 * Each surface's own signal (surface-status.ts): its events counted against its key, before React draws anything. The
 * pages redraw on it through `useSurface` (seed-globals.ts), and this component on the workspace's.
 */
hearSurfaces(SURFACES);
const useSurface = surfaceHook({ useCallback, useSyncExternalStore });
// What a page draws and has not read is read once as it comes on screen (surface-registry.ts readWhatWasMissed): a surface that
// let a message pass while its page was elsewhere (onlyOnItsPage) or that a pass left for its page (keepForItsPage), and one read
// only where it is drawn (onDemand) that was never read or has aged.
readWhatWasMissed(SURFACES, (keys) => void refreshSurfaces(SURFACES.filter((o) => keys.includes(o.key))));
// And one somebody is reaching for (a pointer at its row, the phone's drawer opening) reads the same now, so the press finds
// it in or on its way (surface-registry.ts warmWhatItDraws): Reports, which no other page's boot reads. Its code too, where
// the page is a chunk of its own the boot does not carry: Campaigns' Sequences, its sheets and the Library's pane
// (campaigns-code.tsx). And a sequence's record, which its row under the pointer reads as People's rows read a person.
const warmItsReads = warmWhatItDraws(
  SURFACES,
  (keys) => void refreshSurfaces(SURFACES.filter((o) => keys.includes(o.key))),
);
onRouteReachedFor((route) => {
  warmItsReads(route);
  warmCampaignsCode(route);
  warmSequenceRoute(route);
});
// Campaigns, reached for once the frame is idle: a door on every page whose list the boot does not read and whose code it
// does not carry, so the first press finds its page, its list and its code in, as the Inbox's are.
warmCampaignsSoon(reachFor);
// The Calendar's campaigns, read once the frame is idle off the Calendar, so they come in with its weeks, which every boot
// reads: its rows of campaigns came half a second after its meetings and pushed them down (runs-surface.ts readRunsSoon).
// The read alone, not the reach: the Calendar's code is a press's to fetch.
readRunsSoon(() => void refreshSurfaces([calendarRunsOverride]));
// The page the address opens as it loads, where it is Campaigns: its code fetched now, beside the frame's own, not once the
// page has drawn and asked for it; and a sequence's record, the reads the document's head started for it, taken into the
// record's caches now. The record mounts only once Sequences' chunk is in, after the boot's first pass has let go of what
// the head started and nobody took (api.ts dropPrefetched), and it asked for both again (19 Oct 2026, a local build:
// started at 44 ms, asked again at 976 and 1,260).
if (typeof window !== "undefined") {
  const opened = routeOnScreen();
  warmCampaignsCode(opened);
  warmSequenceRoute(opened);
}

// Which flipped surface backs each route, and which routes are real at all —
// both live in surface-registry.ts so the classification and the wiring cannot
// drift apart. Routes absent from ROUTE_SURFACE are seeded by design and are
// always "ready" — the registry decides separately whether they may RENDER.
import {
  installRouteGate,
  installSurfaceRegistry,
  readWhatWasMissed,
  routeGateOpen,
  routePartsOf,
  routeSurfaceFor,
  routeSurfaces,
  warmWhatItDraws,
} from "./surface-registry";
import {
  bootComing,
  getActiveWorkspace,
  hearAddress,
  onRouteAsked,
  onRouteReachedFor,
  reachFor,
  routeOnScreen,
} from "./workspace";
import { LeadOverMount } from "@/surfaces/leads/sheet/over-mount";
import { SeeOverMount } from "@/surfaces/see/see-mount";

/**
 * The shell's route gate, installed at MODULE SCOPE — not in an effect.
 *
 * surfaces/frame/shell-hooks.ts computes `routeLoading`'s INITIAL state during its first
 * render, and it is a child of this component: children render before parent
 * effects run, so a gate installed in one was undefined at the only moment it
 * mattered (surface-registry.ts installRouteGate, which says what that painted).
 */
installRouteGate();
/**
 * A page's Retry: re-read ONE surface through the runner, by its key, so the
 * cache, the status and the pill agree with what is on screen. The pages'
 * FailedRead presses this; a whole-page reload was the Team card's way.
 */
function installSurfaceRefresh(): void {
  const w = window as unknown as { __refreshSurface?: (key: string) => Promise<void> };
  w.__refreshSurface = async (key) => {
    const o = SURFACES.find((s) => s.key === key);
    if (o) await refreshSurfaces([o]);
  };
}
installSurfaceRefresh();
/**
 * A refused sign-in is not a route.
 *
 * Supabase returns a failed provider sign-in in the URL fragment, and the
 * browser carries it through the callback's redirect AND through the
 * middleware's bounce off /login when the person does have a session. It
 * arrives here. The shell once read it as a route and drew `No surface at
 * "error=server_error&error_code=..."` -- a sign-in failure wearing a routing
 * error's clothes. A route always begins "#/" now (contracts routeOfHash), so
 * the address cannot mistake it, and it is still taken out of the address so
 * nothing else reads it.
 *
 * Module scope for the same reason as the route gate above: anything that
 * runs in an effect is already too late, and the page would draw with the
 * fragment in its address for a frame. Replaced rather than pushed, because
 * that address is not somewhere to go Back to.
 */
function installAuthHashScrub(): void {
  const refused = authErrorInHash(window.location.hash);
  if (!refused) return;
  console.warn("oauth_provider_refused", JSON.stringify(refused));
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}
installAuthHashScrub();
// Same ordering argument as the route gate: the shell decides real-vs-demo
// during its FIRST render, so the classification must exist before React does.
installSurfaceRegistry();

/**
 * This browser's storage, where this device's preferences are kept (device-prefs.ts), looked up at each read and
 * write so that a blocked site's throwing getter is caught there. The document's head reads the same place before
 * first paint (contracts themeBootScript).
 */
const browserStorage = () => localStorage;

/** Whether the device prefers dark, kept current while the app is open. */
function useSystemDark(): boolean {
  const [dark, setDark] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return undefined;
    const on = () => setDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return dark;
}

/**
 * The theme and the look on the document, as device-prefs.ts works them out (documentStamps), each stamped again
 * whenever it changes: what the head's script stamped before first paint (contracts themeBootScript). The browser's
 * own bars go with the theme, so switching it moves them with the page instead of leaving the phone's address bar in
 * the other one's paper.
 */
function useDocumentStamps(theme: Theme, look: LookPref): void {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    paintThemeColor(document, theme, look);
  }, [theme, look]);
  useEffect(() => {
    document.documentElement.setAttribute("data-look", look);
  }, [look]);
}

const SharedReports = lazy(() => import("@/surfaces/reports/reports-page").then((m) => ({ default: m.ReportsPage })));
const SHARED_PAGE = (
  <Suspense fallback={null}>
    {/* The shared viewer has no workspace path: it shows the Overview. */}
    <SharedReports pathname={null} />
  </Suspense>
);

/** Drawn again when the surfaces of a route move, as the shell is (surface-status.ts surfaceHook over routeSurfaces). */
const useRouteMoved = surfaceHook({ useCallback, useSyncExternalStore }, routeSurfaces);

/**
 * Says each draw of the frame to the page's measures (client/page-speed.ts frameDrawn): drawn again when the surfaces
 * of the route on screen move, in the same draw as the shell, so a page with no first part of its own is READY at the
 * frame its gate opened in, never at one before the page was put on it.
 */
function SpeedFrame({ route }: { route: string | null }) {
  const [page, param] = routeParts(route ?? routeOnScreen());
  useRouteMoved({ page, param });
  useLayoutEffect(() => frameDrawn());
  return null;
}

/** The workspaces this account may open, as the workspace's read last said. */
const listedWorkspaces = (): Workspace[] => (window as unknown as { __WORKSPACES?: Workspace[] }).__WORKSPACES ?? [];

/**
 * The shell as an element kept until one of its props changes, its callbacks made once: LegacyApp draws again when the
 * workspace moves or a preference does, and the shell under it is drawn again only for a preference. Each page redraws
 * on its own surfaces (surface-status.ts), and the shell on the route's (surfaces/frame/app-shell.tsx). It was drawn again, with three
 * new callbacks, on every surface's read.
 */
function useShellApp(
  prefs: Prefs,
  theme: Theme,
  look: LookPref,
  choose: (key: ChosenPref, v: string) => void,
  routePage: ReactNode,
  route: string | null,
) {
  const onTheme = useCallback((v: string) => choose("theme", v), [choose]);
  const onLook = useCallback((v: string) => choose("look", v), [choose]);
  const onSidebar = useCallback((v: string) => choose("sidebar", v), [choose]);
  const { theme: themePref, sidebar, inboxDensity, showInboxAgentRail } = prefs;
  return useMemo(
    () => (
      <>
        <ChanlyticsApp
          theme={theme}
          themePref={themePref}
          onTheme={onTheme}
          look={look}
          onLook={onLook}
          sidebar={sidebar}
          onSidebar={onSidebar}
          inboxDensity={inboxDensity}
          showInboxAgentRail={showInboxAgentRail}
          routePage={routePage}
          routeNow={route}
          surfaceRoutes={SURFACE_ROUTES}
          sharedPage={SHARED_PAGE}
          fillDoors={fillDoors}
        />
        {/* The head Glass draws into the shell's places (kit/head/frame-head.tsx): beside the shell, in one tree. */}
        <FrameHead look={look} />
        {/* What New conversation opens, held once for every page that asks for it (inbox/new-conversation/host.tsx). */}
        <NewConversationHost />
        {/* The Booking tool's sheet, on whichever page a door to it was pressed (settings/booking-tool/host.tsx). */}
        <BookingToolHost route={route} />
        {/* A lead's sheet over whichever page its address opens it on (`?lead=`, leads/sheet/over-mount.tsx). */}
        <LeadOverMount />
        {/* A run or a message open over whichever page it was pressed on (`?see=`, surfaces/see/see-mount.tsx: the Campaigns
              wiring review's rule C), with the frame's own toast host, so what it says outlives the sheet. */}
        <SeeOverMount />
        {/* "You joined Harbor", when the one accept of the boot seated this person in a workspace (invitations/accept.ts). */}
        <JoinedNote />
        {/* Each draw of the frame, said to the page's measures (client/page-speed.ts). */}
        <SpeedFrame route={route} />
      </>
    ),
    [theme, themePref, onTheme, look, onLook, sidebar, onSidebar, inboxDensity, showInboxAgentRail, routePage, route],
  );
}

/**
 * `routePage`: the page of the route on screen, when that route has one of its own (src/surfaces/routes.ts): the layout's
 * children, which LegacyHost hands over only while the address is such a route, so a move between the shell's own routes
 * draws this frame no more than it did. `route`: the route of the router's pathname (LegacyHost), or null where there is
 * none (the home), and then the frame hears the address itself.
 */
export default function LegacyApp({ routePage, route }: { routePage?: ReactNode; route: string | null }) {
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs(browserStorage));
  // Another workspace, asked for from the workspace menu (shell.createWorkspace).
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const on = () => setCreating(true);
    window.addEventListener("shell:create-workspace", on);
    return () => window.removeEventListener("shell:create-workspace", on);
  }, []);
  const systemDark = useSystemDark();
  const { theme, look } = documentStamps(prefs, systemDark);
  // Who is looking and their workspaces: drawn again when the workspace's read lands or its status moves, and by
  // no other surface's (the pages hear their own).
  useSurface("workspace");
  const allWorkspaces = listedWorkspaces();
  const me = (window as unknown as { __ME?: { email?: string | null; handovers?: OpenHandoverDto[] } }).__ME;
  const handover = useHandoverAsk(isSurfaceReady("workspace"), me?.handovers);
  // What the shell alone knows — the connection, the live feed, a newer
  // build, surfaces that stopped refreshing — goes to the line under the top
  // bar through the shell bridge, which is where the floating pill used to
  // say it. The connection changes through the surfaces' own listeners.
  const staleRef = useRef(false);
  const publishStatus = useCallback(() => {
    publishShellStatus(shellStatusOf(getSurfaceStatuses(), getConnection(), staleRef.current, SURFACE_LABELS));
  }, []);

  const missing = useMemo(() => REQUIRED.filter((k) => !(window as unknown as Record<string, unknown>)[k]), []);

  // A press on the theme, the look or the rail: device-prefs.ts checks it and keeps it, and this holds the result.
  const choose = useCallback(
    (key: ChosenPref, v: string) => setPrefs((p) => choosePref(browserStorage, p, key, v)),
    [],
  );
  const shellApp = useShellApp(prefs, theme, look, choose, routePage, route);

  useDocumentStamps(theme, look);
  // Viewport scoping, exactly what the inline boot script did.
  useEffect(() => {
    document.documentElement.classList.add("legacy-on");
    return () => document.documentElement.classList.remove("legacy-on");
  }, []);

  // Surface flips: one runner owns retries, realtime, debounce, and status. A status that changed, or the connection,
  // is the line's to say; it draws nothing here.
  useEffect(() => {
    const stop = startSurfaces(SURFACES, joinLiveFeed);
    const off = onSurfaceStatusChange(publishStatus);
    return () => {
      stop();
      off();
    };
  }, [publishStatus]);

  // Version heartbeat: a hash-routed tab lives for days; flag stale deploys
  // instead of letting a dead chunk reference white-screen the operator.
  useEffect(() => {
    let initial: string | null = null;
    const check = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const j = (await r.json()) as { sha?: string };
        if (!j.sha) return;
        if (initial === null) initial = j.sha;
        else if (j.sha !== initial && !staleRef.current) {
          staleRef.current = true;
          publishStatus();
        }
      } catch {
        /* offline — ignore */
      }
    };
    void check();
    const onVisible = () => document.visibilityState === "visible" && void check();
    // Back from offline: a deploy may have landed meanwhile.
    const onOnline = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    const t = setInterval(() => void check(), 15 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      clearInterval(t);
    };
  }, [publishStatus]);

  if (missing.length) {
    return (
      <div
        style={{
          height: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "Geist, sans-serif",
          color: "#666",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#333" }}>Chanlytics didn&apos;t finish loading</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Missing: {missing.join(", ")} — refresh to retry.</div>
        </div>
      </div>
    );
  }

  /**
   * An account that belongs to nowhere gets the create screen, not the app.
   *
   * Gated on the workspace surface being READY, not merely on the list being
   * empty — before the fetch lands every account looks like it has no
   * workspaces, and flashing "create your workspace" at an owner who has one
   * is the same class of lie as painting mockup data during a load.
   */
  if (handover) return handover;
  const email = me?.email ?? null;
  if (isSurfaceReady("workspace") && allWorkspaces.length === 0) {
    // What sign-up kept: the name and clock they typed before the code, so
    // the first workspace is one press rather than the same form twice.
    const pending =
      (window as unknown as { __PENDING_WORKSPACE?: PendingWorkspace | null }).__PENDING_WORKSPACE ?? null;
    // The door this first workspace meets -- the invite code, or the list --
    // for an account that arrived through Google and never saw the sign-up form.
    const posture =
      (window as unknown as { __SIGNUP_POSTURE?: "open" | "waitlist" | "invite" }).__SIGNUP_POSTURE ?? "open";
    return (
      <CreateWorkspace
        email={email}
        initial={pending}
        posture={posture}
        onCreated={(w) => {
          // switchWorkspace persists the choice and re-runs every surface, so the new workspace is the one the app
          // opens on, on its first run (#/start). By its slug: it is not in __WORKSPACES yet, and by id it boots twice.
          switchWorkspace(w.id, w.slug, `#/${FIRST_RUN_ROUTE}`);
        }}
      />
    );
  }

  if (creating) {
    return (
      <CreateWorkspace
        email={email}
        onCancel={() => setCreating(false)}
        onCreated={(w) => {
          setCreating(false);
          // The new workspace is the one the app opens on, on its first run
          // (#/start), at its slug, so the app boots once.
          switchWorkspace(w.id, w.slug, `#/${FIRST_RUN_ROUTE}`);
        }}
      />
    );
  }

  return <div id="root">{shellApp}</div>;
}
