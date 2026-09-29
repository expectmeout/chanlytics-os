/**
 * One strict base: every project's tsconfig extends tsconfig.base.json, and none loosens what it sets.
 *
 * Until this held, the packages extended the base and the two apps restated their own copy of it, so a flag added to
 * the base reached the packages alone: the edge, the code a customer's message travels through, and the dashboard ran
 * with `strict` and nothing more. Now the base carries the flags (strict, noUncheckedIndexedAccess, noImplicitOverride,
 * noImplicitReturns, noFallthroughCasesInSwitch, noUncheckedSideEffectImports, allowUnreachableCode false,
 * verbatimModuleSyntax, isolatedModules) and each project states only what its runtime needs on top.
 *
 * Read as the compiler reads them, `extends` followed: a project may not set any of the base's checks to another
 * value, with one exception. noUncheckedIndexedAccess may be off in a project whose index reads are not guarded yet,
 * and every such project is measured by types/index-reads-are-counted.test.mjs, a count per file that may only
 * fall. The root tsconfig.json is not a project's: it gives the test runner (tsx) the dashboard's `@/` paths, and
 * nothing compiles against it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import ts from "typescript";
import { ROOT } from "../_source.mjs";
import { projectConfigs, resolvedConfig, waitingProjects } from "../_measures.mjs";

const BASE = path.join(ROOT, "tsconfig.base.json");
/** The base's own compiler options, as written: the checks every project keeps. */
const baseOptions = ts.readConfigFile(BASE, ts.sys.readFile).config.compilerOptions;
/** The flags a project must keep at the base's value: every boolean the base sets. */
const CHECKS = Object.keys(baseOptions).filter((k) => typeof baseOptions[k] === "boolean");
/** The one the unchecked-index measure lets a project wait on. */
const MAY_WAIT = "noUncheckedIndexedAccess";

const projects = projectConfigs();
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

test("the reader sees every project's tsconfig, and the base's checks", () => {
  const tracked = ["apps/dashboard", "apps/edge", "apps/mobile", "packages/contracts", "packages/core", "packages/db"];
  for (const p of tracked)
    assert.ok(
      projects.some((c) => c.project === p),
      `${p}/tsconfig.json is read`,
    );
  for (const flag of ["strict", MAY_WAIT, "noImplicitOverride", "verbatimModuleSyntax", "isolatedModules"]) {
    assert.equal(baseOptions[flag], true, `tsconfig.base.json sets ${flag}`);
  }
});

test("every project's tsconfig extends tsconfig.base.json", () => {
  const off = projects.filter(({ tsconfig }) => {
    const { extends: ext } = ts.readConfigFile(tsconfig, ts.sys.readFile).config;
    const named = (Array.isArray(ext) ? ext : [ext]).filter((e) => typeof e === "string" && e.startsWith("."));
    return !named.some((e) => path.resolve(path.dirname(tsconfig), e) === BASE);
  });
  assert.deepEqual(
    off.map(({ tsconfig }) => rel(tsconfig)),
    [],
    'add "extends": "../../tsconfig.base.json" (first, beside a framework\'s own base), and state only what the project needs on top',
  );
});

test("no project loosens the base: each check resolves to the base's value, noUncheckedIndexedAccess only where it is counted", () => {
  const waiting = new Set(waitingProjects().map((p) => p.project));
  const off = [];
  for (const { project, tsconfig } of projects) {
    const options = resolvedConfig(tsconfig).options;
    for (const flag of CHECKS) {
      if (flag === MAY_WAIT && waiting.has(project)) continue;
      if (options[flag] !== baseOptions[flag])
        off.push(`${project}: ${flag} is ${options[flag]}, the base's ${baseOptions[flag]}`);
    }
  }
  assert.deepEqual(off, [], "a check the base sets is the project's too: fix what it finds rather than turn it off");
});

test("a project that waits on noUncheckedIndexedAccess says so in its own tsconfig, where the measure reads it", () => {
  for (const { project, tsconfig } of waitingProjects()) {
    const own = ts.readConfigFile(tsconfig, ts.sys.readFile).config.compilerOptions ?? {};
    assert.equal(
      own[MAY_WAIT],
      false,
      `${project}: the flag is off in its own tsconfig.json, not inherited from elsewhere`,
    );
  }
});
