/**
 * The OAuth state (Google, Instagram, a mailbox) is signed with its own secret, on every deployment. The platform key
 * stood in for it off production while it was unset, which made the door key a second credential of the OAuth round
 * trip; that stand-in was a security switch with a sunset (contracts' flag registry, ai/flags.ts), closed on 31
 * October 2026. Without its own secret, a deployment offers no connection, and signs nothing with the door key.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { stateSecret } = await import(
  pathToFileURL(path.join(ROOT, "apps/dashboard/src/server/connections/google.ts")).href
);

const NAMES = ["VERCEL_ENV", "GOOGLE_OAUTH_STATE_SECRET", "DIAG_KEY"];
const before = Object.fromEntries(NAMES.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of NAMES) {
    if (before[k] === undefined) delete process.env[k];
    else process.env[k] = before[k];
  }
});
function set(vars) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

test("every deployment signs with its own secret, and never with the door key", () => {
  for (const deployment of ["production", "preview", undefined]) {
    set({ VERCEL_ENV: deployment, GOOGLE_OAUTH_STATE_SECRET: "state-secret-for-tests", DIAG_KEY: "door-key" });
    assert.equal(stateSecret(), "state-secret-for-tests", String(deployment));
  }
});

test("without its own secret, no deployment signs a state: the door key stands in nowhere", () => {
  for (const deployment of ["production", "preview", undefined]) {
    set({ VERCEL_ENV: deployment, GOOGLE_OAUTH_STATE_SECRET: undefined, DIAG_KEY: "door-key" });
    assert.equal(
      stateSecret(),
      null,
      `${deployment}: no connection is offered, rather than one signed by the door key`,
    );
  }
});
