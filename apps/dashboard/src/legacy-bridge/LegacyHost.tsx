"use client";

import dynamic from "next/dynamic";
import { lazy, Suspense, useEffect, useState } from "react";
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
      <style>
        {
          "@keyframes chanly-spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){[aria-busy] div{animation:none!important}}"
        }
      </style>
    </div>
  );
}

const LegacyApp = dynamic(() => import("./LegacyApp"), { ssr: false, loading: () => <Loading /> });
// The chunk is asked for as this module evaluates, not once React has hydrated and drawn the fallback: measured on
// production (25 Sep 2026, a cold load), the 762 KB chunk started 1,361 ms in, 270 ms after the document was
// interactive and 360 ms after the framework's own chunks began. Same module, same chunk: `dynamic` finds it loaded.
if (typeof window !== "undefined") void import("./LegacyApp");

/**
 * Field data (00255): what this page load came to, sent when the page is put away (src/client/field-data.ts). The
 * reporter loads once the page has, as a chunk of its own, so nobody waits for it and the route's budget does not
 * carry it; its observers read what the browser buffered, so the numbers are the whole load's. The address is read
 * as the page begins, because the shell may move it before the reporter arrives.
 */
const FieldDataReporter = lazy(() => import("../client/field-data-reporter"));
const landedOn = typeof window === "undefined" ? "" : window.location.hash;

/** True once the page's load event has fired: what waits for it never competes with what the page is loading. */
function useLoaded(): boolean {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const done = () => setLoaded(true);
    if (document.readyState === "complete") {
      done();
      return undefined;
    }
    window.addEventListener("load", done, { once: true });
    return () => window.removeEventListener("load", done);
  }, []);
  return loaded;
}

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
  const loaded = useLoaded();
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
  // The home's own load is the redirect's, so only a workspace's address reports its timings.
  return (
    <>
      {!home && loaded && (
        <Suspense fallback={null}>
          <FieldDataReporter landedOn={landedOn} />
        </Suspense>
      )}
      <LegacyApp />
    </>
  );
}
