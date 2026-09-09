/**
 * A Supabase client that answers from memory, so a route's control flow can be
 * run instead of read.
 *
 * Ninety-nine of the files in this directory assert on source text. That is
 * cheap and it pins intent, but it cannot see reachability, ordering, or what a
 * loop does on its second pass — and twice in one evening a release blocker in
 * the jobs sweep passed every such test and a full CI run before a single real
 * row in production found it. This is the missing half.
 *
 * It is a DOUBLE, not a database: no RLS, no types, no constraints, and the
 * comparisons are the handful the callers actually use. Its one real
 * responsibility is to make an unfaithful test fail loudly — any builder method
 * it does not model throws by name rather than returning undefined and letting
 * a chain quietly evaluate to nothing.
 */

/** Rows a filter selects. `eq` is strict, `lt` is whatever `<` does — ISO timestamps sort as text. */
function matches(row, filters) {
  return filters.every(([op, col, val]) =>
    op === "eq" ? row[col] === val
    : op === "lt" ? row[col] != null && row[col] < val
    : (() => { throw new Error(`fakeDb: no filter called ${op}()`); })());
}

/**
 * @param tables {Record<string, object[]>} mutated in place, so a test can read
 *   back what the code under test actually wrote.
 * @param faults {Record<string, {message: string}>} `"<table>.select"` or
 *   `"<table>.update"` to make that call fail the way PostgREST fails.
 */
export function fakeDb(tables, faults = {}) {
  const seen = [];

  const from = (table) => {
    const q = { table, op: "select", values: null, filters: [], columns: null, limit: null, order: null };
    const rows = () => (tables[table] ??= []);

    const run = () => {
      seen.push({ ...q, filters: [...q.filters] });
      const fault = faults[`${table}.${q.op}`];
      if (fault) return { data: null, error: fault };

      if (q.op === "select") {
        let out = rows().filter((r) => matches(r, q.filters));
        if (q.order) out = [...out].sort((a, b) => (a[q.order] < b[q.order] ? -1 : a[q.order] > b[q.order] ? 1 : 0));
        if (q.limit != null) out = out.slice(0, q.limit);
        // Deliberately a copy: the sweep must not be able to mutate the ledger
        // by holding on to a row it read.
        return { data: out.map((r) => ({ ...r })), error: null };
      }

      // The update is the interesting one. It applies to whatever matches the
      // filters AT THE MOMENT IT RUNS, which is what makes a compare-and-swap
      // testable: a second caller whose filters name a value the first one has
      // already replaced matches nothing and comes back empty.
      const hit = rows().filter((r) => matches(r, q.filters));
      for (const r of hit) Object.assign(r, q.values);
      return { data: hit.map((r) => ({ id: r.id })), error: null };
    };

    const builder = {
      select(columns) { q.columns = columns; return proxy; },
      update(values) { q.op = "update"; q.values = values; return proxy; },
      insert() { throw new Error("fakeDb: nothing under test inserts; model it before using it"); },
      eq(col, val) { q.filters.push(["eq", col, val]); return proxy; },
      lt(col, val) { q.filters.push(["lt", col, val]); return proxy; },
      order(col) { q.order = col; return proxy; },
      limit(n) { q.limit = n; return proxy; },
      then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
    };

    const proxy = new Proxy(builder, {
      get(target, key) {
        if (key in target || typeof key === "symbol") return target[key];
        throw new Error(`fakeDb: the code under test called .${String(key)}() on ${table}, which this double does not model`);
      },
    });
    return proxy;
  };

  return {
    from,
    rpc(name) { throw new Error(`fakeDb: rpc(${name}) belongs to the caller, not the code under test`); },
    /** Every query that reached the double, in order. */
    seen,
  };
}

/** A Logger that keeps its lines instead of printing them. */
export function fakeLog() {
  const lines = [];
  const L = {
    info: (event, fields) => lines.push({ level: "info", event, ...fields }),
    warn: (event, fields) => lines.push({ level: "warn", event, ...fields }),
    error: (event, fields) => lines.push({ level: "error", event, ...fields }),
    child: () => L,
    lines,
    events: () => lines.map((l) => l.event),
  };
  return L;
}
