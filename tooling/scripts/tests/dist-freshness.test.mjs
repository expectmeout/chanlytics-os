/**
 * The suite tests what is COMPILED, not what is written.
 *
 * tooling/scripts declares @chanlytics/contracts as a workspace dependency and
 * that package's `main` is ./dist/index.js — so every assertion in
 * business-profile, business-clock, voice-parity and prompt-preview resolves to
 * the committed bundle. Edit packages/contracts/src, run `pnpm test`, and the
 * whole suite goes green against the OLD behaviour: the new code was never
 * loaded, the new test re-validated the previous compile, and nothing says so.
 *
 * That inverts the normal loop on the highest-consequence file in the repo —
 * the one whose parse failure mutes a live customer line. CI builds before it
 * tests, so it is safe there; this is the guard for everywhere else.
 *
 * Timestamps, not content, because dist is compiled and cannot be diffed
 * against its source. A fresh clone can trip this; the remedy is a rebuild,
 * which is exactly what you should do before trusting a green suite.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./_source.mjs";

/** Newest mtime under a directory, recursively. */
function newestUnder(dir) {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestUnder(full));
    else newest = Math.max(newest, fs.statSync(full).mtimeMs);
  }
  return newest;
}

const PACKAGES = fs
  .readdirSync(path.join(ROOT, "packages"), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

test("the tests import dist, so dist must not be older than src", () => {
  const stale = [];
  for (const pkg of PACKAGES) {
    const src = path.join(ROOT, "packages", pkg, "src");
    const dist = path.join(ROOT, "packages", pkg, "dist", "index.js");
    if (!fs.existsSync(src) || !fs.existsSync(dist)) continue;
    const srcAt = newestUnder(src);
    const distAt = fs.statSync(dist).mtimeMs;
    // A second of slack: tsup writes dist while src is still being touched by
    // an editor, and a hair's difference is not a stale bundle.
    if (srcAt > distAt + 1000) {
      stale.push(`${pkg} (src is ${Math.round((srcAt - distAt) / 1000)}s newer than dist)`);
    }
  }
  assert.deepEqual(
    stale,
    [],
    `These packages' sources are newer than the bundles the tests actually load:\n  ${stale.join(
      "\n  ",
    )}\nRun the package build before trusting this suite — otherwise every assertion below re-checks the previous compile.`,
  );
});

test("contracts really does resolve to dist — if that ever changes, so must this file", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "packages", "contracts", "package.json"), "utf8"));
  assert.match(
    pkg.main ?? "",
    /dist/,
    "if contracts starts resolving to src, this guard is obsolete rather than wrong — delete it deliberately",
  );
});
