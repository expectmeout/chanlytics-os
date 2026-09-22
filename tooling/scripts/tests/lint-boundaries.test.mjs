/**
 * The layer boundaries and the edge's two house rules are lint rules in
 * eslint.config.mjs. A config is easy to loosen by accident (a glob that no
 * longer matches, a block moved above the one it overrides), so this runs the
 * real config over probe snippets, placed as if they lived in each layer, and
 * expects each forbidden thing to be refused and each allowed thing to pass.
 *
 * Nothing here reads the config's text; it asks ESLint.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "../../..");
const eslint = new ESLint({ cwd: ROOT });

/** The rule ids that fired on a snippet linted as if it were `filePath`. */
async function rulesFiredOn(filePath, code) {
  const [result] = await eslint.lintText(code, { filePath: path.join(ROOT, filePath) });
  return result.messages.filter((m) => m.severity === 2).map((m) => m.ruleId);
}

const IMPORTS = "@typescript-eslint/no-restricted-imports";

test("browser code may not import the server or the rule packages, but may take their types", async () => {
  const at = "apps/dashboard/src/legacy-bridge/probe.ts";
  assert.deepEqual(await rulesFiredOn(at, 'import { route } from "../server/route";\nexport const x = route;\n'), [
    IMPORTS,
  ]);
  assert.deepEqual(await rulesFiredOn(at, 'import { route } from "@/server/route";\nexport const x = route;\n'), [
    IMPORTS,
  ]);
  assert.deepEqual(await rulesFiredOn(at, 'import { deliver } from "@chanlytics/core";\nexport const x = deliver;\n'), [
    IMPORTS,
  ]);
  assert.deepEqual(
    await rulesFiredOn(at, 'import type { InputOf } from "../server/route";\nexport type Y = InputOf<"a">;\n'),
    [],
  );
  assert.deepEqual(await rulesFiredOn(at, 'import { api } from "../client/api";\nexport const x = api;\n'), []);
});

test("the typed client and the sign-in screens are held to the same boundary", async () => {
  for (const at of [
    "apps/dashboard/src/client/probe.ts",
    "apps/dashboard/src/auth/probe.tsx",
    "apps/dashboard/src/yes/probe.tsx",
  ]) {
    assert.deepEqual(
      await rulesFiredOn(at, 'import { route } from "@/server/route";\nexport const x = route;\n'),
      [IMPORTS],
      at,
    );
  }
});

test("server code may not import the shell, the bridge or the browser client", async () => {
  for (const at of ["apps/dashboard/src/server/probe.ts", "apps/dashboard/app/api/v1/probe/route.ts"]) {
    assert.deepEqual(
      await rulesFiredOn(at, 'import { run } from "@/legacy-bridge/surface-runner";\nexport const x = run;\n'),
      [IMPORTS],
      at,
    );
    assert.deepEqual(
      await rulesFiredOn(at, 'import { api } from "@/client/api";\nexport const x = api;\n'),
      [IMPORTS],
      at,
    );
    assert.deepEqual(
      await rulesFiredOn(at, 'import { deliver } from "@chanlytics/core";\nexport const x = deliver;\n'),
      [],
      at,
    );
  }
});

test("the edge may not import the dashboard or a UI framework", async () => {
  const at = "apps/edge/lib/probe.ts";
  assert.deepEqual(await rulesFiredOn(at, 'import React from "react";\nexport const x = React;\n'), [IMPORTS]);
  assert.deepEqual(await rulesFiredOn(at, 'import { cookies } from "next/headers";\nexport const x = cookies;\n'), [
    IMPORTS,
  ]);
  assert.deepEqual(
    await rulesFiredOn(at, 'import { deliver } from "@chanlytics/core";\nexport const x = deliver;\n'),
    [],
  );
});

test("the edge reads the environment through env.ts and logs through log.ts, nowhere else", async () => {
  const at = "apps/edge/lib/probe.ts";
  assert.deepEqual(await rulesFiredOn(at, "export const k = process.env.DIAG_KEY;\n"), ["no-restricted-syntax"]);
  assert.deepEqual(await rulesFiredOn(at, 'console.error("probe_failed");\n'), ["no-console"]);
  assert.deepEqual(await rulesFiredOn("apps/edge/lib/env.ts", "export const k = process.env.DIAG_KEY;\n"), []);
  assert.deepEqual(await rulesFiredOn("apps/edge/lib/log.ts", 'console.error("{}");\n'), []);
});
