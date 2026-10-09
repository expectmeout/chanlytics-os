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
import { doorOf, movedAddress, routeOfAddress, routeOfHash, routeOfPath, workspacePath } from "@chanlytics/contracts";
import type { AddressParts } from "@chanlytics/contracts";
import { askedWorkspaceOf, returnQueryOf } from "../auth/sign-in-return";
import { onOnePage, routeHasPage } from "../surfaces/routes";

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
 * Where the home sends a tab: the workspace a sign-in came back for (`?w=`, sign-in-return.ts), else the last
 * workspace used, else the one the server calls active, else nowhere (an account with no workspace stays, and the
 * app shows the create screen). The rest of the query and the hash ride along, so a return from Stripe or a deep
 * link lands where it meant to.
 */
export function homeHref(
  last: string | null,
  answer: { workspaces: Array<{ id: string; slug: string }>; activeWorkspaceId: string | null } | null,
  after = "",
): string | null {
  // A deep link into one workspace, signed out and back, is that workspace's: the last one this browser used is
  // another's for a member of two, whose thread is not there.
  const asked = askedWorkspaceOf(after);
  if (asked.workspace) return workspaceHref(asked.workspace, asked.rest);
  if (last) return workspaceHref(last, asked.rest);
  const active = answer?.workspaces.find((w) => w.id === answer.activeWorkspaceId);
  return active ? workspaceHref(active.slug, asked.rest) : null;
}

/**
 * Where a session that ended mid-page signs in again: /login, carrying the page's workspace (`?w=`) and its route as
 * a hash, which the sign-in page keeps and lands on (login's landed()), and the home then carries to that workspace.
 * The route is the address's, in its path or its hash; any other fragment is not a page to return to.
 */
export function signInHref(address: AddressParts): string {
  const route = routeOfPath(address.pathname) || routeOfHash(address.hash);
  return `/login${returnQueryOf(address.pathname)}${route ? `#/${route}` : ""}`;
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
  /** Warm a route's page: its code and its payload, in full, so a move there asks the server for nothing. */
  prefetch?(href: string, options?: { onInvalidate?: () => void }): void;
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
 * Except a move from one address of that page to another (`clients/c-1` to `clients/seg:needs_you`, or a peek that
 * replaces the address it stands at): the router's page for the route draws every address it takes and already stands
 * there, so that is a pushed or replaced entry like any other, with no request for a page that is drawn.
 */
export function goToRoute(asked: string, opts: GoOptions = {}, win: AddressWindow = window): void {
  // A route that retired lands on the one that replaced it (`outbound/pb-1` on `campaigns/moment:pb-1`) in one move.
  const route = doorOf(asked) ?? asked;
  const to = hrefOfRoute(route, win);
  const here = to.startsWith("#") ? win.location.hash : win.location.pathname;
  // A move within one route's page (`inbox/th-1` to `inbox/th-2`) stays on the patched history: the page follows the
  // address, and a router move would ask the server for it and draw the page again.
  if (appRouter && routeHasPage(route) && !to.startsWith("#") && !onOnePage(routeOnScreen(win), route)) {
    if (opts.replace) appRouter.replace(to);
    else if (here !== to) appRouter.push(to);
  } else if (opts.replace) win.history.replaceState(null, "", to);
  else if (here !== to) win.history.pushState(null, "", to);
  if (!(opts.replace && opts.quiet)) notifyAddress();
}

/** The hrefs warmed, each until Next says its payload has gone stale (it lives five minutes). */
const warmed = new Set<string>();

/**
 * Warm a route that has a page of its own, so a move there is a commit and not a round trip. Next prefetches a dynamic
 * route's page only when asked in full (a <Link> skips it, without a loading boundary), and every route here is
 * dynamic: the frame's pages draw from data the frame has read, but a press on the strip's Conversations waited on a
 * server render for a page that draws nothing of its own (27 to 57 ms on localhost, a round trip and a cold function
 * on a phone, with the swiped page already gone off the screen). Warmed in full, the same move asks for nothing.
 * Nothing for the page already on screen, a route the frame draws itself, or one warmed already.
 */
export function warmRoute(asked: string, win: AddressWindow = window): void {
  const route = doorOf(asked) ?? asked;
  if (!appRouter?.prefetch || !routeHasPage(route)) return;
  const to = hrefOfRoute(route, win);
  if (to.startsWith("#") || warmed.has(to) || onOnePage(routeOnScreen(win), route)) return;
  warmed.add(to);
  appRouter.prefetch(to, { onInvalidate: () => warmed.delete(to) });
}

/** What a connection says about itself, where the browser says it (Chrome and Android's, not Safari's). */
interface Link {
  saveData?: boolean;
  effectiveType?: string;
}

/** How long an idle page may wait before a warm goes, the wait where the browser has no idle callback, and the gap between two. */
const WARM_IDLE_MS = 2500;
const WARM_FALLBACK_MS = 1200;
const WARM_GAP_MS = 120;

/**
 * Routes warmed once the page is idle, a breath apart, so none competes with the page's own reads: the strip's
 * siblings, the phone's tab bar. Never where a person has asked to save data or the connection says 2g or 3g: then a route
 * is warmed only when a pointer or a finger reaches it (warmRoute).
 */
export function warmSoon(routes: readonly string[], win: AddressWindow = window): void {
  const link =
    (typeof navigator === "undefined" ? undefined : (navigator as Navigator & { connection?: Link }).connection) ??
    null;
  if (link && (link.saveData || /(^|-)[23]g$/.test(link.effectiveType ?? ""))) return;
  const later = (fn: () => void) =>
    typeof requestIdleCallback === "function"
      ? requestIdleCallback(fn, { timeout: WARM_IDLE_MS })
      : setTimeout(fn, WARM_FALLBACK_MS);
  routes.forEach((route, at) => later(() => void setTimeout(() => warmRoute(route, win), WARM_GAP_MS * at)));
}

/**
 * What else a page reached for warms beside its page: its data, where it reads that only when drawn (surface-registry
 * warmWhatItDraws, said by the frame as it mounts). A reach is a pointer or a finger at a door; a page warmed because the
 * frame was idle (warmSoon) is nobody's reach, and reads nothing of its own.
 */
let reachedFor: ((route: string) => void) | null = null;
export function onRouteReachedFor(fn: ((route: string) => void) | null): void {
  reachedFor = fn;
}

/** A page reached for, said by whatever stands at its door: its page warmed, and what it reads only when drawn begun. */
export function reachFor(route: string, win: AddressWindow = window): void {
  warmRoute(route, win);
  reachedFor?.(doorOf(route) ?? route);
}

/** The four of them on `window.__shell`, for the pages that cannot import (shell.ts installShell). */
export function addressApi(win: AddressWindow = window) {
  return {
    route: () => routeOnScreen(win),
    href: (route: string) => hrefOfRoute(route, win),
    go: (route: string, opts?: GoOptions) => goToRoute(route, opts, win),
    hear: (fn: () => void) => hearAddress(fn, win),
    warm: (route: string) => reachFor(route, win),
    warmSoon: (routes: readonly string[]) => warmSoon(routes, win),
  };
}
