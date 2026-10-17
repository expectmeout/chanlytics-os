"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, memo, useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { movedAddress, routeOfPath } from "@chanlytics/contracts";
import { routeHasPage } from "@/surfaces/routes";
import { speedHost } from "@/client/page-speed";
import { api } from "./api";
import { acceptedInTime } from "./invitations/accept";
import { homeHref, lastWorkspace, notifyAddress, setAppRouter } from "./workspace";

/**
 * Client-only mount for the legacy tree: module-scope code in the mockup
 * touches document/window at import time, so SSR/prerender must never
 * evaluate it (Blueprint §7 — the (os) surfaces are client-rendered).
 * `seed-globals.ts` and the shell's files in particular read `window` at module scope (so does the demo's
 * `demo/data/people-data.jsx`); dropping ssr:false would throw during prerender.
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
 * Field data (00255, 00412): the browser's five for this load and each move it counts, beside the shell's own
 * measures (src/client/page-speed.ts, installed with the frame), sent when the page is put away. The reporter loads
 * once the page has, as a chunk of its own, so nobody waits for it and the route's budget does not carry it; its
 * observers read what the browser buffered, so the numbers are the whole load's. The page the load landed on is the
 * measures', read as the frame was installed, before the address could move.
 */
const reportWebVitals = () =>
  // The frame's chunk first: the measures are installed as it evaluates, which may be after the page's load event.
  import("./LegacyApp")
    .then(() => import("../client/field-data-reporter"))
    .then(({ reportWebVitals: report }) => {
      const host = speedHost();
      if (host) report(host);
    });
/** The shell's pane boundary says what it caught on window; this sends it (src/client/client-error.ts). */
const shellErrors = () => import("../client/client-error").then((m) => m.listenForShellErrors(window));

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
    if (to) router.replace(to, { scroll: false });
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

/** The route whose page the layout's children are: the workspace's own address, which names none, is Today's. */
const pageRouteOf = (pathname: string): string => {
  const route = routeOfPath(pathname);
  return route === "" ? "today" : (route ?? "");
};

/**
 * The frame, drawn once and again for each route: `page` is the children while the address is a route with a page of
 * its own, and nothing otherwise; `route` is the route of the router's pathname, the one the pages read, so the frame
 * and the page move in the same render (app-shell.jsx `routeNow`). Null on the home, which has no route.
 */
const Frame = memo(function Frame({ page, route }: { page: ReactNode; route: string | null }) {
  return <LegacyApp routePage={page} route={route} />;
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
  const loaded = useLoaded();
  const [placed, setPlaced] = useState(home);
  const place = useCallback(() => setPlaced(true), []);
  // The frame moves to a route with a page of its own through the router (workspace.ts goToRoute).
  useEffect(() => {
    // What the frame asks of the router: a move, and a route warmed (workspace.ts warmRoute). A warm is Next's own
    // prefetch, of the route's prerendered page: the same for every address and workspace of the route, so one warm
    // serves them all, and a move that finds it asks the server for nothing. It was a prefetch in full ("full"), a
    // render of the page for its one address, while every page was dynamic (decision 0053, step 5).
    // A move never scrolls the window by the router's rule: on a phone the window is what a page scrolls, and the frame
    // keeps it (kit/motion/view-deck.ts: a view begins at the top, a move within one keeps its place).
    setAppRouter({
      push: (href) => router.push(href, { scroll: false }),
      replace: (href) => router.replace(href, { scroll: false }),
      prefetch: (href) => router.prefetch(href),
    });
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
  // The home's own load is the redirect's, so only a workspace's address reports its timings: once the page has loaded.
  useEffect(() => {
    if (!home && loaded) void reportWebVitals().catch(() => {});
  }, [home, loaded]);
  useEffect(() => {
    if (!home) return;
    let cancelled = false;
    void (async () => {
      const after = window.location.search + window.location.hash;
      let href = homeHref(lastWorkspace(), null, after);
      if (!href) {
        // A tab that remembers no workspace is a first sign-in or a cleared browser, and the list of an account an invitation is
        // about to seat is empty until the accept has (invitations/accept.ts): the accept goes first here, as the boot's list waits for it.
        await acceptedInTime();
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
  // The address is read only here and in the frame below, and neither is drawn by the server: the build prerenders this
  // spinner once for every workspace's address (decision 0053, step 5), and the address it does not know (`[workspace]`
  // is any slug) is the browser's to say. In a boundary, as Next asks of a read of the address a prerender cannot know.
  if (!placed)
    return (
      <>
        <Loading />
        <Suspense fallback={null}>
          <MovedOnLoad onPlaced={place} />
        </Suspense>
      </>
    );
  return <Placed home={home}>{children}</Placed>;
}

/**
 * The frame once the address is placed, drawn by the browser alone: `page` is the layout's children while the address is a
 * route with a page of its own, `route` the route of the router's pathname, so the frame and the page move in one render.
 */
function Placed({ home, children }: { home: boolean; children?: ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      {!home && <AddressFollower />}
      <Frame
        page={!home && routeHasPage(pageRouteOf(pathname)) ? children : null}
        route={home ? null : routeOfPath(pathname) || "today"}
      />
    </>
  );
}
