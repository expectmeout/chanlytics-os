/**
 * The policy of every /v1 route: declared by the route, held to one file.
 *
 * route() makes a route state its scope, role, rate and whether it spends.
 * These import every route module (they load under the test runner) and ask
 * each exported handler what it declared. A change of policy is then a change
 * to route-policy.json that a reviewer reads in the diff, and a route that
 * declares nothing sits on a list that may only shrink, the way the source-scan
 * baseline does.
 *
 *   UPDATE_ROUTE_POLICY=1 pnpm test    rewrites the file from the routes
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Modules that build a service client on first use read these; nothing here dials it.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const here = path.dirname(fileURLToPath(import.meta.url));
const API = path.join(here, "../../../../apps/dashboard/app/api/v1");
const FILE = path.join(here, "../route-policy.json");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
/** Public by design, behind the middleware's PUBLIC_PATHS: there is no member to resolve. */
const OWN_DOOR = new Set(["signup", "calendar/filler.ics"]);

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === "route.ts") files.push(p);
  }
})(API);

const declared = {};
const undeclared = new Set();
for (const f of files.sort()) {
  const rel = path
    .relative(API, f)
    .replace(/\\/g, "/")
    .replace(/\/route\.ts$/, "");
  const mod = await import(pathToFileURL(f).href);
  for (const m of METHODS) {
    if (typeof mod[m] !== "function") continue;
    if (mod[m].policy) declared[`${m} ${rel}`] = { ...mod[m].policy };
    else if (!OWN_DOOR.has(rel)) undeclared.add(rel);
  }
}

const NOTE =
  "Written by route-policy.test.mjs (UPDATE_ROUTE_POLICY=1). A change here is a change to who may do what, how often, and on which workspace: review it as one.";
const current = { note: NOTE, undeclared: [...undeclared].sort(), routes: declared };
if (process.env.UPDATE_ROUTE_POLICY === "1") fs.writeFileSync(FILE, `${JSON.stringify(current, null, 2)}\n`);
const file = JSON.parse(fs.readFileSync(FILE, "utf8"));

test("every route declares its policy, or is on a list that may only shrink", () => {
  const grown = current.undeclared.filter((r) => !file.undeclared.includes(r));
  assert.deepEqual(grown, [], "new, or back on a bare withRoute: declare these with read() or write()");
  const gone = file.undeclared.filter((r) => !undeclared.has(r));
  assert.deepEqual(gone, [], "these declare their policy now: bank it with UPDATE_ROUTE_POLICY=1");
});

test("a GET is read(), and anything else is write()", () => {
  for (const [key, p] of Object.entries(declared)) assert.equal(p.kind, key.startsWith("GET ") ? "read" : "write", key);
});

test("a workspace or row write names who may make it; an account or platform one names no workspace role", () => {
  for (const [key, p] of Object.entries(declared)) {
    if (p.kind !== "write") continue;
    if (p.scope === "workspace" || p.scope === "row") assert.ok(p.role, `${key} must name a role`);
    else assert.equal(p.role, null, `${key}: the ${p.scope} scope has no workspace role to name`);
  }
});

test("only a workspace or row write may spend a workspace's money", () => {
  for (const [key, p] of Object.entries(declared)) {
    if (p.spend) assert.ok(p.kind === "write" && (p.scope === "workspace" || p.scope === "row"), key);
  }
});

test("what the routes declare is what the file says", () => {
  assert.deepEqual(declared, file.routes, "a route's policy changed: review it, then UPDATE_ROUTE_POLICY=1");
});

// The acts that cannot be taken back, or that hand over a workspace's people or its money, ask the Auth server whether
// the session is still live (`fresh`, route.ts): getClaims() cannot tell a session revoked a minute ago from a live one.
// The list is this test's; route-policy.json holds each route's declaration and this holds that no other route drifts in.
const FRESH = [
  "DELETE me",
  "PATCH team/[id]",
  "DELETE team/[id]",
  "POST team/invite",
  "GET export",
  "GET contacts/export",
  "GET leads/export",
  "DELETE contacts/[id]",
  "DELETE leads/[id]",
  "POST billing/checkout",
  "POST billing/portal",
  "POST billing/resume",
  "POST billing/start-now",
  // Who is on the team and who owns the workspace, and the platform's money, a partner's factor and a released number.
  "POST team/partner",
  "DELETE team/partner",
  "POST handovers/[id]/accept",
  "POST platform/partners/payout",
  "POST platform/partners/second-factor",
  "POST platform/lines/release",
];
test("the sensitive acts ask whether the session is still live, and no other route pays for it unannounced", () => {
  const fresh = Object.entries(declared)
    .filter(([, p]) => p.fresh === true)
    .map(([key]) => key)
    .sort();
  assert.deepEqual(fresh, [...FRESH].sort());
  assert.deepEqual(
    Object.entries(file.routes)
      .filter(([, p]) => p.fresh === true)
      .map(([key]) => key)
      .sort(),
    fresh,
    "route-policy.json says the same: bank it with UPDATE_ROUTE_POLICY=1",
  );
});
