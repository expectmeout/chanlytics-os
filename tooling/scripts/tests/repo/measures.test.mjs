/**
 * The measures and their comparison, on sources written for them.
 *
 * check:debt holds the repository's numbers (decision 0074); this holds what a
 * number means, on inline modules small enough to count by hand. Each case is one
 * the measures got wrong before a review of Phase 0, so a test here fails on the
 * old definition and passes on the one the plan (§5) writes down.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import ts from "typescript";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { compare } from "../_ratchet.mjs";
import {
  functionsIn,
  windowUse,
  unknownCasts,
  castsIn,
  copiesAmong,
  repoFiles,
  importsMatching,
  sourceReads,
  mediaWidths,
  mediaPreludes,
  stringsIn,
  tablesWrittenIn,
  rpcNames,
  serviceRoleReaches,
} from "../_ast.mjs";
import { breakpointSet, DOOR_FORBIDS, doorsWithoutEventsIn, tablesWrittenBy, writersByTable } from "../_measures.mjs";
import { knipCommand } from "../../checks/dead-exports.mjs";
import { flatWarnings, heldButClean } from "../../checks/lint.mjs";

const source = (text, name = "fixture.ts") =>
  ts.createSourceFile(
    name,
    text,
    ts.ScriptTarget.Latest,
    true,
    name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

/* ---- The comparison ---- */

// What a change adds to the main it stands on (checks/debt.mjs judge): a new key, a number that rose; what fell or
// went is said and needs nothing.
test("a comparison says a rise and a new key, and apart from them a fall and a removal", () => {
  const was = { fell: 5, rose: 3, gone: 2, fn: { lines: 200, branches: 40, depth: 6 } };
  const now = { fell: 4, rose: 7, fresh: 1, fn: { lines: 190, branches: 42, depth: 6 } };
  assert.deepEqual(compare(now, was).worse, [
    "fn: now lines 190, branches 42, depth 6, base lines 200, branches 40, depth 6",
    "fresh: new (1)",
    "rose: now 7, base 3",
  ]);
  assert.deepEqual(compare(now, was).better, [
    "fell: now 4, base 5",
    "fn: now lines 190, branches 42, depth 6, base lines 200, branches 40, depth 6",
    "gone: gone (base 2)",
  ]);
});

// A helper of the test's own that reads a file is as much a source-text read as readCode: it went uncounted until
// 29 Sep 2026 (22 reads in 7 files). What the helper's name is bound to where it is called decides, and a helper
// that loads data is not source.
test("a source read through a helper of the file's own counts, a shadowing name or a data file does not", () => {
  const sf = source(`
    import fs from "node:fs";
    const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
    function load(name) { return JSON.parse(fs.readFileSync(name, "utf8")); }
    const a = read("apps/edge/lib/pg.ts");
    const b = read(\`packages/core/src/inbound/\${m}.ts\`);
    const c = load("fixtures/reply.json");
    const d = read("docs/runbook.md");
    test("x", async () => {
      const read = async (tenants) => world(tenants);
      await read("apps/edge/lib/pg.ts");
    });
  `);
  assert.equal(sourceReads(sf), 2);
});

test("a set's numbers are a record: its keys may only go, its numbers follow the measure", () => {
  const was = { __A: 2, __B: 5, __GONE: 1 };
  const now = { __A: 4, __B: 1, __NEW: 1 };
  assert.deepEqual(compare(now, was, "set"), {
    worse: ["__NEW: new (1)"],
    better: ["__B: now 1, base 5", "__GONE: gone (base 1)"],
  });
});

// The lint's warnings, as check:debt keys them, and the rule that a typed rule is a warning only while it has a finding.
const HOOKS = "react-hooks/exhaustive-deps";
const UNUSED = "@typescript-eslint/no-unused-vars";
const WARNINGS = { "apps/a.jsx": { [HOOKS]: 4, [UNUSED]: 1 }, "packages/b.ts": { [UNUSED]: 2 } };

test("the lint's warnings are one number for each file and rule, and a held typed rule with no finding is said", () => {
  assert.deepEqual(flatWarnings(WARNINGS), {
    [`apps/a.jsx::${HOOKS}`]: 4,
    [`apps/a.jsx::${UNUSED}`]: 1,
    [`packages/b.ts::${UNUSED}`]: 2,
  });
  assert.deepEqual(heldButClean(WARNINGS, [HOOKS, "@typescript-eslint/no-deprecated"]), [
    "@typescript-eslint/no-deprecated",
  ]);
  assert.deepEqual(heldButClean(WARNINGS, [HOOKS, UNUSED]), []);
});

/* ---- Functions, as ESLint's `complexity` and `max-depth` count them ---- */

test("an else-if chain is flat, and a ternary adds no depth", () => {
  const [chain] = functionsIn(
    source(
      "function f(x){ if(x===1){} else if(x===2){} else if(x===3){} else if(x===4){} else if(x===5){} else if(x===6){} }",
    ),
  );
  assert.deepEqual([chain.branches, chain.depth], [7, 1]);
  const [flat] = functionsIn(source("function g(a){ return a ? (b ? 1 : 2) : 3 }"));
  assert.deepEqual([flat.branches, flat.depth], [3, 0]);
});

test("a nested function's branches and depth are its own, not its container's", () => {
  const [outer, inner] = functionsIn(
    source("function outer(xs){ return xs.map(x => { if(x){ if(x>1){ if(x>2){ return 1 } } } return 0 }) }"),
  );
  assert.deepEqual([outer.branches, outer.depth], [1, 0]);
  assert.deepEqual([inner.branches, inner.depth], [4, 3]);
});

test("defaults, logical assignment and optional chaining are branches", () => {
  const [g] = functionsIn(source("function g(a = 1, b = 2){ let c; c ??= 1; c ||= 2; c &&= 3; return a?.b?.c }"));
  assert.equal(g.branches, 8);
});

// The definition, checked against ESLint itself: every function in the module has the
// complexity ESLint's `complexity` reports for it and the depth `max-depth` reports
// inside it. Written one function head per line, so a report's line names its function.
test("every function counts as ESLint counts it", () => {
  const code = [
    "function chain(x) {",
    "  if (x === 1) {",
    "  } else if (x === 2) {",
    "  } else if (x === 3) {",
    "  } else {",
    "    if (x) {",
    "    }",
    "  }",
    "}",
    "function outer(xs) {",
    "  return xs.map((x) => {",
    "    if (x) {",
    "      for (const y of x) {",
    "        while (y) {",
    "          break;",
    "        }",
    "      }",
    "    }",
    "    return x ? 1 : 2;",
    "  });",
    "}",
    "function defaults(a = 1, { b = 2, c: { d = 3 } = {} } = {}, [e = 4] = []) {",
    "  let f;",
    "  f ??= a;",
    "  f ||= b;",
    "  f &&= d;",
    "  [f = 5] = [];",
    "  ({ g: f = 6 } = {});",
    "  const { h = 7 } = {};",
    "  return a?.b?.c ?? d?.(e) ?? e?.[0] ?? h;",
    "}",
    "function tries(a, b, c) {",
    "  try {",
    "    if (a) {",
    "      do {",
    "      } while (b);",
    "    }",
    "  } catch (e) {",
    "    switch (e) {",
    "      case 1:",
    "        if (c) {",
    "        }",
    "        break;",
    "      default:",
    "    }",
    "  } finally {",
    "    for (;;) {",
    "      break;",
    "    }",
    "  }",
    "}",
    "class K {",
    "  x = a ?? b;",
    "  static {",
    "    if (c) {",
    "    }",
    "  }",
    "  method(p = 1) {",
    "    return p || this.x;",
    "  }",
    "  get g() {",
    "    return a && b;",
    "  }",
    "  constructor() {",
    "    if (a) {",
    "    }",
    "  }",
    "}",
    "const arrow = (a) => (a && b ? <div>{a ?? <span />}</div> : null);",
    "function withClass() {",
    "  class Inner {",
    "    y = a || b;",
    "    m() {",
    "      return c ?? d;",
    "    }",
    "  }",
    "  return new Inner();",
    "}",
  ].join("\n");
  const linter = new Linter();
  const reports = linter.verify(
    code,
    [
      {
        files: ["**/*.tsx"],
        languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
        rules: { complexity: ["error", 0], "max-depth": ["error", 0] },
      },
    ],
    "fixture.tsx",
  );
  assert.deepEqual(
    reports.filter((r) => r.fatal),
    [],
  );
  const fns = functionsIn(source(code, "fixture.tsx"));
  // max-depth reports each block at its depth; a block belongs to the innermost function around its line.
  const innermost = (line) =>
    fns.filter((f) => line >= f.line && line < f.line + f.lines).sort((a, b) => a.lines - b.lines)[0];
  const eslint = new Map(fns.map((f) => [f.line, { line: f.line, branches: NaN, depth: 0 }]));
  for (const r of reports) {
    if (r.ruleId === "complexity") {
      // A class field's initializer is a code path of its own to ESLint and no function to the measure.
      if (/^Class field initializer/.test(r.message)) continue;
      const row = eslint.get(r.line) ?? { line: r.line, branches: NaN, depth: 0 };
      row.branches = Number(r.message.match(/complexity of (\d+)/)[1]);
      eslint.set(r.line, row);
    } else if (r.ruleId === "max-depth") {
      const row = eslint.get(innermost(r.line).line);
      row.depth = Math.max(row.depth, Number(r.message.match(/\((\d+)\)/)[1]));
    }
  }
  assert.deepEqual(
    fns.map((f) => ({ line: f.line, branches: f.branches, depth: f.depth })),
    [...eslint.values()].sort((a, b) => a.line - b.line),
  );
});

// A key named its function by its place among every callback in the file, so adding
// one anywhere above renamed it. A callback is now named by the function it is written
// in and what it is handed to, and numbered among those alone.
test("a callback's key survives an unrelated callback added above it", () => {
  const key = (text) =>
    functionsIn(source(text))
      .filter((f) => f.branches > 30)
      .map((f) => f.key);
  const body = "if(a){} ".repeat(31);
  const before = key(`function A(){ useEffect(() => { ${body} }) }`);
  const after = key(`function A(){ useMemo(() => 1); xs.map(x => x); useEffect(() => { ${body} }) }`);
  assert.deepEqual(before, ["A/useEffect(fn)#1"]);
  assert.deepEqual(after, before);
  const named = functionsIn(
    source("const B = () => <b onClick={() => go()} />; function C(){ return new Promise((r) => r()) }", "b.tsx"),
  );
  assert.deepEqual(
    named.map((f) => f.key),
    ["B#1", "B/onClick={fn}#1", "C#1", "C/Promise(fn)#1"],
  );
});

/* ---- Casts hide nothing ---- */

test("a window read or written through a cast or an alias is still one", () => {
  const use = windowUse(
    source(
      [
        "const a = (window as any).__FOO;",
        "const b = (<any>window).__QUX;",
        "const { __BAR, plain } = window as any;",
        "(window as any).__BAZ = 1;",
        "Object.assign(window as unknown as object, {});",
        "window.__OK;",
        'window["__QUOTED"];',
        "window[__notAName];",
        "function f() {",
        "  const w = window as unknown as Record<string, unknown>;",
        "  w.__ALIAS;",
        "  w.x = 1;",
        "}",
        "function g(w: { __NOT: number; y: number }) {",
        "  w.__NOT;",
        "  w.y = 2;",
        "}",
      ].join("\n"),
    ),
  );
  assert.deepEqual([...use.names].sort(), ["__ALIAS", "__BAR", "__BAZ", "__FOO", "__OK", "__QUOTED", "__QUX"]);
  assert.equal(use.publishers, 3);
});

test("a value laundered through unknown is counted however it is written", () => {
  const casts = (text) => unknownCasts(source(text));
  assert.equal(casts("const a = x as unknown as T;"), 1);
  assert.equal(casts("const a = (x as unknown) as T;"), 1);
  assert.equal(casts("const a = <T><unknown>x;"), 1);
  assert.equal(casts("const a = <T>(<unknown>x);"), 1);
  assert.equal(casts("const a = x as unknown; const b = y as T;"), 0);
});

// The casts measure holds three families per module, each counted once: laundering through unknown, a value told it is never
// (`as never` on an RPC's arguments turns off the check that their keys exist), and a value told it is not null.
test("the casts are counted by family: as unknown as, as never and x!, a family at zero left out", () => {
  const families = (text) => castsIn(source(text));
  assert.deepEqual(families("const a = x as never; const b = <never>y; const c = (z as never);"), { never: 3 });
  assert.deepEqual(families("const a = x!; const b = y!.z; f(w!);"), { nonNull: 3 });
  assert.deepEqual(
    families("let a!: string; const b = x as T; const c = y satisfies T;"),
    {},
    "a definite assignment is not a cast",
  );
  assert.deepEqual(
    families("const a = x as unknown as never; const b = y as unknown as T; const c = z!;"),
    { unknownAs: 2, nonNull: 1 },
    "`as unknown as never` is laundering, counted once, and not a second time as never",
  );
});

/* ---- Doors hold no repository and no provider client ---- */

// The wiring map found 31 of the edge's 51 routes and 16 of the dashboard's "fat": a door holding a rule or a table
// query. Its proxy is what a door imports: a repository or a provider client is the layer behind the door.
test("a door's repository and provider imports are counted, and a type, a lib call, a verb or a reader is not", () => {
  const door = source(
    [
      'import { createServiceClient } from "@chanlytics/db";', // 1: a repository
      'import { providerFetch } from "../lib/packages/channels.js";', // 2: a provider client, by the edge's facade
      'import { listThing } from "../../lib/packages/db";', // 3: a repository, by the facade
      'import { createClient } from "@supabase/supabase-js";', // 4: a repository's own client
      'export { sendWire } from "@chanlytics/channels";', // 5: a re-export holds the module too
      'const later = () => import("@chanlytics/db");', // 6: so does a dynamic import
      'import type { Database } from "@chanlytics/db";',
      'import { type Row, type Table } from "@chanlytics/db";',
      'import { snooze } from "@chanlytics/core";',
      'import { json } from "../lib/http.js";',
      'import { pg } from "../lib/pg.js";',
      'import { readPeople } from "@/server/readers/people";',
      'import { z } from "zod";',
    ].join("\n"),
    "door.ts",
  );
  assert.equal(importsMatching(door, DOOR_FORBIDS), 6);
  assert.equal(importsMatching(source('import { json } from "../lib/http.js";', "clean.ts"), DOOR_FORBIDS), 0);
});

/* ---- The file set ---- */

// The vendored MapLibre bundle under apps/dashboard/public was measured as ours: its minified
// functions were over the limits and its one-letter names made copies with ours.
test("what the browser loads as it is, under an app's public/, is no measure's; our own public/ modules are", () => {
  const files = repoFiles(["apps"]);
  assert.deepEqual(
    files.filter((f) => f.split("/")[2] === "public"),
    [],
  );
  assert.ok(files.includes("apps/dashboard/src/server/public/consent-page.ts"), "src/server/public is our code");
});

/* ---- Copies ---- */

// A name shorter than four letters was skipped, which hid the helpers most often copied
// (`num`, `str`, `obj`, `hex`, `sum`); plan §5 has no such floor.
test("a short name declared in three files is a copy like any other", () => {
  const files = ["a", "b", "c"].map((f) =>
    source(`const num = (v) => Number(v); function plural(n) { return n; } const ${f}Only = 1;`, `${f}.ts`),
  );
  assert.deepEqual(copiesAmong(files, 3), { num: 3, plural: 3 });
});

/* ---- Breakpoints ---- */

test("a width condition is read as where it splits the screens, from either side and however it is spelt", () => {
  // Both sides of 720, in every spelling a media query takes: each splits the screens at 720.
  for (const q of [
    "(max-width: 720px)",
    "(max-width:720px)",
    "(min-width: 721px)",
    "(width <= 720px)",
    "(width < 721px)",
    "(width > 720px)",
    "(width >= 721px)",
    "(720px < width)",
    "(721px <= width)",
    "(721px > width)",
    "(720px >= width)",
  ])
    assert.deepEqual(mediaWidths(q), [720], q);
  // A pixel off is another width: (min-width: 900px) and (max-width: 900px) both hold at exactly 900px.
  assert.deepEqual(mediaWidths("(min-width: 900px)"), [899]);
  // Two in one pair of brackets, and a width among other features, in the order they are written.
  assert.deepEqual(mediaWidths("(721px <= width <= 900px)"), [720, 900]);
  assert.deepEqual(mediaWidths("(hover: hover) and (pointer: fine) and (min-width: 761px)"), [760]);
  assert.deepEqual(mediaWidths("(max-width: 900px) and (max-height: 700px)"), [900], "a height is not a width");
  assert.deepEqual(mediaWidths("(prefers-reduced-motion: reduce)"), []);
  // What no set of pixels can hold is kept as it is written.
  assert.deepEqual(mediaWidths("(max-width: 45em)"), ["45em"]);
  assert.deepEqual(mediaWidths("(max-width: 720.5px)"), ["720.5px"]);
});

test("a stylesheet's @media rules are read with its comments aside, and a script's queries wherever its strings are", () => {
  const css = [
    "/* @media (max-width: 1px) { } */",
    "@media (max-width: 640px) { .a { color: red } }",
    ".b { max-width: 100px }",
    "@media print, (min-width: 761px) { .c { color: blue } }",
  ].join("\n");
  assert.deepEqual(mediaPreludes(css).flatMap(mediaWidths), [640, 760]);
  const sf = ts.createSourceFile(
    "q.jsx",
    [
      'const Q = "(max-width: 760px)";',
      // A width a template computes is not read; what it writes out whole is.
      "const t = `(max-width: ${n}px) and (min-width: 721px)`;",
      'const el = <source media="(max-width: 640px)" />;',
      'window.matchMedia("(max-width: 720px)");',
    ].join("\n"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JSX,
  );
  assert.deepEqual(stringsIn(sf).flatMap(mediaWidths), [760, 720, 640, 720]);
});

test("the set is the one tokens.css writes: a phone's width, a narrow screen's and a small desk's", () => {
  assert.deepEqual(
    [...breakpointSet()].sort((a, b) => a - b),
    [720, 900, 1280],
  );
});

/* ---- knip without pnpm ---- */

// checks/dead-exports.mjs spawned a bare `pnpm`, which a corepack-only machine does not have.
test("knip runs from node alone, from knip's own bin", () => {
  const [exe, args] = knipCommand(["--version"]);
  assert.equal(exe, process.execPath);
  assert.match(args[0].split(path.sep).join("/"), /\/knip\/bin\/knip\.js$/);
  // A PATH that holds node and nothing else: no pnpm, no corepack shim.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== "PATH"));
  const out = execFileSync(exe, args, { encoding: "utf8", env: { ...env, PATH: path.dirname(process.execPath) } });
  assert.match(out.trim(), /^\d+\.\d+\.\d+$/);
});

/* ---- Writers per table (decision 0031, invariant 1) ---- */

test("a module writes a table when a .from() chain inserts, upserts, updates or deletes it; a read, a storage bucket or a table named by a variable is not counted", () => {
  const sf = source(`
    await db.from("messages").insert(row);
    await db.from("contacts").update({ name }).eq("id", id);
    await db.from("jobs").upsert(job, { onConflict: "id" });
    await db.from("person_notes").delete().eq("id", id);
    await db.from("leads").select("id");
    await db.storage.from("media").update(path, file);
    const t = "calls";
    await db.from(t).insert(row);
  `);
  assert.deepEqual(tablesWrittenIn(sf).sort(), ["contacts", "jobs", "messages", "person_notes"]);
});

test("a SQL function writes what it inserts into, updates and deletes from; an upsert's do update, a lock's for update and a CTE's name are not tables it writes", () => {
  const tables = new Set(["messages", "contacts", "jobs", "leads"]);
  const body = `
    with fresh as (select 1)
    insert into public.messages (id) values (1) on conflict (id) do update set id = excluded.id;
    update public.contacts set name = 'x' where id = 1;
    perform 1 from public.leads l where l.id = 2 for update skip locked;
    delete from jobs where id = 3;
    update fresh set x = 1;
  `;
  assert.deepEqual([...tablesWrittenBy(body, tables)].sort(), ["contacts", "jobs", "messages"]);
});

test("the writers measure leaves out the tables many places write by design, and the writers that only take rows away", () => {
  const w = writersByTable();
  assert.ok(
    !w.has("events") && !w.has("decisions") && !w.has("sweep_status"),
    "every door's event, every verb's decision, every clock's row",
  );
  assert.deepEqual(
    [...w.get("provider_events")],
    ["packages/db/src/provider-events.ts"],
    "the intake ledger's purge and scrub only take rows away: one writer",
  );
  assert.ok(!w.get("leads").has("lead_blank()"), "a lead blanked is a lead's words taken away");
  assert.ok(
    w.get("lead_suppressions").has("leads_erase_on_contact()"),
    "an erasure leg that adds a suppression is a writer of it like any other: the waiver is for what it takes away",
  );
});

test("a door writes its event in its body, through a function it calls or through a trigger on what it writes; a door that writes a record and none is counted", () => {
  // In the snapshot's own shape: a header, then the body after a line that opens with AS, a blank line after each.
  const fn = (name, body, definer = true) =>
    `CREATE FUNCTION public.${name}() RETURNS void
    LANGUAGE plpgsql${definer ? " SECURITY DEFINER" : ""}
    SET search_path TO 'public'
    AS $$
begin
${body}
end $$;
`;
  const table = (name) => `CREATE TABLE public.${name} (
    id uuid
);
`;
  const sql = [
    ...["events", "notes", "leads", "jobs", "sweep_status"].map(table),
    fn("note_add", "insert into public.notes (id) values (1); insert into public.events (id) values (1);"),
    fn("note_event", "insert into public.events (id) values (1);", false),
    fn("note_add_via", "insert into public.notes (id) values (1); perform public.note_event();"),
    fn("leads_noted", "insert into public.events (id) values (1);", false),
    fn("lead_add", "insert into public.leads (id) values (1);"),
    `CREATE TRIGGER leads_noted AFTER INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.leads_noted();
`,
    // A trigger that names no function of ours is passed by, not read on into the next statement's.
    `CREATE TRIGGER notes_stamped BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('at');
`,
    fn("note_quiet", "update public.notes set id = 2;"),
    fn("note_quiet_unprivileged", "update public.notes set id = 2;", false),
    fn("job_schedule", "insert into public.jobs (id) values (1); update public.sweep_status set id = 1;"),
    fn("purge_notes", "delete from public.notes;"),
    // An erasure's leg is waived for what it takes away, and not for a row it adds.
    fn("notes_erase_on_contact", "update public.notes set id = null; insert into public.notes (id) values (1);"),
  ].join(`
`);
  assert.deepEqual(doorsWithoutEventsIn(sql), { "note_quiet()": 1, "notes_erase_on_contact()": 1 });
});

/* ---- The doors a module reaches ---- */

test("a SQL function is counted by name whether the client's rpc is called on it or bound to a name first", () => {
  const sf = source(`
    await db.rpc("set_person_email", { p: 1 });
    const rpc = ctx.supabase.rpc.bind(ctx.supabase);
    await rpc("set_person_name", { p: 1 });
    await rpc(name, {});
    await other("set_person_notes");
  `);
  assert.equal(
    rpcNames(sf),
    2,
    "the direct call and the bound one; a computed name and another function are not counted",
  );
});

test("the service-role client is counted where it is taken, called or handed on, never where it is imported or made", () => {
  const sf = source(`
    import { serviceDb, serviceDbIfConfigured } from "@/server/service-db";
    export function serviceDb() { return make(); }
    const a = serviceDb();
    const b = serviceDbIfConfigured();
    await run({ db: serviceDb });
    const c = ports.serviceDb;
  `);
  assert.equal(serviceRoleReaches(sf), 3);
});
