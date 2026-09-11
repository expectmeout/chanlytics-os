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
 * Its own module, with no imports, so the client and the surfaces can both
 * read it without either importing the other.
 */
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

/** A workspace page's address, with what rides after it: a query, the hash route. */
export function workspaceHref(slug: string, after = ""): string {
  return `/w/${encodeURIComponent(slug)}${after}`;
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
