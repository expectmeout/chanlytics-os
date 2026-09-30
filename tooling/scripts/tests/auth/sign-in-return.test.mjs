/**
 * Where a sign-in comes back to, for a deep link into a workspace (apps/dashboard/src/auth/sign-in-return.ts).
 *
 * The address was a hash, and the browser carried a fragment through the gate's redirect to /login on its own. A route
 * is a path now (decision 0015), which the redirect would drop: a signed-out tab opening /w/acme/inbox/th-1 would sign
 * in and land on Today. So the gate writes the route into the redirect's fragment, `/login#/inbox/th-1`, the one shape
 * the sign-in page already keeps and lands on. A fragment reaches no server, so no log holds the route. The gate itself,
 * on the running app, is e2e/auth/auth-gate.spec.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const { returnFragmentOf } = await importSrc("apps/dashboard/src/auth/sign-in-return.ts");
const { routeOfHash, routeOfPath } = await import("@chanlytics/contracts");

test("a page of a workspace comes back as its route, in the fragment the sign-in page keeps", () => {
  assert.equal(returnFragmentOf("/w/acme/inbox"), "#/inbox");
  assert.equal(returnFragmentOf("/w/acme/inbox/th-1"), "#/inbox/th-1");
  assert.equal(returnFragmentOf("/w/acme/admin/billing"), "#/admin/billing");
  assert.equal(returnFragmentOf("/w/acme/clients/leads:s-1:c-review"), "#/clients/leads:s-1:c-review");
  assert.equal(returnFragmentOf("/w/acme/inbox/"), "#/inbox", "a trailing slash is not part of the route");
});

test("the workspace's own page, and every other path, comes back to nothing", () => {
  for (const path of [
    "/w/acme",
    "/w/acme/",
    "/",
    "/inbox",
    "/login",
    "/api/v1/conversations",
    "/w",
    "/w/",
    "/yes/acme/x",
  ])
    assert.equal(returnFragmentOf(path), "", path);
});

test("what it writes is what the sign-in page and the frame read back: the same route, from the fragment and from the path", () => {
  for (const path of ["/w/acme/inbox/th-1", "/w/acme/clients/leads:s-1", "/w/acme/start/phone"]) {
    const fragment = returnFragmentOf(path);
    assert.equal(routeOfHash(fragment), routeOfPath(path), path);
  }
});
