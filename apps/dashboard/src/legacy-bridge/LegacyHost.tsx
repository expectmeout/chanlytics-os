"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { api } from "./api";
import { homeHref, lastWorkspace } from "./workspace";

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
function Loading() {
  return (
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
  );
}

const LegacyApp = dynamic(() => import("./LegacyApp"), { ssr: false, loading: () => <Loading /> });

/**
 * The shell, or the home that sends a tab to its workspace's address.
 *
 * On /w/<slug> the app mounts at once. On the home, the tab goes to the last
 * workspace this browser used, else to the one the server calls active, with
 * the query and the hash route riding along; only an account with no
 * workspace stays here, where the app shows the create screen.
 */
export default function LegacyHost({ home = false }: { home?: boolean }) {
  const [stay, setStay] = useState(!home);
  useEffect(() => {
    if (!home) return;
    let cancelled = false;
    void (async () => {
      const after = window.location.search + window.location.hash;
      let href = homeHref(lastWorkspace(), null, after);
      if (!href) {
        const r = await api()("GET workspaces");
        href = homeHref(null, r.ok ? r.data : null, after);
      }
      if (cancelled) return;
      if (href) window.location.replace(href);
      else setStay(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [home]);
  if (!stay) return <Loading />;
  return <LegacyApp />;
}
