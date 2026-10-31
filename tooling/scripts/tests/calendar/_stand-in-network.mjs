/**
 * The network, as the suites stand in for it, loaded before every test file (`--import` in the root `test` and `test:db`
 * scripts).
 *
 * The server's reads of an address a person typed (a calendar feed, a picture a page names) go through channels'
 * publicFetcher, which resolves the name and refuses a private answer at the connect. A suite that stubs
 * `globalThis.fetch` to serve a made-up feed would reach the real guard and the real DNS; this makes the guarded
 * fetcher follow whatever `globalThis.fetch` is, in a test process only, which is what the suites have always
 * replaced. The guard itself is run, with its own resolver and transport, by calendar/public-fetch.test.mjs.
 *
 * A business's page (the website read, a booking page, a lead's mark, a cold email's opening) is Firecrawl's in
 * production (channels sitePageReader). Here it is read from `globalThis.fetch` too, as a page served by address, the
 * site's redirects followed as the provider follows them, its Markdown the page's words as plain text: so a suite
 * serves its pages as it always has, and needs no key. The provider's own wire is run by
 * imports/a-page-is-read-through-firecrawl.test.mjs.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import { emailPlainText, setPublicFetch, setSitePageReader } from "@chanlytics/channels";

setPublicFetch((input, init) => globalThis.fetch(input, init));

/** A site's redirects, as a browser follows them: an http to https hop and a www one, not a chain. */
const HOPS_MAX = 3;

setSitePageReader(async (url, o) => {
  try {
    const stop = AbortSignal.timeout(o.timeoutMs);
    let at = url;
    for (let hop = 0; hop <= HOPS_MAX; hop += 1) {
      const res = await globalThis.fetch(at, { signal: stop, redirect: "manual", headers: { accept: "text/html" } });
      const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (next) {
        at = new URL(next, at).toString();
        continue;
      }
      if (!res.ok || !(res.headers.get("content-type") ?? "").toLowerCase().includes("html")) return null;
      const html = await res.text();
      return html ? { url: at, html, markdown: emailPlainText({ text: null, html }) ?? "" } : null;
    }
    return null;
  } catch {
    return null;
  }
});
