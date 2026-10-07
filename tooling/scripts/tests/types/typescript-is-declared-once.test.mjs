/**
 * One TypeScript, declared once: pnpm-workspace.yaml's catalog pins its version, and every package.json that names
 * `typescript` names it `catalog:`.
 *
 * Until this held, the repository ran two. `tsc`, Next's build, tsup's declarations and the ratchets loaded 5.9.3,
 * because every package and app declared `typescript ^5.7`; typescript-eslint, knip and the phone app loaded 6.0.3,
 * which the root never declared: it was the copy the hoister lifted out of `apps/mobile` (`~6.0.3`). The lint judged
 * the code with one compiler and the typecheck with another, and nothing said so. Under 6.0.3 three packages failed to
 * typecheck (45 errors, all from 6.0's new `types: []` default), which is how far apart the two had drifted.
 *
 * So the version is written once, in the catalog, at an exact version, and every package.json names it `catalog:`. A
 * `pnpm add` that writes a version instead fails here. (`catalogMode: strict` held that at the command too until 29 Sep
 * 2026, and broke every Dependabot update: repo/settings/pnpm-settings.test.mjs says why.) This module holds what is written;
 * typescript-is-installed-once.test.mjs holds what an install made of it. Why TypeScript 7 waits is written once,
 * beside the Dependabot rule that holds it back (.github/dependabot.yml).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../_source.mjs";
import { catalogPins, workspaceProjects } from "../_pnpm-workspace.mjs";

const TS = "typescript";
const FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
/** An exact version: no range, no tag, nothing pnpm could resolve two ways. */
const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

const manifestPath = (project) => (project === "." ? "package.json" : `${project}/package.json`);
const manifest = (project) => JSON.parse(fs.readFileSync(path.join(ROOT, manifestPath(project)), "utf8"));
/** Each `typescript` a package.json names: the field and the specifier. */
const namesOf = (pkg) => FIELDS.filter((f) => pkg[f]?.[TS] !== undefined).map((f) => ({ field: f, spec: pkg[f][TS] }));

const projects = workspaceProjects();

test("the reader sees the workspace: its projects, and the ones that name TypeScript", () => {
  assert.ok(projects.length >= 10, `read ${projects.length} projects from pnpm-workspace.yaml: ${projects.join(", ")}`);
  for (const p of ["apps/dashboard", "apps/edge", "apps/mobile", "packages/contracts", "tooling/scripts"]) {
    assert.ok(projects.includes(p), `${p} is a workspace project`);
  }
  const naming = projects.filter((p) => namesOf(manifest(p)).length > 0);
  assert.ok(naming.length >= 9, `${naming.length} projects name typescript: ${naming.join(", ")}`);
});

test("every workspace package.json that names typescript names it `catalog:`, the root among them", () => {
  const off = projects.flatMap((p) =>
    namesOf(manifest(p))
      .filter(({ spec }) => spec !== "catalog:")
      .map(({ field, spec }) => `${manifestPath(p)}: ${field}.typescript is "${spec}"`),
  );
  assert.deepEqual(off, [], 'name it "catalog:", so pnpm-workspace.yaml is the one place its version is written');
  // The root's own tools load it (typescript-eslint, knip, and the ratchets under this runner), so the root
  // declares it: a copy nobody declares is whichever one the hoister picked, which is how 6.0.3 got here.
  assert.ok(namesOf(manifest(".")).length > 0, "the root package.json names typescript");
});

test("the catalog pins TypeScript once, in the default catalog, at an exact version", () => {
  const pins = catalogPins(TS);
  assert.deepEqual(
    pins.map((p) => p.catalog),
    ["default"],
    'one `typescript:` in pnpm-workspace.yaml, under `catalog:` (what "catalog:" names), and in no named catalog',
  );
  assert.match(pins[0].version, EXACT, `the catalog's typescript is "${pins[0].version}"; pin a version, not a range`);
});
