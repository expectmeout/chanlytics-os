/**
 * The frame (moved from legacy/pages/app-shell.jsx, the one-system plan's step 7e): routing by the address, the sidebar's
 * click-throughs, page transitions, Ask (⌘K), and the landings for unbuilt surfaces. What each route draws is the route
 * table's (route-table.tsx, through drawRoute); this resolves the address, holds the gates and the hooks, and draws the
 * chrome around the table's answer (shell-chrome.tsx). LegacyApp mounts it by import; the standalone mockup by the window
 * name its own bundle gives it (tooling/scripts/serve-legacy.mjs, `data/frame-app.js`).
 *
 * The hooks are called in the order the frame always called them, so its effects run in the order they always did. The
 * look is stamped beside the theme on every root that carries the theme. `routePage` is the page of a route that has left
 * the shell (an App Router page, the layout's children) and `surfaceRoutes` says how the frame wraps it (surfaces/routes.ts);
 * `sharedPage` is the shared viewer's report. `routeNow` is the route of the router's pathname, the same the pages read:
 * the frame and the page move in one render, the router's. Without it (the mockup, a test) the frame hears the address.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { fillDoors as FillDoors } from "../frame-doors";
import type { SurfaceRoute } from "../routes";
import { frameChrome, frameSurfaceHook, fromWindow } from "./frame-window";
import { drawRoute } from "./route-table";
import { appChrome, firstRunScreen, sharedViewer } from "./shell-chrome";
import {
  useInboxNeeds,
  useNavDrawer,
  usePageFocus,
  useRouteGate,
  useRouteMoves,
  useShellKeys,
  useShellNavigate,
  useShellRouting,
  useTabTitle,
  useViewFade,
} from "./shell-hooks";
import { parseRoute, routeAt, routeParts, type ShellRoute } from "./shell-routes";

interface ChanlyticsAppProps {
  theme: string;
  themePref?: string;
  onTheme: (v: string) => void;
  look: string;
  onLook?: (v: string) => void;
  sidebar?: string;
  onSidebar?: (v: string) => void;
  inboxDensity?: string;
  showInboxAgentRail?: boolean;
  routePage?: ReactNode;
  surfaceRoutes?: Readonly<Record<string, SurfaceRoute>> | null;
  sharedPage?: ReactNode;
  routeNow?: string | null;
  fillDoors?: typeof FillDoors | null;
}

// Where there is no bridge (the standalone mockup) nothing is read again, so nothing moves: this stand-in answers nothing new.
const useSurfaceStill = (): number => 0;

/**
 * The crumbs, told to the head Glass draws in the frame's places. Leads is a scope of People, picked in the page's own
 * strip, so its head is People's; Conversations and Live are tabs of the Inbox's family, so each keeps its own name and no
 * way back above it, as a tab has none.
 */
function useCrumbsShown(crumbs: readonly unknown[], look: string, { page, param }: ShellRoute) {
  const leadsScope = page === "clients" && !!param && /^leads(:|$)/.test(param);
  const familyTab = page === "conversations" || page === "live";
  useEffect(() => {
    const chrome = frameChrome();
    if (look === "glass" && chrome && chrome.crumbsShown)
      chrome.crumbsShown(
        (leadsScope ? crumbs.slice(0, -1) : familyTab ? crumbs.slice(-1) : crumbs) as Parameters<
          typeof chrome.crumbsShown
        >[0],
      );
  }, [crumbs, look, leadsScope, familyTab]);
}

export function ChanlyticsApp({
  theme,
  themePref = theme,
  onTheme,
  look,
  onLook,
  sidebar = "open",
  onSidebar = () => {},
  inboxDensity,
  showInboxAgentRail,
  routePage = null,
  surfaceRoutes = null,
  sharedPage = null,
  routeNow = null,
  fillDoors = null,
}: ChanlyticsAppProps) {
  const [heard, setRoute] = useState<ShellRoute>(parseRoute());
  const route = routeNow !== null ? routeParts(routeNow) : heard;
  const [askOpen, setAskOpen] = useState(false);
  const inboxNeeds = useInboxNeeds();
  const at = routeAt(route);
  const { page, param } = at;
  // Drawn again when a surface the route on screen is drawn from moves (surface-registry.ts routeSurfaces), and not for any
  // other surface's read. The pages hear their own.
  const useSurface = frameSurfaceHook() ?? useSurfaceStill;
  useSurface({ page, param });
  const gate = useRouteGate(at);
  const { demoGated } = gate;
  const { navigate, backToPeople, backFrom } = useShellNavigate(setRoute);
  const openAsk = useCallback(() => setAskOpen(true), []);
  // The phone's ✦ is Ask's face too (components/ask-face.jsx), drawn on the button's coral; the sparkle where it is absent.
  const PhoneFace = window.AskFace || null;

  // The doors every page uses (surfaces/frame-doors.ts), filled before the pages under this draw: the frame's own move,
  // its Ask, and a person's Back to the People view they were opened from. The bridge hands the frame the filler as
  // `fillDoors`. Without a bridge (the standalone mockup, a test) the frame publishes them itself, as it always did.
  if (fillDoors) fillDoors({ navigate, openAsk, backToPeople, backFrom });
  else Object.assign(window, { appNavigate: navigate, appAsk: openAsk, appBackToPeople: backToPeople });

  useShellRouting({ route, setRoute, setReadyTick: gate.setReadyTick, follows: routeNow === null });
  useShellKeys({ setAskOpen, sidebar, onSidebar });
  const { navOpen, setNavOpen } = useNavDrawer();

  // The route table's answer (route-table.tsx), the honesty gate applied; by the window's name first, a test's stand-in.
  const drawn = fromWindow(
    "drawRoute",
    drawRoute,
  )({
    ...at,
    demoGated,
    navigate,
    openAsk,
    backToPeople,
    inboxDensity,
    showInboxAgentRail,
    routePage,
    surfaceRoutes,
  } as Parameters<typeof drawRoute>[0]);

  useRouteMoves(at);
  useTabTitle(drawn.crumbs, inboxNeeds);
  useCrumbsShown(drawn.crumbs, look, at);
  // A route change: the drawer closes, and the gate's clocks start for the new route.
  useEffect(() => {
    setNavOpen(false);
    return gate.arm();
  }, [at.routeKey]);
  // When the tab bar last asked for a place (PhoneTabs `onPlace`): the view that arrives for it is cut in.
  const placed = useRef<number | null>(null);
  const onPlace = useCallback(() => {
    placed.current = performance.now();
  }, [placed]);
  const fade = useViewFade(at, drawn.mountKey as string, gate.routeLoading, placed);
  usePageFocus(page, gate.routeLoading);
  // The frame is mounted and listening (useNavDrawer above): the native app's bridge replays a menu ask that arrived while
  // this was still compiling (legacy-bridge/app-bridge.ts). After the route effect, so the first route's close runs first.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("shell:ready"));
  }, []);

  // The two full-screen pages, after all hooks so the hook order stays identical on every route.
  if (page === "shared" && !demoGated) return sharedViewer({ theme, look, navigate, sharedPage });
  if (page === "start" && !demoGated && routePage)
    return firstRunScreen({ theme, look, routePage, askOpen, setAskOpen });

  return appChrome({
    theme,
    themePref,
    onTheme,
    look,
    onLook,
    sidebar,
    onSidebar,
    navOpen,
    setNavOpen,
    askOpen,
    setAskOpen,
    openAsk,
    inboxNeeds,
    navigate,
    onPlace,
    PhoneFace,
    page,
    param,
    ...drawn,
    ...fade,
    routeLoading: gate.routeLoading,
    surfaceUnavailable: gate.surfaceUnavailable,
  });
}
