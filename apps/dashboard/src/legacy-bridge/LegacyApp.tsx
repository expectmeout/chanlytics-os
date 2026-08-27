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
import "./legacy.css";
import { workspaceOverride, conversationsOverride, inboxOverride, todayOverride, type Workspace } from "./surface-data";
import { getSurfaceStatuses, onSurfaceStatusChange, startSurfaces } from "./surface-runner";
import { installInboxVerbs } from "./inbox-verbs";

installInboxVerbs();

// The mockup's own data-before-mount contract (boot gate).
const REQUIRED = ["CHANLY", "INBOX_DATA", "CLIENTS", "FLEET_DATA", "CHANLY_DATA", "POLICY", "ChanlyticsApp"] as const;

const SURFACES = [workspaceOverride, conversationsOverride, inboxOverride, todayOverride];
const SURFACE_LABELS: Record<string, string> = { conversations: "Conversations", inbox: "Inbox", today: "Today" };

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
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
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
            <b>{workspace.name}</b>
            {liveLabels.length ? ` · ${liveLabels.join(", ")} live` : ""}
            {degradedLabels.length ? ` · ${degradedLabels.join(", ")} stale` : ""}
            {" · other surfaces seeded"}
          </span>
        ) : (
          <span>Seeded preview — no live data yet</span>
        )}
        <form action="/auth/signout" method="post" className="pill-signout">
          <button type="submit" title="Sign out">Sign out</button>
        </form>
      </div>
    </div>
  );
}
