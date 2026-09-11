/**
 * The browser's one client: the pure `createApi` from `src/client`, wired to
 * this window. Built lazily so importing this file never touches `window`,
 * which keeps every module that imports it loadable under node.
 */
import { createApi, type Api } from "../client/api";
import { clearSurfaceCache } from "./surface-cache";
import { getActiveWorkspace, invalidateInFlight } from "./surface-data";
import { refreshAfter } from "./refresh-map";

let instance: Api | null = null;

export function api(): Api {
  instance ??= createApi({
    fetch: (url, init) => window.fetch(url, init),
    workspace: getActiveWorkspace,
    onSignedOut: () => {
      // Clear BEFORE redirecting: the surface cache holds real customer
      // transcripts in sessionStorage, and a session expiring mid-click must
      // not leave one workspace's messages for whoever signs in next.
      clearSurfaceCache();
      window.location.assign("/login");
    },
    invalidate: invalidateInFlight,
    refresh: refreshAfter,
  });
  return instance;
}
