/**
 * One TypeScript, installed once: a single copy under node_modules, at the version the catalog pins, and the one
 * every project's `tsc` runs.
 *
 * typescript-is-declared-once.test.mjs holds what is written. An install can still differ from it: a lockfile or an
 * override can pin a second copy, and a tool loads the copy nearest to it, which is how the repository ran two
 * compilers (5.9.3 nested in every project and under tsup, 6.0.3 at the root). A checkout installed before the pin
 * keeps a trace too: `pnpm install` removes the nested copies but leaves each project's `node_modules/.bin/tsc`
 * pointing at where one was, and `pnpm -r typecheck` dies on "Cannot find module". So this reads the install as node
 * does, walked by hand: every node_modules in the workspace (the root's, each project's, and each nested under a
 * package in them), and the `tsc` each project's scripts run. With one copy on disk, every tool that loads the
 * compiler (tsup, knip, typescript-eslint, Next) loads that one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../_source.mjs";
import { catalogPins, workspaceProjects } from "../_pnpm-workspace.mjs";

const TS = "typescript";
const ROOT_COPY = path.join(ROOT, "node_modules", TS);
const projects = workspaceProjects();

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/") || ".";
const dirents = (dir) => fs.readdirSync(dir, { withFileTypes: true });
const versionAt = (dir) => {
  const manifest = path.join(dir, "package.json");
  return fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, "utf8")).version : undefined;
};
/** A copy by its real path, so a link to one is not a second; a dangling link by its own. */
const realOf = (p) => (fs.existsSync(p) ? fs.realpathSync(p) : p);

/**
 * Every copy of typescript in `nm`, a node_modules directory, and in each node_modules nested in a package in it.
 * A package is a directory; a scope (`@x/`) holds packages, and so does pnpm's store (`.pnpm/`) when the linker is
 * isolated rather than .npmrc's hoisted. A link is not followed: the workspace's own packages are linked into the
 * projects, and each is swept as a project.
 */
function copiesIn(nm, copies = new Set()) {
  for (const d of dirents(nm)) {
    const at = path.join(nm, d.name);
    if (d.name === TS) copies.add(realOf(at));
    if (!d.isDirectory()) continue;
    const holdsPackages = d.name.startsWith("@") || d.name === ".pnpm";
    const packages = holdsPackages
      ? dirents(at)
          .filter((c) => c.isDirectory())
          .map((c) => path.join(at, c.name))
      : [at];
    for (const pkg of packages) {
      const nested = path.join(pkg, "node_modules");
      if (fs.existsSync(nested)) copiesIn(nested, copies);
    }
  }
  return copies;
}

/**
 * The `tsc` a project's scripts run: the first node_modules/.bin/tsc from the project up to the root, the order the
 * package manager puts them on PATH, and the file it executes. With the hoisted linker pnpm links it on Linux and
 * macOS (prefer-symlinked-executables); on Windows it writes a shell script, a .CMD and a .ps1, each running
 * "$basedir/<path>" (with the node beside them when there is one), and the shell script is the one read here.
 */
function tscOf(project) {
  for (let dir = path.join(ROOT, project); ; dir = path.dirname(dir)) {
    const shim = path.join(dir, "node_modules", ".bin", "tsc");
    const stat = fs.lstatSync(shim, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) return { shim, runs: path.resolve(path.dirname(shim), fs.readlinkSync(shim)) };
    if (stat) {
      const target = /"\$basedir\/(?!node")([^"]+)"/.exec(fs.readFileSync(shim, "utf8"));
      assert.ok(target, `${rel(shim)} is not a shim this test reads: teach tscOf its format`);
      return { shim, runs: path.resolve(path.dirname(shim), target[1]) };
    }
    if (dir === ROOT || path.dirname(dir) === dir) return undefined;
  }
}

/** The package a file belongs to: the nearest directory up from it that holds a package.json. */
function packageOf(file) {
  for (let dir = path.dirname(file); path.dirname(dir) !== dir; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
  }
  return undefined;
}

test("one copy of typescript is installed: node_modules/typescript, and no other node_modules holds one", () => {
  assert.ok(
    fs.existsSync(path.join(ROOT_COPY, "package.json")),
    "node_modules/typescript is installed: corepack pnpm install",
  );
  const copies = new Set();
  for (const p of projects) {
    const nm = path.join(ROOT, p, "node_modules");
    if (fs.existsSync(nm)) copiesIn(nm, copies);
  }
  const others = [...copies]
    .filter((c) => c !== realOf(ROOT_COPY))
    .map((c) => `${rel(c)} holds ${versionAt(c) ?? "a copy without a package.json"}`)
    .sort();
  assert.deepEqual(
    others,
    [],
    "a second copy is a second compiler for whatever sits nearest it: pnpm-lock.yaml says what pins it, and a " +
      "checkout installed before the pin deletes its projects' node_modules and installs again",
  );
});

test("node_modules/typescript is the version the catalog pins", () => {
  const [pin] = catalogPins(TS);
  assert.ok(pin, "the catalog pins typescript (typescript-is-declared-once.test.mjs)");
  assert.equal(versionAt(ROOT_COPY), pin.version, "the install is not the catalog's: corepack pnpm install");
});

test("every project's tsc runs node_modules/typescript", () => {
  const off = [];
  for (const p of projects) {
    const tsc = tscOf(p);
    if (!tsc) {
      off.push(`${p}: no node_modules/.bin/tsc from ${p} up to the root`);
    } else if (!fs.existsSync(tsc.runs)) {
      const nm = path.dirname(path.dirname(tsc.shim));
      off.push(
        `${p}: ${rel(tsc.shim)} runs ${rel(tsc.runs)}, which is not installed: delete ${rel(nm)}, install again`,
      );
    } else if (realOf(packageOf(tsc.runs)) !== realOf(ROOT_COPY)) {
      const pkg = packageOf(tsc.runs);
      off.push(`${p}: ${rel(tsc.shim)} runs ${versionAt(pkg)} from ${rel(pkg)}`);
    }
  }
  assert.deepEqual(off, [], "each project's typecheck runs the one compiler");
});
