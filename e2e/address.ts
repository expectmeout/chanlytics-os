// The package's own source, read by relative path: this project has no dependency on the workspace packages, and a copy of
// the rule here would be a second reading of the address to keep in step (address.ts has no imports).
import { routeOfAddress } from "../packages/contracts/src/shell/address";

/**
 * The route a page is at, read as the app reads it (contracts shell/address.ts): the path after the workspace's slug,
 * `/w/acme/clients/leads` is `clients/leads`, and a hash a page has not moved yet, `/w/acme#/clients/leads`, says the
 * same. `today` when the address names none.
 *
 * A route is a path since decision 0015 ("The address first"), and a spec that asks for the address's hash asks for
 * something that is no longer there. Ask for the route: `expect.poll(() => routeOf(page.url())).toBe("clients")`, or
 * `await expect(page).toHaveURL(atRoute(/^clients\/[0-9a-f-]{36}$/))`.
 */
export function routeOf(url: string | URL): string {
  const u = typeof url === "string" ? new URL(url) : url;
  return routeOfAddress({ pathname: u.pathname, search: u.search, hash: u.hash });
}

/** A URL predicate for `toHaveURL` and `waitForURL`: true when the route the URL names matches. */
export const atRoute =
  (route: RegExp) =>
  (url: URL): boolean =>
    route.test(routeOf(url));
