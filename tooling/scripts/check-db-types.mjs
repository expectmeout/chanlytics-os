#!/usr/bin/env node
/**
 * The generated database types, proved against the database itself.
 *
 * packages/db/src/database.types.ts is what `supabase gen types` writes, and
 * nothing held it to the migrations. An added column fails typecheck the
 * moment code uses it, but a DROPPED or RETYPED column stays in the file,
 * typechecks clean and fails in production. This regenerates the types from
 * the LOCAL stack -- the database `supabase start` builds out of every
 * migration, which needs no access token and is never a `db push` behind the
 * migrations the way the linked project is -- and compares them with the
 * committed file.
 *
 *   supabase start
 *   corepack pnpm gen:db-types       write packages/db/src/database.types.ts
 *   corepack pnpm check:db-types     exit 1 if the file is stale (database.yml)
 *
 * Exactly ONE line is ignored: `PostgrestVersion: "..."` inside
 * __InternalSupabase, which the generator reads off the running PostgREST, so
 * the linked project and the local stack report different values for the same
 * schema. That line is environment, not schema. Everything else the generator
 * emits for one schema is byte-stable, so everything else has to match.
 *
 * Exit codes: 0 current, 1 stale, 2 the CLI could not be run or did not
 * produce types -- a check that cannot run must not pass. SUPABASE_CLI names
 * the binary when `supabase` is not on PATH.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const OUT = "packages/db/src/database.types.ts";
export const FIX = "supabase start && corepack pnpm gen:db-types";

// The whole line and nothing but: the comment above it in the generated file
// also says `PostgrestVersion: 'XX'`, in single quotes and mid-sentence, and
// that comment is part of what must match.
const VERSION_LINE = /^[ \t]*PostgrestVersion: "([^"\n]*)"[ \t]*$/m;

/** The PostgREST version a types file records, or null when it has none. */
export function postgrestVersion(src) {
  return VERSION_LINE.exec(src.replace(/\r\n/g, "\n"))?.[1] ?? null;
}

/** LF line endings, and the one environment-dependent line dropped. */
export function normalise(src) {
  const lf = src.replace(/\r\n/g, "\n");
  const m = VERSION_LINE.exec(lf);
  if (!m) return lf;
  const end = lf.indexOf("\n", m.index);
  return lf.slice(0, m.index) + (end === -1 ? "" : lf.slice(end + 1));
}

/**
 * Where the first difference is, in the committed file's own line numbers and
 * under the schema entry that holds it (public.Tables.contacts), so the red
 * run names the table rather than a byte offset.
 */
function firstDifference(committed, generated) {
  const a = normalise(committed).split("\n");
  const b = normalise(generated).split("\n");
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i >= a.length && i >= b.length) return null;
  // normalise() removed one line above the difference, if the file had it.
  const lf = committed.replace(/\r\n/g, "\n");
  const versionAt = VERSION_LINE.exec(lf);
  const dropped = versionAt ? lf.slice(0, versionAt.index).split("\n").length - 1 : -1;
  const line = i + 1 + (dropped >= 0 && i >= dropped ? 1 : 0);
  const within = [];
  const source = i < a.length ? a : b;
  for (const indent of [6, 4, 2]) {
    for (let j = Math.min(i, source.length - 1); j >= 0; j--) {
      const m = new RegExp(`^ {${indent}}"?([\\w-]+)"?: \\{$`).exec(source[j]);
      if (m) { within.unshift(m[1]); break; }
      if (/^ {0,5}\S/.test(source[j]) && indent === 6) break;
    }
  }
  return { line, within: within.join("."), committed: a[i] ?? null, generated: b[i] ?? null };
}

/** The committed file against a fresh generation: same, or where they part. */
export function compare(committed, generated) {
  const same = normalise(committed) === normalise(generated);
  return {
    same,
    committedVersion: postgrestVersion(committed),
    generatedVersion: postgrestVersion(generated),
    diffHint: same ? null : firstDifference(committed, generated),
  };
}

/** A file that is not the generator's output must not pass as "current". */
function looksGenerated(src) {
  return /^export type Database = \{$/m.test(src) && /^ {2}public: \{$/m.test(src) && /^ {4}Tables: \{$/m.test(src);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const CLI = process.env.SUPABASE_CLI || "supabase";
  const check = process.argv.includes("--check");
  const out = path.join(ROOT, OUT);

  // The npm-distributed CLI is a JavaScript launcher; run that one with this Node.
  const [cmd, pre] = CLI.endsWith(".js") ? [process.execPath, [CLI]] : [CLI, []];
  let generated;
  try {
    generated = execFileSync(cmd, [...pre, "gen", "types", "typescript", "--local"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    const why = (e && typeof e.stderr === "string" && e.stderr.trim()) || (e instanceof Error ? e.message : String(e));
    console.error(`check-db-types: could not generate types with "${CLI}". Is \`supabase start\` running? ${why}`);
    process.exit(2);
  }
  if (!looksGenerated(generated)) {
    console.error(`check-db-types: "${CLI}" produced ${generated.length} bytes that are not generated types -- is this the database \`supabase start\` built from supabase/migrations?`);
    process.exit(2);
  }

  const lines = generated.split("\n").length - 1;
  if (!check) {
    fs.writeFileSync(out, generated);
    console.log(`wrote ${OUT} (${lines} lines)`);
    process.exit(0);
  }

  const committed = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  const r = compare(committed, generated);
  const versions = `PostgREST ${r.committedVersion ?? "none"} committed, ${r.generatedVersion ?? "none"} generated: the one line the comparison ignores, read off the running stack.`;
  if (r.same) {
    console.log(`${OUT} is current (${lines} lines). ${versions}`);
    process.exit(0);
  }
  console.error(`${OUT} is stale: the migrations build a schema the committed types do not describe.`);
  if (r.diffHint) {
    const where = r.diffHint.within ? `, in ${r.diffHint.within}` : "";
    console.error(`  first difference at line ${r.diffHint.line}${where}:`);
    console.error(`    committed  ${r.diffHint.committed === null ? "(end of file)" : r.diffHint.committed.trim()}`);
    console.error(`    generated  ${r.diffHint.generated === null ? "(end of file)" : r.diffHint.generated.trim()}`);
  }
  console.error(`  ${versions}`);
  console.error(`Run \`${FIX}\`, and commit the result.`);
  process.exit(1);
}
