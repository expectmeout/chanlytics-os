/**
 * A workspace's rows, read whole (tooling/scripts/ops/delete-tenant.mjs).
 *
 * PostgREST answers a read with at most 1,000 rows however many were asked for, and says nothing when it stops there.
 * So no table is read in one call. Each is read a page at a time in the order of its own key, every page starting past
 * the last row of the one before, until a page comes back empty: a row cap of any size ends no read early, and a row
 * that was there for the whole read is read exactly once whatever is written beside it. The exact count is asked
 * before the read and after it, and a read with fewer rows than both is a refusal, never a smaller backup.
 *
 * Plain Node, as the script is: it imports nothing of the app's.
 */
import { closeSync, ftruncateSync, openSync, renameSync, rmSync, writeSync } from "node:fs";
import { READ_AGAIN, TABLES, keyOf } from "./tables.mjs";

/** The rows one read asks for: PostgREST's own most. */
const READ_PAGE = 1000;
/** How many times a table is read before the delete gives up on a count that will not agree. */
const READ_TRIES = 3;

/**
 * A value as an `or` filter carries it: bare where it is an id, a day, a time or a plain word, and quoted, its quotes
 * and backslashes escaped, where it holds anything PostgREST could read as the filter's own (a comma, a bracket, a space).
 */
const inOr = (value) => {
  const text = String(value);
  return /^[A-Za-z0-9_.:+@-]+$/.test(text) ? text : `"${text.replace(/[\\"]/g, "\\$&")}"`;
};

/**
 * A query narrowed to the rows past a place in its key's order, or with `upTo` to the rows up to and including it. A
 * key of two columns is compared as a pair: past the first, or at the first and past the second.
 */
export function byKey(query, key, place, { upTo = false } = {}) {
  const [a, b] = key;
  const [x, y] = place;
  if (key.length === 1) return upTo ? query.lte(a, x) : query.gt(a, x);
  const at = `${a}.eq.${inOr(x)}`;
  return query.or(
    upTo
      ? `${a}.lt.${inOr(x)},and(${at},${b}.lt.${inOr(y)}),and(${at},${b}.eq.${inOr(y)})`
      : `${a}.gt.${inOr(x)},and(${at},${b}.gt.${inOr(y)})`,
  );
}

/** A query narrowed to a stretch of time, either end open. */
export function within(query, stretch) {
  let out = query;
  if (stretch?.from) out = out.gte("created_at", stretch.from);
  if (stretch?.to) out = out.lt("created_at", stretch.to);
  return out;
}

/**
 * One table's rows of one workspace, each page handed to `take` as it is read, with the key of its last row. Answers
 * how many rows it read, or the error that stopped it.
 */
async function readWhole(db, table, tenantId, take, stretch = null) {
  const key = keyOf(table);
  let read = 0;
  for (let place = null; ;) {
    let query = within(db.from(table).select("*").eq("tenant_id", tenantId), stretch);
    if (place) query = byKey(query, key, place);
    for (const column of key) query = query.order(column, { ascending: true });
    const { data, error } = await query.limit(READ_PAGE);
    if (error) return { read, error: error.message };
    const rows = data ?? [];
    if (!rows.length) return { read, error: null };
    place = key.map((column) => rows.at(-1)[column]);
    if (place.some((value) => value == null))
      return { read, error: `a row has no ${key.join(", ")}, which its pages are read by` };
    take(rows, place);
    read += rows.length;
    // One row a workspace: there is no next page to ask for.
    if (!key.length) return { read, error: null };
  }
}

/** How many rows of one workspace a table holds, counted by the database. */
async function countOf(db, table, tenantId) {
  const { count, error, status } = await db
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  // A refused HEAD carries no body, so no message: its status is what there is to say.
  if (error) return { count: null, error: error.message || `the count was refused (${status ?? "no status"})` };
  return { count: count ?? 0, error: null };
}

const monthStart = (ms) => {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};
const nextMonth = (ms) => {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
};

/**
 * The stretches a workspace's history is read and deleted by, in order: everything before the month it began in, each
 * month since, and everything after this one. `events` is partitioned by month, so a stretch reads one partition, and
 * the two open ends take a row whose date is outside the workspace's own life.
 */
function monthsOf(beganIso, nowMs = Date.now()) {
  const began = Date.parse(beganIso ?? "");
  const first = monthStart(Number.isFinite(began) ? Math.min(began, nowMs) : nowMs);
  const out = [{ from: null, to: new Date(first).toISOString() }];
  for (let at = first; at <= nowMs; at = nextMonth(at))
    out.push({ from: new Date(at).toISOString(), to: new Date(nextMonth(at)).toISOString() });
  out.push({ from: out.at(-1).to, to: null });
  return out;
}

/**
 * A file written a piece at a time from a place of its own, so a table read a second time is written over its first
 * read. Closed, it ends where the last write did.
 */
function pieceFile(path) {
  const fd = openSync(path, "w");
  let at = 0;
  return {
    place: () => at,
    backTo: (place) => {
      at = place;
    },
    write: (text) => {
      at += writeSync(fd, text, at, "utf8");
    },
    close: () => {
      ftruncateSync(fd, at);
      closeSync(fd);
    },
  };
}

/**
 * One table read once, into the backup from where the file stands: its rows, how many, the key at the end of each page
 * (`ends`, what a delete in slices is cut by), and for `events` how many each month held.
 */
async function readTable(db, table, tenant, file, held) {
  const out = { read: 0, ends: [], months: [], error: null };
  const take = (rows, place) => {
    file.write(rows.map((row) => JSON.stringify({ table, row })).join("\n") + "\n");
    out.ends.push(place);
    if (held) held.push(...rows);
  };
  const stretches = table === "events" ? monthsOf(tenant.created_at) : [null];
  for (const stretch of stretches) {
    const { read, error } = await readWhole(db, table, tenant.id, take, stretch);
    if (error) return { ...out, error };
    if (stretch && read) out.months.push({ ...stretch, rows: read });
    out.read += read;
  }
  return out;
}

/**
 * One table read and counted until the two agree: `{ read, ends, months, held, moved }`, or `{ refusal }` in the
 * script's words. A read short of both counts is a hole and is always refused. With `still`, the delete's own snapshot,
 * the read and both counts must be one number; without it, a table written to while it was read is said (`moved`) and
 * taken, since a dry run looks at a workspace that is still working.
 */
async function readCounted(db, table, tenant, file, still) {
  const start = file.place();
  let last = null;
  for (let attempt = 0; attempt < READ_TRIES; attempt++) {
    // A read tried again starts the table's lines again, in the file and in what is held.
    file.backTo(start);
    const held = READ_AGAIN.includes(table) ? [] : null;
    const before = await countOf(db, table, tenant.id);
    if (before.error) return { refusal: `could not read ${table}: ${before.error}` };
    const got = await readTable(db, table, tenant, file, held);
    if (got.error) return { refusal: `could not read ${table}: ${got.error}` };
    const after = await countOf(db, table, tenant.id);
    if (after.error) return { refusal: `could not read ${table}: ${after.error}` };
    last = { ...got, held, before: before.count, after: after.count };
    const whole = got.read >= Math.min(before.count, after.count);
    const same = got.read === before.count && got.read === after.count;
    if (same || (whole && !still)) return { ...last, moved: !same };
  }
  const counts = `${last.before} rows counted before the read, ${last.read} read, ${last.after} counted after`;
  return last.read < Math.min(last.before, last.after)
    ? { refusal: `the read of ${table} stopped short: ${counts}. A backup with a hole in it reads as complete.` }
    : {
        refusal: `${table} is still being written to: ${counts}. Nothing is deleted while its backup would be behind.`,
      };
}

/**
 * Every table read whole into the backup at `path`, the file put in place only once all of them are: `{ total, tally,
 * rows, ends, months, moved }`, or `{ refusal }`. `rows` holds the tables the delete reads again (READ_AGAIN), `ends`
 * each table's page ends, `months` the history's stretches that held rows, `moved` the tables written to meanwhile.
 */
export async function snapshot(db, tenant, path, { still = false } = {}) {
  const partial = `${path}.part`;
  const file = pieceFile(partial);
  const out = { total: 0, tally: [], rows: new Map(), ends: new Map(), months: [], moved: [] };
  let refusal = null;
  try {
    for (const table of TABLES) {
      const got = await readCounted(db, table, tenant, file, still);
      if (got.refusal) {
        refusal = got.refusal;
        break;
      }
      out.rows.set(table, got.held ?? []);
      out.ends.set(table, got.ends);
      if (table === "events") out.months = got.months;
      if (got.moved) out.moved.push([table, got.before, got.read, got.after]);
      if (got.read) out.tally.push([table, got.read]);
      out.total += got.read;
    }
  } finally {
    file.close();
  }
  // A read that was refused leaves no file that could be taken for a backup.
  if (refusal) {
    rmSync(partial, { force: true });
    return { refusal };
  }
  renameSync(partial, path);
  return out;
}
