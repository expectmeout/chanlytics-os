/**
 * The measures behind docs/debt.md, in one module: every number the build holds, each with the rule it stands for
 * (RATCHETS, below).
 *
 * A number may only fall, and since 28 October 2026 (decision 0074) it is held change by change: CI measures a pull
 * request's base and its head (tooling/scripts/checks/debt.mjs), and a number that rose, or an offender that is new,
 * fails the change unless its description says why, in a line `Debt: <why>`. No baseline is committed for these, so a
 * fall needs no banking and no two changes meet in a file of numbers. The tests that held them (code-health-ratchets,
 * wire-casing, event-kinds, journey) now hold what each measure means, on sources written for it.
 *
 * The limits are the scorecard's proposal and, where ESLint has the rule, its
 * defaults: 150 lines a function, 30 branches, 5 levels; 800 lines a file; 20
 * modules a directory; a name in three files is a copy. When a tree holds no
 * function over the limits, the matching ESLint rule goes on for that tree and the limit stops
 * being a ratchet and becomes a lint error (eslint.config.mjs, LIMITED_TREES).
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { ROOT, readCode, readRaw, readerFiles } from "./_source.mjs";
import {
  repoFiles,
  parse,
  functionsIn,
  linesOf,
  windowUse,
  copiesAmong,
  castsIn,
  tableNames,
  tablesWrittenIn,
  rpcNames,
  serviceRoleReaches,
  importsMatching,
  workspacelessStatements,
  headerOf,
  durationsIn,
  zonelessDatesIn,
  zoneReadersIn,
  inlineStyles,
  handRoutesIn,
  seedReadsOutsideADemo,
  needsHumanReads,
  resumesUnasked,
  sourceReads,
  mediaPreludes,
  mediaWidths,
  stringsIn,
  visitsWrittenIn,
  fixedWaitsIn,
  SOURCE,
} from "./_ast.mjs";
import { cssOf, isPrimitiveClass, STYLE_VALUE_FIELDS } from "./_css.mjs";
import { CLOCKS } from "./clocks/_clocks.mjs";
import { OUT as SCHEMA_SQL, functionChangesIn, statementsOf } from "../gen/schema-snapshot.mjs";
import { SCHEMA_SETS } from "@chanlytics/contracts";
import { ERASURE_STRATEGIES } from "@chanlytics/db";
import { SUITES } from "../checks/test.mjs";

/** A function's limits: eslint.config.mjs's FUNCTION_LIMITS, as errors where this holds nothing. */
export const LIMIT = { lines: 150, branches: 30, depth: 5 };
const FILE_LIMIT = 800;
const DIRECTORY_LIMIT = 20;
const COPY_LIMIT = 3;
/** The suffix of a tables key that counts a file's `.rpc("…")` calls rather than its `.from("…")`. */
export const RPC_KEY = "::rpc";

/** The code that ships: the two apps and the packages' sources. Tests and specs are not held to a function's size. */
const SRC = repoFiles(["apps", "packages"]);
/** Where a directory's size is measured: everything hand-written, the tests included. */
const TREES = repoFiles(["apps", "packages", "tooling/scripts", "e2e"]);
/** The shell and its bridge: the only code that may touch `window` at all. */
const SHELL = SRC.filter((f) => f.startsWith("apps/dashboard/src/"));
/** A route module exports what the framework names (GET, POST, default); those are not copies. */
const notARoute = (f) => !/^apps\/dashboard\/app\/|^apps\/edge\/api\//.test(f);
/** The doors: the edge's provider webhooks, sweeps and admin doors, and the dashboard's member routes. */
export const ROUTES = SRC.filter((f) => /^apps\/edge\/api\/|^apps\/dashboard\/app\/api\//.test(f) && /\.tsx?$/.test(f));
/**
 * What a door does not import (specifiers as written, so the edge's relative facade of a package is a pattern of its
 * own beside the package): a repository (`@chanlytics/db`, or supabase-js, which is one's client) and a provider client
 * (`@chanlytics/channels`, whose `providerFetch` and wires are the providers' own). A door that holds one holds a rule
 * or a table query the layer behind it should. The edge's `lib/pg` handle is not named: nearly every door takes it to
 * pass on, and the tables ratchet already counts the ones that query it.
 */
export const DOOR_FORBIDS = [
  /^@chanlytics\/(db|channels)$/,
  /^@supabase\/supabase-js$/,
  /(^|\/)lib\/packages\/(db|channels)(\.js)?$/,
];
/**
 * Where a length of time is measured: the shipped sources, less what cannot import the units' home — the shell's
 * classic scripts (legacy/) and the static files the browser loads as they are (public/) — and less the home itself.
 */
const TIMED = SRC.filter(
  (f) =>
    !/^apps\/dashboard\/src\/legacy\/|^apps\/dashboard\/public\/|(^|\/)test\/|\.test\.|^packages\/[^/]+\/(?!src\/)/.test(
      f,
    ) && f !== "packages/contracts/src/shared/time.ts",
);

/** Where a date said with no zone is counted: every module that runs, the tests and what a package builds left out. */
const ZONED = SRC.filter((f) => !/(^|\/)test\/|\.test\.|^packages\/[^/]+\/(?!src\/)/.test(f));

/**
 * The dashboard's stylesheets, which the interface kit's measures hold
 * (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.7). The tokens are where a literal value belongs, so
 * they are measured by neither; the kit is where a primitive belongs, so it is measured for its values, never for its
 * primitives. A class the kit's registry lists (kit/classes.json, which _css.mjs reads) is a primitive in every other
 * stylesheet, whatever its words.
 */
export const TOKENS_CSS = "apps/dashboard/src/legacy/styles/tokens.css";
const KIT_CSS = "apps/dashboard/src/surfaces/kit/kit.css";
const STYLES = repoFiles(["apps/dashboard"], { keep: /\.css$/ }).filter((f) => f !== TOKENS_CSS);
/**
 * Where the dashboard's layout changes: every stylesheet's @media rules, the tokens' own among them, and the media
 * queries its scripts write (a matchMedia call, a named query, a <source media>).
 */
const DASHBOARD_CSS = repoFiles(["apps/dashboard"], { keep: /\.css$/ });
const DASHBOARD_SRC = SRC.filter((f) => f.startsWith("apps/dashboard/"));

/**
 * The widths the set holds, read from the tokens themselves (`--bp-phone`, `--bp-narrow`), so the set is written once.
 * A token file that writes none leaves the ratchet nothing to hold a width to, and says so rather than count every
 * width a stray.
 */
export function breakpointSet() {
  const css = readRaw(TOKENS_CSS).replace(/\/\*[\s\S]*?\*\//g, "");
  const set = [...css.matchAll(/--bp-[a-z-]+\s*:\s*(\d+)px\s*;/g)].map((m) => Number(m[1]));
  if (!set.length) throw new Error(`${TOKENS_CSS} writes no --bp- token: the breakpoints ratchet has no set`);
  return new Set(set);
}
/**
 * The shell's markup, which the kit will style: the legacy pages and components, and the surfaces that leave them
 * (§3.7). The app's own error screens and the bridge's host draw before the stylesheets or without them, so a prop is
 * all they have and they are not held.
 */
const MARKUP = SRC.filter((f) => /^apps\/dashboard\/src\/(legacy|surfaces)\/.*\.(jsx|tsx)$/.test(f));

/** The tables whose every row belongs to one workspace: each names `tenant_id` in its Row (the generated types). */
export function tenantTablesOf() {
  const tables = new Set();
  let table = null;
  let inRow = false;
  let inTables = false;
  for (const line of fs.readFileSync(path.join(ROOT, "packages/db/src/database.types.ts"), "utf8").split(/\r?\n/)) {
    if (/^ {2}public: \{/.test(line)) inTables = true;
    else if (/^ {2}\w+: \{/.test(line)) inTables = false;
    if (!inTables) continue;
    const t = /^ {6}(\w+): \{$/.exec(line);
    if (t) table = t[1];
    if (/^ {8}Row: \{$/.test(line)) inRow = true;
    else if (inRow && /^ {8}\}$/.test(line)) inRow = false;
    else if (inRow && table && /^ {10}tenant_id: /.test(line)) tables.add(table);
  }
  return tables;
}

/** The column types that can hold a person's words: text, json, and their arrays (decision 0036). */
const WORD_TYPES = new Set(["text", "text[]", "jsonb", "jsonb[]", "json", "character varying", "citext", "bytea"]);

/**
 * Every column of a workspace table that can hold a person's words, as `table.column`, from the schema a replay builds
 * (supabase/schema.sql): a table that names `tenant_id`, its partitions read through it; a column of a word type the
 * schema does not hold to a closed set (contracts SCHEMA_SETS). What packages/db's ERASURE_STRATEGIES must name.
 */
export function personalColumns() {
  const sql = readRaw(SCHEMA_SQL);
  const partitions = new Set([...sql.matchAll(/ATTACH PARTITION public\.(\w+)/g)].map((m) => m[1]));
  const out = [];
  for (const [, table, body] of sql.matchAll(/^CREATE TABLE public\.(\w+) \(\n([\s\S]*?)\n\)/gm)) {
    if (partitions.has(table)) continue;
    const columns = body
      .split("\n")
      .map((line) => line.trim().replace(/,$/, ""))
      .filter((line) => line && !line.startsWith("CONSTRAINT"))
      .map((line) => /^"?(\w+)"? (.+?)(?: DEFAULT .*| NOT NULL.*| GENERATED .*)?$/.exec(line))
      .filter(Boolean)
      .map(([, name, type]) => ({ name, type: type.trim() }));
    if (!columns.some((c) => c.name === "tenant_id")) continue;
    for (const c of columns)
      if (WORD_TYPES.has(c.type) && !Object.hasOwn(SCHEMA_SETS, `${table}.${c.name}`)) out.push(`${table}.${c.name}`);
  }
  return out.sort();
}

/** A file that reads across workspaces on purpose says so in its header, as a line `Cross-workspace: <why>`. */
export const CROSS_WORKSPACE = /^\s*(?:\/\/|\/\*\*|\*)?\s*Cross-workspace: \S/m;
/** The edge's own code: its doors and what they call, less the facades that re-export the packages' dist. */
const EDGE = SRC.filter((f) => /^apps\/edge\/(api|lib)\//.test(f) && !f.startsWith("apps/edge/lib/packages/"));

/** `{ file: n }` for each of `files` whose syntax tree `count` puts over `floor`. */
const perFile = (files, count, floor = 0) =>
  Object.fromEntries(files.map((f) => [f, count(parse(f))]).filter(([, n]) => n > floor));

/**
 * The writes a module of the dashboard's browser code makes past the verb layer (legacy-bridge/verbs): each call
 * `api()("POST …")`, `PUT`, `PATCH` or `DELETE` with its route written in place. A write that goes through its verb's spec
 * makes the same call Ask's card makes for the same act, says the same receipt and offers the same undo (the sheets as
 * verbs, 14 Oct 2026); one made here makes its own.
 */
const BROWSER_WRITERS = SHELL.filter(
  (f) =>
    /^apps\/dashboard\/src\/(surfaces|legacy-bridge)\//.test(f) &&
    !f.startsWith("apps/dashboard/src/legacy-bridge/verbs/"),
);
function writesPastVerbs(sf) {
  let n = 0;
  const walk = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isCallExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "api"
    ) {
      const first = node.arguments[0];
      if (first && ts.isStringLiteralLike(first) && /^(POST|PUT|PATCH|DELETE) /.test(first.text)) n += 1;
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return n;
}

/** One entry per baseline under tests/baselines/: what it holds, and what to do when it rises. */
/* ---- Writers per table (decision 0031, invariant 1: one record, one door writes it) ---- */

/** A token of the snapshot's SQL that is the word `v`, in any case. */
const isSqlWord = (t, v) => t?.type === "word" && t.value.toLowerCase() === v;

/**
 * The schema's tables, by name: each `create table public.<name>` the replayed migrations' snapshot holds. Its `views`
 * names each view drawn from one table with that table (00440's old names): a write through such a view is a write of
 * its table.
 */
function schemaTables(sql) {
  const tables = new Set();
  const views = new Map();
  for (const { tokens } of statementsOf(sql)) {
    if (!isSqlWord(tokens[0], "create")) continue;
    if (isSqlWord(tokens[1], "view")) {
      const name = isSqlWord(tokens[2], "public") && tokens[3]?.value === "." ? tokens[4] : tokens[2];
      const from = tokens.flatMap((t, k) => (isSqlWord(t, "from") || isSqlWord(t, "join") ? [k] : []));
      const base = from.length === 1 ? tokens[from[0] + (isSqlWord(tokens[from[0] + 1], "public") ? 3 : 1)] : null;
      if (name && base) views.set(name.value.toLowerCase(), base.value.toLowerCase());
      continue;
    }
    if (!isSqlWord(tokens[1], "table")) continue;
    const at = isSqlWord(tokens[2], "if") ? 5 : 2;
    const name = isSqlWord(tokens[at], "public") && tokens[at + 1]?.value === "." ? tokens[at + 2] : tokens[at];
    if (name?.type === "word" || name?.type === "ident") tables.add(name.value.toLowerCase());
  }
  for (const [view, base] of views) if (!tables.has(base)) views.delete(view);
  return Object.assign(tables, { views });
}

/**
 * The tables a SQL function's body writes, read from its tokens: `insert into`, `delete from`, and `update` that is not
 * an upsert's `do update` or a lock's `for update` / `for no key update`. A name the schema has no table for (a CTE,
 * `set`) is not one. A statement built as a string (`execute format(…)`) is not seen. With `inserts`, only the tables
 * it inserts into.
 */
export function tablesWrittenBy(body, tables, { inserts = false } = {}) {
  const out = new Set();
  const toks = statementsOf(body).flatMap((x) => x.tokens);
  const nameAt = (k) => (isSqlWord(toks[k], "public") && toks[k + 1]?.value === "." ? toks[k + 2] : toks[k]);
  for (let k = 0; k < toks.length; k++) {
    let t = null;
    if (isSqlWord(toks[k], "insert") && isSqlWord(toks[k + 1], "into")) t = nameAt(k + 2);
    else if (inserts) continue;
    else if (isSqlWord(toks[k], "delete") && isSqlWord(toks[k + 1], "from")) t = nameAt(k + 2);
    else if (isSqlWord(toks[k], "update") && !["do", "for", "key"].some((w) => isSqlWord(toks[k - 1], w)))
      t = nameAt(isSqlWord(toks[k + 1], "only") ? k + 2 : k + 1);
    const name = t?.type === "word" || t?.type === "ident" ? t.value.toLowerCase() : null;
    const table = name && (tables.has(name) ? name : tables.views?.get(name));
    if (table) out.add(table);
  }
  return out;
}

/**
 * Written from many places by design, so not held to one door: `events`, which every door writes in its own fact's
 * transaction (0031, invariant 2); `decisions`, the row every verb writes beside the change to its subject; and
 * `sweep_status`, where each clock stamps its own row.
 */
const MANY_WRITERS_BY_DESIGN = new Set(["events", "decisions", "sweep_status"]);

/**
 * A writer that only removes what age or an erasure takes, which reaches its tables by design: a purge, a scrub, the
 * erasure's own legs (erase_contact, and the triggers its tombstone fires, `<table>_erase_on_contact` and
 * `<column>_on_erase`), and lead_blank, the one function retention and erasure blank a lead through. 0036's registry is
 * what holds those, not this count. Waived for what such a writer updates and deletes, never for a table it inserts into:
 * a row it adds (a suppression an erasure leaves, say) is a writer of that table like any other.
 */
const takesAway = (who) =>
  /^(purge_|erase_)|scrub|(_erase_on_contact|_on_erase)\(\)$|^lead_blank\(\)$/.test(who) ||
  who === "packages/db/src/erasure/legs.ts";

/**
 * Each table and who writes it: every source module whose supabase-js chain writes it (_ast.mjs tablesWrittenIn), and
 * every live SQL function whose body does, as supabase/schema.sql holds the functions the migrations leave standing.
 * A table written from many places by design, and what a writer that takes away updates or deletes, are left out.
 */
export function writersByTable() {
  const sql = readRaw(SCHEMA_SQL);
  const tables = schemaTables(sql);
  const writers = new Map();
  const add = (table, who, inserted = false) => {
    if (!tables.has(table) || MANY_WRITERS_BY_DESIGN.has(table) || (takesAway(who) && !inserted)) return;
    if (!writers.has(table)) writers.set(table, new Set());
    writers.get(table).add(who);
  };
  for (const f of SRC) for (const t of tablesWrittenIn(parse(f))) add(t, f);
  for (const c of functionChangesIn(sql))
    if (c.kind === "create" && c.body) {
      const inserted = tablesWrittenBy(c.body, tables, { inserts: true });
      for (const t of tablesWrittenBy(c.body, tables)) add(t, `${c.name}()`, inserted.has(t));
    }
  return writers;
}

/* ---- Doors writing a record with no event (decision 0031, invariant 2: a fact and its event share a transaction) ---- */

/** The spine's own rows: an event's outbox row and its deliveries, and the jobs that carry reactions. What a fact causes. */
const SPINE = new Set(["event_outbox", "event_deliveries", "jobs"]);

/** A statement of the snapshot that does not run on past a blank line, which ends every statement it writes. */
const ONE_STATEMENT = String.raw`(?:(?!\n\n)[\s\S])*?`;

/**
 * Each `security definer` function of the schema, a door (0031), that writes a record and writes no event, with the
 * number of records it writes: `{ "name()": n }`. A door writes its event when its body inserts into `events`, when it
 * calls a function that does, or when it writes a table a trigger of which does, each followed to the end. The tables
 * many places write by design, the spine's own rows and the writers that only take away (the writers measure's) are no
 * record here. A statement built as a string (`execute format(…)`) is not seen.
 */
export function doorsWithoutEventsIn(sql) {
  const tables = schemaTables(sql);
  const definer = new Set(
    [...sql.matchAll(new RegExp(String.raw`^CREATE FUNCTION public\.(\w+)\(${ONE_STATEMENT}\n {4}AS `, "gm"))]
      .filter((m) => /\bSECURITY DEFINER\b/.test(m[0]))
      .map((m) => m[1].toLowerCase()),
  );
  const bodies = new Map();
  for (const c of functionChangesIn(sql)) if (c.kind === "create" && c.body) bodies.set(c.name, c.body);
  const writes = new Map([...bodies].map(([n, b]) => [n, tablesWrittenBy(b, tables)]));
  const calls = new Map(
    [...bodies].map(([n, b]) => [
      n,
      [...b.matchAll(/\b(?:public\.)?(\w+)\s*\(/g)]
        .map((m) => m[1].toLowerCase())
        .filter((f) => f !== n && bodies.has(f)),
    ]),
  );
  const fired = new Map();
  const trigger = String.raw`^CREATE TRIGGER \w+ ${ONE_STATEMENT} ON public\.(\w+) ${ONE_STATEMENT}EXECUTE FUNCTION public\.(\w+)\(`;
  for (const [, table, fn] of sql.matchAll(new RegExp(trigger, "gm")))
    fired.set(table, [...(fired.get(table) ?? []), fn.toLowerCase()]);
  const evented = new Set([...writes].filter(([, w]) => w.has("events")).map(([n]) => n));
  const writesItsEvent = (n) =>
    calls.get(n).some((f) => evented.has(f)) ||
    [...writes.get(n)].some((t) => (fired.get(t) ?? []).some((f) => evented.has(f)));
  for (let grew = true; grew;) {
    grew = false;
    for (const n of writes.keys())
      if (!evented.has(n) && writesItsEvent(n)) {
        evented.add(n);
        grew = true;
      }
  }
  const out = {};
  for (const n of [...definer].sort()) {
    if (evented.has(n)) continue;
    // A writer that takes away is waived for what it updates and deletes, as the writers measure waives it.
    const inserted = takesAway(`${n}()`) ? tablesWrittenBy(bodies.get(n), tables, { inserts: true }) : null;
    const records = [...(writes.get(n) ?? [])].filter(
      (t) => !MANY_WRITERS_BY_DESIGN.has(t) && !SPINE.has(t) && (!inserted || inserted.has(t)),
    );
    if (records.length) out[`${n}()`] = records.length;
  }
  return out;
}

export const MEASURES = [
  {
    name: "functions over the limit",
    file: "complexity.json",
    measure: () => {
      const out = {};
      for (const f of SRC) {
        for (const fn of functionsIn(parse(f))) {
          if (fn.lines > LIMIT.lines || fn.branches > LIMIT.branches || fn.depth > LIMIT.depth) {
            out[`${f}::${fn.key}`] = { lines: fn.lines, branches: fn.branches, depth: fn.depth };
          }
        }
      }
      return out;
    },
    advice:
      "Split it — one builder per band, a table for a decision table, a hook for a component's concern — or keep it under 150 lines, 30 branches and 5 levels.",
  },
  {
    name: "files over the limit",
    file: "file-length.json",
    measure: () => perFile(SRC, linesOf, FILE_LIMIT),
    advice: "Move a domain out of it into its own module; a file over 800 lines is two files.",
  },
  {
    name: "directories over the limit",
    file: "tree-shape.json",
    measure: () => {
      const perDir = {};
      for (const f of TREES) {
        if (!SOURCE.test(f)) continue;
        const dir = path.posix.dirname(f);
        perDir[dir] = (perDir[dir] ?? 0) + 1;
      }
      return Object.fromEntries(Object.entries(perDir).filter(([, n]) => n > DIRECTORY_LIMIT));
    },
    advice: "Group it by domain, the way apps/edge/lib is: a folder per domain, the plumbing at the root.",
  },
  {
    name: "window globals",
    file: "window-globals.json",
    mode: "set",
    measure: () => {
      const files = {};
      for (const f of SHELL) for (const n of windowUse(parse(f)).names) files[n] = (files[n] ?? 0) + 1;
      return files;
    },
    advice: "No new global: feed the surface through the seam (surface-data.ts), or reuse one that exists.",
  },
  {
    name: "window publishers",
    file: "window-publishers.json",
    measure: () => perFile(SHELL, (sf) => windowUse(sf).publishers),
    advice: "Publish nothing new on window: import it, or add the name to a component that already publishes.",
  },
  {
    // The app's own code (the frozen legacy tree is the mockup's, drawn only where the registry says demo).
    name: "seeds read outside a demo",
    file: "seed-reads.json",
    measure: () =>
      perFile(
        SHELL.filter((f) => /.tsx?$/.test(f) && !f.startsWith("apps/dashboard/src/legacy/")),
        seedReadsOutsideADemo,
      ),
    advice:
      "Read a demo's seeds only where the session is one: `demoSession() ? sample() : <the real read, or nothing>`. A seed read in a real session draws invented people as customers (the wiring's second audit, X6-1).",
  },
  {
    // Every hand-written module of the apps and the packages: a server reader compared the column as readily as a page.
    name: "needs_human compared outside the standing rule",
    file: "needs-human-reads.json",
    measure: () =>
      perFile(
        SRC.filter((f) => /\.(tsx?|jsx?|mjs)$/.test(f)),
        needsHumanReads,
      ),
    advice:
      "Ask who has a thread through the standing rule (contracts standingOf, personStanding, packages/db threadIdsWaitingOnYou), never the raw state: needs_human is a thread flagged, and a reply a member took stays flagged until handed back (the wiring's second audit, S9-1).",
  },
  {
    name: "resumes sent without the question",
    file: "resumes-unasked.json",
    measure: () =>
      perFile(
        SHELL.filter((f) => /\.tsx?$/.test(f)),
        resumesUnasked,
      ),
    advice:
      "Resume a campaign or a reach-out through the ledger's question (ResumeAct, or ResumePress and ResumeQuestion with useResumeAsk), fed by contracts' act (rowResumeOf, chainResumeOf): it says when it runs next, to about how many, and whether it sends on its own (the wiring's second audit, S9-2).",
  },
  {
    // Every file of the tree, one each: it may only lose them. The address step (decision 0015) closed the tree: a
    // surface is written in TSX under src/surfaces, and one that leaves deletes its files.
    name: "files in the legacy tree",
    file: "legacy-files.json",
    measure: () =>
      Object.fromEntries(repoFiles(["apps/dashboard/src/legacy"], { keep: /./, drop: /^$/ }).map((f) => [f, 1])),
    advice:
      "A new page or component goes under apps/dashboard/src/surfaces, in TSX, and never in the legacy tree (decision 0015): the tree only shrinks.",
  },
  {
    name: "writes past the verb layer",
    file: "writes-past-verbs.json",
    measure: () => perFile(BROWSER_WRITERS, writesPastVerbs),
    advice:
      "Commit it through its verb (legacy-bridge/verbs commitVerb, its spec in contracts PROPOSAL_SPECS): the call, the receipt and the undo a sheet and Ask's card share. A verb no spec has yet gets one, beside the family it belongs with (contracts ask-proposals/).",
  },
  {
    name: "copies",
    file: "copies.json",
    measure: () => copiesAmong(SRC.filter(notARoute).map(parse), COPY_LIMIT),
    advice:
      "Give it one home and import it from there — a helper declared in three files is a fact spelled out three times — or, when the new one is a different thing, give it a name that says which.",
  },
  {
    name: "casts: as unknown as, as never and x!",
    file: "casts.json",
    measure: () => {
      const out = {};
      for (const f of SRC) {
        const counts = castsIn(parse(f));
        if (Object.keys(counts).length > 0) out[f] = counts;
      }
      return out;
    },
    advice:
      "Name the shape and parse it, or narrow it with a type guard: a value laundered through unknown, told it is never, or told it is not null is a type the compiler no longer checks. An index read that can miss is guarded (const first = rows[0]; if (!first) …), never asserted with !.",
  },
  {
    // A file's `.from("…")` count under its path, and its `.rpc("…")` count under `<path>${RPC_KEY}`: a SQL function
    // called by name outside packages/db is a table read or written there all the same.
    name: "table names outside packages/db",
    file: "tables.json",
    measure: () => {
      const outside = SRC.filter((f) => !f.startsWith("packages/db/"));
      const rpcs = perFile(outside, rpcNames);
      return {
        ...perFile(outside, tableNames),
        ...Object.fromEntries(Object.entries(rpcs).map(([f, n]) => [f + RPC_KEY, n])),
      };
    },
    advice:
      "A table, and a SQL function, is named once, in packages/db (CLAUDE.md, what not to introduce): add a repository or a reader there and call it.",
  },
  {
    // The dashboard's own code (the edge is the service role's by design): each place a module takes the client with
    // RLS off, so a read or write there is fenced to its workspace by hand, not by the database (the setup review's B2).
    name: "service-role reaches in the dashboard",
    file: "service-role.json",
    measure: () =>
      perFile(
        SRC.filter((f) => f.startsWith("apps/dashboard/") && f !== "apps/dashboard/src/server/service-db.ts"),
        serviceRoleReaches,
      ),
    advice:
      "Read and write as the member (the route's session client, where RLS fences the workspace) or through a SQL door that checks it. The service role is for what no member may do: a cross-workspace read for the platform, an invite before the person is a member, a provider's callback.",
  },
  {
    name: "route files that hold a repository or a provider client",
    file: "route-doors.json",
    measure: () => perFile(ROUTES, (sf) => importsMatching(sf, DOOR_FORBIDS)),
    advice:
      "A route file is a door: it verifies, parses its input and answers, and everything else is a call into lib/ (the edge), src/server (the dashboard) or a core verb. Read or write through a repository behind that call, and reach a provider through a wire in packages/channels behind it too.",
  },
  {
    name: "edge statements that name no workspace",
    file: "workspaceless.json",
    measure: () => {
      const tables = tenantTablesOf();
      const out = {};
      for (const f of EDGE) {
        const sf = parse(f);
        if (CROSS_WORKSPACE.test(headerOf(sf))) continue;
        const n = workspacelessStatements(sf, tables);
        if (n > 0) out[f] = n;
      }
      return out;
    },
    advice:
      "A statement on a workspace's table names the workspace: tenantDb(db, tenantId).from(...) (packages/db), or .eq(\"tenant_id\", …), or a row that carries its tenant_id. A module that reads across workspaces on purpose (a sweep, a provider's webhook) says why in its header, on a line that begins Cross-workspace: and is not measured.",
  },
  {
    name: "unnamed durations",
    file: "durations.json",
    measure: () => {
      const out = {};
      for (const f of TIMED) {
        const n = durationsIn(parse(f)).length;
        if (n > 0) out[f] = n;
      }
      return out;
    },
    advice:
      "Name the length of time: a whole minute, hour or day from contracts' shared/time.ts (5 * MIN_MS, DAY_MS), anything else a constant in its module that says what it is (const RETRY_MS = 800; const LEASE_MS = 5 * MIN_MS). A value that is not a time says its unit in its name (RADIUS_MAX_M, TAB_TOTAL_CHARS).",
  },
  {
    name: "dates said with no zone",
    key: "zoneless-dates",
    measure: () => {
      const out = {};
      for (const f of ZONED) {
        const n = zonelessDatesIn(parse(f)).length;
        if (n > 0) out[f] = n;
      }
      return out;
    },
    advice:
      "Say it by the workspace's clock: contracts' clock.ts (clockTime, clockDate, clockNearWhen and the rest) with the workspace's zone, which a page reads from pageClock().zone() and a server from its tenant, or dateFormat(locale, { timeZone, … }). A day key, which is no instant, is formatted from its UTC noon with timeZone: \"UTC\" (calendar-words.ts).",
  },
  {
    name: "zones read outside zone-math",
    key: "zone-readers",
    measure: () => {
      const out = {};
      for (const f of ZONED) {
        if (f === "packages/contracts/src/calendar/zone-math.ts") continue;
        const n = zoneReadersIn(parse(f)).length;
        if (n > 0) out[f] = n;
      }
      return out;
    },
    advice:
      "Read the zone through contracts' calendar/zone-math.ts, its one reading: zoneParts(tz, at) for the parts, dayInZone(tz, ms).key for the day, clockInZone for the wall clock, dayPlusInZone to step a day by the calendar, and usableZone(tz) first where a zone Intl cannot use must read as UTC rather than throw.",
  },
  {
    name: "breakpoints outside the set",
    file: "breakpoints.json",
    // `file::width`: where the width is and where it splits the screens (_ast.mjs mediaWidths), so a page cannot trade
    // one stray for another; its count, how many conditions split there.
    measure: () => {
      const set = breakpointSet();
      const out = {};
      const hold = (file, widths) => {
        for (const w of widths) if (!set.has(w)) out[`${file}::${w}`] = (out[`${file}::${w}`] ?? 0) + 1;
      };
      for (const f of DASHBOARD_CSS) hold(f, mediaPreludes(readRaw(f)).flatMap(mediaWidths));
      for (const f of DASHBOARD_SRC) hold(f, stringsIn(parse(f)).flatMap(mediaWidths));
      return out;
    },
    advice:
      "Change the layout at one of tokens.css's breakpoints, from either side: (max-width: 720px) or (min-width: 721px), (max-width: 900px) or (width > 900px). A page that needs a width of its own says why in its row of docs/debt.md, and a new width for the whole product is a new --bp- token.",
  },
  {
    name: "literal style values",
    file: "style-values.json",
    measure: () => {
      const out = {};
      for (const f of STYLES) {
        const { values } = cssOf(f);
        if (STYLE_VALUE_FIELDS.some((k) => values[k] > 0)) out[f] = values;
      }
      return out;
    },
    advice:
      "Read a token: a type size, radius, shadow, colour or blur is declared once, in apps/dashboard/src/legacy/styles/tokens.css, and a stylesheet reads it with var(). If no token fits, add one there (the interface kit's rule 1, docs/plans/2026-09-28-the-interface-kit-and-its-looks.md).",
  },
  {
    name: "primitives outside the kit",
    file: "kit-primitives.json",
    // Held by count, not as a set: `.btn` is already named in ten page stylesheets, and a new `.pl-peek .btn { … }`
    // in any of them is one more selector restyling the kit from a page.
    measure: () => {
      const out = {};
      for (const f of STYLES.filter((f) => f !== KIT_CSS)) {
        for (const [name, n] of Object.entries(cssOf(f).classes)) if (isPrimitiveClass(name)) out[`${f}::${name}`] = n;
      }
      return out;
    },
    advice:
      "Draw it with the kit's primitive, never a class of the page's own: the kit's rules are in apps/dashboard/src/surfaces/kit/kit.css, their names in classes.json beside it. Place it through a class of the page's own that names no kit class and holds no primitive's word, since a selector naming a kit class counts even when it only places it. If the kit has nothing that fits, it takes a new variant with its gallery entry (the interface kit's rule 3, docs/plans/2026-09-28-the-interface-kit-and-its-looks.md; .claude/skills/chanlytics-interface/SKILL.md).",
  },
  {
    name: "inline style props",
    file: "inline-styles.json",
    measure: () => perFile(MARKUP, inlineStyles),
    advice:
      "Style it with a class that reads tokens, not a style prop: a value in a prop is one no look can reach (the interface kit's rule 1, docs/plans/2026-09-28-the-interface-kit-and-its-looks.md).",
  },
  {
    // contracts holds the one writer of a record's route and of a link (addressOf, appLink); the code that ships beside it
    // is counted. Its tests are not: a test spells the route it expects.
    name: "routes and links written by hand",
    file: "hand-routes.json",
    measure: () =>
      perFile(
        SRC.filter(
          (f) => /\.(tsx?|jsx?|mjs)$/.test(f) && !f.startsWith("packages/contracts/") && !f.includes("/dist/"),
        ),
        handRoutesIn,
      ),
    advice:
      "Write a record's route with contracts addressOf({ kind, id }) and a link to a workspace's page with appLink(slug, route): the one writer, so a route is spelled as its page reads it and a retired one moves in one place (the wiring's second audit, S5-6).",
  },
  {
    // Each registered clock's kind is clocks/_clocks.mjs's; ops/sweep-registry.db.test.mjs holds every row to one.
    name: "event-shaped clocks",
    file: "event-shaped-clocks.json",
    measure: () =>
      Object.fromEntries(
        Object.entries(CLOCKS)
          .filter(([, c]) => c.kind === "event-shaped")
          .map(([name]) => [name, 1]),
      ),
    advice:
      "A clock that runs a timer or a reaction belongs on a due row or after its event (decision 0031, invariant 6): set the job's due_at where the timer starts, or subscribe to the event, and keep the clock to reconcile, judge, keep or roll.",
  },
  {
    // A table's writers: the modules and the live SQL functions that write it (writersByTable); one is a door.
    name: "tables with more than one writer",
    file: "writers.json",
    measure: () =>
      Object.fromEntries(
        [...writersByTable()].filter(([, who]) => who.size > 1).map(([table, who]) => [table, who.size]),
      ),
    advice:
      "One record, one door writes it (decision 0031, invariant 1): write the table through the door that already writes it, the SQL function or the repository in packages/db, rather than adding a writer.",
  },
  {
    name: "doors writing a record with no event",
    file: "doors-without-events.json",
    measure: () => doorsWithoutEventsIn(readRaw(SCHEMA_SQL)),
    advice:
      "A fact and its event share a transaction (decision 0031, invariant 2): write the record's event in the door, beside the write (insert into public.events, or a trigger on the table that does), or argue under Rises in docs/debt.md why the write is no fact.",
  },
  {
    // Each column's strategy is packages/db's ERASURE_STRATEGIES; people/erasure/erasure-registry.test.mjs holds it to
    // the schema. Per column, so a column named while another arrives unnamed is still a new offender.
    name: "personal columns with no erasure strategy",
    file: "erasure-strategies.json",
    measure: () =>
      Object.fromEntries(
        personalColumns()
          .filter((c) => {
            const [table, column] = c.split(".");
            return !ERASURE_STRATEGIES[table]?.[column];
          })
          .map((c) => [c, 1]),
      ),
    advice:
      "Say how an erasure reaches the column, in the change that adds it (decision 0036): its strategy in packages/db/src/erasure/registry.ts, gone with the person, scrubbed by a named leg, kept as a digest, removed by age, or not personal.",
  },
];

/* ---- Source-text reads in tests (repo/source-scan-ratchet.test.mjs) ---- */

export const TESTS_DIR = "tooling/scripts/tests";
const SOURCE_SCAN_SELF = "repo/source-scan-ratchet.test.mjs";

/**
 * The test files the REPOSITORY has, not the files this laptop has, each keyed
 * by its path relative to tooling/scripts/tests (`people/person-notes.test.mjs`).
 *
 * Learned from CI, on the source-scan ratchet's first run: its baseline was
 * seeded from a working tree that held another session's UNTRACKED test file,
 * and CI, checking out the repo, found four fewer source reads than the baseline
 * claimed. A number that differs between a checkout and a desk is not a ratchet
 * but a number two people can argue about, so the set is `git ls-files`, and an
 * untracked scratch test cannot move a repo-wide count in either direction. The
 * same lesson, in reverse, on the day the ratchets were seeded: a file that is
 * not yet tracked is not yet counted, so seed after staging.
 *
 * Falls back to the directory when git is unavailable, because a test that
 * cannot run at all is worse than one measuring a slightly wider set.
 */
function repoTestFiles() {
  try {
    return execFileSync("git", ["ls-files", TESTS_DIR], { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.endsWith(".test.mjs"))
      .map((l) => l.slice(TESTS_DIR.length + 1));
  } catch {
    return fs
      .readdirSync(path.join(ROOT, TESTS_DIR), { recursive: true })
      .map((f) => String(f).split(path.sep).join("/"))
      .filter((f) => f.endsWith(".test.mjs"));
  }
}

/**
 * Every test file and, for those that read source as text, how many times: `readCode(` and `readRaw(` on the
 * comment-stripped file, and each call of a helper of the file's own that reads a source file with `readFileSync`
 * (`sourceReads`, measured on the syntax tree). The helpers went uncounted until 29 Sep 2026: 22 reads in 7 files the
 * count did not see, banked then as a correction of the measure.
 */
export function sourceScan() {
  const files = repoTestFiles().filter((f) => f !== SOURCE_SCAN_SELF && fs.existsSync(path.join(ROOT, TESTS_DIR, f)));
  const counts = Object.fromEntries(
    files
      .map((f) => {
        const rel = `${TESTS_DIR}/${f}`;
        return [f, (readCode(rel).match(/\b(readCode|readRaw)\(/g) ?? []).length + sourceReads(parse(rel))];
      })
      .filter(([, n]) => n > 0),
  );
  return { files, counts };
}

/**
 * The test files whose whole purpose is a repo-wide lint (every write names a workspace, every variable is declared
 * where it is read): their reads of source are the lint, so the ratchet does not hold them. The escape hatch is the part
 * that rots, so the list is a handful (repo/source-scan-ratchet.test.mjs holds it to nine), each named here with the
 * change that argued it, and a file added to it is a line of this module in review.
 */
export const SOURCE_SCAN_EXEMPT = [
  "ai/flag-registry.test.mjs",
  "e2e/e2e-shape.test.mjs",
  "edge/runtime-freshness.test.mjs",
  "repo/env-manifest.test.mjs",
  "repo/event-kinds.test.mjs",
  "repo/hygiene.test.mjs",
  "repo/legacy-harness.test.mjs",
  "repo/ops-hygiene.test.mjs",
  "routes/workspace-scoping.test.mjs",
];

/** Source-text reads in tests, by file, the exempt lints left out. */
export const SOURCE_SCAN = {
  name: "source-text reads in tests",
  key: "source-scan",
  measure: () =>
    Object.fromEntries(Object.entries(sourceScan().counts).filter(([f]) => !SOURCE_SCAN_EXEMPT.includes(f))),
  advice:
    "Write a behaviour test instead: run the code and assert what it does. A file whose purpose is a repo-wide lint is listed in SOURCE_SCAN_EXEMPT (_measures.mjs), argued in its pull request.",
};

/* ---- The wire's names (routes/wire-casing.test.mjs) ---- */

/**
 * The typed client's registry: every /api/v1 handler under the key route-policy.json gives it, as a type that
 * carries what the handler takes and answers (the phantom `Shape<I, O>` of apps/dashboard/src/server/route.ts).
 */
export const WIRE_REGISTRY = "apps/dashboard/src/client/routes.generated.ts";
/** How many levels below a route's body, query or answer its names are read. */
export const WIRE_DEPTH = 6;
/** The wire's one casing (docs/naming.md): lower-case words joined by underscores, one word included. */
export const isSnakeCase = (name) => /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name);
/** Objects JSON writes as a string or as nothing: their members are not names on the wire. */
const NOT_OBJECTS_ON_THE_WIRE = new Set([
  "Date",
  "Map",
  "Set",
  "Promise",
  "Response",
  "Blob",
  "ArrayBuffer",
  "Uint8Array",
  "ReadableStream",
  "Headers",
  "URL",
]);

/**
 * Every property name in `type`, to WIRE_DEPTH levels below it: through unions, intersections, arrays and a record's
 * values, never a record's keys (a workspace's id is data, not a name). A type met again is walked again only from
 * higher up, where more of it is in reach, so what is found does not depend on the order it is met in.
 */
function namesIn(checker, type, at, out, depth = 0, seen = new Map()) {
  if (!type || depth > WIRE_DEPTH || (seen.get(type) ?? Infinity) <= depth) return out;
  seen.set(type, depth);
  if (type.isUnion() || type.isIntersection()) {
    for (const t of type.types) namesIn(checker, t, at, out, depth, seen);
  } else if (checker.isArrayType(type) || checker.isTupleType(type)) {
    for (const t of checker.getTypeArguments(type)) namesIn(checker, t, at, out, depth + 1, seen);
  } else if (type.flags & ts.TypeFlags.Object && !NOT_OBJECTS_ON_THE_WIRE.has(type.getSymbol()?.getName())) {
    for (const info of checker.getIndexInfosOfType(type)) namesIn(checker, info.type, at, out, depth + 1, seen);
    for (const p of checker.getPropertiesOfType(type)) {
      // A symbol-keyed member (a brand, the phantom shape itself) is a type's, never JSON's.
      if (p.getName().startsWith("__@")) continue;
      out.add(p.getName());
      namesIn(checker, checker.getTypeOfSymbolAtLocation(p, at), at, out, depth + 1, seen);
    }
  }
  return out;
}

/**
 * What each route in a registry takes and answers, by name: `{ [route]: { takes, answers, hidden } }`, each list
 * sorted, or null for a handler that carries no shape. `hidden` says which side, `takes` or `answers`, is `any` or
 * `unknown` as a whole, so has no names the walk can read. The registry is a module whose `Routes` type names each
 * handler; a handler's module the checker could not resolve reads as `any`, which has no shape, so it cannot read as
 * clean.
 */
export function wireShapes(program, registry) {
  const checker = program.getTypeChecker();
  const alias = program
    .getSourceFile(registry)
    ?.statements.find((s) => ts.isTypeAliasDeclaration(s) && s.name.text === "Routes");
  if (!alias) throw new Error(`${registry} has no Routes type for the checker to read`);
  const typeOf = (io, name) => {
    const s = io.getProperty(name);
    return s && checker.getTypeOfSymbolAtLocation(s, alias);
  };
  const side = (io, name) => [...namesIn(checker, typeOf(io, name), alias, new Set())].sort();
  const opaque = (io, name) => Boolean(typeOf(io, name)?.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown));
  const out = {};
  for (const route of checker.getPropertiesOfType(checker.getTypeAtLocation(alias.name))) {
    const handler = checker.getTypeOfSymbolAtLocation(route, alias);
    const shape = checker.getPropertiesOfType(handler).find((p) => p.getName().startsWith("__@shape"));
    const io = shape && checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(shape, alias));
    out[route.getName()] = io
      ? {
          takes: side(io, "input"),
          answers: side(io, "output"),
          hidden: [
            ["takes", "input"],
            ["answers", "output"],
          ]
            .filter(([, name]) => opaque(io, name))
            .map(([said]) => said),
        }
      : null;
  }
  return out;
}

let dashboard;
/**
 * The dashboard's registry read with the dashboard's own compiler options, as its typecheck reads it, once per
 * process: the program takes seconds to build, and the ratchet and the guards beside it read the same shapes.
 */
export function dashboardWire() {
  if (!dashboard) {
    const config = ts.getParsedCommandLineOfConfigFile(
      path.join(ROOT, "apps/dashboard/tsconfig.json"),
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (d) => {
          throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
        },
      },
    );
    const registry = path.join(ROOT, WIRE_REGISTRY).split(path.sep).join("/");
    const program = ts.createProgram({
      rootNames: [registry],
      options: { ...config.options, noEmit: true, incremental: false },
    });
    dashboard = wireShapes(program, registry);
  }
  return dashboard;
}

/** One entry per name a route takes or answers that is not snake_case: `<route> takes <name>`, `<route> answers <name>`. */
export function offTheWire(shapes) {
  const out = {};
  for (const [route, io] of Object.entries(shapes)) {
    for (const name of io?.takes ?? []) if (!isSnakeCase(name)) out[`${route} takes ${name}`] = 1;
    for (const name of io?.answers ?? []) if (!isSnakeCase(name)) out[`${route} answers ${name}`] = 1;
  }
  return out;
}

/** The register's two numbers for the wire: how many distinct names are not snake_case, and in how many routes. */
export function wireCounts(held) {
  const parts = Object.keys(held ?? {}).map((k) => /^(.*) (?:takes|answers) (\S+)$/.exec(k) ?? [k, k, k]);
  return { names: new Set(parts.map((p) => p[2])).size, routes: new Set(parts.map((p) => p[1])).size };
}

/** The wire's ratchet: its own test file, because it needs the type checker's program, not the syntax trees above. */
export const WIRE_CASING = {
  name: "wire names not in snake_case",
  file: "wire-casing.json",
  measure: () => offTheWire(dashboardWire()),
  advice:
    "The wire is snake_case (docs/naming.md, decision 0022): name the field in snake_case in the route's type, and turn a view model into it in a named mapping, never a converter. A field a page or the phone app reads is answered in both spellings for one release.",
};

/* ---- Index reads the compiler lets pass (the unchecked-index measure) ---- */

/** A project's tsconfig as the compiler resolves it, its `extends` followed. */
export function resolvedConfig(tsconfig) {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    tsconfig,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => {
        throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
      },
    },
  );
  if (!parsed) throw new Error(`${tsconfig} could not be read`);
  return parsed;
}

/**
 * A project's options for a program of the measures' own: nothing emitted and nothing built, so a package's settings
 * as a referenced project (composite, its declarations into .types) do not ask for files the measure never reads.
 */
export const unbuilt = (options) => ({
  ...options,
  composite: false,
  declaration: false,
  emitDeclarationOnly: false,
  rootDir: undefined,
  outDir: undefined,
  tsBuildInfoFile: undefined,
  noEmit: true,
  incremental: false,
});

/** Every workspace project's tsconfig.json, by its project's path: the packages and the apps. */
export function projectConfigs() {
  const out = [];
  for (const group of ["packages", "apps"]) {
    for (const name of fs.readdirSync(path.join(ROOT, group)).sort()) {
      const tsconfig = path.join(ROOT, group, name, "tsconfig.json");
      if (fs.existsSync(tsconfig)) out.push({ project: `${group}/${name}`, tsconfig });
    }
  }
  return out;
}

/** The projects whose tsconfig turns noUncheckedIndexedAccess off, the base's flag: the ones UNCHECKED_INDEX counts. */
export const waitingProjects = () =>
  projectConfigs().filter(({ tsconfig }) => resolvedConfig(tsconfig).options.noUncheckedIndexedAccess !== true);

/**
 * `{ file: n }`: in each project that waits, every error noUncheckedIndexedAccess would raise, the flag on and nothing
 * else changed, by the file it is in. Each is a read the compiler lets pass as if it could not miss (`rows[0]`,
 * `table[key]`, a regex's `m[1]`). A count means something only over a tree that typechecks, as CI's does before the
 * suite runs. What Next writes into `.next/` is the build's, not the project's.
 */
function uncheckedIndexReads() {
  const now = {};
  for (const { tsconfig } of waitingProjects()) {
    const config = resolvedConfig(tsconfig);
    // One program over the project and the packages' sources it imports (no project references, so nothing need be
    // built first), checked in the project's own files alone: a package's reads are its own project's to count.
    const program = ts.createProgram({
      rootNames: config.fileNames,
      options: { ...unbuilt(config.options), noUncheckedIndexedAccess: true },
    });
    const home = path.dirname(tsconfig) + path.sep;
    for (const sf of program.getSourceFiles()) {
      const file = path.relative(ROOT, path.resolve(sf.fileName)).split(path.sep).join("/");
      if (!path.resolve(sf.fileName).startsWith(home) || /(^|\/)(\.next|node_modules)\//.test(file)) continue;
      const n = program.getSemanticDiagnostics(sf).length;
      if (n) now[file] = (now[file] ?? 0) + n;
    }
  }
  return now;
}

/**
 * The index reads' measure: it builds three whole programs (core, contracts, the dashboard), not the syntax trees the
 * measures above read, so it is the slowest of check:debt's. A project that turns the flag on leaves the measure, and
 * its entries go with it.
 */
export const UNCHECKED_INDEX = {
  name: "index reads the compiler lets pass",
  file: "unchecked-index.json",
  measure: uncheckedIndexReads,
  advice:
    "Guard the read where it can miss (const first = rows[0]; if (!first) …; .at(-1) with a check; a destructured default), never with x!, which the casts measure counts. tsconfig.base.json turns noUncheckedIndexedAccess on; a project that turns it off is counted here, file by file. Every error the flag's program reports is counted, so typecheck first: an error of another kind reads here as a read.",
};

/* ---- Test files over the limit ---- */

/*
 * The suite's own test files, held by their length as file-length holds the code that ships. The largest cannot be
 * reviewed, and running one of their cases runs all of them: the runner's unit is the file. A test file's limit is
 * twice a module's: a case writes its world and its assertions out longhand, and the suite's median file ran about
 * twice the median module's length on 26 October 2026, at e9d6325f0, with the limit above nineteen files in twenty, so
 * it holds the tail and not the body. A file file-length already holds is left to it: the phone app's tests
 * (apps/mobile/test) ship with the app and meet a module's limit there first, so each file answers to one limit.
 */
export const TEST_FILE_LIMIT = 1600;

/**
 * The node suite's own test files, tracked, as its launcher globs them (`SUITES.test`, checks/test.mjs): git's
 * `:(glob)` pathspec reads `**` and `*` as the runner does. A glob that lists nothing stops the measure, since an empty
 * listing would read as every offender gone.
 */
export function suiteFiles() {
  return SUITES.test.flatMap((glob) => {
    const found = repoFiles([`:(glob)${glob}`]);
    if (!found.length)
      throw new Error(
        `git ls-files lists nothing for the launcher's ${glob}: the test-length measure has nothing to read`,
      );
    return found;
  });
}

/**
 * A file's text as `linesOf` reads a syntax tree (file-length's measure): TypeScript's own line map of it, and no
 * parse. A length needs no tree, and parsing every test file to count its lines would cost seconds and memory.
 */
export const lineMapOf = (text) => ({
  text,
  end: text.length,
  getLineAndCharacterOfPosition: (pos) => ts.getLineAndCharacterOfPosition({ text }, pos),
});
export const testLength = (file) => linesOf(lineMapOf(fs.readFileSync(path.join(ROOT, file), "utf8")));

export const TEST_LENGTH = {
  name: "test files over the limit",
  file: "test-length.json",
  measure: () => {
    const held = MEASURES.find((m) => m.file === "file-length.json").measure();
    return Object.fromEntries(
      suiteFiles()
        .filter((f) => !(f in held))
        .map((f) => [f, testLength(f)])
        .filter(([, n]) => n > TEST_FILE_LIMIT),
    );
  },
  advice: `Split it by concern: a file each, named for what it proves, the world they share in their folder's _<name>.mjs, and a folder of their own where this one is at its limit of modules (tree-shape). A test file over ${TEST_FILE_LIMIT} lines is two files.`,
};

/* ---- Waits that count turns of the loop, or time, in the suite's tests ---- */

/**
 * The node suite's waits for work a test cannot await that wait a fixed count of turns of the loop, or a fixed time
 * (fixedWaitsIn, _ast.mjs), by file. Such a wait passes while the work takes no longer than it counts, and fails once in
 * a while when it does: on 29 Oct 2026 two did beside a second run of the suite, where an import() went through tsx's
 * loader off the main thread. A wait for what the next lines read (`until`, tests/shared/_until.mjs) holds on any
 * machine. Seeded on 30 Oct 2026; a wait before asserting that nothing more happened stays one, since there is nothing
 * to wait for, so the measure falls as waits are moved to conditions and never reaches nothing.
 */
export const COUNTED_WAITS = {
  name: "waits that count turns or time in tests",
  key: "counted-waits",
  measure: () =>
    Object.fromEntries(
      suiteFiles()
        .map((f) => [f, fixedWaitsIn(parse(f)).length])
        .filter(([, n]) => n > 0),
    ),
  advice:
    'Wait for what the next lines read: `await until(() => <it>, "<what>")` from tooling/scripts/tests/shared/_until.mjs (a toast up, a write the fake wire saw, the page drawn as it is after the answer). A wait before asserting that nothing more happened is the one a count is for: argue it in the pull request.',
};

/* ---- Event kinds written only from TypeScript (repo/event-kinds.test.mjs reads the same map) ---- */

/** An event kind as the product spells it: `<record>.<what happened>`. */
export const EVENT_KIND = /^[a-z_]+\.[a-z_]+$/;

export function walkTypeScript(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (["node_modules", "dist", ".next", ".types", "tests"].includes(e.name)) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walkTypeScript(rel, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".d.ts")) out.push(rel);
  }
  return out;
}

/**
 * kind → the files that write it. The emitters are found the way they are written: `insert into events` in a
 * migration, `emitEvent(...)` and `recordEvent(...)` (packages/db events.ts), the send door's own `event(...)`, a direct
 * `.from("events").insert({ kind })`, a verdict that names its event, and a `*_KIND` constant.
 */
export function emittedKinds() {
  const by = new Map();
  const add = (kind, file) => {
    if (!by.has(kind)) by.set(kind, new Set());
    by.get(kind).add(file);
  };
  // SQL: each insert into events, the first dotted literal in its values.
  for (const f of fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((n) => n.endsWith(".sql"))) {
    const src = readRaw(`supabase/migrations/${f}`);
    for (const m of src.matchAll(/insert into (?:public\.)?events\b([\s\S]*?);/g)) {
      const lit = m[1].match(/'([a-z_]+\.[a-z_]+)'/);
      if (lit) add(lit[1], `supabase/migrations/${f}`);
    }
  }
  // TypeScript: the runtimes and the packages, never the tests or the built copies.
  for (const dir of [
    "apps/edge",
    "apps/dashboard/src",
    "apps/dashboard/app",
    "packages/db/src",
    "packages/core/src",
    "packages/jobs/src",
    "packages/channels/src",
    "packages/contracts/src",
  ]) {
    for (const f of walkTypeScript(dir)) {
      const src = readRaw(f);
      const consts = new Map(
        [...src.matchAll(/const ([A-Z_]+_KIND)\s*=\s*"([a-z_]+\.[a-z_]+)"/g)].map((m) => [m[1], m[2]]),
      );
      // Every literal inside the call, to its closing paren: a conditional that picks one of three billing kinds
      // names all three.
      for (const m of src.matchAll(/\b(?:emitEvent|recordEvent)\(/g)) {
        let depth = 0;
        let i = m.index;
        for (; i < src.length; i++) {
          if (src[i] === "(") depth++;
          else if (src[i] === ")") {
            depth--;
            if (depth === 0) break;
          }
        }
        const call = src.slice(m.index, i + 1);
        for (const lit of call.matchAll(/"([a-z_]+\.[a-z_]+)"/g)) if (EVENT_KIND.test(lit[1])) add(lit[1], f);
        for (const c of call.matchAll(/\b([A-Z_]+_KIND)\b/g)) if (consts.has(c[1])) add(consts.get(c[1]), f);
      }
      for (const m of src.matchAll(/\.from\("events"\)\s*\.insert\(\{[\s\S]{0,400}?kind:\s*"([a-z_]+\.[a-z_]+)"/g))
        add(m[1], f);
      for (const m of src.matchAll(/\bevent\(\s*(?:ports\.)?db,\s*d,\s*"([a-z_]+\.[a-z_]+)"/g)) add(m[1], f);
      // A verdict that names its own event kind (channels/a2p: the line's texting state).
      for (const m of src.matchAll(/\bevent:\s*"(line\.[a-z_]+)"/g)) add(m[1], f);
    }
  }
  return by;
}

export const TS_ONLY_EVENTS = {
  name: "event kinds written only from TypeScript",
  file: "ts-only-events.json",
  mode: "set",
  measure: () =>
    Object.fromEntries(
      [...emittedKinds()]
        .filter(([, files]) => [...files].every((f) => !f.startsWith("supabase/")))
        .map(([kind, files]) => [kind, files.size]),
    ),
  advice:
    "A fact and its event share a transaction (decision 0031, invariant 2; the wiring's second audit, S11-9): write the event in the SQL door that writes the fact, beside the write, rather than from TypeScript after it.",
};

/* ---- Appointment words written in (journey/journey.test.mjs holds what the count reads) ---- */

/**
 * Each place a person reads "visit" in a sentence or a label the code writes in (_ast.mjs visitsWrittenIn), by file:
 * when it reaches zero, "visit" joins trade-neutral's banned words.
 */
export function appointmentWordsWrittenIn() {
  const out = {};
  for (const file of readerFiles()) {
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    const n = visitsWrittenIn(parse(rel)).length;
    if (n > 0) out[rel] = n;
  }
  return out;
}

export const APPOINTMENT_WORDS = {
  name: "appointment words written in",
  file: "appointment-words.json",
  measure: appointmentWordsWrittenIn,
  advice:
    'A sentence a person reads says the workspace\'s appointment word (contracts appointmentWords), or none: never "visit" written in.',
};

/* ---- Every number the build holds ---- */

/**
 * Each ratchet: its `key` (the name check:debt and the register give it; until 28 October 2026 the baseline file it was
 * kept in, `file`, which a base from before then is read from), its name, its mode ("count": each key's numbers may
 * only fall; "set": the keys may only go away, the numbers beside them a record), its measure and its advice.
 */
export const RATCHETS = [
  ...MEASURES,
  WIRE_CASING,
  UNCHECKED_INDEX,
  TEST_LENGTH,
  COUNTED_WAITS,
  TS_ONLY_EVENTS,
  APPOINTMENT_WORDS,
  SOURCE_SCAN,
].map((m) => ({ mode: "count", ...m, key: m.key ?? m.file.replace(/\.json$/, "") }));
