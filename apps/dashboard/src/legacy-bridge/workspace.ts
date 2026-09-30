/**
 * Which workspace every request on this page is about: the one in the URL.
 *
 * The page's path names it, /w/<slug>, so several tabs, a deep link and a
 * reload are each about exactly the workspace their address says, and the
 * typed client appends it to every request at its one chokepoint. Off a
 * workspace page (the home, the create screen) there is none, and the runner
 * asks /workspaces first (plan 3.3). localStorage keeps only the LAST
 * workspace used, so the home can send a returning tab back to it. Both are
 * requests, never grants: the server validates membership on every call, and
 * a slug this account may not use resolves to nothing.
 *
 * The rest of the address is here too: the route after the slug (`/w/acme/inbox`), read, followed and moved in this
 * one place (decision 0015, "The address first"). Its words are contracts' (shell/address.ts).
 *
 * Its own module, importing only those pure words, so the client and the surfaces can both read it without either
 * importing the other.
 */
import { movedAddress, routeOfAddress, routeOfHash, routeOfPath, workspacePath } from "@chanlytics/contracts";
import type { AddressParts } from "@chanlytics/contracts";
import { routeHasPage, staysOnPage } from "../surfaces/routes";

const LAST_KEY = "chanlytics.workspace";

/** The workspace a path names, /w/<slug or id>, or null off a workspace page. */
export function pathWorkspace(pathname: string): string | null {
  const m = /^\/w\/([^/?#]+)/.exec(pathname);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]) || null;
  } catch {
    return null;
  }
}

/** The workspace this page is about, as its address says; null off a workspace page, or outside a browser. */
export function getActiveWorkspace(): string | null {
  if (typeof window === "undefined" || !window.location) return null;
  return pathWorkspace(window.location.pathname);
}

/**
 * A workspace page's address, with what rides after it: a query, and the route as a hash (`#/inbox`, how a link from
 * an email or the phone app says it), which is written as the path it moves to (`/w/acme/inbox`) so the page it opens
 * does not have to move it again.
 */
export function workspaceHref(slug: string, after = ""): string {
  const base = `/w/${encodeURIComponent(slug)}`;
  const at = after.indexOf("#");
  const moved = movedAddress({
    pathname: base,
    search: at < 0 ? after : after.slice(0, at),
    hash: at < 0 ? "" : after.slice(at),
  });
  return moved ?? `${base}${after}`;
}

/** The last workspace this browser used: where the home sends a returning tab. */
export function lastWorkspace(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

/** Remember the workspace the server confirmed, so the home can return to it; null forgets. */
export function rememberWorkspace(slug: string | null): void {
  try {
    if (slug) localStorage.setItem(LAST_KEY, slug);
    else localStorage.removeItem(LAST_KEY);
  } catch {
    /* storage blocked: the home asks the server instead */
  }
}

/**
 * Where the home sends a tab: the last workspace used, else the one the
 * server calls active, else nowhere (an account with no workspace stays, and
 * the app shows the create screen). The query and the hash ride along, so a
 * return from Stripe or a deep link lands where it meant to.
 */
export function homeHref(
  last: string | null,
  answer: { workspaces: Array<{ id: string; slug: string }>; activeWorkspaceId: string | null } | null,
  after = "",
): string | null {
  if (last) return workspaceHref(last, after);
  const active = answer?.workspaces.find((w) => w.id === answer.activeWorkspaceId);
  return active ? workspaceHref(active.slug, after) : null;
}

/**
 * Where a session that ended mid-page signs in again: /login, carrying the
 * page's route as a hash, which the sign-in page keeps and lands on (login's
 * landed()), and the home then carries to the workspace. The route is the
 * address's, in its path or its hash; any other fragment is not a page to
 * return to.
 */
export function signInHref(address: AddressParts): string {
  const route = routeOfPath(address.pathname) || routeOfHash(address.hash);
  return route ? `/login#/${route}` : "/login";
}

/** This address in another workspace: the same route under the slug, and the query that came with it. */
export function addressInWorkspace(slug: string, address: AddressParts): string {
  const route = routeOfPath(address.pathname) || routeOfHash(address.hash) || "";
  return `${workspacePath(slug, route)}${address.search ?? ""}`;
}

/* ------------------------------ the route on screen ------------------------------ */

/** The parts of a window the address reads, follows and moves; a test's stand-in has these and little else. */
export interface AddressWindow {
  location: AddressParts;
  history: {
    pushState(data: unknown, unused: string, url?: string | null): void;
    replaceState(data: unknown, unused: string, url?: string | null): void;
  };
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

/** The route on screen, `inbox/th-1`, and `today` when the address names none. Read here and nowhere else. */
export function routeOnScreen(win: { location: AddressParts } = window): string {
  return routeOfAddress(win.location);
}

/**
 * Where a route is linked to from this page: its path in a workspace, so that a long press, a middle click or a new
 * tab opens it; the hash in the standalone mockup, which has no workspace path.
 */
export function hrefOfRoute(route: string, win: { location: AddressParts } = window): string {
  const slug = pathWorkspace(win.location.pathname ?? "");
  return slug ? workspacePath(slug, route) : `#/${route}`;
}

/** Every address listener, so a move the browser does not announce (a push, a replace) is heard like one it does. */
const listening = new Set<() => void>();

/** Tell every listener the address may have moved; each one answers only for a route that changed. */
export function notifyAddress(): void {
  for (const on of [...listening]) on();
}

/**
 * Follow the address: `fn` runs when the route on screen changes, whether the person pressed Back (popstate) or a
 * page moved it (goToRoute). A move within the same route (a query the page scrubs) is no news. Answers the stop.
 */
export function hearAddress(fn: () => void, win: AddressWindow = window): () => void {
  let last = routeOnScreen(win);
  const on = () => {
    const now = routeOnScreen(win);
    if (now === last) return;
    last = now;
    fn();
  };
  listening.add(on);
  win.addEventListener("popstate", on);
  return () => {
    listening.delete(on);
    win.removeEventListener("popstate", on);
  };
}

export interface GoOptions {
  /** A page saying the same place more exactly, or a redirect: no entry in the history. Listeners are told. */
  replace?: boolean;
  /**
   * With `replace`: the page is saying where it stands, not arriving (a lead the peek walked on to), so no listener
   * is told. The shell that asked follows at once, in its own hand. A hash replaced by `history.replaceState` fired no
   * `hashchange` either.
   */
  quiet?: boolean;
}

/** The App Router's own navigation, which the frame registers (LegacyHost) for the routes that have a page of their own. */
export interface AppRouter {
  push(href: string): void;
  replace(href: string): void;
}

let appRouter: AppRouter | null = null;

/** The frame hands over the App Router as it mounts, and takes it back as it goes. */
export function setAppRouter(router: AppRouter | null): void {
  appRouter = router;
}

/**
 * Move to a route: a path pushed (or, for a page saying the same place more exactly, replaced) through the history
 * the App Router patches, which follows it for usePathname and keeps its Back. Not router.push: every legacy route is
 * drawn by the same catch-all page, so that would ask the server for a page that draws nothing on every press, and a
 * tab that is offline, or open across a deploy, would reload the whole app for it.
 *
 * A route with a page of its own (src/surfaces/routes.ts) asks the router: its page is another segment, which the
 * router draws, and the patched history would only change the address over the segment already there. The address
 * then moves when the router lands, not before, and the frame is told as it does (LegacyHost's AddressFollower).
 */
export function goToRoute(route: string, opts: GoOptions = {}, win: AddressWindow = window): void {
  const to = hrefOfRoute(route, win);
  const here = to.startsWith("#") ? win.location.hash : win.location.pathname;
  // A move within one route's page (`inbox/th-1` to `inbox/th-2`) stays on the patched history: the page follows the
  // address, and a router move would ask the server for it and draw the page again.
  const within = staysOnPage(routeOnScreen(win), route);
  if (appRouter && routeHasPage(route) && !within && !to.startsWith("#")) {
    if (opts.replace) appRouter.replace(to);
    else if (here !== to) appRouter.push(to);
  } else if (opts.replace) win.history.replaceState(null, "", to);
  else if (here !== to) win.history.pushState(null, "", to);
  if (!(opts.replace && opts.quiet)) notifyAddress();
}

/** The four of them on `window.__shell`, for the pages that cannot import (shell.ts installShell). */
export function addressApi(win: AddressWindow = window) {
  return {
    route: () => routeOnScreen(win),
    href: (route: string) => hrefOfRoute(route, win),
    go: (route: string, opts?: GoOptions) => goToRoute(route, opts, win),
    hear: (fn: () => void) => hearAddress(fn, win),
  };
}
