/**
 * A refreshed session rides out on the response that wrote it, and that
 * response must never be stored.
 *
 * @supabase/ssr 0.12 hands the cookie writer a SECOND argument: the headers
 * that keep the response out of every cache in front of us -- `Cache-Control:
 * private, no-cache, no-store, must-revalidate, max-age=0`, `Expires: 0`,
 * `Pragma: no-cache`. The proxy took the cookies and dropped those headers, so
 * a token refresh went out on a response a CDN keyed on the URL alone was free
 * to store, and then to hand to the next person who asked for that URL. That
 * is one operator's session served to another.
 *
 * The library says the headers arrive only on the FIRST write of a given
 * client and that the object is empty afterwards, so the writer must cope with
 * an empty one without deciding that nothing needs doing.
 *
 * Run against a stand-in for NextResponse rather than asserted against the
 * proxy's source, so it is the behaviour that is pinned and not the spelling.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { writeAuthCookies } = await import(at("apps/dashboard/src/server/auth-cookies.ts"));

/** What NextResponse gives the writer: somewhere to put cookies, somewhere to put headers. */
function sink() {
  const wrote = [];
  const headers = new Map();
  return {
    wrote,
    header: (k) => headers.get(k.toLowerCase()),
    headerNames: () => [...headers.keys()].sort(),
    cookies: { set: (name, value, options) => void wrote.push({ name, value, options }) },
    headers: { set: (k, v) => void headers.set(String(k).toLowerCase(), v) },
  };
}

const TOKENS = [
  { name: "sb-access-token", value: "a.b.c", options: { httpOnly: true, sameSite: "lax", path: "/" } },
  { name: "sb-refresh-token", value: "r1", options: { httpOnly: true, sameSite: "lax", path: "/" } },
];
const GUARD = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
};

test("the cookies and the headers that keep them out of a cache both reach the response", () => {
  const r = sink();
  writeAuthCookies(r, TOKENS, GUARD);

  assert.deepEqual(
    r.wrote.map((c) => [c.name, c.value]),
    [["sb-access-token", "a.b.c"], ["sb-refresh-token", "r1"]],
    "both tokens are written",
  );
  assert.deepEqual(r.wrote[0].options, { httpOnly: true, sameSite: "lax", path: "/" }, "with the options the library chose, untouched");

  // The whole point: without these, a shared cache may keep the Set-Cookie.
  assert.equal(r.header("cache-control"), "private, no-cache, no-store, must-revalidate, max-age=0");
  assert.equal(r.header("expires"), "0");
  assert.equal(r.header("pragma"), "no-cache");
});

test("a later write on the same client carries no headers, and none are invented", () => {
  // The library delivers the guard once per server client and passes {} after.
  // The cookies must still be written; the headers are already on the response.
  const r = sink();
  writeAuthCookies(r, TOKENS, {});
  assert.equal(r.wrote.length, 2, "the cookies still go out");
  assert.deepEqual(r.headerNames(), [], "and nothing is made up to fill the gap");
});

test("nothing to write is not a reason to skip the headers", () => {
  // Order matters the other way too: a call with headers and no cookies still
  // has to guard the response, because something was set on an earlier one.
  const r = sink();
  writeAuthCookies(r, [], GUARD);
  assert.equal(r.wrote.length, 0);
  assert.equal(r.header("cache-control"), "private, no-cache, no-store, must-revalidate, max-age=0");
});

test("a missing headers argument is survivable: older callers pass one thing", () => {
  const r = sink();
  writeAuthCookies(r, TOKENS);
  assert.equal(r.wrote.length, 2);
  assert.deepEqual(r.headerNames(), []);
});
