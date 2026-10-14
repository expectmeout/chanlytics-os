/**
 * A write's shadow (decision 0058; the wiring's second audit, lane R7, stage B): production's sampled requests, held to the trace
 * and set beside the refresh map.
 *
 * One request in twenty says, in its `route_answered` line, the tables its database calls touched and how, the SQL functions it
 * called, its method and the page of the app it was asked from (apps/dashboard/src/server/server-timing.ts touchedLine). This reads
 * a file of such lines (the logger's JSON, one a line, or a log export that carries each in `message`) and says two things:
 *
 *  1. What the trace missed: for each route, a table a request touched that the route's trace (tooling/scripts/trace-routes.mjs)
 *     neither reads nor writes, and a table written that it does not write. The trace is wrong low (it says so), and these are where.
 *     The wrapper's seat and workspace reads ride every request and are said apart.
 *  2. What a write's own notice would have read against what its row read: for each sampled write with a row in the refresh map, on
 *     the page it was asked from, the surfaces its changes (the trace's, with what the request was seen to write) would read by their
 *     notice and the row did not (`would, not did`), and the ones the row read that no change of it reaches (`did, not would`), each
 *     counted (tests/shell/hearing/_write-reach.mjs, the derivation stage A's golden holds).
 *
 * A week of these is what stage C replaces rows by, cluster by cluster. Read-only, and it reads no database: only the file it is given.
 *
 *   node tooling/scripts/ops/write-shadow.mjs <lines.jsonl> [--json]
 *
 * It loads the dashboard's own modules the way the tests do (tsx and the tests' stand-ins), starting itself again with them when it
 * was not. Exits 1 when the file holds no sampled line, 2 when it cannot be read.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SELF = fileURLToPath(import.meta.url);
/** The tests' own stand-ins for the network, Base UI and stylesheets (tooling/scripts/checks/test.mjs), which the shell's modules import. */
const STAND_INS = [
  "tooling/scripts/tests/calendar/_stand-in-network.mjs",
  "tooling/scripts/tests/shared/_stand-in-base-ui.mjs",
  "tooling/scripts/tests/shared/_stand-in-css.mjs",
];
const LOADED = "CHANLY_WRITE_SHADOW_LOADED";

/** The tables the wrapper reads for every request (the caller's seat, the workspace's standing): said apart, never as a miss. */
const WRAPPER_TABLES = new Set(["memberships", "tenants", "billing_accounts", "profiles"]);

/** A logged line as an object: the logger's own, or a log export's that carries it in `message`. */
export function lineOf(text) {
  let row;
  try {
    row = JSON.parse(text);
  } catch {
    return null;
  }
  if (row && typeof row === "object" && typeof row.event === "string") return row;
  if (row && typeof row.message === "string") return lineOf(row.message);
  return null;
}

/** A sampled line's tables (`contacts:INSERT+read rpc:merge:call`), as each table with the ways it was touched. */
export function touchesOf(tables) {
  const out = new Map();
  for (const word of String(tables ?? "")
    .split(" ")
    .filter(Boolean)) {
    const cut = word.lastIndexOf(":");
    if (cut <= 0) continue;
    out.set(
      word.slice(0, cut),
      new Set(
        word
          .slice(cut + 1)
          .split("+")
          .filter(Boolean),
      ),
    );
  }
  return out;
}

/** The route key a request's method and path are (`PUT contacts/[id]/consent`), the most particular of the routes it matches. */
export function routeKeyOf(routes, method, pathname) {
  let best = null;
  let bestDynamic = Infinity;
  for (const [key, r] of Object.entries(routes)) {
    if (r.method !== method) continue;
    const words = r.path.split("/");
    const asked = String(pathname ?? "").split("/");
    if (words.length !== asked.length) continue;
    let dynamic = 0;
    const fits = words.every((w, i) => {
      if (/^\[[^\]]+\]$/.test(w)) {
        dynamic += 1;
        return asked[i] !== "";
      }
      return w === asked[i];
    });
    if (fits && dynamic < bestDynamic) {
      best = key;
      bestDynamic = dynamic;
    }
  }
  return best;
}

/** The address a sampled page is asked at: a person's id said as `:id` is a person's page. */
const routeOfPage = (page, person) => (page ?? "today").replace(/(^|\/):id\b/, `$1${person}`);

function bump(map, key, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

async function main(argv) {
  const file = argv.find((a) => !a.startsWith("--"));
  const asJson = argv.includes("--json");
  if (!file) {
    console.error("say which file: node tooling/scripts/ops/write-shadow.mjs <lines.jsonl> [--json]");
    return 2;
  }
  let text;
  try {
    text = fs.readFileSync(path.resolve(file), "utf8");
  } catch (e) {
    console.error(`could not read ${file}: ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }
  const sampled = text
    .split(/\r?\n/)
    .map(lineOf)
    .filter((l) => l && l.event === "route_answered" && typeof l.tables === "string" && typeof l.method === "string");
  if (!sampled.length) {
    console.error("no sampled route_answered line in the file (one request in twenty carries its tables)");
    return 1;
  }

  const { ROUTES } = await import(pathToFileURL(path.join(ROOT, "apps/dashboard/src/client/routes.generated.ts")).href);
  const { PLUMBING } = await import(pathToFileURL(path.join(ROOT, "tooling/scripts/trace-routes.mjs")).href);
  const { PERSON, writeReach } = await import(
    pathToFileURL(path.join(ROOT, "tooling/scripts/tests/shell/hearing/_write-reach.mjs")).href
  );
  const reach = await writeReach();

  /** Per route: how many samples, the tables the trace missed (read, written) and the wrapper's, counted. */
  const byRoute = new Map();
  /** Per write: how many samples, the surfaces its notice would read that its row did not, and the reverse, counted. */
  const byWrite = new Map();
  let unknown = 0;

  for (const line of sampled) {
    const key = routeKeyOf(ROUTES, line.method, line.route);
    if (!key) {
      unknown += 1;
      continue;
    }
    const trace = reach.routes[key];
    const touches = touchesOf(line.tables);
    const r = byRoute.get(key) ?? { samples: 0, missedReads: new Map(), missedWrites: new Map(), wrapper: new Map() };
    byRoute.set(key, r);
    r.samples += 1;
    const traced = new Set([...(trace?.reads ?? []), ...(trace?.writes ?? []), ...(trace?.doorReads ?? [])]);
    const tracedWrites = new Set([...(trace?.writes ?? []), ...(trace?.doorWrites ?? [])]);
    const tracedCalls = new Set((trace?.rpcs ?? []).map((name) => `rpc:${name}`));
    const written = {};
    for (const [table, hows] of touches) {
      if (PLUMBING.has(table)) continue;
      if (table.startsWith("rpc:")) {
        if (!tracedCalls.has(table)) bump(r.missedReads, table);
        continue;
      }
      if (WRAPPER_TABLES.has(table) && !traced.has(table)) {
        bump(r.wrapper, table);
        continue;
      }
      if (!traced.has(table)) bump(r.missedReads, table);
      const events = [...hows].filter((h) => h === "INSERT" || h === "UPDATE" || h === "DELETE");
      if (events.length) {
        written[table] = events;
        if (!tracedWrites.has(table)) bump(r.missedWrites, table);
      }
    }

    if (line.method === "GET" || !reach.AFTER[key]) continue;
    const changes = reach.changesOf(key);
    for (const [table, events] of Object.entries(written))
      changes[table] = [...new Set([...(changes[table] ?? []), ...events])];
    const route = routeOfPage(line.page, PERSON);
    const family = reach.routeFamilyOf(route);
    const did = reach.handOn(key, route);
    const would = reach.derivedOn(changes, route);
    const w = byWrite.get(key) ?? { samples: 0, pages: new Map(), wouldNotDid: new Map(), didNotWould: new Map() };
    byWrite.set(key, w);
    w.samples += 1;
    bump(w.pages, family);
    for (const s of would) if (!did.has(s)) bump(w.wouldNotDid, `${s} on ${family}`);
    for (const s of did) if (!would.has(s)) bump(w.didNotWould, `${s} on ${family}`);
  }

  const plain = (map) => Object.fromEntries([...map].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)));
  const report = {
    sampled: sampled.length,
    unknownRoutes: unknown,
    routes: Object.fromEntries(
      [...byRoute]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, r]) => [
          key,
          {
            samples: r.samples,
            missedReads: plain(r.missedReads),
            missedWrites: plain(r.missedWrites),
            wrapper: plain(r.wrapper),
          },
        ]),
    ),
    writes: Object.fromEntries(
      [...byWrite]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, w]) => [
          key,
          {
            samples: w.samples,
            pages: plain(w.pages),
            wouldNotDid: plain(w.wouldNotDid),
            didNotWould: plain(w.didNotWould),
          },
        ]),
    ),
  };
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }
  console.log(`${report.sampled} sampled requests${unknown ? `, ${unknown} of no route the dashboard has` : ""}.\n`);
  console.log("What the trace missed (tables a request touched that its route's trace does not name):");
  let missed = 0;
  for (const [key, r] of Object.entries(report.routes)) {
    const reads = Object.entries(r.missedReads);
    const writes = Object.entries(r.missedWrites);
    if (!reads.length && !writes.length) continue;
    missed += 1;
    console.log(`  ${key} (${r.samples})`);
    if (reads.length) console.log(`    touched: ${reads.map(([t, n]) => `${t} ×${n}`).join(", ")}`);
    if (writes.length) console.log(`    written: ${writes.map(([t, n]) => `${t} ×${n}`).join(", ")}`);
  }
  if (!missed) console.log("  nothing: every table touched is one the trace names.");
  console.log("\nWrites against their rows (on the page each was asked from):");
  for (const [key, w] of Object.entries(report.writes)) {
    const would = Object.entries(w.wouldNotDid);
    const did = Object.entries(w.didNotWould);
    const pages = Object.entries(w.pages)
      .map(([p, n]) => `${p} ×${n}`)
      .join(", ");
    console.log(`  ${key} (${w.samples}; ${pages})${!would.length && !did.length ? ": the same" : ""}`);
    if (would.length) console.log(`    would, not did: ${would.map(([s, n]) => `${s} ×${n}`).join(", ")}`);
    if (did.length) console.log(`    did, not would: ${did.map(([s, n]) => `${s} ×${n}`).join(", ")}`);
  }
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === SELF;
if (isMain) {
  if (process.env[LOADED] !== "1") {
    // The shell's modules are TypeScript with the app's own aliases and stylesheets: start again as the tests are started.
    const args = ["--conditions=react-server", "--import", "tsx"];
    for (const standIn of STAND_INS) args.push("--import", pathToFileURL(path.join(ROOT, standIn)).href);
    const run = spawnSync(process.execPath, [...args, SELF, ...process.argv.slice(2)], {
      cwd: ROOT,
      env: { ...process.env, [LOADED]: "1" },
      stdio: "inherit",
    });
    process.exit(run.status ?? 2);
  }
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(e instanceof Error ? e.stack : String(e));
      process.exit(2);
    },
  );
}
