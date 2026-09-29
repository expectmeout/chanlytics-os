/**
 * pnpm's settings live in one file, pnpm-workspace.yaml, where every pnpm that touches the lockfile reads them.
 *
 * Measured on 29 Sep 2026 (the scorecard's I1:2 and defect 56): Dependabot's updater runs pnpm 11, which no longer
 * reads package.json's "pnpm" field or pnpm's settings in .npmrc. So the lockfile it wrote dropped the overrides and
 * `injectWorkspacePackages`, and CI's pnpm 10 refused it at `--frozen-lockfile`. Under `catalogMode: strict`, an update
 * of any dependency outside the catalog (the root's prettier, the dashboard's next) also wrote it into the lockfile's
 * catalogs, with pnpm 10 and 11 alike, and the frozen install refused that too (ERR_PNPM_LOCKFILE_CONFIG_MISMATCH).
 * With the settings here and the mode manual, a pnpm 11 update of either wrote a lockfile pnpm 10 installs frozen.
 * Vercel installs with pnpm 10.34.5 (its build log, from `packageManager`), which reads this file too.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../_source.mjs";
import { setting, settingBlock } from "../_pnpm-workspace.mjs";

const rootManifest = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

test("no pnpm setting lives in package.json or .npmrc, where Dependabot's pnpm 11 cannot read it", () => {
  assert.equal("pnpm" in rootManifest, false, 'package.json: move the "pnpm" field\'s settings to pnpm-workspace.yaml');
  const npmrc = path.join(ROOT, ".npmrc");
  const lines = fs.existsSync(npmrc)
    ? fs
        .readFileSync(npmrc, "utf8")
        .split(/\r?\n/)
        .filter((l) => l.trim() && !l.trim().startsWith("#"))
    : [];
  assert.deepEqual(lines, [], ".npmrc: a pnpm setting belongs in pnpm-workspace.yaml (camelCase there)");
});

test("the settings the edge's lambda needs are in pnpm-workspace.yaml", () => {
  // nft does not follow pnpm's symlinks into a Vercel function: third-party code hoisted to real directories, the
  // workspace's packages copied in, their committed dist with them.
  assert.equal(setting("nodeLinker"), "hoisted");
  assert.equal(setting("injectWorkspacePackages"), "true");
});

test("the catalog is manual: strict mode wrote every updated dependency into the lockfile's catalogs", () => {
  assert.equal(setting("catalogMode"), "manual");
});

test("the overrides lift the phone app's two advisories, and query-string is patched for the ESM decoder", () => {
  const overrides = settingBlock("overrides");
  assert.equal(overrides["uuid@<11.1.1"], "^11.1.1", "GHSA-w5hq-g745-h8pq");
  assert.equal(overrides["decode-uri-component@<0.5.0"], "^0.5.0", "GHSA-vcc3-ghjq-m6fr");
  const patched = settingBlock("patchedDependencies");
  for (const [dependency, file] of Object.entries(patched))
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${dependency}: ${file} is in the tree`);
  assert.ok("query-string@7.1.3" in patched);
});
