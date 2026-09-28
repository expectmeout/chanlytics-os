/**
 * The measures behind docs/debt.md, and the tree docs/architecture.md draws, in one module.
 *
 * The ratchets (repo/code-health-ratchets.test.mjs), the source-scan ratchet
 * (repo/source-scan-ratchet.test.mjs), the register (repo/debt-register.test.mjs)
 * and the drawn tree (docs/docs-tree.test.mjs) all read the definitions here, so a
 * number means one thing wherever it is printed. It also keeps banking honest: the node runner starts test files in
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

/* ---- The tree docs/architecture.md draws (docs/docs-tree.test.mjs) ---- */

/**
 * The code trees the page draws, in its order, where PACKAGES stands for every package's src. A module is what
 * "directories over 20 modules" counts (TREES: tracked, hand-written, TypeScript or JavaScript), so a folder's number
 * is one number on both pages; `supabase/migrations/` counts its migrations.
 */
const PACKAGES = "packages/<name>/src";
const DRAWN = [
  "apps/edge/api",
  "apps/edge/lib",
  "apps/dashboard/app",
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
 * One tree as the page draws it: its path, then `./` with the modules at its root and each folder with the modules
 * under it. No total: two changes that each add a module to different folders touch different lines, and merge.
 */
function drawn(tree, files) {
  const per = new Map();
  for (const f of files) {
    const rest = f.slice(tree.length + 1);
    const at = rest.includes("/") ? rest.slice(0, rest.indexOf("/")) : ".";
    per.set(at, (per.get(at) ?? 0) + 1);
  }
  const folders = [...per.keys()].filter((at) => at !== ".").sort();
  const rows = per.has(".") ? [".", ...folders] : folders;
  return [`${tree}/`, ...rows.map((at) => `  ${`${at}/`.padEnd(24)}${String(per.get(at)).padStart(5)}`)];
}

/** The block docs/architecture.md prints between its tree markers: each code tree, its folders and their modules. */
export function drawnTree() {
  const packages = [...new Set(TREES.map((f) => /^packages\/[^/]+\/src(?=\/)/.exec(f)?.[0]).filter(Boolean))].sort();
  const trees = DRAWN.flatMap((tree) => (tree === PACKAGES ? packages : [tree]));
  const modulesUnder = (tree) => TREES.filter((f) => f.startsWith(`${tree}/`));
  const lines = trees.flatMap((tree) => drawn(tree, modulesUnder(tree)));
  lines.push(...drawn(MIGRATIONS, repoFiles([MIGRATIONS], { keep: /\.sql$/ })));
  return "```text\n" + lines.join("\n") + "\n```";
}
