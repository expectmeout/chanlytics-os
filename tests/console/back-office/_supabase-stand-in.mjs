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
 * The database in memory already answers a read with at most 1,000 rows, as PostgREST does. What this adds, each asked
 * for by the world:
 *   - the workspace's delete takes its rows with it, as the cascade does, and sets the kept tables' key to null;
 *   - `timeoutPast`: a delete that would take more rows than this answers as a statement past its time, and takes none;
 *   - `ledger`: what happens to the workspace's jobs between two of the script's looks at them (a run ends, a job is
 *     handed out late);
 *   - `arrivals`: a row written to a table while the script is reading it, after its nth read of the table's rows,
 *     or after every one (`every`); `shortBy`: a table whose reads each answer that many rows fewer than there are,
 *     while its count counts them all;
 *   - `fetchFails` and `removeFails`: a provider's host, or a bucket, that refuses its first calls.
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

/** What Postgres answers a statement the service role's 30 seconds ended (00283). */
const PAST_ITS_TIME = { message: "canceling statement due to statement timeout", code: "57014" };

/** The tables whose rows outlive their workspace, their key set to null (the migrations' ON DELETE SET NULL). */
const SET_NULL = ["anthropic_profiles", "billing_events", "partner_earnings", "platform_acts", "privacy_requests"];

/** How many times the first `n` calls of a kind are refused: `fails(key)` answers whether this one is. */
function refusals(counts = {}) {
  const left = { ...counts };
  return (key) => (left[key] ?? 0) > 0 && left[key]-- > 0;
}

/** The workspace's delete as the cascade leaves the tables: its rows gone, the history aside, and the kept ones' key null. */
function cascade(tables, tenantId) {
  for (const [table, rows] of Object.entries(tables)) {
    if (table === "tenants" || table === "events") continue;
    if (SET_NULL.includes(table))
      for (const row of rows) row.tenant_id = row.tenant_id === tenantId ? null : row.tenant_id;
    else tables[table] = rows.filter((row) => row.tenant_id !== tenantId);
  }
}

/** A row of the jobs table as the world's ledger script moves it. */
function moveLedger(tables, step) {
  const jobs = (tables.jobs ??= []);
  if (step.add) jobs.push({ ...step.add });
  for (const [state, id] of [
    ["done", step.done],
    ["fired", step.fire],
    ["scheduled", step.back],
  ]) {
    const job = id ? jobs.find((j) => j.id === id) : null;
    if (job) job.state = state;
  }
}

/** The client the script makes: the world's database, its storage, and every write said in order. */
export function createClient() {
  const world = JSON.parse(fs.readFileSync(process.env.DELETE_TENANT_WORLD, "utf8"));
  const log = [];
  const fetched = [];
  const db = fakeDb(world.tables, world.faults ?? {});
  const removeRefused = refusals(world.removeFails);
  const fetchRefused = refusals(world.fetchFails);
  const buckets = Object.fromEntries(
    Object.entries(world.buckets ?? {}).map(([name, objects]) => [
      name,
      bucket(objects, { list: world.bucketFaults?.[name] ?? {}, remove: () => removeRefused(name) }, log, name),
    ]),
  );
  // A call to a provider (the relay, Stream, Anthropic): said, and answered as one that took it, unless the world has
  // its host refuse this one.
  globalThis.fetch = async (url, init = {}) => {
    const { host, pathname } = new URL(String(url));
    log.push(`fetch ${init.method ?? "GET"} ${host}`);
    fetched.push({ method: init.method ?? "GET", host, path: pathname });
    return new Response(null, { status: fetchRefused(host) ? 500 : 204 });
  };
  process.on("exit", () => {
    const left = Object.fromEntries(Object.entries(buckets).map(([name, b]) => [name, [...b.store.keys()]]));
    fs.writeFileSync(
      process.env.DELETE_TENANT_SEEN,
      JSON.stringify({ tables: world.tables, log, fetched, buckets: left }),
    );
  });

  /** How many rows a delete would take: what its filters match, and for the workspace's own, what its cascade reaches. */
  const reach = async (table, filters) => {
    if (table === "tenants") {
      const id = filters.find(([op, col]) => op === "eq" && col === "id")?.[2];
      return Object.entries(world.tables)
        .filter(([name]) => name !== "tenants" && name !== "events" && !SET_NULL.includes(name))
        .reduce((n, [, rows]) => n + rows.filter((row) => row.tenant_id === id).length, 1);
    }
    let probe = db.from(table).select("*", { count: "exact", head: true });
    for (const [op, col, val] of filters) probe = op === "or" ? probe.or(val) : probe[op](col, val);
    return (await probe).count ?? 0;
  };

  let looks = 0;
  const reads = {};
  /** What the world says of a read of a table's rows: a row that arrives after it, and rows it answers short of. */
  const told = (table, answer) => {
    reads[table] = (reads[table] ?? 0) + 1;
    for (const arrival of world.arrivals ?? []) {
      if (arrival.table !== table || !(arrival.every || arrival.read === reads[table])) continue;
      const row = arrival.every ? { ...arrival.row, id: `${arrival.row.id}-${reads[table]}` } : { ...arrival.row };
      (world.tables[table] ??= []).push(row);
    }
    const short = world.shortBy?.[table] ?? 0;
    return short ? { ...answer, data: answer.data.slice(0, Math.max(answer.data.length - short, 0)) } : answer;
  };
  const from = (table) => {
    const q = db.from(table);
    const filters = [];
    let deleting = false;
    let rowsAsked = false;
    /** A read of rows (not a count, not a write's answer), as the world tells it. */
    const read = async () => {
      const answer = await new Promise((resolve, reject) => q.then(resolve, reject));
      return rowsAsked && Array.isArray(answer.data) ? told(table, answer) : answer;
    };
    /** A delete, judged against the statement's time before it runs, and the cascade run after the workspace's. */
    const judged = async () => {
      if (world.timeoutPast != null && (await reach(table, filters)) > world.timeoutPast)
        return { data: null, error: PAST_ITS_TIME, count: null };
      const answer = await new Promise((resolve, reject) => q.then(resolve, reject));
      if (table === "tenants" && !answer.error)
        cascade(world.tables, filters.find(([op, col]) => op === "eq" && col === "id")?.[2]);
      return answer;
    };
    const proxy = new Proxy(q, {
      get(target, key) {
        // The script's look at the ledger, its jobs by state: what the world says happened since the look before.
        if (key === "in" && table === "jobs")
          return (col, values) => {
            if (col === "state") {
              looks += 1;
              for (const step of world.ledger ?? []) if (step.look === looks) moveLedger(world.tables, step);
            }
            target.in(col, values);
            return proxy;
          };
        if (key === "delete")
          return (...args) => {
            log.push(`${table} delete`);
            deleting = true;
            if (table === "tenants" && world.tenantDeleteAnswersNone)
              return { eq: () => ({ select: async () => ({ data: [], error: null }) }) };
            target.delete(...args);
            return proxy;
          };
        if (key === "then") return (...args) => (deleting ? judged() : read()).then(...args);
        const v = Reflect.get(target, key);
        if (typeof v !== "function") return v;
        return (...args) => {
          if (key === "update") log.push(`${table} update`);
          if (key === "select") rowsAsked = args[1]?.head !== true;
          if (key === "update" || key === "insert" || key === "upsert") rowsAsked = false;
          if (["eq", "gt", "gte", "lt", "lte", "or"].includes(key))
            filters.push(key === "or" ? ["or", null, args[0]] : [key, args[0], args[1]]);
          const out = v.apply(target, args);
          // A builder's own step answers the builder; one that asks for a row (maybeSingle) answers its promise.
          return out === q ? proxy : out;
        };
      },
    });
    return proxy;
  };
  return {
    from,
    rpc: (name, args) => {
      log.push(`rpc ${name}`);
      return db.rpc(name, args);
    },
    storage: {
      from: (name) => buckets[name] ?? bucket({}, {}, log, name),
    },
  };
}
