/**
 * The network, as the suites stand in for it, loaded before every test file (`--import` in the root `test` and `test:db`
 * scripts).
 *
 * The server's reads of an address a person typed (a calendar feed, a listing's website, a lead's page) go through
 * channels' publicFetcher, which resolves the name and refuses a private answer at the connect. A suite that stubs
 * `globalThis.fetch` to serve a made-up feed would reach the real guard and the real DNS; this makes the guarded
 * fetcher follow whatever `globalThis.fetch` is, in a test process only, which is what the suites have always
 * replaced. The guard itself is run, with its own resolver and transport, by calendar/public-fetch.test.mjs.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import { setPublicFetch } from "@chanlytics/channels";

setPublicFetch((input, init) => globalThis.fetch(input, init));
