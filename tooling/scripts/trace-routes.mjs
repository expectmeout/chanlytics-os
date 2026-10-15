/**
 * Which database tables each route of the dashboard reads and writes, followed through the code that serves it
 * (decision 0047, point 4; the 4 October Campaigns wiring review's lane W3). Ported from the Wiring Blueprint's tracer
 * (11 October 2026, `Claude Video/docs/2026-10-11-chanlytics-wiring-blueprint-evidence/tools/deps.mjs`) as plain ESM
 * with no dependency, over a root it is handed so a test can run it on a small repository of its own.
 *
 * It reads the source as text, function by function, the way the repository's other scans do, and it follows:
 *  - a route's handler into the server code it calls (`apps/dashboard/src/server`, the readers), and from there into
 *    `packages/db`, `packages/core`, `packages/jobs` and `packages/channels` by their imports (a name imported, re-exported or
 *    reached through an `import * as` namespace, or handed on by name: `route(policy, handler)`, `.map(toVM)`);
 *  - a `.from("table")` into a read, or a write when `.insert`, `.update`, `.upsert` or `.delete` follows it; a PostgREST
 *    embed (`.select("id, contact:contacts(name), messages!inner(body)")`) into a read of each table it names; a SQL string
 *    that says `from public.x` or `insert into public.x` into the same;
 *  - an `rpc("name")`, or a name in a table of names where the segment calls `rpc` at all, into the SQL function in
 *    `supabase/schema.sql` and the functions it calls, with every table it reads and writes;
 *  - a write into the writes of its triggers, to a fixed point, with the exclusions that kept the trace exact: the erasure,
 *    merge, doubt, blank and purge triggers fire only on those rare column changes (following them makes every contact write
 *    look like an erasure), and the ledger's own triggers (`events`, `event_outbox`) each fire for one kind of event (followed
 *    for every event, every write would write everything);
 *  - a call to the edge by its door (`"/api/admin/steer"`, as the dashboard names it) into the door's file under
 *    `apps/edge/api` and what that calls: the dashboard asks the edge to do what it cannot do as the member. A door serves every
 *    action of its feature, so its whole file is the most a route may do through it: the doors' share is kept apart
 *    (`doorWrites`, `allVerbs`), and `reads` and `writes` are the dashboard's own.
 *
 * What it does not follow: a table named by a variable, a call through an object it cannot resolve, a SQL function built
 * from a string, the columns a write sets. Where it is wrong it is wrong low, so a gap it reports is real and a table it
 * misses is one the baseline the test holds cannot list. `PLUMBING` is the named list of tables a route touches for the
 * machinery's sake, not for what it answers, and `WRAPPER` the files whose reads every route pays for.
 *
 * It sits here, not among the tests, because what it finds is more than a test's: the hearing tests read it
 * (tests/shell/hearing), and a generator may (the wiring audit's lane R7 derives what a write changes from it). It also
 * names the surfaces the shell registers and the file each comes from (`registeredSurfaces`), so no test keeps that list by
 * hand.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Tables a route reads or writes for the sake of the machinery around it, not for the record it answers or changes: the ledger
 * and its outbox (every write leaves its event), the replay guard of an `Idempotency-Key`, the decision log, the jobs ledger,
 * the sweeps' clocks, the provider's raw events, the usage meters, the push devices and the keys and counters the erasure and the
 * finder keep for themselves, and the two tables a trigger fills from rows a page already hears (`person_moments`,
 * `contact_identities`). Excluded by name from what a page must hear and from what a write changes. `memberships`, `tenants` and
 * `billing_accounts` are not here: they are also records a page draws (the Team pane, the shell, Billing), and what the wrapper reads
 * of them for every route is cut where it is read (`WRAPPER`), so a route that reads them for its answer still counts. Nor are a
 * member's own marks and reads of the bell and of a thread (`notification_marks`, `contact_marks`, ...): the bell and the Inbox draw
 * them, and no notice carries them, which the baseline says.
 */
export const PLUMBING = new Set([
  "events",
  "event_outbox",
  "event_deliveries",
  "idempotency_keys",
  "decisions",
  "jobs",
  "sweep_status",
  "provider_events",
  "operator_pages",
  "platform_admins",
  "rate_hits",
  "ai_usage",
  "model_turns",
  "push_devices",
  "billing_card_marks",
  "billing_events",
  "tenant_config_versions",
  "person_moments",
  "contact_identities",
  "erasure_keying",
  "lead_counters",
  "lead_niche_priors",
  "lead_runs",
  "reach_out_check_spend",
  "google_listing_days",
]);

/**
 * The files whose reads are the wrapper's, not the route's: every route passes through them, and a table they read (the caller's
 * seat, the workspace's standing, the replay guard) says nothing of what the route answers. Not entered.
 */
const WRAPPER = new Set([
  "apps/dashboard/src/server/route.ts",
  "apps/dashboard/src/server/with-route.ts",
  "apps/dashboard/src/server/tenant.ts",
  "apps/dashboard/src/server/idempotency.ts",
]);

const SCOPES = [
  "apps/dashboard/src/server",
  "apps/dashboard/app/api",
  "packages/db/src",
  "packages/core/src",
  "packages/jobs/src",
  "packages/channels/src",
  "apps/edge/api",
  "apps/edge/lib",
];
const PKG_ENTRY = {
  db: "packages/db/src/index.ts",
  core: "packages/core/src/index.ts",
  jobs: "packages/jobs/src/index.ts",
  channels: "packages/channels/src/index.ts",
};
const EXTS = ["", ".ts", ".tsx", "/index.ts"];
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

/** A table's writes, by the event each makes: `Map<table, Set<"INSERT" | "UPDATE" | "DELETE">>`. */
const noteWrite = (map, table, ...verbs) => {
  let set = map.get(table);
  if (!set) map.set(table, (set = new Set()));
  for (const v of verbs) set.add(v);
};
const mergeWrites = (into, from) => {
  for (const [table, verbs] of from) noteWrite(into, table, ...verbs);
};
/** The events a SQL statement makes of its table, from its keyword and, for an insert, whether it can fall back to an update. */
function verbsOf(keyword, statement) {
  const k = keyword.toLowerCase();
  if (k.startsWith("insert"))
    return /\bon\s+conflict\b[\s\S]*?\bdo\s+update\b/i.test(statement) ? ["INSERT", "UPDATE"] : ["INSERT"];
  if (k.startsWith("delete")) return ["DELETE"];
  if (k.startsWith("merge")) return ["INSERT", "UPDATE"];
  return ["UPDATE"];
}
/** The statement that follows a keyword, up to its semicolon (or a screenful), for what the statement goes on to say. */
const statementFrom = (body, at) => body.slice(at, at + 1200).split(";")[0];
const verbsObject = (writes) =>
  Object.fromEntries(
    [...writes].sort(([a], [b]) => (a < b ? -1 : 1)).map(([table, verbs]) => [table, [...verbs].sort()]),
  );

const cache = new Map();

/**
 * The trace of a repository: `{ tables, routes }`, where `routes` maps a route key (`"GET contacts"`) to
 *  - `reads`, `writes`: the tables of the database the dashboard's own code reads and writes (`writes` includes what the writes'
 *    triggers write), sorted; `verbs`: each written table's events (`INSERT`, `UPDATE`, `DELETE`);
 *  - `rpcs`: the SQL functions called; `doors`: the edge doors called;
 *  - `doorReads`, `doorWrites`, `allVerbs`: what the doors add to those, and the events of every write with them;
 *  - `via`: where each table was first met, for the sentence that says why; `reach`: how many functions the trace entered.
 * Cached by root.
 */
export function traceRoutes(root = ROOT) {
  if (!cache.has(root)) cache.set(root, trace(root));
  return cache.get(root);
}

const LEGACY_APP = "apps/dashboard/src/legacy-bridge/LegacyApp.tsx";
const legacyApp = (root) => fs.readFileSync(path.join(root, LEGACY_APP), "utf8").replace(/\r\n/g, "\n");

/**
 * The surfaces the shell registers, by the name of each one's override (`peopleOverride`), in the order `LegacyApp.tsx` lists
 * them: what the page starts and the live feed is joined for, so the list a test reads is the shell's own.
 */
export function registeredOverrides(root = ROOT) {
  // The list holds names and comments alone, so the comments are cut by hand: the file is a component, and its markup's apostrophes
  // would lose the comment-stripper's place.
  const list = legacyApp(root).match(/\bconst SURFACES = \[([\s\S]*?)\n\];/);
  const names = list ? list[1].replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "") : "";
  return [...names.matchAll(/\b(\w+Override)\b/g)].map((m) => m[1]);
}

/**
 * The surfaces the shell registers, each with the module its override comes from, as `LegacyApp.tsx` imports it:
 * `[{ name: "peopleOverride", file: "apps/dashboard/src/surfaces/people/surface.ts" }]`, in the list's order. A test imports
 * each file and takes the name, so the surfaces it holds are the shell's own and no test keeps a copy of the list. A name the
 * shell lists and imports from nowhere it can find is `file: null`, which a test fails.
 */
export function registeredSurfaces(root = ROOT) {
  const app = legacyApp(root);
  const from = new Map();
  for (const m of app.matchAll(/^import\s+(?:type\s+)?([^;]*?)\s+from\s+["']([^"']+)["'];?$/gm))
    for (const name of m[1].matchAll(/\b(\w+Override)\b/g)) from.set(name[1], m[2]);
  return registeredOverrides(root).map((name) => ({ name, file: moduleOf(root, from.get(name)) }));
}

/** The file an import of the shell names (`@/surfaces/x`, `./surfaces/x`), from the root; null where none is found. */
function moduleOf(root, spec) {
  if (!spec) return null;
  const base = spec.startsWith("@/")
    ? path.join("apps/dashboard/src", spec.slice(2))
    : spec.startsWith(".")
      ? path.join(path.dirname(LEGACY_APP), spec)
      : null;
  if (!base) return null;
  for (const ext of [".ts", ".tsx", "/index.ts"]) {
    const file = `${base}${ext}`;
    if (fs.existsSync(path.join(root, file))) return file.split(path.sep).join("/");
  }
  return null;
}

function trace(repo) {
  const P = (...x) => path.join(repo, ...x);
  const rel = (f) => path.relative(repo, f).split(path.sep).join("/");
  const text = (f) => fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");

  // ---------------------------------------------------------------- SQL ----------------------------------------------
  const schema = text(P("supabase/schema.sql"));
  const TABLES = new Set([...schema.matchAll(/^CREATE TABLE (?:public\.)?(\w+)/gm)].map((m) => m[1]));
  const VIEWS = new Map();
  for (const m of schema.matchAll(/^CREATE VIEW public\.(\w+)[\s\S]*?;\n/gm)) VIEWS.set(m[1], m[0]);
  const viewTables = (v) =>
    [...(VIEWS.get(v) ?? "").matchAll(/\b(?:from|join)\s+(?:public\.)?(\w+)/gi)]
      .map((x) => x[1])
      .filter((t) => TABLES.has(t));
  const FN = new Map(); // name -> { reads, writes (a Map), calls }
  {
    const re = /^CREATE (?:OR REPLACE )?FUNCTION public\.(\w+)\(/gm;
    let m;
    while ((m = re.exec(schema))) {
      const name = m[1];
      const after = schema.slice(m.index, m.index + 400000);
      const tag = after.match(/\bAS (\$[A-Za-z_]*\$)/);
      if (!tag) continue;
      const start = after.indexOf(tag[0]) + tag[0].length;
      const end = after.indexOf(tag[1], start);
      const body = after.slice(start, end).replace(/--[^\n]*/g, " ");
      const f = FN.get(name) ?? { reads: new Set(), writes: new Map(), calls: new Set() };
      for (const x of body.matchAll(
        /\b(insert\s+into|update|delete\s+from|merge\s+into)\s+(?:only\s+)?(?:public\.)?"?(\w+)"?/gi,
      )) {
        if (TABLES.has(x[2])) noteWrite(f.writes, x[2], ...verbsOf(x[1], statementFrom(body, x.index)));
        // A write through a view of one table (00439's old names) lands on that table.
        else if (VIEWS.has(x[2]) && viewTables(x[2]).length === 1)
          noteWrite(f.writes, viewTables(x[2])[0], ...verbsOf(x[1], statementFrom(body, x.index)));
      }
      for (const x of body.matchAll(/\b(?:from|join)\s+(?:only\s+)?(?:public\.)?"?(\w+)"?/gi)) {
        if (TABLES.has(x[1])) f.reads.add(x[1]);
        else if (VIEWS.has(x[1])) for (const t of viewTables(x[1])) f.reads.add(t);
      }
      for (const x of body.matchAll(/\b(?:public\.)?(\w+)\s*\(/g)) if (x[1] !== name) f.calls.add(x[1]);
      FN.set(name, f);
    }
    for (const f of FN.values()) f.calls = new Set([...f.calls].filter((c) => FN.has(c)));
  }
  // triggers: a write to the table runs these functions, for the events they are made for
  const TRIG = new Map(); // table -> [{ fn, verbs }]
  for (const m of schema.matchAll(
    /^CREATE TRIGGER (\w+) (?:BEFORE|AFTER|INSTEAD OF) ([^\n]*?) ON public\.(\w+) [^\n]*?EXECUTE FUNCTION (?:public\.)?(\w+)\(/gm,
  )) {
    // erasure, merge and doubt triggers fire only on those rare column changes: following them makes every contact write look like an erasure
    if (/erase|merge|doubt|blank|purge/.test(`${m[1]} ${m[4]}`)) continue;
    // the ledger's triggers each fire for one kind of event (WHEN new.kind = ...): followed for every event, every write would write everything
    if (m[3] === "events" || m[3] === "event_outbox") continue;
    if (!FN.has(m[4])) continue;
    const verbs = new Set([...m[2].matchAll(/\b(INSERT|UPDATE|DELETE)\b/g)].map((x) => x[1]));
    (TRIG.get(m[3]) ?? TRIG.set(m[3], []).get(m[3])).push({ fn: m[4], verbs });
  }
  const fnMemo = new Map();
  function fnClosure(name, seen = new Set()) {
    if (fnMemo.has(name)) return fnMemo.get(name);
    const out = { reads: new Set(), writes: new Map() };
    const f = FN.get(name);
    if (!f || seen.has(name)) return out;
    seen.add(name);
    f.reads.forEach((t) => out.reads.add(t));
    mergeWrites(out.writes, f.writes);
    for (const c of f.calls) {
      const s = fnClosure(c, seen);
      s.reads.forEach((t) => out.reads.add(t));
      mergeWrites(out.writes, s.writes);
    }
    if (seen.size === 1) fnMemo.set(name, out);
    return out;
  }
  // a write to t also writes what its triggers write when the write is an event they are made for (followed to a fixed point)
  function withTriggers(writes) {
    const all = new Map();
    mergeWrites(all, writes);
    for (let grew = true; grew;) {
      grew = false;
      for (const [t, made] of [...all])
        for (const { fn, verbs } of TRIG.get(t) ?? []) {
          if (![...made].some((v) => verbs.has(v))) continue;
          for (const [w, more] of fnClosure(fn).writes) {
            const had = all.get(w)?.size ?? -1;
            noteWrite(all, w, ...more);
            if (all.get(w).size !== had) grew = true;
          }
        }
    }
    return all;
  }

  // ---------------------------------------------------------------- TS ----------------------------------------------
  const files = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec|type-test)\.|\.d\.ts$/.test(e.name)) files.push(p);
    }
  };
  for (const s of SCOPES) walk(P(s));

  function resolveSpec(from, spec) {
    let base = null;
    const shim = spec.match(/(?:\.\.\/)+packages\/(db|core|jobs|channels|contracts)\.js$/);
    if (shim && rel(from).startsWith("apps/edge/")) return shim[1] === "contracts" ? null : P(PKG_ENTRY[shim[1]]);
    const pk = spec.match(/^@chanlytics\/(db|core|jobs|channels)(\/.*)?$/);
    if (pk) {
      if (!pk[2]) return P(PKG_ENTRY[pk[1]]);
      base = P(`packages/${pk[1]}/src${pk[2]}`);
    } else if (spec.startsWith("@/")) base = P("apps/dashboard/src", spec.slice(2));
    else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
    if (!base) return null;
    for (const x of EXTS) {
      const c = base.replace(/\.js$/, "") + x;
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    }
    return null;
  }

  const MOD = new Map(); // file -> { imports, ns, segs, reexp, star, top }
  function parse(file) {
    if (MOD.has(file)) return MOD.get(file);
    const src = fs.existsSync(file) ? text(file) : "";
    const mod = { imports: new Map(), ns: new Map(), segs: new Map(), reexp: new Map(), star: [], top: null };
    MOD.set(file, mod);
    for (const m of src.matchAll(/import\s+(?:type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g)) {
      if (/^type\s/.test(m[0].slice(6).trim())) continue;
      const target = resolveSpec(file, m[2]);
      if (!target) continue;
      const clause = m[1];
      const ns = clause.match(/\*\s+as\s+(\w+)/);
      if (ns) mod.ns.set(ns[1], target);
      const named = clause.match(/\{([\s\S]*)\}/);
      if (named)
        for (const part of named[1].split(",")) {
          const p = part.trim().replace(/^type\s+/, "");
          if (!p) continue;
          const [orig, local] = p.split(/\s+as\s+/);
          mod.imports.set((local ?? orig).trim(), { file: target, name: orig.trim() });
        }
    }
    for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
      const target = resolveSpec(file, m[2]);
      if (!target) continue;
      for (const part of m[1].split(",")) {
        const p = part.trim().replace(/^type\s+/, "");
        if (!p) continue;
        const [orig, local] = p.split(/\s+as\s+/);
        mod.reexp.set((local ?? orig).trim(), { file: target, name: orig.trim() });
      }
    }
    for (const m of src.matchAll(/export\s+\*\s+from\s+["']([^"']+)["']/g)) {
      const t = resolveSpec(file, m[1]);
      if (t) mod.star.push(t);
    }
    // top-level segments: a function, a constant or a class that starts at the margin, up to the next one
    const lines = src.split("\n");
    const starts = [];
    lines.forEach((ln, i) => {
      const d = ln.match(
        /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*(\w+)|^(?:export\s+)?(?:const|let|var)\s+(\w+)|^(?:export\s+)?class\s+(\w+)/,
      );
      if (d) starts.push({ i, name: d[1] ?? d[2] ?? d[3] });
      else if (/^(?:export\s+)?(?:type|interface)\s/.test(ln) || /^\/\*\*/.test(ln)) starts.push({ i, name: null });
    });
    starts.push({ i: lines.length, name: null });
    for (let k = 0; k < starts.length - 1; k++) {
      if (!starts[k].name) continue;
      mod.segs.set(starts[k].name, segOf(lines.slice(starts[k].i, starts[k + 1].i).join("\n")));
    }
    mod.top = segOf(src); // the whole file, for an entry point
    return mod;
  }

  function segOf(body) {
    const s = { reads: new Set(), writes: new Map(), rpcs: new Set(), calls: new Set(), nsCalls: [], doors: new Set() };
    const b = body.replace(/\/\/[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
    for (const m of b.matchAll(/\.from\(\s*["'`](\w+)["'`]\s*\)/g)) {
      const tail = b.slice(m.index + m[0].length, m.index + m[0].length + 260);
      const next = tail.search(/\.from\(/);
      const chain = next >= 0 ? tail.slice(0, next) : tail;
      const verbs = [];
      if (/\.insert\(/.test(chain)) verbs.push("INSERT");
      if (/\.upsert\(/.test(chain)) verbs.push("INSERT", "UPDATE");
      if (/\.update\(/.test(chain)) verbs.push("UPDATE");
      if (/\.delete\(/.test(chain)) verbs.push("DELETE");
      if (verbs.length) noteWrite(s.writes, m[1], ...verbs);
      else s.reads.add(m[1]);
    }
    // PostgREST embeds: `.select("id, contact:contacts(display_name), messages!inner(body)")` reads those tables too
    // (any select-list-shaped string: a `CONVERSATION_COLUMNS` constant handed to `.select` is read where it is passed)
    for (const m of b.matchAll(/(["'`])((?:(?!\1)[\s\S]){0,4000}?)\1/g))
      if (/[,*]/.test(m[2]) && /\w\s*(?:!\w+)?\s*\(/.test(m[2]))
        for (const e of m[2].matchAll(/(?:\w+\s*:\s*)?(\w+)\s*(?:!\w+)?\s*\(/g))
          if (TABLES.has(e[1])) s.reads.add(e[1]);
    for (const m of b.matchAll(/\brpc\(\s*["'`](\w+)["'`]/g)) s.rpcs.add(m[1]);
    // a function named in a string where the segment calls rpc at all (`rpc(FN, …)`, a table of names)
    if (/\brpc\b/.test(b)) for (const m of b.matchAll(/["'`](\w+)["'`]/g)) if (FN.has(m[1])) s.rpcs.add(m[1]);
    for (const m of b.matchAll(/\b(insert\s+into|update|delete\s+from)\s+public\.(\w+)/gi))
      if (TABLES.has(m[2])) noteWrite(s.writes, m[2], ...verbsOf(m[1], statementFrom(b, m.index)));
    for (const m of b.matchAll(/\b(?:from|join)\s+public\.(\w+)/gi)) if (TABLES.has(m[1])) s.reads.add(m[1]);
    for (const m of b.matchAll(/\bpublic\.(\w+)\s*\(/g)) if (FN.has(m[1])) s.rpcs.add(m[1]);
    // an edge door, as the dashboard names it: "/api/admin/steer"
    for (const m of b.matchAll(/["'`](\/api\/[a-z][\w/-]*)["'`]/g)) s.doors.add(m[1]);
    for (const m of b.matchAll(/\b([A-Za-z_]\w*)\s*(?:<[^()]*>)?\s*\(/g)) s.calls.add(m[1]);
    // a namespace's member, called or passed (`facts.policies` handed to load): followed when the left side is an `import * as`
    for (const m of b.matchAll(/\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)\b/g)) s.nsCalls.push([m[1], m[2]]);
    // a function passed by name: `route(policy, handler)`, `.map(toVM)`
    for (const m of b.matchAll(/(?<=[(,[:]\s*)([A-Za-z_]\w*)(?=\s*[,)\]}])/g)) s.calls.add(m[1]);
    return s;
  }

  function lookup(file, name, seen = new Set()) {
    const key = `${file}#${name}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const mod = parse(file);
    if (mod.segs.has(name)) return { file, name };
    if (mod.reexp.has(name)) {
      const r = mod.reexp.get(name);
      return lookup(r.file, r.name, seen);
    }
    if (mod.imports.has(name)) {
      const r = mod.imports.get(name);
      return lookup(r.file, r.name, seen);
    }
    for (const s of mod.star) {
      const r = lookup(s, name, seen);
      if (r) return r;
    }
    return null;
  }

  /** The edge file that serves a door: `/api/admin/steer` is `apps/edge/api/admin/steer.ts`. */
  function doorFile(door) {
    const base = P("apps/edge", door.slice(1));
    return [`${base}.ts`, `${base}/index.ts`].find((c) => fs.existsSync(c)) ?? null;
  }

  function closureOf(entryFile, entrySeg, { doors = true } = {}) {
    const acc = { reads: new Set(), writes: new Map(), rpcs: new Set(), doors: new Set(), segs: new Set() };
    // where each table was first met, for the sentence that says why a route reads it
    const via = { reads: {}, writes: {} };
    const stack = [{ file: entryFile, seg: entrySeg, id: `${rel(entryFile)}#entry` }];
    const seen = new Set();
    const enter = (file, name, seg) => {
      const k = `${file}#${name}`;
      if (seen.has(k)) return;
      seen.add(k);
      const id = `${rel(file)}#${name}`;
      acc.segs.add(id);
      stack.push({ file, seg, id });
    };
    const follow = (target) => {
      if (target && !WRAPPER.has(rel(target.file)))
        enter(target.file, target.name, parse(target.file).segs.get(target.name));
    };
    const rpcVia = {};
    while (stack.length) {
      const { file, seg, id } = stack.pop();
      const mod = parse(file);
      for (const t of seg.reads) {
        acc.reads.add(t);
        via.reads[t] ??= id;
      }
      for (const t of seg.writes.keys()) via.writes[t] ??= id;
      mergeWrites(acc.writes, seg.writes);
      for (const r of seg.rpcs) {
        acc.rpcs.add(r);
        rpcVia[r] ??= id;
      }
      for (const c of seg.calls) follow(mod.segs.has(c) ? { file, name: c } : lookup(file, c));
      for (const [ns, fn] of seg.nsCalls) if (mod.ns.has(ns)) follow(lookup(mod.ns.get(ns), fn));
      // the edge, asked to do what the member cannot: the door's whole file is what it may do
      for (const door of seg.doors) {
        const f = doors ? doorFile(door) : null;
        if (!f) continue;
        acc.doors.add(door);
        enter(f, "*", parse(f).top);
      }
    }
    const sqlReads = new Set(acc.reads);
    const sqlWrites = new Map();
    mergeWrites(sqlWrites, acc.writes);
    for (const r of acc.rpcs) {
      const c = fnClosure(r);
      for (const t of c.reads) {
        sqlReads.add(t);
        via.reads[t] ??= `${rpcVia[r]} -> ${r}()`;
      }
      for (const t of c.writes.keys()) via.writes[t] ??= `${rpcVia[r]} -> ${r}()`;
      mergeWrites(sqlWrites, c.writes);
    }
    const known = new Map([...sqlWrites].filter(([t]) => TABLES.has(t)));
    const writes = withTriggers(known);
    for (const t of writes.keys()) via.writes[t] ??= "a trigger";
    return {
      reads: [...sqlReads].filter((t) => TABLES.has(t)).sort(),
      writes: [...writes.keys()].sort(),
      verbs: verbsObject(writes),
      rpcs: [...acc.rpcs].sort(),
      doors: [...acc.doors].sort(),
      via,
      reach: acc.segs.size,
    };
  }

  // -------------------------------------------------------- the dashboard's routes --------------------------------------
  const routes = {};
  const API = P("apps/dashboard/app/api/v1");
  for (const f of files.filter((x) => x.startsWith(API) && /route\.ts$/.test(x))) {
    const routePath = rel(f)
      .replace("apps/dashboard/app/api/v1/", "")
      .replace(/\/route\.ts$/, "");
    const src = text(f);
    const mod = parse(f);
    for (const method of METHODS) {
      if (!new RegExp(`export\\s+(?:const|async function|function)\\s+${method}\\b`).test(src)) continue;
      const seg = mod.segs.get(method);
      if (!seg) continue;
      // the dashboard's own code first, then with the edge doors it calls: what the doors add is theirs
      const own = closureOf(f, seg, { doors: false });
      const all = closureOf(f, seg);
      routes[`${method} ${routePath}`] = {
        ...own,
        doors: all.doors,
        doorReads: all.reads.filter((t) => !own.reads.includes(t)),
        doorWrites: all.writes.filter((t) => !own.writes.includes(t)),
        allVerbs: all.verbs,
        doorVia: all.via,
      };
    }
  }
  return { tables: TABLES, routes };
}
