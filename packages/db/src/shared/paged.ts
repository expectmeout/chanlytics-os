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
 * (apps/edge/lib/shared/paged.ts).
 *
 * And a bound: no read runs past its cap. What a read stopped there is worth is
 * the caller's to say, every time (ReadNeeds, no default). It used to log a line
 * and hand back the part, which a send, a count or a scrub then took for the
 * whole, so whoever came past the twenty-thousandth row was left out in silence.
 *
 * Workspace scope: no statement of its own; the caller's page() carries the client and the tenant filter, this only pages it.
 */
import { dbLog } from "./observe";
import { DbFailure } from "@chanlytics/contracts";

/** `api.max_rows` in supabase/config.toml. A page is a whole one or the last one. */
export const MAX_ROWS = 1000;

/** More than any workspace holds today; a bound so a runaway read cannot exhaust a lambda. */
export const DEFAULT_ROW_CAP = 20_000;

export interface Page<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * What a read stopped at its cap means to the one who asked, said at every call with no default: a default is how a
 * caller that never thought about it reads a part as the whole.
 *
 * - `whole`: something is done with every row (who gets a message, who is counted, what is erased, exported or
 *   announced), so a read stopped at its cap is no answer. It throws ReadCutShort, and the act stops there.
 * - `part`: the rows are a list a person reads, each row true on its own. At its cap it answers the rows it read and
 *   says so (`capped`), so its caller can say it, or leave it unsaid and say why.
 */
export type ReadNeeds = "whole" | "part";

/** A read a part will do: the rows, up to the cap, and whether more matched than it read. */
export interface PartRead<T> {
  rows: T[];
  /** More rows matched than the cap let it read: these are a part, never to be counted from. */
  capped: boolean;
}

/** Says a read stopped at its cap, once, where the runtime logs: the edge passes its own logger. */
export type CappedLine = (read: string, cap: number, needs: ReadNeeds) => void;

const sayCapped: CappedLine = (read, cap, needs) => dbLog().error("paged_read_capped", { what: read, cap, needs });

const READ_CUT_SHORT = Symbol.for("@chanlytics/db:ReadCutShort");

/**
 * A read that had to be whole, refused at its cap: more rows matched than it may read, so nothing was done with any of
 * them. `what` says which read, `cap` how far it went. Marked as DbFailure is, so every copy of this module recognises
 * every other. The dashboard says it to an owner in their words (with-route.ts readCutShortRefusal); anywhere else it is
 * a failure like any other, logged by whatever ran it, after the pager's own line.
 */
export class ReadCutShort extends Error {
  readonly what: string;
  readonly cap: number;

  constructor(read: string, cap: number) {
    super(`${read}: more than ${cap} rows matched a read that must be whole; nothing was done with them`);
    this.name = "ReadCutShort";
    this.what = read;
    this.cap = cap;
    Object.defineProperty(this, READ_CUT_SHORT, { value: true });
  }

  /** `e instanceof ReadCutShort` is true for one made by any copy of this class. */
  static override [Symbol.hasInstance](value: unknown): value is ReadCutShort {
    return typeof value === "object" && value !== null && Object.hasOwn(value, READ_CUT_SHORT);
  }
}

/** Refuses a caller that did not say what the cap means: the types hold a TypeScript caller to it, this a script's. */
function holdToNeeds(text: string, needs: unknown): void {
  if (needs !== "whole" && needs !== "part")
    throw new TypeError(`${text}: say whether the read must be whole or a part will do`);
}

/**
 * A read's answer as its caller said it needs it: the rows, or a refusal at the cap; or the part, marked. `out` holds
 * the rows read, to one row past `cap` at most: each reader asks for that one row more, so a read of exactly `cap` rows
 * is whole and only one that finds a row more is cut.
 */
function answerAsNeeded<T>(
  text: string,
  out: T[],
  needs: ReadNeeds,
  cap: number,
  onCapped: CappedLine,
): T[] | PartRead<T> {
  const capped = out.length > cap;
  if (capped) onCapped(text, cap, needs);
  if (needs === "part") return { rows: capped ? out.slice(0, cap) : out, capped };
  if (capped) throw new ReadCutShort(text, cap);
  return out;
}

/**
 * Every row the query matches, a page at a time.
 *
 * `page(from, to)` must apply `.range(from, to)` to an otherwise complete, stably ordered query. Throws on a read error
 * (a caller that must not fail catches, the way the budget's does). `needs` says what a read stopped at `cap` means
 * (ReadNeeds): `whole` answers the rows or throws ReadCutShort, `part` answers the rows it read and whether it was cut.
 */
export function readAllRows<T>(
  text: string,
  page: (from: number, to: number) => PromiseLike<Page<T>>,
  needs: "whole",
  cap?: number,
  onCapped?: CappedLine,
): Promise<T[]>;
export function readAllRows<T>(
  text: string,
  page: (from: number, to: number) => PromiseLike<Page<T>>,
  needs: "part",
  cap?: number,
  onCapped?: CappedLine,
): Promise<PartRead<T>>;
export async function readAllRows<T>(
  text: string,
  page: (from: number, to: number) => PromiseLike<Page<T>>,
  needs: ReadNeeds,
  cap = DEFAULT_ROW_CAP,
  onCapped: CappedLine = sayCapped,
): Promise<T[] | PartRead<T>> {
  holdToNeeds(text, needs);
  const out: T[] = [];
  while (out.length <= cap) {
    const size = Math.min(MAX_ROWS, cap + 1 - out.length);
    const { data, error } = await page(out.length, out.length + size - 1);
    if (error) throw new DbFailure(error, `${text}`);
    const rows = data ?? [];
    for (const row of rows) out.push(row);
    if (rows.length < size) break;
  }
  return answerAsNeeded(text, out, needs, cap, onCapped);
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
 * or removed during the read then cost nothing but themselves. Errors, `needs`
 * and the cap behave as in `readAllRows`.
 */
export function readAllRowsByKey<T>(
  text: string,
  key: (row: T) => string,
  page: (after: string | null, size: number) => PromiseLike<Page<T>>,
  needs: "whole",
  cap?: number,
  onCapped?: CappedLine,
): Promise<T[]>;
export function readAllRowsByKey<T>(
  text: string,
  key: (row: T) => string,
  page: (after: string | null, size: number) => PromiseLike<Page<T>>,
  needs: "part",
  cap?: number,
  onCapped?: CappedLine,
): Promise<PartRead<T>>;
export async function readAllRowsByKey<T>(
  text: string,
  key: (row: T) => string,
  page: (after: string | null, size: number) => PromiseLike<Page<T>>,
  needs: ReadNeeds,
  cap = DEFAULT_ROW_CAP,
  onCapped: CappedLine = sayCapped,
): Promise<T[] | PartRead<T>> {
  holdToNeeds(text, needs);
  const out: T[] = [];
  let after: string | null = null;
  while (out.length <= cap) {
    const size = Math.min(MAX_ROWS, cap + 1 - out.length);
    const { data, error } = await page(after, size);
    if (error) throw new DbFailure(error, `${text}`);
    const rows = data ?? [];
    for (const row of rows) out.push(row);
    const last = rows.at(-1);
    if (rows.length < size || last === undefined) break;
    after = key(last);
  }
  return answerAsNeeded(text, out, needs, cap, onCapped);
}
