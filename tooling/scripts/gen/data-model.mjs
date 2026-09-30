#!/usr/bin/env node
/**
 * The data dictionary, written from the schema snapshot and the repositories.
 *
 * docs/data-model.md says, for every table the migrations leave: its columns,
 * its keys, whether row-level security is on and what each policy lets
 * through, and the module in packages/db/src that reads and writes it. It is
 * read off supabase/schema.sql (schema-snapshot.mjs writes it from a replay)
 * and the syntax tree of packages/db/src (each `.from("…")`, found the way the
 * tables ratchet finds it), so writing or checking it needs no database.
 *
 *   corepack pnpm gen:data-model                                 write docs/data-model.md
 *   node tooling/scripts/gen/data-model.mjs --check              exit 1 if it is stale (docs/data-model.test.mjs)
 *
 * Functions, triggers, indexes and grants stay in the snapshot: this page is
 * what a table holds and who may see it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  OUT as SNAPSHOT,
  closing,
  isPunct,
  isWord,
  qualifiedName,
  splitTopLevel,
  statementsOf,
} from "./schema-snapshot.mjs";
import { parse, repoFiles, tablesNamedIn } from "../tests/_ast.mjs";

export const OUT = "docs/data-model.md";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const REPOSITORIES = "packages/db/src";

/** The text a run of tokens covers in `sql`, as written. */
const textOf = (sql, tokens) => (tokens.length ? sql.slice(tokens[0].start, tokens[tokens.length - 1].end) : "");
/** The names in a parenthesised list: `(a, b)` at `open`. */
const namesIn = (tokens, open) =>
  splitTopLevel(tokens.slice(open + 1, closing(tokens, open))).map((p) => p.map((t) => t.value).join(""));

/** What ends a column's type in pg_dump's CREATE TABLE. */
const AFTER_TYPE = new Set(["default", "not", "null", "generated", "constraint", "collate", "check", "references"]);

/** One column of a CREATE TABLE, as pg_dump writes it: name type [COLLATE c] [DEFAULT e | GENERATED …] [NOT NULL]. */
function columnOf(tokens, sql) {
  const name = tokens[0].value;
  let end = tokens.length;
  let notNull = false;
  if (isWord(tokens[end - 2], "not") && isWord(tokens[end - 1], "null")) {
    notNull = true;
    end -= 2;
  }
  let t = 1;
  while (t < end && !(tokens[t].type === "word" && AFTER_TYPE.has(tokens[t].value.toLowerCase()))) t++;
  const type = textOf(sql, tokens.slice(1, t));
  let fill = null;
  const at = tokens.findIndex((x, i) => i >= t && i < end && (isWord(x, "default") || isWord(x, "generated")));
  if (at >= 0 && isWord(tokens[at], "default")) fill = textOf(sql, tokens.slice(at + 1, end));
  else if (at >= 0) {
    // GENERATED ALWAYS AS (expression) STORED
    const open = tokens.findIndex((x, i) => i > at && isPunct(x, "("));
    fill = `generated: ${textOf(sql, tokens.slice(open + 1, closing(tokens, open)))}`;
  }
  return { name, type, notNull, fill, comment: null };
}

/** An empty table record, filled in as statements about it are read. */
const tableRecord = (name) => ({
  name,
  comment: null,
  columns: [],
  primaryKey: null,
  foreignKeys: [],
  rls: false,
  forced: false,
  policies: [],
  partitionBy: null,
  partitions: [],
  parent: null,
});

/**
 * The tables and views of a pg_dump of `public`, from the statements that
 * shape them: CREATE TABLE and VIEW, the ALTER TABLEs that add keys, defaults,
 * identities, row-level security and partitions, CREATE POLICY, and COMMENT.
 */
export function modelOf(sql) {
  const tables = new Map();
  const views = new Map();
  const table = (name) => tables.get(name) ?? views.get(name) ?? null;
  for (const { tokens } of statementsOf(sql)) {
    const w = (i) => tokens[i]?.value.toLowerCase();
    if (
      isWord(tokens[0], "create") &&
      (isWord(tokens[1], "table") || (isWord(tokens[1], "unlogged") && isWord(tokens[2], "table")))
    ) {
      let i = isWord(tokens[1], "table") ? 2 : 3;
      if (isWord(tokens[i], "if")) i += 3;
      const { name, next } = qualifiedName(tokens, i);
      if (!name || !isPunct(tokens[next], "(")) continue;
      const end = closing(tokens, next);
      const t = tableRecord(name);
      for (const item of splitTopLevel(tokens.slice(next + 1, end))) {
        if (item[0].type === "word" && /^(constraint|check|primary|unique|foreign|exclude)$/i.test(item[0].value))
          continue;
        t.columns.push(columnOf(item, sql));
      }
      if (isWord(tokens[end + 1], "partition") && isWord(tokens[end + 2], "by")) {
        t.partitionBy = textOf(sql, tokens.slice(end + 3)).toLowerCase();
      }
      tables.set(name, t);
    } else if (
      isWord(tokens[0], "create") &&
      (isWord(tokens[1], "view") || (isWord(tokens[1], "or") && isWord(tokens[3], "view")))
    ) {
      const { name } = qualifiedName(tokens, isWord(tokens[1], "view") ? 2 : 4);
      if (name) views.set(name, { name, comment: null, view: true });
    } else if (isWord(tokens[0], "alter") && isWord(tokens[1], "table")) {
      let i = 2;
      if (isWord(tokens[i], "only")) i++;
      const { name, next } = qualifiedName(tokens, i);
      const t = name && tables.get(name);
      if (!t) continue;
      i = next;
      if (isWord(tokens[i], "add") && isWord(tokens[i + 1], "constraint")) {
        const constraint = tokens[i + 2].value;
        const k = i + 3;
        if (isWord(tokens[k], "primary")) t.primaryKey = namesIn(tokens, k + 2);
        if (isWord(tokens[k], "foreign")) {
          const refAt = tokens.findIndex((x, j) => j > k && isWord(x, "references"));
          // A table in another schema (auth.users) keeps its schema; public's go without.
          const elsewhere = isPunct(tokens[refAt + 2], ".") && !isWord(tokens[refAt + 1], "public");
          const ref = elsewhere
            ? { name: `${tokens[refAt + 1].value}.${tokens[refAt + 3].value}`, next: refAt + 4 }
            : qualifiedName(tokens, refAt + 1);
          const actions = [];
          for (let j = ref.next; j < tokens.length; j++) {
            if (isWord(tokens[j], "on") && (isWord(tokens[j + 1], "delete") || isWord(tokens[j + 1], "update"))) {
              let e = j + 2;
              const words = [];
              while (
                e < tokens.length &&
                tokens[e].type === "word" &&
                !isWord(tokens[e], "on") &&
                !isWord(tokens[e], "deferrable")
              ) {
                words.push(tokens[e].value.toLowerCase());
                e++;
              }
              actions.push(`on ${w(j + 1)} ${words.join(" ")}`);
            }
          }
          t.foreignKeys.push({
            name: constraint,
            columns: namesIn(tokens, k + 2),
            references: ref.name,
            referenced: isPunct(tokens[ref.next], "(") ? namesIn(tokens, ref.next) : [],
            actions,
          });
        }
      } else if (isWord(tokens[i], "alter") && isWord(tokens[i + 1], "column")) {
        const column = t.columns.find((c) => c.name === tokens[i + 2].value);
        if (!column) continue;
        if (isWord(tokens[i + 3], "set") && isWord(tokens[i + 4], "default"))
          column.fill = textOf(sql, tokens.slice(i + 5));
        if (isWord(tokens[i + 3], "add") && isWord(tokens[i + 4], "generated")) {
          column.fill = `identity (${w(i + 5) === "always" ? "always" : "by default"})`;
        }
      } else if (isWord(tokens[i + 1], "row") && isWord(tokens[i + 2], "level")) {
        if (isWord(tokens[i], "enable")) t.rls = true;
        if (isWord(tokens[i], "force")) t.forced = true;
      } else if (isWord(tokens[i], "attach") && isWord(tokens[i + 1], "partition")) {
        const child = qualifiedName(tokens, i + 2);
        t.partitions.push({ name: child.name, bound: textOf(sql, tokens.slice(child.next)).toLowerCase() });
      }
    } else if (isWord(tokens[0], "create") && isWord(tokens[1], "policy")) {
      const policy = tokens[2].value;
      const on = qualifiedName(tokens, 4);
      const t = on.name && tables.get(on.name);
      if (!t) continue;
      const p = { name: policy, restrictive: false, command: "all", roles: [], using: null, check: null };
      for (let i = on.next; i < tokens.length; i++) {
        if (isWord(tokens[i], "as")) p.restrictive = isWord(tokens[++i], "restrictive");
        else if (isWord(tokens[i], "for")) p.command = w(++i);
        else if (isWord(tokens[i], "to")) {
          while (tokens[i + 1] && !isWord(tokens[i + 1], "using") && !isWord(tokens[i + 1], "with")) {
            i++;
            if (!isPunct(tokens[i], ",")) p.roles.push(tokens[i].value);
          }
        } else if (isWord(tokens[i], "using") && isPunct(tokens[i + 1], "(")) {
          const e = closing(tokens, i + 1);
          p.using = textOf(sql, tokens.slice(i + 2, e));
          i = e;
        } else if (isWord(tokens[i], "with") && isWord(tokens[i + 1], "check")) {
          const e = closing(tokens, i + 2);
          p.check = textOf(sql, tokens.slice(i + 3, e));
          i = e;
        }
      }
      t.policies.push(p);
    } else if (isWord(tokens[0], "comment") && isWord(tokens[1], "on")) {
      const said = tokens.at(-1)?.type === "string" ? tokens.at(-1).value : null;
      if (said === null) continue;
      if (isWord(tokens[2], "table") || isWord(tokens[2], "view")) {
        const t = table(qualifiedName(tokens, 3).name);
        if (t) t.comment = said;
      } else if (isWord(tokens[2], "column") && isPunct(tokens[4], ".") && isPunct(tokens[6], ".")) {
        const column = tables.get(tokens[5].value)?.columns.find((c) => c.name === tokens[7].value);
        if (column) column.comment = said;
      }
    }
  }
  for (const t of tables.values()) {
    for (const p of t.partitions) {
      const child = tables.get(p.name);
      if (child) child.parent = t.name;
    }
  }
  return { tables, views };
}

/** Each table packages/db/src names in a `.from("…")`, with the modules that name it. */
export function ownersOf() {
  const owners = new Map();
  for (const file of repoFiles([REPOSITORIES])) {
    for (const name of new Set(tablesNamedIn(parse(file)))) {
      owners.set(name, [...(owners.get(name) ?? []), file]);
    }
  }
  return owners;
}

/* ---- The page ---- */

/** Text for a table cell: one line, a pipe escaped. */
const cell = (s) => s.replace(/\s+/g, " ").trim().replace(/\|/g, "\\|");
/** An expression for a table cell, as code. */
const code = (s) => (s ? `\`${cell(s)}\`` : "");
/** A policy's expression in short: one line, the `(select auth.uid())` idiom as the call it wraps, no schema. */
const SHORT = 160;
function short(expr) {
  if (!expr) return "";
  const s = expr
    .replace(/\s+/g, " ")
    .replace(/\( SELECT auth\.uid\(\) AS uid\)/g, "auth.uid()")
    .replace(/\bpublic\./g, "")
    .trim();
  return code(s.length > SHORT ? `${s.slice(0, SHORT - 1).trimEnd()}…` : s);
}
const paths = (files) => files.map((f) => `\`${f}\``).join(", ");
const anchor = (name) => `[\`${name}\`](#${name})`;

function rlsOf(t) {
  if (!t.rls) return "off";
  const n = t.policies.length;
  const policies =
    n === 0 ? "no policy, so only the service role reaches it" : `${n} ${n === 1 ? "policy" : "policies"}`;
  return `on${t.forced ? ", forced" : ""}, ${policies}`;
}

function tableSection(t, owners, tables) {
  const out = [`### ${t.name}`, ""];
  if (t.comment) out.push(cell(t.comment), "");
  const owner = owners.get(t.name);
  out.push(`- Owned by: ${owner ? paths(owner) : "none"}`);
  out.push(`- Primary key: ${t.primaryKey ? t.primaryKey.map((c) => `\`${c}\``).join(", ") : "none"}`);
  out.push(`- Row-level security: ${rlsOf(t)}`);
  if (t.partitionBy) {
    const kids = t.partitions
      .filter((p) => tables.has(p.name))
      .map((p) => `\`${p.name}\` (${cell(p.bound)})`)
      .join(", ");
    out.push(
      `- Partitioned by ${cell(t.partitionBy)}: ${kids || "no partition in the snapshot"}${
        t.name === "events"
          ? "; and one per month, `events_yYYYYmMM`, made as the months come (not in the snapshot)"
          : ""
      }`,
    );
  }
  out.push("", "| Column | Type | Null | Default | Note |", "| --- | --- | --- | --- | --- |");
  for (const c of t.columns) {
    out.push(
      `| \`${c.name}\` | ${cell(c.type)} | ${c.notNull ? "no" : "yes"} | ${code(c.fill)} | ${cell(c.comment ?? "")} |`,
    );
  }
  if (t.foreignKeys.length > 0) {
    out.push("", "Foreign keys:", "");
    for (const k of [...t.foreignKeys].sort((a, b) => a.name.localeCompare(b.name))) {
      const cols = k.columns.map((c) => `\`${c}\``).join(", ");
      const target = tables.has(k.references) ? anchor(k.references) : `\`${k.references}\``;
      const to = `${target} (${k.referenced.map((c) => `\`${c}\``).join(", ")})`;
      out.push(`- ${cols} → ${to}${k.actions.length ? `, ${k.actions.join(", ")}` : ""}`);
    }
  }
  if (t.policies.length > 0) {
    out.push("", "| Policy | For | To | Using | With check |", "| --- | --- | --- | --- | --- |");
    for (const p of [...t.policies].sort((a, b) => a.name.localeCompare(b.name))) {
      const kind = p.restrictive ? " (restrictive)" : "";
      out.push(
        `| \`${p.name}\`${kind} | ${p.command} | ${p.roles.join(", ")} | ${short(p.using)} | ${short(p.check)} |`,
      );
    }
  }
  out.push("");
  return out;
}

/** The page: a header, the owners at a glance, then one section per table and per view, alphabetical. */
export function render({ tables, views }, owners) {
  const listed = [...tables.values()].filter((t) => !t.parent).sort((a, b) => a.name.localeCompare(b.name));
  const viewList = [...views.values()].sort((a, b) => a.name.localeCompare(b.name));
  const known = new Set([...tables.keys(), ...views.keys()]);
  const unknown = [...owners.keys()].filter((n) => !known.has(n)).sort();
  const out = [
    "# The data model",
    "",
    "<!-- GENERATED by tooling/scripts/gen/data-model.mjs. Do not edit: regenerate. -->",
    "",
    "Every table in the `public` schema, as the migrations leave it: its columns, its keys, whether row-level security",
    "is on and what each policy lets through, and the module in `packages/db/src` that reads and writes it (the files",
    'that name it in a `.from("…")`; "none" when no repository names it). It is written from `supabase/schema.sql`, the schema',
    "dumped from a replay of every migration, which also holds the functions, triggers, indexes and grants this page",
    "leaves out, and every policy's expression in full. A partition is listed under its parent.",
    "",
    "After a migration, with `supabase start` running: `corepack pnpm gen:schema-snapshot`, then",
    "`corepack pnpm gen:data-model`. `tooling/scripts/tests/docs/data-model.test.mjs` fails when this page is not",
    "what the script writes.",
    "",
    "## Owners",
    "",
    "| Table | Owned by | Row-level security |",
    "| --- | --- | --- |",
    ...listed.map(
      (t) => `| ${anchor(t.name)} | ${owners.has(t.name) ? paths(owners.get(t.name)) : "none"} | ${rlsOf(t)} |`,
    ),
    ...viewList.map(
      (v) => `| ${anchor(v.name)} (view) | ${owners.has(v.name) ? paths(owners.get(v.name)) : "none"} | |`,
    ),
    "",
  ];
  if (unknown.length > 0) {
    out.push(
      'Named in a `.from("…")` in `packages/db/src` and not a table or view here: ' +
        unknown.map((n) => `\`${n}\` (${paths(owners.get(n))})`).join(", ") +
        ".",
      "",
    );
  }
  out.push("## Tables", "");
  for (const t of listed) out.push(...tableSection(t, owners, tables));
  if (viewList.length > 0) {
    out.push("## Views", "", "Each view's definition is in `supabase/schema.sql`.", "");
    for (const v of viewList) {
      out.push(`### ${v.name}`, "");
      if (v.comment) out.push(cell(v.comment), "");
      out.push(`- Owned by: ${owners.has(v.name) ? paths(owners.get(v.name)) : "none"}`, "");
    }
  }
  return out.join("\n").replace(/\n+$/, "\n");
}

/** The page as the committed snapshot and repositories say it should read. */
export function generate() {
  const snapshot = fs.readFileSync(path.join(ROOT, SNAPSHOT), "utf8").replace(/\r\n/g, "\n");
  return render(modelOf(snapshot), ownersOf());
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.join(ROOT, OUT);
  const next = generate();
  const tables = (next.match(/^### /gm) ?? []).length;
  if (!process.argv.includes("--check")) {
    fs.writeFileSync(out, next);
    console.log(`wrote ${OUT} (${tables} sections, ${next.split("\n").length - 1} lines)`);
    process.exit(0);
  }
  const current = fs.existsSync(out) ? fs.readFileSync(out, "utf8").replace(/\r\n/g, "\n") : "";
  if (current === next) {
    console.log(`${OUT} is current (${tables} sections).`);
    process.exit(0);
  }
  console.error(`${OUT} is stale: run \`corepack pnpm gen:data-model\` and commit the result.`);
  process.exit(1);
}
