/**
 * A production edge that lacks what it cannot serve without refuses to load (apps/edge/lib/env.ts, assertBootable,
 * run when the module every door reads its environment through is first imported), and the addresses the edge writes
 * are production's to name: the dashboard's and its own, which were production's addresses written as code defaults.
 * A preview or a laptop keeps the old defaults.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { logLineOf } from "../../_log-lines.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (p) => pathToFileURL(path.join(ROOT, p)).href;
const { assertBootable, bootProblems } = await import(at("apps/edge/lib/env.ts"));

/** What a production edge cannot serve without, written out: a change to the set is a change to this list. */
const REQUIRED_IN_PRODUCTION = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "EDGE_CALL_SECRET",
  "DASHBOARD_ORIGIN",
  "EDGE_ORIGIN",
];
const { dashboardOrigin, edgeOrigin, edgeFnUrl } = await import(at("apps/edge/lib/dashboard-origin.ts"));

/** A production environment that holds everything it must (made-up values). */
const WHOLE = {
  VERCEL_ENV: "production",
  SUPABASE_URL: "https://project.example.com",
  SUPABASE_SERVICE_ROLE_KEY: "service-key-for-tests",
  EDGE_CALL_SECRET: "edge-call-secret-for-tests",
  DASHBOARD_ORIGIN: "https://app.example.com",
  EDGE_ORIGIN: "https://edge.example.com",
};

const NAMES = ["VERCEL_ENV", "DASHBOARD_ORIGIN", "EDGE_ORIGIN"];
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

test("production names what it cannot serve without; a preview or a laptop lacks nothing", () => {
  assert.deepEqual(bootProblems(WHOLE), []);
  assert.deepEqual(bootProblems({ VERCEL_ENV: "production" }), [...REQUIRED_IN_PRODUCTION]);
  assert.deepEqual(bootProblems({ ...WHOLE, EDGE_CALL_SECRET: "  " }), ["EDGE_CALL_SECRET"], "blank is unset");
  assert.deepEqual(
    bootProblems({ ...WHOLE, DASHBOARD_ORIGIN: "http://app.example.com", EDGE_ORIGIN: "https://edge.example.com/api" }),
    ["DASHBOARD_ORIGIN", "EDGE_ORIGIN"],
    "an address is an https origin, not merely set",
  );
  assert.deepEqual(bootProblems({}), [], "a laptop");
  assert.deepEqual(bootProblems({ VERCEL_ENV: "preview" }), [], "a preview");
});

test("a production edge missing one logs one line naming it, never a value, and refuses to load", () => {
  const lines = [];
  const orig = console.error;
  console.error = (...args) => {
    const line = logLineOf(args);
    if (line) lines.push(line);
  };
  try {
    assert.throws(
      () => assertBootable({ ...WHOLE, EDGE_ORIGIN: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined }),
      /^Error: env_invalid: this production edge cannot serve without SUPABASE_SERVICE_ROLE_KEY, EDGE_ORIGIN$/,
    );
    assertBootable(WHOLE);
    assertBootable({ VERCEL_ENV: "preview" });
  } finally {
    console.error = orig;
  }
  assert.deepEqual(
    lines.map((l) => [l.level, l.event, l.missing]),
    [["error", "env_invalid", ["SUPABASE_SERVICE_ROLE_KEY", "EDGE_ORIGIN"]]],
  );
  assert.ok(!JSON.stringify(lines).includes("edge-call-secret-for-tests"), "names, never values");
});

test("the check runs as the edge loads: a door on a production edge missing its variables never answers", () => {
  // A fresh process, as a cold start is: importing any door loads env.ts, which refuses there and then.
  const run = (vars) =>
    spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "-e",
        `await import(${JSON.stringify(at("apps/edge/api/health.ts"))}); console.log("loaded");`,
      ],
      { cwd: ROOT, encoding: "utf8", env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...vars } },
    );
  const refused = run({ VERCEL_ENV: "production" });
  assert.notEqual(refused.status, 0);
  assert.ok(!refused.stdout.includes("loaded"));
  assert.match(refused.stderr, /"event":"env_invalid"/);
  const whole = run(WHOLE);
  assert.equal(whole.status, 0, whole.stderr);
  assert.match(whole.stdout, /loaded/);
});

test("the addresses the edge writes: production's own, or a throw; the old defaults off production", () => {
  set({ VERCEL_ENV: "production", DASHBOARD_ORIGIN: undefined, EDGE_ORIGIN: undefined });
  assert.throws(() => dashboardOrigin(), /DASHBOARD_ORIGIN is required in production/);
  assert.throws(() => edgeOrigin(), /EDGE_ORIGIN is required in production/);
  assert.throws(() => edgeFnUrl(), /EDGE_ORIGIN is required in production/);
  set({ DASHBOARD_ORIGIN: "https://app.example.com/", EDGE_ORIGIN: "https://edge.example.com" });
  assert.equal(dashboardOrigin(), "https://app.example.com", "a trailing slash is the same origin");
  assert.equal(edgeFnUrl(), "https://edge.example.com/api/retell-fn");
  set({ VERCEL_ENV: "preview", DASHBOARD_ORIGIN: undefined, EDGE_ORIGIN: "not an origin" });
  assert.equal(dashboardOrigin(), "https://app.chanlytics.com");
  assert.equal(edgeOrigin(), "https://chanlytics-messaging.vercel.app");
  assert.equal(edgeFnUrl(), "https://chanlytics-messaging.vercel.app/api/retell-fn");
});
