#!/usr/bin/env node
/**
 * contracts' browser entry, built a module a file (decision 0024, "Each page loads its own", 17 October 2026).
 *
 * The entry was one bundled module (`dist/browser.js`), and a bundler cannot cut a module across pages: every value any
 * page imported from contracts sat in the route's chunk, which every page loads, 339,619 of the route's 857,745 bytes
 * gzipped at `f6e2b8b80`. Built a file per source module instead, under `dist/browser/`, with the entry a list of
 * re-exports (`dist/browser/index.js`, from `src/browser.generated.ts`) and the package's `sideEffects` saying that no
 * file there but zod's setting runs anything as it loads, a page's bundle takes the modules it imports and the ones they
 * import, and nothing else: what one page alone draws rides in that page's chunk, and what every page draws in the
 * route's.
 *
 * Each module is compiled alone (esbuild's transform, as `verbatimModuleSyntax` and `isolatedModules` allow), with each
 * relative import written out to the file it names (`./lead-card` becomes `./lead-card.js`, `../shell` becomes
 * `../shell/index.js`), since a bundler reads a `type: module` package's imports as they are spelled. The modules are
 * the ones the entry reaches (gen/contracts-browser-entry.mjs `generate().modules`), so none reaches classic zod. The
 * folder is written whole each time, so a module gone from the entry leaves no file behind.
 *
 *   node tooling/scripts/contracts-browser.mjs     # contracts' build runs it after tsup
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";
import ts from "typescript";
import { generate, OUT } from "./gen/contracts-browser-entry.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(ROOT, "packages/contracts/src");
export const BROWSER_DIR = "packages/contracts/dist/browser";
/** The one module of the entry that runs something as it loads: package.json's `sideEffects` names its file. */
export const BROWSER_EFFECTS = ["zod-config.ts"];

const norm = (p) => p.split(path.sep).join("/");

/** The file a relative specifier names from `from`: a module, or a folder's index. */
function target(from, spec) {
  const base = path.resolve(path.dirname(from), spec);
  for (const ext of [".ts", "/index.ts"]) if (fs.existsSync(base + ext)) return base + ext;
  throw new Error(`${norm(path.relative(ROOT, from))}: "${spec}" resolves to no module`);
}

/** A module's source with each relative import and export spelled as the built file it names. */
function fullySpecified(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const edits = [];
  const visit = (node) => {
    const spec =
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
        ? node.moduleSpecifier
        : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
          ? node.arguments[0]
          : null;
    if (spec && ts.isStringLiteral(spec) && spec.text.startsWith(".")) {
      let rel = norm(path.relative(path.dirname(file), target(file, spec.text))).replace(/\.ts$/, ".js");
      if (!rel.startsWith(".")) rel = `./${rel}`;
      edits.push({ at: spec.getStart(sf), end: spec.getEnd(), to: JSON.stringify(rel) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  let out = text;
  for (const e of edits.sort((a, b) => b.at - a.at)) out = out.slice(0, e.at) + e.to + out.slice(e.end);
  return out;
}

/** One module, compiled alone: TypeScript's syntax gone, its imports as written above, ES2022 as the index's build. */
function compile(file, text) {
  const { code } = transformSync(fullySpecified(file, text), {
    // No `format`: given one, esbuild links the module itself and writes each re-export as an import and an export.
    loader: "ts",
    target: "es2022",
    // As tsconfig.base.json says: what is written is kept, so a re-export stays `export { x } from`, which a bundler
    // follows to the module that makes x without loading the entry's others.
    tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: true } },
    sourcefile: norm(path.relative(ROOT, file)),
  });
  return code;
}

/** Every file of the browser's build, by its path under BROWSER_DIR: each module the entry reaches, and the entry. */
export function browserFiles(root = ROOT) {
  const { modules } = generate(root);
  // The entry is the folder's index.js: the server's index reaches classic zod, so it is never one of the modules.
  if (modules.includes("index.ts"))
    throw new Error("the browser's entry reaches contracts' index, which loads classic zod");
  const out = new Map();
  for (const rel of modules) {
    const file = path.join(SRC, rel);
    out.set(rel.replace(/\.ts$/, ".js"), compile(file, fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n")));
  }
  const entry = path.join(root, OUT);
  out.set("index.js", compile(entry, fs.readFileSync(entry, "utf8").replace(/\r\n/g, "\n")));
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.join(ROOT, BROWSER_DIR);
  const files = browserFiles();
  fs.rmSync(dir, { recursive: true, force: true });
  for (const [rel, code] of files) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, code);
  }
  console.log(`wrote ${BROWSER_DIR}: ${files.size} files, a module each and the entry`);
}
