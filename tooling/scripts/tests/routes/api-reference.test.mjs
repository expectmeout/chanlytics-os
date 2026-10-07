/**
 * docs/api.md, the /api/v1 reference, is written from what each route declares with route() and committed; this test
 * regenerates it in memory and refuses a stale copy, as route-types.test.mjs does for the typed client, and holds it
 * to route-policy.json so the two can never name different routes. `corepack pnpm gen:api-reference` rewrites it.
 *
 * The field table is read from the zod schema the route parses with, so a field that is added, made optional or given
 * a limit changes the page in the same diff; the cases below run the table's reader over schemas of each shape.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { fieldRows, generate, OUT } from "../../gen/api-reference.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const current = await generate(ROOT);

test("the generated reference is current", () => {
  assert.equal(
    fs.readFileSync(path.join(ROOT, OUT), "utf8").replace(/\r\n/g, "\n"),
    current,
    "run corepack pnpm gen:api-reference and commit docs/api.md",
  );
});

test("the reference and the policy file name the same handlers", () => {
  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, "tooling/scripts/tests/route-policy.json"), "utf8"));
  const written = [...current.matchAll(/^### `(\w+) \/api\/v1\/(.+)`$/gm)].map(
    ([, method, route]) => `${method} ${route}`,
  );
  assert.deepEqual(written.sort(), Object.keys(policy.routes).sort(), "one inventory, two readers");
});

test("a route's policy is said in words beside its name", () => {
  // A workspace-scoped, owner-only write that spends nothing; an account read: both from the routes themselves.
  const entry = (heading) => current.split(`### \`${heading}\``)[1]?.split("\n### ")[0] ?? "";
  const activity = entry("GET /api/v1/activity");
  assert.match(activity, /Reads; for a member of the workspace the request names, owner or above;/);
  assert.match(activity, /\| `person` \| string \(uuid\) \| no \|/);
});

test("a field is listed with its type, whether it is required, and the limits its schema states", () => {
  const rows = fieldRows(
    z.object({
      text: z.string().min(1).max(500),
      kind: z.enum(["call", "note"]),
      count: z.number().int().min(1).max(50).optional(),
      tags: z.array(z.string()).max(5),
    }),
  );
  assert.deepEqual(rows, [
    "| `text` | string | yes | at least 1 characters; at most 500 characters |",
    '| `kind` | one of `"call"`, `"note"` | yes |  |',
    "| `count` | integer | no | ≥ 1; ≤ 50 |",
    "| `tags` | array of string | yes | at most 5 |",
  ]);
});

test("a uuid is a uuid: the expression zod writes for it is not repeated, a pattern the route chose is", () => {
  const rows = fieldRows(z.object({ id: z.uuid(), code: z.string().regex(/^[a-z_.]+$/) }));
  assert.equal(rows[0], "| `id` | string (uuid) | yes |  |");
  assert.equal(rows[1], "| `code` | string | yes | matches `^[a-z_.]+$` |");
});

test("a pipe in a limit does not end its table cell", () => {
  const [row] = fieldRows(z.object({ when: z.string().regex(/^(now|later)$/) }));
  assert.equal(row, "| `when` | string | yes | matches `^(now\\|later)$` |");
});

test("a schema that is no object is said in one row, and no schema in none", () => {
  assert.deepEqual(fieldRows(z.array(z.string())), ["| (input) | array of string | yes |  |"]);
  assert.deepEqual(fieldRows(undefined), []);
});

test("a route that declares no schema does not claim it takes nothing", () => {
  // 26 write routes read their own body: the reference must not say "takes no body" of them.
  const ask = current.split("### `POST /api/v1/ask`")[1]?.split("\n### ")[0] ?? "";
  assert.match(ask, /Declares no body schema: it takes none, or reads its own/);
  assert.doesNotMatch(current, /Takes no body/);
});
