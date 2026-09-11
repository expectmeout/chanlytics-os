/**
 * The browser's one client: the pure `createApi` from `src/client`, wired to
 * this window. Built lazily so importing this file never touches `window`,
 * which keeps every module that imports it loadable under node. The refresh
 * map is loaded on the first write rather than imported here, so the surfaces
 * it names can import this client without a cycle.
 */
import { createApi, unwrap, type Api, type ApiOptions, type RouteKey } from "../client/api";
import { clearSurfaceCache } from "./surface-cache";
import { getActiveWorkspace } from "./workspace";

let instance: Api | null = null;

/**
 * A read the runner treats as the surface's own: a refusal throws, and the
 * ApiError it throws carries the code the runner reads (a 401 signs the tab
 * out; anything else leaves the surface seeded).
 */
export async function read<K extends RouteKey>(key: K, opts?: ApiOptions<K>) {
  return unwrap(await api()(key, opts));
}

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
    refresh: (key) => import("./refresh-map").then((m) => m.refreshAfter(key)),
  });
  return instance;
}
