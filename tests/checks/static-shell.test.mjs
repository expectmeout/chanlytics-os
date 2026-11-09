/**
 * check:static-shell (tooling/scripts/checks/static-shell.mjs), run over builds made up for the purpose: the OS's pages
 * prerendered whole for every address of their route pass; each way a page stops being one prerender for everyone (a
 * render left to the request, a shell waiting on it, no segment files, no prerender at all) fails, and names the route;
 * so does `/api/version` prerendered; and a build of another shape is refused rather than held less (decision 0053,
 * step 5).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const { staticShellFaults } = await importSrc("tooling/scripts/checks/static-shell.mjs");

const PAGES = {
  "/(os)/page": "/",
  "/(os)/w/[workspace]/people/[[...param]]/page": "/w/[workspace]/people/[[...param]]",
  "/(os)/w/[workspace]/today/page": "/w/[workspace]/today",
  "/login/page": "/login",
  "/b/[slug]/page": "/b/[slug]",
  "/api/version/route": "/api/version",
};

/** A build: every OS page a static shell with its segments, the home whole, a public page that blocks. */
function build(over = {}) {
  const shell = { renderingMode: "PARTIALLY_STATIC", routeType: "shell", compute: "static", response: "initial" };
  const prerender = {
    routes: { "/": { compute: "static", response: "complete" }, "/login": { compute: "static" } },
    dynamicRoutes: {
      "/w/[workspace]/people/[[...param]]": { ...shell },
      "/w/[workspace]/today": { ...shell },
      "/b/[slug]": { ...shell, compute: "blocking", response: "empty" },
    },
  };
  const written = new Set([
    "/w/[workspace]/people/[[...param]].segments/_tree.segment.rsc",
    "/w/[workspace]/today.segments/_tree.segment.rsc",
  ]);
  const metas = {};
  over.edit?.({ prerender, written, metas });
  return {
    pages: over.pages ?? PAGES,
    prerender,
    files: { has: (rel) => written.has(rel), meta: (route) => metas[route] ?? { status: 200 } },
  };
}

test("an OS whose every page is prerendered whole, for every address of its route, passes", () => {
  assert.deepEqual(staticShellFaults(build()), []);
});

test("a page with a render left to the request fails, named", () => {
  const faults = staticShellFaults(
    build({ edit: ({ prerender }) => (prerender.dynamicRoutes["/w/[workspace]/today"].compute = "resuming") }),
  );
  assert.equal(faults.length, 1);
  assert.match(
    faults[0],
    /^\/w\/\[workspace\]\/today: prerendered with a render left to a request \(compute resuming\)/,
  );
});

test("a shell that waits on the request, or that has no segment files to answer a warm, fails", () => {
  const route = "/w/[workspace]/people/[[...param]]";
  const waits = staticShellFaults(build({ edit: ({ metas }) => (metas[route] = { postponed: "…" }) }));
  assert.deepEqual(waits, [`${route}: its shell waits on the request (postponed state in its .meta)`]);
  const bare = staticShellFaults(
    build({ edit: ({ written }) => written.delete(`${route}.segments/_tree.segment.rsc`) }),
  );
  assert.deepEqual(bare, [`${route}: no segment files: a warm of it would render it`]);
});

test("an OS page the build did not prerender at all fails: a request renders it", () => {
  const faults = staticShellFaults(
    build({ edit: ({ prerender }) => delete prerender.dynamicRoutes["/w/[workspace]/today"] }),
  );
  assert.deepEqual(faults, ["/w/[workspace]/today: not prerendered: a request renders it"]);
});

test("the version door prerendered fails: it must name the deploy that answers", () => {
  const faults = staticShellFaults(
    build({ edit: ({ prerender }) => (prerender.routes["/api/version"] = { compute: "static" }) }),
  );
  assert.equal(faults.length, 1);
  assert.match(faults[0], /^\/api\/version: prerendered/);
});

test("a public page that blocks is not the OS's, and is left alone", () => {
  // /b/[slug] renders at each request on purpose (instant = false): it reads its workspace before it draws.
  assert.ok(!staticShellFaults(build()).some((f) => f.startsWith("/b/")));
});

test("a build of another shape is refused, not held less", () => {
  assert.throws(() => staticShellFaults({ ...build(), prerender: {} }), /no routes or dynamicRoutes/);
  const { "/(os)/page": _home, ...noHome } = PAGES;
  assert.throws(() => staticShellFaults(build({ pages: noHome })), /names no OS home/);
});
