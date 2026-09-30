"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { lazy, memo, Suspense, useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { movedAddress, routeOfAddress, routeOfPath } from "@chanlytics/contracts";
import { routeHasPage } from "@/surfaces/routes";
import { api } from "./api";
import { homeHref, lastWorkspace, notifyAddress, setAppRouter } from "./workspace";

/**
 * Client-only mount for the legacy tree: module-scope code in the mockup
 * touches document/window at import time, so SSR/prerender must never
 * evaluate it (Blueprint §7 — the (os) surfaces are client-rendered).
 * `data/people-data.jsx` in particular reads `window` at module scope; dropping
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
 * carry it; its observers read what the browser buffered, so the numbers are the whole load's. The route is read
 * as the page begins, because the frame may move the address before the reporter arrives.
 */
const FieldDataReporter = lazy(() => import("../client/field-data-reporter"));
/** The shell's pane boundary says what it caught on window; this sends it (src/client/client-error.ts). */
const shellErrors = () => import("../client/client-error").then((m) => m.listenForShellErrors(window));
const landedOn = typeof window === "undefined" ? "" : routeOfAddress(window.location);

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
 * A hash address moved to its path: `/w/acme#/inbox`, which an email's link, the phone app's and a bookmark say, is
 * `/w/acme/inbox` before the frame draws, and keeps working for ever (contracts movedAddress). Through the router:
 * the fragment is the browser's and never reaches the server, so the move is the client's, and it is done when the
 * path says the route. An address that needs no move is placed at once. Mounted only until then, so the frame does not
 * follow the path through this hook afterwards: it follows the address itself (workspace.ts hearAddress).
 */
function MovedOnLoad({ onPlaced }: { onPlaced: () => void }): null {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    const to = movedAddress({ pathname, search: window.location.search, hash: window.location.hash });
    if (to) router.replace(to);
    else onPlaced();
  }, [pathname, router, onPlaced]);
  return null;
}

/**
 * The address moved through the App Router (a route with a page of its own, or a Back onto one): the frame is told, as
 * it is for every other move of the address (workspace.ts hearAddress), once the router has landed and the address
 * says the route. Before paint, so the frame never draws the route it left with the page it is arriving at.
 */
function AddressFollower(): null {
  const pathname = usePathname();
  useLayoutEffect(() => {
    notifyAddress();
  }, [pathname]);
  return null;
}

/**
 * The frame, drawn once: the layout's children change with every route, and the frame does not draw again for a
 * route it follows itself. `page` is the children while the address is a route with a page of its own, and nothing
 * otherwise, so a move between the shell's own routes changes no prop of the frame.
 */
const Frame = memo(function Frame({ page }: { page: ReactNode }) {
  return <LegacyApp routePage={page} />;
});

/**
 * The frame's host, or the home that sends a tab to its workspace's address.
 *
 * On /w/<slug> the layout mounts the frame once and keeps it mounted across every navigation (decision 0015: the
 * address is a path, and a route's page is `children`: a catch-all that draws nothing for a route the frame's table
 * draws, and a page of its own, which the frame draws inside its chrome, for a route that has left the shell). On the
 * home, the tab goes to the last workspace this browser used, else to the one the server calls active, with the
 * query and the route riding along; only an account with no workspace stays here, where the app shows the create
 * screen.
 */
export default function LegacyHost({ home = false, children }: { home?: boolean; children?: ReactNode }) {
  const [stay, setStay] = useState(!home);
  const router = useRouter();
  const pathname = usePathname();
  const loaded = useLoaded();
  const [placed, setPlaced] = useState(home);
  const place = useCallback(() => setPlaced(true), []);
  // The frame moves to a route with a page of its own through the router (workspace.ts goToRoute).
  useEffect(() => {
    setAppRouter(router);
    return () => setAppRouter(null);
  }, [router]);
  useEffect(() => {
    let unhook: (() => void) | null = null;
    let gone = false;
    void shellErrors().then((u) => (gone ? u() : (unhook = u)));
    return () => {
      gone = true;
      unhook?.();
    };
  }, []);
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
  if (!placed)
    return (
      <>
        <Loading />
        <MovedOnLoad onPlaced={place} />
      </>
    );
  // The home's own load is the redirect's, so only a workspace's address reports its timings.
  return (
    <>
      {!home && loaded && (
        <Suspense fallback={null}>
          <FieldDataReporter landedOn={landedOn} />
        </Suspense>
      )}
      {!home && <AddressFollower />}
      <Frame page={!home && routeHasPage(routeOfPath(pathname) ?? "") ? children : null} />
    </>
  );
}
