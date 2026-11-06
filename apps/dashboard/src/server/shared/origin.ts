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
 *
 * The address is CANONICAL_HOST, the product's one host, which the proxy
 * already redirects every other production host to. It was a literal here too;
 * production now names it or does not start (env.ts), and only a preview or a
 * laptop falls back to the address the filing has always named.
 */
import { env, isProduction } from "./env";

/** Where a preview or a laptop says the business's pages live when CANONICAL_HOST is unset: the filing's address. */
const NOT_PRODUCTION_CANONICAL_HOST = "app.chanlytics.com";

/** The product's one host, lower-cased. Production without CANONICAL_HOST never starts (instrumentation.ts), and throws here. */
function canonicalHost(): string {
  const set = env.CANONICAL_HOST;
  if (set) return set.toLowerCase();
  if (isProduction()) throw new Error("env_invalid: CANONICAL_HOST is required in production");
  return NOT_PRODUCTION_CANONICAL_HOST;
}

/** Where the filing says the business's pages live. */
export function canonicalOrigin(): string {
  return `https://${canonicalHost()}`;
}

/** Hosts we actually answer on, besides the canonical one: local development. */
const ALSO_OURS = (host: string): boolean =>
  host === "localhost" || host.startsWith("localhost:") || host.startsWith("127.0.0.1:") || host === "127.0.0.1";

export function printableOrigin(proto: string | null | undefined, host: string | null | undefined): string {
  const h = (host ?? "").trim().toLowerCase();
  if (h && h !== canonicalHost() && ALSO_OURS(h)) return `${proto === "http" ? "http" : "https"}://${h}`;
  return canonicalOrigin();
}
