/**
 * The measures behind docs/debt.md, in one module.
 *
 * The ratchets (repo/code-health-ratchets.test.mjs), the source-scan ratchet
 * (repo/source-scan-ratchet.test.mjs) and the register (repo/debt-register.test.mjs)
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
 * being a ratchet and becomes a lint error.
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
  topLevelNames,
  unknownCasts,
  tableNames,
  durationsIn,
  SOURCE,
} from "./_ast.mjs";

const LIMIT = { lines: 150, branches: 30, depth: 5 };
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

const shellUse = () => SHELL.map((f) => [f, windowUse(parse(f))]);

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
    measure: () => {
      const out = {};
      for (const f of SRC) {
        const n = linesOf(parse(f));
        if (n > FILE_LIMIT) out[f] = n;
      }
      return out;
    },
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
      for (const [, use] of shellUse()) for (const n of use.names) files[n] = (files[n] ?? 0) + 1;
      return files;
    },
    advice: "No new global: feed the surface through the seam (surface-data.ts), or reuse one that exists.",
  },
  {
    name: "window publishers",
    file: "window-publishers.json",
    measure: () => {
      const out = {};
      for (const [f, use] of shellUse()) if (use.publishers > 0) out[f] = use.publishers;
      return out;
    },
    advice: "Publish nothing new on window: import it, or add the name to a component that already publishes.",
  },
  {
    name: "copies",
    file: "copies.json",
    measure: () => {
      const files = new Map();
      for (const f of SRC.filter(notARoute)) {
        for (const n of new Set(topLevelNames(parse(f)))) {
          if (n.length < 4) continue;
          if (!files.has(n)) files.set(n, new Set());
          files.get(n).add(f);
        }
      }
      return Object.fromEntries([...files].filter(([, s]) => s.size >= COPY_LIMIT).map(([n, s]) => [n, s.size]));
    },
    advice:
      "Give it one home and import it from there — a helper declared in three files is a fact spelled out three times — or, when the new one is a different thing, give it a name that says which.",
  },
  {
    name: "as unknown as",
    file: "casts.json",
    measure: () => {
      const out = {};
      for (const f of SRC) {
        const n = unknownCasts(parse(f));
        if (n > 0) out[f] = n;
      }
      return out;
    },
    advice:
      "Name the shape and parse it, or narrow it with a type guard; a value laundered through unknown is a type the compiler no longer checks.",
  },
  {
    name: "table names outside packages/db",
    file: "tables.json",
    measure: () => {
      const out = {};
      for (const f of SRC.filter((f) => !f.startsWith("packages/db/"))) {
        const n = tableNames(parse(f));
        if (n > 0) out[f] = n;
      }
      return out;
    },
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
