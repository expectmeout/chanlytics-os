/**
 * MapLibre draws in a worker it finds beside its own bundle by `import.meta.url`,
 * which the app's bundler does not preserve; so the worker and the chunk it
 * imports are served by the app itself from apps/dashboard/public/maplibre/
 * (legacy-bridge/lead-map.ts names the URL). They must be the bytes of the
 * installed package, or a bump of maplibre-gl runs a worker from another
 * version against the main thread: copy the two files again after a bump.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "./_source.mjs";

const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve("maplibre-gl/dist/maplibre-gl.mjs"));
const served = path.join(ROOT, "apps/dashboard/public/maplibre");

for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  test(`public/maplibre/${file} is the installed maplibre-gl's own`, () => {
    const ours = fs.readFileSync(path.join(served, file));
    const theirs = fs.readFileSync(path.join(dist, file));
    assert.ok(ours.equals(theirs), `copy node_modules/maplibre-gl/dist/${file} to apps/dashboard/public/maplibre/`);
  });
}
