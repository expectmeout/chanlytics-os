/**
 * The measures behind docs/debt.md, in one module.
 *
 * The ratchets (repo/code-health-ratchets.test.mjs), the source-scan ratchet
 * (repo/source-scan-ratchet.test.mjs), the wire's ratchet (routes/wire-casing.test.mjs)
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
  unknownCasts,
  tableNames,
  durationsIn,
  SOURCE,
} from "./_ast.mjs";
import { bank } from "./_ratchet.mjs";

/** A function's limits: eslint.config.mjs's FUNCTION_LIMITS, as errors where this holds nothing. */
export const LIMIT = { lines: 150, branches: 30, depth: 5 };
const FILE_LIMIT = 800;
const DIRECTORY_LIMIT = 20;
const COPY_LIMIT = 3;

/** The code that ships: the two apps and the packages' sources. Tests and specs are not held to a function's size. */
const SRC = repoFiles(["apps", "packages"]);
/** Where a directory's size is measured: everything hand-written, the tests included. */
const TREES = repoFiles(["apps", "packages", "tooling/scripts", "e2e"]);
/** The shell and its bridge: the only code that may touch `window` at all. */
const SHELL = SRC.filter((f) => f.startsWith("apps/dashboard/src/"));
/** A route module exports what the framework names (GET, POST, default); those are not copies. */
const notARoute = (f) => !/^apps\/dashboard\/app\/|^apps\/edge\/api\//.test(f);
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
    name: "as unknown as",
    file: "casts.json",
    measure: () => perFile(SRC, unknownCasts),
    advice:
      "Name the shape and parse it, or narrow it with a type guard; a value laundered through unknown is a type the compiler no longer checks.",
  },
  {
    name: "table names outside packages/db",
    file: "tables.json",
    measure: () =>
      perFile(
        SRC.filter((f) => !f.startsWith("packages/db/")),
        tableNames,
      ),
    advice:
      "A table is typed once, in packages/db (CLAUDE.md, what not to introduce): add a repository or a reader there and call it.",
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
 * What each route in a registry takes and answers, by name: `{ [route]: { takes, answers } }`, each list sorted, or
 * null for a handler that carries no shape. The registry is a module whose `Routes` type names each handler; a
 * handler's module the checker could not resolve reads as `any`, which has no shape, so it cannot read as clean.
 */
export function wireShapes(program, registry) {
  const checker = program.getTypeChecker();
  const alias = program
    .getSourceFile(registry)
    ?.statements.find((s) => ts.isTypeAliasDeclaration(s) && s.name.text === "Routes");
  if (!alias) throw new Error(`${registry} has no Routes type for the checker to read`);
  const side = (io, name) => {
    const s = io.getProperty(name);
    return [...namesIn(checker, s && checker.getTypeOfSymbolAtLocation(s, alias), alias, new Set())].sort();
  };
  const out = {};
  for (const route of checker.getPropertiesOfType(checker.getTypeAtLocation(alias.name))) {
    const handler = checker.getTypeOfSymbolAtLocation(route, alias);
    const shape = checker.getPropertiesOfType(handler).find((p) => p.getName().startsWith("__@shape"));
    const io = shape && checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(shape, alias));
    out[route.getName()] = io ? { takes: side(io, "input"), answers: side(io, "output") } : null;
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
