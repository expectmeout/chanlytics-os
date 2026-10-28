#!/usr/bin/env node
/**
 * docs/tree.md: each code tree and the folders its modules are grouped in, by name, and last the schema's migrations.
 *
 * The drawing lived between two markers of docs/architecture.md, and 36 of the 60 changes to that page in the 30 days
 * to 28 October 2026 were its redrawing: a page two lanes edit in prose met in the lines a command wrote. Now it is a
 * file of its own that only this writes (decision 0074): `land` takes main's side of it in a conflict and writes it
 * again, as it does the API reference. It draws names, never counts, so a change redraws it when a folder appears or
 * disappears, and two branches that each add a module to the same folder leave it as it was.
 *
 *   node tooling/scripts/gen/docs-tree.mjs           # write it
 *   node tooling/scripts/gen/docs-tree.mjs --check   # exit 1 when it is stale
 *
 * docs/docs-tree.test.mjs holds the file to the tree.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { repoFiles } from "../tests/_ast.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const OUT = "docs/tree.md";

/** Where a directory's size is measured: everything hand-written, the tests included (_measures.mjs TREES). */
const TREES = () => repoFiles(["apps", "packages", "tooling/scripts", "e2e"]);

/**
 * The code trees the page draws, in its order, where PACKAGES stands for every package's src. Each is drawn with the
 * folders that hold its modules (tracked, hand-written, TypeScript or JavaScript), by name and never with a count.
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
  if (files.length === 0) throw new Error(`${tree} holds nothing to draw: DRAWN (gen/docs-tree.mjs) moves with its code`);
  const paths = files.map((f) => f.slice(tree.length + 1).split("/"));
  const folders = [...new Set(paths.filter((parts) => parts.length > 1).map((parts) => parts[0]))].sort();
  return [`${tree}/`, ...folders.map((folder) => `  ${folder}/`)];
}

/** Each code tree and its folders, by name, as a block of text. */
export function drawnTree() {
  const files = TREES();
  const packages = [...new Set(files.map((f) => /^packages\/[^/]+\/src(?=\/)/.exec(f)?.[0]).filter(Boolean))].sort();
  const trees = DRAWN.flatMap((tree) => (tree === PACKAGES ? packages : [tree]));
  const modulesUnder = (tree) => files.filter((f) => f.startsWith(`${tree}/`));
  const lines = trees.flatMap((tree) => drawn(tree, modulesUnder(tree)));
  lines.push(...drawn(MIGRATIONS, repoFiles([MIGRATIONS], { keep: /\.sql$/ })));
  return "```text\n" + lines.join("\n") + "\n```";
}

/** The file's whole text. */
export function treePage() {
  return [
    "# What is where",
    "",
    "Each code tree and the folders its modules are grouped in, by name, and last the schema's migrations. A folder is",
    "drawn when it holds a TypeScript or JavaScript file the repository tracks, less the built, generated and public ones.",
    "Written by `node tooling/scripts/gen/docs-tree.mjs`, never by hand; `docs/architecture.md` says what each tree is.",
    "",
    drawnTree(),
    "",
  ].join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = treePage();
  const file = path.join(ROOT, OUT);
  const was = fs.existsSync(file) ? fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n") : null;
  if (process.argv.includes("--check")) {
    if (was !== text) {
      console.error(`${OUT} is stale: node tooling/scripts/gen/docs-tree.mjs`);
      process.exit(1);
    }
  } else if (was !== text) {
    fs.writeFileSync(file, text);
    console.log(`wrote ${OUT}`);
  }
}
