#!/usr/bin/env node
/**
 * The SQL map, written from the schema snapshot, the migrations and the code (decision 0111).
 * docs/sql-map.md says, for every function in the `public` schema: what kind it is (a door a member calls, a reader
 * under their row-level security, the server's, a trigger, a computed column), who may call it, and who does: a module
 * of the code by `.rpc("…")`, another function, a trigger, a rule, the clock (`cron.schedule` in a migration), or a
 * script. It is the data dictionary's sibling (data-model.mjs, the tables) and reads the snapshot the same way, so
 * writing or checking it needs no database.
 *   corepack pnpm gen:sql-map                                 write docs/sql-map.md
 *   node tooling/scripts/gen/sql-map.mjs --check              exit 1 if it is stale (tests/docs/sql-map.test.mjs)
 * A function nothing calls at run time is named in KEPT_WITH_NO_CALLER with why, or it is dropped.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OUT as SNAPSHOT, closing, isPunct, statementsOf } from "./schema-snapshot.mjs";
import { parse, repoFiles, rpcCallNames } from "../../../tests/_ast.mjs";

export const OUT = "docs/sql-map.md";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const MIGRATIONS = "supabase/migrations";

/**
 * The functions nothing calls at run time, each with why it stays: a reader an operator runs by hand from the runbook,
 * or one a decision keeps for a page still to come, proved meanwhile by its database test. A function that leaves this
 * list gets a caller or is dropped by a migration.
 */
export const KEPT_WITH_NO_CALLER = {
  ai_shadow_agreement:
    "read by hand to judge the second model against the first (decision 0023, the shadow port), as the service role",
  ai_usage_month:
    "a workspace's month of metered use, under its members' row-level security, for the billing page to read; proved by tests/ai/ai-usage.db.test.mjs",
  conversation_draft_keep:
    "Ask's reply draft as decision 0071 first kept it, superseded by conversation_draft_write (00538) and kept for a dashboard a deploy behind; tests/need-you/reply-drafts.db.test.mjs still proves its fence: dropped with that test, in a change of its own",
  page_freshness:
    "read by hand: docs/runbook.md, what tabs could not hear or read, `select * from page_freshness(7)` as the service role",
  platform_admin_add:
    "an operator adds the Console's staff by hand, as the service role: deliberately not reachable from the app (00467, decision 0066)",
  platform_role:
    "the Console's role for the calling session (decision 0066), answered only past the second factor; proved by tests/console/console.db.test.mjs",
  resume_email_offers:
    "the back office turns a workspace's offers by email back on by hand once its list is fixed; the notice that stopped them says the statement (apps/edge/lib/email/offer-gates.ts)",
  sweep_schedules: "read by hand and by the sweep-health suites: every sweep's schedule as pg_cron holds it (00019)",
  workspace_days:
    "a member's rolled days of their own workspace (K10), for the back office's member view; proved by its database test",
};

/* ------------------------------------------------------------------ the snapshot */

const flat = (s) => s.replace(/\s+/g, " ").trim();
const unquote = (s) => s.replace(/''/g, "'");

/**
 * The functions of the public schema, by name: their arguments, what they return, their language, whether they run as
 * their owner and pin their search path, their comment's first sentence, the roles granted them, their body, and
 * whether they read as a computed column (one argument, a table's row).
 */
export function functionsOf(sql) {
  const fns = new Map();
  const triggers = [];
  const others = []; // statements other SQL is written in: rules, tables (defaults), views
  for (const st of statementsOf(sql)) {
    const head = flat(st.text.slice(0, 400));
    const fn = /^CREATE FUNCTION public\.(\w+)\(/.exec(head);
    if (fn) {
      const open = st.tokens.findIndex((t) => isPunct(t, "("));
      const close = closing(st.tokens, open);
      const args = flat(
        st.text.slice(st.tokens[open].end - st.tokens[0].start, st.tokens[close].start - st.tokens[0].start),
      );
      const body = st.tokens.find((t, k) => k > close && t.type === "dollar")?.value ?? "";
      const attrs = flat(
        st.text.slice(
          st.tokens[close].end - st.tokens[0].start,
          st.text.indexOf(body) > 0 ? st.text.indexOf(body) : 400,
        ),
      );
      const prev = fns.get(fn[1]);
      fns.set(fn[1], {
        name: fn[1],
        args: prev ? `${prev.args} | ${args}` : args,
        returns: /RETURNS (.+?) LANGUAGE/.exec(attrs)?.[1] ?? "",
        language: /LANGUAGE (\w+)/.exec(attrs)?.[1] ?? "",
        definer: /SECURITY DEFINER/.test(attrs),
        pinned: /SET search_path/.test(attrs),
        computedColumn: /^\w+ public\.\w+$|^public\.\w+$/.test(args) && !/,/.test(args),
        body: prev ? `${prev.body}\n${body}` : body,
        comment: prev?.comment ?? "",
        grants: prev?.grants ?? new Set(),
      });
      continue;
    }
    const comment = /^COMMENT ON FUNCTION public\.(\w+)\(/.exec(head);
    if (comment && fns.has(comment[1])) {
      const text = /IS '([\s\S]*)'$/.exec(st.text)?.[1] ?? "";
      fns.get(comment[1]).comment = unquote(flat(text));
      continue;
    }
    const grant = /^GRANT ALL ON FUNCTION public\.(\w+)\([^)]*\) TO (\w+)/.exec(head);
    if (grant && fns.has(grant[1])) {
      fns.get(grant[1]).grants.add(grant[2]);
      continue;
    }
    const trigger =
      /^CREATE (?:CONSTRAINT )?TRIGGER (\w+) .*? ON public\.(\w+) .*EXECUTE FUNCTION public\.(\w+)\(/.exec(
        flat(st.text),
      );
    if (trigger) {
      // A trigger runs its function, and its WHEN may ask another (leads_note_set_aside asks lead_is_set_aside).
      triggers.push({ name: trigger[1], table: trigger[2], fn: trigger[3], text: st.text });
      continue;
    }
    if (/^(CREATE POLICY|CREATE TABLE|CREATE VIEW|CREATE MATERIALIZED VIEW|ALTER TABLE)/.test(head)) {
      const what = /^CREATE POLICY (\w+) ON public\.(\w+)/.exec(head);
      others.push({
        label: what ? `rule ${what[1]} on ${what[2]}` : head.split(" ").slice(0, 3).join(" "),
        text: st.text,
      });
    }
  }
  return { fns, triggers, others };
}

/* ------------------------------------------------------------------ the clock, the code, the scripts */

/** The jobs pg_cron holds after every migration, in order: each `cron.schedule('name', …, $$command$$)` less each `cron.unschedule('name')`. */
export function clockOf(root = ROOT) {
  const jobs = new Map();
  const dir = path.join(root, MIGRATIONS);
  for (const f of fs
    .readdirSync(dir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    const text = fs.readFileSync(path.join(dir, f), "utf8").replace(/--[^\n]*/g, "");
    const events = [];
    for (const m of text.matchAll(/cron\.schedule\s*\(\s*'([^']+)'\s*,\s*'[^']*'\s*,\s*(\$\w*\$|')([\s\S]*?)\2\s*\)/g))
      events.push([m.index, "on", m[1], m[3]]);
    for (const m of text.matchAll(/cron\.unschedule\s*\(\s*'([^']+)'/g)) events.push([m.index, "off", m[1]]);
    for (const [, kind, name, command] of events.sort((a, b) => a[0] - b[0])) {
      if (kind === "on") jobs.set(name, command);
      else jobs.delete(name);
    }
  }
  return jobs;
}

/**
 * Who calls each function by name in the code, and in the scripts a person runs: a `.rpc("…")`, or the name alone as a
 * string a helper hands on (`json("lead_run_lease", …)` in the leads' runner). A route folder may be named `test`
 * (`app/api/v1/lines/forwarding/test`), so only the test trees are left out, never a folder by its name.
 */
export function codeCallersOf(names = null) {
  const NOT_RUNTIME = /^(tests|e2e)\/|^apps\/[^/]+\/test\/|\.test\.|\.spec\.|\.type-test\./;
  const literal = names ? new RegExp(`["'\`](${names.join("|")})["'\`]`, "g") : null;
  const collect = (trees, keep) => {
    const byFn = new Map();
    const add = (fn, who) => (byFn.get(fn) ?? byFn.set(fn, new Set()).get(fn)).add(who);
    for (const f of repoFiles(trees).filter(keep)) {
      for (const fn of rpcCallNames(parse(f))) add(fn, f);
      // A DbFailure's label says what failed, and calls nothing.
      if (literal)
        for (const m of fs
          .readFileSync(path.join(ROOT, f), "utf8")
          .replace(/new DbFailure\([^)]*\)/g, "")
          .matchAll(literal))
          add(m[1], f);
    }
    return byFn;
  };
  return {
    code: collect(
      ["apps", "packages"],
      (x) => /\.(ts|tsx|mjs)$/.test(x) && !NOT_RUNTIME.test(x) && !/database\.types\.ts$/.test(x),
    ),
    scripts: collect(["tooling/scripts"], (x) => /\.(ts|mjs)$/.test(x)),
  };
}

/** The modules whose string literals name a computed column (a `.select("…")` reads it as a column). */
function computedColumnReaders(names) {
  const out = new Map(names.map((n) => [n, new Set()]));
  if (names.length === 0) return out;
  const re = new RegExp(`["'\`][^"'\`]*\\b(${names.join("|")})\\b[^"'\`]*["'\`]`, "g");
  for (const f of repoFiles(["apps", "packages"]).filter(
    (x) => /\.(ts|tsx)$/.test(x) && !/\.test\.|\.type-test\./.test(x),
  )) {
    const text = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const m of text.matchAll(re)) out.get(m[1])?.add(f);
  }
  return out;
}

/* ------------------------------------------------------------------ the map */

const KIND_ORDER = ["door", "reader", "the server's", "computed column", "trigger"];

/** Each function with its kind, who may call it, and who does. */
export function mapOf(sql, { clock, code, scripts }) {
  const { fns, triggers, others } = functionsOf(sql);
  const names = [...fns.keys()];
  const nameRe = new RegExp(`\\b(${names.join("|")})\\s*\\(`, "g");
  const sqlCallers = new Map(names.map((n) => [n, new Set()]));
  for (const f of fns.values())
    for (const m of f.body.matchAll(nameRe)) if (m[1] !== f.name) sqlCallers.get(m[1]).add(f.name);
  const ruleCallers = new Map(names.map((n) => [n, new Set()]));
  for (const o of others) for (const m of o.text.matchAll(nameRe)) ruleCallers.get(m[1]).add(o.label);
  const triggerOf = new Map(names.map((n) => [n, new Set()]));
  for (const t of triggers) {
    triggerOf.get(t.fn)?.add(`${t.name} on ${t.table}`);
    for (const m of t.text.matchAll(nameRe)) if (m[1] !== t.fn) triggerOf.get(m[1]).add(`${t.name} on ${t.table}`);
  }
  const clockOfFn = new Map(names.map((n) => [n, new Set()]));
  for (const [job, command] of clock) for (const m of command.matchAll(nameRe)) clockOfFn.get(m[1]).add(job);
  const columnReaders = computedColumnReaders(names.filter((n) => fns.get(n).computedColumn));

  return names.sort().map((n) => {
    const f = fns.get(n);
    const kind = /^trigger\b/.test(f.returns)
      ? "trigger"
      : f.computedColumn
        ? "computed column"
        : f.grants.has("authenticated") || f.grants.has("anon")
          ? f.definer
            ? "door"
            : "reader"
          : "the server's";
    const mayCall = [
      f.grants.has("anon") && "anyone",
      f.grants.has("authenticated") && "a signed-in person",
      f.grants.has("service_role") && "the server",
    ].filter(Boolean);
    const calledBy = {
      code: [...(code.get(n) ?? []), ...(columnReaders.get(n) ?? [])].sort(),
      sql: [...sqlCallers.get(n)].sort(),
      triggers: [...triggerOf.get(n)].sort(),
      rules: [...ruleCallers.get(n)].sort(),
      clock: [...clockOfFn.get(n)].sort(),
      scripts: [...(scripts.get(n) ?? [])].sort(),
    };
    return { name: n, kind, definer: f.definer, pinned: f.pinned, mayCall, calledBy, comment: f.comment };
  });
}

/** The functions nothing calls: no code, no SQL, no trigger, no rule, no clock and no script a person runs. */
export const uncalled = (map) =>
  map
    .filter((r) => ["code", "sql", "triggers", "rules", "clock", "scripts"].every((k) => r.calledBy[k].length === 0))
    .map((r) => r.name);

/* ------------------------------------------------------------------ the page */

const cell = (s) => s.replace(/\s+/g, " ").trim().replace(/\|/g, "\\|");
const few = (list, word) => {
  if (list.length === 0) return null;
  const shown = list
    .slice(0, 2)
    .map((x) => `\`${x}\``)
    .join(", ");
  return `${word} ${shown}${list.length > 2 ? ` and ${list.length - 2} more` : ""}`;
};
const firstSentence = (s) => {
  const m = /^(.{20,200}?[.;:])(\s|$)/.exec(s);
  return cell(m ? m[1] : s.slice(0, 200));
};

export function render(map) {
  const byKind = new Map(KIND_ORDER.map((k) => [k, map.filter((r) => r.kind === k)]));
  const none = uncalled(map);
  const out = [
    "# The SQL map",
    "",
    "<!-- GENERATED by tooling/scripts/gen/sql-map.mjs. Do not edit: regenerate. -->",
    "",
    "Every function in the `public` schema, as the migrations leave it: what kind it is, who may call it, and who does.",
    "A **door** runs as its owner and a signed-in person (or anyone) may call it, so it checks who asks itself; a **reader**",
    "runs as the person calling, under their row-level security; **the server's** is granted to the service role alone; a",
    "**computed column** is read as a column of its table; a **trigger** runs on a table's writes. A caller is a module",
    'of the code (`.rpc("…")`, or a `.select("…")` naming a computed column), another function, a trigger, a rule, a table',
    "or view, the clock (a `cron.schedule` in a migration), or a script a person runs. The tables are in",
    "[data-model.md](data-model.md); each function's body, grants and comment in full are in `supabase/schema.sql`.",
    "",
    "After a migration: `corepack pnpm gen:schema-snapshot` (with `supabase start` running), then `corepack pnpm",
    "gen:sql-map`. `tests/docs/sql-map.test.mjs` fails when this page is not what the script writes, and when a function",
    "nothing calls is neither named below with why nor dropped.",
    "",
    "## How many",
    "",
    "| Kind | Functions | Run as their owner |",
    "| --- | --- | --- |",
    ...KIND_ORDER.map((k) => `| ${k} | ${byKind.get(k).length} | ${byKind.get(k).filter((r) => r.definer).length} |`),
    `| all | ${map.length} | ${map.filter((r) => r.definer).length} |`,
    "",
    "## Called by nothing",
    "",
    "No code, function, trigger, rule, clock or script calls these; each stays for the reason given, and one that stops",
    "being read is dropped by a migration.",
    "",
    "| Function | Why it stays |",
    "| --- | --- |",
    ...none.map(
      (n) =>
        `| \`${n}\` | ${cell(KEPT_WITH_NO_CALLER[n] ?? "NOT NAMED: give it a caller, name it in KEPT_WITH_NO_CALLER with why, or drop it")} |`,
    ),
    "",
    "## Every function",
    "",
    "| Function | Kind | Who may call it | Called by | What it does |",
    "| --- | --- | --- | --- | --- |",
    ...map.map((r) => {
      const by =
        [
          few(r.calledBy.code, "code"),
          few(r.calledBy.sql, "SQL"),
          few(r.calledBy.triggers, "trigger"),
          few(r.calledBy.rules, "in"),
          few(r.calledBy.clock, "the clock,"),
          few(r.calledBy.scripts, "script"),
        ]
          .filter(Boolean)
          .join("; ") || "nothing at run time";
      return `| \`${r.name}\` | ${r.kind} | ${r.mayCall.join(", ") || "its owner"} | ${by} | ${r.comment ? firstSentence(r.comment) : ""} |`;
    }),
  ];
  return `${out.join("\n")}\n`;
}

/** The page as the committed snapshot, migrations and code say it should read. */
export function generate() {
  const snapshot = fs.readFileSync(path.join(ROOT, SNAPSHOT), "utf8").replace(/\r\n/g, "\n");
  return render(mapOf(snapshot, { clock: clockOf(), ...codeCallersOf([...functionsOf(snapshot).fns.keys()]) }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.join(ROOT, OUT);
  const next = generate();
  const rows = (next.match(/^\| `/gm) ?? []).length;
  if (!process.argv.includes("--check")) {
    fs.writeFileSync(out, next);
    console.log(`wrote ${OUT} (${next.split("\n").length - 1} lines, ${rows} rows)`);
    process.exit(0);
  }
  const current = fs.existsSync(out) ? fs.readFileSync(out, "utf8").replace(/\r\n/g, "\n") : "";
  if (current === next) {
    console.log(`${OUT} is current.`);
    process.exit(0);
  }
  console.error(`${OUT} is stale: run \`corepack pnpm gen:sql-map\` and commit the result.`);
  process.exit(1);
}
