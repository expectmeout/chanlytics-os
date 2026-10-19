#!/usr/bin/env node
/**
 * The browser's entry into contracts (decision 0024): packages/contracts/src/browser.generated.ts, every value the
 * package's barrels export whose module reaches no classic zod (except the PAGE_ONLY modules, which a page imports by
 * their own subpath), named from where the barrel names it.
 *
 * zod's classic API is one object a bundler cannot cut: a page that imports any schema written in it ships all of it,
 * 89 KB, and the whole index did, though no page parses with most of them. package.json's `browser` condition points
 * a page's bundle at this file instead, so a page carries the words, the view models and the rules, and the schemas
 * the routes parse with stay on the server. A schema a page does need is zod/mini (a list's rule, a page load's report)
 * or comes by import() from the write-rules entry (the Business tab's save rules, the waitlist's).
 *
 * Read from the source, never the dist: a module's runtime imports (a type-only import or export is not one), its
 * barrel's export lists, and whether any module it reaches imports `zod`, `zod/v4` or `zod/v4/classic`. `generate`
 * also says which modules the entry and the page entries reach (`modules`): contracts-browser.mjs builds those a file
 * each, so a page's bundle takes the modules it imports and no others (17 October 2026).
 *
 *   node tooling/scripts/gen/contracts-browser-entry.mjs          # write it
 *   node tooling/scripts/gen/contracts-browser-entry.mjs --check  # exit 1 when it is stale
 *
 * contracts/browser-entry.test.mjs regenerates it in memory on every run, refuses a stale copy, and holds every
 * value a page's module imports from contracts to a name the entry exports.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const OUT = "packages/contracts/src/browser.generated.ts";
const SRC = "packages/contracts/src";
/**
 * The modules only a page-only entry reads (package.json's `./report-window`, `./report-lens`, `./ads-page`), relative to SRC: their
 * names stay in the barrels, so the server and the tests read them from the index, and are left out of the browser's
 * entry. The page that draws them imports them by that subpath. (The entry was one module every page's route loaded
 * until 17 October 2026, which is why the list began; a file per module now keeps a page's own modules on that page
 * either way, and the list keeps their names off the root entry, which the frame's code reads.) Ask's whole table of
 * cards (ask-proposals/proposals.ts) is the server's alone: a page reads the verbs it presses from page-specs.ts, and
 * Ask's bridge loads the cards only Ask proposes by their own subpath, `./ask-only`. A path that names no
 * file under SRC filters nothing, silently, so `generate` refuses it.
 */
export const PAGE_ONLY = [
  "reports/report-metrics.ts",
  "reports/report-window.ts",
  "reports/report-mix.ts",
  "reports/receptionist/receptionist-report.ts",
  "reports/receptionist/receptionist-words.ts",
  "reports/people/people-report.ts",
  "reports/people/people-words.ts",
  "reports/campaigns/reach-out-lens.ts",
  "reports/campaigns/campaign-words.ts",
  "reports/campaigns/campaign-lens.ts",
  "ads/rules.ts",
  "ads/money.ts",
  "ads/words.ts",
  "ads/words-page.ts",
  "ads/words-drawer.ts",
  "ads/words-new.ts",
  "ads/results/words-results.ts",
  "ads/results/results.ts",
  "ads/words-connect.ts",
  "ads/vm-base.ts",
  "ads/page.ts",
  "ads/page-parts.ts",
  "ads/drawer.ts",
  "ads/drawer-parts.ts",
  "ads/drawer-edit.ts",
  "ads/new-ad.ts",
  "ads/new-ad-parts.ts",
  "ask-proposals/proposals.ts",
];
/**
 * The entries a page imports by their own subpath (package.json's `./report-window`, `./report-lens`, `./ads-page`,
 * `./alert-pane`, `./ask-only`), by the module each is. The browser's build (contracts-browser.mjs) writes them a file
 * per module beside the root entry's, and their `browser` condition names that file, so a page that loads one shares
 * every module it reaches with the rest of the page instead of carrying its own copy. None may reach classic zod.
 * `./page-specs` is the specs of the verbs the pages press, which the frame fetches when a press or Ask first needs
 * one (legacy-bridge/verbs/commit.ts pageSpecs): its names stay in the root entry as well, since its module must be the
 * root's own (Ask's kinds join its table in place), and on the server and in the tests it is the index itself.
 */
export const PAGE_ENTRIES = {
  "report-window": "reports/report-window.ts",
  "report-lens": "reports/report-lens.ts",
  "ads-page": "ads/ads-page.ts",
  "page-specs": "ask-proposals/page-specs.ts",
};
/** The specifiers that load zod's classic API. zod/mini and zod/v4/core share its core and are cut by the bundler. */
const CLASSIC_ZOD = new Set(["zod", "zod/v4", "zod/v4/classic"]);

const norm = (p) => p.split(path.sep).join("/");

/** Whether an import or export statement carries a value at run time. */
function runtime(st) {
  if (ts.isImportDeclaration(st)) {
    const c = st.importClause;
    if (!c) return true; // a bare `import "x"` runs x
    if (c.isTypeOnly) return false;
    if (c.name) return true;
    const b = c.namedBindings;
    if (!b || ts.isNamespaceImport(b)) return true;
    return b.elements.length === 0 || b.elements.some((e) => !e.isTypeOnly);
  }
  if (ts.isExportDeclaration(st)) {
    if (st.isTypeOnly) return false;
    const c = st.exportClause;
    return !c || !ts.isNamedExports(c) || c.elements.length === 0 || c.elements.some((e) => !e.isTypeOnly);
  }
  return false;
}

/** contracts' runtime import graph: each module's relative imports, and whether it imports classic zod itself. */
function graph(root) {
  const dir = path.join(root, SRC);
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.ts$/.test(e.name) && !/\.(type-test|test|d)\.ts$/.test(e.name) && e.name !== "browser.generated.ts")
        files.push(p);
    }
  })(dir);
  const resolve = (from, spec) => {
    const base = path.resolve(path.dirname(from), spec);
    for (const ext of [".ts", "/index.ts"]) if (fs.existsSync(base + ext)) return path.normalize(base + ext);
    throw new Error(`${norm(path.relative(root, from))}: "${spec}" resolves to no module`);
  };
  const deps = new Map();
  const classic = new Set();
  const parsed = new Map();
  for (const f of files) {
    const sf = ts.createSourceFile(f, fs.readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true);
    parsed.set(f, sf);
    const out = [];
    for (const st of sf.statements) {
      if (!(ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) || !st.moduleSpecifier) continue;
      if (!runtime(st)) continue;
      const spec = st.moduleSpecifier.text;
      if (spec.startsWith(".")) out.push(resolve(f, spec));
      else if (CLASSIC_ZOD.has(spec)) classic.add(f);
    }
    deps.set(f, out);
  }
  // Whether a module reaches classic zod through its runtime imports, cycles and all: grown from the modules that
  // import it until no module joins.
  const reaches = new Set(classic);
  for (let grew = true; grew;) {
    grew = false;
    for (const f of files) {
      if (!reaches.has(f) && deps.get(f).some((d) => reaches.has(d))) {
        reaches.add(f);
        grew = true;
      }
    }
  }
  return { dir, parsed, deps, reaches, resolve };
}

/**
 * The module that defines a name a module exports, and its name there: a re-export (`export { a } from "./x"`, or an
 * import exported again) is followed to where the binding is made, so the entry names the module that makes it and a
 * page's bundle never holds the modules it passed through.
 */
function origin(g, module, name, seen = new Set()) {
  const key = `${module}#${name}`;
  if (seen.has(key)) return { module, from: name };
  seen.add(key);
  const sf = g.parsed.get(module);
  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause)) {
      for (const el of st.exportClause.elements) {
        if (el.name.text !== name) continue;
        const local = (el.propertyName ?? el.name).text;
        if (st.moduleSpecifier) return origin(g, g.resolve(module, st.moduleSpecifier.text), local, seen);
        // `export { local }`: an import exported again, or the module's own binding.
        for (const im of sf.statements) {
          const b = ts.isImportDeclaration(im) ? im.importClause?.namedBindings : null;
          if (!b || !ts.isNamedImports(b) || !im.moduleSpecifier.text.startsWith(".")) continue;
          const hit = b.elements.find((e) => e.name.text === local);
          if (hit)
            return origin(g, g.resolve(module, im.moduleSpecifier.text), (hit.propertyName ?? hit.name).text, seen);
        }
        return { module, from: local };
      }
    }
  }
  return { module, from: name };
}

/** Every value the barrels export: the barrel's own name for it, and the module that defines it with its name there. */
function barrelValues(root, g) {
  const index = path.join(g.dir, "index.ts");
  const values = [];
  for (const st of g.parsed.get(index).statements) {
    if (!ts.isExportDeclaration(st) || !st.moduleSpecifier) continue;
    if (st.exportClause) throw new Error("the root index names its domains with `export *`, and nothing else");
    const barrel = g.resolve(index, st.moduleSpecifier.text);
    for (const ex of g.parsed.get(barrel).statements) {
      if (!ts.isExportDeclaration(ex) || ex.isTypeOnly) continue;
      if (!ex.moduleSpecifier || !ex.exportClause || !ts.isNamedExports(ex.exportClause))
        throw new Error(`${norm(path.relative(root, barrel))}: a barrel names what it exports, never \`export *\``);
      const module = g.resolve(barrel, ex.moduleSpecifier.text);
      for (const el of ex.exportClause.elements) {
        if (el.isTypeOnly) continue;
        values.push({ name: el.name.text, ...origin(g, module, (el.propertyName ?? el.name).text) });
      }
    }
  }
  return values;
}

/**
 * Whether `rel` ("reports/report-metrics.ts") is a file under `dir`, each segment spelled exactly as the directory lists it:
 * `existsSync` is true for a folder, and on Windows for a path in the wrong case, which `generate` then compares to a
 * module's path by string and would never match.
 */
function isExactFile(dir, rel) {
  try {
    let at = dir;
    for (const segment of rel.split("/")) {
      if (!fs.readdirSync(at).includes(segment)) return false;
      at = path.join(at, segment);
    }
    return fs.statSync(at).isFile();
  } catch {
    return false; // a segment under a file
  }
}

/** `pageOnly` is the PAGE_ONLY list; a test passes its own to see a stale path refused. */
export function generate(root, pageOnly = PAGE_ONLY) {
  for (const p of pageOnly) {
    if (!isExactFile(path.join(root, SRC), p))
      throw new Error(
        `PAGE_ONLY names "${p}", which is no file under ${SRC} (spelled as it is on disk): it would filter nothing`,
      );
  }
  const g = graph(root);
  const values = barrelValues(root, g);
  const kept = new Map();
  const left = [];
  // A name two barrels both export is one binding, which index.ts's `export *` exports once: the first barrel's.
  const named = new Map();
  for (const v of values) {
    const first = named.get(v.name);
    if (first) {
      if (first.module !== v.module || first.from !== v.from)
        throw new Error(
          `two barrels export ${v.name} from different modules, which index.ts's \`export *\` leaves out`,
        );
      continue;
    }
    named.set(v.name, v);
    if (pageOnly.includes(norm(path.relative(g.dir, v.module)))) continue;
    if (g.reaches.has(v.module)) {
      left.push(v.name);
      continue;
    }
    const spec = `./${norm(path.relative(g.dir, v.module)).replace(/\.ts$/, "")}`;
    if (!kept.has(spec)) kept.set(spec, []);
    kept.get(spec).push(v.from === v.name ? v.name : `${v.from} as ${v.name}`);
  }
  // Every module the entry and the page entries reach through their runtime imports, zod's setting first: what
  // contracts-browser.mjs builds a file each, so a page's bundle takes the modules it imports and no others.
  const modules = new Set();
  const reach = (f) => {
    if (modules.has(f)) return;
    modules.add(f);
    for (const d of g.deps.get(f)) reach(d);
  };
  reach(path.join(g.dir, "zod-config.ts"));
  for (const spec of kept.keys()) reach(path.join(g.dir, `${spec.slice(2)}.ts`));
  for (const [name, rel] of Object.entries(PAGE_ENTRIES)) {
    const f = path.join(g.dir, rel);
    if (g.reaches.has(f)) throw new Error(`the page entry ./${name} (${rel}) reaches classic zod`);
    reach(f);
  }
  const lines = [
    "/* Generated by tooling/scripts/gen/contracts-browser-entry.mjs from the barrels -- do not edit. */",
    "",
    "/**",
    " * The browser's entry (decision 0024): every value the package exports whose module reaches no classic zod, except the",
    " * PAGE_ONLY modules, which a page imports by their own subpath, so a page that reads a word, a view model or a rule",
    " * loads none of it. package.json's `browser` condition points a page's bundle here; the server, the edge and the",
    " * tests read index.ts. A page that needs a classic schema asks the write-rules entry for it by import().",
    " */",
    "// First, before any schema below is built: zod-config.ts says why the order matters.",
    'import "./zod-config";',
    ...[...kept.keys()].sort().map((spec) => `export { ${kept.get(spec).join(", ")} } from "${spec}";`),
    "",
  ];
  return {
    text: lines.join("\n"),
    names: [...kept.values()].flat().map((n) => n.split(" as ").pop()),
    left,
    modules: [...modules].map((f) => norm(path.relative(g.dir, f))).sort(),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const { text, names, left } = generate(root);
  const file = path.join(root, OUT);
  if (process.argv.includes("--check")) {
    const fresh = fs.existsSync(file) && fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n") === text;
    console.log(
      fresh
        ? "contracts' browser entry: current"
        : `contracts' browser entry: STALE (${OUT}) — run node tooling/scripts/gen/contracts-browser-entry.mjs`,
    );
    process.exit(fresh ? 0 : 1);
  }
  fs.writeFileSync(file, text);
  console.log(`wrote ${OUT}: ${names.length} values; ${left.length} left to the server (classic zod behind them)`);
}
