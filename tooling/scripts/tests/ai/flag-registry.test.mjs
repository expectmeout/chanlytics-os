/**
 * The switch registry (contracts ai/flags.ts): every lever that turns a behaviour on or off is listed once, with its
 * owner and the day it is looked at again (category 39, "feature flags"). The list and the code agree both ways: a
 * switch the edge reads as one (its getter in lib/env.ts is documented "Switch:") is listed, and a listed switch is read
 * where its mechanism says it is; a sunset that has passed is said in every run, and a red build a month after it, so
 * that no unrelated change is stopped on the day and nobody can leave it for good; and a switch with no sunset says why
 * it stays.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FLAGS, FLAG_MECHANISMS, FeaturesConfigSchema, daysToSunset } from "@chanlytics/contracts";
import { ROOT, readRaw, importSrc } from "../_source.mjs";

const envSource = readRaw("apps/edge/lib/env.ts");
const dashboardEnv = readRaw("apps/dashboard/src/server/env.ts");
const { LOG_EVENTS } = await importSrc("apps/edge/lib/log-events.ts");
/** The e2e specs' sources: a switch a spec reads from its own environment is read there. */
const specs = (function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(p);
    return e.name.endsWith(".ts") ? [fs.readFileSync(p, "utf8")] : [];
  });
})(`${ROOT}/e2e`).join("\n");
const workflows = fs
  .readdirSync(`${ROOT}/.github/workflows`)
  .filter((f) => f.endsWith(".yml"))
  .map((f) => readRaw(`.github/workflows/${f}`))
  .join("\n");

/** The edge's getters, and which of them are documented as switches. */
const getters = [...envSource.matchAll(/(?:\/\*\*([^*]*(?:\*(?!\/)[^*]*)*)\*\/\s*)?get ([A-Z][A-Z0-9_]*)\(\)/g)].map(
  (m) => ({
    name: m[2],
    isSwitch: /^\s*Switch:/.test(m[1] ?? ""),
  }),
);

test("a switch the edge reads is listed, and a listed edge switch is a getter documented as one", () => {
  const documented = getters.filter((g) => g.isSwitch).map((g) => g.name);
  const listed = FLAGS.filter((f) => f.mechanism === "edge_env" || f.mechanism === "model_override").map((f) => f.name);
  const unlisted = documented.filter((n) => !listed.includes(n));
  assert.deepEqual(
    unlisted,
    [],
    "a getter documented 'Switch:' with no entry in contracts ai/flags.ts (owner, sunset)",
  );
  for (const name of listed.filter((n) => getters.some((g) => g.name === n))) {
    assert.ok(documented.includes(name), `${name} is listed as a switch, so its getter in lib/env.ts says 'Switch:'`);
  }
});

test("a listed switch is read where its mechanism says it is", () => {
  for (const f of FLAGS) {
    assert.ok(FLAG_MECHANISMS.includes(f.mechanism), `${f.name}: ${f.mechanism} is one of the six mechanisms`);
    if (f.mechanism === "edge_env")
      assert.ok(
        getters.some((g) => g.name === f.name),
        `${f.name}: a getter in apps/edge/lib/env.ts`,
      );
    if (f.mechanism === "dashboard_env" || f.mechanism === "deployment")
      assert.ok(dashboardEnv.includes(`process.env.${f.name}`), `${f.name}: read in the dashboard's env.ts`);
    if (f.mechanism === "rollout")
      assert.ok(f.weaker, `${f.name}: a rollout is a compatibility window, so it says what its weaker mode allows`);
    if (f.mechanism === "model_override")
      assert.ok(
        getters.some((g) => g.name === f.name) || dashboardEnv.includes(`process.env.${f.name}`),
        `${f.name}: a variable somebody reads`,
      );
    if (f.mechanism === "workspace_feature")
      assert.ok(f.name in FeaturesConfigSchema.shape, `${f.name}: a key of tenant_config.features`);
    if (f.mechanism === "ci_secret")
      assert.ok(
        workflows.includes(`secrets.${f.name}`) || specs.includes(`process.env.${f.name}`),
        `${f.name}: a workflow or an e2e spec reads it`,
      );
  }
});

/**
 * A security switch is a fallback that kept production working while a stronger credential was put in place. It says
 * what it allows, the log event whose readings prove it can be closed (an event the edge can write, or the
 * dashboard's own for the one switch that lives there), and what closes it; and it has a day, never "kept".
 */
test("every security switch says what it allows, how it is proven closable, what closes it, and has a day", () => {
  const security = FLAGS.filter((f) => f.weaker !== undefined);
  assert.deepEqual(
    security.map((f) => f.name).sort(),
    [
      "DIAG_KEY",
      "EDGE_TOKEN_UNBOUND",
      "GOOGLE_OAUTH_STATE_SECRET",
      "RETELL_DOORS_SIGNED",
      "RETELL_FN_SECRET",
      "RETELL_WEBHOOK_KEY",
    ],
    "the weaker modes the platform still allows: a new one is listed here, with the change that adds it",
  );
  for (const f of security) {
    assert.ok(f.sunset, `${f.name}: a weaker mode has a day, not "kept"`);
    assert.ok(f.weaker.allows.length > 30, `${f.name}: what the weaker mode allows`);
    assert.ok(f.weaker.closes.length > 30, `${f.name}: what closes it`);
    // The dashboard's own log line is written by the dashboard; every other readiness event is the edge's.
    if (f.mechanism !== "dashboard_env")
      assert.ok(
        LOG_EVENTS.includes(f.weaker.readiness.event),
        `${f.name}: ${f.weaker.readiness.event} is an edge log event`,
      );
  }
});

test("days to a sunset are whole UTC days, zero on the day, negative after it, and null for a switch kept for good", () => {
  const day = { sunset: "2026-10-17" };
  assert.equal(daysToSunset(day, new Date("2026-10-03T23:59:59Z")), 14);
  assert.equal(daysToSunset(day, new Date("2026-10-17T00:00:00Z")), 0);
  assert.equal(daysToSunset(day, new Date("2026-10-18T12:00:00Z")), -1);
  assert.equal(daysToSunset({ sunset: null }, new Date("2026-10-18T12:00:00Z")), null);
});

/** How long past its day a switch may stand before the build says so: a month to decide it. */
const SUNSET_GRACE_DAYS = 30;

test("every switch has an owner and a day it is looked at again; one with no day says why it stays; none is a month past its day", (t) => {
  const names = FLAGS.map((f) => f.name);
  assert.equal(new Set(names).size, names.length, "each is listed once");
  const today = new Date().toISOString().slice(0, 10);
  const lastDay = new Date(Date.now() - SUNSET_GRACE_DAYS * 86_400_000).toISOString().slice(0, 10);
  for (const f of FLAGS) {
    assert.ok(["Ruben", "platform"].includes(f.owner), `${f.name}: an owner`);
    assert.ok(f.does.length > 10, `${f.name}: what it switches`);
    if (f.sunset === null) assert.ok(f.kept && f.kept.length > 10, `${f.name}: no sunset, so it says why it is kept`);
    else {
      assert.match(f.sunset, /^\d{4}-\d{2}-\d{2}$/, `${f.name}: a day`);
      if (f.sunset < today)
        t.diagnostic(`${f.name}: its day (${f.sunset}) has passed: decide it, and move or remove the row`);
      assert.ok(
        f.sunset >= lastDay,
        `${f.name}: its day (${f.sunset}) passed more than ${SUNSET_GRACE_DAYS} days ago: decide it, and move or remove the row`,
      );
    }
  }
});
