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
import { FLAGS, FLAG_MECHANISMS, FeaturesConfigSchema } from "@chanlytics/contracts";
import { ROOT, readRaw } from "../_source.mjs";

const envSource = readRaw("apps/edge/lib/env.ts");
const deployment = readRaw("apps/dashboard/src/server/deployment.ts");
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
      assert.ok(deployment.includes(`process.env.${f.name}`), `${f.name}: read in the dashboard's deployment.ts`);
    if (f.mechanism === "model_override")
      assert.ok(
        getters.some((g) => g.name === f.name) ||
          readRaw("apps/dashboard/src/server/ask/model.ts").includes(`process.env.${f.name}`),
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
