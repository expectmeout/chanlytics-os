/**
 * Which way the code's dependencies run, measured from the syntax tree: the numbers check:debt holds (BOUNDARY_RATCHETS) and the
 * rules boundaries.test.mjs holds outright (decision 0110).
 *
 * An import running both ways costs a reader the map: nothing can be read or changed alone. So the packages have a written order, a backend
 * tree's domains lean one way, what a tree shares leans on no domain, and a package holds what two trees use. The browser's trees and contracts'
 * folders still lean both ways, and are counted here so they can only fall: the browser's are the frontend pillar's, contracts' are the API layer's.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { ROOT } from "../../_source.mjs";
import { repoFiles, parse } from "../../_ast.mjs";
import { longDoors } from "../size/_size.mjs";

/** The packages' order: each leans only on those named beside it. Written once, as docs/architecture.md shows it. */
export const PACKAGE_MAP = {
  log: [],
  contracts: [],
  db: ["contracts"],
  channels: ["contracts", "log"],
  core: ["channels", "contracts", "db", "log"],
  jobs: ["channels", "contracts", "core", "db", "log"],
};

/** A tree whose top folders are domains. */
export const DOMAIN_TREES = {
  contracts: "packages/contracts/src",
  core: "packages/core/src",
  db: "packages/db/src/repositories",
  channels: "packages/channels/src",
  jobs: "packages/jobs/src",
  edge: "apps/edge/lib",
  server: "apps/dashboard/src/server",
  surfaces: "apps/dashboard/src/surfaces",
};
/** The trees whose domains lean one way, outright. */
export const ONE_WAY_TREES = ["core", "db", "channels", "jobs", "edge", "server"];
/** The trees held by a number until their own layer: contracts' folders (the API's), the browser's (the frontend pillar's). */
export const COUNTED_TREES = ["contracts", "surfaces"];
/** Where no value import may run in a circle, outright. */
const BACKEND = [/^packages\//, /^apps\/edge\//, /^apps\/dashboard\/src\/server\//, /^apps\/dashboard\/app\/api\//];

const SOURCE = /\.tsx?$/;
const NOT = /\.d\.ts$|\.generated\.|database\.types\.ts$|\.type-test\.|(^|\/)test\/|\.test\./;
const modules = () =>
  repoFiles(["packages", "apps/edge", "apps/dashboard/src", "apps/dashboard/app"]).filter(
    (f) => SOURCE.test(f) && !NOT.test(f),
  );

/** A statement's module, and whether the import carries a value at run time. */
function importsOfModule(file) {
  const out = [];
  for (const st of parse(file).statements) {
    if (
      !(ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) ||
      !st.moduleSpecifier ||
      !ts.isStringLiteral(st.moduleSpecifier)
    )
      continue;
    let typeOnly;
    if (ts.isImportDeclaration(st)) {
      const c = st.importClause;
      typeOnly =
        Boolean(c?.isTypeOnly) ||
        Boolean(
          c?.namedBindings &&
          ts.isNamedImports(c.namedBindings) &&
          !c.name &&
          c.namedBindings.elements.length > 0 &&
          c.namedBindings.elements.every((e) => e.isTypeOnly),
        );
    } else typeOnly = st.isTypeOnly;
    out.push({ specifier: st.moduleSpecifier.text, typeOnly });
  }
  return out;
}

/** The module a relative or `@/` specifier names, or null for a package. */
function resolver(known) {
  const hit = (b) =>
    [
      b,
      `${b}.ts`,
      `${b}.tsx`,
      `${b}/index.ts`,
      `${b}/index.tsx`,
      b.replace(/\.js$/, ".ts"),
      b.replace(/\.js$/, ".tsx"),
    ].find((c) => known.has(c)) ?? null;
  return (spec, from) => {
    if (spec.startsWith("@/")) return hit(`apps/dashboard/src/${spec.slice(2)}`);
    if (spec.startsWith(".")) return hit(path.posix.normalize(`${path.posix.dirname(from)}/${spec}`));
    return null;
  };
}

/** Each module's imports inside one project: `{ values, all }`, each a set of modules. */
export function moduleGraph(files = modules()) {
  const known = new Set(files);
  const resolve = resolver(known);
  const graph = new Map();
  for (const f of files) {
    const values = new Set();
    const all = new Set();
    for (const { specifier, typeOnly } of importsOfModule(f)) {
      const to = resolve(specifier, f);
      if (!to || to === f) continue;
      all.add(to);
      if (!typeOnly) values.add(to);
    }
    graph.set(f, { values, all });
  }
  return graph;
}

/** Tarjan's strongly connected parts over `next`, those of two or more, by an explicit stack: a tree is deeper than a call stack likes. */
export function circlesOf(nodes, next) {
  const index = new Map();
  const low = new Map();
  const on = new Set();
  const stack = [];
  const circles = [];
  let at = 0;
  for (const start of nodes) {
    if (index.has(start)) continue;
    const work = [[start, 0]];
    while (work.length) {
      const frame = work[work.length - 1];
      const [v, i] = frame;
      if (i === 0) {
        index.set(v, at);
        low.set(v, at);
        at += 1;
        stack.push(v);
        on.add(v);
      }
      const ns = next(v);
      if (i < ns.length) {
        frame[1] += 1;
        const w = ns[i];
        if (!index.has(w)) work.push([w, 0]);
        else if (on.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1][0];
        low.set(parent, Math.min(low.get(parent), low.get(v)));
      }
      if (low.get(v) !== index.get(v)) continue;
      const part = [];
      for (;;) {
        const w = stack.pop();
        on.delete(w);
        part.push(w);
        if (w === v) break;
      }
      if (part.length > 1) circles.push(part);
    }
  }
  return circles;
}

/** The modules in a circle of value imports, and in one with the type imports counted. */
export function moduleCircles(graph = moduleGraph()) {
  const nodes = [...graph.keys()];
  return {
    values: circlesOf(nodes, (v) => [...(graph.get(v)?.values ?? [])]),
    withTypes: circlesOf(nodes, (v) => [...(graph.get(v)?.all ?? [])]),
  };
}
export const isBackend = (file) => BACKEND.some((re) => re.test(file));

/** A domain's name, or `(root)` for a module at the tree's root. */
export function domainOf(file, root) {
  const rest = file.slice(root.length + 1).split("/");
  return rest.length > 1 ? rest[0] : "(root)";
}

/** One tree's domains: which leans on which, by value imports, with how many imports and what from. */
export function domainGraph(root, graph = moduleGraph()) {
  const edges = new Map();
  const members = new Set();
  for (const [f, { values }] of graph) {
    if (!f.startsWith(`${root}/`)) continue;
    const a = domainOf(f, root);
    members.add(a);
    for (const t of values) {
      if (!t.startsWith(`${root}/`) || /zod-config/.test(t)) continue;
      const b = domainOf(t, root);
      members.add(b);
      if (a !== b) (edges.get(`${a}>${b}`) ?? edges.set(`${a}>${b}`, []).get(`${a}>${b}`)).push(`${f} -> ${t}`);
    }
  }
  return { edges, members };
}

/** What a tree's domains do to each other: the biggest circle, the pairs that run both ways, and what `shared` imports of a domain. */
export function domainShape(root, graph = moduleGraph()) {
  const { edges, members } = domainGraph(root, graph);
  const next = new Map();
  for (const k of edges.keys()) {
    const [a, b] = k.split(">");
    (next.get(a) ?? next.set(a, []).get(a)).push(b);
  }
  const circles = circlesOf([...members], (d) => next.get(d) ?? []);
  const twoWay = [...edges.keys()].filter((k) => {
    const [a, b] = k.split(">");
    return a < b && edges.has(`${b}>${a}`);
  });
  const sharedUp = [...edges].filter(([k]) => k.startsWith("shared>")).flatMap(([, v]) => v);
  return { domains: members.size, circle: Math.max(0, ...circles.map((c) => c.length)), twoWay, sharedUp };
}

const manifestOf = (dir) => JSON.parse(fs.readFileSync(path.join(ROOT, dir, "package.json"), "utf8"));
export const packageNames = () =>
  fs
    .readdirSync(path.join(ROOT, "packages"), { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(ROOT, "packages", e.name, "package.json")))
    .map((e) => e.name)
    .sort();

/** Who each package declares, of its siblings. */
export function declaredSiblings() {
  return Object.fromEntries(
    packageNames().map((p) => {
      const m = manifestOf(`packages/${p}`);
      const deps = Object.keys({ ...m.dependencies, ...m.peerDependencies })
        .filter((n) => n.startsWith("@chanlytics/"))
        .map((n) => n.slice("@chanlytics/".length))
        .sort();
      return [p, deps];
    }),
  );
}

/** The names a barrel offers, following its own re-exports; `export *` reads the barrel it names. */
function namesOffered(file, known, seen = new Set()) {
  if (seen.has(file)) return new Map();
  seen.add(file);
  const out = new Map();
  const resolve = resolver(known);
  for (const st of parse(file).statements) {
    if (ts.isExportDeclaration(st)) {
      const to =
        st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? resolve(st.moduleSpecifier.text, file) : null;
      if (st.moduleSpecifier && !st.exportClause && to)
        for (const [n, o] of namesOffered(to, known, seen)) out.set(n, o);
      else if (st.exportClause && ts.isNamedExports(st.exportClause))
        for (const e of st.exportClause.elements) {
          const inner = (e.propertyName ?? e.name).text;
          if (!to) out.set(e.name.text, file);
          else out.set(e.name.text, namesOffered(to, known, new Set(seen)).get(inner) ?? to);
        }
      continue;
    }
    const mods = ts.canHaveModifiers(st) ? (ts.getModifiers(st) ?? []) : [];
    if (!mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (
      (ts.isFunctionDeclaration(st) ||
        ts.isInterfaceDeclaration(st) ||
        ts.isTypeAliasDeclaration(st) ||
        ts.isClassDeclaration(st) ||
        ts.isEnumDeclaration(st)) &&
      st.name
    )
      out.set(st.name.text, file);
    if (ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) out.set(d.name.text, file);
  }
  return out;
}

/** The names a package's root barrel offers, or 0 for a package reached by its domains. */
export function rootNames(pkg) {
  const file = `packages/${pkg}/src/index.ts`;
  if (!fs.existsSync(path.join(ROOT, file))) return 0;
  const known = new Set(repoFiles([`packages/${pkg}/src`]).filter((f) => SOURCE.test(f)));
  return namesOffered(file, known).size;
}

const treeOfUser = (f) => {
  if (f.startsWith("packages/")) return f.split("/")[1];
  if (f.startsWith("apps/edge/")) return "edge";
  if (f.startsWith("apps/mobile/")) return "mobile";
  if (/^apps\/dashboard\/(src\/server|app\/api)\//.test(f)) return "server";
  if (f.startsWith("apps/dashboard/")) return "browser";
  return null;
};

/**
 * The modules of contracts only one tree reaches, directly or through other modules of contracts: not a contract, but that tree's own code. A schema stays
 * (a parser is the contract, and the API's reference reads it), and so does an entry of the package's own or a module nothing but the tests read.
 */
export function oneTreeContracts() {
  const SRC = "packages/contracts/src";
  const pkg = "@chanlytics/contracts";
  const files = modules().concat(repoFiles(["apps/mobile/src"]).filter((f) => SOURCE.test(f) && !NOT.test(f)));
  const known = new Set(files);
  const manifest = manifestOf("packages/contracts");
  const pick = (v) =>
    typeof v === "string" ? v : v && typeof v === "object" ? pick(v.types ?? v.import ?? v.default) : null;
  const entries = new Map(
    Object.entries(manifest.exports)
      .map(([k, v]) => [pkg + k.slice(1), pick(v)])
      .filter(([, t]) => t && SOURCE.test(t))
      .map(([k, t]) => [k, path.posix.normalize(`packages/contracts/${t}`)]),
  );
  const offered = new Map([...entries].map(([spec, file]) => [spec, namesOffered(file, known)]));
  const resolve = resolver(known);
  const isBarrel = (f) => /\/index\.ts$/.test(f);
  const own = files.filter((f) => f.startsWith(`${SRC}/`) && !isBarrel(f));
  const reach = new Map(own.map((m) => [m, new Set()]));
  const dependents = new Map(own.map((m) => [m, new Set()]));
  for (const f of files) {
    if (isBarrel(f) && f.startsWith(`${SRC}/`)) continue;
    const inPackage = f.startsWith(`${SRC}/`);
    const who = treeOfUser(f);
    const visit = (n) => {
      if (
        (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
        n.moduleSpecifier &&
        ts.isStringLiteral(n.moduleSpecifier)
      ) {
        const spec = n.moduleSpecifier.text;
        const clause = ts.isImportDeclaration(n) ? n.importClause?.namedBindings : n.exportClause;
        const named =
          clause && (ts.isNamedImports(clause) || ts.isNamedExports(clause))
            ? clause.elements.map((e) => (e.propertyName ?? e.name).text)
            : null;
        const names = offered.get(spec);
        const to = resolve(spec, f);
        const targets = names ? (named ?? [...names.keys()]).map((x) => names.get(x)) : to ? [to] : [];
        for (const t of targets) {
          if (!t || !reach.has(t)) continue;
          if (inPackage) dependents.get(t).add(f);
          else if (who) reach.get(t).add(who);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(parse(f));
  }
  const memo = new Map();
  const reachOf = (m, walking = new Set()) => {
    if (memo.has(m)) return memo.get(m);
    if (walking.has(m)) return new Set();
    walking.add(m);
    const out = new Set(reach.get(m));
    for (const d of dependents.get(m) ?? []) if (reach.has(d)) for (const t of reachOf(d, walking)) out.add(t);
    walking.delete(m);
    memo.set(m, out);
    return out;
  };
  const doors = new Set(entries.values());
  return own.filter((m) => {
    if (doors.has(m)) return false;
    if (/from "zod/.test(fs.readFileSync(path.join(ROOT, m), "utf8"))) return false;
    return reachOf(m).size === 1;
  });
}

/** Whoever reaches past a package's `exports` to its files: an app's or a package's source, by a path or by the package's name. */
export function reachesPastExports() {
  const out = [];
  for (const f of modules()) {
    for (const { specifier } of importsOfModule(f)) {
      if (
        /^@chanlytics\/[a-z]+\/(src|dist)\//.test(specifier) ||
        /(^|\/)packages\/[a-z]+\/(src|dist)\//.test(specifier)
      )
        out.push(`${f}: ${specifier}`);
    }
  }
  return out;
}

export const BOUNDARY_RATCHETS = [
  {
    name: "modules in a circle of value imports",
    file: "module-circles.json",
    measure: () => {
      const out = {};
      for (const c of moduleCircles().values) out[`${[...c].sort()[0]}::circle`] = c.length;
      return out;
    },
    advice:
      "A module that needs its own importer runs in whatever order it was reached. Move what both need to where both can lean on it (decision 0110).",
  },
  {
    name: "modules in a circle once type imports count",
    file: "type-circles.json",
    measure: () => {
      const out = {};
      for (const c of moduleCircles().withTypes) out[`${[...c].sort()[0]}::circle`] = c.length;
      return out;
    },
    advice:
      "A type that leans on its own importer ties two modules together even with no code between them. Give the type a home both lean on.",
  },
  {
    name: "domains in a tree's biggest circle, and the pairs that run both ways",
    file: "domain-circles.json",
    measure: () => {
      const graph = moduleGraph();
      const out = {};
      for (const name of COUNTED_TREES) {
        const { circle, twoWay } = domainShape(DOMAIN_TREES[name], graph);
        if (circle) out[`${name}::circle`] = circle;
        if (twoWay.length) out[`${name}::two-way`] = twoWay.length;
      }
      return out;
    },
    advice:
      "A new import from one domain to another that runs against it joins them in a circle. Move what is shared down, or the module that needs both up.",
  },
  {
    name: "modules of contracts one tree alone reaches",
    file: "one-tree-contracts.json",
    measure: () => Object.fromEntries(oneTreeContracts().map((m) => [m, 1])),
    advice:
      "A module only one tree reaches is that tree's own code: move it there. A schema stays, since the parser is the contract.",
  },
  {
    name: "names a package's root barrel offers",
    file: "root-names.json",
    measure: () =>
      Object.fromEntries(
        packageNames()
          .map((p) => [p, rootNames(p)])
          .filter(([, n]) => n > 0),
      ),
    advice:
      "A name joins a domain's barrel, and its importer says the domain. A package's root is not the place for it (decision 0110).",
  },
  {
    name: "doors over a hundred code lines",
    file: "long-doors.json",
    measure: longDoors,
    advice:
      "A door verifies, parses its input and answers. What it decides for itself goes behind it: apps/dashboard/src/server or apps/edge/lib.",
  },
];
