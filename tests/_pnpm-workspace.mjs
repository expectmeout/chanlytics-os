/**
 * The workspace as pnpm-workspace.yaml declares it: its projects, its catalogs and its settings.
 *
 * Read as the block YAML pnpm writes: one entry a line, a nested block indented under its key. Blank lines and
 * comments are dropped. No YAML parser is a dependency here. A block written another way (flow style,
 * `catalog: { ... }`) reads as empty, so a test that asks for it fails by name rather than passing on nothing.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./_source.mjs";

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

/** A `key: value` line as [key, value]; the value is "" for a key that opens a block. */
function entry(l) {
  const m = /^\s*("[^"]*"|'[^']*'|[^\s"'][^:]*):(?:\s+(.*))?$/.exec(l);
  assert.ok(m, `pnpm-workspace.yaml: "${l.trim()}" is not a key and a value; _workspace.mjs reads block YAML`);
  return [unquote(m[1]), unquote(m[2] ?? "")];
}

/** A top-level setting, `name: value`, unquoted; undefined when the key is absent or opens a block. */
export function setting(name) {
  const value = lines.find((l) => l.startsWith(`${name}:`))?.slice(name.length + 1);
  return value?.trim() ? unquote(value) : undefined;
}

/** Every version a catalog pins for `dependency`, with the catalog it is in: the default, or one under `catalogs:`. */
export function catalogPins(dependency) {
  const pins = [];
  const catalog = block("catalog");
  for (const l of catalog.filter((l) => indentOf(l) === indentOf(catalog[0]))) {
    const [name, version] = entry(l);
    if (name === dependency) pins.push({ catalog: "default", version });
  }
  const named = block("catalogs");
  let current = null;
  for (const l of named) {
    const [key, value] = entry(l);
    if (indentOf(l) === indentOf(named[0])) current = key;
    else if (key === dependency) pins.push({ catalog: current, version: value });
  }
  return pins;
}

/** A top-level block of `key: value` lines (`overrides:`, `patchedDependencies:`) as an object; {} when absent. */
export function settingBlock(name) {
  return Object.fromEntries(block(name).map(entry));
}

/** The workspace's projects, as repo-relative directories: the root, and each match of `packages:`. */
export function workspaceProjects() {
  const projects = ["."];
  for (const l of block("packages")) {
    const glob = unquote(l.trim().replace(/^-\s*/, ""));
    assert.match(glob, /^[\w.-]+(\/[\w.-]+)*(\/\*)?$/, `pnpm-workspace.yaml: teach _workspace.mjs the glob "${glob}"`);
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
