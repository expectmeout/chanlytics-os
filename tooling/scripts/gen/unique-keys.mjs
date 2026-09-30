#!/usr/bin/env node
/**
 * Every unique key the database holds, generated from the database itself, for the in-memory double.
 *
 * Reads each unique index and primary key on a public table (partitions left out: PostgREST hides them) from the
 * LOCAL database `supabase start` builds out of every migration, with its key columns or expressions, its predicate
 * and whether NULLs are distinct, and writes tooling/scripts/tests/_unique-keys.generated.json. The double
 * (tooling/scripts/tests/_fake-db.mjs, through _schema.mjs) refuses an insert, update or upsert that would break one,
 * as Postgres does (23505), and an upsert whose conflict target no key matches (42P10).
 *
 * Expressions and predicates are translated here into a small tree the double evaluates: a column, lower(), a text
 * path (`payload ->> 'message'`); =, <>, the comparisons, IS [NOT] NULL, = ANY / <> ALL of an array, AND, OR, NOT. A
 * key it cannot translate is written under `unmodelled` with the index's definition, so nothing is dropped unseen.
 *
 *   supabase start
 *   corepack pnpm gen:db-types                     writes this file too, after the types
 *   node tooling/scripts/gen/unique-keys.mjs --check  exit 1 if the file is stale (database/unique-keys.db.test.mjs runs it)
 *                                                     --file <path> checks or writes that file instead of the committed one
 *
 * SUPABASE_CLI names the binary when `supabase` is not on PATH; the stack is the one supabase/config.toml names.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const OUT = "tooling/scripts/tests/_unique-keys.generated.json";

const SQL = `
select c.relname::text as tbl,
       i.relname::text as name,
       x.indisprimary as is_primary,
       x.indnullsnotdistinct as nulls_not_distinct,
       pg_get_indexdef(x.indexrelid) as def,
       pg_get_expr(x.indpred, x.indrelid) as pred,
       to_jsonb(array(select pg_get_indexdef(x.indexrelid, k, true) from generate_series(1, x.indnkeyatts::int) k)) as keys
  from pg_index x
  join pg_class c on c.oid = x.indrelid
  join pg_class i on i.oid = x.indexrelid
 where x.indisunique
   and c.relnamespace = 'public'::regnamespace
   and c.relkind in ('r', 'p')
   and not c.relispartition
 order by 1, 2`;

/* ---- A small reader for what pg_get_expr and pg_get_indexdef print ---- */

function tokens(text) {
  const out = [];
  const re =
    /\s*(?:('(?:[^']|'')*')|("(?:[^"]|"")*")|(::)|(->>|->|<>|<=|>=|!=|[=<>(),[\]])|([A-Za-z_][A-Za-z0-9_]*)|(-?\d+(?:\.\d+)?))/y;
  let i = 0;
  const s = text.trim();
  while (i < s.length) {
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m) throw new Error(`cannot read "${s.slice(i)}"`);
    i = re.lastIndex;
    if (m[1]) out.push({ t: "str", v: m[1].slice(1, -1).replace(/''/g, "'") });
    else if (m[2]) out.push({ t: "id", v: m[2].slice(1, -1).replace(/""/g, '"') });
    else if (m[3]) out.push({ t: "op", v: "::" });
    else if (m[4]) out.push({ t: "op", v: m[4] === "!=" ? "<>" : m[4] });
    else if (m[5]) out.push({ t: "word", v: m[5] });
    else out.push({ t: "num", v: Number(m[6]) });
  }
  return out;
}

/** A parser over one expression's tokens: `operand()` for a key, `expr()` for a predicate. */
function parser(text) {
  const ts = tokens(text);
  let p = 0;
  const peek = (k = 0) => ts[p + k];
  const word = (w, k = 0) => peek(k)?.t === "word" && peek(k).v.toUpperCase() === w;
  const op = (o, k = 0) => peek(k)?.t === "op" && peek(k).v === o;
  const take = () => ts[p++];
  const expect = (o) => {
    if (!op(o)) throw new Error(`expected ${o} in "${text}"`);
    take();
  };
  const cast = (node) => {
    while (op("::")) {
      take();
      take(); // the type's name; `character varying` and `timestamp with time zone` are not in any key
    }
    return node;
  };
  const literal = () => {
    const t = take();
    if (t.t === "str") return cast({ value: t.v });
    if (t.t === "num") return cast({ value: t.v });
    if (t.t === "word" && /^(TRUE|FALSE)$/i.test(t.v)) return cast({ value: t.v.toUpperCase() === "TRUE" });
    if (t.t === "word" && /^NULL$/i.test(t.v)) return { value: null };
    throw new Error(`a literal was expected in "${text}"`);
  };
  function operand() {
    const t = peek();
    if (!t) throw new Error(`an operand was expected in "${text}"`);
    if (op("(")) {
      take();
      const inner = operand();
      if (op("->>") || op("->")) {
        const arrow = take().v;
        const key = literal();
        expect(")");
        if (inner.column === undefined || typeof key.value !== "string")
          throw new Error(`a path is modelled on a column only, in "${text}"`);
        return cast({ path: [inner.column, key.value], text: arrow === "->>" });
      }
      expect(")");
      return cast(inner);
    }
    if (t.t === "word" && /^lower$/i.test(t.v) && op("(", 1)) {
      take();
      take();
      const inner = operand();
      expect(")");
      return cast({ lower: inner });
    }
    if (t.t === "word" && /^coalesce$/i.test(t.v) && op("(", 1)) {
      take();
      take();
      const parts = [operand()];
      while (op(",")) {
        take();
        parts.push(operand());
      }
      expect(")");
      return cast({ coalesce: parts });
    }
    if (t.t === "str" || t.t === "num" || word("TRUE") || word("FALSE") || word("NULL")) return literal();
    if (t.t === "word" || t.t === "id") {
      if (op("(", 1)) throw new Error(`the function ${t.v}() is not modelled, in "${text}"`);
      take();
      const node = { column: t.v };
      if (op("->>") || op("->")) {
        const arrow = take().v;
        const key = literal();
        return cast({ path: [node.column, key.value], text: arrow === "->>" });
      }
      return cast(node);
    }
    throw new Error(`cannot read an operand at "${t.v}" in "${text}"`);
  }
  function array() {
    if (!word("ARRAY")) throw new Error(`an ARRAY was expected in "${text}"`);
    take();
    expect("[");
    const values = [literal().value];
    while (op(",")) {
      take();
      values.push(literal().value);
    }
    expect("]");
    return cast({ values });
  }
  function comparison() {
    if (op("(")) {
      // A parenthesised predicate, or a parenthesised operand that a comparison follows.
      const save = p;
      take();
      try {
        const inner = expr();
        expect(")");
        if (!(op("=") || op("<>") || op("<") || op(">") || op("<=") || op(">=") || word("IS"))) return inner;
      } catch {
        // not a predicate: read it as an operand
      }
      p = save;
    }
    const left = operand();
    if (word("IS")) {
      take();
      const not = word("NOT") ? (take(), true) : false;
      if (word("NULL")) {
        take();
        return { [not ? "notNull" : "isNull"]: left };
      }
      if (word("TRUE") || word("FALSE")) {
        const v = take().v.toUpperCase() === "TRUE";
        return not ? { not: { cmp: "=", left, right: { value: v } } } : { cmp: "=", left, right: { value: v } };
      }
      throw new Error(`IS ${peek()?.v} is not modelled, in "${text}"`);
    }
    for (const o of ["=", "<>", "<", ">", "<=", ">="]) {
      if (op(o)) {
        take();
        if (word("ANY") || word("ALL")) {
          const quantifier = take().v.toUpperCase();
          expect("(");
          const list = array();
          expect(")");
          if (o === "=" && quantifier === "ANY") return { in: left, values: list.values };
          if (o === "<>" && quantifier === "ALL") return { not: { in: left, values: list.values } };
          throw new Error(`${o} ${quantifier} is not modelled, in "${text}"`);
        }
        return { cmp: o, left, right: operand() };
      }
    }
    return { truthy: left };
  }
  function unary() {
    if (word("NOT")) {
      take();
      return { not: unary() };
    }
    return comparison();
  }
  function and() {
    const parts = [unary()];
    while (word("AND")) {
      take();
      parts.push(unary());
    }
    return parts.length === 1 ? parts[0] : { and: parts };
  }
  function expr() {
    const parts = [and()];
    while (word("OR")) {
      take();
      parts.push(and());
    }
    return parts.length === 1 ? parts[0] : { or: parts };
  }
  const done = () => {
    if (p !== ts.length)
      throw new Error(
        `"${text}" has more than was read: ${ts
          .slice(p)
          .map((t) => t.v)
          .join(" ")}`,
      );
  };
  return { operand: () => ((r) => (done(), r))(operand()), expr: () => ((r) => (done(), r))(expr()) };
}

/** One index as the double reads it, or why it cannot. */
export function keyOf(row) {
  const base = {
    table: row.tbl,
    name: row.name,
    primary: !!row.is_primary,
    nullsNotDistinct: !!row.nulls_not_distinct,
  };
  try {
    const keys = (typeof row.keys === "string" ? JSON.parse(row.keys) : row.keys).map((k) => parser(k).operand());
    const where = row.pred ? parser(row.pred).expr() : null;
    return { ...base, keys, where };
  } catch (e) {
    return { ...base, unmodelled: `${e instanceof Error ? e.message : e}: ${row.def}` };
  }
}

export function readIndexes(root) {
  const CLI = process.env.SUPABASE_CLI || "supabase";
  const [cmd, pre] = CLI.endsWith(".js") ? [process.execPath, [CLI]] : [CLI, []];
  let out;
  try {
    out = execFileSync(cmd, [...pre, "db", "query", SQL, "-o", "json"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    const why = (e && typeof e.stderr === "string" && e.stderr.trim()) || (e instanceof Error ? e.message : String(e));
    console.error(
      `gen-unique-keys: could not query the local database with "${CLI}". Is \`supabase start\` running? ${why}`,
    );
    process.exit(2);
  }
  const at = [out.indexOf("{"), out.indexOf("[")].filter((i) => i >= 0).sort((x, y) => x - y)[0];
  const parsed = JSON.parse(out.slice(at));
  const rows = Array.isArray(parsed) ? parsed : parsed.rows;
  // A database this small is not the one the migrations build: refuse rather than write a file that holds nothing.
  if (rows.length < 50) {
    console.error(
      `gen-unique-keys: found only ${rows.length} unique keys -- is this the database the migrations build?`,
    );
    process.exit(2);
  }
  return rows;
}

/** The file's text for these rows: keys the double models, and the ones it cannot, each by table and name. */
export function render(rows) {
  const all = rows.map(keyOf);
  const file = {
    generated:
      "by tooling/scripts/gen/unique-keys.mjs from the replayed migrations; do not edit (supabase start, then corepack pnpm gen:db-types)",
    keys: all.filter((k) => !k.unmodelled),
    unmodelled: all.filter((k) => k.unmodelled).map((k) => ({ table: k.table, name: k.name, why: k.unmodelled })),
  };
  return JSON.stringify(file, null, 2) + "\n";
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  // --file <path> reads or writes another file than the committed one: how the suite proves a stale one is caught.
  const named = process.argv.indexOf("--file");
  const out = named > 0 ? path.resolve(process.argv[named + 1]) : path.join(ROOT, OUT);
  const text = render(readIndexes(ROOT));
  if (process.argv.includes("--check")) {
    const committed = fs.existsSync(out) ? fs.readFileSync(out, "utf8").replace(/\r\n/g, "\n") : "";
    if (committed === text) {
      console.log(`${OUT} is current.`);
      process.exit(0);
    }
    console.error(`${OUT} is stale: the migrations build unique keys the committed file does not describe.`);
    console.error("Run `supabase start && corepack pnpm gen:db-types`, and commit the result.");
    process.exit(1);
  }
  fs.writeFileSync(out, text);
  const n = JSON.parse(text);
  console.log(`wrote ${OUT} (${n.keys.length} keys, ${n.unmodelled.length} not modelled)`);
}
