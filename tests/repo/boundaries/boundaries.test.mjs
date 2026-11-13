/**
 * The dependency rules decision 0110 holds outright, and each measure kept honest on a graph written for it: a measure that quietly read nothing would hold every
 * number at zero. `_boundaries.mjs` has the measures; the numbers still falling are check:debt's (BOUNDARY_RATCHETS).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { ROOT } from "../../_source.mjs";
import {
  BOUNDARY_RATCHETS,
  COUNTED_TREES,
  DOMAIN_TREES,
  ONE_WAY_TREES,
  PACKAGE_MAP,
  bridgeIntoSurfaces,
  circlesOf,
  declaredSiblings,
  domainOf,
  domainShape,
  isBackend,
  moduleCircles,
  moduleGraph,
  packageNames,
  reachesPastExports,
  rootNames,
  surfacesReachedIn,
} from "./_boundaries.mjs";

const graph = moduleGraph();

test("the measures read the tree, and a circle is a circle", () => {
  assert.ok(graph.size > 2000, `${graph.size} modules read`);
  const links = { a: ["b"], b: ["c"], c: ["a"], d: ["a"], e: [] };
  assert.deepEqual(
    circlesOf(Object.keys(links), (n) => links[n]).map((c) => [...c].sort()),
    [["a", "b", "c"]],
  );
  assert.deepEqual(
    circlesOf(["x", "y"], (n) => (n === "x" ? ["y"] : [])),
    [],
  );
  assert.equal(domainOf("apps/edge/lib/ops/health-sweep.ts", "apps/edge/lib"), "ops");
  assert.equal(domainOf("packages/log/src/logger.ts", "packages/log/src"), "(root)");
  for (const name of [...ONE_WAY_TREES, ...COUNTED_TREES])
    assert.ok(domainShape(DOMAIN_TREES[name], graph).domains >= 3, `${name} has domains`);
  assert.deepEqual(BOUNDARY_RATCHETS.map((r) => r.file).sort(), [
    "bridge-into-surfaces.json",
    "domain-circles.json",
    "long-doors.json",
    "module-circles.json",
    "one-tree-contracts.json",
    "root-names.json",
    "type-circles.json",
  ]);
  for (const r of BOUNDARY_RATCHETS) assert.ok(r.advice && r.name, `${r.file} says what it holds and what to do`);
});

test("bridge-into-surfaces counts each surface module a bridge module loads, by a value import, a re-export or an import(), once; a type is not counted", () => {
  const frame = "apps/dashboard/src/bridge/frame.tsx";
  const known = new Set([
    frame,
    "apps/dashboard/src/bridge/api.ts",
    "apps/dashboard/src/surfaces/today/page.tsx",
    "apps/dashboard/src/surfaces/today/rows.ts",
    "apps/dashboard/src/surfaces/today/day.ts",
    "apps/dashboard/src/surfaces/kit/button/button.tsx",
    "apps/dashboard/src/surfaces/reports/reports-page.tsx",
    "apps/dashboard/src/surfaces/people/chrome.ts",
  ]);
  const written = [
    'import { TodayPage } from "@/surfaces/today/page";',
    'import { rowsOf, type Row } from "../surfaces/today/rows";',
    'import type { Day } from "@/surfaces/today/day";',
    'import { type Mark } from "@/surfaces/kit/button/button";',
    'import { api } from "./api";',
    'export { TodayPage as Today } from "@/surfaces/today/page";',
    'export type { Crumb } from "@/surfaces/people/chrome";',
    'const Reports = lazy(() => import("@/surfaces/reports/reports-page"));',
  ].join("\n");
  const sf = ts.createSourceFile(frame, written, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.deepEqual([...surfacesReachedIn(sf, frame, known)].sort(), [
    "apps/dashboard/src/surfaces/reports/reports-page.tsx",
    "apps/dashboard/src/surfaces/today/page.tsx",
    "apps/dashboard/src/surfaces/today/rows.ts",
  ]);
  const counted = bridgeIntoSurfaces();
  const keys = Object.keys(counted);
  assert.ok(keys.length > 0, "the bridge's own modules are read");
  assert.deepEqual(
    keys.filter((f) => !f.startsWith("apps/dashboard/src/bridge/")),
    [],
    "only the bridge's modules are counted",
  );
  assert.ok(counted["apps/dashboard/src/bridge/FrameApp.tsx"] > 0, "the frame's own module counts too");
});

test("the packages lean one way, in the order written down", () => {
  const declared = declaredSiblings();
  assert.deepEqual(packageNames().sort(), Object.keys(PACKAGE_MAP).sort(), "a new package takes its place in the map");
  for (const [p, deps] of Object.entries(declared)) {
    const strays = deps.filter((d) => !PACKAGE_MAP[p].includes(d));
    assert.deepEqual(strays, [], `${p} may lean on ${PACKAGE_MAP[p].join(", ") || "nothing"}`);
  }
  // The map has no circle of its own, so the check above can only admit one way.
  assert.deepEqual(
    circlesOf(Object.keys(PACKAGE_MAP), (p) => PACKAGE_MAP[p]),
    [],
  );
  const doc = fs.readFileSync(path.join(ROOT, "docs/architecture.md"), "utf8").replace(/ +/g, " ");
  for (const [p, deps] of Object.entries(PACKAGE_MAP)) {
    const row = `| \`${p}\` | ${deps.length ? deps.map((d) => `\`${d}\``).join(", ") : "nothing"} |`;
    assert.ok(doc.includes(row), `docs/architecture.md, "Which way the code leans", has ${row}`);
  }
});

test("no value import runs in a circle in the backend", () => {
  const { values } = moduleCircles(graph);
  const backend = values.filter((c) => c.some(isBackend));
  assert.deepEqual(backend, [], "a module needs its own importer; move what both need to where both can lean on it");
});

test("a backend tree's domains lean one way", () => {
  for (const name of ONE_WAY_TREES) {
    const { circle, twoWay } = domainShape(DOMAIN_TREES[name], graph);
    assert.deepEqual(twoWay, [], `${name}: pairs of domains that run both ways`);
    assert.equal(circle, 0, `${name}: domains in a circle`);
  }
});

test("what a tree shares leans on none of its domains", () => {
  for (const [name, root] of Object.entries(DOMAIN_TREES)) {
    assert.deepEqual(domainShape(root, graph).sharedUp, [], `${name}: shared/ imports a domain`);
  }
});

test("db and channels are reached by their domains, and nobody reaches past a package's exports", () => {
  for (const p of ["db", "channels"]) {
    assert.equal(rootNames(p), 0, `${p} has no root barrel`);
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "packages", p, "package.json"), "utf8"));
    assert.equal(manifest.exports["."], undefined, `${p} has no root entry`);
    assert.ok(Object.keys(manifest.exports).length >= 10, `${p} has an entry per domain`);
  }
  assert.deepEqual(reachesPastExports(), []);
});
