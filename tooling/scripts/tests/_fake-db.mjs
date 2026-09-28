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

import crypto from "node:crypto";

/**
 * The database's clock, one per world (the `tables` a double is made over): each statement's now(), a millisecond
 * after the last one's at the least, as two statements' are in Postgres, which counts in microseconds. The wall clock
 * alone gave a turn's answer and the next question one stamp in 21 of 150 runs, and a read ordered newest first with
 * the id as the tiebreak (Ask's readThread) then put those two rows in their random ids' order. The rows of one
 * statement share its stamp, as they share a transaction's now(). Under a frozen or mocked `Date`, each later
 * statement is still a millisecond on, and a clock mocked backwards does not move a world's stamps back.
 */
const clocks = new WeakMap();
function stampOf(tables) {
  const at = Math.max(Date.now(), (clocks.get(tables) ?? 0) + 1);
  clocks.set(tables, at);
  return new Date(at).toISOString();
}

/**
 * A column, or a JSON path the way PostgREST spells one: `recording->>fetch_state`
 * reads the key inside the object. Modelled for the recordings purge, whose
 * candidates are "stored" rows -- a state that lives inside a jsonb column.
 */
function cell(row, col) {
  if (typeof col === "string" && col.includes("->>")) {
    const [base, key] = col.split("->>");
    const v = row[base];
    return v && typeof v === "object" ? v[key] : undefined;
  }
  return row[col];
}

/**
 * A select that names a JSON path the way PostgREST spells one there -- `alias:column->key`, or `column->key`, named
 * for its key -- answers with exactly the columns it names: a path's value under its name, null where the row holds no
 * such key, as `->` answers. Modelled for Ask's thread read (store.ts readThread), which reads each key of a turn it
 * draws and never the turn as the model was sent it (content.raw). A select that names no path answers whole rows, as
 * it always has here; any other spelling beside a path is refused by name. Null when the select names no path.
 * Not modelled: a column the table does not have, which PostgREST refuses with a 400; here it reads as undefined, or
 * as null through a path.
 */
function projectionOf(columns) {
  if (typeof columns !== "string" || !columns.includes("->")) return null;
  const picks = columns
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((spec) => {
      const m = /^(?:(\w+):)?(\w+)(?:->(\w+))?$/.exec(spec);
      if (!m) throw new Error(`fakeDb: select(${spec}) is not modelled`);
      const [, alias, column, key] = m;
      if (key === undefined) return [alias ?? column, (row) => row[column]];
      return [
        alias ?? key,
        (row) => (row[column] && typeof row[column] === "object" ? (row[column][key] ?? null) : null),
      ];
    });
  return (row) => Object.fromEntries(picks.map(([name, read]) => [name, read(row)]));
}

/** jsonb's order for an object's keys: the shorter first, then by their bytes. */
const byJsonbKey = (a, b) =>
  Buffer.byteLength(a) - Buffer.byteLength(b) || Buffer.compare(Buffer.from(a), Buffer.from(b));
/**
 * A value as jsonb keeps it: written as JSON, then every object's keys, at every depth, in jsonb's order. Not modelled:
 * a key that reads as an integer ("10"), which JavaScript always orders first, ascending, whatever order an object's
 * keys were set in -- jsonb puts "10" after "a", and an object here cannot.
 */
function asJsonb(value) {
  const reorder = (v) =>
    Array.isArray(v)
      ? v.map(reorder)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort(byJsonbKey)
              .map((k) => [k, reorder(v[k])]),
          )
        : v;
  return value === undefined ? undefined : reorder(JSON.parse(JSON.stringify(value)));
}

/** Rows a filter selects. `eq` is strict, `is` is the NULL test, `lt` is whatever `<` does — ISO timestamps sort as text. */
function matches(row, filters) {
  return filters.every(([op, col, val]) =>
    op === "eq"
      ? cell(row, col) === val
      : op === "lt"
        ? cell(row, col) != null && cell(row, col) < val
        : // PostgREST's `.is(col, null)`: the only way to ask for NULL, and what
          // every "not erased", "not accepted", "not revoked" read in this codebase
          // is written with. `eq` would not do -- SQL NULL is not equal to anything.
          op === "is"
          ? val === null
            ? cell(row, col) == null
            : cell(row, col) === val
          : op === "gt"
            ? cell(row, col) != null && cell(row, col) > val
            : op === "gte"
              ? cell(row, col) != null && cell(row, col) >= val
              : op === "lte"
                ? cell(row, col) != null && cell(row, col) <= val
                : op === "neq"
                  ? cell(row, col) !== val
                  : op === "in"
                    ? val.includes(cell(row, col))
                    : // PostgREST's `.contains(col, value)`, jsonb's @> for a flat object: every
                      // key the value names holds that value in the column. Modelled for the voice
                      // booking link's daily cap, which counts the sends whose meta carries its
                      // source -- a count the door swallows as zero when it throws, so leaving it
                      // unmodelled would pass while proving nothing. A nested value is not
                      // modelled, and says so.
                      op === "contains"
                      ? (() => {
                          const have = cell(row, col);
                          // jsonb's @> for an array of flat objects, as `.contains(col, '[{...}]')` sends it: each
                          // element named is in the column, key for key. Modelled for the proposal follow-ups' runs
                          // (packages/db followUpTouchesSince), whose values carry a proposal's link.
                          if (typeof val === "string" && val.trim().startsWith("[")) {
                            const want = JSON.parse(val);
                            return (
                              Array.isArray(have) &&
                              want.every((w) =>
                                have.some(
                                  (h) => h && typeof h === "object" && Object.entries(w).every(([k, v]) => h[k] === v),
                                ),
                              )
                            );
                          }
                          if (Array.isArray(val) || Object.values(val).some((v) => v !== null && typeof v === "object"))
                            throw new Error("fakeDb: contains(" + col + ") with a nested value is not modelled");
                          return (
                            !!have &&
                            typeof have === "object" &&
                            !Array.isArray(have) &&
                            Object.entries(val).every(([k, v]) => have[k] === v)
                          );
                        })()
                      : // PostgREST's `.not(col, "is", null)`: "has one". Modelled for Setup's count of
                        // who a broadcast can reach, which requires a number to send to -- the same rule
                        // `mayReceive` applies to a list, spelled in SQL because that one is a count.
                        op === "not"
                        ? (() => {
                            const [o, v] = val;
                            if (o === "is") return v === null ? cell(row, col) != null : cell(row, col) !== v;
                            if (o === "eq") return cell(row, col) !== v;
                            // PostgREST's `.not(col, "like", "usage.%")`: modelled for the activity
                            // log, which leaves the evidence families out unless asked by name.
                            if (o === "like")
                              return !new RegExp(
                                `^${String(v)
                                  .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
                                  .replace(/%/g, ".*")}$`,
                              ).test(String(cell(row, col) ?? ""));
                            throw new Error(`fakeDb: not(${col}, ${o}) is not modelled`);
                          })()
                        : // PostgREST's `.or("a.is.null,a.lt.x")`: any ONE of the clauses. Modelled
                          // because a rotating sweep's whole correctness is "never-done first, then
                          // the oldest" -- and that is a filter, not a shape a source scan can see.
                          op === "or"
                          ? val.split(",").some((clause) => {
                              // The value may hold dots (a phone, a name): the column and the
                              // operator are the first two segments, the rest is the value.
                              const [c, o, ...rest] = clause.split(".");
                              const v = rest.join(".");
                              if (o === "is") return v === "null" ? cell(row, c) == null : String(cell(row, c)) === v;
                              // A handover accepted, or a link's row (0016): "brought" is either.
                              if (o === "not" && v === "is.null") return cell(row, c) != null;
                              if (o === "lt") return cell(row, c) != null && cell(row, c) < v;
                              if (o === "eq") return String(cell(row, c)) === v;
                              // SQL's <>: a NULL is not unequal to anything, which is why a filter pairs it with
                              // `is.null` (the domains sweep: every hold but a complaint's, and no hold at all).
                              if (o === "neq") return cell(row, c) != null && String(cell(row, c)) !== v;
                              // PostgREST's ilike, with * as the wildcard: modelled for the People
                              // page's count of who matches a search.
                              if (o === "ilike")
                                return String(cell(row, c) ?? "")
                                  .toLowerCase()
                                  .includes(v.replace(/\*/g, "").toLowerCase());
                              throw new Error(`fakeDb: or() clause ${clause} is not modelled`);
                            })
                          : (() => {
                              throw new Error(`fakeDb: no filter called ${op}()`);
                            })(),
  );
}

/**
 * A partial unique index (`opts.uniqueIndexes`: `[{ table, name, columns | key, where }]`): among the rows `where` admits,
 * the `columns` hold each combination once. An insert or an update that would leave two such rows fails as Postgres
 * fails the statement (23505, naming the index, nothing written). Modelled for the one line a workspace holds
 * (lines_one_live_per_tenant_idx, 00195): two buys that crossed both read no line, and it is the database, not the
 * door's read, that refuses the second insert -- and a retry's compare-and-swap beside a live line the same way.
 * Rows a fixture seeded are taken as they are; only what the code under test writes is judged.
 */
function uniqueViolation(indexes, table, candidates, others) {
  for (const ix of indexes.filter((i) => i.table === table)) {
    const held = others.filter((r) => ix.where(r));
    // An index on expressions (`key`: the row's key, as a string) rather than columns: jobs_reply_read_once is on the
    // payload's message and stage (00222).
    const same = ix.key ? (a, b) => ix.key(a) === ix.key(b) : (a, b) => ix.columns.every((c) => a[c] === b[c]);
    for (const row of candidates) {
      if (!ix.where(row)) continue;
      if (held.some((r) => same(r, row)))
        return { code: "23505", message: `duplicate key value violates unique constraint "${ix.name}"` };
      held.push(row);
    }
  }
  return null;
}

/** The words `to_tsvector('simple', ...)` makes of a text, in order: lower-cased runs of letters and digits. */
const lexemesOf = (text) =>
  String(text ?? "")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];

/**
 * websearch_to_tsquery's grammar, as a search box uses it: words (every one), "a phrase" (its words in a row), `or`
 * (either side), `-word` and `-"a phrase"` (not it). An OR of AND-groups of `{ words, not }`; a word the parser splits
 * ("don't") is a phrase of its parts, as Postgres makes it. Null when the words have nothing to look for -- none at all
 * (querytree ''), or a group of exclusions alone, which a text holding none of the words would match (querytree 'T')
 * -- where search_messages answers nothing (00219).
 */
function webQuery(words) {
  const groups = [[]];
  for (const m of String(words).matchAll(/(-?)"([^"]*)"?|(\S+)/g)) {
    const bare = m[3];
    if (bare !== undefined && bare.toLowerCase() === "or") {
      groups.push([]);
      continue;
    }
    const not = bare !== undefined ? bare.startsWith("-") : m[1] === "-";
    const w = lexemesOf(bare !== undefined ? bare.replace(/^-/, "") : m[2]);
    if (w.length) groups[groups.length - 1].push({ words: w, not });
  }
  const kept = groups.filter((g) => g.length);
  return !kept.length || kept.some((g) => g.every((t) => t.not)) ? null : kept;
}

/** Whether a text's words hold a term: its words in a row. */
const holds = (tokens, term) => tokens.some((_, i) => term.words.every((w, j) => tokens[i + j] === w));

/**
 * ts_headline's one fragment as 00219 asks for it (MaxFragments=1, MaxWords=24, no markup): the words around the first
 * that matched, at most 24, eight before it where there are eight. The double's approximation: a run of spaces is one.
 */
function headline(text, groups) {
  const words = String(text ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const wanted = new Set(groups.flatMap((g) => g.filter((t) => !t.not).flatMap((t) => t.words)));
  const first = Math.max(
    0,
    words.findIndex((w) => lexemesOf(w).some((x) => wanted.has(x))),
  );
  const start = Math.max(0, Math.min(first - 8, words.length - 24));
  return words.slice(start, start + 24).join(" ");
}

/**
 * `search_messages` (00219), answered out of the messages and calls a fixture holds, in the function's own row shape:
 * one workspace's messages whose body holds the words and calls whose transcript does, none older than p_since (a call
 * by when it started, else when it was recorded), newest first with the id breaking ties, at most
 * least(greatest(p_limit, 1), 50), each `{ kind, id, conversation_id, contact_id, channel (null for a call), direction,
 * at, snippet }`. Strict: a null argument answers nothing, as blank words and exclusions alone do. No RLS: the double
 * holds one member's view.
 */
function searchMessagesIn(tables, { p_tenant, p_words, p_since, p_limit }) {
  if ([p_tenant, p_words, p_since, p_limit].some((v) => v == null)) return [];
  const q = webQuery(p_words);
  if (!q) return [];
  const since = Date.parse(p_since);
  const cap = Math.min(50, Math.max(1, p_limit));
  const newest = (a, b) => Date.parse(b.at) - Date.parse(a.at) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
  const found = (rows, pick) =>
    rows
      .filter((r) => r.tenant_id === p_tenant)
      .map(pick)
      .filter((h) => Date.parse(h.at) >= since && q.some((g) => g.every((t) => holds(lexemesOf(h.said), t) !== t.not)))
      .sort(newest)
      .slice(0, cap);
  const hits = [
    ...found(tables.messages ?? [], (m) => ({
      kind: "message",
      id: m.id,
      conversation_id: m.conversation_id ?? null,
      contact_id: m.contact_id ?? null,
      channel: m.channel ?? null,
      direction: m.direction,
      at: m.created_at,
      said: m.body,
    })),
    ...found(tables.calls ?? [], (c) => ({
      kind: "call",
      id: c.id,
      conversation_id: c.conversation_id ?? null,
      contact_id: c.contact_id ?? null,
      channel: null,
      direction: c.direction,
      at: c.started_at ?? c.created_at,
      said: c.transcript,
    })),
  ]
    .sort(newest)
    .slice(0, cap);
  return hits.map(({ said, ...h }) => ({ ...h, snippet: headline(said, q) }));
}

/**
 * @param tables {Record<string, object[]>} mutated in place, so a test can read
 *   back what the code under test actually wrote.
 * @param faults {Record<string, {message: string}>} `"<table>.select"` or
 *   `"<table>.update"` to make that call fail the way PostgREST fails.
 */
export function fakeDb(tables, faults = {}, rpcs = {}, opts = {}) {
  const seen = [];

  /**
   * The doors this file can answer out of the tables it already holds, so a
   * suite does not model what the database derives.
   *
   * `lead_month_used` (00143) is the plan card's read of the month's two
   * ceilings. It is a door and not a table read because lead_counters has no
   * member policy and select revoked from authenticated (00140) -- the card
   * used to read the table here, where the fake answered happily, and raised
   * for every owner in production. Modelled from the same rows a fixture sets,
   * and a suite may still override it by name.
   */
  const derived = {
    lead_month_used: ({ p_tenant_id, p_period }) => {
      const n = (v) => (typeof v === "number" ? v : typeof v === "string" ? Number(v) || 0 : 0);
      const of = (kind) => {
        const c = (tables.lead_counters ?? []).find(
          (x) => x.tenant_id === p_tenant_id && x.kind === kind && x.period === p_period,
        );
        return { used: n(c?.used), reserved: n(c?.reserved) };
      };
      return { allowance: of("allowance"), budget: of("budget") };
    },
    // Ask's day (00240): input plus output of the workspace's usage.ask_tokens events of the last 24 hours, a value
    // that is not a number counting nothing, as the SQL sums them.
    ask_tokens_day: ({ p_tenant }) => {
      const since = Date.now() - 24 * 60 * 60 * 1000;
      const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
      return (tables.events ?? [])
        .filter((e) => e.tenant_id === p_tenant && e.kind === "usage.ask_tokens" && Date.parse(e.created_at) >= since)
        .reduce((sum, e) => sum + n(e.data?.input_tokens) + n(e.data?.output_tokens), 0);
    },
    // Ask's message search (00219), from the messages and calls the fixture holds: a suite that searches models no door.
    search_messages: (args) => searchMessagesIn(tables, args),
  };

  /**
   * A row as it is written: a column named in `opts.jsonb` (`"<table>.<column>"`) is kept as jsonb keeps it (asJsonb),
   * its objects' keys in jsonb's order and never the writer's. Modelled for Ask's raw turn, which must come back as the
   * bytes that were sent (server/ask/memory.ts storedRaw). A column not named is kept as the writer gave it, as always.
   */
  const written = (table, values) => {
    const row = { ...values };
    for (const named of opts.jsonb ?? []) {
      const [t, column] = named.split(".");
      if (t === table && column in row) row[column] = asJsonb(row[column]);
    }
    return row;
  };

  const from = (table) => {
    const q = {
      table,
      op: "select",
      values: null,
      filters: [],
      columns: null,
      limit: null,
      order: null,
      orders: [],
      range: null,
    };
    const rows = () => (tables[table] ??= []);

    const run = () => {
      seen.push({ ...q, filters: [...q.filters] });
      const fault = faults[`${table}.${q.op}`];
      if (fault) return { data: null, error: fault };

      // An insert appends copies with an id and a stamp when the caller gave
      // none, and answers with them -- `.select()` after an insert reads back
      // what was written, as PostgREST does.
      if (q.op === "insert") {
        const at = stampOf(tables);
        const made = q.values.map((v) =>
          written(table, {
            id: crypto.randomUUID(),
            created_at: at,
            ...v,
          }),
        );
        // A table named in `opts.unique` holds each id once, as its primary key does: an insert of an id it holds fails
        // as Postgres fails it (23505). Modelled for a writer whose row's id is derived, so a second write of the same
        // email is the same row, never a second one.
        if ((opts.unique ?? []).includes(table) && made.some((m) => rows().some((r) => r.id === m.id)))
          return {
            data: null,
            error: { code: "23505", message: `duplicate key value violates unique constraint "${table}_pkey"` },
          };
        const clash = uniqueViolation(opts.uniqueIndexes ?? [], table, made, rows());
        if (clash) return { data: null, error: clash };
        rows().push(...made);
        return { data: made.map((r) => ({ ...r })), error: null };
      }

      if (q.op === "select") {
        let out = rows().filter((r) => matches(r, q.filters));
        if (q.orders.length) {
          // Sentinels of the SAME TYPE as the values, because the columns this
          // orders on hold ISO timestamps: comparing -Infinity against a string
          // coerces to NaN, every comparison is false, and nulls silently do
          // not sort at all -- which looks exactly like a rotation that works.
          // Several orders apply in turn, as PostgREST's do: the second breaks
          // the first's ties, which is what makes offset paging stable.
          const rank = (v, o) => (v == null ? (o.nullsFirst ? "" : "￿") : String(v));
          out = [...out].sort((a, b) => {
            for (const o of q.orders) {
              const x = rank(a[o.col], o),
                y = rank(b[o.col], o);
              const d = x < y ? -1 : x > y ? 1 : 0;
              if (d) return o.desc ? -d : d;
            }
            return 0;
          });
        }
        // `{ count: "exact" }` counts the MATCHES, before the limit -- which is
        // how a sweep knows what it could not reach this tick.
        const matched = out.length;
        if (q.limit != null) out = out.slice(0, q.limit);
        if (q.range) out = out.slice(q.range[0], q.range[1] + 1);
        // PostgREST's max_rows (`opts.maxRows`, supabase config): a select answers at most that many rows, after its
        // limit and its range, whatever it asked for. The Inbox asked for 4,000 messages and got 1,000, silently.
        if (opts.maxRows != null) out = out.slice(0, opts.maxRows);
        // Deliberately a copy: the sweep must not be able to mutate the ledger
        // by holding on to a row it read. A select that names a JSON path answers
        // the columns it names (projectionOf).
        const project = projectionOf(q.columns) ?? ((r) => ({ ...r }));
        return { data: out.map(project), error: null, count: q.counted ? matched : null };
      }

      // A delete removes what matches, in place, and counts it when asked:
      // `.delete({ count: "exact" })` is how a route knows it removed nothing.
      if (q.op === "delete") {
        const all = rows();
        const hit = all.filter((r) => matches(r, q.filters));
        for (const r of hit) all.splice(all.indexOf(r), 1);
        return {
          data: q.columns ? hit.map((r) => ({ ...r })) : null,
          error: null,
          count: q.counted ? hit.length : null,
        };
      }

      // An upsert is an insert that, on the conflict columns, updates the row
      // that is already there instead (or leaves it alone with
      // ignoreDuplicates), as PostgREST does. Modelled for the person's
      // receptionist mode and a list's members, whose whole point is that
      // saying it twice makes one row.
      if (q.op === "upsert") {
        const made = [];
        const at = stampOf(tables);
        for (const v of q.values) {
          const existing = rows().find((r) => q.conflict.every((c) => r[c] === v[c]));
          if (existing) {
            // ON CONFLICT DO NOTHING answers with nothing for the row it left
            // alone, as PostgREST does: a claim on a unique row learns it lost
            // by getting no row back. A merging upsert answers with the row.
            if (q.ignoreDuplicates) continue;
            Object.assign(existing, written(table, v));
            made.push(existing);
            continue;
          }
          const r = written(table, { id: crypto.randomUUID(), created_at: at, ...v });
          rows().push(r);
          made.push(r);
        }
        return { data: q.columns ? made.map((r) => ({ ...r })) : null, error: null };
      }

      // The update is the interesting one. It applies to whatever matches the
      // filters AT THE MOMENT IT RUNS, which is what makes a compare-and-swap
      // testable: a second caller whose filters name a value the first one has
      // already replaced matches nothing and comes back empty.
      const hit = rows().filter((r) => matches(r, q.filters));
      // Judged before anything is written: Postgres refuses the whole statement.
      const clash = uniqueViolation(
        opts.uniqueIndexes ?? [],
        table,
        hit.map((r) => ({ ...r, ...q.values })),
        rows().filter((r) => !hit.includes(r)),
      );
      if (clash) return { data: null, error: clash };
      for (const r of hit) Object.assign(r, written(table, q.values));
      // `.select("a, b")` after an update reads those columns back, as PostgREST
      // does, and `.select("*")` the whole row: how a caller that must act on what
      // it just wrote avoids a second round trip. No select at all answers with ids.
      const cols =
        typeof q.columns === "string" && q.columns !== "*"
          ? q.columns
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean)
          : null;
      const back = (r) =>
        q.columns === "*" ? { ...r } : cols ? Object.fromEntries(cols.map((c) => [c, r[c]])) : { id: r.id };
      return { data: hit.map(back), error: null };
    };

    const builder = {
      select(columns, opts) {
        q.columns = columns;
        q.counted = opts?.count === "exact";
        return proxy;
      },
      update(values) {
        q.op = "update";
        q.values = values;
        return proxy;
      },
      insert(values) {
        q.op = "insert";
        q.values = Array.isArray(values) ? values : [values];
        return proxy;
      },
      delete(opts) {
        q.op = "delete";
        q.counted = opts?.count === "exact";
        return proxy;
      },
      upsert(values, opts) {
        q.op = "upsert";
        q.values = Array.isArray(values) ? values : [values];
        q.conflict = String(opts?.onConflict ?? "id").split(",");
        q.ignoreDuplicates = opts?.ignoreDuplicates === true;
        return proxy;
      },
      eq(col, val) {
        q.filters.push(["eq", col, val]);
        return proxy;
      },
      gt(col, val) {
        q.filters.push(["gt", col, val]);
        return proxy;
      },
      gte(col, val) {
        q.filters.push(["gte", col, val]);
        return proxy;
      },
      neq(col, val) {
        q.filters.push(["neq", col, val]);
        return proxy;
      },
      in(col, vals) {
        q.filters.push(["in", col, vals]);
        return proxy;
      },
      contains(col, val) {
        q.filters.push(["contains", col, val]);
        return proxy;
      },
      is(col, val) {
        q.filters.push(["is", col, val]);
        return proxy;
      },
      lt(col, val) {
        q.filters.push(["lt", col, val]);
        return proxy;
      },
      lte(col, val) {
        q.filters.push(["lte", col, val]);
        return proxy;
      },
      or(expr) {
        q.filters.push(["or", null, expr]);
        return proxy;
      },
      not(col, operator, val) {
        q.filters.push(["not", col, [operator, val]]);
        return proxy;
      },
      // nullsFirst matters: a workspace that has never been swept must go
      // ahead of one swept an hour ago, or a new tenant waits behind the queue.
      order(col, opts) {
        const o = { col, nullsFirst: opts?.nullsFirst === true, desc: opts?.ascending === false };
        q.orders.push(o);
        // The first order stays on q.order / q.desc / q.nullsFirst for whoever reads `seen`.
        if (q.orders.length === 1) {
          q.order = col;
          q.nullsFirst = o.nullsFirst;
          q.desc = o.desc;
        }
        return proxy;
      },
      limit(n) {
        q.limit = n;
        return proxy;
      },
      // PostgREST's `.range(from, to)`, inclusive: offset paging under a fixed
      // order, which is how the workspace export walks a table without a
      // keyset on created_at skipping rows that share a timestamp.
      range(from, to) {
        q.range = [from, to];
        return proxy;
      },
      // `.filter(col, op, val)`: the same comparisons, spelled the way a JSON
      // path has to be (`recording->>fetch_state`).
      filter(col, operator, val) {
        q.filters.push([operator, col, val]);
        return proxy;
      },
      // One row, PostgREST's two ways of asking. `single()` treating "no rows"
      // as an ERROR is the whole point of using it: a write that changed
      // nothing must not come back as a success the caller writes on top of.
      single() {
        return Promise.resolve().then(() => one(run(), true));
      },
      maybeSingle() {
        return Promise.resolve().then(() => one(run(), false));
      },
      then(resolve, reject) {
        return Promise.resolve().then(run).then(resolve, reject);
      },
    };

    const one = (r, strict) => {
      if (r.error) return r;
      const rows = r.data ?? [];
      if (rows.length === 1) return { data: rows[0], error: null };
      if (rows.length === 0)
        return strict
          ? {
              data: null,
              error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" },
            }
          : { data: null, error: null };
      return {
        data: null,
        error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" },
      };
    };

    const proxy = new Proxy(builder, {
      get(target, key) {
        if (key in target || typeof key === "symbol") return target[key];
        throw new Error(
          `fakeDb: the code under test called .${String(key)}() on ${table}, which this double does not model`,
        );
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
      const fn = rpcs[name] ?? derived[name];
      if (!fn) throw new Error(`fakeDb: rpc(${name}) is not modelled; add it to fakeDb's third argument`);
      seen.push({ rpc: name, args });
      // The ENVELOPE, not the value. supabase-js hands back { data, error } and
      // callers destructure it; returning the bare value makes every caller
      // read `undefined` and take its own error branch -- which is a test that
      // exercises the failure path while claiming to exercise the happy one.
      // A handler that throws is the test saying "the database refused", so it
      // becomes an error envelope rather than a rejected promise -- carrying the
      // `code` the test put on the error, since a route maps the function's own
      // codes (22023, 54000) to the wire.
      const run = () => {
        try {
          return { data: fn(args), error: null };
        } catch (e) {
          const code = e && typeof e === "object" && "code" in e ? String(e.code) : undefined;
          return {
            data: null,
            error: { message: e instanceof Error ? e.message : String(e), ...(code ? { code } : {}) },
          };
        }
      };
      // `.single()` / `.maybeSingle()` on an rpc ask for one row of a
      // set-returning function; the double answers the same envelope either way.
      const call = {
        then(resolve, reject) {
          return Promise.resolve().then(run).then(resolve, reject);
        },
        single() {
          return call;
        },
        maybeSingle() {
          return call;
        },
      };
      return call;
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
