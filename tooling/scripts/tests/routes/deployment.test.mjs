/**
 * One deployment configuration says what this deployment may do. Production
 * reaches the real providers; a preview or a laptop only when it says so
 * with EDGE_PROVIDERS=live; an unset VERCEL_ENV is a laptop, never
 * production.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { deploymentFrom } = await import(pathToFileURL(path.join(ROOT, "apps/dashboard/src/server/env.ts")).href);

test("production is live; a preview or a laptop is not, unless it says so", () => {
  assert.deepEqual(deploymentFrom({ VERCEL_ENV: "production" }), { env: "production", providersLive: true });
  assert.deepEqual(deploymentFrom({ VERCEL_ENV: "preview" }), { env: "preview", providersLive: false });
  assert.deepEqual(deploymentFrom({ VERCEL_ENV: "development" }), { env: "development", providersLive: false });
  assert.deepEqual(deploymentFrom({ VERCEL_ENV: "preview", EDGE_PROVIDERS: "live" }), {
    env: "preview",
    providersLive: true,
  });
  assert.deepEqual(deploymentFrom({ EDGE_PROVIDERS: "live" }), { env: "development", providersLive: true });
});

test("an unset or unknown VERCEL_ENV is a laptop, never production", () => {
  assert.deepEqual(deploymentFrom({}), { env: "development", providersLive: false });
  assert.deepEqual(deploymentFrom({ VERCEL_ENV: "" }), { env: "development", providersLive: false });
  assert.deepEqual(deploymentFrom({ VERCEL_ENV: "Production" }), { env: "development", providersLive: false });
  assert.equal(
    deploymentFrom({ EDGE_PROVIDERS: "yes" }).providersLive,
    false,
    "only the word live opens the providers",
  );
});
