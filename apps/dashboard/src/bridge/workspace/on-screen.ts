/**
 * The workspace on screen: the one the address names, `/w/<slug>`. Every read is about it (the client names it on each
 * request), and everything the tab keeps of one workspace is kept by it (read-cache.ts, held-views.ts, tab-memory.ts,
 * surfaces/ads-first-reads.ts).
 *
 * A leaf: it imports nothing. bridge/workspace.ts says the same two under the same names and holds the rest of the address
 * (the route, its moves, the warms), which reads the route registry; the registry imports each page's chrome, and a page's
 * chrome reads the stores its strip draws from. So a store such a chrome reads could not ask bridge/workspace.ts whose it
 * is, and three read the address for themselves (Campaigns' Ads counts, Forms' list, the report sheet: the review of
 * 28 Nov 2026). They ask here.
 */

/** The workspace a path names, /w/<slug or id>, or null off a workspace page. */
export function pathWorkspace(pathname: string): string | null {
  const m = /^\/w\/([^/?#]+)/.exec(pathname);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1] ?? "") || null;
  } catch {
    return null;
  }
}

/** The workspace this page is about, as its address says; null off a workspace page, or outside a browser. */
export function getActiveWorkspace(): string | null {
  if (typeof window === "undefined" || !window.location) return null;
  return pathWorkspace(window.location.pathname);
}
