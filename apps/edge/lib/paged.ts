/**
 * Reading a whole answer out of PostgREST, which does not give you one: the
 * one pager (packages/db paged.ts, where the reason is written), with a
 * capped read said through the edge's logger -- a bare console line is one
 * no query returns and no tenant can be joined to.
 */
import { DEFAULT_ROW_CAP, MAX_ROWS, readAllRows as readAll, type Page } from "./packages/db.js";
import { logger } from "./log.js";

export { DEFAULT_ROW_CAP, MAX_ROWS };

/** Every row the query matches, a page at a time (packages/db readAllRows); hitting `cap` is logged, never thrown. */
export function readAllRows<T>(
  what: string,
  page: (from: number, to: number) => PromiseLike<Page<T>>,
  cap = DEFAULT_ROW_CAP,
): Promise<T[]> {
  return readAll(what, page, cap, (w, c) => logger().error("paged_read_capped", { what: w, cap: c }));
}
