/**
 * The registry the client is typed from is generated from the route files and
 * committed; this test regenerates it in memory and refuses a stale copy, and
 * holds it to the policy file's inventory so the two can never name different
 * routes. The same generator writes the keys alone into contracts
 * (route-keys.generated.ts), for a contract that names a route; it is held
 * current the same way and to the same keys. UPDATE_ROUTE_TYPES=1 rewrites both.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ROUTE_KEYS } from "@chanlytics/contracts";
import { generate, OUT, KEYS_OUT } from "../../gen-route-types.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const current = generate(ROOT);
const file = path.join(ROOT, OUT);
const keysFile = path.join(ROOT, KEYS_OUT);

test("the generated registry is current", () => {
  if (process.env.UPDATE_ROUTE_TYPES === "1") fs.writeFileSync(file, current.text);
  assert.equal(
    fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n"),
    current.text,
    "run UPDATE_ROUTE_TYPES=1 to regenerate",
  );
});

test("the registry and the policy file name the same handlers", () => {
  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, "tooling/scripts/tests/route-policy.json"), "utf8"));
  assert.deepEqual(current.keys, Object.keys(policy.routes).sort(), "one inventory, two readers");
});

test("the registry imports types only: no route module reaches the client bundle", () => {
  for (const line of current.text.split("\n")) assert.ok(!/^import /.test(line), line);
  assert.ok(
    /typeof import\("\.\.\/\.\.\/app\/api\/v1\/settings\/route"\)\.GET/.test(current.text),
    "type-only import expressions",
  );
});

test("contracts' route keys are current, import nothing, and are the typed client's keys, in its order", async () => {
  if (process.env.UPDATE_ROUTE_TYPES === "1") fs.writeFileSync(keysFile, current.keysText);
  assert.equal(
    fs.readFileSync(keysFile, "utf8").replace(/\r\n/g, "\n"),
    current.keysText,
    "run UPDATE_ROUTE_TYPES=1 to regenerate",
  );
  for (const line of current.keysText.split("\n")) assert.ok(!/^import /.test(line), line);
  // The built contracts (what every app and suite imports) against the client's own registry, executed.
  const { ROUTES } = await import(pathToFileURL(file).href);
  assert.deepEqual([...ROUTE_KEYS], Object.keys(ROUTES), "one list of keys, in contracts and in the client");
});
