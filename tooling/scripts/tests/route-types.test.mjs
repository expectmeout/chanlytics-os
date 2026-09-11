/**
 * The registry the client is typed from is generated from the route files and
 * committed; this test regenerates it in memory and refuses a stale copy, and
 * holds it to the policy file's inventory so the two can never name different
 * routes. UPDATE_ROUTE_TYPES=1 rewrites it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generate, OUT } from "../gen-route-types.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const current = generate(ROOT);
const file = path.join(ROOT, OUT);

test("the generated registry is current", () => {
  if (process.env.UPDATE_ROUTE_TYPES === "1") fs.writeFileSync(file, current.text);
  assert.equal(fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n"), current.text, "run UPDATE_ROUTE_TYPES=1 to regenerate");
});

test("the registry and the policy file name the same handlers", () => {
  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, "tooling/scripts/tests/route-policy.json"), "utf8"));
  assert.deepEqual(current.keys, Object.keys(policy.routes).sort(), "one inventory, two readers");
});

test("the registry imports types only: no route module reaches the client bundle", () => {
  for (const line of current.text.split("\n")) assert.ok(!/^import /.test(line), line);
  assert.ok(/typeof import\("\.\.\/\.\.\/app\/api\/v1\/settings\/route"\)\.GET/.test(current.text), "type-only import expressions");
});
