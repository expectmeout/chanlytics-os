/**
 * Which write doors a GET route's handler reaches (decision 0047, lane 6: reads never write).
 *
 * A route's handler is traced the way a person would read it: from the function the GET gives to `read({ handle })`,
 * through every function it calls by name, in its own file and in the files it imports (the dashboard's `@/` alias,
 * relative paths, and `@chanlytics/db`, whose functions are where a table is written; another package is a door's home,
 * not followed), a function at a time, so a module that holds a reader beside a writer is judged by the reader's own
 * calls and not by what else the file does. A call on a module's own object of functions (`store.claim(...)`, where
 * `store` is declared as an object literal, or as another name for one) follows the member it names. Until 14 Oct the
 * trace stopped at a package and at such an object, and GET lead-suggestions wrote unseen (the wiring's second audit, R11
 * S11-8). It stops at what it can name:
 *
 *   - a row written through supabase-js: `.from("<table>")` followed by `.insert`, `.upsert`, `.update` or `.delete`;
 *   - a call to one of the named write helpers (`emitEvent`, `recordEvent`, `recordDecision`: a fact on the ledger);
 *   - `.rpc("<function>")` of a function the schema's snapshot (supabase/schema.sql) shows writing a table.
 *
 * What it does not see is what a name hides (a function passed in and called as a parameter, a statement built as a
 * string, a SQL function that only calls a writing one): a reader's honest answer is that this is the syntax it can hold to,
 * and the allow-list beside it is the stated exceptions, not a proof of everything else.
 *
 * Pure over the files it is given (`read`, `exists`), so the tracer is run on fixtures in its own test.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { functionChangesIn } from "../../gen/schema-snapshot.mjs";
import { ROOT } from "../_source.mjs";

/** The helpers that put a fact on the ledger, by the name a call is made under. */
const DOORS = new Set(["emitEvent", "recordEvent", "recordDecision"]);
/** The supabase-js calls that write rows, as the link after `.from("<table>")`. */
const ROW_WRITES = new Set(["insert", "upsert", "update", "delete"]);
/** How many functions deep a trace goes before it stops: deeper than any handler here. */
const MAX_DEPTH = 10;

/** `insert into`, `delete from` and `update <table> set`: a SQL function body that changes a table (not `for update`, not `do update set`). */
const SQL_WRITES =
  /\b(?:insert\s+into|delete\s+from)\b|\bupdate\s+(?:only\s+)?(?:public\.)?[a-z_][a-z0-9_]*\s+(?:as\s+[a-z_][a-z0-9_]*\s+)?set\b/i;

/** The SQL functions the schema's snapshot shows writing a table, by name: what `.rpc("<name>")` may not reach from a read. */
export function writingRpcs(schemaSql) {
  const out = new Set();
  for (const change of functionChangesIn(schemaSql)) {
    if (change.kind !== "create" || !change.body) continue;
    const body = change.body.replace(/--[^\n]*/g, "");
    if (SQL_WRITES.test(body)) out.add(change.name);
  }
  return out;
}

/**
 * The repository on disk, as the tracer reads it, with the SQL functions the schema's snapshot shows writing a table: a
 * data read of the snapshot (as the writers ratchet reads it), never a scan of code for words.
 */
export function checkout() {
  const file = (rel) => path.join(ROOT, rel);
  const isFile = (rel) => fs.existsSync(file(rel)) && fs.statSync(file(rel)).isFile();
  return {
    read: (rel) => (isFile(rel) ? fs.readFileSync(file(rel), "utf8") : null),
    exists: isFile,
    writingRpcs: writingRpcs(fs.readFileSync(file("supabase/schema.sql"), "utf8").split("\r\n").join("\n")),
  };
}

/** The packages a trace follows into, by their source's entry: the one that writes tables. */
const FOLLOWED_PACKAGES = new Map([["@chanlytics/db", "packages/db/src/index"]]);

/** Where a specifier points in the checkout, or null for another package or a file that is not there. */
function resolveModule(from, spec, exists) {
  let base;
  if (spec.startsWith("@/")) base = `apps/dashboard/src/${spec.slice(2)}`;
  else if (spec.startsWith(".")) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  else if (FOLLOWED_PACKAGES.has(spec)) base = FOLLOWED_PACKAGES.get(spec);
  else return null;
  // A source written for ESM names its sibling by the file it builds to.
  if (base.endsWith(".js")) base = base.slice(0, -3);
  const hit = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`, base].find((c) => exists(c));
  return hit ?? null;
}

const kindOf = (file) => (file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

/** A module as the trace reads it: what it imports, declares at its top and re-exports. */
function indexModule(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kindOf(file));
  const mod = { sf, imports: new Map(), decls: new Map(), reexports: new Map(), stars: [] };
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const clause = st.importClause;
      if (!clause || clause.isTypeOnly) continue;
      const from = st.moduleSpecifier.text;
      if (clause.name) mod.imports.set(clause.name.text, { from, name: "default" });
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings))
        for (const e of clause.namedBindings.elements)
          if (!e.isTypeOnly) mod.imports.set(e.name.text, { from, name: (e.propertyName ?? e.name).text });
    } else if (ts.isExportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
      if (st.isTypeOnly) continue;
      const from = st.moduleSpecifier.text;
      if (!st.exportClause) mod.stars.push(from);
      else if (ts.isNamedExports(st.exportClause))
        for (const e of st.exportClause.elements)
          if (!e.isTypeOnly) mod.reexports.set(e.name.text, { from, name: (e.propertyName ?? e.name).text });
    } else if (ts.isFunctionDeclaration(st) && st.name && st.body) {
      mod.decls.set(st.name.text, st);
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations)
        if (ts.isIdentifier(d.name) && d.initializer) mod.decls.set(d.name.text, d.initializer);
    }
  }
  return mod;
}

/** Whether `expr` is a chain that began at `.from("<table>")`: a table's statement, not a storage bucket's. */
function startsAtTable(expr) {
  let at = expr;
  for (;;) {
    if (ts.isCallExpression(at)) {
      const callee = at.expression;
      if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === "from" &&
        at.arguments.length >= 1 &&
        ts.isStringLiteralLike(at.arguments[0]) &&
        !(ts.isPropertyAccessExpression(callee.expression) && callee.expression.name.text === "storage")
      )
        return true;
      at = callee;
    } else if (ts.isPropertyAccessExpression(at) || ts.isNonNullExpression(at) || ts.isParenthesizedExpression(at)) {
      at = at.expression;
    } else if (ts.isAwaitExpression(at)) {
      at = at.expression;
    } else {
      return false;
    }
  }
}

/**
 * The function a GET gives to be run: `read({ handle })`'s handle, or the whole of whatever else the route declares
 * (`export async function GET`, a bare wrapper), whose closures are then all in the trace.
 */
function handlerOf(mod) {
  const decl = mod.decls.get("GET");
  if (!decl) return null;
  if (ts.isCallExpression(decl) && ts.isIdentifier(decl.expression) && decl.expression.text === "read") {
    const spec = decl.arguments[0];
    if (spec && ts.isObjectLiteralExpression(spec)) {
      for (const p of spec.properties) {
        if (!p.name || p.name.getText() !== "handle") continue;
        if (ts.isPropertyAssignment(p)) {
          if (ts.isIdentifier(p.initializer) && mod.decls.has(p.initializer.text))
            return mod.decls.get(p.initializer.text);
          return p.initializer;
        }
        if (ts.isShorthandPropertyAssignment(p)) return mod.decls.get(p.name.text) ?? decl;
        if (ts.isMethodDeclaration(p)) return p;
      }
    }
  }
  return decl;
}

/**
 * The write doors a GET route reaches, each as `<what> (<file>:<line>)`; none for a route with no GET.
 *
 * @param {{ read: (file: string) => string | null, exists: (file: string) => boolean, writingRpcs?: Set<string> }} world
 * @param {string} entry the route's repo-relative path
 */
export function writesReachedBy(world, entry) {
  const { read, exists, writingRpcs: rpcs = new Set() } = world;
  const modules = new Map();
  const moduleOf = (file) => {
    if (!modules.has(file)) {
      const text = read(file);
      modules.set(file, text == null ? null : indexModule(file, text));
    }
    return modules.get(file);
  };
  /** The declaration a name is in a module: its own, or the one it re-exports from another. */
  const declared = (file, name, hops = 0) => {
    const mod = moduleOf(file);
    if (!mod || hops > MAX_DEPTH) return null;
    if (mod.decls.has(name)) return { file, node: mod.decls.get(name) };
    const re = mod.reexports.get(name);
    if (re) {
      const next = resolveModule(file, re.from, exists);
      const hit = next ? declared(next, re.name, hops + 1) : null;
      if (hit) return hit;
    }
    for (const star of mod.stars) {
      const next = resolveModule(file, star, exists);
      const hit = next ? declared(next, name, hops + 1) : null;
      if (hit) return hit;
    }
    return null;
  };

  const found = [];
  const seen = new Set();
  const lineOf = (file, n) => `${file}:${moduleOf(file).sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;

  const follow = (file, name, depth) => {
    const mod = moduleOf(file);
    let target = null;
    if (mod.decls.has(name)) target = { file, node: mod.decls.get(name) };
    else if (mod.imports.has(name)) {
      const imp = mod.imports.get(name);
      const next = resolveModule(file, imp.from, exists);
      if (next) target = declared(next, imp.name);
    }
    if (!target) return;
    const key = `${target.file}::${name}`;
    if (seen.has(key) || depth > MAX_DEPTH) return;
    seen.add(key);
    scan(target.file, target.node, depth + 1);
  };

  /**
   * A call on a module's own object of functions (`store.claim`): the object as its file declares it, through the names
   * that alias it there (`let store = SERVICE_STORE`), and the member it names, followed as a function is.
   */
  const followMember = (file, object, member, depth) => {
    const mod = moduleOf(file);
    let init = mod.decls.get(object);
    for (let hops = 0; init && ts.isIdentifier(init) && hops < MAX_DEPTH; hops++) init = mod.decls.get(init.text);
    if (!init || !ts.isObjectLiteralExpression(init)) return;
    const key = `${file}::${object}.${member}`;
    if (seen.has(key) || depth > MAX_DEPTH) return;
    seen.add(key);
    for (const p of init.properties) {
      if (!p.name || p.name.getText() !== member) continue;
      if (ts.isPropertyAssignment(p)) {
        if (ts.isIdentifier(p.initializer)) follow(file, p.initializer.text, depth);
        else scan(file, p.initializer, depth + 1);
      } else if (ts.isShorthandPropertyAssignment(p)) follow(file, p.name.text, depth);
      else if (ts.isMethodDeclaration(p)) scan(file, p, depth + 1);
    }
  };

  const scan = (file, node, depth) => {
    const visit = (n) => {
      if (ts.isCallExpression(n)) {
        const callee = n.expression;
        if (ts.isIdentifier(callee)) {
          if (DOORS.has(callee.text)) found.push(`${callee.text}() (${lineOf(file, n)})`);
          else follow(file, callee.text, depth);
        } else if (ts.isPropertyAccessExpression(callee)) {
          const method = callee.name.text;
          if (ROW_WRITES.has(method) && startsAtTable(callee.expression)) {
            found.push(`.${method}() on a table (${lineOf(file, n)})`);
          } else if (method === "rpc" && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) {
            if (rpcs.has(n.arguments[0].text)) found.push(`rpc ${n.arguments[0].text} (${lineOf(file, n)})`);
          } else if (ts.isIdentifier(callee.expression)) {
            followMember(file, callee.expression.text, method, depth);
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
  };

  const mod = moduleOf(entry);
  const handler = mod ? handlerOf(mod) : null;
  if (handler) scan(entry, handler, 0);
  return [...new Set(found)];
}

/** Whether a route file declares a GET at all. */
export function declaresGet(world, entry) {
  const text = world.read(entry);
  return text != null && indexModule(entry, text).decls.has("GET");
}
