"use client";

/**
 * The Phase-A bridge (Blueprint §7): replaces the standalone mockup's inline boot
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
import { frameDrawn } from "@/client/page-speed";
import { askOwnRoute } from "@/client/own-route";
import { FIRST_RUN_ROUTE, LIFECYCLE_WORDS, MIN_MS, type Theme, type LookPref } from "@chanlytics/contracts";
import { paintThemeColor } from "./theme-color";
import { FrameHead } from "@/surfaces/kit/head/frame-head";
import { NewConversationHost } from "@/surfaces/inbox/new-conversation/host";
import { BookingToolHost } from "@/surfaces/settings/booking-tool/host";
import { loadPrefs, choosePref, documentStamps, type Prefs, type ChosenPref } from "./device-prefs";
// frame.css is NOT imported here: it lives in app/(os)/layout.tsx so the
// 254KB design system ships as document <link>s and downloads in parallel
// with this chunk, rather than serially behind it.
// What the frame installs as it loads, and the surfaces it reads (bridge/boot).
import { bootFrame } from "./boot/installs";
import { FRAME_SURFACES } from "./boot/surfaces";
import { switchWorkspace } from "./surface-data";
import type { Workspace } from "./who";
import { SURFACE_ROUTES } from "@/surfaces/routes";
import {
  getConnection,
  getSurfaceStatuses,
  isSurfaceReady,
  onSurfaceStatusChange,
  startSurfaces,
} from "./surface-runner";
import { catchUpLiveFeed, joinLiveFeed } from "./hearing/live-feed";
import { surfaceHook } from "./surface-status";
import { ChanlyticsApp } from "@/surfaces/frame/app-shell";
import { useFirstRowsLetGo } from "@/surfaces/frame/first-rows";
import { SURFACE_LABELS, publishShellStatus, shellStatusOf } from "./shell";
// The handover, which the shell asks on every boot, is its own small module; the create screen is fetched as it is drawn.
import { useHandoverAsk } from "./invitations/handover";
import { codeOnce } from "@/lib/code-once";
import { useCode } from "@/lib/use-code";
import { FailedRead } from "@/surfaces/kit/empty/empty";
import { JoinedNote } from "./invitations/joined-note";
import { PRIMARY_PART, vitalsPageOf } from "@chanlytics/contracts";
import { whoIsLooking } from "./who";
import { routeGateOpen, routePartsOf, routeSurfaces } from "./surface-registry";
import { routeOnScreen } from "./workspace";
import { pageDrawn } from "./hearing/page-waits";
import { LeadOverMount } from "@/surfaces/leads/sheet/over-mount";
import { SeeOverMount } from "@/surfaces/see/see-mount";

/**
 * The create screen as the frame draws it (FrameApp): for an account with no workspace yet, and from the workspace menu
 * for another. Its code (CreateWorkspace.tsx: the form, sign-up's words, the waitlist, the first run's kicker) is fetched
 * when the screen is drawn, which almost no boot does: in the frame it was about 19 KB, compressed, that every first
 * load parsed before any page could draw (the loadability review, 19 Oct 2026). The shell's quiet words stand where it
 * will be while it comes, and a fetch that failed says so, with its retry.
 */
const createScreenCode = codeOnce(() => import("./CreateWorkspace"));

function CreateWorkspace(props: ComponentProps<typeof import("./CreateWorkspace").default>) {
  useFirstRowsLetGo();
  const { loaded: screen, failed, retry } = useCode(createScreenCode, true);
  if (screen) return <screen.default {...props} />;
  if (failed) return <FailedRead kind="line" what="this page" onRetry={retry} testid="create-workspace-failed" />;
  return (
    <div className="route-reading" role="status">
      {LIFECYCLE_WORDS.reading}
    </div>
  );
}

// The boot (bridge/boot/installs.ts): every part the frame installs, the cache restored and the route gate and the
// registry made, in the order each needs, before React draws anything.
bootFrame();

/** How often a tab asks which build the site runs, beside every return to it and every return online. */
const VERSION_CHECK_MS = 15 * MIN_MS;

/** The workspace's own surface, which FrameApp draws again on (surface-status.ts surfaceHook): the pages hear their own. */
const useSurface = surfaceHook({ useCallback, useSyncExternalStore });

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
 * frame its gate opened in, never at one before the page was put on it. And when a wait of a first draw ends that moves
 * no surface (surface-status.ts firstDrawWaitsFor: a pane of Settings' own reads), heard as the shell's gate hears it:
 * a gate opened by one alone drew the page and said nothing (the Settings load lane, 28 Oct 2026).
 */
function SpeedFrame({ route }: { route: string | null }) {
  const { page, param } = routePartsOf(route ?? routeOnScreen());
  useRouteMoved({ page, param });
  const [, statusMoved] = useState(0);
  useEffect(() => onSurfaceStatusChange(() => statusMoved((n) => n + 1)), []);
  useLayoutEffect(() => {
    frameDrawn();
    // Its gate open on a page with no first part of its own: the page is drawn, and the rest of the boot may go (workspace.ts
    // pageDrawn). A page with one says it when that part's rows are drawn (hearPartReady, above).
    if (routeGateOpen(page, param) && !PRIMARY_PART[vitalsPageOf(route ?? routeOnScreen())]) pageDrawn();
  });
  return null;
}

/** The workspaces this account may open, as the workspace's read last said. */
const listedWorkspaces = (): readonly Workspace[] => whoIsLooking().workspaces ?? [];

/**
 * The shell as an element kept until one of its props changes, its callbacks made once: FrameApp draws again when the
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
  const { theme: themePref, sidebar, inboxDensity } = prefs;
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
          routePage={routePage}
          routeNow={route}
          surfaceRoutes={SURFACE_ROUTES}
          sharedPage={SHARED_PAGE}
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
    [theme, themePref, onTheme, look, onLook, sidebar, onSidebar, inboxDensity, routePage, route],
  );
}

/**
 * `routePage`: the page of the route on screen, when that route has one of its own (src/surfaces/routes.ts): the layout's
 * children, which FrameHost hands over only while the address is such a route, so a move between the shell's own routes
 * draws this frame no more than it did. `route`: the route of the router's pathname (FrameHost), or null where there is
 * none (the home), and then the frame hears the address itself.
 */
export default function FrameApp({ routePage, route }: { routePage?: ReactNode; route: string | null }) {
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
  const { me } = whoIsLooking();
  const handover = useHandoverAsk(isSurfaceReady("workspace"), me?.handovers);
  // What the shell alone knows — the connection, the live feed, a newer
  // build, surfaces that stopped refreshing — goes to the line under the top
  // bar through the shell bridge, which is where the floating pill used to
  // say it. The connection changes through the surfaces' own listeners.
  const staleRef = useRef(false);
  const publishStatus = useCallback(() => {
    publishShellStatus(shellStatusOf(getSurfaceStatuses(), getConnection(), staleRef.current, SURFACE_LABELS));
  }, []);

  // A press on the theme, the look or the rail: device-prefs.ts checks it and keeps it, and this holds the result.
  const choose = useCallback(
    (key: ChosenPref, v: string) => setPrefs((p) => choosePref(browserStorage, p, key, v)),
    [],
  );
  const shellApp = useShellApp(prefs, theme, look, choose, routePage, route);

  useDocumentStamps(theme, look);
  // Viewport scoping, exactly what the inline boot script did.
  useEffect(() => {
    document.documentElement.classList.add("frame-on");
    return () => document.documentElement.classList.remove("frame-on");
  }, []);

  // Surface flips: one runner owns retries, realtime, debounce, and status. A status that changed, or the connection,
  // is the line's to say; it draws nothing here.
  useEffect(() => {
    const stop = startSurfaces(FRAME_SURFACES, joinLiveFeed, catchUpLiveFeed);
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
      // Offline, or an answer that is not the version: nothing to compare.
      const j = (await askOwnRoute<{ sha?: string }>("/api/version", { cache: "no-store" })).json;
      if (!j?.sha) return;
      if (initial === null) initial = j.sha;
      else if (j.sha !== initial && !staleRef.current) {
        staleRef.current = true;
        publishStatus();
      }
    };
    void check();
    const onVisible = () => document.visibilityState === "visible" && void check();
    // Back from offline: a deploy may have landed meanwhile.
    const onOnline = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    const t = setInterval(() => void check(), VERSION_CHECK_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      clearInterval(t);
    };
  }, [publishStatus]);

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
    // And the door this first workspace meets -- the invite code, or the list --
    // for an account that arrived through Google and never saw the sign-up form.
    const { pending, posture } = whoIsLooking();
    return (
      <CreateWorkspace
        email={email}
        initial={pending}
        posture={posture}
        onCreated={(w) => {
          // switchWorkspace persists the choice and re-runs every surface, so the new workspace is the one the app
          // opens on, on its first run (#/start). By its slug: it is not in the list yet, and by id it boots twice.
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
