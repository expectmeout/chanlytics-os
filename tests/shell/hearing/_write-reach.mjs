/**
 * What a write's own notice would read (decision 0058; the wiring's second audit, lane R7): the derivation that
 * a-write-is-its-own-notice.test.mjs holds the refresh map's rows to, and that the shadow script runs over production's sampled
 * lines (tooling/scripts/ops/write-shadow.mjs), so the two say one thing.
 *
 * A write's changes are tables and the events it makes of each. What its notice reads with an address on screen is, for each change,
 * the surfaces the runner's own router reads for it (wantsRefresh, as the feed's notice of it is judged), and the surfaces that read a
 * table it changes that no notice tells them of (a table they read and do not hear, or an event the feed does not carry), where the
 * page draws them (drawsTheScreen). The surfaces are the ones the shell registers, run as they are, in a window stood in for.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import { importSrc } from "../../_source.mjs";
import { PLUMBING, getsOfFile, readsOf, registeredSurfaces, traceRoutes, unheardReads } from "./_reads.mjs";

/** The window a surface's rules read, stood in for where nothing has set one: an address, a document, a workspace. */
export function standInWindow() {
  globalThis.window ??= globalThis;
  globalThis.location ??= { pathname: "/w/studio", hash: "#/today" };
  globalThis.location.pathname = "/w/studio";
  globalThis.document ??= { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
  globalThis.window.dispatchEvent ??= () => true;
  globalThis.window.addEventListener ??= () => {};
  globalThis.window.removeEventListener ??= () => {};
  globalThis.CustomEvent ??= class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
  globalThis.__WORKSPACES ??= [{ id: "t1", slug: "studio", name: "A", status: "active", timezone: "America/New_York" }];
  globalThis.__ACTIVE_WORKSPACE ??= "t1";
}

/** A person's id as a real one is written (the registry takes a person's page for a uuid alone). */
export const PERSON = "0b9c4f6e-1d2a-4c3b-9e8f-7a6b5c4d3e2f";

/** Put an address on screen. */
export const at = (route) => {
  globalThis.location.hash = `#/${route}`;
};

/**
 * The derivation over the repository as it is: the surfaces, the families of addresses and where each is asked (as
 * page-hears.test.mjs asks them), what each write changes by the trace, and what its notice would read on an address.
 */
export async function writeReach() {
  standInWindow();
  const { liveTablesOf } = await importSrc("packages/contracts/src/activity/record-kinds.ts");
  const { watchedEvents, narrowedUpdates } = await importSrc("packages/db/src/realtime.ts");
  const { wantsRefresh } = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");
  const { AFTER } = await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts");
  const registry = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
  const { PAGE_HEARS, PERSON_ROUTE, drawsTheScreen, routeFamilyOf } = registry;

  const { routes } = traceRoutes();
  const told = Object.fromEntries(watchedEvents().map((w) => [w.table, w.events]));
  const narrowed = narrowedUpdates();

  const surfaces = [];
  for (const { name, file } of registeredSurfaces()) {
    const override = (await importSrc(file))[name];
    const s = {
      key: override.key,
      override,
      reads: override.reads,
      fresh: override.fresh,
      omit: override.omit,
      refreshOnTables: override.refreshOnTables,
      gets: getsOfFile(file),
    };
    surfaces.push({ ...s, tables: readsOf(s.gets, routes), unheard: unheardReads(s, routes, liveTablesOf) });
  }

  const ASKED_AT = { [PERSON_ROUTE]: `clients/${PERSON}`, admin: "admin/unlisted" };
  /** The address a family is asked at, where its own name is not one of it: a person, and a pane Settings does not list. */
  const askedAt = (family) => ASKED_AT[family] ?? family;
  const families = Object.keys(PAGE_HEARS).sort();

  /**
   * What a write changes by the trace: its own code's writes, by table and the events each makes, less the machinery's and the
   * updates `stamps` names (`write -> table`: a narrowed table's update that moves no column the feed is told for).
   */
  const changesOf = (write, stamps = {}) => {
    const out = {};
    for (const [table, verbs] of Object.entries(routes[write]?.verbs ?? {})) {
      if (PLUMBING.has(table)) continue;
      const events = verbs.filter((v) => !(v === "UPDATE" && `${write} -> ${table}` in stamps));
      if (events.length) out[table] = events;
    }
    return out;
  };

  /** What a write's edge doors may change beside its own code: the most a door may do. */
  const doorTablesOf = (write) => {
    const own = new Set(Object.keys(routes[write]?.verbs ?? {}));
    return new Set((routes[write]?.doorWrites ?? []).filter((t) => !PLUMBING.has(t) && !own.has(t)));
  };

  /** The surfaces these changes (`{ table: events }`) would read with `route` on screen, by their own notice. */
  const derivedOn = (changes, route) => {
    const keys = new Set();
    at(route);
    for (const s of surfaces)
      for (const [table, events] of Object.entries(changes))
        for (const event of events) {
          const toldOf = (told[table] ?? []).includes(event);
          if (toldOf && wantsRefresh(s.override, table, { table, event, row: {} })) keys.add(s.key);
          else if (s.tables.has(table) && (!toldOf || s.unheard.has(table)) && drawsTheScreen(s.key, route))
            keys.add(s.key);
        }
    return keys;
  };

  /** The surfaces a write's row of the refresh map names with `route` on screen. */
  const handOn = (write, route) => {
    at(route);
    return new Set((AFTER[write]?.() ?? []).map((o) => o.key));
  };

  return {
    AFTER,
    PAGE_HEARS,
    routes,
    told,
    narrowed,
    surfaces,
    families,
    askedAt,
    routeFamilyOf,
    drawsTheScreen,
    changesOf,
    doorTablesOf,
    derivedOn,
    handOn,
  };
}
