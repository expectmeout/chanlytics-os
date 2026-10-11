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
import { isPersonsWords, isReplyTo, localHour, runDueNow } from "@chanlytics/contracts";
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
                              // A run read by any of the dates its touches are counted at (db touches.ts): ISO
                              // timestamps sort as text, as `lt` reads them.
                              if (o === "gte") return cell(row, c) != null && cell(row, c) >= v;
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

/* ---------------------------------------------------- resolve_person (00342, 00344), from the rows a world holds */

/** How sure the door is of an identity (contact_identities.assurance): a stronger word replaces a weaker one. */
const ASSURANCE_RANK = { found: 1, asserted: 2, observed: 3 };
const RESOLVE_CHANNELS = ["whatsapp", "voice", "sms", "email", "instagram"];
const E164 = /^\+[1-9][0-9]{7,14}$/;
const AN_ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const refusal = (code, message) => Object.assign(new Error(message), { code });
const living = (c) => c.erased_at == null && c.merged_into_contact_id == null;
const inWorkspace = (tables, tenantId) => (tables.contacts ?? []).filter((c) => c.tenant_id === tenantId);

/** The door's reading of its arguments, refused with its own codes and words: the number as 00367 restates normalizePhone. */
function resolveArgs(a) {
  const word = (v) => String(v ?? "").trim();
  const channel = word(a.p_channel) || null;
  const external = word(a.p_external) || null;
  const digits = String(a.p_phone ?? "").replace(/\D/g, "");
  const plus = String(a.p_phone ?? "")
    .trim()
    .startsWith("+");
  const email = word(a.p_email).toLowerCase() || null;
  const name = word(a.p_name).replace(/\s+/g, " ").slice(0, 80) || null;
  const assurance = word(a.p_assurance) || "observed";
  if (!(assurance in ASSURANCE_RANK)) throw refusal("22023", "An identity is observed, asserted or found.");
  if ((channel === null) !== (external === null)) throw refusal("22023", "An identity needs its channel and its id.");
  if (channel && !RESOLVE_CHANNELS.includes(channel)) throw refusal("22023", "That is not a channel.");
  const phone =
    digits === ""
      ? null
      : digits.length === 10 && !plus
        ? `+1${digits}`
        : digits.length >= 8 && digits.length <= 15
          ? `+${digits}`
          : null;
  if ((digits !== "" && phone === null) || (phone && !E164.test(phone)))
    throw refusal("22023", "A phone number in international form is needed.");
  if (email && (email.length < 3 || email.length > 254 || !AN_ADDRESS.test(email)))
    throw refusal("22023", "That is not an email address.");
  if (!external && !phone && !email && !name) throw refusal("22023", "A number or an address is needed.");
  return {
    channel,
    external,
    phone,
    email,
    name,
    assurance,
    observed: assurance === "observed",
    source: word(a.p_source) || "manual",
    detail: a.p_detail && typeof a.p_detail === "object" ? a.p_detail : {},
    seen: a.p_seen_at ?? null,
  };
}

/** The erased stay erased on the passive paths (00263, 00331): a member's, a feed's or the finder's word; never the wire's. */
function refusedAsForgotten(tables, tenantId, r) {
  if (r.observed) return;
  const digest = (v) => crypto.createHash("sha256").update(`${tenantId}:${v}`, "utf8").digest("hex");
  const rows = inWorkspace(tables, tenantId);
  if (
    (r.phone && rows.some((c) => c.erased_phone_hash === digest(r.phone))) ||
    (r.email && rows.some((c) => c.erased_email_hash === digest(r.email)))
  )
    throw refusal("PE001", "That person asked to be forgotten.");
}

/** The match, in the door's order: the identity, then the number, then the address (two numbers are two people). */
function matchPerson(tables, tenantId, r) {
  const rows = inWorkspace(tables, tenantId);
  if (r.external) {
    const i = (tables.contact_identities ?? []).find(
      (x) => x.tenant_id === tenantId && x.channel === r.channel && x.external_id === r.external,
    );
    const c = i && rows.find((x) => x.id === i.contact_id && x.erased_at == null);
    if (c) return { id: c.merged_into_contact_id ?? c.id, by: "identity" };
  }
  if (r.phone) {
    const c = rows.find((x) => x.phone_e164 === r.phone && living(x));
    if (c) return { id: c.id, by: "phone" };
  }
  if (r.email) {
    const c = rows.find((x) => x.email === r.email && living(x) && (!r.phone || x.phone_e164 == null));
    if (c) return { id: c.id, by: "email" };
  }
  return null;
}

/** Nobody: made, with the address only when nobody here holds it; a held address, or a held name, is a doubt beside them. */
function makePerson(tables, tenantId, r, insertRow, at) {
  const rows = inWorkspace(tables, tenantId);
  const held = r.email ? rows.find((c) => c.email === r.email) : null;
  const out = { email: null, other: null, seenAs: null };
  if (held) {
    out.email = "taken";
    const other = rows.find((c) => c.email === r.email && living(c));
    if (other) Object.assign(out, { other: other.id, seenAs: "email" });
  }
  if (r.name && !out.seenAs) {
    const other = rows.find(
      (c) => c.display_name && c.display_name.toLowerCase() === r.name.toLowerCase() && living(c),
    );
    if (other) Object.assign(out, { other: other.id, seenAs: "name" });
  }
  const row = insertRow("contacts", {
    tenant_id: tenantId,
    phone_e164: r.phone,
    email: held ? null : r.email,
    display_name: r.observed ? null : r.name,
    wa_profile_name: r.observed ? r.name : null,
    last_seen_at: r.seen ?? at,
  });
  if (r.email && !held) out.email = "set";
  // Where they came from, when it was not by writing or calling (00306 says the wire for those).
  if (!r.observed)
    insertRow("events", {
      tenant_id: tenantId,
      kind: "contact.added",
      category: "contact",
      subject_type: "contact",
      subject_id: row.id,
      data: { ...r.detail, source: r.source, by: r.detail.by ?? null },
    });
  return { id: row.id, ...out };
}

/** Found: what we did not have is kept, what we have is never overwritten, and a name the wire gave follows the wire. */
function fillPerson(tables, tenantId, r, id, at) {
  const rows = inWorkspace(tables, tenantId);
  const row = rows.find((c) => c.id === id);
  const filled = [];
  const out = { email: null, other: null, seenAs: null };
  const write = (column, value) => {
    row[column] = value;
    row.updated_at = at;
    filled.push(column);
  };
  if (r.name) {
    if (r.observed) {
      if (row.wa_profile_name !== r.name) write("wa_profile_name", r.name);
    } else if (row.display_name == null) write("display_name", r.name);
  }
  if (r.phone && row.phone_e164 == null) {
    const other = rows.find((c) => c.phone_e164 === r.phone && c.id !== id);
    if (other) Object.assign(out, { other: other.id, seenAs: "phone" });
    else write("phone_e164", r.phone);
  }
  if (r.email) {
    const other = rows.find((c) => c.email === r.email && c.id !== id);
    if (row.email != null) out.email = "kept";
    else if (other) {
      out.email = "taken";
      if (!out.seenAs && living(other)) Object.assign(out, { other: other.id, seenAs: "email" });
    } else {
      write("email", r.email);
      out.email = "set";
    }
  }
  if (r.observed && (row.last_seen_at == null || row.last_seen_at < (r.seen ?? at))) row.last_seen_at = r.seen ?? at;
  return { filled, ...out };
}

/** The identity, with how sure the door was: added, raised (a stronger word), or kept. */
function keepIdentity(tables, tenantId, r, id, insertRow) {
  if (!r.external) return null;
  const have = (tables.contact_identities ?? []).find(
    (x) => x.tenant_id === tenantId && x.channel === r.channel && x.external_id === r.external,
  );
  if (!have) {
    insertRow("contact_identities", {
      tenant_id: tenantId,
      contact_id: id,
      channel: r.channel,
      external_id: r.external,
      assurance: r.assurance,
    });
    return "added";
  }
  if (have.contact_id === id && ASSURANCE_RANK[r.assurance] > ASSURANCE_RANK[have.assurance ?? "observed"]) {
    have.assurance = r.assurance;
    return "raised";
  }
  return "kept";
}

/** The doubt: only a pair 0028's door could join, written once per pair whichever way round, and left alone once settled. */
function keepDoubt(tables, tenantId, id, other, seenAs, insertRow) {
  const none = { other: null, seenAs: null, doubtId: null };
  if (!other) return none;
  const rows = inWorkspace(tables, tenantId);
  const [a, b] = [rows.find((c) => c.id === id), rows.find((c) => c.id === other)];
  const joinable =
    (a.phone_e164 == null || b.phone_e164 == null || a.phone_e164 === b.phone_e164) &&
    (a.email == null || b.email == null || a.email === b.email);
  if (!joinable) return none;
  const [lo, hi] = id < other ? [id, other] : [other, id];
  const had = (tables.person_doubts ?? []).find(
    (d) => d.tenant_id === tenantId && d.contact_id === lo && d.other_id === hi,
  );
  if (had) return { other, seenAs, doubtId: null };
  const row = insertRow("person_doubts", { tenant_id: tenantId, contact_id: lo, other_id: hi, seen: seenAs });
  return { other, seenAs, doubtId: row.id };
}

/**
 * The one door a person is resolved by (resolve_person, 00342 and 00344; decision 0034), over the rows a world holds,
 * so the sweeps, the booking link and the email intake run their real code over it: the erasure digests first on the
 * passive paths, then the identity, the number and the address; fills what is empty and never overwrites; never
 * merges, and writes a doubt instead for a pair the merge could join; contact.added for a new person a member, a feed
 * or the finder brought, person.resolved when the call changed something (a person made, a field filled, an identity
 * added or raised, a doubt written; 00384). The SQL itself is proved on a stack in
 * people/doors/resolve-person.db.test.mjs; what this answers is held to the same cases there. Not modelled: the race
 * two doors run (one world, one caller at a time), contact.email_set, which set_person_email writes beside the
 * address, and the lead the door links (person_link_lead), which would be one more reason to write the row.
 */
function resolvePersonIn(tables, args, insertRow) {
  const tenantId = args.p_tenant_id;
  if (!tenantId) throw refusal("P0002", "Workspace not found.");
  const r = resolveArgs(args);
  refusedAsForgotten(tables, tenantId, r);
  const at = stampOf(tables);
  const found = matchPerson(tables, tenantId, r);
  const made = found ? null : makePerson(tables, tenantId, r, insertRow, at);
  const id = found ? found.id : made.id;
  const fill = found ? fillPerson(tables, tenantId, r, id, at) : { filled: [], ...made };
  const outcome = found ? (fill.filled.length ? "filled" : "matched") : "new";
  const identity = keepIdentity(tables, tenantId, r, id, insertRow);
  const doubt = keepDoubt(tables, tenantId, id, fill.other, fill.seenAs, insertRow);
  // The ledger's row, when the call changed something (00384); a call that found the person and learned nothing
  // writes none.
  if (outcome !== "matched" || identity === "added" || identity === "raised" || doubt.doubtId != null) {
    insertRow("events", {
      tenant_id: tenantId,
      kind: "person.resolved",
      category: "contact",
      subject_type: "contact",
      subject_id: id,
      data: {
        outcome,
        matched_by: found?.by ?? null,
        source: r.source,
        channel: r.channel,
        assurance: r.assurance,
        by: null,
        filled: fill.filled,
        identity,
        doubt: doubt.other,
        doubt_seen: doubt.seenAs,
      },
    });
  }
  return {
    contact_id: id,
    outcome,
    existed: !!found,
    matched_by: found?.by ?? null,
    email: fill.email,
    filled: fill.filled,
    identity,
    doubt: doubt.other,
    doubt_seen: doubt.seenAs,
    doubt_id: doubt.doubtId,
  };
}

/**
 * A provider's stop and its event, one write (record_provider_stop, 00383), over the rows a world holds, so the send
 * door (the carrier's 21610 at the wire), the status door (the same, told late) and the receipts door (WhatsApp's
 * 131050) run their real code over it: the row's own answer is the event's `previous`; a person already stopped, or
 * erased, is left as they are and the door answers false; the message the provider refused rides on the event when
 * named. The SQL itself is proved on a stack in consent/stops/a-provider-s-stop-is-one-write.db.test.mjs. Not modelled:
 * 00297's trigger, which empties the channels the answer covered from the event.
 */
function recordProviderStopIn(tables, args, insertRow) {
  const tenantId = args.p_tenant_id;
  const contactId = args.p_contact_id;
  const purpose = args.p_purpose;
  const channel = String(args.p_channel ?? "").trim();
  const source = String(args.p_source ?? "").trim();
  if (!tenantId || !contactId) throw refusal("P0002", "Workspace not found.");
  if (purpose !== "conversational" && purpose !== "marketing")
    throw refusal("22023", "A stop is about messages on their own visit (conversational) or about offers (marketing).");
  if (!channel || !source) throw refusal("22004", "A provider's stop names its channel and its source.");
  const row = inWorkspace(tables, tenantId).find((c) => c.id === contactId);
  if (!row || row.erased_at != null) return false;
  const at = stampOf(tables);
  let data;
  if (purpose === "conversational") {
    if (row.consent === "opted_out") return false;
    data = { consent: "opted_out", previous: row.consent ?? "unknown", source, channel };
    Object.assign(row, { consent: "opted_out", dnc: true, consent_source: source, consent_updated_at: at });
  } else {
    if (row.marketing_consent === "opted_out") return false;
    data = {
      purpose: "marketing",
      consent: "opted_out",
      previous: row.marketing_consent ?? "unknown",
      source,
      channel,
    };
    Object.assign(row, {
      marketing_consent: "opted_out",
      marketing_consent_source: source,
      marketing_consent_updated_at: at,
    });
  }
  if (String(args.p_message_external_id ?? "").trim()) data.message_external_id = args.p_message_external_id;
  insertRow("events", {
    tenant_id: tenantId,
    kind: "contact.consent_changed",
    category: "contact",
    subject_type: "contact",
    subject_id: contactId,
    data,
  });
  return true;
}

/**
 * @param tables {Record<string, object[]>} mutated in place, so a test can read
 *   back what the code under test actually wrote.
 * @param opts.userId the session's person, where a member's door writes a line as theirs (message_call_back).
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
  /**
   * A row a derived door writes, as an insert through `from` would write it: judged against the relation and the
   * table's unique keys (a clash is the database's 23505), stamped, and kept. Defined below with `from`; a door runs
   * long after both are made.
   */
  const insertRow = (table, values) => {
    const bad = refusedRow(SCHEMA, table, values, { insert: true });
    if (bad) throw Object.assign(new Error(bad.message), { code: bad.code });
    const fresh = made(table, values, stampOf(tables));
    const clash = uniqueViolation(keysOf(table), table, [fresh], tables[table] ?? []);
    if (clash) throw Object.assign(new Error(clash.message), { code: clash.code });
    (tables[table] ??= []).push(fresh);
    return fresh;
  };
  const derived = {
    // The one door a person is resolved by (00342, 00344): the sweeps, the booking link and the email intake call it.
    resolve_person: (args) => resolvePersonIn(tables, args, insertRow),
    // The one door a provider's stop is recorded by (00383): the send, status and receipts doors call it.
    record_provider_stop: (args) => recordProviderStopIn(tables, args, insertRow),
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
    // Ask's day (00240, 00368): input, cache writes and output of the workspace's usage.ask_tokens events of the last
    // 24 hours, a value that is not a number counting nothing and a cache read never counted, as the SQL sums them.
    ask_tokens_day: ({ p_tenant }) => {
      const since = Date.now() - 24 * 60 * 60 * 1000;
      const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
      return (tables.events ?? [])
        .filter((e) => e.tenant_id === p_tenant && e.kind === "usage.ask_tokens" && Date.parse(e.created_at) >= since)
        .reduce(
          (sum, e) => sum + n(e.data?.input_tokens) + n(e.data?.cache_creation_input_tokens) + n(e.data?.output_tokens),
          0,
        );
    },
    // Whether the session holds a partner's seat that row policy hides from it (00280). A world has no row policy, so it
    // hides no seat, and a seat in it is never one this asks about: a suite that models the hiding gives its own.
    session_has_partner_seat: () => false,
    // A run's counts, a moment playbook's totals and a message's sends (00374 run_counts, playbook_totals,
    // template_sends), counted out of the tables a fixture holds as the SQL counts them; held to it over a real database
    // by playbooks/totals/playbook-totals.db.test.mjs. A suite that models a database before 00374 answers them itself
    // (a handler that throws an error with code PGRST202), and the dashboard then reads the old way.
    run_counts: ({ p_tenant_id, p_run_ids }) => runCountsIn(tables, p_tenant_id, p_run_ids ?? []),
    playbook_totals: ({ p_tenant_id, p_history = 10 }) => playbookTotalsIn(tables, p_tenant_id, p_history),
    template_sends: ({ p_tenant_id }) => templateSendsIn(tables, p_tenant_id),
    // The configuration row's doors for a session (00365). A world has no row policy and no session, so the row reads as
    // its owner reads it (nothing hidden), and the write is the versioned compare-and-swap, by nobody in particular. Who
    // sees the feed's address and who may write are SQL's, proved on a stack in
    // workspace/config/the-feed-address-is-the-owner-s.db.test.mjs; a suite that models a member who is not the owner
    // gives its own.
    tenant_config_read: ({ p_tenant_id }) => {
      const row = (tables.tenant_config ?? []).find((r) => r.tenant_id === p_tenant_id);
      if (!row) return null;
      const { tenant_id, config, version, updated_at, updated_by } = row;
      return { tenant_id, config, version, updated_at, updated_by: updated_by ?? null, feed_hidden: false };
    },
    tenant_config_write: ({ p_tenant_id, p_config, p_version }) => {
      const row = (tables.tenant_config ?? []).find((r) => r.tenant_id === p_tenant_id);
      if (!row) return { outcome: "missing", version: null, updated_at: null, updated_by: null };
      if (row.version !== p_version) return { outcome: "stale", version: null, updated_at: null, updated_by: null };
      Object.assign(row, { config: p_config, version: p_version + 1, updated_at: stampOf(tables), updated_by: null });
      return { outcome: "saved", version: row.version, updated_at: row.updated_at, updated_by: null };
    },
    // A broadcast assembled whole (00282): the run, its people and its send job as one write, the way the database
    // makes them. Who may call it, and whose templates, playbooks and people it accepts, are SQL's, proved on a stack
    // in broadcasts/assemble-broadcast.db.test.mjs. It keeps the channels the run ticks (WhatsApp alone when none are
    // given, 00298) and each person's channel (none stays none, which is WhatsApp), as campaign-channels.db.test.mjs
    // holds the real one to; which channels a run may carry, and that a person's is among them, are SQL's too. Called
    // with `p_decision` it is 00381's door: the send_broadcast decision on the run rides in the same write, the
    // member's (p_actor) or the system's (none), and the answer is {id, decision_id, undo_dropped} ({id} alone for a
    // run that waits); called without, it is 00282's and answers the id, as an app from before 00381 reads it.
    assemble_broadcast: (args) => {
      const { p_tenant, p_run, p_recipients, p_send_at, p_decision, p_actor, p_via } = args;
      const at = stampOf(tables);
      const id = crypto.randomUUID();
      const run = Object.fromEntries(Object.entries(p_run).filter(([, v]) => v !== null));
      (tables.broadcasts ??= []).push(
        written("broadcasts", {
          id,
          created_at: at,
          tenant_id: p_tenant,
          ...run,
          channels: run.channels ?? ["whatsapp"],
        }),
      );
      for (const r of p_recipients ?? [])
        (tables.broadcast_recipients ??= []).push(
          written("broadcast_recipients", {
            id: crypto.randomUUID(),
            created_at: at,
            broadcast_id: id,
            contact_id: r.contact_id,
            tenant_id: p_tenant,
            ...(r.facts ? { facts: r.facts } : {}),
            ...(r.channel ? { channel: r.channel } : {}),
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
      if (!("p_decision" in args)) return id;
      if (p_decision == null) return { id };
      const decision = insertRow("decisions", {
        tenant_id: p_tenant,
        subject_type: "broadcast",
        subject_id: id,
        verb: "send_broadcast",
        actor_type: p_actor ? "user" : "system",
        actor_user_id: p_actor ?? null,
        payload: p_via ? { ...p_decision, via: p_via } : p_decision,
      });
      return { id, decision_id: decision.id, undo_dropped: false };
    },
    /**
     * A billing reading and the workspace's switch as one write (00382 billing_apply): the row's columns laid over it,
     * only while the row is still what the caller planned against (p_expect: a reading's status and updated_at, or the
     * customer the row names), then tenants.status when the switch
     * moves; true when written, false when another reading won or there is no row. Its two statements are logged as
     * the statements they are (a suite reads the compare-and-set's filters and the switch's write), and a fault on
     * either refuses the whole door as the database would, with nothing of it kept.
     */
    billing_apply: ({ p_tenant_id, p_row, p_expect, p_tenant_status }) => {
      const allowed = new Set([
        "stripe_customer_id",
        "stripe_subscription_id",
        "status",
        "price_id",
        "current_period_end",
        "trial_end",
        "cancel_at",
        "cancel_at_period_end",
        "card_brand",
        "card_last4",
        "last_payment_failed_at",
        "last_paid_at",
      ]);
      const stray = Object.keys(p_row ?? {}).find((k) => !allowed.has(k));
      if (stray)
        throw Object.assign(new Error(`billing_apply: ${stray} is not a column a reading writes`), { code: "22023" });
      const filters = [["eq", "tenant_id", p_tenant_id]];
      const byCustomer = Boolean(p_expect && "stripe_customer_id" in p_expect);
      if (byCustomer) filters.push(["eq", "stripe_customer_id", p_expect.stripe_customer_id]);
      else if (p_expect) filters.push(["eq", "status", p_expect.status], ["eq", "updated_at", p_expect.updated_at]);
      seen.push({ table: "billing_accounts", op: "update", values: p_row, filters });
      for (const statement of ["billing_accounts.update", ...(p_tenant_status ? ["tenants.update"] : [])]) {
        const fault = faults[statement];
        if (fault) throw Object.assign(new Error(fault.message), fault.code ? { code: fault.code } : {});
      }
      const row = (tables.billing_accounts ?? []).find(
        (r) =>
          r.tenant_id === p_tenant_id &&
          (!p_expect ||
            (byCustomer
              ? r.stripe_customer_id === p_expect.stripe_customer_id
              : r.status === p_expect.status && r.updated_at === p_expect.updated_at)),
      );
      if (!row) return false;
      Object.assign(row, p_row, { updated_at: stampOf(tables) });
      if (p_tenant_status) {
        const tenant = tenantOf(p_tenant_id);
        if (!["active", "paused", "test"].includes(p_tenant_status))
          throw Object.assign(
            new Error('new row for relation "tenants" violates check constraint "tenants_status_check"'),
            {
              code: "23514",
            },
          );
        seen.push({
          table: "tenants",
          op: "update",
          values: { status: p_tenant_status },
          filters: [["eq", "id", p_tenant_id]],
        });
        if (tenant) tenant.status = p_tenant_status;
      }
      return true;
    },
    /**
     * The one door a queued message is withdrawn by (00387 withdraw_queued), over the rows a world holds: each named
     * row of the workspace still queued and claimed by no run (sending_at) canceled, with the reason on it (none keeps
     * its error as it was), and the scheduled outbound_send job naming it canceled with it. A fault on
     * `messages.update` refuses the whole door, with nothing of it kept. Answers the ids withdrawn.
     */
    withdraw_queued: ({ p_tenant_id, p_message_ids, p_reason }) => {
      const fault = faults["messages.update"];
      if (fault) throw Object.assign(new Error(fault.message), fault.code ? { code: fault.code } : {});
      const named = new Set(p_message_ids ?? []);
      const rows = (tables.messages ?? []).filter(
        (m) => m.tenant_id === p_tenant_id && named.has(m.id) && m.status === "queued" && !m.sending_at,
      );
      for (const m of rows) {
        m.status = "canceled";
        if (p_reason) m.error = p_reason;
        for (const j of tables.jobs ?? [])
          if (
            j.tenant_id === p_tenant_id &&
            j.kind === "outbound_send" &&
            (j.state ?? "scheduled") === "scheduled" &&
            j.payload?.message_id === m.id
          )
            j.state = "canceled";
      }
      return rows.map((m) => m.id).sort();
    },
    withdraw_ai_drafts: ({ p_tenant_id, p_conversation_id, p_reason, p_keep_message_id }) =>
      derived.withdraw_queued({
        p_tenant_id,
        p_message_ids: (tables.messages ?? [])
          .filter(
            (m) =>
              m.tenant_id === p_tenant_id &&
              m.conversation_id === p_conversation_id &&
              m.sender === "ai" &&
              m.status === "queued" &&
              !m.sending_at &&
              m.id !== p_keep_message_id,
          )
          .map((m) => m.id),
        p_reason,
      }),
    // The member's doors (00387): who may act is the route's check here, and the database's floor is its own suite's.
    member_withdraw_drafts: ({ p_tenant_id, p_conversation_id }) =>
      derived.withdraw_ai_drafts({ p_tenant_id, p_conversation_id, p_reason: { reason: "superseded_by_human" } })
        .length,
    member_withdraw_message: ({ p_tenant_id, p_message_id, p_reason }) =>
      derived.withdraw_queued({ p_tenant_id, p_message_ids: [p_message_id], p_reason }).length > 0,
    message_call_back: ({ p_tenant_id, p_message_id, p_via, p_undo_of }) => {
      if (!derived.withdraw_queued({ p_tenant_id, p_message_ids: [p_message_id], p_reason: null }).length) return null;
      const undo =
        p_undo_of && (tables.decisions ?? []).some((d) => d.id === p_undo_of && d.tenant_id === p_tenant_id)
          ? p_undo_of
          : null;
      const decision = insertRow("decisions", {
        tenant_id: p_tenant_id,
        subject_type: "message",
        subject_id: p_message_id,
        verb: "cancel_send",
        actor_type: "user",
        actor_user_id: opts.userId ?? null,
        payload: p_via ? { via: p_via } : {},
        undo_of: undo,
      });
      return { decision_id: decision.id, undo_dropped: Boolean(p_undo_of) && undo === null };
    },
    /**
     * A thread handed to a person, by its one door (00388 escalation_open), over the rows a world holds: a new open
     * escalation with its escalation.opened ("opened"), the open one taking another reason with escalation.changed
     * ("changed"), or the same reason's words moved ("refreshed"). A fault on `escalations.insert` that is the one-open
     * key's 23505 is a thread already held (as Postgres would answer it); any other refuses the door, with nothing kept.
     */
    escalation_open: ({ p_tenant_id, p_conversation_id, p_reason, p_details }) => {
      const insertFault = faults["escalations.insert"];
      if (insertFault && insertFault.code !== "23505")
        throw Object.assign(new Error(insertFault.message), insertFault.code ? { code: insertFault.code } : {});
      const open = (tables.escalations ?? []).find(
        (e) => e.tenant_id === p_tenant_id && e.conversation_id === p_conversation_id && (e.state ?? "open") === "open",
      );
      if (!open) {
        insertRow("escalations", {
          tenant_id: p_tenant_id,
          conversation_id: p_conversation_id,
          reason: p_reason,
          details: p_details,
          state: "open",
        });
        insertRow("events", {
          tenant_id: p_tenant_id,
          kind: "escalation.opened",
          category: "message",
          version: 1,
          subject_type: "conversation",
          subject_id: p_conversation_id,
          data: { reason: p_reason },
        });
        return "opened";
      }
      const updateFault = faults["escalations.update"];
      if (updateFault)
        throw Object.assign(new Error(updateFault.message), updateFault.code ? { code: updateFault.code } : {});
      if (open.reason !== p_reason) {
        const from = open.reason;
        Object.assign(open, { reason: p_reason, details: p_details });
        insertRow("events", {
          tenant_id: p_tenant_id,
          kind: "escalation.changed",
          category: "conversation",
          version: 1,
          subject_type: "escalation",
          subject_id: open.id,
          data: { from, to: p_reason },
        });
        return "changed";
      }
      open.details = p_details;
      return "refreshed";
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
    // What a member has seen of the people named (00349 contact_seen), from the floor and the marks a fixture holds:
    // every suite that reads GET conversations reads through it. The double holds one member's view, so the rows are
    // that member's: the workspace's floor, and each mark on those people. A fixture with neither answers a member
    // with no reading, and nothing is then new to them.
    contact_seen: ({ p_tenant_id, p_contact_ids }) => ({
      floor_at: (tables.contact_reads ?? []).find((r) => r.tenant_id === p_tenant_id)?.seen_at ?? null,
      marks: (tables.contact_marks ?? [])
        .filter((m) => m.tenant_id === p_tenant_id && (p_contact_ids ?? []).includes(m.contact_id))
        .map((m) => ({
          contact_id: m.contact_id,
          seen_at: m.seen_at ?? null,
          unread_at: m.unread_at ?? null,
          marked_at: m.marked_at ?? null,
        })),
    }),
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
              const x = rank(cell(a, o.col), o),
                y = rank(cell(b, o.col), o);
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

/* ---- 00374's counts, as the SQL counts them (run_counts, playbook_totals, template_sends) ---- */

/** A person's message on a run: the row's own `messages` where a fixture writes one, else the row its message_id names. */
const messageOfRecipient = (tables, r) =>
  r.messages ?? (r.message_id ? ((tables.messages ?? []).find((m) => m.id === r.message_id) ?? null) : null);

/** The channel a person went by: a row naming none went by WhatsApp, as every run before channels did (00298). */
const channelOfRecipient = (r) => (r.channel === "sms" || r.channel === "email" ? r.channel : "whatsapp");

/**
 * run_counts: each run's people by state, its receipts (a read is WhatsApp's own), what went by each channel, and the
 * threads it reached that the customer answered in their own words within the window after the run first reached them
 * there. A run nobody is on is absent.
 */
function runCountsIn(tables, tenantId, runIds) {
  const wanted = new Set(runIds);
  const out = {};
  const reachedBy = new Map();
  for (const r of tables.broadcast_recipients ?? []) {
    if (r.tenant_id !== tenantId || !wanted.has(r.broadcast_id)) continue;
    const c = (out[r.broadcast_id] ??= {
      queued: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      delivered: 0,
      read: 0,
      replied: 0,
      sent_by: { whatsapp: 0, sms: 0, email: 0 },
    });
    const channel = channelOfRecipient(r);
    if (r.state === "sent") {
      c.sent += 1;
      c.sent_by[channel] += 1;
    } else if (r.state === "queued" || r.state === "skipped" || r.state === "failed") c[r.state] += 1;
    const m = messageOfRecipient(tables, r);
    if (m?.status === "delivered" || m?.status === "read") c.delivered += 1;
    if (m?.status === "read" && channel === "whatsapp") c.read += 1;
    if (m?.conversation_id && r.sent_at) {
      const reached = reachedBy.get(r.broadcast_id) ?? new Map();
      const first = reached.get(m.conversation_id);
      if (first === undefined || Date.parse(r.sent_at) < Date.parse(first)) reached.set(m.conversation_id, r.sent_at);
      reachedBy.set(r.broadcast_id, reached);
    }
  }
  const words = new Map();
  for (const m of tables.messages ?? []) {
    if (m.tenant_id !== tenantId || m.direction !== "inbound" || m.sender !== "customer" || !isPersonsWords(m.meta))
      continue;
    words.set(m.conversation_id, [...(words.get(m.conversation_id) ?? []), m.created_at]);
  }
  for (const [run, reached] of reachedBy) {
    let n = 0;
    for (const [conversation, sentAt] of reached)
      if ((words.get(conversation) ?? []).some((at) => isReplyTo(sentAt, at))) n += 1;
    out[run].replied = n;
  }
  return out;
}

/**
 * playbook_totals: each moment playbook's runs summed through run_counts, its newest run, the run that waits, its newest
 * `history` runs. A column the table defaults (state, recipient_count) is read as the database would fill it.
 */
function playbookTotalsIn(tables, tenantId, history) {
  const moments = new Set(
    (tables.playbooks ?? [])
      .filter((p) => p.tenant_id === tenantId && (p.kind ?? "moment") === "moment")
      .map((p) => p.id),
  );
  const newest = (a, b) =>
    Date.parse(b.created_at) - Date.parse(a.created_at) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
  const runs = (tables.broadcasts ?? [])
    .filter((b) => b.tenant_id === tenantId && moments.has(b.playbook_id))
    .sort(newest);
  const counted = runCountsIn(
    tables,
    tenantId,
    runs.map((b) => b.id),
  );
  const out = {};
  for (const b of runs) {
    const c = counted[b.id] ?? { sent: 0, skipped: 0, failed: 0, delivered: 0, replied: 0 };
    const held = c.skipped + c.failed;
    const state = b.state ?? "scheduled";
    const recipient_count = b.recipient_count ?? 0;
    const run_for = b.run_for ?? null;
    const t = (out[b.playbook_id] ??= {
      runs: 0,
      sent: 0,
      delivered: 0,
      replied: 0,
      held: 0,
      last_run: null,
      waiting: null,
      history: [],
    });
    t.runs += 1;
    t.sent += c.sent;
    t.delivered += c.delivered;
    t.replied += c.replied;
    t.held += held;
    t.last_run ??= { id: b.id, state, run_for, recipient_count };
    if (state === "pending_approval" && !t.waiting) {
      const trigger = typeof b.audience?.trigger === "string" ? b.audience.trigger : null;
      t.waiting = { id: b.id, recipient_count, name: b.name, run_for, trigger };
    }
    if (t.history.length < history)
      t.history.push({
        id: b.id,
        run_for,
        state,
        scheduled_for: b.scheduled_for ?? null,
        recipient_count,
        sent: c.sent,
        held,
        delivered: c.delivered,
        replied: c.replied,
      });
  }
  return out;
}

/** template_sends: each message name a run sent a person on, or the Inbox sent that WhatsApp took, and its latest time. */
function templateSendsIn(tables, tenantId) {
  const nameOf = new Map(
    (tables.broadcasts ?? []).filter((b) => b.tenant_id === tenantId).map((b) => [b.id, b.template_name]),
  );
  const out = {};
  const went = (name, at) => {
    const s = (out[name] ??= { count: 0, last_at: null });
    s.count += 1;
    if (at && (s.last_at === null || Date.parse(at) > Date.parse(s.last_at))) s.last_at = at;
  };
  for (const r of tables.broadcast_recipients ?? []) {
    const name = r.tenant_id === tenantId && r.state === "sent" ? nameOf.get(r.broadcast_id) : null;
    if (name) went(name, r.sent_at ?? null);
  }
  for (const m of tables.messages ?? [])
    if (m.tenant_id === tenantId && m.direction === "outbound" && m.template_name && m.external_id)
      went(m.template_name, m.created_at);
  return out;
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
