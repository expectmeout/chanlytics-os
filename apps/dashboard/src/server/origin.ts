/**
 * The address this app is printed as.
 *
 * A page that renders its own URL for a person to read — the paper consent
 * form is the one that matters, because it is the carriers' evidence that a
 * business asked properly — must not take that address from the request. The
 * `Host` and `X-Forwarded-Host` headers are written by whoever made the
 * request, so a form built from them prints whatever address the fetcher
 * chose. Redirects have a better answer (a relative Location, resolved by the
 * browser); printed text does not, so it is an allow-list.
 */

/** Where the filing says the business's pages live. */
export const CANONICAL_ORIGIN = "https://app.chanlytics.com";

/** Hosts we actually answer on, besides the canonical one: local development. */
const ALSO_OURS = (host: string): boolean =>
  host === "localhost" || host.startsWith("localhost:") || host.startsWith("127.0.0.1:") || host === "127.0.0.1";

export function printableOrigin(proto: string | null | undefined, host: string | null | undefined): string {
  const h = (host ?? "").trim().toLowerCase();
  if (!h) return CANONICAL_ORIGIN;
  if (h === "app.chanlytics.com") return CANONICAL_ORIGIN;
  if (ALSO_OURS(h)) return `${proto === "http" ? "http" : "https"}://${h}`;
  return CANONICAL_ORIGIN;
}
