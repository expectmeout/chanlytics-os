/**
 * Reading a whole answer out of PostgREST, which does not give you one.
 *
 * `api.max_rows` (supabase/config.toml) caps EVERY response at 1000 rows, and
 * it does it silently: no error, no flag, no partial-content status the client
 * library surfaces — a query matching 4000 rows answers with 1000 and looks
 * exactly like a query matching 1000. A `.limit(2000)` does not raise the cap
 * either; it lowers a ceiling that is already lower.
 *
 * So an unbounded read is not "read everything", it is "read the first
 * thousand and believe it", and the reads that were written that way are the
 * ones that go quietly wrong as a workspace grows: a touch history that stops
 * holding the week's breath, a set of seen reviews that starts re-announcing
 * old reviews as new, the people on a saved list that stop counting past the
 * thousandth. Each of those is correct on every small workspace and wrong on
 * exactly the large ones nobody tests against.
 *
 * `readAllRows` pages until the answer is short, so the caller gets the whole
 * set or a loud line saying it did not. The caller MUST order by something
 * unique — a range over an unstable order repeats and skips rows across page
 * boundaries — which is why every call site names a tiebreak column. One
 * pager for the edge and the dashboard: the edge wraps it with its own logger
 * (apps/edge/lib/paged.ts).
 */
import { dbLog } from "./observe";

/** `api.max_rows` in supabase/config.toml. A page is a whole one or the last one. */
export const MAX_ROWS = 1000;

/** More than any workspace holds; a bound so a runaway read cannot exhaust a lambda. */
export const DEFAULT_ROW_CAP = 20_000;

export interface Page<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Every row the query matches, a page at a time.
 *
 * `page(from, to)` must apply `.range(from, to)` to an otherwise complete,
 * stably ordered query. Throws on a read error — a caller that must not fail
 * catches, the way the budget's does. Hitting `cap` is reported through
 * `onCapped` rather than thrown: a truncated answer that says so beats both a
 * silent one and an outage.
 */
export async function readAllRows<T>(
  what: string,
  page: (from: number, to: number) => PromiseLike<Page<T>>,
  cap = DEFAULT_ROW_CAP,
  onCapped: (what: string, cap: number) => void = (w, c) => dbLog().error("paged_read_capped", { what: w, cap: c }),
): Promise<T[]> {
  const out: T[] = [];
  while (out.length < cap) {
    const size = Math.min(MAX_ROWS, cap - out.length);
    const { data, error } = await page(out.length, out.length + size - 1);
    if (error) throw new Error(`${what}: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < size) return out;
  }
  onCapped(what, cap);
  return out;
}

/**
 * Every row the query matches, each page read after the last row of the one before.
 *
 * `readAllRows` pages by offset, which is exact only while nothing is deleted:
 * a row removed during the read moves every later row back one place, and the
 * row that crosses the page boundary is never read. A read that must see every
 * row of a table something deletes from pages by key instead. `page(after, size)`
 * must order by the column `key` reads, which must be unique, and return at most
 * `size` rows past `after` (from the first row when `after` is null). Rows added
 * or removed during the read then cost nothing but themselves. Errors and the cap
 * behave as in `readAllRows`.
 */
export async function readAllRowsByKey<T>(
  what: string,
  key: (row: T) => string,
  page: (after: string | null, size: number) => PromiseLike<Page<T>>,
  cap = DEFAULT_ROW_CAP,
  onCapped: (what: string, cap: number) => void = (w, c) => dbLog().error("paged_read_capped", { what: w, cap: c }),
): Promise<T[]> {
  const out: T[] = [];
  let after: string | null = null;
  while (out.length < cap) {
    const size = Math.min(MAX_ROWS, cap - out.length);
    const { data, error } = await page(after, size);
    if (error) throw new Error(`${what}: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    const last = rows.at(-1);
    if (rows.length < size || last === undefined) return out;
    after = key(last);
  }
  onCapped(what, cap);
  return out;
}
