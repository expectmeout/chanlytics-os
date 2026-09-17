/**
 * The browser's one client: the pure `createApi` from `src/client`, wired to
 * this window. Built lazily so importing this file never touches `window`,
 * which keeps every module that imports it loadable under node. The refresh
 * map is loaded on the first write rather than imported here, so the surfaces
 * it names can import this client without a cycle.
 */
import { createApi, unwrap, type Api, type ApiOptions, type RouteKey } from "../client/api";
import { clearReadCaches } from "./read-cache";
import { clearSurfaceCache } from "./surface-cache";
import { getActiveWorkspace, rememberWorkspace, signInHref } from "./workspace";

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
  clearSurfaceCache();
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
    workspace: getActiveWorkspace,
    onSignedOut: () => {
      clearSurfaceCache();
      clearReadCaches();
      win.location.assign(signInHref(win.location.hash));
    },
    onChooseWorkspace: () => forgetWorkspaceAndReboot(win),
    // A write landed, so every on-demand answer this tab is holding -- a
    // person's page, the activity log, the back office -- describes the world
    // as it was. The surfaces have their own path through the refresh map;
    // this is the one rule for everything read on demand, so a new cached
    // read never has to remember to invalidate itself.
    refresh: (key) => {
      clearReadCaches();
      return import("./refresh-map").then((m) => m.refreshAfter(key));
    },
  });
}

export function api(): Api {
  instance ??= createApi({
    fetch: (url, init) => window.fetch(url, init),
    workspace: getActiveWorkspace,
    onSignedOut: () => {
      // Clear BEFORE redirecting: the surface cache holds real customer
      // transcripts in sessionStorage, and a session expiring mid-click must
      // not leave one workspace's messages for whoever signs in next. The
      // page's hash goes along, so signing in again lands where they were.
      clearSurfaceCache();
      clearReadCaches();
      window.location.assign(signInHref(window.location.hash));
    },
    onChooseWorkspace: () => forgetWorkspaceAndReboot(window),
    // A write landed, so every on-demand answer this tab is holding -- a
    // person's page, the activity log, the back office -- describes the world
    // as it was. The surfaces have their own path through the refresh map;
    // this is the one rule for everything read on demand, so a new cached
    // read never has to remember to invalidate itself.
    refresh: (key) => {
      clearReadCaches();
      return import("./refresh-map").then((m) => m.refreshAfter(key));
    },
  });
  return instance;
}
