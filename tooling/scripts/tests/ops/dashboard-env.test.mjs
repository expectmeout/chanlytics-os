/**
 * apps/dashboard/src/server/env.ts is the dashboard's one reader of the environment, and a production deployment
 * that lacks what it cannot serve without refuses to start (instrumentation.ts).
 *
 * The promises, each run here: a value is read when it is asked for, never at import; blank is unset and whitespace
 * is trimmed; a value its schema refuses reads as unset; the typed module names exactly the variables the manifest
 * declares; a production boot missing a required variable logs one line naming it (never its value) and throws, and
 * a preview or a laptop never does; and the addresses that were production's code defaults (the edge's, the one the
 * business's pages are printed under) are production's to name, a preview keeping the old default.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { logLineOf } from "../_log-lines.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (p) => pathToFileURL(path.join(ROOT, p)).href;

const { env, problemsIn, REQUIRED_IN_PRODUCTION } = await import(at("apps/dashboard/src/server/env.ts"));
const { register } = await import(at("apps/dashboard/instrumentation.ts"));
const { edgeUrl } = await import(at("apps/dashboard/src/server/edge.ts"));
const { canonicalOrigin, printableOrigin } = await import(at("apps/dashboard/src/server/origin.ts"));

/** A production environment that holds everything it must (made-up values). */
const WHOLE = {
  VERCEL_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.example.com",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-for-tests",
  SUPABASE_SERVICE_ROLE_KEY: "service-key-for-tests",
  EDGE_URL: "https://edge.example.com",
  EDGE_CALL_SECRET: "edge-call-secret-for-tests",
  CANONICAL_HOST: "app.example.com",
};

const saved = new Map();
function setEnv(vars) {
  for (const [k, v] of Object.entries(vars)) {
    if (!saved.has(k)) saved.set(k, process.env[k]);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}
afterEach(() => {
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  saved.clear();
});

/** Every line the logger writes while `fn` runs, parsed. */
async function linesOf(fn) {
  const lines = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  for (const m of ["log", "warn", "error"])
    console[m] = (...args) => {
      const line = logLineOf(args);
      if (line) lines.push(line);
    };
  try {
    await fn();
  } finally {
    Object.assign(console, orig);
  }
  return lines;
}

test("a value is read when asked for, not when the module loads; blank is unset and whitespace trimmed", () => {
  setEnv({ DIAG_KEY: undefined });
  assert.equal(env.DIAG_KEY, undefined);
  setEnv({ DIAG_KEY: "k-1" });
  assert.equal(env.DIAG_KEY, "k-1");
  setEnv({ DIAG_KEY: "  k-2  " });
  assert.equal(env.DIAG_KEY, "k-2");
  setEnv({ DIAG_KEY: "   " });
  assert.equal(env.DIAG_KEY, undefined, "an emptied variable reads as unset");
});

test("a value its schema refuses reads as unset, never as itself", () => {
  setEnv({ EDGE_URL: "edge.example.com/api" });
  assert.equal(env.EDGE_URL, undefined, "not an origin");
  setEnv({ EDGE_URL: "https://edge.example.com/" });
  assert.equal(env.EDGE_URL, "https://edge.example.com", "a trailing slash is the same origin");
  setEnv({ EDGE_PROVIDERS: "yes" });
  assert.equal(env.EDGE_PROVIDERS, undefined, "only the word live");
  setEnv({ VERCEL_ENV: "Production" });
  assert.equal(env.VERCEL_ENV, undefined, "an unknown deployment is not production");
  setEnv({ CANONICAL_HOST: "https://app.example.com" });
  assert.equal(env.CANONICAL_HOST, undefined, "a host, not an origin");
});

test("the module names every variable the manifest declares, and nothing else", () => {
  const declared = new Set();
  for (const line of fs.readFileSync(path.join(ROOT, "apps/dashboard/.env.example"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=/);
    if (m) declared.add(m[1]);
  }
  // The platform's own, which nobody fills in (env-manifest.test.mjs lists the same); and the build's sha, which the
  // browser alone reads (src/lib/public-env.ts), next.config deriving it from Vercel's.
  const platform = new Set(["VERCEL_ENV", "VERCEL_GIT_COMMIT_SHA", "NEXT_RUNTIME"]);
  const typed = new Set(Object.keys(env).filter((k) => !platform.has(k)));
  assert.deepEqual([...typed].filter((k) => !declared.has(k)).sort(), [], "typed but not in .env.example");
  assert.deepEqual(
    [...declared].filter((k) => !typed.has(k) && k !== "NEXT_PUBLIC_BUILD_SHA").sort(),
    [],
    "in .env.example but not typed",
  );
});

test("production names what it cannot serve without; a preview or a laptop is never missing anything", () => {
  assert.deepEqual(problemsIn(WHOLE), { missing: [], malformed: [] });
  assert.deepEqual(problemsIn({ VERCEL_ENV: "production" }).missing, [...REQUIRED_IN_PRODUCTION]);
  assert.deepEqual(problemsIn({ ...WHOLE, EDGE_URL: "  " }).missing, ["EDGE_URL"], "blank is unset");
  assert.deepEqual(problemsIn({}), { missing: [], malformed: [] }, "a laptop");
  assert.deepEqual(problemsIn({ VERCEL_ENV: "preview" }), { missing: [], malformed: [] }, "a preview");
  assert.deepEqual(problemsIn({ ...WHOLE, EDGE_URL: "http://edge.example.com" }).malformed, ["EDGE_URL"], "https only");
  assert.deepEqual(problemsIn({ VERCEL_ENV: "preview", EDGE_URL: "not an origin" }).malformed, ["EDGE_URL"]);
});

test("a production instance missing a required variable logs one line naming it, never a value, and refuses to start", async () => {
  const secret = "value-that-must-not-be-logged";
  setEnv({ ...WHOLE, EDGE_URL: undefined, CANONICAL_HOST: undefined, DIAG_KEY: secret, NEXT_RUNTIME: "nodejs" });
  let thrown = null;
  const lines = await linesOf(async () => {
    try {
      await register();
    } catch (e) {
      thrown = e;
    }
  });
  assert.ok(thrown, "the instance must not start: Next rethrows what register throws");
  assert.match(thrown.message, /^env_invalid: .*EDGE_URL, CANONICAL_HOST$/);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].event, "env_invalid");
  assert.equal(lines[0].level, "error");
  assert.deepEqual(lines[0].missing, ["EDGE_URL", "CANONICAL_HOST"]);
  assert.ok(!JSON.stringify(lines).includes(secret), "names, never values");
});

test("a whole production instance starts; one missing everything starts on a preview and in the Edge runtime", async () => {
  setEnv({ ...WHOLE, NEXT_RUNTIME: "nodejs" });
  assert.deepEqual(await linesOf(() => register()), []);
  setEnv({ ...Object.fromEntries(REQUIRED_IN_PRODUCTION.map((k) => [k, undefined])), VERCEL_ENV: "preview" });
  assert.deepEqual(await linesOf(() => register()), [], "a preview");
  setEnv({ VERCEL_ENV: "production", NEXT_RUNTIME: undefined });
  assert.deepEqual(await linesOf(() => register()), [], "not the Node runtime: nothing to check");
});

test("an unreadable optional value is said once at start, and never stops production", async () => {
  setEnv({ ...WHOLE, NEXT_RUNTIME: "nodejs", EDGE_PROVIDERS: "yes" });
  const lines = await linesOf(() => register());
  assert.deepEqual(
    lines.map((l) => [l.event, l.names]),
    [["env_unreadable", ["EDGE_PROVIDERS"]]],
  );
});

test("the edge's address: production names it or throws; a preview or a laptop keeps the old default", () => {
  setEnv({ VERCEL_ENV: "production", EDGE_URL: undefined });
  assert.throws(() => edgeUrl(), /EDGE_URL is required in production/);
  setEnv({ EDGE_URL: "https://edge.example.com/" });
  assert.equal(edgeUrl(), "https://edge.example.com");
  setEnv({ VERCEL_ENV: "preview", EDGE_URL: undefined });
  assert.equal(edgeUrl(), "https://chanlytics-messaging.vercel.app");
});

test("the printed address: CANONICAL_HOST in production, or a throw; the filing's address off production", () => {
  setEnv({ VERCEL_ENV: "production", CANONICAL_HOST: undefined });
  assert.throws(() => canonicalOrigin(), /CANONICAL_HOST is required in production/);
  setEnv({ CANONICAL_HOST: "App.Example.com" });
  assert.equal(canonicalOrigin(), "https://app.example.com");
  assert.equal(printableOrigin("https", "evil.example"), "https://app.example.com");
  assert.equal(printableOrigin("http", "localhost:3000"), "http://localhost:3000");
  setEnv({ VERCEL_ENV: undefined, CANONICAL_HOST: undefined });
  assert.equal(canonicalOrigin(), "https://app.chanlytics.com");
});
