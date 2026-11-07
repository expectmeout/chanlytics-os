/**
 * The type checker is told what it cannot see only where it must be (decision 0112). Each of `_types.mjs`'s measures is
 * kept honest here on a source written for it; what they count is check:debt's to hold (TYPE_RATCHETS).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import ts from "typescript";
import { ESLint } from "eslint";
import { ROOT } from "../_source.mjs";
import { HELD_STRICT } from "../../eslint.config.mjs";
import { assertionsIn } from "./_types.mjs";

const source = (text, name = "probe.ts") =>
  ts.createSourceFile(
    name,
    text,
    ts.ScriptTarget.Latest,
    true,
    name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
const count = (text, name) => assertionsIn(source(text, name));

test("an assertion that names a type is counted, however it is written", () => {
  assert.equal(count("const a = x as T;"), 1);
  assert.equal(count("const a = <T>x;"), 1);
  assert.equal(count("const a = (x as T).y;"), 1);
  assert.equal(count("const a = [] as string[]; const b = LIST as readonly string[];"), 2);
  assert.equal(count("const a = x as B as C;"), 2, "each assertion of a chain that never passes unknown");
  assert.equal(count("const a = <div>{(x as T).y}</div>;", "probe.tsx"), 1, "in a page's markup too");
});

test("an assertion that asserts nothing, and the casts measure's three, are not counted", () => {
  assert.equal(count("const a = { k: 1 } as const; const b = [1, 2] as const;"), 0, "as const keeps a literal's type");
  assert.equal(count("const a = x as unknown;"), 0, "as unknown forgets a type and asserts none");
  assert.equal(count("const a = x satisfies T;"), 0, "satisfies is a check");
  assert.equal(count("let a!: string;"), 0, "a definite assignment is not an assertion");
  assert.equal(
    count("const a = x as unknown as T; const b = (y as unknown) as T; const c = z as never; const d = w!;"),
    0,
    "laundering, never and x! are the casts measure's",
  );
});

// The strict rules are the backend's (eslint.config.mjs, BACKEND_TYPED): a rule held there is a warning in each of its
// trees and nowhere else, so a page's finding never holds a backend rule back from becoming an error.
test("the backend's strict rules reach the edge, the packages and the dashboard's server and routes, and no page", async () => {
  const eslint = new ESLint({ cwd: ROOT });
  const levelOf = async (file, rule) => {
    const { rules } = await eslint.calculateConfigForFile(path.join(ROOT, file));
    const entry = rules[rule];
    return entry === undefined ? 0 : Array.isArray(entry) ? entry[0] : entry;
  };
  const backend = [
    "apps/edge/api/inbound-sms.ts",
    "packages/core/src/conversations/snooze.ts",
    "apps/dashboard/src/server/shared/route.ts",
    "apps/dashboard/app/api/v1/conversations/[id]/snooze/route.ts",
  ];
  for (const rule of HELD_STRICT) {
    for (const file of backend) assert.equal(await levelOf(file, rule), 1, `${rule} is held as a warning in ${file}`);
    assert.equal(await levelOf("apps/dashboard/src/surfaces/reports/blocks.tsx", rule), 0, `${rule} is not a page's`);
  }
});
