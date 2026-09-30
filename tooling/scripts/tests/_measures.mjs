/**
 * The measures behind docs/debt.md, in one module, and the tree docs/architecture.md
 * draws from the files they measure (docs/docs-tree.test.mjs).
 *
 * The ratchets (repo/code-health-ratchets.test.mjs), the source-scan ratchet
 * (repo/source-scan-ratchet.test.mjs), the wire's ratchet (routes/wire-casing.test.mjs), the index
 * reads' (types/index-reads-are-counted.test.mjs)
 * and the register (repo/debt-register.test.mjs)
 * all read the definitions here, so a number means one thing wherever it is
 * printed. It also keeps banking honest: the node runner starts test files in
 * parallel, and a register that read the baselines while the ratchets were still
 * writing them banked a stale number, twice, on the day the suite was grouped by
 * domain. In bank mode the register measures for itself, from here, and reads no
 * file another process may be writing.
 *
 * The limits are the scorecard's proposal and, where ESLint has the rule, its
 * defaults: 150 lines a function, 30 branches, 5 levels; 800 lines a file; 20
 * modules a directory; a name in three files is a copy. When a tree's baseline
 * is empty, the matching ESLint rule goes on for that tree and the limit stops
 * being a ratchet and becomes a lint error (eslint.config.mjs, LIMITED_TREES).
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { ROOT, readCode } from "./_source.mjs";
import {
  repoFiles,
  parse,
  functionsIn,
  linesOf,
  windowUse,
  copiesAmong,
  castsIn,
  tableNames,
  rpcNames,
  importsMatching,
  durationsIn,
  inlineStyles,
  SOURCE,
} from "./_ast.mjs";
import { cssOf, isPrimitiveClass, STYLE_VALUE_FIELDS } from "./_css.mjs";
import { bank } from "./_ratchet.mjs";

/** A function's limits: eslint.config.mjs's FUNCTION_LIMITS, as errors where this holds nothing. */
export const LIMIT = { lines: 150, branches: 30, depth: 5 };
const FILE_LIMIT = 800;
const DIRECTORY_LIMIT = 20;
const COPY_LIMIT = 3;
/** The suffix of a tables.json key that counts a file's `.rpc("…")` calls rather than its `.from("…")`. */
export const RPC_KEY = "::rpc";

/** The code that ships: the two apps and the packages' sources. Tests and specs are not held to a function's size. */
const SRC = repoFiles(["apps", "packages"]);
/** Where a directory's size is measured: everything hand-written, the tests included. */
const TREES = repoFiles(["apps", "packages", "tooling/scripts", "e2e"]);
/** The shell and its bridge: the only code that may touch `window` at all. */
const SHELL = SRC.filter((f) => f.startsWith("apps/dashboard/src/"));
/** A route module exports what the framework names (GET, POST, default); those are not copies. */
const notARoute = (f) => !/^apps\/dashboard\/app\/|^apps\/edge\/api\//.test(f);
/** The doors: the edge's provider webhooks, sweeps and admin doors, and the dashboard's member routes. */
const ROUTES = SRC.filter((f) => /^apps\/edge\/api\/|^apps\/dashboard\/app\/api\//.test(f) && /\.tsx?$/.test(f));
/**
 * What a door does not import (specifiers as written, so the edge's relative facade of a package is a pattern of its
 * own beside the package): a repository (`@chanlytics/db`, or supabase-js, which is one's client) and a provider client
 * (`@chanlytics/channels`, whose `providerFetch` and wires are the providers' own). A door that holds one holds a rule
 * or a table query the layer behind it should. The edge's `lib/pg` handle is not named: nearly every door takes it to
 * pass on, and the tables ratchet already counts the ones that query it.
 */
export const DOOR_FORBIDS = [
  /^@chanlytics\/(db|channels)$/,
  /^@supabase\/supabase-js$/,
  /(^|\/)lib\/packages\/(db|channels)(\.js)?$/,
];
/**
 * Where a length of time is measured: the shipped sources, less what cannot import the units' home — the shell's
 * classic scripts (legacy/) and the static files the browser loads as they are (public/) — and less the home itself.
 */
const TIMED = SRC.filter(
  (f) =>
    !/^apps\/dashboard\/src\/legacy\/|^apps\/dashboard\/public\/|(^|\/)test\/|\.test\.|^packages\/[^/]+\/(?!src\/)/.test(
      f,
    ) && f !== "packages/contracts/src/shared/time.ts",
);

/**
 * The dashboard's stylesheets, which the interface kit's measures hold
 * (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.7). The tokens are where a literal value belongs, so
 * they are measured by neither; the kit is where a primitive belongs, so it is measured for its values, never for its
 * primitives. A class the kit's registry lists (kit/classes.json, which _css.mjs reads) is a primitive in every other
 * stylesheet, whatever its words.
 */
export const TOKENS_CSS = "apps/dashboard/src/legacy/styles/tokens.css";
const KIT_CSS = "apps/dashboard/src/surfaces/kit/kit.css";
const STYLES = repoFiles(["apps/dashboard"], { keep: /\.css$/ }).filter((f) => f !== TOKENS_CSS);
/**
 * The shell's markup, which the kit will style: the legacy pages and components, and the surfaces that leave them
 * (§3.7). The app's own error screens and the bridge's host draw before the stylesheets or without them, so a prop is
 * all they have and they are not held.
 */
const MARKUP = SRC.filter((f) => /^apps\/dashboard\/src\/(legacy|surfaces)\/.*\.(jsx|tsx)$/.test(f));

/** `{ file: n }` for each of `files` whose syntax tree `count` puts over `floor`. */
const perFile = (files, count, floor = 0) =>
  Object.fromEntries(files.map((f) => [f, count(parse(f))]).filter(([, n]) => n > floor));

/** One entry per baseline under tests/baselines/: what it holds, and what to do when it rises. */
export const MEASURES = [
  {
    name: "functions over the limit",
    file: "complexity.json",
    measure: () => {
      const out = {};
      for (const f of SRC) {
        for (const fn of functionsIn(parse(f))) {
          if (fn.lines > LIMIT.lines || fn.branches > LIMIT.branches || fn.depth > LIMIT.depth) {
            out[`${f}::${fn.key}`] = { lines: fn.lines, branches: fn.branches, depth: fn.depth };
          }
        }
      }
      return out;
    },
    advice:
      "Split it — one builder per band, a table for a decision table, a hook for a component's concern — or keep it under 150 lines, 30 branches and 5 levels.",
  },
  {
    name: "files over the limit",
    file: "file-length.json",
    measure: () => perFile(SRC, linesOf, FILE_LIMIT),
    advice: "Move a domain out of it into its own module; a file over 800 lines is two files.",
  },
  {
    name: "directories over the limit",
    file: "tree-shape.json",
    measure: () => {
      const perDir = {};
      for (const f of TREES) {
        if (!SOURCE.test(f)) continue;
        const dir = path.posix.dirname(f);
        perDir[dir] = (perDir[dir] ?? 0) + 1;
      }
      return Object.fromEntries(Object.entries(perDir).filter(([, n]) => n > DIRECTORY_LIMIT));
    },
    advice: "Group it by domain, the way apps/edge/lib is: a folder per domain, the plumbing at the root.",
  },
  {
    name: "window globals",
    file: "window-globals.json",
    mode: "set",
    measure: () => {
      const files = {};
      for (const f of SHELL) for (const n of windowUse(parse(f)).names) files[n] = (files[n] ?? 0) + 1;
      return files;
    },
    advice: "No new global: feed the surface through the seam (surface-data.ts), or reuse one that exists.",
  },
  {
    name: "window publishers",
    file: "window-publishers.json",
    measure: () => perFile(SHELL, (sf) => windowUse(sf).publishers),
    advice: "Publish nothing new on window: import it, or add the name to a component that already publishes.",
  },
  {
    name: "copies",
    file: "copies.json",
    measure: () => copiesAmong(SRC.filter(notARoute).map(parse), COPY_LIMIT),
    advice:
      "Give it one home and import it from there — a helper declared in three files is a fact spelled out three times — or, when the new one is a different thing, give it a name that says which.",
  },
  {
    name: "casts: as unknown as, as never and x!",
    file: "casts.json",
    measure: () => {
      const out = {};
      for (const f of SRC) {
        const counts = castsIn(parse(f));
        if (Object.keys(counts).length > 0) out[f] = counts;
      }
      return out;
    },
    advice:
      "Name the shape and parse it, or narrow it with a type guard: a value laundered through unknown, told it is never, or told it is not null is a type the compiler no longer checks. An index read that can miss is guarded (const first = rows[0]; if (!first) …), never asserted with !.",
  },
  {
    // A file's `.from("…")` count under its path, and its `.rpc("…")` count under `<path>${RPC_KEY}`: a SQL function
    // called by name outside packages/db is a table read or written there all the same.
    name: "table names outside packages/db",
    file: "tables.json",
    measure: () => {
      const outside = SRC.filter((f) => !f.startsWith("packages/db/"));
      const rpcs = perFile(outside, rpcNames);
      return {
        ...perFile(outside, tableNames),
        ...Object.fromEntries(Object.entries(rpcs).map(([f, n]) => [f + RPC_KEY, n])),
      };
    },
    advice:
      "A table, and a SQL function, is named once, in packages/db (CLAUDE.md, what not to introduce): add a repository or a reader there and call it.",
  },
  {
    name: "route files that hold a repository or a provider client",
    file: "route-doors.json",
    measure: () => perFile(ROUTES, (sf) => importsMatching(sf, DOOR_FORBIDS)),
    advice:
      "A route file is a door: it verifies, parses its input and answers, and everything else is a call into lib/ (the edge), src/server (the dashboard) or a core verb. Read or write through a repository behind that call, and reach a provider through a wire in packages/channels behind it too.",
  },
  {
    name: "unnamed durations",
    file: "durations.json",
    measure: () => {
      const out = {};
      for (const f of TIMED) {
        const n = durationsIn(parse(f)).length;
        if (n > 0) out[f] = n;
      }
      return out;
    },
    advice:
      "Name the length of time: a whole minute, hour or day from contracts' shared/time.ts (5 * MIN_MS, DAY_MS), anything else a constant in its module that says what it is (const RETRY_MS = 800; const LEASE_MS = 5 * MIN_MS). A value that is not a time says its unit in its name (RADIUS_MAX_M, TAB_TOTAL_CHARS).",
  },
  {
    name: "literal style values",
    file: "style-values.json",
    measure: () => {
      const out = {};
      for (const f of STYLES) {
        const { values } = cssOf(f);
        if (STYLE_VALUE_FIELDS.some((k) => values[k] > 0)) out[f] = values;
      }
      return out;
    },
    advice:
      "Read a token: a type size, radius, shadow, colour or blur is declared once, in apps/dashboard/src/legacy/styles/tokens.css, and a stylesheet reads it with var(). If no token fits, add one there (the interface kit's rule 1, docs/plans/2026-09-28-the-interface-kit-and-its-looks.md).",
  },
  {
    name: "primitives outside the kit",
    file: "kit-primitives.json",
    // Held by count, not as a set: `.btn` is already named in ten page stylesheets, and a new `.pl-peek .btn { … }`
    // in any of them is one more selector restyling the kit from a page.
    measure: () => {
      const out = {};
      for (const f of STYLES.filter((f) => f !== KIT_CSS)) {
        for (const [name, n] of Object.entries(cssOf(f).classes)) if (isPrimitiveClass(name)) out[`${f}::${name}`] = n;
      }
      return out;
    },
    advice:
      "Draw it with the kit's primitive, never a class of the page's own: the kit's rules are in apps/dashboard/src/surfaces/kit/kit.css, their names in classes.json beside it. Place it through a class of the page's own that names no kit class and holds no primitive's word, since a selector naming a kit class counts even when it only places it. If the kit has nothing that fits, it takes a new variant with its gallery entry (the interface kit's rule 3, docs/plans/2026-09-28-the-interface-kit-and-its-looks.md; .claude/skills/chanlytics-interface/SKILL.md).",
  },
  {
    name: "inline style props",
    file: "inline-styles.json",
    measure: () => perFile(MARKUP, inlineStyles),
    advice:
      "Style it with a class that reads tokens, not a style prop: a value in a prop is one no look can reach (the interface kit's rule 1, docs/plans/2026-09-28-the-interface-kit-and-its-looks.md).",
  },
];

/* ---- Source-text reads in tests (repo/source-scan-ratchet.test.mjs) ---- */

export const TESTS_DIR = "tooling/scripts/tests";
const SOURCE_SCAN_SELF = "repo/source-scan-ratchet.test.mjs";

/**
 * The test files the REPOSITORY has, not the files this laptop has, each keyed
 * by its path relative to tooling/scripts/tests (`people/person-notes.test.mjs`).
 *
 * Learned from CI, on the source-scan ratchet's first run: its baseline was
 * seeded from a working tree that held another session's UNTRACKED test file,
 * and CI, checking out the repo, found four fewer source reads than the baseline
 * claimed. A number that differs between a checkout and a desk is not a ratchet
 * but a number two people can argue about, so the set is `git ls-files`, and an
 * untracked scratch test cannot move a repo-wide count in either direction. The
 * same lesson, in reverse, on the day the ratchets were seeded: a file that is
 * not yet tracked is not yet counted, so seed after staging.
 *
 * Falls back to the directory when git is unavailable, because a test that
 * cannot run at all is worse than one measuring a slightly wider set.
 */
function repoTestFiles() {
  try {
    return execFileSync("git", ["ls-files", TESTS_DIR], { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.endsWith(".test.mjs"))
      .map((l) => l.slice(TESTS_DIR.length + 1));
  } catch {
    return fs
      .readdirSync(path.join(ROOT, TESTS_DIR), { recursive: true })
      .map((f) => String(f).split(path.sep).join("/"))
      .filter((f) => f.endsWith(".test.mjs"));
  }
}

/** Every test file and, for those that read source as text, how many times: `readCode(` and `readRaw(` on the comment-stripped file. */
export function sourceScan() {
  const files = repoTestFiles().filter((f) => f !== SOURCE_SCAN_SELF && fs.existsSync(path.join(ROOT, TESTS_DIR, f)));
  const counts = Object.fromEntries(
    files
      .map((f) => [f, (readCode(`${TESTS_DIR}/${f}`).match(/\b(readCode|readRaw)\(/g) ?? []).length])
      .filter(([, n]) => n > 0),
  );
  return { files, counts };
}

export const SOURCE_SCAN_BASELINE = `${TESTS_DIR}/source-scan-baseline.json`;

/**
 * The counts a bank writes for the source-scan ratchet, by the rule every ratchet banks
 * by (`bank`, _ratchet.mjs): a file's count falls or goes, and rises only with a raise.
 * A file in `lint`, a repo-wide lint, is exempt from the ratchet but not from the
 * record, so its count is written as measured.
 */
export function bankedSourceScan(counts, baseline, raise) {
  const held = (o) => Object.fromEntries(Object.entries(o).filter(([f]) => !baseline.lint.includes(f)));
  const exempt = Object.entries(counts).filter(([f]) => baseline.lint.includes(f));
  const out = { ...bank(held(counts), held(baseline.counts), { raise }), ...Object.fromEntries(exempt) };
  return Object.fromEntries(
    Object.keys(out)
      .sort()
      .map((f) => [f, out[f]]),
  );
}

/* ---- The tree docs/architecture.md draws (docs/docs-tree.test.mjs) ---- */

/**
 * The code trees the page draws, in its order, where PACKAGES stands for every package's src. Each is drawn with the
 * folders that hold its modules (TREES: tracked, hand-written, TypeScript or JavaScript), by name and never with a
 * count, so the drawing changes when a folder appears or disappears, not with each module a change adds or removes.
 * `supabase/migrations/`, the schema, is drawn as its one line.
 */
const PACKAGES = "packages/<name>/src";
const DRAWN = [
  "apps/edge/api",
  "apps/edge/lib",
  "apps/dashboard/app",
  "apps/dashboard/src",
  "apps/dashboard/src/server",
  "apps/dashboard/src/legacy-bridge",
  "apps/dashboard/src/legacy",
  "apps/mobile/src",
  PACKAGES,
  "tooling/scripts",
  "e2e",
];
const MIGRATIONS = "supabase/migrations";

/**
 * One tree as the page draws it: its path, then each folder that holds one of `files`, by name. A tree that holds
 * none is an entry of DRAWN its code has left, and fails the drawing rather than draw a tree that is not there.
 */
function drawn(tree, files) {
  if (files.length === 0) throw new Error(`${tree} holds nothing to draw: DRAWN (_measures.mjs) moves with its code`);
  const paths = files.map((f) => f.slice(tree.length + 1).split("/"));
  const folders = [...new Set(paths.filter((parts) => parts.length > 1).map((parts) => parts[0]))].sort();
  return [`${tree}/`, ...folders.map((folder) => `  ${folder}/`)];
}

/** The block docs/architecture.md prints between its tree markers: each code tree and its folders, by name. */
export function drawnTree() {
  const packages = [...new Set(TREES.map((f) => /^packages\/[^/]+\/src(?=\/)/.exec(f)?.[0]).filter(Boolean))].sort();
  const trees = DRAWN.flatMap((tree) => (tree === PACKAGES ? packages : [tree]));
  const modulesUnder = (tree) => TREES.filter((f) => f.startsWith(`${tree}/`));
  const lines = trees.flatMap((tree) => drawn(tree, modulesUnder(tree)));
  lines.push(...drawn(MIGRATIONS, repoFiles([MIGRATIONS], { keep: /\.sql$/ })));
  return "```text\n" + lines.join("\n") + "\n```";
}

/* ---- The wire's names (routes/wire-casing.test.mjs) ---- */

/**
 * The typed client's registry: every /api/v1 handler under the key route-policy.json gives it, as a type that
 * carries what the handler takes and answers (the phantom `Shape<I, O>` of apps/dashboard/src/server/route.ts).
 */
export const WIRE_REGISTRY = "apps/dashboard/src/client/routes.generated.ts";
/** How many levels below a route's body, query or answer its names are read. */
export const WIRE_DEPTH = 6;
/** The wire's one casing (docs/naming.md): lower-case words joined by underscores, one word included. */
export const isSnakeCase = (name) => /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name);
/** Objects JSON writes as a string or as nothing: their members are not names on the wire. */
const NOT_OBJECTS_ON_THE_WIRE = new Set([
  "Date",
  "Map",
  "Set",
  "Promise",
  "Response",
  "Blob",
  "ArrayBuffer",
  "Uint8Array",
  "ReadableStream",
  "Headers",
  "URL",
]);

/**
 * Every property name in `type`, to WIRE_DEPTH levels below it: through unions, intersections, arrays and a record's
 * values, never a record's keys (a workspace's id is data, not a name). A type met again is walked again only from
 * higher up, where more of it is in reach, so what is found does not depend on the order it is met in.
 */
function namesIn(checker, type, at, out, depth = 0, seen = new Map()) {
  if (!type || depth > WIRE_DEPTH || (seen.get(type) ?? Infinity) <= depth) return out;
  seen.set(type, depth);
  if (type.isUnion() || type.isIntersection()) {
    for (const t of type.types) namesIn(checker, t, at, out, depth, seen);
  } else if (checker.isArrayType(type) || checker.isTupleType(type)) {
    for (const t of checker.getTypeArguments(type)) namesIn(checker, t, at, out, depth + 1, seen);
  } else if (type.flags & ts.TypeFlags.Object && !NOT_OBJECTS_ON_THE_WIRE.has(type.getSymbol()?.getName())) {
    for (const info of checker.getIndexInfosOfType(type)) namesIn(checker, info.type, at, out, depth + 1, seen);
    for (const p of checker.getPropertiesOfType(type)) {
      // A symbol-keyed member (a brand, the phantom shape itself) is a type's, never JSON's.
      if (p.getName().startsWith("__@")) continue;
      out.add(p.getName());
      namesIn(checker, checker.getTypeOfSymbolAtLocation(p, at), at, out, depth + 1, seen);
    }
  }
  return out;
}

/**
 * What each route in a registry takes and answers, by name: `{ [route]: { takes, answers, hidden } }`, each list
 * sorted, or null for a handler that carries no shape. `hidden` says which side, `takes` or `answers`, is `any` or
 * `unknown` as a whole, so has no names the walk can read. The registry is a module whose `Routes` type names each
 * handler; a handler's module the checker could not resolve reads as `any`, which has no shape, so it cannot read as
 * clean.
 */
export function wireShapes(program, registry) {
  const checker = program.getTypeChecker();
  const alias = program
    .getSourceFile(registry)
    ?.statements.find((s) => ts.isTypeAliasDeclaration(s) && s.name.text === "Routes");
  if (!alias) throw new Error(`${registry} has no Routes type for the checker to read`);
  const typeOf = (io, name) => {
    const s = io.getProperty(name);
    return s && checker.getTypeOfSymbolAtLocation(s, alias);
  };
  const side = (io, name) => [...namesIn(checker, typeOf(io, name), alias, new Set())].sort();
  const opaque = (io, name) => Boolean(typeOf(io, name)?.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown));
  const out = {};
  for (const route of checker.getPropertiesOfType(checker.getTypeAtLocation(alias.name))) {
    const handler = checker.getTypeOfSymbolAtLocation(route, alias);
    const shape = checker.getPropertiesOfType(handler).find((p) => p.getName().startsWith("__@shape"));
    const io = shape && checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(shape, alias));
    out[route.getName()] = io
      ? {
          takes: side(io, "input"),
          answers: side(io, "output"),
          hidden: [
            ["takes", "input"],
            ["answers", "output"],
          ]
            .filter(([, name]) => opaque(io, name))
            .map(([said]) => said),
        }
      : null;
  }
  return out;
}

let dashboard;
/**
 * The dashboard's registry read with the dashboard's own compiler options, as its typecheck reads it, once per
 * process: the program takes seconds to build, and the ratchet and the guards beside it read the same shapes.
 */
export function dashboardWire() {
  if (!dashboard) {
    const config = ts.getParsedCommandLineOfConfigFile(
      path.join(ROOT, "apps/dashboard/tsconfig.json"),
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (d) => {
          throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
        },
      },
    );
    const registry = path.join(ROOT, WIRE_REGISTRY).split(path.sep).join("/");
    const program = ts.createProgram({
      rootNames: [registry],
      options: { ...config.options, noEmit: true, incremental: false },
    });
    dashboard = wireShapes(program, registry);
  }
  return dashboard;
}

/** One entry per name a route takes or answers that is not snake_case: `<route> takes <name>`, `<route> answers <name>`. */
export function offTheWire(shapes) {
  const out = {};
  for (const [route, io] of Object.entries(shapes)) {
    for (const name of io?.takes ?? []) if (!isSnakeCase(name)) out[`${route} takes ${name}`] = 1;
    for (const name of io?.answers ?? []) if (!isSnakeCase(name)) out[`${route} answers ${name}`] = 1;
  }
  return out;
}

/** The register's two numbers for the wire: how many distinct names are not snake_case, and in how many routes. */
export function wireCounts(held) {
  const parts = Object.keys(held ?? {}).map((k) => /^(.*) (?:takes|answers) (\S+)$/.exec(k) ?? [k, k, k]);
  return { names: new Set(parts.map((p) => p[2])).size, routes: new Set(parts.map((p) => p[1])).size };
}

/** The wire's ratchet: its own test file, because it needs the type checker's program, not the syntax trees above. */
export const WIRE_CASING = {
  name: "wire names not in snake_case",
  file: "wire-casing.json",
  measure: () => offTheWire(dashboardWire()),
  advice:
    "The wire is snake_case (docs/naming.md, decision 0022): name the field in snake_case in the route's type, and turn a view model into it in a named mapping, never a converter. A field a page or the phone app reads is answered in both spellings for one release.",
};

/* ---- Index reads the compiler lets pass (types/index-reads-are-counted.test.mjs) ---- */

/** A project's tsconfig as the compiler resolves it, its `extends` followed. */
export function resolvedConfig(tsconfig) {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    tsconfig,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => {
        throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
      },
    },
  );
  if (!parsed) throw new Error(`${tsconfig} could not be read`);
  return parsed;
}

/** Every workspace project's tsconfig.json, by its project's path: the packages and the apps. */
export function projectConfigs() {
  const out = [];
  for (const group of ["packages", "apps"]) {
    for (const name of fs.readdirSync(path.join(ROOT, group)).sort()) {
      const tsconfig = path.join(ROOT, group, name, "tsconfig.json");
      if (fs.existsSync(tsconfig)) out.push({ project: `${group}/${name}`, tsconfig });
    }
  }
  return out;
}

/** The projects whose tsconfig turns noUncheckedIndexedAccess off, the base's flag: the ones UNCHECKED_INDEX counts. */
export const waitingProjects = () =>
  projectConfigs().filter(({ tsconfig }) => resolvedConfig(tsconfig).options.noUncheckedIndexedAccess !== true);

/**
 * `{ file: n }`: in each project that waits, every error noUncheckedIndexedAccess would raise, the flag on and nothing
 * else changed, by the file it is in. Each is a read the compiler lets pass as if it could not miss (`rows[0]`,
 * `table[key]`, a regex's `m[1]`). A count means something only over a tree that typechecks, as CI's does before the
 * suite runs. What Next writes into `.next/` is the build's, not the project's.
 */
function uncheckedIndexReads() {
  const now = {};
  for (const { tsconfig } of waitingProjects()) {
    const config = resolvedConfig(tsconfig);
    const program = ts.createProgram({
      rootNames: config.fileNames,
      options: { ...config.options, noUncheckedIndexedAccess: true, noEmit: true, incremental: false },
    });
    const home = path.dirname(tsconfig) + path.sep;
    for (const d of program.getSemanticDiagnostics()) {
      if (!d.file || !path.resolve(d.file.fileName).startsWith(home)) continue;
      const file = path.relative(ROOT, path.resolve(d.file.fileName)).split(path.sep).join("/");
      if (/(^|\/)(\.next|node_modules)\//.test(file)) continue;
      now[file] = (now[file] ?? 0) + 1;
    }
  }
  return now;
}

/**
 * The index reads' ratchet: a file of its own under tests/types, because it builds three whole programs (core,
 * contracts, the dashboard), not the syntax trees the ratchets above read. A project that turns the flag on leaves the
 * measure, and its entries go with the next bank.
 */
export const UNCHECKED_INDEX = {
  name: "index reads the compiler lets pass",
  file: "unchecked-index.json",
  measure: uncheckedIndexReads,
  advice:
    "Guard the read where it can miss (const first = rows[0]; if (!first) …; .at(-1) with a check; a destructured default), never with x!, which casts.json counts. tsconfig.base.json turns noUncheckedIndexedAccess on; a project that turns it off is counted here, file by file. Every error the flag's program reports is counted, so typecheck first: an error of another kind reads here as a read.",
};
