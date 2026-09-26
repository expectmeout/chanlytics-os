/**
 * The cold link host (Reach out D17): the domain a cold email's unsubscribe links point at, added to this project so
 * its /u/ page answers there. Nothing else does: a domain seen in bulk mail that also served a sign-in page is the
 * pattern a browser's safe-browsing list flags, and a flag would stand in front of every unsubscribe link. The value
 * is the edge's UNSUBSCRIBE_ORIGIN, set the same on this project. Pure, so the proxy's rule is proved by running it.
 */

/** The host an https origin names; null for anything that is not one (the rule is then off). */
export function linkHostOf(origin: string | null | undefined): string | null {
  const o = (origin ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(o)) return null;
  return o.slice("https://".length).toLowerCase();
}

/** Whether a request may be answered: anything off the link host, and only /u/ on it. */
export function linkHostAnswers(p: { host: string | null; path: string; linkHost: string | null }): boolean {
  if (!p.linkHost || !p.host) return true;
  if (p.host.toLowerCase().replace(/:\d+$/, "") !== p.linkHost) return true;
  return p.path.startsWith("/u/");
}
