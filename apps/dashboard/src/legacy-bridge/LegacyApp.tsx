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
import { useCallback, useEffect, useMemo, useState } from "react";
import "./seed-globals"; // must evaluate before the manifest
import "./manifest";
// legacy.css is NOT imported here: it lives in app/(os)/layout.tsx so the
// 254KB design system ships as document <link>s and downloads in parallel
// with this chunk, rather than serially behind it.
import { workspaceOverride, conversationsOverride, inboxOverride, todayOverride, settingsOverride, switchWorkspace, type Workspace } from "./surface-data";
import {
  getSurfaceStatuses,
  isSurfaceFailed,
  isSurfaceReady,
  markHydrated,
  onSurfaceStatusChange,
  startSurfaces,
} from "./surface-runner";
import { clearSurfaceCache, hydrateSurfaceCache } from "./surface-cache";
import { installInboxVerbs } from "./inbox-verbs";
import CreateWorkspace from "./CreateWorkspace";

installInboxVerbs();

// Runs at module scope — AFTER the manifest has installed its seeds, and
// BEFORE React renders anything. That ordering is the whole point: a refresh
// paints real data from the previous visit instead of a frame of mockup
// numbers that get corrected a moment later.
markHydrated(hydrateSurfaceCache());

// The mockup's own data-before-mount contract (boot gate).
const REQUIRED = ["CHANLY", "INBOX_DATA", "CLIENTS", "FLEET_DATA", "CHANLY_DATA", "POLICY", "ChanlyticsApp"] as const;

const SURFACES = [workspaceOverride, conversationsOverride, inboxOverride, todayOverride, settingsOverride];
const SURFACE_LABELS: Record<string, string> = { conversations: "Conversations", inbox: "Inbox", today: "Today" };

// Which flipped surface backs each route, and which routes are real at all —
// both live in surface-registry.ts so the classification and the wiring cannot
// drift apart. Routes absent from ROUTE_SURFACE are seeded by design and are
// always "ready" — the registry decides separately whether they may RENDER.
import { installSurfaceRegistry, routeSurfaceFor } from "./surface-registry";

/**
 * The shell's route gate, installed at MODULE SCOPE — not in an effect.
 *
 * app-shell.jsx computes `routeLoading`'s INITIAL state during its first
 * render, and it is a child of this component: children render before parent
 * effects run. Installing the gate in a useEffect therefore left it undefined
 * at the only moment it mattered, `routeReady()` fell back to `true`, and a
 * cold boot painted the seeded mockup hero ($1,840 revenue, a fabricated
 * operator) for one frame — then a skeleton, then the truth. Strictly worse
 * than no gate at all.
 *
 * Module scope runs before React renders anything, so the very first frame is
 * already gated. It also survives StrictMode's mount/unmount/mount, which the
 * effect's cleanup used to tear down mid-sequence.
 */
function installRouteGate(): void {
  const w = window as unknown as {
    __surfaceGate?: (page: string, param?: string | null) => boolean;
    __surfaceFailed?: (page: string, param?: string | null) => boolean;
    __onSurfaceReady?: (fn: () => void) => () => void;
  };
  // The PANE decides, not the page. Asked with the bare page name, Settings
  // resolved to nothing and the gate waved a cold load straight through onto
  // the mockup's fabricated business.
  w.__surfaceGate = (page, param) => {
    const key = routeSurfaceFor(page, param);
    return key ? isSurfaceReady(key) : true;
  };
  w.__surfaceFailed = (page, param) => {
    const key = routeSurfaceFor(page, param);
    return key ? isSurfaceFailed(key) : false;
  };
  w.__onSurfaceReady = onSurfaceStatusChange;
}
installRouteGate();
// Same ordering argument as the route gate: the shell decides real-vs-demo
// during its FIRST render, so the classification must exist before React does.
installSurfaceRegistry();

interface Prefs {
  theme: "light" | "dark";
  inboxDensity: "compact" | "medium" | "rich";
  showInboxAgentRail: boolean;
}
const PREF_DEFAULTS: Prefs = { theme: "dark", inboxDensity: "medium", showInboxAgentRail: false };
const PREFS_KEY = "chanlytics-os-prefs";

function loadPrefs(): Prefs {
  try {
    return { ...PREF_DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
  } catch {
    return PREF_DEFAULTS;
  }
}

type ChanlyticsAppComponent = React.ComponentType<{
  theme: string;
  onTheme: (v: string) => void;
  inboxDensity: string;
  showInboxAgentRail: boolean;
}>;

export default function LegacyApp() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [workspace, setWorkspace] = useState<Workspace | null>(() => workspaceOverride.current());
  const [allWorkspaces, setAllWorkspaces] = useState<Workspace[]>(
    () => (window as unknown as { __WORKSPACES?: Workspace[] }).__WORKSPACES ?? [],
  );
  const [, setStatusTick] = useState(0);
  const [staleBuild, setStaleBuild] = useState(false);

  const missing = useMemo(
    () => REQUIRED.filter((k) => !(window as unknown as Record<string, unknown>)[k]),
    [],
  );

  const setPref = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((p) => {
      const next = { ...p, [key]: value };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch { /* private mode etc. — prefs just don't persist */ }
      return next;
    });
  }, []);

  // Theme stamp + viewport scoping, exactly what the inline boot script did.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", prefs.theme);
  }, [prefs.theme]);
  useEffect(() => {
    document.documentElement.classList.add("legacy-on");
    return () => document.documentElement.classList.remove("legacy-on");
  }, []);

  // Surface flips: one runner owns retries, realtime, debounce, and status.
  useEffect(() => {
    const stop = startSurfaces(SURFACES);
    const off = onSurfaceStatusChange(() => {
      setStatusTick((n) => n + 1);
      setWorkspace(workspaceOverride.current());
      setAllWorkspaces((window as unknown as { __WORKSPACES?: Workspace[] }).__WORKSPACES ?? []);
    });
    return () => {
      stop();
      off();
    };
  }, []);

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
        else if (j.sha !== initial) setStaleBuild(true);
      } catch { /* offline — ignore */ }
    };
    void check();
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    const t = setInterval(() => void check(), 15 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(t);
    };
  }, []);

  if (missing.length) {
    return (
      <div style={{ height: "100vh", display: "grid", placeItems: "center", fontFamily: "Geist, sans-serif", color: "#666" }}>
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
  if (isSurfaceReady("workspace") && allWorkspaces.length === 0) {
    const me = (window as unknown as { __ME?: { email?: string | null } }).__ME;
    return (
      <CreateWorkspace
        email={me?.email ?? null}
        onCreated={(w) => {
          // switchWorkspace persists the choice and re-runs every surface, so
          // the new workspace is the one the app opens on — which is where the
          // "no receptionist yet" setup card is waiting.
          switchWorkspace(w.id);
        }}
      />
    );
  }

  const ChanlyticsApp = (window as unknown as { ChanlyticsApp: ChanlyticsAppComponent }).ChanlyticsApp;
  const statuses = getSurfaceStatuses();
  const liveLabels = Object.entries(SURFACE_LABELS)
    .filter(([key]) => statuses.get(key) === "live")
    .map(([, label]) => label);
  const degradedLabels = Object.entries(SURFACE_LABELS)
    .filter(([key]) => statuses.get(key) === "degraded")
    .map(([, label]) => label);

  return (
    <div id="root">
      <ChanlyticsApp
        theme={prefs.theme}
        onTheme={(v) => setPref("theme", v as Prefs["theme"])}
        inboxDensity={prefs.inboxDensity}
        showInboxAgentRail={prefs.showInboxAgentRail}
      />
      <div className="bridge-pill" role="status">
        <span className={workspace ? "dot live" : "dot"} />
        {staleBuild ? (
          <button className="pill-action" onClick={() => window.location.reload()}>
            New version available — refresh
          </button>
        ) : workspace ? (
          <span>
            {/* A member of two workspaces had no way to say which one they
                meant, and every surface silently answered for a default they
                never chose. Rendered only when there is a real choice — a
                one-workspace account keeps the plain name it has always had. */}
            {allWorkspaces.length > 1 ? (
              <select
                className="pill-workspace"
                value={workspace.id}
                aria-label="Active workspace"
                onChange={(e) => switchWorkspace(e.target.value)}
              >
                {allWorkspaces.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            ) : (
              <b>{workspace.name}</b>
            )}
            {liveLabels.length ? ` · ${liveLabels.join(", ")} live` : ""}
            {degradedLabels.length ? ` · ${degradedLabels.join(", ")} stale` : ""}
            {" · other surfaces seeded"}
          </span>
        ) : (
          <span>Connecting to your workspace…</span>
        )}
        <form action="/auth/signout" method="post" className="pill-signout" onSubmit={clearSurfaceCache}>
          <button type="submit" title="Sign out">Sign out</button>
        </form>
      </div>
    </div>
  );
}
