/**
 * The hearing tests' helpers over the tracer (tooling/scripts/trace-routes.mjs: which tables each route of the dashboard reads
 * and writes, and the surfaces the shell registers): the routes a surface's source names, the tables a surface draws and the
 * ones it reads, and what a write leaves a surface without. The tracer's own names are handed on, so a test imports one module.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, stripComments } from "../../_source.mjs";
import { PLUMBING } from "../../../trace-routes.mjs";

export { PLUMBING, registeredOverrides, registeredSurfaces, traceRoutes } from "../../../trace-routes.mjs";

/** The route keys a source text names, as the typed client does: `read("GET contacts", …)`, `"GET leads/[id]"`. */
export function getsIn(source) {
  return [...new Set([...source.matchAll(/["'`](GET [a-z][\w/[\]-]*)["'`]/g)].map((m) => m[1]))].sort();
}

/** The reads a file of the repository makes, by their route keys; its comments, which name routes to explain them, are left out. */
export function getsOfFile(file, root = ROOT) {
  return getsIn(stripComments(fs.readFileSync(path.join(root, file), "utf8")));
}

/** The tables a surface's override says it leaves unheard on purpose (`omit`). */
const omittedBy = (surface) => new Set((surface.omit ?? []).flatMap((group) => group.tables));

/**
 * The tables a surface draws that a change must tell it of: the tables of the kinds it declares (`liveTablesOf`, contracts), less the
 * ones it says it need not be told of (`omit`, each with its reason) and the machinery's (`PLUMBING`).
 */
export function drawnTables(surface, liveTablesOf) {
  const left = omittedBy(surface);
  return liveTablesOf(surface.reads).filter((t) => !left.has(t) && !PLUMBING.has(t));
}

/**
 * The tables a surface's own reads touch, with where each was first met: the tables of its GET routes (`gets`), less the machinery's.
 * `doors` adds what the edge doors those routes call read (a door serves every action of its feature, so that is the most).
 */
export function readsOf(gets, routes, { doors = false } = {}) {
  const reads = new Map();
  for (const key of gets) {
    const route = routes[key];
    if (!route) continue;
    for (const t of route.reads) if (!PLUMBING.has(t) && !reads.has(t)) reads.set(t, `${key} <- ${route.via.reads[t]}`);
    if (doors)
      for (const t of route.doorReads)
        if (!PLUMBING.has(t) && !reads.has(t)) reads.set(t, `${key} <- ${route.doorVia.reads[t]}`);
  }
  return reads;
}

/**
 * The tables a surface hears: the tables of the kinds it declares, less the ones it omits, and none where the feed tells it nothing
 * (`{ aged }`, `"own-change"`), as `declareReads` derives them (surface-realtime.ts heardTables).
 */
export function heardBy(surface, liveTablesOf) {
  // A registered override carries what declareReads derived, its `extra` with it: that is what it hears.
  if (surface.refreshOnTables) return new Set(surface.refreshOnTables);
  if (surface.fresh && surface.fresh !== "live" && surface.fresh !== "its-page") return new Set();
  const left = omittedBy(surface);
  return new Set(liveTablesOf(surface.reads).filter((t) => !left.has(t)));
}

/**
 * The tables a surface reads and does not hear. Only a table it hears is covered (the wiring audit's S3-8): one it omits, and reads
 * all the same, is a read nobody tells it of, and goes in the baseline with what kind of exception it is and why. An omit says a
 * table of a kind it draws is not one it draws; its own routes reading it say otherwise, and the baseline is where that is argued.
 */
export function unheardReads(surface, routes, liveTablesOf) {
  const covered = heardBy(surface, liveTablesOf);
  const unheard = new Map();
  for (const [t, via] of readsOf(surface.gets, routes)) if (!covered.has(t)) unheard.set(t, via);
  return unheard;
}

/**
 * What a write changes of what a surface draws and the live feed would not tell it of: each table the surface draws that the write
 * makes an event on (`verbs`, a table's INSERT, UPDATE or DELETE), when the surface does not hear that table or the feed is not told
 * that event of it (`told`, a table's events from the feed's own list). Empty where a surface hears everything the write changes.
 */
export function untoldWrites(surface, verbs, told, liveTablesOf) {
  const heard = new Set(surface.refreshOnTables ?? []);
  const gaps = [];
  for (const t of drawnTables(surface, liveTablesOf))
    for (const v of verbs[t] ?? []) if (!(heard.has(t) && told[t]?.includes(v))) gaps.push(`${t}:${v}`);
  return gaps;
}
