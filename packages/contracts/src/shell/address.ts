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
 * The path says the product's word where the shell's own route says another (`ROUTE_WORDS`, docs/glossary.md, "Where the
 * names do not agree yet"): a person's page is `/w/acme/people/<id>` and the shell's route for it is still
 * `clients/<id>`. Every reader below answers the shell's route, every writer the path's word, and the old name in a
 * path or a hash still lands, moved to the word (decision 0015, answer 2: "the old name redirects for ever").
 *
 * Pure: the shell reads it over `window.location`, and the tests over a made-up one.
 */

/** The parts of an address the functions below read; every part may be missing (a made-up window has few). */
export interface AddressParts {
  readonly pathname?: string | null;
  readonly search?: string | null;
  readonly hash?: string | null;
}

/**
 * The product's word, in a path, for each route the shell still names otherwise: People is `clients`, Lists `segments`.
 * A surface takes its word as it leaves the shell (decision 0015, condition 6): its row is added here with the surface,
 * and the shell's table, its links and its tests go on saying the route's own name until the frame's step retires it.
 */
export const ROUTE_WORDS: Readonly<Record<string, string>> = { clients: "people", segments: "lists" };

const headOf = (route: string): string => (route.includes("/") ? route.slice(0, route.indexOf("/")) : route);

/** A route as the shell names it: the product's word at its head (`people/c1`) is the route's own name (`clients/c1`). */
function shellRoute(route: string): string {
  const head = headOf(route);
  const name = Object.keys(ROUTE_WORDS).find((n) => ROUTE_WORDS[n] === head);
  return name === undefined ? route : name + route.slice(head.length);
}

/** A route as its path writes it: the route's own name at its head (`clients/c1`) is the product's word (`people/c1`). */
function pathRoute(route: string): string {
  const head = headOf(route);
  const word = Object.hasOwn(ROUTE_WORDS, head) ? ROUTE_WORDS[head] : undefined;
  return word === undefined ? route : word + route.slice(head.length);
}

/** `/w/<slug>` and what follows it: the slug as written, and the route (empty when the path names none). */
const WORKSPACE_PATH = /^\/w\/([^/?#]+)(?:\/([^?#]*))?$/;

/** The route a workspace path holds: `/w/acme/inbox/th-1` is `inbox/th-1`, `/w/acme` is ``; any other path is not one. */
export function routeOfPath(pathname: string | null | undefined): string | null {
  const m = WORKSPACE_PATH.exec(pathname ?? "");
  return m ? shellRoute((m[2] ?? "").replace(/\/+$/, "")) : null;
}

/** The route a hash holds: `#/inbox/th-1` is `inbox/th-1`, `#/` is ``; anything else in a fragment is somebody else's. */
export function routeOfHash(hash: string | null | undefined): string | null {
  return typeof hash === "string" && hash.startsWith("#/") ? shellRoute(hash.slice(2)) : null;
}

/** The route on screen: the path's, else the hash's, else Today. */
export function routeOfAddress(address: AddressParts): string {
  return routeOfPath(address.pathname) || routeOfHash(address.hash) || "today";
}

/**
 * Where a hash address goes when the frame loads, or null when nothing moves. `/w/acme?billing=success#/admin/billing`
 * is `/w/acme/admin/billing?billing=success`: the route becomes the path, the query stays, and the hash is gone. A
 * path that already names a route wins, and a hash that is not a route (`#error=...`, a sign-in's return) is left
 * for whoever owns it. A route written with the shell's old name where the product has a word (`/w/acme/clients/c1`)
 * moves to the word (`/w/acme/people/c1`), the query and the hash kept.
 */
export function movedAddress(address: AddressParts): string | null {
  const m = WORKSPACE_PATH.exec(address.pathname ?? "");
  if (m?.[2] && Object.hasOwn(ROUTE_WORDS, headOf(m[2]))) {
    return `/w/${m[1] ?? ""}/${pathRoute(m[2].replace(/\/+$/, ""))}${address.search ?? ""}${address.hash ?? ""}`;
  }
  const route = routeOfHash(address.hash);
  if (!m || route === null || m[2]) return null;
  const at = route.indexOf("?");
  const name = (at < 0 ? route : route.slice(0, at)).replace(/\/+$/, "");
  // `#/` names no route: Today, where the path already stands.
  if (!name) return null;
  const own = at < 0 ? "" : route.slice(at + 1);
  const search = address.search ?? "";
  const joined = own ? (search ? `${search}&${own}` : `?${own}`) : search;
  return `/w/${m[1] ?? ""}/${pathRoute(name)}${joined}`;
}

/** Where a route lives in a workspace: `workspacePath("acme", "inbox/th-1")` is `/w/acme/inbox/th-1`. */
export function workspacePath(slug: string, route = ""): string {
  return `/w/${encodeURIComponent(slug)}${route ? `/${pathRoute(route)}` : ""}`;
}
