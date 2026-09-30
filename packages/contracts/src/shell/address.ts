/**
 * The address of a page in the operator UI: where its route is written, read, and moved.
 *
 * A workspace page is `/w/<slug>/<route>` (decision 0015, "The address first"): the route is what follows the slug,
 * `inbox/th-1`, and `today` when nothing does. It used to be written after the slug as a hash, `/w/<slug>#/<route>`,
 * and that spelling keeps working for ever, since emails, the phone app's links and every bookmark say it. The frame
 * moves a hash address to its path when it loads (`movedAddress`), so nobody is sent a new link.
 *
 * A route is read from the path when the path holds one, and otherwise from the hash. That order is what lets an
 * address be read before it has moved, and lets the standalone mockup, which has no workspace path and keeps its
 * hash, be read by the same function.
 *
 * Pure: the shell reads it over `window.location`, and the tests over a made-up one.
 */

/** The parts of an address the functions below read; every part may be missing (a made-up window has few). */
export interface AddressParts {
  readonly pathname?: string | null;
  readonly search?: string | null;
  readonly hash?: string | null;
}

/** `/w/<slug>` and what follows it: the slug as written, and the route (empty when the path names none). */
const WORKSPACE_PATH = /^\/w\/([^/?#]+)(?:\/([^?#]*))?$/;

/** The route a workspace path holds: `/w/acme/inbox/th-1` is `inbox/th-1`, `/w/acme` is ``; any other path is not one. */
export function routeOfPath(pathname: string | null | undefined): string | null {
  const m = WORKSPACE_PATH.exec(pathname ?? "");
  return m ? (m[2] ?? "").replace(/\/+$/, "") : null;
}

/** The route a hash holds: `#/inbox/th-1` is `inbox/th-1`, `#/` is ``; anything else in a fragment is somebody else's. */
export function routeOfHash(hash: string | null | undefined): string | null {
  return typeof hash === "string" && hash.startsWith("#/") ? hash.slice(2) : null;
}

/** The route on screen: the path's, else the hash's, else Today. */
export function routeOfAddress(address: AddressParts): string {
  return routeOfPath(address.pathname) || routeOfHash(address.hash) || "today";
}

/**
 * Where a hash address goes when the frame loads, or null when nothing moves. `/w/acme?billing=success#/admin/billing`
 * is `/w/acme/admin/billing?billing=success`: the route becomes the path, the query stays, and the hash is gone. A
 * path that already names a route wins, and a hash that is not a route (`#error=...`, a sign-in's return) is left
 * for whoever owns it.
 */
export function movedAddress(address: AddressParts): string | null {
  const m = WORKSPACE_PATH.exec(address.pathname ?? "");
  const route = routeOfHash(address.hash);
  if (!m || route === null || m[2]) return null;
  const at = route.indexOf("?");
  const name = at < 0 ? route : route.slice(0, at);
  // `#/` names no route: Today, where the path already stands.
  if (!name) return null;
  const own = at < 0 ? "" : route.slice(at + 1);
  const search = address.search ?? "";
  const joined = own ? (search ? `${search}&${own}` : `?${own}`) : search;
  return `/w/${m[1] ?? ""}/${name}${joined}`;
}

/** Where a route lives in a workspace: `workspacePath("acme", "inbox/th-1")` is `/w/acme/inbox/th-1`. */
export function workspacePath(slug: string, route = ""): string {
  return `/w/${encodeURIComponent(slug)}${route ? `/${route}` : ""}`;
}
