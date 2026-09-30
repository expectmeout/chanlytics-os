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
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { FIRST_RUN_ROUTE, type PendingWorkspace, type Theme, type LookPref } from "@chanlytics/contracts";
import { subscribeWorkspaceChanges } from "@chanlytics/db";
import { authErrorInHash } from "@/auth/hash-error";
import { createClient } from "@/lib/supabase/client";
import { paintThemeColor } from "./theme-color";
import { loadPrefs, choosePref, documentStamps, type Prefs, type ChosenPref } from "./device-prefs";
import "./seed-globals"; // must evaluate before the manifest
import "./manifest";
// legacy.css is NOT imported here: it lives in app/(os)/layout.tsx so the
// 254KB design system ships as document <link>s and downloads in parallel
// with this chunk, rather than serially behind it.
import { workspaceOverride, switchWorkspace, type Workspace } from "./surface-data";
import { conversationsOverride } from "@/surfaces/inbox/conversations-surface";
import { inboxOverride } from "@/surfaces/inbox/surface";
import { todayOverride } from "@/surfaces/today/surface";
import { settingsOverride } from "./surfaces/settings";
import { peopleOverride } from "./surfaces/people";
import { reportsOverride } from "@/surfaces/reports/surface";
import { SURFACE_ROUTES } from "@/surfaces/routes";
import { liveOverride } from "@/surfaces/live/surface";
import { broadcastsOverride } from "@/surfaces/campaigns/broadcasts/surface";
import { playbooksOverride } from "@/surfaces/campaigns/playbooks/surface";
import { calendarOverride } from "./surfaces/calendar";
import { notificationsOverride } from "./surfaces/notifications";
import {
  getConnection,
  getSurfaceStatuses,
  isSurfaceReady,
  markHydrated,
  onSurfaceStatusChange,
  refreshSurfaces,
  startSurfaces,
  type JoinLiveFeed,
} from "./surface-runner";
import { hydrateSurfaceCache } from "./surface-cache";
import { hearSurfaces, surfaceHook } from "./surface-status";
import { installInboxVerbs } from "./inbox-verbs";
import { installPeopleCourier, warmPersonOnScreen } from "./people-detail";
import { installLeadsCourier, leadsOverride } from "./leads";
import { installLeadMap } from "./lead-map";
import { installTabMemory } from "./tab-memory";
import { installLists } from "./people-lists";
import { installPolicyStore } from "./policy-store";
import { installNotifications } from "./notifications";
import { installAsk } from "./ask";
import { installWhatsAppConnect } from "./whatsapp-connect";
import { installTemplates } from "@/surfaces/campaigns/templates/verbs";
import { installBroadcasts } from "@/surfaces/campaigns/broadcasts/verbs";
import { installPlaybooks } from "@/surfaces/campaigns/playbooks/verbs";
import { installReachOuts, reachOutsOverride } from "@/surfaces/campaigns/reach-out/surface";
import { installReplies, repliesOverride } from "./reach-out/replies";
import { installCalendar } from "./calendar";
import { installToday } from "@/surfaces/today/helpers";
import { installMascot } from "./mascot";
import { installArrival } from "./arrival";
import { installAppBridge } from "./app-bridge";
import { installBusinessTab } from "./business-tab";
import { installSetup, setupOverride } from "./setup";
import { installGoogle, googleOverride } from "./google";
import { installBilling, billingOverride } from "./billing";
import { installConnections } from "./connections";
import { installMailbox } from "./mailbox";
import { installSendingDomains } from "./sending-domains";
import { installBusinessRecord } from "./business-record";
import { installPlatform } from "./platform";
import { installPartner, partnerOverride } from "./partner";
import { installActivity } from "./activity";
import { installIdentity } from "./identity";
import { installShell, publishShellStatus, shellStatusOf } from "./shell";
import { installClock } from "./zone";
import CreateWorkspace, { useHandoverAsk } from "./CreateWorkspace";
import type { OpenHandoverDto } from "@chanlytics/contracts";
import { publicEnv } from "@/lib/public-env";

// First: every page says a time by the workspace's clock (zone.ts), from the first paint.
installClock();
// What a tab keeps for its pages -- a view's place, a half-done draft -- before any page reads it (tab-memory.ts).
installTabMemory();
installInboxVerbs();
installPeopleCourier();
// The Leads scope of People: its surface reads by view and patches what is
// already loaded, and its courier carries the acts, one named function per
// door (leads.ts).
installLeadsCourier();
// The streets under the lead map, when the product hosts a basemap (lead-map.ts); unset, the page keeps its square.
installLeadMap(publicEnv.NEXT_PUBLIC_LEAD_MAP_BASE);
installLists();
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
installWhatsAppConnect();
installTemplates();
installBroadcasts();
installPlaybooks();
installReachOuts();
installReplies();
installCalendar();
installToday();
// The three, Today's face: the character, its driver and the turn reducer (mascot/index.ts).
installMascot();
// On a phone the three take a page in as it arrives and notice what comes for you (arrival.ts).
installArrival();
// Inside the native shell the page speaks the bridge (app-bridge.ts): its route, its needs, the shell's asks.
installAppBridge();
installBusinessTab();
installSetup();
installGoogle();
installBilling();
installConnections();
installMailbox();
installSendingDomains();
installBusinessRecord();
installPlatform();
installPartner();
installActivity();
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

// The mockup's own data-before-mount contract (boot gate). The Agents roster and the seeded Today (FLEET_DATA,
// CHANLY_DATA) are the demo's, loaded only in a demo session (manifest-demo.ts).
const REQUIRED = ["CHANLY", "INBOX_DATA", "CLIENTS", "POLICY", "ChanlyticsApp"] as const;

// leadsOverride rides beside peopleOverride: Leads is the other scope of that page.
const SURFACES = [
  workspaceOverride,
  conversationsOverride,
  inboxOverride,
  todayOverride,
  settingsOverride,
  peopleOverride,
  leadsOverride,
  reportsOverride,
  liveOverride,
  broadcastsOverride,
  playbooksOverride,
  // A reach-out's chains and their emails (Part 4 PR 8): Playbooks' rows and Templates' email rows.
  reachOutsOverride,
  repliesOverride,
  // The partner's account (0012): on the person, read once, beside the rest.
  partnerOverride,
  calendarOverride,
  notificationsOverride,
  setupOverride,
  googleOverride,
  billingOverride,
];
/**
 * Each surface's own signal (surface-status.ts): its events counted against its key, before React draws anything. The
 * pages redraw on it through `useSurface` (seed-globals.ts), and this component on the workspace's.
 */
hearSurfaces(SURFACES);
const useSurface = surfaceHook({ useCallback, useSyncExternalStore });
// A surface that let a message pass while its page was elsewhere is read once as its page comes on screen
// (surface-registry.ts onlyOnItsPage).
readWhatWasMissed(SURFACES, (keys) => void refreshSurfaces(SURFACES.filter((o) => keys.includes(o.key))));
/** The runner's live feed: the workspace's topic, over this browser's Supabase client. */
const joinLiveFeed: JoinLiveFeed = (onChange, opts) => subscribeWorkspaceChanges(createClient(), onChange, opts);
const SURFACE_LABELS: Record<string, string> = {
  conversations: "Conversations",
  inbox: "Inbox",
  today: "Today",
  people: "People",
  reports: "Reports",
  live: "Calls",
  calendar: "Calendar",
};

// Which flipped surface backs each route, and which routes are real at all —
// both live in surface-registry.ts so the classification and the wiring cannot
// drift apart. Routes absent from ROUTE_SURFACE are seeded by design and are
// always "ready" — the registry decides separately whether they may RENDER.
import { installRouteGate, installSurfaceRegistry, readWhatWasMissed } from "./surface-registry";

/**
 * The shell's route gate, installed at MODULE SCOPE — not in an effect.
 *
 * app-shell.jsx computes `routeLoading`'s INITIAL state during its first
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
    paintThemeColor(document, theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.setAttribute("data-look", look);
  }, [look]);
}

type ChanlyticsAppComponent = React.ComponentType<{
  theme: string;
  themePref: string;
  onTheme: (v: string) => void;
  look: string;
  onLook: (v: string) => void;
  sidebar: string;
  onSidebar: (v: string) => void;
  inboxDensity: string;
  showInboxAgentRail: boolean;
  /** The page of a route that has left the shell, which the layout drew (src/surfaces/routes.ts). */
  routePage: ReactNode;
  surfaceRoutes: typeof SURFACE_ROUTES;
  /** What the shared viewer shows: the Reports page, in a chunk of its own that only that viewer loads. */
  sharedPage: ReactNode;
}>;

const SharedReports = lazy(() => import("@/surfaces/reports/reports-page").then((m) => ({ default: m.ReportsPage })));
const SHARED_PAGE = (
  <Suspense fallback={null}>
    <SharedReports />
  </Suspense>
);

/** The workspaces this account may open, as the workspace's read last said. */
const listedWorkspaces = (): Workspace[] => (window as unknown as { __WORKSPACES?: Workspace[] }).__WORKSPACES ?? [];

/**
 * The shell as an element kept until one of its props changes, its callbacks made once: LegacyApp draws again when the
 * workspace moves or a preference does, and the shell under it is drawn again only for a preference. Each page redraws
 * on its own surfaces (surface-status.ts), and the shell on the route's (app-shell.jsx). It was drawn again, with three
 * new callbacks, on every surface's read.
 */
function useShellApp(
  prefs: Prefs,
  theme: Theme,
  look: LookPref,
  choose: (key: ChosenPref, v: string) => void,
  routePage: ReactNode,
) {
  const onTheme = useCallback((v: string) => choose("theme", v), [choose]);
  const onLook = useCallback((v: string) => choose("look", v), [choose]);
  const onSidebar = useCallback((v: string) => choose("sidebar", v), [choose]);
  const ChanlyticsApp = (window as unknown as { ChanlyticsApp?: ChanlyticsAppComponent }).ChanlyticsApp;
  const { theme: themePref, sidebar, inboxDensity, showInboxAgentRail } = prefs;
  return useMemo(
    () =>
      ChanlyticsApp ? (
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
          surfaceRoutes={SURFACE_ROUTES}
          sharedPage={SHARED_PAGE}
        />
      ) : null,
    [
      ChanlyticsApp,
      theme,
      themePref,
      onTheme,
      look,
      onLook,
      sidebar,
      onSidebar,
      inboxDensity,
      showInboxAgentRail,
      routePage,
    ],
  );
}

/**
 * `routePage`: the page of the route on screen, when that route has one of its own (src/surfaces/routes.ts): the layout's
 * children, which LegacyHost hands over only while the address is such a route, so a move between the shell's own routes
 * draws this frame no more than it did.
 */
export default function LegacyApp({ routePage }: { routePage?: ReactNode }) {
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
  const shellApp = useShellApp(prefs, theme, look, choose, routePage);

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
