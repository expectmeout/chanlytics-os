/**
 * Base UI, as the kit takes it (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, decision 15 and step 2.5):
 * the kit's components with behaviour of their own are built on its unstyled parts, and its second condition is one
 * exact version. So apps/dashboard/package.json names `@base-ui/react` at an exact version (no caret, no tag), among
 * the dependencies a page ships with, and the copy an install made is that version. What that version brings is held
 * here too, so a bump that changes it is red: its licence is MIT; its peer range takes the React the dashboard runs;
 * and neither it nor anything it depends on runs a script as it installs (preinstall, install, postinstall).
 *
 * That each component imports its own part (`@base-ui/react/dialog`), never the index, is the lint's
 * (eslint.config.mjs, BASE_UI_INDEX), proved by repo/lint-boundaries.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "../_source.mjs";

const BASE_UI = "@base-ui/react";
/** An exact version: no range, no tag, nothing pnpm could resolve two ways. */
const EXACT = /^\d+\.\d+\.\d+$/;
/** The lifecycle scripts an install runs. */
const INSTALL_SCRIPTS = ["preinstall", "install", "postinstall"];

const DASHBOARD = path.join(ROOT, "apps/dashboard");
const dashboard = JSON.parse(fs.readFileSync(path.join(DASHBOARD, "package.json"), "utf8"));
/** A package's manifest, found as the module that requires it finds it: from `from`'s folder. */
const manifestFrom = (from, name) => {
  const at = createRequire(path.join(from, "package.json")).resolve(`${name}/package.json`);
  return { at: path.dirname(at), pkg: JSON.parse(fs.readFileSync(at, "utf8")) };
};

test("the dashboard pins one exact Base UI, among what its pages ship with, and the install made that version", () => {
  const spec = dashboard.dependencies?.[BASE_UI];
  assert.ok(spec, `${BASE_UI} is a dependency of apps/dashboard, which a page's bundle takes it from`);
  assert.match(spec, EXACT, `${BASE_UI} is pinned exactly, with no caret or tag: "${spec}"`);
  assert.equal(dashboard.devDependencies?.[BASE_UI], undefined, "and named once");
  assert.equal(manifestFrom(DASHBOARD, BASE_UI).pkg.version, spec, "the installed copy is the pinned version");
});

test("the pinned Base UI is MIT, takes the React the dashboard runs, and runs nothing as it installs, nor does anything it brings", () => {
  const { pkg } = manifestFrom(DASHBOARD, BASE_UI);
  assert.equal(pkg.license, "MIT");
  const react = manifestFrom(DASHBOARD, "react").pkg.version;
  const major = react.split(".")[0];
  for (const peer of ["react", "react-dom"]) {
    const range = pkg.peerDependencies?.[peer] ?? "";
    assert.ok(
      range.split("||").some((r) => r.trim() === `^${major}`),
      `its ${peer} peer range (${range}) takes React ${major}, the dashboard's (${react})`,
    );
  }
  // Base UI and every package it depends on, found as it finds them.
  const seen = new Map();
  const walk = (from, name) => {
    const found = manifestFrom(from, name);
    if (seen.has(found.at)) return;
    seen.set(found.at, found.pkg);
    for (const dep of Object.keys(found.pkg.dependencies ?? {})) walk(found.at, dep);
  };
  walk(DASHBOARD, BASE_UI);
  assert.ok(seen.size > 1, `its dependencies were read: ${[...seen.values()].map((p) => p.name).join(", ")}`);
  const running = [...seen.values()].flatMap((p) =>
    INSTALL_SCRIPTS.filter((s) => p.scripts?.[s]).map((s) => `${p.name}@${p.version} ${s}`),
  );
  assert.deepEqual(running, [], "a script run at install");
});
