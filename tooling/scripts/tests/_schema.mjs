/**
 * The schema the in-memory database answers to (_fake-db.mjs), read from the files the migrations generate, so the
 * double refuses what Postgres and PostgREST refuse instead of taking any row it is handed.
 *
 *   packages/db/src/database.types.ts              each table's and view's columns, which may be null, which an insert
 *                                                  must name (NOT NULL with no default), the foreign keys an embed
 *                                                  follows, and each function's arguments
 *   packages/contracts/src/schema-sets.generated.ts every closed set a CHECK holds, one per column
 *   tooling/scripts/tests/_unique-keys.generated.json every unique index and primary key, with its predicate and
 *                                                  expressions (tooling/scripts/gen/unique-keys.mjs)
 *
 * All three are generated from the replayed migrations and held to them by the Database workflow, so the double's
 * schema is the database's. Parsed once and cached in the machine's temp directory under a hash of what it read: a
 * suite of 700 files pays for one parse, not 700.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
export const TYPES = "packages/db/src/database.types.ts";
export const SETS = "packages/contracts/src/schema-sets.generated.ts";
export const UNIQUE_KEYS = "tooling/scripts/tests/_unique-keys.generated.json";
const SELF = fileURLToPath(import.meta.url);

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/** A property's name in a type literal, quoted or not. */
const nameOf = (ts, n) => (n.name && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) ? n.name.text : null);

/** The members of a type literal, by name. */
function membersOf(ts, typeNode) {
  const out = new Map();
  if (!typeNode || !ts.isTypeLiteralNode(typeNode)) return out;
  for (const m of typeNode.members) if (ts.isPropertySignature(m) && nameOf(ts, m)) out.set(nameOf(ts, m), m);
  return out;
}

/** Whether a property's type admits null: `string | null`. */
const admitsNull = (ts, m) =>
  !!m.type &&
  ts.isUnionTypeNode(m.type) &&
  m.type.types.some((t) => ts.isLiteralTypeNode(t) && t.literal.kind === ts.SyntaxKind.NullKeyword);

/** The strings of a tuple type of string literals: `["tenant_id"]`. */
const stringsOf = (ts, node) =>
  node && ts.isTupleTypeNode(node)
    ? node.elements.filter((e) => ts.isLiteralTypeNode(e) && ts.isStringLiteral(e.literal)).map((e) => e.literal.text)
    : [];

/** database.types.ts's public schema: tables and views with their columns and keys, functions with their arguments. */
async function parseTypes(src) {
  const { default: ts } = await import("typescript");
  const sf = ts.createSourceFile(TYPES, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const db = sf.statements.find((s) => ts.isTypeAliasDeclaration(s) && s.name.text === "Database");
  if (!db) throw new Error(`${TYPES} has no Database type: is it the generator's output?`);
  const pub = membersOf(ts, membersOf(ts, db.type).get("public")?.type);
  const relations = {};
  for (const [kind, key] of [
    ["table", "Tables"],
    ["view", "Views"],
  ]) {
    for (const [name, t] of membersOf(ts, pub.get(key)?.type)) {
      const parts = membersOf(ts, t.type);
      const row = membersOf(ts, parts.get("Row")?.type);
      const insert = membersOf(ts, parts.get("Insert")?.type);
      const columns = {};
      for (const [col, m] of row) {
        const i = insert.get(col);
        columns[col] = { nullable: admitsNull(ts, m), required: !!i && !i.questionToken };
      }
      const rels = parts.get("Relationships")?.type;
      const relationships =
        rels && ts.isTupleTypeNode(rels)
          ? rels.elements.map((e) => {
              const r = membersOf(ts, e);
              const lit = (k) => {
                const tn = r.get(k)?.type;
                return tn && ts.isLiteralTypeNode(tn) && ts.isStringLiteral(tn.literal) ? tn.literal.text : null;
              };
              return {
                name: lit("foreignKeyName"),
                columns: stringsOf(ts, r.get("columns")?.type),
                referenced: lit("referencedRelation"),
                referencedColumns: stringsOf(ts, r.get("referencedColumns")?.type),
              };
            })
          : [];
      relations[name] = { kind, writable: insert.size > 0, columns, relationships };
    }
  }
  const functions = {};
  for (const [name, f] of membersOf(ts, pub.get("Functions")?.type)) {
    // An overloaded function is a union of `{ Args; Returns }`, one per overload; a function's own Args may be a union
    // too, or `never` for none.
    const variants = ts.isUnionTypeNode(f.type) ? f.type.types : [f.type];
    const shapes = variants.flatMap((v) => {
      const args = membersOf(ts, v).get("Args")?.type;
      if (!args || args.kind === ts.SyntaxKind.NeverKeyword) return [null];
      return ts.isUnionTypeNode(args) ? args.types : [args];
    });
    functions[name] = shapes.map((shape) =>
      shape
        ? Object.fromEntries([...membersOf(ts, shape)].map(([arg, m]) => [arg, { optional: !!m.questionToken }]))
        : {},
    );
  }
  return { relations, functions };
}

/** SCHEMA_SETS, read as the data it is: the generated file is one object literal of string arrays. */
function parseSets(src) {
  const body = src.slice(src.indexOf("{", src.indexOf("SCHEMA_SETS")), src.lastIndexOf("}") + 1);
  // The generator writes JSON-compatible keys and values, with trailing commas; drop those and the `as const`.
  return JSON.parse(body.replace(/,(\s*[\]}])/g, "$1"));
}

let cached = null;

/**
 * The schema, parsed once per machine per version of its inputs. `{ relations, functions, sets, uniques }`:
 * relations[name] = { kind, writable, columns: { [col]: { nullable, required } }, relationships };
 * functions[name] = [argument shapes, one per overload]; sets["table.column"] = values; uniques[table] = keys.
 */
export async function schemaOf() {
  if (cached) return cached;
  const inputs = [TYPES, SETS, UNIQUE_KEYS].map((f) => (fs.existsSync(path.join(ROOT, f)) ? read(f) : ""));
  const hash = crypto.createHash("sha1").update(inputs.join("\0")).update(fs.readFileSync(SELF)).digest("hex");
  const file = path.join(os.tmpdir(), `chanlytics-fake-schema-${hash.slice(0, 16)}.json`);
  try {
    cached = JSON.parse(fs.readFileSync(file, "utf8"));
    return cached;
  } catch {
    // not cached yet, or a half-written file from a parallel run: parse
  }
  const [types, sets, keys] = inputs;
  const { relations, functions } = await parseTypes(types);
  const uniques = {};
  for (const k of keys ? JSON.parse(keys).keys : []) (uniques[k.table] ??= []).push(k);
  cached = { relations, functions, sets: parseSets(sets), uniques };
  const tmp = `${file}.${process.pid}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(cached));
    fs.renameSync(tmp, file);
  } catch {
    // a cache is a convenience: the parse stands without it
  }
  return cached;
}

/* ---- What PostgREST and Postgres refuse, as supabase-js hands the refusal back ---- */

/** An error envelope's `error`, the shape postgrest-js returns for a refused request. */
export const refusal = (code, message, details = null, hint = null) => ({ code, message, details, hint });

/** A relation PostgREST does not know: 404, PGRST205. */
export function unknownRelation(schema, table) {
  return schema.relations[table]
    ? null
    : refusal("PGRST205", `Could not find the table 'public.${table}' in the schema cache`);
}

/** The column a filter, an order or a select item names, before any JSON path: `payload->>kind` is `payload`. */
const baseColumn = (spec) => String(spec).split(/->>?/)[0].trim();

/** A column the relation does not have: 400, 42703, as Postgres words it. */
export function unknownColumn(schema, table, spec) {
  const col = baseColumn(spec);
  // `rel.col` filters a resource the select embeds; the embed itself is judged where the select is.
  if (col.includes(".") || col === "*") return null;
  return schema.relations[table].columns[col] ? null : refusal("42703", `column ${table}.${col} does not exist`);
}

/** Split a select, an `or`, or an embed's list at its top-level commas. */
function splitTop(text) {
  const out = [];
  let depth = 0;
  let quoted = false;
  let cur = "";
  for (const ch of String(text)) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === "(") depth++;
    if (!quoted && ch === ")") depth--;
    if (!quoted && depth === 0 && ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** The relation an embed names from `table`: a relation with a foreign key between them, a key column, or a key's name. */
function embedTarget(schema, table, name, hint) {
  const here = schema.relations[table];
  const fks = (rel) => schema.relations[rel]?.relationships ?? [];
  const linked = (a, b) =>
    fks(a).some((r) => r.referenced === b) ||
    fks(b).some((r) => r.referenced === a) ||
    // PostgREST follows a view's keys through its base tables; the types list some and not all.
    schema.relations[a]?.kind === "view" ||
    schema.relations[b]?.kind === "view";
  if (hint && !["inner", "left"].includes(hint)) {
    const byName = fks(table).find((r) => r.name === hint) ?? fks(name).find((r) => r.name === hint);
    if (byName) return schema.relations[name] ? name : byName.referenced;
    const byColumn = fks(table).find((r) => r.columns.length === 1 && r.columns[0] === hint);
    if (byColumn) return byColumn.referenced;
  }
  if (schema.relations[name]) return linked(table, name) ? name : null;
  const byColumn = here.relationships.find((r) => r.columns.length === 1 && r.columns[0] === name);
  if (byColumn) return byColumn.referenced;
  const byName = here.relationships.find((r) => r.name === name);
  return byName ? byName.referenced : null;
}

const EMBED = /^(\.\.\.)?(?:([\w$]+):)?([\w$]+)((?:![\w$]+)*)\s*\(([\s\S]*)\)$/;
const PATH_KEY = String.raw`(?:"[^"]*"|'[^']*'|[\w$]+)`;
const COLUMN = new RegExp(String.raw`^(?:([\w$]+):)?([\w$]+)((?:\s*->>?\s*${PATH_KEY})*)(?:::([\w$ ]+))?$`);

/**
 * A select's columns read against the relation: `{ error }` when PostgREST would refuse it, else `{ draw }`, which
 * draws a row the way PostgREST answers one: the columns named, under their names or aliases, a path's value under its
 * last key, and an embed's rows (as the fixture joined them) drawn by its own list. `*` draws the whole row.
 */
export function selectOf(schema, table, columns) {
  const text = columns == null ? "*" : String(columns);
  const draws = [];
  for (const item of splitTop(text)) {
    if (item === "*") {
      draws.push((row, out) => Object.assign(out, row));
      continue;
    }
    const embed = EMBED.exec(item);
    if (embed) {
      const [, spread, alias, name, hints, inner] = embed;
      const hint = hints ? hints.split("!").filter(Boolean)[0] : null;
      const target = embedTarget(schema, table, name, hint);
      if (!target)
        return {
          error: refusal(
            "PGRST200",
            `Could not find a relationship between '${table}' and '${name}' in the schema cache`,
            `Searched for a foreign key relationship between '${table}' and '${name}' in the schema 'public', but no matches were found.`,
          ),
        };
      const sub = selectOf(schema, target, inner);
      if (sub.error) return sub;
      const key = alias ?? name;
      const drawOne = (v) => (v && typeof v === "object" ? sub.draw(v) : v);
      draws.push((row, out) => {
        const v = row[key] !== undefined ? row[key] : row[name];
        if (spread) {
          if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, sub.draw(v));
          return;
        }
        out[key] = v === undefined ? v : Array.isArray(v) ? v.map(drawOne) : drawOne(v);
      });
      continue;
    }
    const col = COLUMN.exec(item);
    if (!col) throw new Error(`fakeDb: select(${item}) on ${table} is not modelled`);
    const [, alias, name, pathText, cast] = col;
    const bad = unknownColumn(schema, table, name);
    if (bad) return { error: bad };
    const path = (pathText.match(new RegExp(String.raw`->>?\s*${PATH_KEY}`, "g")) ?? []).map((p) => ({
      text: p.startsWith("->>"),
      key: p.replace(/^->>?\s*/, "").replace(/^['"]|['"]$/g, ""),
    }));
    const as = alias ?? (path.length ? path[path.length - 1].key : name);
    draws.push((row, out) => {
      let v = row[name];
      for (const p of path) {
        v = v && typeof v === "object" ? v[p.key] : undefined;
        if (v === undefined) v = null;
        if (p.text && v !== null && typeof v === "object") v = JSON.stringify(v);
        else if (p.text && v !== null) v = String(v);
      }
      if (cast && v != null) {
        const c = cast.trim().toLowerCase();
        if (c === "text") v = typeof v === "object" ? JSON.stringify(v) : String(v);
        else if (/^(int|integer|bigint|smallint|numeric|float8|float4|real|double precision)$/.test(c)) v = Number(v);
      }
      out[as] = v;
    });
  }
  const whole = text.trim() === "*";
  return { draw: (row) => (whole ? { ...row } : draws.reduce((out, d) => (d(row, out), out), {})) };
}

/** A written value as the wire carries it: JSON's, so a Date is its ISO string and an undefined key is not there. */
export const onTheWire = (values) => JSON.parse(JSON.stringify(values));

/**
 * The rows an insert or an upsert sends, as PostgREST writes them: a bulk write names the union of its rows' keys
 * (postgrest-js's `columns`), and a row that lacks one of them writes NULL there, not the column's default.
 */
export function asSent(rows) {
  const wire = rows.map(onTheWire);
  if (wire.length < 2) return wire;
  const keys = [...new Set(wire.flatMap((r) => Object.keys(r)))];
  return wire.map((r) => Object.fromEntries(keys.map((k) => [k, k in r ? r[k] : null])));
}

/** A row written against the relation's columns, NOT NULLs and closed sets: `null`, or the refusal. */
export function refusedRow(schema, table, row, { insert }) {
  const rel = schema.relations[table];
  for (const col of Object.keys(row)) {
    if (!rel.columns[col])
      return refusal("PGRST204", `Could not find the '${col}' column of '${table}' in the schema cache`);
  }
  for (const [col, c] of Object.entries(rel.columns)) {
    const missing = !(col in row);
    if ((row[col] === null && !c.nullable) || (insert && missing && c.required))
      return refusal(
        "23502",
        `null value in column "${col}" of relation "${table}" violates not-null constraint`,
        "Failing row contains (...).",
      );
  }
  for (const [col, v] of Object.entries(row)) {
    const set = schema.sets[`${table}.${col}`];
    if (set && v !== null && !set.includes(v))
      return refusal(
        "23514",
        `new row for relation "${table}" violates check constraint "${table}_${col}_check"`,
        "Failing row contains (...).",
      );
  }
  return null;
}

/** A value of a key's part, or of an operand in a predicate, read from a row as Postgres would. */
function valueOf(node, row) {
  if ("value" in node) return node.value;
  if (node.column !== undefined) return row[node.column] ?? null;
  if (node.path) {
    const [col, key] = node.path;
    const v = row[col] && typeof row[col] === "object" ? row[col][key] : undefined;
    if (v === undefined || v === null) return null;
    return node.text ? (typeof v === "object" ? JSON.stringify(v) : String(v)) : v;
  }
  if (node.lower) {
    const v = valueOf(node.lower, row);
    return v === null ? null : String(v).toLowerCase();
  }
  if (node.coalesce) {
    for (const part of node.coalesce) {
      const v = valueOf(part, row);
      if (v !== null) return v;
    }
    return null;
  }
  throw new Error(`fakeDb: a key part ${JSON.stringify(node)} is not modelled`);
}

/** SQL's three values: true, false, or null for unknown. A WHERE admits only true. */
function truth(p, row) {
  if (p.and) {
    const parts = p.and.map((x) => truth(x, row));
    return parts.includes(false) ? false : parts.includes(null) ? null : true;
  }
  if (p.or) {
    const parts = p.or.map((x) => truth(x, row));
    return parts.includes(true) ? true : parts.includes(null) ? null : false;
  }
  if (p.not) {
    const v = truth(p.not, row);
    return v === null ? null : !v;
  }
  if (p.isNull) return valueOf(p.isNull, row) === null;
  if (p.notNull) return valueOf(p.notNull, row) !== null;
  if (p.truthy) {
    const v = valueOf(p.truthy, row);
    return v === null ? null : v === true;
  }
  if (p.in) {
    const v = valueOf(p.in, row);
    return v === null ? null : p.values.includes(v);
  }
  if (p.cmp) {
    const a = valueOf(p.left, row);
    const b = valueOf(p.right, row);
    if (a === null || b === null) return null;
    const [x, y] = typeof a === "number" || typeof b === "number" ? [Number(a), Number(b)] : [String(a), String(b)];
    return { "=": x === y, "<>": x !== y, "<": x < y, ">": x > y, "<=": x <= y, ">=": x >= y }[p.cmp];
  }
  throw new Error(`fakeDb: a predicate ${JSON.stringify(p)} is not modelled`);
}

/**
 * The relation's unique keys in the double's own shape: `key(row)` is the row's key as one string, or null when a part
 * is NULL and NULLs are distinct (such a row never conflicts); `where` admits the rows a partial index covers;
 * `columns` is the plain column list an upsert's conflict target must match, null for a key on expressions.
 */
export function uniqueKeysOf(schema, table) {
  return (schema.uniques[table] ?? []).map((k) => ({
    table,
    name: k.name,
    primary: k.primary,
    partial: k.where != null,
    columns: k.keys.every((p) => p.column !== undefined) ? k.keys.map((p) => p.column) : null,
    where: k.where ? (row) => truth(k.where, row) === true : () => true,
    key: (row) => {
      const parts = k.keys.map((p) => valueOf(p, row));
      if (!k.nullsNotDistinct && parts.some((v) => v === null)) return null;
      return JSON.stringify(parts);
    },
  }));
}

/** An upsert's conflict target that no whole-table unique key matches: 400, 42P10. */
export function conflictUnmatched(schema, table, conflict) {
  const want = [...conflict].sort().join(",");
  const keys = uniqueKeysOf(schema, table).filter((k) => k.columns && !k.partial);
  return keys.some((k) => [...k.columns].sort().join(",") === want)
    ? null
    : refusal("42P10", "there is no unique or exclusion constraint matching the ON CONFLICT specification");
}

/** A function PostgREST cannot find by these argument names: 404, PGRST202. */
export function unknownFunction(schema, name, args) {
  const given = Object.keys(onTheWire(args ?? {})).sort();
  const overloads = schema.functions[name];
  const fits = (shape) =>
    given.every((a) => a in shape) && Object.entries(shape).every(([a, s]) => s.optional || given.includes(a));
  if (overloads && overloads.some(fits)) return null;
  return refusal(
    "PGRST202",
    `Could not find the function public.${name}(${given.join(", ")}) in the schema cache`,
    `Searched for the function public.${name} with parameters ${given.join(", ") || "(none)"} or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache.`,
  );
}

/**
 * The request line a read, an update or a delete travels on, as postgrest-js builds it: the select, then each filter
 * and modifier as a query parameter. Kong's nginx refuses one past 8 KiB (414): about 208 uuids in one `.in()`.
 */
export const REQUEST_LINE_LIMIT = 8192;
export function requestLine(table, q) {
  const params = new URLSearchParams();
  if (q.op === "select" || q.columns != null)
    params.append("select", String(q.columns ?? "*").replace(/\s+(?=(?:[^"]*"[^"]*")*[^"]*$)/g, ""));
  const lit = (v) => (typeof v === "object" && v !== null ? JSON.stringify(v) : String(v));
  const listed = (vals) => vals.map((v) => (typeof v === "string" && /[,()]/.test(v) ? `"${v}"` : lit(v))).join(",");
  for (const [op, col, val] of q.filters) {
    if (op === "or") params.append("or", `(${val})`);
    else if (op === "in") params.append(col, `in.(${listed([...new Set(val)])})`);
    else if (op === "not") params.append(col, `not.${val[0]}.${lit(val[1])}`);
    else if (op === "contains") params.append(col, `cs.${lit(val)}`);
    else params.append(col, `${op}.${lit(val)}`);
  }
  for (const o of q.orders) params.append("order", `${o.col}.${o.desc ? "desc" : "asc"}`);
  if (q.limit != null) params.append("limit", String(q.limit));
  if (q.range) params.append("offset", String(q.range[0]));
  const method = { select: "GET", update: "PATCH", delete: "DELETE" }[q.op] ?? "POST";
  return `${method} /rest/v1/${table}?${params} HTTP/1.1`;
}

/** What the gateway answers a request line past its limit with: an HTML page, which postgrest-js keeps as the message. */
export const URI_TOO_LONG = {
  message:
    "<html>\r\n<head><title>414 Request-URI Too Large</title></head>\r\n<body>\r\n<center><h1>414 Request-URI Too Large</h1></center>\r\n<hr><center>openresty</center>\r\n</body>\r\n</html>\r\n",
};

/** PostgREST's max_rows (supabase/config.toml `[api] max_rows`): a read answers at most this many rows. */
export const MAX_ROWS = 1000;
