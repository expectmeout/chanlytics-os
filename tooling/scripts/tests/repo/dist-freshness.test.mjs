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
import { ROOT } from "../_source.mjs";

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

/**
 * Contracts is bundled INTO the four packages that import it, so a top-level
 * expression the bundler cannot prove pure is a side effect it has to keep.
 * One Business-tab sentence table dragged 715 lines of a tab no edge handler
 * and no job runner ever draws into channels, core, db and jobs — and jobs
 * carried the rules fold six times, once per package re-bundled into it.
 *
 * `packages/contracts/src/config/business-tab/rule-strengths.ts` states the fix beside GUARDRAIL_KEYS,
 * which met this first: build the value inside a call marked `/* @__PURE__ *\/`,
 * so esbuild may drop the whole thing where nothing reads it.
 *
 * Read as text, and with `fs` rather than `_source.mjs`: the fact under test IS
 * the compiled bundle's contents, which has no seam to execute, and `_source`
 * is for reading src. The remedy when this fails is never to widen the list —
 * it is to mark the new initializer pure.
 */
const TAB_ONLY = ["GUARDRAIL_KEYS", "STRENGTHS", "RULES_WITHOUT_FIELDS_WORDS", "PROMPT_READERS", "PROMPT_NOW"];

test("the Business tab's sentence tables stay out of the four bundles that never draw it", () => {
  const carried = [];
  for (const pkg of PACKAGES.filter((p) => p !== "contracts")) {
    const dist = path.join(ROOT, "packages", pkg, "dist", "index.js");
    if (!fs.existsSync(dist)) continue;
    const text = fs.readFileSync(dist, "utf8");
    for (const name of TAB_ONLY) {
      // Counted by splitting rather than by a regex: the name is a plain identifier, and a hand-escaped
      // word boundary in a template literal is the one thing that could make this guard silently pass.
      const n = text.split(name).length - 1;
      if (n > 0) carried.push(`${pkg}: ${name} x${n}`);
    }
  }
  assert.deepEqual(
    carried,
    [],
    "mark the initializer /* @__PURE__ */ in contracts and rebuild — do not add the name to this list",
  );
});
