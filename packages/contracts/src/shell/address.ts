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

import { SEQUENCES_ROUTE, newSequenceRoute, sendOnceRoute, sequenceRoute } from "../sequences/sequence-address";

/**
 * Messages' address (D4: the Library is Messages): a view of Campaigns beside Sequences, under the one mount Campaigns' views
 * share, as Ads is at `campaigns/ads`, so a switch between the two reveals a view kept drawn rather than loading a page (the
 * tabs review of 19 Oct 2026: a phone showed nothing for 600 ms between them). Its old route, `messages`, whose path was
 * `/w/<slug>/templates`, lands here for ever (retiredRouteOf, below). Declared here, beside the route words, so the boot does
 * not carry Campaigns' words: from them it carried those into the error screen's chunk (+3.7 KB on every first load). The one
 * module this one imports is Sequences' addresses (sequence-address.ts), which imports nothing.
 */
export const MESSAGES_ROUTE = "campaigns/messages";

/** Whether a param of `campaigns` is Messages' view (its first word). */
export const isMessagesParam = (param: string | null | undefined): boolean => !!param && /^messages(\/|$)/.test(param);

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
export const ROUTE_WORDS: Readonly<Record<string, string>> = {
  clients: "people",
  segments: "lists",
  outbound: "playbooks",
  messages: "templates",
  admin: "settings",
};

const headOf = (route: string): string => (route.includes("/") ? route.slice(0, route.indexOf("/")) : route);

/**
 * Sent's own views, which are no audience: Get their yes (people-lists GET_YES_ROUTE), and the one To send of the emails
 * handed to their owner (reach-out-approval TO_SEND_ROUTE).
 */
const SENT_OWN_WORDS: ReadonlySet<string> = new Set(["get-yes", "to-send"]);

/**
 * Where a retired address lands, in one move, or null where the address is a page's own (the Campaigns wiring review's
 * lane 1, 19 Oct 2026). The one table of them: every edge reads it, `movedAddress` as a page loads, `canonicalRoute` for
 * a move the app makes, `workspacePath` for a link, and Campaigns' and Sent's pages for an address that reaches them
 * some other way (a history entry from before). Every writer writes the page's own address (sequence-address.ts), so
 * only a link kept from before says one of these: a bell row, an email, an Ask citation, a bookmark.
 *
 * - The old Playbooks list (`outbound`, the path's `playbooks`) is Sequences, and a playbook (`outbound/<id>`) its sequence.
 * - Campaigns' home (`campaigns`, a group of it `campaigns/in:<group>`) is Sequences, and a campaign open in its drawer
 *   (`campaigns/moment:<id>`, its People at `:people`) its sequence, on that tab (decision 0060, S6). The server reads a
 *   sequence by the id of any of its parts (a step's, a batch's), and the record then names its own.
 * - The composer's Every time (`campaigns/new:every`, `new:moment:<trigger>`) is New sequence, on that moment (the
 *   closed-loop audit of 17 Oct 2026, G).
 * - Sent's list (`broadcasts`) is Sequences (D3: a run is a day of its sequence's History), and `broadcasts/<audience>`,
 *   which People and a list wrote to message these people, Send once on that audience. A run (`broadcasts/run:<id>`), Get
 *   their yes and To send stay where they are: a run's link lands by what the run is (runLandingOf), which no address says.
 *
 * - Messages (D4: the Library is Messages) is a view of Campaigns (19 Oct 2026): `messages`, and the Library's path
 *   `templates`, land on `campaigns/messages`; nothing was ever under it, so `messages/<word>` lands nowhere, as before.
 *
 * A query after the route rides along.
 */
export function retiredRouteOf(route: string): string | null {
  const at = route.indexOf("?");
  const path = at < 0 ? route : route.slice(0, at);
  const query = at < 0 ? "" : route.slice(at);
  const landed = retiredPathOf(path);
  return landed === null ? null : landed + query;
}

/** retiredRouteOf for a route without its query. */
function retiredPathOf(path: string): string | null {
  const head = headOf(path);
  const param = path.slice(head.length).replace(/^\//, "").split("/")[0] ?? "";
  if (head === "messages") return path === head ? MESSAGES_ROUTE : null;
  if (head === "outbound") return param ? sequenceRoute(param) : SEQUENCES_ROUTE;
  if (head === "broadcasts") {
    if (!param) return SEQUENCES_ROUTE;
    return param.startsWith("run:") || SENT_OWN_WORDS.has(param) ? null : sendOnceRoute(param);
  }
  if (head !== "campaigns") return null;
  if (param === "" || param.startsWith("in:")) return SEQUENCES_ROUTE;
  const moment = /^moment:([^:/]+)(:people)?$/.exec(param);
  if (moment?.[1]) return sequenceRoute(moment[1], moment[2] ? "people" : "steps");
  if (param === "new:every") return newSequenceRoute();
  const on = /^new:moment:([^:/]+)$/.exec(param);
  return on?.[1] ? newSequenceRoute(on[1]) : null;
}

/** A route as the shell names it: the product's word at its head (`people/c1`) is the route's own name (`clients/c1`). */
function shellRoute(route: string): string {
  const head = headOf(route);
  const name = Object.keys(ROUTE_WORDS).find((n) => ROUTE_WORDS[n] === head);
  return name === undefined ? route : name + route.slice(head.length);
}

/**
 * A route as one place is spelled once: the product's word at its head is the shell's name (`people/c1` is `clients/c1`), and a
 * retired route is the one that replaced it (`outbound/<id>` is `campaigns/sequences/<id>`, retiredRouteOf). Two routes that open one
 * place are equal here; whatever compares routes (the doors an answer offers, a count of what is already shown) compares
 * these and never the strings as they were written.
 */
export function canonicalRoute(route: string): string {
  const shell = shellRoute(route);
  return retiredRouteOf(shell) ?? shell;
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
  if (m?.[2]) {
    const written = m[2].replace(/\/+$/, "");
    // A retired route, in the path's word or the shell's own, lands on the route that replaced it (retiredRouteOf).
    const door = retiredRouteOf(shellRoute(written));
    if (door !== null) return `/w/${m[1] ?? ""}/${door}${address.search ?? ""}${address.hash ?? ""}`;
    if (Object.hasOwn(ROUTE_WORDS, headOf(m[2]))) {
      return `/w/${m[1] ?? ""}/${pathRoute(written)}${address.search ?? ""}${address.hash ?? ""}`;
    }
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
  return `/w/${m[1] ?? ""}/${pathRoute(retiredRouteOf(name) ?? name)}${joined}`;
}

/** Where a route lives in a workspace: `workspacePath("acme", "inbox/th-1")` is `/w/acme/inbox/th-1`. */
export function workspacePath(slug: string, route = ""): string {
  return `/w/${encodeURIComponent(slug)}${route ? `/${pathRoute(retiredRouteOf(route) ?? route)}` : ""}`;
}

/**
 * A page of the app as a link, for anything that is sent away from the app: a mail, a redirect after a provider, a return
 * from a payment. The one writer of them (task 1.7 of the wiring plan; before it each wrote its own, and one wrote the
 * product's path word by hand), built on `workspacePath` so the product's words and the retired names are said once.
 * `appLink("acme", "inbox/th-1")` is `/w/acme/inbox/th-1`, and a query rides after the route:
 * `appLink("acme", "admin/integrations", { google: "connected" })` is `/w/acme/settings/integrations?google=connected`. A
 * value that is null or undefined is left out.
 *
 * With no workspace known (a slug that could not be read, a refusal made before a signed state proves whose workspace it
 * was) the link is the front door with the route as a hash, `/#/admin/integrations`, which the home carries to the
 * workspace this browser used last (the old spelling that keeps landing: `movedAddress`). It is a path and a query, never
 * an origin: whoever sends it joins its own (the edge's `dashboardOrigin()`, the dashboard's request).
 */
export function appLink(
  slug: string | null | undefined,
  route = "",
  query?: Readonly<Record<string, string | null | undefined>>,
): string {
  const asked = Object.entries(query ?? {})
    .filter((e): e is [string, string] => typeof e[1] === "string")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  if (!slug) return `/${asked ? `?${asked}` : ""}${route ? `#/${route}` : ""}`;
  const path = workspacePath(slug, route);
  return asked ? `${path}${path.includes("?") ? "&" : "?"}${asked}` : path;
}
