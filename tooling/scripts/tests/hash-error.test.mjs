/**
 * A refused sign-in comes back in the FRAGMENT, where no server can see it.
 *
 * Supabase returns a failed provider sign-in by sending the browser to the
 * redirect address with the reason after a `#`:
 *
 *   /auth/callback?next=/#error=server_error&error_code=unexpected_failure
 *     &error_description=Unable+to+exchange+external+code
 *
 * A fragment is never sent to a server, so the callback route saw no code and
 * no error, redirected to /login as it should, and the browser carried the
 * fragment along -- through that redirect, and through the middleware's bounce
 * off /login when the person did have a session. It arrived at the OS shell,
 * whose router reads window.location.hash, and drew
 *
 *   No surface at "error=server_error&error_code=unexpected_failure&..."
 *
 * which is a sign-in failure wearing a routing error's clothes. (Seen in
 * production on 20 Sep 2026, after a wrong Google client secret was fixed: the
 * fragment outlived the failure that made it.)
 *
 * THE RULE THIS PINS: a route always begins "#/". Anything else in the
 * fragment belongs to somebody else, and `#/errors` must stay a route.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { authErrorInHash, OAUTH_CANCELLED } = await import(at("apps/dashboard/src/auth/hash-error.ts"));

// The exact fragment production produced, right down to the double-encoding:
// Google's code is "4/0A…", and its "/" and ":" arrive encoded twice.
const REAL =
  "#error=server_error&error_code=unexpected_failure&error_description=Unable+to+exchange+external+code%253A+4%252F0A&sb=";

test("the failure that was drawn as a missing route is read as what it is", () => {
  const e = authErrorInHash(REAL);
  assert.ok(e, "REGRESSION: the fragment that drew 'No surface at ...' was not recognised");
  assert.equal(e.error, "server_error");
  assert.equal(e.code, "unexpected_failure");
  // `+` is a space and `%25` is a literal percent: the description is read the
  // way a browser wrote it, not left as machine text in a log.
  assert.equal(e.description, "Unable to exchange external code%3A 4%2F0A");
});

test("a person who pressed Cancel is named apart from a failure", () => {
  // Cancelling is not an error to apologise for, so the page must be able to
  // tell the two apart rather than saying "that didn't work" to somebody who
  // changed their mind.
  const e = authErrorInHash("#error=access_denied&error_code=403&error_description=The+user+denied+the+request");
  assert.equal(e.error, OAUTH_CANCELLED);
  assert.equal(OAUTH_CANCELLED, "access_denied");
});

test("a route is not an error, and a route named errors is still a route", () => {
  for (const h of ["#/today", "#/clients/c-aisha", "#/errors", "#/soon/pipeline", "#/"]) {
    assert.equal(authErrorInHash(h), null, `${h} is a route`);
  }
});

test("nothing in the fragment is nothing to report", () => {
  for (const h of ["", "#", "#error=", "#error", "#sb=", null, undefined]) {
    assert.equal(authErrorInHash(h), null, `${JSON.stringify(h)} says nothing`);
  }
});

test("what is kept is clipped, because a fragment is written by whoever built the link", () => {
  const e = authErrorInHash(`#error=server_error&error_description=${"x".repeat(500)}`);
  assert.equal(e.error, "server_error");
  assert.equal(e.description.length, 200);
  assert.equal(e.code, null, "absent is null, not the empty string");
});

test("a newline cannot be smuggled into a log line", () => {
  const e = authErrorInHash("#error=server_error&error_description=first%0Asecond%0D%0Athird");
  assert.equal(e.description, "first second third");
});
