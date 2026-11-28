#!/usr/bin/env node
/**
 * Either deploy order, held for a function a migration writes again or takes away: the code main runs today can
 * still call it the way it does.
 *
 * Every migration says its deploy order, and nearly all say "this migration first" or "either". Nothing held one to
 * it. A migration is applied before its merge (docs/runbook.md, Apply a migration), so the code that meets it first is
 * the release before it, on both apps, for as long as the two deploys take, and again after a roll back. A function
 * re-made with an argument renamed, retyped, taken away or added with no default refuses that code's call
 * (PostgREST answers PGRST202, "could not find the function"), and a customer sees it as a page that will not save.
 *
 * So the schema's snapshot (supabase/schema.sql, which the Database workflow holds to the migrations) is read at the
 * pull request's base and at its head, and each function the base has is held to this: the head has a function of
 * that name that takes the same arguments in the same places under the same names and types, any argument it adds has
 * a default, none lost a default, and what it answers kept its type (a table's columns each kept; a function that
 * answered nothing may answer anything). A function that breaks it and that the base's own code still names, as a
 * string in `apps` or `packages`, fails. One no code names any more passes, and is said. No stack is needed.
 *
 * A change that must follow the code (a door the new code stopped calling, taken away) says so in its migration's
 * header, in these words, and is then applied by migrate.yml after the merge (the runbook's step 5):
 *
 *   -- Deploy order: after the deploys. <why>
 *
 *   node tooling/scripts/checks/deploy-order/old-callers.mjs --base origin/main    # database.yml, on a pull request
 *
 * It exits 0 when every function the base's code calls still takes its call, 1 naming each that does not, and 2 when
 * the base cannot be read. tests/database/ledger/old-callers.test.mjs plants each break and reads the real snapshot.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closing, isPunct, isWord, qualifiedName, splitTopLevel, statementsOf } from "../../gen/schema-snapshot.mjs";
import { LEDGER, MIGRATIONS } from "../migration-ledger.mjs";

export const SNAPSHOT = "supabase/schema.sql";

/** The words a migration's header argues a break with: it is applied after both apps deploy, by migrate.yml. */
export const AFTER_THE_DEPLOYS = /^\s*--.*\bdeploy order:\s*after the deploys\b/im;

const MODES = new Set(["in", "out", "inout", "variadic"]);
/** Types spelled in more than one word; the first word alone would read as an argument's name. */
const MULTI_WORD_TYPE =
  /^(double precision|character varying|bit varying|(timestamp|time)( ?\(\d+\))? with(out)? time zone)\b/i;

const spaced = (text) => text.replace(/\s+/g, " ").trim().toLowerCase();

/** One argument of a signature as pg_dump prints it: its mode, its name (null for one with none), its type, its default. */
function argumentOf(tokens, sql) {
  let ts = tokens;
  const cut = ts.findIndex((t, i) => i > 0 && (isWord(t, "default") || isPunct(t, "=")));
  if (cut > 0) ts = ts.slice(0, cut);
  let mode = "in";
  if (ts.length > 1 && ts[0].type === "word" && MODES.has(ts[0].value.toLowerCase())) {
    mode = ts[0].value.toLowerCase();
    ts = ts.slice(1);
  }
  const text = (from) => spaced(sql.slice(ts[from].start, ts[ts.length - 1].end));
  const named = ts.length > 1 && ts[1].type !== "punct" && !MULTI_WORD_TYPE.test(text(0));
  return { mode, name: named ? ts[0].value.toLowerCase() : null, type: text(named ? 1 : 0), hasDefault: cut > 0 };
}

/** What a function answers: a table's columns, each with its type, or the type's own words. */
function answerOf(tokens, sql, from) {
  const at = tokens.findIndex((t, i) => i > from && isWord(t, "returns"));
  if (at < 0) return { text: "void", table: null };
  if (isWord(tokens[at + 1], "table") && isPunct(tokens[at + 2], "(")) {
    const end = closing(tokens, at + 2);
    const table = splitTopLevel(tokens.slice(at + 3, end)).map((col) => ({
      name: col[0].value.toLowerCase(),
      type: spaced(sql.slice(col[1].start, col[col.length - 1].end)),
    }));
    return { text: "a table", table };
  }
  // pg_dump writes LANGUAGE straight after the answer's type.
  const stop = tokens.findIndex((t, i) => i > at && (isWord(t, "language") || t.type === "dollar"));
  const last = tokens[(stop < 0 ? tokens.length : stop) - 1];
  return { text: spaced(sql.slice(tokens[at + 1].start, last.end)), table: null };
}

/**
 * Every function a snapshot holds in the public schema: its name, the arguments it takes in (in, inout and variadic,
 * in order) and what it answers. Read as the snapshot writes one: `CREATE FUNCTION public.name(…) RETURNS …`.
 */
export function functionsIn(sql) {
  const out = [];
  for (const { tokens } of statementsOf(sql)) {
    if (!isWord(tokens[0], "create")) continue;
    const at = isWord(tokens[1], "or") && isWord(tokens[2], "replace") ? 3 : 1;
    if (!isWord(tokens[at], "function")) continue;
    const { name, next } = qualifiedName(tokens, at + 1);
    if (!name || !isPunct(tokens[next], "(")) continue;
    const end = closing(tokens, next);
    const takes = splitTopLevel(tokens.slice(next + 1, end))
      .map((a) => argumentOf(a, sql))
      .filter((a) => a.mode !== "out");
    out.push({ name, takes, answers: answerOf(tokens, sql, end) });
  }
  return out;
}

/** A function as a person would write its call: `name(p_one uuid, p_two integer)`. */
export const signatureOf = (fn) =>
  `${fn.name}(${fn.takes.map((a) => (a.name ? `${a.name} ${a.type}` : a.type)).join(", ")})`;

const nth = (i) => ["first", "second", "third", "fourth", "fifth"][i] ?? `${i + 1}th`;

/**
 * Why a call written for `old` is refused by `next`, or null when it lands as it did: by position and by name, with
 * what it left out still left out.
 */
export function whyRefused(old, next) {
  for (let i = 0; i < old.takes.length; i++) {
    const was = old.takes[i];
    const now = next.takes[i];
    const called = was.name ?? `its ${nth(i)} argument`;
    if (!now) return `it no longer takes ${called}`;
    if (now.name !== was.name) return `its ${nth(i)} argument is ${now.name ?? "unnamed"} where it was ${called}`;
    if (now.type !== was.type) return `${called} is ${now.type} where it was ${was.type}`;
    if (was.hasDefault && !now.hasDefault) return `${called} must be given now, where it had a default`;
  }
  for (const added of next.takes.slice(old.takes.length))
    if (!added.hasDefault) return `it asks for ${added.name ?? "one more argument"}, which no old call gives`;
  const was = old.answers;
  const now = next.answers;
  if (was.table) {
    if (!now.table) return `it answers ${now.text} where it answered a table`;
    for (const col of was.table) {
      const kept = now.table.find((c) => c.name === col.name);
      if (!kept) return `its answer lost the column ${col.name}`;
      if (kept.type !== col.type) return `its answer's ${col.name} is ${kept.type} where it was ${col.type}`;
    }
    return null;
  }
  if (was.text !== "void" && was.text !== now.text) return `it answers ${now.text} where it answered ${was.text}`;
  return null;
}

/**
 * The base's functions an old call no longer lands on, each with why: gone, or re-made so that no function of its
 * name takes the call. A function beside it under the same name (an overload kept for old callers) answers for it.
 */
export function refusedCalls(baseFunctions, headFunctions) {
  const byName = new Map();
  for (const fn of headFunctions) byName.set(fn.name, [...(byName.get(fn.name) ?? []), fn]);
  const refused = [];
  for (const old of baseFunctions) {
    const now = byName.get(old.name) ?? [];
    if (!now.length) {
      refused.push({ name: old.name, was: signatureOf(old), why: "it is gone" });
      continue;
    }
    const whys = now.map((next) => whyRefused(old, next));
    if (whys.includes(null)) continue;
    // The nearest of its name says why: the one that takes as many arguments, else the first.
    const nearest = Math.max(
      0,
      now.findIndex((next) => next.takes.length === old.takes.length),
    );
    refused.push({ name: old.name, was: signatureOf(old), why: whys[nearest] });
  }
  return refused;
}

/**
 * The refused calls as the check judges them. `callersOf(name)` is the base's files that name the function; `argued`
 * the names a migration this branch adds says it changes after the deploys. `{ problems, notes }`, each a sentence.
 */
export function judgeRefused(refused, callersOf, argued = new Set()) {
  const problems = [];
  const notes = [];
  for (const r of refused) {
    const callers = callersOf(r.name);
    if (!callers.length) {
      notes.push(`${r.was}: ${r.why}, and no code on the base names it, so no release calls it.`);
      continue;
    }
    const where = `${callers[0]}${callers.length > 1 ? ` and ${callers.length - 1} more` : ""}`;
    if (argued.has(r.name)) {
      notes.push(
        `${r.was}: ${r.why}. Its migration says it is applied after the deploys, so the code that still calls it (${where}) is gone from both apps first: apply it with migrate.yml after the merge.`,
      );
      continue;
    }
    problems.push(
      `${r.was}: ${r.why}, and the code main runs today still calls it (${where}). A migration is applied before its merge, so that code meets it first, and again after a roll back. Keep the old call working: give a new argument a default, or keep the old function beside the new one until no release calls it. Where the change must follow the code, say "Deploy order: after the deploys" in the migration's header and apply it with migrate.yml after the merge (docs/runbook.md, Apply a migration, step 5).`,
    );
  }
  return { problems, notes };
}

/** The names, as words, that the migrations arguing "after the deploys" say: what each may change behind the code. */
export function arguedAfterTheDeploys(migrationTexts) {
  const names = new Set();
  for (const text of migrationTexts)
    if (AFTER_THE_DEPLOYS.test(text)) for (const word of text.match(/\w+/g) ?? []) names.add(word.toLowerCase());
  return names;
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const args = process.argv.slice(2);
  const ref = args[args.indexOf("--base") + 1];
  if (!args.includes("--base") || !ref) {
    console.error("usage: node tooling/scripts/checks/deploy-order/old-callers.mjs --base <ref>");
    process.exit(2);
  }
  const git = (...a) =>
    execFileSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });
  let base;
  try {
    // The merge base, so a branch behind main is held to what it changed, not to what main gained since.
    base = git("merge-base", ref, "HEAD").trim();
  } catch {
    console.error(`Could not read ${ref}: no such commit here (a checkout with the whole history has it).`);
    process.exit(2);
  }
  let baseSql;
  try {
    baseSql = git("show", `${base}:${SNAPSHOT}`);
  } catch {
    console.log(`${ref} has no ${SNAPSHOT} yet: nothing to hold this one to.`);
    process.exit(0);
  }
  const headSql = fs.readFileSync(path.join(root, SNAPSHOT), "utf8");
  const same = baseSql.replace(/\r\n/g, "\n") === headSql.replace(/\r\n/g, "\n");
  const refused = same ? [] : refusedCalls(functionsIn(baseSql), functionsIn(headSql));
  if (!refused.length) {
    console.log(
      `old callers against ${ref}: ${same ? "the schema is as it was" : "every function the base has still takes its call"}`,
    );
    process.exit(0);
  }
  // The base's own code, read where it stands: a file that says the function's name as a string.
  const callersOf = (name) => {
    try {
      const said = [`"${name}"`, `'${name}'`, `\`${name}\``].flatMap((s) => ["-e", s]);
      return git("grep", "-l", "-F", ...said, base, "--", "apps", "packages")
        .split("\n")
        .filter(Boolean)
        .map((line) => line.slice(line.indexOf(":") + 1))
        .filter((file) => !/\.generated\.|database\.types\.ts$/.test(file));
    } catch {
      return [];
    }
  };
  // The migrations this branch adds: the folder's files the base's ledger does not hold.
  let landed = new Set();
  try {
    landed = new Set(Object.keys(JSON.parse(git("show", `${base}:${LEDGER}`)).migrations ?? {}));
  } catch {
    /* a base with no ledger holds none */
  }
  const dir = path.join(root, MIGRATIONS);
  const added = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && !landed.has(f))
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8"));
  const { problems, notes } = judgeRefused(refused, callersOf, arguedAfterTheDeploys(added));
  for (const n of notes) console.log(`- ${n}`);
  for (const p of problems) console.error(`- ${p}`);
  console.log(
    problems.length
      ? `old callers against ${ref}: ${problems.length} call(s) the last release makes would be refused`
      : `old callers against ${ref}: every function the base's code calls still takes its call`,
  );
  process.exit(problems.length ? 1 : 0);
}

// Run as a script, not when a test imports it.
const real = (p) => fs.realpathSync.native(p);
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) main();
