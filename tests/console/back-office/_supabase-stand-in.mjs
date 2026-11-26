/**
 * @supabase/supabase-js as tooling/scripts/ops/delete-tenant.mjs meets it in a child process this suite starts
 * (_delete-tenant-world.mjs): `--import` this module and it stands in for the package by name, so the script runs as a
 * person runs it, argv, exit codes and all, over a database in memory (tests/_fake-db.mjs) and buckets as storage answers.
 *
 * The world comes in as a file (DELETE_TENANT_WORLD): its tables, the faults its reads answer, its buckets, and whether
 * the tenant's delete answers no row. What happened goes out as a file (DELETE_TENANT_SEEN) as the process exits, at
 * whatever exit: the tables as they were left, every write and storage call in the order it was made, and the calls
 * that left for a provider.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import fs from "node:fs";
import { register } from "node:module";
import { fakeDb } from "../../_fake-db.mjs";

// The package's name, resolved to this module, for every import after this one: in the script's process alone, never in
// the suite's own, which imports this module for its bucket.
if (process.env.DELETE_TENANT_WORLD)
  register(
    `data:text/javascript,${encodeURIComponent(`
    export async function resolve(specifier, context, next) {
      if (specifier === "@supabase/supabase-js") return { url: ${JSON.stringify(import.meta.url)}, shortCircuit: true };
      return next(specifier, context);
    }`)}`,
  );

/**
 * A bucket as storage answers it: list() names one folder's children a page at a time, sorted by name, a subfolder as
 * an entry with no id; a folder nothing was written to lists as empty; remove() answers with what it removed, and a
 * path already gone is simply not among them. `faults.list[dir]` refuses a folder's listing; `faults.remove(paths)`
 * refuses a batch.
 */
export function bucket(objects, faults = {}, log = null, name = "bucket") {
  const store = new Map(Object.entries(objects));
  const asked = { list: [], remove: [] };
  return {
    store,
    asked,
    list: async (dir, { limit = 100, offset = 0 } = {}) => {
      asked.list.push({ dir, limit, offset });
      if (faults.list?.[dir]) return { data: null, error: { message: faults.list[dir] } };
      const children = new Map();
      for (const [p, size] of store) {
        if (!p.startsWith(`${dir}/`)) continue;
        const [child, ...deeper] = p.slice(dir.length + 1).split("/");
        children.set(
          child,
          deeper.length ? { name: child, id: null, metadata: null } : { name: child, id: `o-${p}`, metadata: { size } },
        );
      }
      const page = [...children.values()].sort((a, b) => (a.name < b.name ? -1 : 1)).slice(offset, offset + limit);
      return { data: page, error: null };
    },
    remove: async (paths) => {
      asked.remove.push(paths);
      log?.push(`storage ${name} remove ${paths.length}`);
      if (faults.remove?.(paths)) return { data: null, error: { message: "storage said no" } };
      return { data: paths.filter((p) => store.delete(p)).map((n) => ({ name: n })), error: null };
    },
  };
}

/** The client the script makes: the world's database, its storage, and every write said in order. */
export function createClient() {
  const world = JSON.parse(fs.readFileSync(process.env.DELETE_TENANT_WORLD, "utf8"));
  const log = [];
  const db = fakeDb(world.tables, world.faults ?? {});
  const buckets = Object.fromEntries(
    Object.entries(world.buckets ?? {}).map(([name, objects]) => [
      name,
      bucket(objects, { list: world.bucketFaults?.[name] ?? {} }, log, name),
    ]),
  );
  // A call to a provider (the relay, Stream, Anthropic): said, and answered as one that took it.
  globalThis.fetch = async (url, init = {}) => {
    log.push(`fetch ${init.method ?? "GET"} ${new URL(String(url)).host}`);
    return new Response(null, { status: 204 });
  };
  process.on("exit", () => {
    const left = Object.fromEntries(Object.entries(buckets).map(([name, b]) => [name, [...b.store.keys()]]));
    fs.writeFileSync(process.env.DELETE_TENANT_SEEN, JSON.stringify({ tables: world.tables, log, buckets: left }));
  });
  const from = (table) => {
    const q = db.from(table);
    return new Proxy(q, {
      get(target, key) {
        if (key === "delete")
          return (...args) => {
            log.push(`${table} delete`);
            if (table === "tenants" && world.tenantDeleteAnswersNone)
              return { eq: () => ({ select: async () => ({ data: [], error: null }) }) };
            return target.delete(...args);
          };
        const v = Reflect.get(target, key);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
  };
  return {
    from,
    storage: {
      from: (name) => buckets[name] ?? bucket({}, {}, log, name),
    },
  };
}
