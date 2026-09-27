"use client";

/**
 * The Phase-A bridge (Blueprint §7): replaces Chanlytics.html's inline boot
 * script. Seeds globals, evaluates the ordered manifest, enforces the boot
 * gate, and renders ChanlyticsApp inside OUR React tree with the exact props
 * the original App wrapper passed. Prefs (theme/density/rail) live in
 * localStorage — view preferences only. Surface flips run through the
 * SurfaceData runner; the pill reports live/degraded per surface, carries
 * sign-out, and flags stale deployments (version heartbeat).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  resolveTheme,
  themePrefOf,
  DEFAULT_THEME_PREF,
  DEVICE_PREFS_STORAGE,
  isSidebarPref,
  FIRST_RUN_ROUTE,
  type PendingWorkspace,
  type ThemePref,
  type SidebarPref,
} from "@chanlytics/contracts";
import { subscribeMessagesInserts } from "@chanlytics/db";
import { authErrorInHash } from "@/auth/hash-error";
import { createClient } from "@/lib/supabase/client";
import { paintThemeColor } from "./theme-color";
import "./seed-globals"; // must evaluate before the manifest
import "./manifest";
// legacy.css is NOT imported here: it lives in app/(os)/layout.tsx so the
// 254KB design system ships as document <link>s and downloads in parallel
// with this chunk, rather than serially behind it.
import {
  workspaceOverride,
  conversationsOverride,
  inboxOverride,
  todayOverride,
  settingsOverride,
  peopleOverride,
  reportsOverride,
  liveOverride,
  switchWorkspace,
  type Workspace,
  broadcastsOverride,
  playbooksOverride,
  calendarOverride,
  notificationsOverride,
} from "./surface-data";
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
import { installTemplates } from "./templates";
import { installBroadcasts } from "./broadcast-verbs";
import { installPlaybooks } from "./playbooks";
import { installReachOuts, reachOutsOverride } from "./reach-out/reach-outs";
import { installCalendar } from "./calendar";
import { installToday } from "./today";
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
installLeadMap(process.env.NEXT_PUBLIC_LEAD_MAP_BASE);
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
if (typeof window !== "undefined" && "serviceWorker" in navigator && process.env.NODE_ENV === "production") {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// Runs at module scope — AFTER the manifest has installed its seeds, and
// BEFORE React renders anything. That ordering is the whole point: a refresh
// paints real data from the previous visit instead of a frame of mockup
// numbers that get corrected a moment later.
markHydrated(hydrateSurfaceCache());
// A tab opened on a person's page asks for them now, ahead of every surface's boot: the page is their read alone.
warmPersonOnScreen();

// The mockup's own data-before-mount contract (boot gate).
const REQUIRED = ["CHANLY", "INBOX_DATA", "CLIENTS", "FLEET_DATA", "CHANLY_DATA", "POLICY", "ChanlyticsApp"] as const;

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
  // The partner's account (0012): on the person, read once, beside the rest.
  partnerOverride,
  calendarOverride,
  notificationsOverride,
  setupOverride,
  googleOverride,
  billingOverride,
];
/** The runner's live feed: the one subscription, over this browser's Supabase client. */
const joinLiveFeed: JoinLiveFeed = (onChange, opts) => subscribeMessagesInserts(createClient(), onChange, opts);
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
import { installRouteGate, installSurfaceRegistry } from "./surface-registry";

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
 * arrives here, where the shell's parseHash reads window.location.hash, and
 * the shell drew `No surface at "error=server_error&error_code=..."` -- a
 * sign-in failure wearing a routing error's clothes.
 *
 * Module scope for the same reason as the route gate above: the shell reads
 * the hash during its FIRST render, so anything that runs in an effect is
 * already too late and shows the wrong page for a frame. Replaced rather than
 * pushed, because that address is not somewhere to go Back to.
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

interface Prefs {
  theme: ThemePref;
  sidebar: SidebarPref;
  inboxDensity: "compact" | "medium" | "rich";
  showInboxAgentRail: boolean;
}
const PREF_DEFAULTS: Prefs = {
  theme: DEFAULT_THEME_PREF,
  sidebar: "open",
  inboxDensity: "medium",
  showInboxAgentRail: false,
};
// The document's head reads the theme from the same place before first paint (contracts themeBootScript).
const PREFS_KEY = DEVICE_PREFS_STORAGE;

/** This device's preferences, with anything unknown or stale replaced by the default. */
function loadPrefs(): Prefs {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") as Partial<Prefs>;
    const p = { ...PREF_DEFAULTS, ...stored };
    return { ...p, theme: themePrefOf(p.theme), sidebar: isSidebarPref(p.sidebar) ? p.sidebar : PREF_DEFAULTS.sidebar };
  } catch {
    return PREF_DEFAULTS;
  }
}

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

type ChanlyticsAppComponent = React.ComponentType<{
  theme: string;
  themePref: string;
  onTheme: (v: string) => void;
  sidebar: string;
  onSidebar: (v: string) => void;
  inboxDensity: string;
  showInboxAgentRail: boolean;
}>;

export default function LegacyApp() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  // Another workspace, asked for from the workspace menu (shell.createWorkspace).
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const on = () => setCreating(true);
    window.addEventListener("shell:create-workspace", on);
    return () => window.removeEventListener("shell:create-workspace", on);
  }, []);
  const systemDark = useSystemDark();
  const theme = resolveTheme(prefs.theme, systemDark);
  const [allWorkspaces, setAllWorkspaces] = useState<Workspace[]>(
    () => (window as unknown as { __WORKSPACES?: Workspace[] }).__WORKSPACES ?? [],
  );
  const [, setStatusTick] = useState(0);
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

  const setPref = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((p) => {
      const next = { ...p, [key]: value };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* private mode etc. — prefs just don't persist */
      }
      return next;
    });
  }, []);

  // Theme stamp + viewport scoping, exactly what the inline boot script did —
  // the browser's own bars included, so switching the theme moves them with the
  // page instead of leaving the phone's address bar in the other one's paper.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    paintThemeColor(document, theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.classList.add("legacy-on");
    return () => document.documentElement.classList.remove("legacy-on");
  }, []);

  // Surface flips: one runner owns retries, realtime, debounce, and status.
  useEffect(() => {
    const stop = startSurfaces(SURFACES, joinLiveFeed);
    const off = onSurfaceStatusChange(() => {
      setStatusTick((n) => n + 1);
      setAllWorkspaces((window as unknown as { __WORKSPACES?: Workspace[] }).__WORKSPACES ?? []);
      publishStatus();
    });
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

  const ChanlyticsApp = (window as unknown as { ChanlyticsApp: ChanlyticsAppComponent }).ChanlyticsApp;

  return (
    <div id="root">
      <ChanlyticsApp
        theme={theme}
        themePref={prefs.theme}
        onTheme={(v) => setPref("theme", themePrefOf(v))}
        sidebar={prefs.sidebar}
        onSidebar={(v) => setPref("sidebar", isSidebarPref(v) ? v : PREF_DEFAULTS.sidebar)}
        inboxDensity={prefs.inboxDensity}
        showInboxAgentRail={prefs.showInboxAgentRail}
      />
    </div>
  );
}
