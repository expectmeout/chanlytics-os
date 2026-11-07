/**
 * The dependency rules decision 0106 holds outright, and each measure kept honest on a graph written for it: a measure that quietly read nothing would hold every
 * number at zero. `_boundaries.mjs` has the measures; the numbers still falling are check:debt's (BOUNDARY_RATCHETS).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../../_source.mjs";
import {
  BOUNDARY_RATCHETS,
  COUNTED_TREES,
  DOMAIN_TREES,
  ONE_WAY_TREES,
  PACKAGE_MAP,
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
    "domain-circles.json",
    "long-doors.json",
    "module-circles.json",
    "one-tree-contracts.json",
    "root-names.json",
    "type-circles.json",
  ]);
  for (const r of BOUNDARY_RATCHETS) assert.ok(r.advice && r.name, `${r.file} says what it holds and what to do`);
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
