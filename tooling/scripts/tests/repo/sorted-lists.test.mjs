/**
 * The barrels are in order (decision 0074, section 4; tooling/scripts/gen/sorted-lists.mjs).
 *
 * A barrel is a list several lanes add to, and a line added wherever its author was is the line the next lane adds
 * there too. Written in one order, each lane's names land where their letters put them, and two lanes meet only when
 * their names are neighbours. The order is written by the command, never by hand: a barrel out of it fails here, and
 * `node tooling/scripts/gen/sorted-lists.mjs` writes it. `land` runs the command before it pushes.
 *
 * The edge's and the dashboard's two lists of event names are held in order by repo/log-events.test.mjs, and the
 * route and door policy pins are written by their tests in the order of the paths they name.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { barrels, isBarrel, outOfOrder, sortedBarrel, OWN_ORDER } from "../../gen/sorted-lists.mjs";

test("every barrel is in the order the command writes", async () => {
  const found = await outOfOrder();
  assert.deepEqual(
    found.map((f) => f.file),
    [],
    "write the order: node tooling/scripts/gen/sorted-lists.mjs",
  );
});

test("the barrels are read: every package's root and its domains', and the kit's", () => {
  const all = barrels();
  assert.ok(all.length > 40, `the barrels are found (${all.length})`);
  for (const p of ["channels", "core", "db", "jobs"]) assert.ok(all.includes(`packages/${p}/src/index.ts`), p);
  assert.ok(all.includes("packages/contracts/src/email/index.ts"), "a domain of contracts");
  assert.ok(!all.includes(OWN_ORDER[0]), "contracts' root keeps its own order");
});

test("statements by the module they name, a value before its types, names by their letters, a comment with its line", async () => {
  const text = [
    "/** The header. */",
    'export type { Zed, alpha } from "./b";',
    "// About c.",
    'export { gamma, Beta } from "./c";',
    'export { delta, ALPHA } from "./b";',
    'export * from "./a";',
    "",
  ].join("\n");
  assert.equal(
    await sortedBarrel(text, "packages/x/src/index.ts"),
    [
      "/** The header. */",
      'export * from "./a";',
      'export { ALPHA, delta } from "./b";',
      'export type { alpha, Zed } from "./b";',
      "// About c.",
      'export { Beta, gamma } from "./c";',
      "",
    ].join("\n"),
  );
});

test("a module is a barrel only when it holds re-exports and nothing else", () => {
  assert.equal(isBarrel('export { a } from "./a";\nexport type { B } from "./b";\n'), true);
  assert.equal(isBarrel('import { a } from "./a";\nexport const b = a;\n'), false);
  assert.equal(isBarrel("export { a };\nconst a = 1;\n"), false);
});
