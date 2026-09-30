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
 * It is a DOUBLE, not a database: no RLS, no triggers, and the comparisons are
 * the handful the callers actually use. Its one real responsibility is to make
 * an unfaithful test fail loudly — any builder method it does not model throws
 * by name rather than returning undefined and letting a chain quietly evaluate
 * to nothing.
 *
 * It does know the schema (_schema.mjs, generated from the migrations), and
 * refuses what PostgREST and Postgres refuse, with their codes, instead of
 * taking any row it is handed: a table, column or function the database does
 * not have (PGRST205, 42703, PGRST204, PGRST202), an embed with no key between
 * the two (PGRST200), a NOT NULL left empty (23502), a value outside a CHECK's
 * set (23514), a second row on a unique key (23505), an upsert whose conflict
 * target no key matches (42P10), and a request line past the gateway's 8 KiB
 * (414: about 208 uuids in one `.in()`). A read answers at most max_rows
 * (1,000) and only the columns it named; a write travels as JSON, so a bulk
 * insert's missing key is NULL and an undefined one is not sent; a write with
 * no `.select()` answers no rows. Rows a fixture seeds are taken as they are:
 * only what the code under test sends is judged. What it still does not know:
 * triggers, which the `*.db.test.mjs` suites meet on the replayed stack, other
 * CHECKs, defaults beyond `id`, `created_at` and the ones a unique key's
 * predicate reads (jobs.state is 'scheduled'), and foreign keys.
 */

import crypto from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { localHour, runDueNow } from "@chanlytics/contracts";
import {
  schemaOf,
  unknownRelation,
  unknownColumn,
  selectOf,
  asSent,
  onTheWire,
  refusedRow,
  unknownWrittenColumn,
  uniqueKeysOf,
  conflictUnmatched,
  unknownFunction,
  requestLine,
  REQUEST_LINE_LIMIT,
  URI_TOO_LONG,
  MAX_ROWS,
} from "./_schema.mjs";

const SCHEMA = await schemaOf();

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
/**
 * `eq`: a column equals a value. A json column asked with the value's JSON text (`.filter("payload", "eq", JSON.stringify(x))`,
 * how PostgREST is asked for jsonb equality) is equal when it holds the same JSON, whatever the order of its keys.
 */
function equalsCell(have, val) {
  if (have !== null && typeof have === "object" && typeof val === "string") {
    try {
      return isDeepStrictEqual(have, JSON.parse(val));
    } catch {
      return false;
    }
  }
  return have === val;
}

function matches(row, filters, defaults = {}) {
  // A column a row leaves out has its default in the database (jobs.state is 'scheduled'), and a filter reads that.
  const read = (r, col) => {
    const v = cell(r, col);
    return v === undefined ? defaults[col] : v;
  };
  return filters.every(([op, col, val]) =>
    op === "eq"
      ? equalsCell(read(row, col), val)
      : op === "lt"
        ? read(row, col) != null && read(row, col) < val
        : // PostgREST's `.is(col, null)`: the only way to ask for NULL, and what
          // every "not erased", "not accepted", "not revoked" read in this codebase
          // is written with. `eq` would not do -- SQL NULL is not equal to anything.
          op === "is"
          ? val === null
            ? read(row, col) == null
            : read(row, col) === val
          : op === "gt"
            ? read(row, col) != null && read(row, col) > val
            : op === "gte"
              ? read(row, col) != null && read(row, col) >= val
              : op === "lte"
                ? read(row, col) != null && read(row, col) <= val
                : // SQL's <>: a NULL is not unequal to anything, so a row whose cell is NULL is not selected.
                  op === "neq"
                  ? read(row, col) != null && read(row, col) !== val
                  : op === "in"
                    ? val.includes(read(row, col))
                    : // PostgREST's `.contains(col, value)`, jsonb's @> for a flat object: every
                      // key the value names holds that value in the column. Modelled for the voice
                      // booking link's daily cap, which counts the sends whose meta carries its
                      // source -- a count the door swallows as zero when it throws, so leaving it
                      // unmodelled would pass while proving nothing. A nested value is not
                      // modelled, and says so.
                      op === "contains"
                      ? (() => {
                          const have = read(row, col);
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
                            if (o === "is") return v === null ? read(row, col) != null : read(row, col) !== v;
                            if (o === "eq") return read(row, col) != null && read(row, col) !== v;
                            // PostgREST's `.not(col, "like", "usage.%")`: modelled for the activity
                            // log, which leaves the evidence families out unless asked by name.
                            if (o === "like")
                              return (
                                read(row, col) != null &&
                                !new RegExp(
                                  `^${String(v)
                                    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
                                    .replace(/%/g, ".*")}$`,
                                ).test(String(read(row, col)))
                              );
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
 * Rows a fixture seeded are taken as they are; only what the code under test writes is judged. So is a key only when
 * the write reaches it: an update that changes no column the key or its predicate reads (`changed`, the columns whose
 * value the write moved, per candidate or for all) makes no new entry on it, as in Postgres, where a row that satisfied
 * the key before still does -- a fixture that seeds five live lines in one workspace is not made a refusal by touching
 * one line's `state_since`, or by saying its state again.
 */
function uniqueViolation(indexes, table, candidates, others, changed = null) {
  const touches = (ix, i) => {
    const cols = Array.isArray(changed) ? changed[i] : changed;
    return !cols || !ix.reads || ix.reads.some((c) => cols.has(c));
  };
  for (const ix of indexes.filter((i) => i.table === table)) {
    // An index on expressions (`key`: the row's key, as a string) rather than columns: jobs_reply_read_once is on the
    // payload's message and stage (00222). A key that reads null is a row the index never holds twice: a NULL part,
    // where NULLs are distinct (the schema's keys, uniqueKeysOf).
    const keyOf = ix.key ?? ((r) => JSON.stringify(ix.columns.map((c) => r[c] ?? null)));
    const held = new Set(
      others
        .filter((r) => ix.where(r))
        .map(keyOf)
        .filter((k) => k != null),
    );
    for (const [i, row] of candidates.entries()) {
      if (!touches(ix, i) || !ix.where(row)) continue;
      const k = keyOf(row);
      if (k == null) continue;
      if (held.has(k))
        return {
          code: "23505",
          message: `duplicate key value violates unique constraint "${ix.name}"`,
          details: "Key already exists.",
          hint: null,
        };
      held.add(k);
    }
  }
  return null;
}

/** The columns a write moves on a row: those it names whose value is not the one the row holds. */
const movedBy = (row, values) =>
  new Set(Object.keys(values).filter((c) => JSON.stringify(row[c] ?? null) !== JSON.stringify(values[c] ?? null)));

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

/** The columns newest_messages answers a message in: the reader's MESSAGE_COLUMNS. */
const MESSAGE_ROW = [
  "id",
  "conversation_id",
  "direction",
  "sender",
  "type",
  "body",
  "media",
  "meta",
  "status",
  "created_at",
  "channel_ts",
  "channel",
];

/**
 * `newest_messages` (00258), answered out of the messages a fixture holds, in the function's own shape: the newest
 * p_each messages of each of these threads in the workspace p_tenant_id, and of those the newest p_most, newest first
 * with the id breaking ties, each with the columns a fixture gave it of MESSAGE_ROW. Refused as the function refuses
 * (22023) past a hundred threads, a hundred of each or four thousand in all; a null argument answers null (strict). No
 * RLS: the double holds one member's view.
 */
function newestMessagesIn(tables, { p_tenant_id, p_threads, p_each, p_most }) {
  if ([p_tenant_id, p_threads, p_each, p_most].some((v) => v == null)) return null;
  if (p_threads.length > 100 || !(p_each >= 1 && p_each <= 100) || !(p_most >= 1 && p_most <= 4000)) {
    throw Object.assign(
      new Error("newest_messages reads at most a hundred threads, a hundred messages of each and four thousand in all"),
      { code: "22023" },
    );
  }
  const newest = (a, b) =>
    Date.parse(b.created_at) - Date.parse(a.created_at) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
  const mine = (tables.messages ?? []).filter((m) => m.tenant_id === p_tenant_id);
  return [...new Set(p_threads)]
    .flatMap((t) =>
      mine
        .filter((m) => m.conversation_id === t)
        .sort(newest)
        .slice(0, p_each),
    )
    .sort(newest)
    .slice(0, p_most)
    .map((m) => Object.fromEntries(MESSAGE_ROW.filter((k) => k in m).map((k) => [k, m[k]])));
}

/**
 * The zone a row is judged in, as 00245 safe_zone answers it: the workspace's own, the product's default when it has
 * none, and UTC when the name is not spelled Area/Location (or UTC) or is not a zone Intl knows -- the edge's own
 * fallback (contracts parts()).
 */
function safeZone(name) {
  const tz = String(name ?? "").trim() || "America/New_York";
  if (tz !== "UTC" && !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+$/.test(tz)) return "UTC";
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

/**
 * SQL's `order by a nulls first, b, c` over ISO timestamps and ids: the row that has waited longest first, a row that
 * never had its turn before any that had, ties broken by the columns after.
 */
function byWaiting(a, b, ...cols) {
  for (const col of cols) {
    const x = a[col] == null ? "" : String(a[col]);
    const y = b[col] == null ? "" : String(b[col]);
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
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
  // A row's workspace always exists in the database (a foreign key); a fixture that sets no workspace row is judged
  // on the product's default zone, as one whose row is blank is, and is not paused.
  const tenantOf = (tenantId) => (tables.tenants ?? []).find((x) => x.id === tenantId);
  const zoneOf = (tenantId) => safeZone(tenantOf(tenantId)?.timezone);
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
    // Whether the session holds a partner's seat that row policy hides from it (00280). A world has no row policy, so it
    // hides no seat, and a seat in it is never one this asks about: a suite that models the hiding gives its own.
    session_has_partner_seat: () => false,
    // A broadcast assembled whole (00282): the run, its people and its send job as one write, the way the database
    // makes them. Who may call it, and whose templates, playbooks and people it accepts, are SQL's, proved on a stack
    // in broadcasts/assemble-broadcast.db.test.mjs.
    assemble_broadcast: ({ p_tenant, p_run, p_recipients, p_send_at }) => {
      const at = stampOf(tables);
      const id = crypto.randomUUID();
      const run = Object.fromEntries(Object.entries(p_run).filter(([, v]) => v !== null));
      (tables.broadcasts ??= []).push(written("broadcasts", { id, created_at: at, tenant_id: p_tenant, ...run }));
      for (const r of p_recipients ?? [])
        (tables.broadcast_recipients ??= []).push(
          written("broadcast_recipients", {
            id: crypto.randomUUID(),
            created_at: at,
            broadcast_id: id,
            contact_id: r.contact_id,
            tenant_id: p_tenant,
            ...(r.facts ? { facts: r.facts } : {}),
          }),
        );
      if (p_send_at)
        (tables.jobs ??= []).push(
          written("jobs", {
            id: crypto.randomUUID(),
            created_at: at,
            tenant_id: p_tenant,
            kind: "broadcast_send",
            due_at: p_send_at,
            payload: { broadcast_id: id },
          }),
        );
      return id;
    },
    // Ask's message search (00219), from the messages and calls the fixture holds: a suite that searches models no door.
    search_messages: (args) => searchMessagesIn(tables, args),
    // The erasure digests (00263), as a database the re-key has not run on makes them: the legacy sha256 of
    // "<tenant>:<value>", in order, null for null (contracts' legacyErasedPhoneHash is the same bytes).
    erasure_digests: ({ p_tenant_id, p_values }) =>
      (p_values ?? []).map((v) =>
        v == null ? null : crypto.createHash("sha256").update(`${p_tenant_id}:${v}`, "utf8").digest("hex"),
      ),
    // The Inbox's messages (00258), each thread's newest, from the messages the fixture holds: every suite that reads
    // GET conversations reads through it.
    newest_messages: (args) => newestMessagesIn(tables, args),
    /**
     * The hourly sweeps' pages (00245 playbooks_due, calendars_due), answered from the rows a fixture sets the way
     * the database answers them: only what is due, a paused workspace's never, the longest waiting first, `p_limit`
     * of them, every row carrying `due_total`, the count of all that were due. A door test runs the real sweep over
     * what the database would have judged due; the SQL itself is proved on a stack in ops/sweep-pages.db.test.mjs.
     */
    playbooks_due: ({ p_kind, p_at, p_last_hour, p_limit, p_tenant_id }) => {
      const at = new Date(p_at);
      const due = (tables.playbooks ?? [])
        .map((p) => ({ p, tz: zoneOf(p.tenant_id) }))
        .filter(
          ({ p }) =>
            p.state === "running" &&
            p.kind === p_kind &&
            tenantOf(p.tenant_id)?.status !== "paused" &&
            (p_tenant_id == null || p.tenant_id === p_tenant_id),
        )
        // runDueNow's rule, as the SQL restates it; the SQL is held to it on a stack (ops/sweep-pages.db.test.mjs).
        .filter(({ p, tz }) => runDueNow(p, tz, at) && localHour(tz, at) <= p_last_hour)
        .sort((a, b) => byWaiting(a.p, b.p, "last_run_at", "created_at", "id"));
      return due
        .slice(0, Math.max(0, p_limit ?? 0))
        .map(({ p, tz }) => ({ playbook: { ...p }, timezone: tz, due_total: due.length }));
    },
    calendars_due: ({ p_before, p_limit, p_tenant_id }) => {
      const due = (tables.tenant_config ?? [])
        .filter((c) => {
          const url = c.config && typeof c.config === "object" ? c.config.calendar?.ical_url : undefined;
          return (
            url != null &&
            String(url).trim() !== "" &&
            (p_tenant_id == null || c.tenant_id === p_tenant_id) &&
            (c.calendar_checked_at == null || c.calendar_checked_at < p_before)
          );
        })
        .sort((a, b) => byWaiting(a, b, "calendar_checked_at", "tenant_id"));
      return due.slice(0, Math.max(0, p_limit ?? 0)).map((c) => ({
        tenant_id: c.tenant_id,
        config: c.config,
        timezone: zoneOf(c.tenant_id),
        due_total: due.length,
      }));
    },
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

  /** The row an insert makes: what was sent, and the two defaults the double fills, where the table has the column. */
  const made = (table, sent, at) => {
    const cols = SCHEMA.relations[table].columns;
    return written(table, {
      ...(cols.id && !("id" in sent) ? { id: crypto.randomUUID() } : {}),
      ...(cols.created_at && !("created_at" in sent) ? { created_at: at } : {}),
      ...sent,
    });
  };

  /**
   * Every unique key a write to `table` must keep: the schema's (_schema.mjs), and what a suite names itself --
   * `opts.uniqueIndexes` for a key it models by hand, `opts.unique` for a table whose `id` it holds once.
   */
  const keysOf = (table) => [
    ...uniqueKeysOf(SCHEMA, table),
    ...(opts.uniqueIndexes ?? []),
    ...((opts.unique ?? []).includes(table)
      ? [{ table, name: `${table}_pkey`, columns: ["id"], where: () => true }]
      : []),
  ];

  const from = (table) => {
    const q = {
      table,
      op: "select",
      values: null,
      filters: [],
      columns: null,
      selected: false,
      head: false,
      limit: null,
      order: null,
      orders: [],
      range: null,
    };
    const rows = () => (tables[table] ??= []);

    /** The columns a request's filters and orders name, each judged against the relation. */
    const namedColumns = () => [
      ...q.filters.flatMap(([op, col, val]) =>
        op === "or"
          ? String(val)
              .split(",")
              .filter((c) => !/^(and|or|not)\(/.test(c))
              .map((c) => c.split(".")[0])
          : [col],
      ),
      ...q.orders.map((o) => o.col),
    ];

    /** What PostgREST refuses before a statement runs, or null. */
    const refused = () => {
      const unknown = unknownRelation(SCHEMA, table);
      if (unknown) return unknown;
      for (const col of namedColumns()) {
        const bad = unknownColumn(SCHEMA, table, col);
        if (bad) return bad;
      }
      if (q.op === "select" || q.selected) {
        const s = selectOf(SCHEMA, table, q.columns);
        if (s.error) return s.error;
      }
      if (["select", "update", "delete"].includes(q.op) && requestLine(table, q).length > REQUEST_LINE_LIMIT)
        return URI_TOO_LONG;
      if (q.op === "insert" || q.op === "upsert") {
        if (q.op === "upsert" && SCHEMA.uniques[table]) {
          const bad = conflictUnmatched(SCHEMA, table, q.conflict);
          if (bad) return bad;
        }
        for (const row of asSent(q.values)) {
          const bad = refusedRow(SCHEMA, table, row, { insert: true });
          if (bad) return bad;
        }
      }
      // An update's values are judged against the rows it matches (below): one that matches none writes none.
      if (q.op === "update") return unknownWrittenColumn(SCHEMA, table, onTheWire(q.values));
      return null;
    };

    /** A row as the request's select draws it: the columns it named, or the whole row for `*`. A copy, always. */
    const drawn = () => selectOf(SCHEMA, table, q.columns).draw;

    const run = () => {
      seen.push({ ...q, filters: [...q.filters] });
      const fault = faults[`${table}.${q.op}`];
      if (fault) return { data: null, error: fault };
      const refusal = refused();
      if (refusal) return { data: null, error: refusal, count: null };

      // An insert appends copies with an id and a stamp when the caller gave
      // none, and answers with them when it asks -- `.select()` after an insert
      // reads back what was written, as PostgREST does; no select, no rows.
      if (q.op === "insert") {
        const at = stampOf(tables);
        const fresh = asSent(q.values).map((v) => made(table, v, at));
        // Judged before anything is written: Postgres refuses the whole statement.
        const clash = uniqueViolation(keysOf(table), table, fresh, rows());
        if (clash) return { data: null, error: clash };
        rows().push(...fresh);
        return { data: q.selected ? fresh.map(drawn()) : null, error: null };
      }

      if (q.op === "select") {
        let out = rows().filter((r) => matches(r, q.filters, SCHEMA.defaults?.[table]));
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
        // PostgREST's max_rows (supabase/config.toml, 1,000; `opts.maxRows` for a suite that proves a page at a small
        // size): a select answers at most that many rows, after its limit and its range, whatever it asked for. The
        // Inbox asked for 4,000 messages and got 1,000, silently.
        out = out.slice(0, opts.maxRows ?? MAX_ROWS);
        // `{ head: true }` asks for the count alone: PostgREST answers no rows.
        if (q.head) return { data: null, error: null, count: q.counted ? matched : null };
        // Deliberately a copy: the sweep must not be able to mutate the ledger
        // by holding on to a row it read. It holds the columns the select named.
        return { data: out.map(drawn()), error: null, count: q.counted ? matched : null };
      }

      // A delete removes what matches, in place, and counts it when asked:
      // `.delete({ count: "exact" })` is how a route knows it removed nothing.
      if (q.op === "delete") {
        const all = rows();
        const hit = all.filter((r) => matches(r, q.filters, SCHEMA.defaults?.[table]));
        for (const r of hit) all.splice(all.indexOf(r), 1);
        return {
          data: q.selected ? hit.map(drawn()) : null,
          error: null,
          count: q.counted ? hit.length : null,
        };
      }

      // An upsert is an insert that, on the conflict columns, updates the row
      // that is already there instead (or leaves it alone with
      // ignoreDuplicates), as PostgREST does. Modelled for the person's
      // receptionist mode and a list's members, whose whole point is that
      // saying it twice makes one row. A NULL in a conflict column matches no
      // row, as NULL equals nothing: that row is inserted.
      if (q.op === "upsert") {
        const at = stampOf(tables);
        const plan = [];
        for (const v of asSent(q.values)) {
          const existing = q.conflict.some((c) => v[c] == null)
            ? undefined
            : rows().find((r) => q.conflict.every((c) => r[c] === v[c]));
          // ON CONFLICT DO NOTHING answers with nothing for the row it left
          // alone, as PostgREST does: a claim on a unique row learns it lost
          // by getting no row back. A merging upsert answers with the row.
          if (existing && q.ignoreDuplicates) continue;
          const sent = written(table, v);
          plan.push(existing ? { existing, sent, row: { ...existing, ...sent } } : { row: made(table, v, at) });
        }
        // Judged before anything is written: Postgres refuses the whole statement.
        const touched = plan.filter((x) => x.existing).map((x) => x.existing);
        const clash = uniqueViolation(
          keysOf(table),
          table,
          plan.map((x) => x.row),
          rows().filter((r) => !touched.includes(r)),
          plan.map((x) => (x.existing ? movedBy(x.existing, x.sent) : null)),
        );
        if (clash) return { data: null, error: clash };
        const out = [];
        for (const x of plan) {
          if (x.existing) Object.assign(x.existing, x.sent);
          else rows().push(x.row);
          out.push(x.existing ?? x.row);
        }
        return { data: q.selected ? out.map(drawn()) : null, error: null };
      }

      // The update is the interesting one. It applies to whatever matches the
      // filters AT THE MOMENT IT RUNS, which is what makes a compare-and-swap
      // testable: a second caller whose filters name a value the first one has
      // already replaced matches nothing and comes back empty.
      const values = onTheWire(q.values);
      const hit = rows().filter((r) => matches(r, q.filters, SCHEMA.defaults?.[table]));
      const refusedValue = hit.length ? refusedRow(SCHEMA, table, values, { insert: false }) : null;
      if (refusedValue) return { data: null, error: refusedValue, count: null };
      // Judged before anything is written: Postgres refuses the whole statement.
      const clash = uniqueViolation(
        keysOf(table),
        table,
        hit.map((r) => ({ ...r, ...values })),
        rows().filter((r) => !hit.includes(r)),
        hit.map((r) => movedBy(r, values)),
      );
      if (clash) return { data: null, error: clash };
      for (const r of hit) Object.assign(r, written(table, values));
      // `.select("a, b")` after an update reads those columns back, as PostgREST
      // does, and `.select("*")` the whole row: how a caller that must act on what
      // it just wrote avoids a second round trip, and how a permission-sensitive
      // update counts what it changed. No select at all answers no rows.
      return { data: q.selected ? hit.map(drawn()) : null, error: null };
    };

    const builder = {
      // `.select()` with no list is `*`, as postgrest-js sends it; on a write it asks for the rows written back.
      select(columns, opts) {
        q.columns = columns ?? "*";
        q.selected = true;
        q.counted = opts?.count === "exact";
        q.head = opts?.head === true;
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
        // PostgREST's default target is the primary key.
        q.conflict = opts?.onConflict
          ? String(opts.onConflict)
              .split(",")
              .map((c) => c.trim())
          : primaryKeyOf(table);
        q.ignoreDuplicates = opts?.ignoreDuplicates === true;
        return proxy;
      },
      eq(col, val) {
        q.filters.push(["eq", col, sent(val)]);
        return proxy;
      },
      gt(col, val) {
        q.filters.push(["gt", col, sent(val)]);
        return proxy;
      },
      gte(col, val) {
        q.filters.push(["gte", col, sent(val)]);
        return proxy;
      },
      neq(col, val) {
        q.filters.push(["neq", col, sent(val)]);
        return proxy;
      },
      in(col, vals) {
        q.filters.push(["in", col, vals.map(sent)]);
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
        q.filters.push(["lt", col, sent(val)]);
        return proxy;
      },
      lte(col, val) {
        q.filters.push(["lte", col, sent(val)]);
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
      // A write that asked for no rows back answers none, and `.single()` on it has nothing to object to.
      if (q.op !== "select" && !q.selected) return { data: null, error: null };
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
     *   that quietly called an unmodelled function would otherwise pass. A
     *   suite's own handler is given the derived one, when there is one, as
     *   its second argument: it may answer some calls itself and defer the rest.
     */
    rpc(name, args) {
      // A function the database does not have, or one called by argument names it does not take, is refused as
      // PostgREST refuses it, whatever a suite models: a renamed parameter fails in production and must fail here.
      const missing = unknownFunction(SCHEMA, name, args);
      const fn = rpcs[name] ?? derived[name];
      if (!fn && !missing) throw new Error(`fakeDb: rpc(${name}) is not modelled; add it to fakeDb's third argument`);
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
        if (missing) return { data: null, error: missing };
        try {
          return { data: fn(args, derived[name]), error: null };
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

/**
 * A filter's value as postgrest-js writes it into the URL: `eq.${value}`, so an undefined is the word "undefined",
 * which matches no row (and a uuid column refuses), never "the rows without this column".
 */
const sent = (v) => (v === undefined ? "undefined" : v);

/** The columns of a table's primary key, PostgREST's conflict target when an upsert names none. */
function primaryKeyOf(table) {
  return uniqueKeysOf(SCHEMA, table).find((k) => k.primary)?.columns ?? ["id"];
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
