/**
 * What each test reaches: every file a change to which can break it, read from the syntax tree (the graph rule of
 * tooling/scripts/checks/changed-tests.mjs). Five tests went red on main on 28 Oct 2026, each importing, directly or
 * through a package, the module a pull request had changed, and none in a folder that pull request's paths named.
 *
 * A test reaches what it imports, and what that imports, as the suite loads it:
 *   - a relative specifier, `@/` (the dashboard's src, by the root tsconfig's paths, as tsx reads them) and a
 *     `@chanlytics/<p>` specifier, which the suite loads as the package's bundle (the `bundled` condition) and which is
 *     followed here into the sources that bundle is built from, the manifest's `import` target beside it;
 *   - a static import, a re-export, a literal `import()` and a `require()`; a type-only import reaches nothing;
 *   - through a barrel, by name: `import { appLink } from "@chanlytics/contracts"` reaches the barrels on the way and
 *     the module that defines appLink, with that module's own imports, never the other modules the barrels name. A
 *     namespace import (`import * as`), a side-effect import, or `import()` with nothing destructured reaches all of it.
 * In the suite and the scripts it runs (tooling/, apps/mobile/test), a string that names a tracked file reaches it too,
 * repo-relative or relative to the file that says it, so `importSrc("apps/…")`, `readCode("apps/…")`, `at("…")` and
 * `path.join(ROOT, "packages/core/dist/index.js")` (a bundle, read as its sources) are seen without naming any helper;
 * a template whose parts are constants of the file is folded first. A test that reads a file's text breaks when the
 * text changes, as one that runs it does. A string naming a directory is not followed: a test that reads a tree whole
 * says so in changed-tests.mjs READ_BY.
 *
 * What it does not see, so changed-tests.mjs keeps it: a module only evaluated, never named (a bundle evaluates every
 * module of its package, and one that throws at load breaks every test of the package; the typecheck and the nightly
 * hold that), a path built at run time from parts it cannot fold, and a tree read whole.
 *
 * The distance it gives is the number of imports between the test and the changed file, a barrel's re-export counting
 * none: a test that imports a changed module's export is at 1, one that changed itself at 0.
 */
import path from "node:path";
import ts from "typescript";

const posix = path.posix;

/** The suite's tests: tooling/scripts/checks/test.mjs SUITES.test. */
export const isTest = (file) =>
  /^tooling\/scripts\/tests\/.+\.test\.mjs$/.test(file) || /^apps\/mobile\/test\/[^/]+\.test\.mjs$/.test(file);

/** Code whose strings name what it reads: the suite and the scripts it runs, never the code that ships. */
const READS_BY_NAME = /^(tooling\/|apps\/mobile\/test\/)/;
const CODE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
/** A string that may be a path: no space, not a URL, short. */
const PATHLIKE = /^[\w@.[\]()-][\w@.[\]()/-]*$/;
/** An unresolved one kept as a name a deleted file may be asked by: a path into the tree, or relative. */
const INTO_THE_TREE = /^(\.{1,2}\/|apps\/|packages\/|tooling\/|supabase\/|docs\/|e2e\/)/;
const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs", ".json"];

const kindOf = (file) =>
  file.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : file.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : /\.[mc]?ts$/.test(file)
        ? ts.ScriptKind.TS
        : ts.ScriptKind.JS;

const textOf = (node) =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;

const hasModifier = (node, kind) =>
  (ts.canHaveModifiers(node) ? ts.getModifiers(node) : [])?.some((m) => m.kind === kind);

/** The identifiers a declaration binds, through any destructuring. */
function boundNames(name, out = []) {
  if (ts.isIdentifier(name)) out.push(name.text);
  else for (const el of name.elements) if (!ts.isOmittedExpression(el)) boundNames(el.name, out);
  return out;
}

/** An import declaration's names: what it binds locally, and what it asks of the module (null: all of it). */
function importOf(st, m, bound) {
  const spec = textOf(st.moduleSpecifier);
  const clause = st.importClause;
  if (!spec || clause?.isTypeOnly) return;
  if (!clause) return void m.always.push({ spec, names: null });
  const names = [];
  if (clause.name) {
    names.push("default");
    bound.set(clause.name.text, { spec, name: "default" });
  }
  const b = clause.namedBindings;
  if (b && ts.isNamespaceImport(b)) bound.set(b.name.text, { spec, name: null });
  for (const el of b && ts.isNamedImports(b) ? b.elements : []) {
    if (el.isTypeOnly) continue;
    const name = (el.propertyName ?? el.name).text;
    names.push(name);
    bound.set(el.name.text, { spec, name });
  }
  if (b && ts.isNamespaceImport(b)) m.body.push({ spec, names: null });
  else if (names.length) m.body.push({ spec, names });
}

/** An export declaration: a re-export by name or of everything, or a local's name. */
function exportOf(st, m, bound) {
  if (st.isTypeOnly) return;
  const spec = textOf(st.moduleSpecifier);
  const clause = st.exportClause;
  if (spec && !clause) return void m.stars.push(spec);
  if (spec && ts.isNamespaceExport(clause)) return void m.named.set(clause.name.text, { spec, name: null });
  for (const el of clause && ts.isNamedExports(clause) ? clause.elements : []) {
    if (el.isTypeOnly) continue;
    const local = (el.propertyName ?? el.name).text;
    if (spec) m.named.set(el.name.text, { spec, name: local });
    else if (bound.has(local)) m.named.set(el.name.text, bound.get(local));
    else m.locals.add(el.name.text);
  }
}

/** A declaration's exported names. */
function localsOf(st, m) {
  if (ts.isExportAssignment(st)) return void m.locals.add("default");
  if (!hasModifier(st, ts.SyntaxKind.ExportKeyword)) return;
  if (ts.isVariableStatement(st))
    for (const d of st.declarationList.declarations) for (const n of boundNames(d.name)) m.locals.add(n);
  else if (hasModifier(st, ts.SyntaxKind.DefaultKeyword)) m.locals.add("default");
  else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) && st.name)
    m.locals.add(st.name.text);
}

/** What `import()` asks of a module: the names destructured from it, or null for all of it. */
function askedOf(call) {
  let p = call.parent;
  if (p && ts.isAwaitExpression(p)) p = p.parent;
  if (p && ts.isParenthesizedExpression(p) && ts.isPropertyAccessExpression(p.parent)) return [p.parent.name.text];
  if (!p || !ts.isVariableDeclaration(p) || !ts.isObjectBindingPattern(p.name)) return null;
  const names = [];
  for (const el of p.name.elements) {
    const key = el.propertyName ?? el.name;
    if (el.dotDotDotToken || !ts.isIdentifier(key)) return null;
    names.push(key.text);
  }
  return names;
}

/** A template whose every part is a literal or a constant of the file, as the string it is; else null. */
function folded(node, consts) {
  const plain = textOf(node);
  if (plain !== null) return plain;
  if (ts.isIdentifier(node)) return consts.get(node.text) ?? null;
  if (!ts.isTemplateExpression(node)) return null;
  let out = node.head.text;
  for (const span of node.templateSpans) {
    const part = folded(span.expression, consts);
    if (part === null) return null;
    out += part + span.literal.text;
  }
  return out;
}

/** The file's constant strings, by name: `const S = "apps/…"`, and templates of them. */
function constsOf(sf) {
  const consts = new Map();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const value = folded(node.initializer, consts);
      if (value !== null) consts.set(node.name.text, value);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return consts;
}

/**
 * One module as its syntax tree says it: what its body imports (`body`, and `always`, the side-effect imports any
 * request of it runs), what it re-exports by name (`named`) and whole (`stars`), the names it defines (`locals`) and,
 * for code that reads by name, the path-like strings it says (`literals`).
 */
function scanModule(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kindOf(file));
  const m = { body: [], always: [], named: new Map(), stars: [], locals: new Set(), literals: [] };
  const bound = new Map();
  for (const st of sf.statements) if (ts.isImportDeclaration(st)) importOf(st, m, bound);
  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st)) exportOf(st, m, bound);
    else localsOf(st, m);
  }
  const byName = READS_BY_NAME.test(file);
  const consts = byName ? constsOf(sf) : new Map();
  const specifiers = new Set();
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) specifiers.add(node.moduleSpecifier);
    } else if (ts.isCallExpression(node) && node.arguments.length) {
      const spec = textOf(node.arguments[0]);
      const isImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      if (spec && (isImport || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
        m.body.push({ spec, names: isImport ? askedOf(node) : null });
        specifiers.add(node.arguments[0]);
      }
    } else if (byName && !specifiers.has(node) && (textOf(node) !== null || ts.isTemplateExpression(node))) {
      const said = folded(node, consts);
      if (said !== null && said.length < 300 && PATHLIKE.test(said)) m.literals.push(said);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return m;
}

/** Each workspace package's specifiers, each to the source its bundle is built from, and each bundle's path likewise. */
function packagesOf(files, read) {
  const specs = new Map();
  const bundles = new Map();
  for (const file of files) {
    if (!/^packages\/[^/]+\/package\.json$/.test(file)) continue;
    const dir = posix.dirname(file);
    let manifest;
    try {
      manifest = JSON.parse(read(file));
    } catch {
      continue;
    }
    for (const [sub, target] of Object.entries(manifest.exports ?? {})) {
      const source = typeof target === "string" ? target : (target.import ?? target.default);
      if (typeof source !== "string") continue;
      const entry = posix.join(dir, source);
      specs.set(sub === "." ? manifest.name : `${manifest.name}/${sub.slice(2)}`, { entry, manifest: file });
      if (typeof target === "object" && target.bundled) bundles.set(posix.join(dir, target.bundled), entry);
    }
  }
  return { specs, bundles };
}

/** The files a module path may be, in the order the resolvers try them. */
function candidatesOf(base) {
  const out = [base];
  const js = /\.(m?)js(x?)$/.exec(base);
  if (js) out.push(`${base.slice(0, -js[0].length)}.${js[1]}ts${js[2]}`, `${base.slice(0, -js[0].length)}.tsx`);
  for (const e of EXTENSIONS) out.push(base + e);
  for (const e of EXTENSIONS) out.push(`${base}/index${e}`);
  return out;
}

/** The names an import may ask a deleted file by: without its extension, as JavaScript, its folder for an index. */
function aliasesOf(file) {
  const stem = file.replace(/\.[^./]+$/, "");
  const out = [stem, `${stem}.js`, `${stem}.mjs`, `${stem}.jsx`];
  if (posix.basename(stem) === "index") out.push(posix.dirname(stem));
  return out;
}

/** How a specifier or a said path becomes a file: [{ file, names }] (several for a package: its source and manifest). */
function resolverOf(fileSet, read) {
  const { specs, bundles } = packagesOf(fileSet, read);
  // A module no file answers: the name a deleted file may be asked by (aliasesOf), never a path said as a string.
  const unanswered = new Set();
  const asModule = (base) => {
    const hit = candidatesOf(base).find((c) => fileSet.has(c));
    if (!hit) unanswered.add(base);
    return hit ?? base;
  };
  const asPath = (said) => bundles.get(said) ?? (fileSet.has(said) ? said : null);
  const at = (from, said) => {
    if (said.startsWith("./") || said.startsWith("../")) return asPath(posix.join(posix.dirname(from), said));
    return asPath(posix.normalize(said)) ?? asPath(posix.join(posix.dirname(from), said));
  };
  return {
    unanswered,
    specifier(from, spec, names) {
      const pkg = /^@chanlytics\/[a-z]+(\/[a-z-]+)?$/.test(spec) ? specs.get(spec) : null;
      if (pkg)
        return [
          { file: pkg.entry, names },
          { file: pkg.manifest, names: null },
        ];
      if (spec.startsWith("@/")) return [{ file: asModule(`apps/dashboard/src/${spec.slice(2)}`), names }];
      if (!spec.startsWith("./") && !spec.startsWith("../")) return [];
      return [{ file: asModule(posix.join(posix.dirname(from), spec)), names }];
    },
    literal(from, said) {
      const hit = at(from, said);
      if (hit) return [{ file: hit, names: null }];
      if (!INTO_THE_TREE.test(said)) return [];
      const relative = said.startsWith("./") || said.startsWith("../");
      return [{ file: relative ? posix.join(posix.dirname(from), said) : posix.normalize(said), names: null }];
    },
  };
}

const EMPTY = { body: [], always: [], named: new Map(), stars: [], locals: new Set() };
const key = (file, part) => `${file}\0${part}`;
const fileOfKey = (k) => k.slice(0, k.indexOf("\0"));

/**
 * The graph over a tree of files: `files`, the repository's paths, and `read(file)`, a file's text. Each node is a
 * module, or one name of a barrel on the way to the module that defines it; built once from every test.
 */
export function reachOf({ files, read }) {
  const fileSet = new Set(files);
  const resolve = resolverOf(fileSet, read);
  const modules = new Map();

  function moduleOf(file) {
    if (modules.has(file)) return modules.get(file);
    let m = EMPTY;
    if (CODE.test(file) && fileSet.has(file)) {
      const scanned = scanModule(file, read(file));
      const to = ({ spec, names }) => resolve.specifier(file, spec, names);
      m = {
        body: [...scanned.body.flatMap(to), ...scanned.literals.flatMap((s) => resolve.literal(file, s))],
        always: scanned.always.flatMap(to),
        named: new Map(
          [...scanned.named].map(([n, { spec, name }]) => [n, to({ spec, names: name === null ? null : [name] })]),
        ),
        stars: scanned.stars.flatMap((spec) => resolve.specifier(file, spec, null)),
        locals: scanned.locals,
      };
    }
    modules.set(file, m);
    return m;
  }

  const exported = new Map();
  /** Every name a module exports, through its stars. */
  function exportsOf(file) {
    if (exported.has(file)) return exported.get(file);
    const names = new Set();
    exported.set(file, names);
    const m = moduleOf(file);
    for (const n of [...m.locals, ...m.named.keys()]) names.add(n);
    for (const s of m.stars) for (const n of exportsOf(s.file)) if (n !== "default") names.add(n);
    return names;
  }

  /** The node a request of a module is: all of it ("*"), its body (""), or a name it passes on. */
  function nodeOf(file, name) {
    if (name === null) return key(file, "*");
    const m = moduleOf(file);
    if (m.named.has(name) || (!m.locals.has(name) && m.stars.some((s) => exportsOf(s.file).has(name))))
      return key(file, name);
    return key(file, "");
  }

  const toNodes = (refs, weight) =>
    refs.flatMap(({ file, names }) =>
      names === null ? [[nodeOf(file, null), weight]] : names.map((n) => [nodeOf(file, n), weight]),
    );

  function edgesOf(k) {
    const file = fileOfKey(k);
    const part = k.slice(file.length + 1);
    const m = moduleOf(file);
    const out = toNodes(m.always, 1);
    if (part === "" || part === "*") out.push(...toNodes(m.body, 1));
    if (part === "*") {
      for (const refs of m.named.values()) out.push(...toNodes(refs, 0));
      out.push(...toNodes(m.stars, 0));
    } else if (m.named.has(part)) out.push(...toNodes(m.named.get(part), 0));
    else if (part !== "") {
      const stars = m.stars.filter((s) => exportsOf(s.file).has(part));
      out.push(
        ...toNodes(
          stars.map((s) => ({ file: s.file, names: [part] })),
          0,
        ),
      );
    }
    return out;
  }

  const tests = files.filter(isTest);
  const into = new Map();
  const byFile = new Map();
  const seen = new Set();
  const queue = tests.map((t) => key(t, "*"));
  for (const k of queue) seen.add(k);
  while (queue.length) {
    const k = queue.pop();
    const file = fileOfKey(k);
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(k);
    for (const [to, weight] of edgesOf(k)) {
      if (!into.has(to)) into.set(to, []);
      into.get(to).push([k, weight]);
      if (!seen.has(to)) {
        seen.add(to);
        queue.push(to);
      }
    }
  }

  return {
    tests,
    /** Each test whose closure reaches one of `changed`, with its distance from the nearest. */
    testsReaching(changed) {
      const dist = new Map();
      const buckets = [[]];
      const asked = changed.flatMap((file) => [file, ...aliasesOf(file).filter((a) => resolve.unanswered.has(a))]);
      for (const k of asked.flatMap((file) => byFile.get(file) ?? [])) {
        dist.set(k, 0);
        buckets[0].push(k);
      }
      // Backwards along the imports, nearest first: a re-export costs nothing, an import one.
      for (let d = 0; d < buckets.length; d++)
        for (let i = 0; i < buckets[d].length; i++) {
          const k = buckets[d][i];
          if (dist.get(k) < d) continue;
          for (const [from, weight] of into.get(k) ?? []) {
            if ((dist.get(from) ?? Infinity) <= d + weight) continue;
            dist.set(from, d + weight);
            (buckets[d + weight] ??= []).push(from);
          }
        }
      const reached = new Map();
      for (const t of tests) if (dist.has(key(t, "*"))) reached.set(t, dist.get(key(t, "*")));
      return reached;
    },
  };
}
