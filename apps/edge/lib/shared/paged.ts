/**
 * Reading a whole answer out of PostgREST, which does not give you one: the
 * one pager (packages/db paged.ts, where the reason is written), with a
 * capped read said through the edge's logger -- a bare console line is one
 * no query returns and no tenant can be joined to.
 */
import {
  DEFAULT_ROW_CAP,
  MAX_ROWS,
  readAllRows as readAll,
  type CappedLine,
  type Page,
  type PartRead,
} from "@chanlytics/db/shared";
import { logger } from "./log.js";

export { DEFAULT_ROW_CAP, MAX_ROWS };

const sayCapped: CappedLine = (read, cap, needs) => logger().error("paged_read_capped", { what: read, cap, needs });

/**
 * Every row the query matches, a page at a time (packages/db readAllRows). `needs` says what a read stopped at `cap`
 * means: `whole` throws ReadCutShort there, `part` answers the rows it read, marked; either is logged.
 */
export function readAllRows<T>(
  text: string,
  page: (from: number, to: number) => PromiseLike<Page<T>>,
  needs: "whole",
  cap?: number,
): Promise<T[]>;
export function readAllRows<T>(
  text: string,
  page: (from: number, to: number) => PromiseLike<Page<T>>,
  needs: "part",
  cap?: number,
): Promise<PartRead<T>>;
export function readAllRows<T>(
  text: string,
  page: (from: number, to: number) => PromiseLike<Page<T>>,
  needs: "whole" | "part",
  cap = DEFAULT_ROW_CAP,
): Promise<T[] | PartRead<T>> {
  return needs === "part" ? readAll(text, page, needs, cap, sayCapped) : readAll(text, page, needs, cap, sayCapped);
}
