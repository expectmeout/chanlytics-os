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

/** Rows a filter selects. `eq` is strict, `is` is the NULL test, `lt` is whatever `<` does — ISO timestamps sort as text. */
function matches(row, filters) {
  return filters.every(([op, col, val]) =>
    op === "eq" ? row[col] === val
    : op === "lt" ? row[col] != null && row[col] < val
    // PostgREST's `.is(col, null)`: the only way to ask for NULL, and what
    // every "not erased", "not accepted", "not revoked" read in this codebase
    // is written with. `eq` would not do -- SQL NULL is not equal to anything.
    : op === "is" ? (val === null ? row[col] == null : row[col] === val)
    // PostgREST's `.or("a.is.null,a.lt.x")`: any ONE of the clauses. Modelled
    // because a rotating sweep's whole correctness is "never-done first, then
    // the oldest" -- and that is a filter, not a shape a source scan can see.
    : op === "or" ? val.split(",").some((clause) => {
        const [c, o, v] = clause.split(".");
        if (o === "is") return v === "null" ? row[c] == null : String(row[c]) === v;
        if (o === "lt") return row[c] != null && row[c] < v;
        if (o === "eq") return String(row[c]) === v;
        throw new Error(`fakeDb: or() clause ${clause} is not modelled`);
      })
    : (() => { throw new Error(`fakeDb: no filter called ${op}()`); })());
}

/**
 * @param tables {Record<string, object[]>} mutated in place, so a test can read
 *   back what the code under test actually wrote.
 * @param faults {Record<string, {message: string}>} `"<table>.select"` or
 *   `"<table>.update"` to make that call fail the way PostgREST fails.
 */
export function fakeDb(tables, faults = {}, rpcs = {}) {
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
        if (q.order) {
          // Sentinels of the SAME TYPE as the values, because the columns this
          // orders on hold ISO timestamps: comparing -Infinity against a string
          // coerces to NaN, every comparison is false, and nulls silently do
          // not sort at all -- which looks exactly like a rotation that works.
          const rank = (v) => (v == null ? (q.nullsFirst ? "" : "￿") : String(v));
          out = [...out].sort((a, b) => {
            const x = rank(a[q.order]), y = rank(b[q.order]);
            const d = x < y ? -1 : x > y ? 1 : 0;
            return q.desc ? -d : d;
          });
        }
        // `{ count: "exact" }` counts the MATCHES, before the limit -- which is
        // how a sweep knows what it could not reach this tick.
        const matched = out.length;
        if (q.limit != null) out = out.slice(0, q.limit);
        // Deliberately a copy: the sweep must not be able to mutate the ledger
        // by holding on to a row it read.
        return { data: out.map((r) => ({ ...r })), error: null, count: q.counted ? matched : null };
      }

      // The update is the interesting one. It applies to whatever matches the
      // filters AT THE MOMENT IT RUNS, which is what makes a compare-and-swap
      // testable: a second caller whose filters name a value the first one has
      // already replaced matches nothing and comes back empty.
      const hit = rows().filter((r) => matches(r, q.filters));
      for (const r of hit) Object.assign(r, q.values);
      // `.select("*")` after an update reads the row BACK, which is how a
      // caller that must act on what it just wrote avoids a second round trip;
      // anything narrower keeps answering with ids, as PostgREST does.
      return { data: hit.map((r) => (q.columns === "*" ? { ...r } : { id: r.id })), error: null };
    };

    const builder = {
      select(columns, opts) { q.columns = columns; q.counted = opts?.count === "exact"; return proxy; },
      update(values) { q.op = "update"; q.values = values; return proxy; },
      insert() { throw new Error("fakeDb: nothing under test inserts; model it before using it"); },
      eq(col, val) { q.filters.push(["eq", col, val]); return proxy; },
      is(col, val) { q.filters.push(["is", col, val]); return proxy; },
      lt(col, val) { q.filters.push(["lt", col, val]); return proxy; },
      or(expr) { q.filters.push(["or", null, expr]); return proxy; },
      // nullsFirst matters: a workspace that has never been swept must go
      // ahead of one swept an hour ago, or a new tenant waits behind the queue.
      order(col, opts) { q.order = col; q.nullsFirst = opts?.nullsFirst === true; q.desc = opts?.ascending === false; return proxy; },
      limit(n) { q.limit = n; return proxy; },
      // One row, PostgREST's two ways of asking. `single()` treating "no rows"
      // as an ERROR is the whole point of using it: a write that changed
      // nothing must not come back as a success the caller writes on top of.
      single() { return Promise.resolve().then(() => one(run(), true)); },
      maybeSingle() { return Promise.resolve().then(() => one(run(), false)); },
      then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
    };

    const one = (r, strict) => {
      if (r.error) return r;
      const rows = r.data ?? [];
      if (rows.length === 1) return { data: rows[0], error: null };
      if (rows.length === 0) return strict ? { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } } : { data: null, error: null };
      return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } };
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
    /**
     * @param handlers {Record<string, (args) => any>} the RPCs the code under
     *   test is allowed to call. Anything else still throws by name: a sweep
     *   that quietly called an unmodelled function would otherwise pass.
     */
    rpc(name, args) {
      const fn = rpcs[name];
      if (!fn) throw new Error(`fakeDb: rpc(${name}) is not modelled; add it to fakeDb's third argument`);
      seen.push({ rpc: name, args });
      // The ENVELOPE, not the value. supabase-js hands back { data, error } and
      // callers destructure it; returning the bare value makes every caller
      // read `undefined` and take its own error branch -- which is a test that
      // exercises the failure path while claiming to exercise the happy one.
      // A handler that throws is the test saying "the database refused", so it
      // becomes an error envelope rather than a rejected promise.
      try {
        return Promise.resolve({ data: fn(args), error: null });
      } catch (e) {
        return Promise.resolve({ data: null, error: { message: e instanceof Error ? e.message : String(e) } });
      }
    },
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
