/**
 * One TypeScript: the version every compiler and tool in the workspace loads, named once.
 *
 * Until this held, the repository ran two. `tsc`, Next's build, tsup's declarations and the ratchets
 * loaded 5.9.3, because every package and app declared `typescript ^5.7`; typescript-eslint, knip and
 * the phone app loaded 6.0.3, which the root never declared: it was the copy the hoister lifted out of
 * `apps/mobile` (`~6.0.3`). The lint judged the code with one compiler and the typecheck with another,
 * and nothing said so. Under 6.0.3 three packages failed to typecheck (45 errors, all from 6.0's new
 * `types: []` default), which is how far apart the two had drifted.
 *
 * So the version lives in pnpm-workspace.yaml's catalog, at an exact version, and every package.json
 * that names `typescript` names it as `catalog:`. `catalogMode: strict` makes `pnpm add` refuse a
 * version the catalog does not pin. This holds the rest: the pin, the references, and the install
 * itself, since a lockfile or an override can still leave a second copy where a tool will find it.
 * TypeScript 7 ships no JavaScript API, and tsup's --dts, typescript-eslint, knip and these tests all
 * call the compiler's API, so 6.0 is the version they meet on until each of them moves.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../_source.mjs";

const TS = "typescript";
const FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
/** An exact version: no range, no tag, nothing pnpm could resolve two ways. */
const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
/** The tools that load a TypeScript of their own, each looked up from a workspace project that declares it. */
const TOOLS = [
  ["tsup", "packages/contracts"],
  ["knip", "."],
  ["typescript-eslint", "."],
];

/**
 * pnpm-workspace.yaml, read as the block YAML pnpm writes: one entry a line, a nested block indented
 * under its key. Blank lines and comments are dropped. A block written another way (flow style,
 * `catalog: { ... }`) reads as empty, and the tests below then fail by name rather than pass on nothing.
 */
const lines = fs
  .readFileSync(path.join(ROOT, "pnpm-workspace.yaml"), "utf8")
  .split(/\r?\n/)
  .map((l) => l.replace(/\s+#.*$/, "").trimEnd())
  .filter((l) => l.trim() && !l.trimStart().startsWith("#"));
const indentOf = (l) => l.search(/\S/);
const unquote = (s) => s.trim().replace(/^(["'])(.*)\1$/, "$2");

/** The lines of a top-level block: those under `name:`, up to the next top-level key. */
function block(name) {
  const start = lines.indexOf(`${name}:`);
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => indentOf(l) === 0);
  return end < 0 ? rest : rest.slice(0, end);
}

/** A top-level `key: value`, unquoted; undefined when the key is absent or opens a block. */
function scalar(name) {
  const value = lines.find((l) => l.startsWith(`${name}:`))?.slice(name.length + 1);
  return value?.trim() ? unquote(value) : undefined;
}

/** A `key: value` line as [key, value]; the value is "" for a key that opens a block. */
function entry(l) {
  const m = /^\s*("[^"]*"|'[^']*'|[^\s"'][^:]*):(?:\s+(.*))?$/.exec(l);
  assert.ok(m, `pnpm-workspace.yaml: "${l.trim()}" is not a key and a value; this test reads block YAML`);
  return [unquote(m[1]), unquote(m[2] ?? "")];
}

/** Every `typescript` a catalog pins, with the catalog it is in: the default, or one named under `catalogs:`. */
function catalogPins() {
  const pins = [];
  const catalog = block("catalog");
  for (const l of catalog.filter((l) => indentOf(l) === indentOf(catalog[0]))) {
    const [name, version] = entry(l);
    if (name === TS) pins.push({ catalog: "default", version });
  }
  const named = block("catalogs");
  let current = null;
  for (const l of named) {
    const [key, value] = entry(l);
    if (indentOf(l) === indentOf(named[0])) current = key;
    else if (key === TS) pins.push({ catalog: current, version: value });
  }
  return pins;
}

/** The workspace's projects, as repo-relative directories: the root, and each match of `packages:`. */
function workspaceProjects() {
  const projects = ["."];
  for (const l of block("packages")) {
    const glob = unquote(l.trim().replace(/^-\s*/, ""));
    assert.match(glob, /^[\w.-]+(\/[\w.-]+)*(\/\*)?$/, `pnpm-workspace.yaml: teach this test the glob "${glob}"`);
    if (!glob.endsWith("/*")) {
      projects.push(glob);
      continue;
    }
    const parent = glob.slice(0, -2);
    for (const d of fs.readdirSync(path.join(ROOT, parent), { withFileTypes: true })) {
      if (d.isDirectory() && fs.existsSync(path.join(ROOT, parent, d.name, "package.json"))) {
        projects.push(`${parent}/${d.name}`);
      }
    }
  }
  return projects;
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const manifestPath = (project) => (project === "." ? "package.json" : `${project}/package.json`);
const manifest = (project) => readJson(path.join(ROOT, manifestPath(project)));
/** Each `typescript` a package.json names: the field and the specifier. */
const namesOf = (pkg) => FIELDS.filter((f) => pkg[f]?.[TS] !== undefined).map((f) => ({ field: f, spec: pkg[f][TS] }));

/**
 * The directory of the copy of `name` that `require` finds from `dir`: the nearest node_modules up the
 * tree that holds it, as node looks. Walked by hand, so the answer is the copy on disk, whatever the
 * test runner's loader would map a specifier to.
 */
function installed(name, dir) {
  for (let d = dir; ; d = path.dirname(d)) {
    const at = path.join(d, "node_modules", name);
    if (fs.existsSync(path.join(at, "package.json"))) return fs.realpathSync(at);
    if (path.dirname(d) === d) assert.fail(`${name} is not installed where ${path.relative(ROOT, dir) || "."} looks`);
  }
}
const versionAt = (dir) => readJson(path.join(dir, "package.json")).version;

const projects = workspaceProjects();

test("the measure sees the workspace: its projects, and the ones that name TypeScript", () => {
  assert.ok(projects.length >= 10, `read ${projects.length} projects from pnpm-workspace.yaml: ${projects.join(", ")}`);
  for (const p of ["apps/dashboard", "apps/edge", "apps/mobile", "packages/contracts", "tooling/scripts"]) {
    assert.ok(projects.includes(p), `${p} is a workspace project`);
  }
  const naming = projects.filter((p) => namesOf(manifest(p)).length > 0);
  assert.ok(naming.length >= 9, `${naming.length} projects name typescript: ${naming.join(", ")}`);
});

test("every workspace package.json that names typescript names it from the catalog, and the root names it", () => {
  const off = projects.flatMap((p) =>
    namesOf(manifest(p))
      .filter(({ spec }) => spec !== "catalog:")
      .map(({ field, spec }) => `${manifestPath(p)}: ${field}.typescript is "${spec}"`),
  );
  assert.deepEqual(off, [], 'name it "catalog:", so pnpm-workspace.yaml is the one place its version is written');
  // The root's own tools load it (typescript-eslint, knip, and the ratchets under this runner), so the root
  // declares it: a copy nobody declares is whichever one the hoister picked, which is how 6.0.3 got here.
  assert.ok(namesOf(manifest(".")).length > 0, "the root package.json names typescript");
});

test("the catalog pins exactly one TypeScript, at an exact version", () => {
  const pins = catalogPins();
  assert.deepEqual(
    pins.map((p) => p.catalog),
    ["default"],
    'one `typescript:` in pnpm-workspace.yaml, under `catalog:` (what "catalog:" names), and in no named catalog',
  );
  assert.match(pins[0].version, EXACT, `the catalog's typescript is "${pins[0].version}"; pin a version, not a range`);
  assert.equal(scalar("catalogMode"), "strict", "catalogMode: strict, so `pnpm add` cannot write a second version");
});

test("node_modules/typescript is the catalog's version", () => {
  const [pin] = catalogPins();
  assert.ok(pin, "the catalog pins typescript");
  assert.equal(versionAt(installed(TS, ROOT)), pin.version, "the install is not the catalog's: corepack pnpm install");
});

test("every project and every tool loads that one copy", () => {
  const root = installed(TS, ROOT);
  const others = [
    ...projects.map((p) => [p, installed(TS, path.join(ROOT, p))]),
    ...TOOLS.map(([tool, from]) => [tool, installed(TS, installed(tool, path.join(ROOT, from)))]),
  ]
    .filter(([, dir]) => dir !== root)
    .map(([who, dir]) => `${who} loads ${versionAt(dir)} from ${path.relative(ROOT, dir).split(path.sep).join("/")}`);
  assert.deepEqual(others, [], "a second copy is a second compiler: pnpm-lock.yaml says what pins it");
});
