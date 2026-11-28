/**
 * A workspace's long history deleted a slice at a time (tooling/scripts/ops/delete-tenant.mjs).
 *
 * The script's statements go through PostgREST as the service role, which ends one at 30 seconds (00283). The history's
 * delete and the workspace's own were one statement each, so a workspace with years behind it timed out and had to be
 * finished by hand from psql. Here no statement takes a whole history:
 *   - `events` goes a month at a time, the stretches the backup read it by; it is partitioned by month, so a stretch is
 *     one partition's rows;
 *   - the tables that grow with history (EMPTIED_FIRST) go by key, some pages of the backup's read at a time, before the
 *     workspace's own delete, whose cascade then has little left to walk;
 *   - a slice that still ends at its time is cut in two and each half tried, down to a floor.
 * A short history is deleted as it always was, in the one statement.
 *
 * Plain Node, as the script is: it imports nothing of the app's.
 */
import { byKey, within } from "./reads.mjs";
import { keyOf } from "./tables.mjs";

/** The rows past which a table is deleted in slices: under it, one statement is well inside its time. */
export const SLICED_PAST = 5_000;
/** The pages of the backup's read one delete by key takes to begin with (a page is 1,000 rows). */
const PAGES_A_SLICE = 5;
/** The shortest stretch of history a delete is cut down to. */
const SHORTEST_STRETCH_MS = 60_000;
/** Postgres's code for a statement its role's time ended. */
const PAST_ITS_TIME = "57014";

const pastItsTime = (error) => error.code === PAST_ITS_TIME || /statement timeout/i.test(error.message ?? "");

/**
 * A delete run over a whole slice, and over its halves where the statement's time ended it, and theirs. Answers null
 * once every part is gone, or the words of the error that stopped it.
 */
async function inHalves(slice, run, halve) {
  const error = await run(slice);
  if (!error) return null;
  if (!pastItsTime(error)) return error.message;
  const halves = halve(slice);
  if (!halves) return `${error.message}, at the smallest slice this script cuts`;
  for (const half of halves) {
    const stopped = await inHalves(half, run, halve);
    if (stopped) return stopped;
  }
  return null;
}

/** A stretch of time cut in two at its middle; null for one with an open end, or too short to cut. */
function halveStretch({ from, to }) {
  if (!from || !to) return null;
  const [start, end] = [Date.parse(from), Date.parse(to)];
  if (end - start < 2 * SHORTEST_STRETCH_MS) return null;
  const middle = new Date(start + Math.floor((end - start) / 2)).toISOString();
  return [
    { from, to: middle },
    { from: middle, to },
  ];
}

/**
 * The workspace's history deleted: past SLICED_PAST rows a month at a time (`months`, the stretches that held rows when
 * it was read), then whatever is left in one statement, which for a short history is all of it. Answers `{ error }`, or
 * `{ late }`: how many rows went that the backup did not read, written after it.
 */
export async function deleteHistory(db, tenantId, months, read) {
  const sliced = read > SLICED_PAST;
  if (sliced)
    for (const month of months) {
      const error = await inHalves(
        month,
        async (stretch) => (await within(db.from("events").delete().eq("tenant_id", tenantId), stretch)).error,
        halveStretch,
      );
      if (error) return { error };
    }
  const { count, error } = await db.from("events").delete({ count: "exact" }).eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  return { late: Math.max((count ?? 0) - (sliced ? 0 : read), 0), error: null };
}

/**
 * One table's rows of the workspace deleted by key before the workspace's own delete: up to the end of some pages of
 * the backup's read at a time (`ends`, each page's last key, in order). Answers null, or the words of what stopped it.
 */
export async function emptyFirst(db, tenantId, table, ends) {
  const key = keyOf(table);
  const upTo = async ({ last }) =>
    (await byKey(db.from(table).delete().eq("tenant_id", tenantId), key, ends[last], { upTo: true })).error;
  const halve = ({ first, last }) => {
    if (first === last) return null;
    const middle = first + Math.floor((last - first) / 2);
    return [
      { first, last: middle },
      { first: middle + 1, last },
    ];
  };
  for (let first = 0; first < ends.length; first += PAGES_A_SLICE) {
    const error = await inHalves({ first, last: Math.min(first + PAGES_A_SLICE, ends.length) - 1 }, upTo, halve);
    if (error) return error;
  }
  return null;
}
