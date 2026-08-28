"use client";

import dynamic from "next/dynamic";

/**
 * Client-only mount for the legacy tree: module-scope code in the mockup
 * touches document/window at import time, so SSR/prerender must never
 * evaluate it (Blueprint §7 — the (os) surfaces are client-rendered).
 * `inbox-data.jsx` in particular reads `window` at module scope; dropping
 * ssr:false would throw during prerender.
 *
 * The fallback below is the FIRST thing every visitor sees, for the whole
 * duration of the chunk download. It used to be hardcoded `#93a5a0` on the
 * auth page's near-black ground — shown to light-theme users too. Now it
 * paints from the design tokens (which arrive as a document stylesheet from
 * the (os) layout, so they are available before this renders) and shows the
 * app's own shape rather than a sentence, so the transition into the shell
 * isn't a jump cut.
 */
const LegacyApp = dynamic(() => import("./LegacyApp"), {
  ssr: false,
  loading: () => (
    <div
      aria-busy="true"
      aria-label="Loading your workspace"
      style={{
        height: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg)",
        color: "var(--ink-dim)",
        fontFamily: "var(--font-sans)",
        fontSize: 13,
      }}
    >
      <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            border: "2px solid var(--line-strong)",
            borderTopColor: "var(--accent)",
            animation: "chanly-spin 700ms linear infinite",
          }}
        />
        <span>Loading your workspace…</span>
      </div>
      <style>{"@keyframes chanly-spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){[aria-busy] div{animation:none!important}}"}</style>
    </div>
  ),
});

export default function LegacyHost() {
  return <LegacyApp />;
}
