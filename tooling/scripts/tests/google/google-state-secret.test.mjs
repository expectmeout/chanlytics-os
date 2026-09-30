/**
 * The Google OAuth state is signed with its own secret. The platform key stood in for it while it was unset, which
 * made the door key a second credential of the OAuth round trip; production now refuses the stand-in, and off
 * production it is a security switch with a sunset (contracts' flag registry, ai/flags.ts) that says so once when it is used.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { logLineOf } from "../_log-lines.mjs";

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
function linesOf(fn) {
  const lines = [];
  const orig = console.warn;
  console.warn = (...args) => {
    const line = logLineOf(args);
    if (line) lines.push(line);
  };
  try {
    return { value: fn(), lines };
  } finally {
    console.warn = orig;
  }
}

test("production signs with its own secret, and never with the door key", () => {
  set({ VERCEL_ENV: "production", GOOGLE_OAUTH_STATE_SECRET: "state-secret-for-tests", DIAG_KEY: "door-key" });
  assert.equal(stateSecret(), "state-secret-for-tests");
  set({ GOOGLE_OAUTH_STATE_SECRET: undefined });
  const { value, lines } = linesOf(() => stateSecret());
  assert.equal(value, null, "no secret of its own: Connect Google is not offered, rather than signed by the door key");
  assert.deepEqual(lines, []);
});

test("off production the door key stands in while the secret is unset, and says so once", () => {
  set({ VERCEL_ENV: "preview", GOOGLE_OAUTH_STATE_SECRET: undefined, DIAG_KEY: "door-key" });
  const first = linesOf(() => stateSecret());
  const second = linesOf(() => stateSecret());
  assert.equal(first.value, "door-key");
  assert.equal(second.value, "door-key");
  assert.deepEqual(
    first.lines.map((l) => [l.event, l.deployment]),
    [["google_state_signed_by_diag_key", "preview"]],
  );
  assert.deepEqual(second.lines, [], "once per instance");
  set({ GOOGLE_OAUTH_STATE_SECRET: "state-secret-for-tests" });
  assert.equal(stateSecret(), "state-secret-for-tests", "its own secret, once set");
  set({ GOOGLE_OAUTH_STATE_SECRET: undefined, DIAG_KEY: undefined, VERCEL_ENV: undefined });
  assert.equal(stateSecret(), null, "a laptop with neither");
});
