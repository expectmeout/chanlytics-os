"use client";

import dynamic from "next/dynamic";

/**
 * Client-only mount for the legacy tree: module-scope code in the mockup
 * touches document/window at import time, so SSR/prerender must never
 * evaluate it (Blueprint §7 — the (os) surfaces are client-rendered).
 */
const LegacyApp = dynamic(() => import("./LegacyApp"), {
  ssr: false,
  loading: () => (
    <div style={{ height: "100vh", display: "grid", placeItems: "center", color: "#93a5a0", fontSize: 14 }}>
      Loading Chanlytics OS…
    </div>
  ),
});

export default function LegacyHost() {
  return <LegacyApp />;
}
