/**
 * The browser's one client: the pure `createApi` from `src/client`, wired to
 * this window. Built lazily so importing this file never touches `window`,
 * which keeps every module that imports it loadable under node. The refresh
 * map is loaded on the first write rather than imported here, so the surfaces
 * it names can import this client without a cycle.
 */
import { createApi, unwrap, type Api, type ApiOptions, type RouteKey } from "../client/api";
import { clearReadCaches, staleReadCaches } from "./read-cache";
import { sealSurfaceCache } from "./surface-cache";
import { getActiveWorkspace, rememberWorkspace, signInHref } from "./workspace";
import { PREFETCH_SLOT, SECOND_FACTOR_REQUIRED_PATH } from "@chanlytics/contracts";

let instance: Api | null = null;

/**
 * The server refused to guess which workspace a request meant: the tab is
 * off a workspace page and named none. Forget the last workspace this browser
 * used, drop the rows read under it, and go home, where the server is asked
 * which workspace this account may open and the tab is sent to its address.
 * Once per tab: a second refusal in the same session is a bug to read in the
 * console, not a reload loop.
 */
const REBOOTED = "chanlytics.workspace.rebooted";
function forgetWorkspaceAndReboot(win: Window): void {
  rememberWorkspace(null);
  sealSurfaceCache();
  clearReadCaches();
  try {
    if (win.sessionStorage.getItem(REBOOTED)) {
      console.error("choose_workspace_after_reboot");
      return;
    }
    win.sessionStorage.setItem(REBOOTED, "1");
  } catch {
    // storage blocked: nothing to remember with, and nothing to loop on either
  }
  win.location.assign("/");
}

/**
 * A partner's seat, or the partner account, asked for the second factor this session has not shown (0013). The rows
 * read so far are dropped, as at a sign-out, and the tab goes to the second step, which asks for the code or, for an
 * account without an authenticator, sets one up; it comes back in from there.
 */
function toSecondFactor(win: Window): void {
  sealSurfaceCache();
  clearReadCaches();
  win.location.assign(SECOND_FACTOR_REQUIRED_PATH);
}

/**
 * A 401: the session is gone. Cleared and sealed BEFORE leaving: the surface cache holds real customer transcripts in
 * the tab, a session expiring mid-click must not leave one workspace's messages for whoever signs in next, and a read
 * landing before the page unloads must not write them back (surface-cache.ts sealSurfaceCache). The page's route and
 * workspace go along, so signing in again lands where they were.
 */
function toSignIn(win: Window): void {
  sealSurfaceCache();
  clearReadCaches();
  win.location.assign(signInHref(win.location));
}

/**
 * A fresh route's 401 (contracts SESSION_ENDED): the Auth server no longer knows this session, though its token still
 * verifies at the gate, which sent a tab asked to sign in straight back from /login, the act it had pressed silently
 * not done, every time it was pressed. The session is ended first -- POST /auth/signout, which clears its cookie
 * whether or not the Auth server still knows it -- and then the tab signs in again where it was.
 */
async function endSession(win: Window): Promise<void> {
  sealSurfaceCache();
  clearReadCaches();
  try {
    await win.fetch("/auth/signout", { method: "POST", credentials: "same-origin", redirect: "manual" });
  } catch {
    // The sign-out did not arrive: the sign-in page is where the tab goes all the same, and the gate decides.
  }
  win.location.assign(signInHref(win.location));
}

/**
 * What the document head started for a URL (contracts routePrefetchScript), taken once: the slot forgets it as it is
 * handed over, so a later read of the same URL asks the server.
 */
function takePrefetched(win: Window, url: string): Promise<Response> | null {
  const slot = (win as unknown as Record<string, unknown>)[PREFETCH_SLOT];
  if (!slot || typeof slot !== "object") return null;
  const held = (slot as Record<string, unknown>)[url];
  if (!held || typeof (held as Promise<Response>).then !== "function") return null;
  delete (slot as Record<string, unknown>)[url];
  return held as Promise<Response>;
}

/**
 * What the head started and the page's own reads did not take is nobody's, and is let go once they are in (the runner's
 * first pass). Leads' head read is the list in Fit order, and a tab that last read another order never took it: it stayed
 * in the slot for the page's life, and the owner choosing Fit minutes later was answered from the document's first
 * second, which the surface then held as fresh for two minutes more.
 */
export function dropPrefetched(win: Window): void {
  Reflect.deleteProperty(win, PREFETCH_SLOT);
}

/**
 * A read the runner treats as the surface's own: a refusal throws, and the
 * ApiError it throws carries the code the runner reads (a 401 signs the tab
 * out; anything else leaves the surface seeded).
 */
export async function read<K extends RouteKey>(key: K, opts?: ApiOptions<K>) {
  return unwrap(await api()(key, opts));
}

/**
 * The client for a window: the tab's own for the real one; for a stand-in
 * (a test's), a fresh one bound to its fetch, so the code under test makes
 * the request it would make in the browser and the test reads it.
 */
export function apiFor(win: Window): Api {
  if (typeof window !== "undefined" && win === window) return api();
  return createApi({
    fetch: (url, init) => win.fetch(url, init),
    prefetched: (url) => takePrefetched(win, url),
    workspace: getActiveWorkspace,
    onSignedOut: () => toSignIn(win),
    onSessionEnded: () => void endSession(win),
    onChooseWorkspace: () => forgetWorkspaceAndReboot(win),
    onSecondFactor: () => toSecondFactor(win),
    // A write landed, so every on-demand answer this tab is holding -- a
    // person's page, the activity log, the back office -- describes the world
    // as it was. The surfaces have their own path through the refresh map;
    // this is the one rule for everything read on demand, so a new cached
    // read never has to remember to invalidate itself. A memory cache lets go;
    // the person, kept in the tab like a surface, is painted and read again.
    refresh: (key) => {
      staleReadCaches();
      return import("./refresh-map").then((m) => m.refreshAfter(key));
    },
  });
}

/**
 * How far the database's clock (a notice's `at`, a kept row's `created_at`) and the servers' may disagree: both are kept by
 * NTP, so a few milliseconds apart. Allowed for on the side of reading again.
 */
const CLOCK_SKEW_MS = 250;

/**
 * A moment of this browser's clock as the servers' and the database's clocks read it, on the early side: less how far this
 * clock runs ahead of the servers' (clockLead, measured on every answer) and the margin the two may disagree by. A read
 * stamped by this browser is judged by it against a database time: the live feed's readAfter (surface-runner.ts) and the
 * bell's wait judges (notifications.ts whatWaits). A browser a few seconds fast took a change made just after its read for
 * one the read held (the wiring's second audit, S2-1).
 */
export function serversClockOf(browserMs: number): number {
  return browserMs - api().clockLead() - CLOCK_SKEW_MS;
}

export function api(): Api {
  instance ??= createApi({
    fetch: (url, init) => window.fetch(url, init),
    prefetched: (url) => takePrefetched(window, url),
    workspace: getActiveWorkspace,
    onSignedOut: () => toSignIn(window),
    onSessionEnded: () => void endSession(window),
    onChooseWorkspace: () => forgetWorkspaceAndReboot(window),
    onSecondFactor: () => toSecondFactor(window),
    // A write landed, so every on-demand answer this tab is holding -- a
    // person's page, the activity log, the back office -- describes the world
    // as it was. The surfaces have their own path through the refresh map;
    // this is the one rule for everything read on demand, so a new cached
    // read never has to remember to invalidate itself. A memory cache lets go;
    // the person, kept in the tab like a surface, is painted and read again.
    refresh: (key) => {
      staleReadCaches();
      return import("./refresh-map").then((m) => m.refreshAfter(key));
    },
  });
  return instance;
}
