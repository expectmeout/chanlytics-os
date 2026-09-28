/**
 * The layer boundaries, the edge's two house rules and the one on TypeScript's
 * directives (`@ts-expect-error` says why; no `@ts-ignore`) are lint rules in
 * eslint.config.mjs. A config is easy to loosen by accident (a glob that no
 * longer matches, a block moved above the one it overrides), so this runs the
 * real config over probe snippets, placed as if they lived in each layer, and
 * expects each forbidden thing to be refused and each allowed thing to pass.
 * So is the kit's rule for the surfaces that leave the shell (src/surfaces):
 * a raw <button>, <input>, <select>, <textarea> or <dialog> is the kit's to
 * draw, and a surface takes the kit's component instead.
 *
 * The function limits are lint rules there too, in the trees the complexity
 * ratchet has emptied (plan 27: "the limits are lint errors for new code"):
 * LIMITED_TREES holds `complexity`, `max-lines-per-function` and `max-depth`
 * at the ratchet's own numbers, and `max-params` at four in each tree but the
 * ones still wider (WIDE_PARAMS). The tests at the end ask ESLint what it
 * applies to a real file of each tree, and lint probes one past each limit.
 *
 * And the list keeps up: a tree joins LIMITED_TREES in the change that banks
 * its last entry, so every candidate tree with no entry in complexity.json is
 * held, listed itself or under a listed tree. A candidate tree is a folder at
 * the list's own granularity that holds TypeScript:
 *
 *   - a package's domain folder, a folder of `packages/<p>/src` with an
 *     index.ts of its own (contracts' and core's), or the package's `src` as a
 *     whole where it has none (channels, db, jobs);
 *   - each folder of `apps/dashboard/src/server`, `apps/dashboard/src/legacy-bridge`,
 *     `apps/edge/lib` and `apps/edge/api`, a domain each;
 *   - each other top-level folder of `apps/dashboard/src` as a whole (auth,
 *     client, lib, surfaces, yes), but the shell's `legacy`, which leaves with
 *     decision 0015 rather than joining;
 *
 * less the trees of the programs in flight (IN_FLIGHT: Ask, Reach out, the
 * phone app, partners), which join as those land, as eslint.config.mjs says.
 *
 * Nothing here reads the config's text; it asks ESLint.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { LIMITED_TREES, WIDE_PARAMS, FUNCTION_LIMITS } from "../../../../eslint.config.mjs";
import { LIMIT } from "../_measures.mjs";
import { repoFiles } from "../_ast.mjs";
import { readBaseline } from "../_ratchet.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "../../../..");
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

/** Where a surface's probes stand: a page that has left the shell, and the kit it draws with. */
const SURFACES = ["apps/dashboard/src/surfaces/reports/probe.tsx", "apps/dashboard/src/surfaces/kit/probe.tsx"];

test("a surface is browser code, linted as the dashboard's own: its layer, and the hooks rules on its TSX", async () => {
  const hookInABranch = [
    'import { useState } from "react";',
    "export function Probe({ on }: { on: boolean }): string {",
    "  if (on) useState(0);",
    '  return "";',
    "}",
    "",
  ].join("\n");
  for (const at of SURFACES) {
    assert.deepEqual(
      await rulesFiredOn(at, 'import { route } from "@/server/route";\nexport const x = route;\n'),
      [IMPORTS],
      `${at}: the server`,
    );
    assert.deepEqual(
      await rulesFiredOn(at, 'import { deliver } from "@chanlytics/core";\nexport const x = deliver;\n'),
      [IMPORTS],
      `${at}: a rule package`,
    );
    assert.deepEqual(
      await rulesFiredOn(at, 'import type { InputOf } from "@/server/route";\nexport type Y = InputOf<"a">;\n'),
      [],
      `${at}: a type crosses`,
    );
    assert.deepEqual(await rulesFiredOn(at, hookInABranch), ["react-hooks/rules-of-hooks"], `${at}: the hooks rules`);
  }
});

/** The component each raw element's refusal names (eslint.config.mjs, KIT_COMPONENT_FOR). */
const KIT_TAKES = { button: "Button", input: "Field", select: "Select", textarea: "Field", dialog: "Sheet" };

test("a surface takes its controls from the kit: a raw one is refused, naming the kit's component, and the kit draws them", async () => {
  const [page, kit] = SURFACES;
  const draws = (element) => `export function Probe(): unknown {\n  return <${element} />;\n}\n`;
  for (const [element, component] of Object.entries(KIT_TAKES)) {
    const [result] = await eslint.lintText(draws(element), { filePath: path.join(ROOT, page) });
    const refused = result.messages.filter((m) => m.severity === 2);
    assert.deepEqual(
      refused.map((m) => m.ruleId),
      ["no-restricted-syntax"],
      `<${element}> in a surface`,
    );
    assert.match(refused[0].message, new RegExp(`^Take the kit's ${component}[ ,]`), `<${element}>`);
    assert.deepEqual(await rulesFiredOn(kit, draws(element)), [], `<${element}> in the kit, which draws it`);
  }
  assert.deepEqual(await rulesFiredOn(page, draws("Button")), [], "the kit's component is not the raw element");
  assert.deepEqual(await rulesFiredOn(page, draws("div")), [], "and the rule names those five alone");
  assert.deepEqual(
    await rulesFiredOn("apps/dashboard/src/legacy-bridge/probe.tsx", draws("button")),
    [],
    "the bridge's own screens are not surfaces",
  );
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

/**
 * A line that must not compile says why, in every TypeScript block: the type tests' negatives (`*.type-test.ts`) are
 * `@ts-expect-error <why>`, and one that starts to compile is TS2578, an unused directive. `@ts-ignore` would stay
 * silent when the line it hides is fixed, and `@ts-nocheck` hides a file, so both are refused.
 */
test("@ts-expect-error says why in ten characters or more, and @ts-ignore and @ts-nocheck are refused, in every TypeScript block", async () => {
  const BAN = "@typescript-eslint/ban-ts-comment";
  const wrong = 'export const n: number = "one";\n';
  for (const at of [
    "packages/contracts/src/shared/probe.type-test.ts",
    "packages/core/src/probe.ts",
    "apps/dashboard/src/client/probe.type-test.ts",
    "apps/dashboard/src/server/probe.ts",
    "apps/dashboard/app/api/v1/probe/route.ts",
    "apps/edge/lib/probe.ts",
    "e2e/probe.ts",
  ]) {
    assert.deepEqual(await rulesFiredOn(at, `// @ts-expect-error a string is not a number\n${wrong}`), [], at);
    assert.deepEqual(await rulesFiredOn(at, `// @ts-expect-error ${"x".repeat(10)}\n${wrong}`), [], `${at}: ten`);
    assert.deepEqual(await rulesFiredOn(at, `// @ts-expect-error ${"x".repeat(9)}\n${wrong}`), [BAN], `${at}: nine`);
    assert.deepEqual(await rulesFiredOn(at, `// @ts-expect-error\n${wrong}`), [BAN], `${at}: no reason`);
    assert.deepEqual(await rulesFiredOn(at, `// @ts-ignore a string is not a number\n${wrong}`), [BAN], at);
    assert.deepEqual(await rulesFiredOn(at, `// @ts-nocheck the whole file, unread\n${wrong}`), [BAN], at);
  }
});

/* ---- A function's limits, where the ratchet holds nothing ---- */

test("the lint's limits are the ratchet's", () => {
  assert.deepEqual(
    { lines: FUNCTION_LIMITS.lines, branches: FUNCTION_LIMITS.branches, depth: FUNCTION_LIMITS.depth },
    LIMIT,
    "eslint.config.mjs and _measures.mjs hold a function to the same three numbers",
  );
});

test("a tree is held once the ratchet holds nothing in it, and every tree it names is source", () => {
  const listed = Object.keys(readBaseline("complexity.json"));
  for (const tree of LIMITED_TREES) {
    assert.ok(repoFiles([tree]).length > 0, `${tree} holds tracked source: a tree renamed away holds nothing`);
    const left = listed.filter((k) => k.startsWith(`${tree}/`));
    assert.deepEqual(left, [], `${tree} is held by the lint only once its entries in complexity.json are gone`);
  }
  for (const tree of WIDE_PARAMS) assert.ok(LIMITED_TREES.includes(tree), `${tree} is a held tree`);
});

/**
 * The trees of the programs in flight, which join LIMITED_TREES as those land: until then each program holds its own
 * functions to the ratchet, which may raise with a reason, where the lint could not. A tree leaves this list in the
 * change that lists it there.
 */
const IN_FLIGHT = {
  "Ask Rewired": [
    "packages/contracts/src/ask",
    "packages/contracts/src/ask-proposals",
    "apps/dashboard/src/server/ask",
    "apps/dashboard/src/legacy-bridge/ask",
  ],
  "Reach out": [
    "packages/contracts/src/reach-out",
    "apps/edge/lib/reach-out",
    "apps/dashboard/src/legacy-bridge/reach-out",
  ],
  "the phone app": ["packages/contracts/src/mobile"],
  partners: ["apps/edge/lib/partners"],
};
const inFlight = Object.values(IN_FLIGHT).flat();

/** What the lint's limits read: TypeScript under apps/ and packages/, as the ratchet's file set has it. */
const typescript = repoFiles(["apps", "packages"]).filter((f) => /\.tsx?$/.test(f));

/** The folders directly under `dir` with TypeScript in them, at any depth. */
function foldersOf(dir) {
  const below = typescript.filter((f) => f.startsWith(`${dir}/`)).map((f) => f.slice(dir.length + 1));
  return [...new Set(below.filter((rest) => rest.includes("/")).map((rest) => `${dir}/${rest.split("/")[0]}`))];
}

/** The app areas whose folders are the trees, a domain each. */
const DOMAIN_AREAS = [
  "apps/dashboard/src/server",
  "apps/dashboard/src/legacy-bridge",
  "apps/edge/lib",
  "apps/edge/api",
];
/** The shell, which leaves with decision 0015 rather than joining. */
const SHELL = "apps/dashboard/src/legacy";

/** Every candidate tree, as the file's header defines one. */
function candidateTrees() {
  const trees = [];
  const sources = new Set(typescript.map((f) => /^packages\/[^/]+\/src\//.exec(f)?.[0].slice(0, -1)).filter(Boolean));
  for (const src of sources) {
    const domains = foldersOf(src).filter((d) => typescript.includes(`${d}/index.ts`));
    trees.push(...(domains.length > 0 ? domains : [src]));
  }
  for (const area of DOMAIN_AREAS) trees.push(...foldersOf(area));
  trees.push(...foldersOf("apps/dashboard/src").filter((d) => d !== SHELL && !DOMAIN_AREAS.includes(d)));
  return trees.sort();
}

const isHeld = (tree) => LIMITED_TREES.some((t) => tree === t || tree.startsWith(`${t}/`));

test("a tree joins LIMITED_TREES in the change that banks its last entry: every candidate tree the ratchet has emptied is held", () => {
  const trees = candidateTrees();
  for (const tree of LIMITED_TREES)
    assert.ok(
      trees.some((t) => t === tree || t.startsWith(`${tree}/`)),
      `${tree} is a candidate tree, or a parent that replaced its folders: the definition is the list's own granularity`,
    );
  const entries = Object.keys(readBaseline("complexity.json"));
  const emptied = trees.filter((tree) => !inFlight.includes(tree) && !entries.some((k) => k.startsWith(`${tree}/`)));
  assert.deepEqual(
    emptied.filter((tree) => !isHeld(tree)),
    [],
    "the ratchet holds no function over the limit in these, so the lint holds them: add each to LIMITED_TREES in " +
      "eslint.config.mjs, and to WIDE_PARAMS too while a function there takes more than four parameters",
  );
});

test("each tree of a program in flight is a candidate tree, and not yet held", () => {
  const trees = candidateTrees();
  for (const tree of inFlight) {
    assert.ok(trees.includes(tree), `${tree} is a candidate tree: one renamed away would hold nothing back`);
    assert.ok(!isHeld(tree), `${tree} is in LIMITED_TREES, so its program has landed: take it out of IN_FLIGHT`);
  }
});

test("ESLint applies the limits to a real file in every held tree", async () => {
  for (const tree of LIMITED_TREES) {
    const file = repoFiles([tree]).find((f) => /\.tsx?$/.test(f));
    const { rules } = await eslint.calculateConfigForFile(path.join(ROOT, file));
    assert.deepEqual(rules.complexity, [2, FUNCTION_LIMITS.branches], `${file}: complexity`);
    assert.deepEqual(
      rules["max-lines-per-function"],
      [2, { max: FUNCTION_LIMITS.lines, IIFEs: true }],
      `${file}: lines`,
    );
    assert.deepEqual(rules["max-depth"], [2, FUNCTION_LIMITS.depth], `${file}: depth`);
    if (WIDE_PARAMS.includes(tree)) assert.equal(rules["max-params"], undefined, `${file}: max-params waits`);
    else assert.deepEqual(rules["max-params"], [2, FUNCTION_LIMITS.params], `${file}: max-params`);
  }
});

/** A function `lines` lines long, with `branches` branches and `depth` levels of nesting, taking `params` parameters. */
function probe({ lines = 3, branches = 1, depth = 0, params = 1 }) {
  const args = Array.from({ length: params }, (_, i) => `a${i}: number`).join(", ");
  const body = [];
  for (let d = 0; d < depth; d++) body.push(`${"  ".repeat(d + 1)}if (a0 > ${d}) {`);
  if (depth > 0) body.push(`${"  ".repeat(depth + 1)}void a0;`);
  for (let d = depth - 1; d >= 0; d--) body.push(`${"  ".repeat(d + 1)}}`);
  const ors = Array.from({ length: Math.max(0, branches - depth) }, (_, i) => `a0 === ${i}`).join(" || ");
  body.push(`  const x = ${ors || "a0"};`);
  while (body.length < lines - 3) body.push("  void x;");
  return `export function probe(${args}): unknown {\n${body.join("\n")}\n  return x;\n}\n`;
}

async function fired(file, code) {
  const [r] = await eslint.lintText(code, { filePath: path.join(ROOT, file) });
  assert.deepEqual(
    r.messages.filter((m) => m.fatal),
    [],
    "the probe parses",
  );
  return r.messages.filter((m) => m.severity === 2).map((m) => m.ruleId);
}

test("in a held tree each limit is an error one past its number, and not at it", async () => {
  const held = "packages/contracts/src/shared/probe.ts";
  const at = { lines: LIMIT.lines, branches: LIMIT.branches, depth: LIMIT.depth, params: FUNCTION_LIMITS.params };
  assert.deepEqual(await fired(held, probe(at)), [], "a function at every limit passes");
  assert.deepEqual(await fired(held, probe({ ...at, lines: at.lines + 1 })), ["max-lines-per-function"]);
  assert.deepEqual(await fired(held, probe({ ...at, branches: at.branches + 1 })), ["complexity"]);
  assert.deepEqual(await fired(held, probe({ ...at, depth: at.depth + 1, branches: at.depth + 2 })), ["max-depth"]);
  assert.deepEqual(await fired(held, probe({ ...at, params: at.params + 1 })), ["max-params"]);
  const wide = `${WIDE_PARAMS[0]}/probe.ts`;
  assert.deepEqual(await fired(wide, probe({ params: at.params + 1 })), [], `${WIDE_PARAMS[0]} waits for max-params`);
  // Where the ratchet still holds a function, the lint does not: a split is banked there, never a lint error.
  assert.deepEqual(await fired("packages/core/src/probe.ts", probe({ ...at, lines: at.lines + 1 })), []);
});

test("a surface is held to the limits from its first file, a page and the kit alike", async () => {
  const at = { lines: LIMIT.lines, branches: LIMIT.branches, depth: LIMIT.depth, params: FUNCTION_LIMITS.params };
  for (const file of SURFACES.map((f) => f.replace(/\.tsx$/, ".ts"))) {
    assert.deepEqual(await fired(file, probe(at)), [], `${file}: a function at every limit passes`);
    assert.deepEqual(await fired(file, probe({ ...at, lines: at.lines + 1 })), ["max-lines-per-function"], file);
    assert.deepEqual(await fired(file, probe({ ...at, branches: at.branches + 1 })), ["complexity"], file);
    assert.deepEqual(await fired(file, probe({ ...at, params: at.params + 1 })), ["max-params"], file);
  }
});
