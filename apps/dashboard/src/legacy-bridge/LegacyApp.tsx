"use client";

/**
 * The Phase-A bridge (Blueprint §7): replaces Chanlytics.html's inline boot
 * script. Seeds globals, evaluates the ordered manifest, enforces the boot
 * gate, and renders ChanlyticsApp inside OUR React tree with the exact props
 * the original App wrapper passed. Prefs (theme/density/rail) move from the
 * tweaks-panel postMessage protocol to localStorage — view preferences only.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import "./seed-globals"; // must evaluate before the manifest
import "./manifest";
import "./legacy.css";
import { activateOverride, workspaceOverride, type Workspace } from "./surface-data";

// The mockup's own data-before-mount contract (boot gate).
const REQUIRED = ["CHANLY", "INBOX_DATA", "CLIENTS", "FLEET_DATA", "CHANLY_DATA", "POLICY", "ChanlyticsApp"] as const;

interface Prefs {
  theme: "light" | "dark";
  inboxDensity: "compact" | "medium" | "rich";
  showInboxAgentRail: boolean;
}
const PREF_DEFAULTS: Prefs = { theme: "dark", inboxDensity: "compact", showInboxAgentRail: false };
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

  // SurfaceData first consumer: the real workspace, RLS-scoped.
  useEffect(() => {
    void activateOverride(workspaceOverride).then((ok) => {
      if (ok) setWorkspace(workspaceOverride.current());
    });
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
        {workspace ? (
          <span>
            <b>{workspace.name}</b> · live workspace · seeded preview data
          </span>
        ) : (
          <span>Seeded preview — no live data yet</span>
        )}
      </div>
    </div>
  );
}
