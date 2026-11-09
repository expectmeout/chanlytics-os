import type { ErrorCode, ErrorDetails } from "./errors";

/** API envelope (Blueprint §4): success {ok:true,data} / error {ok:false,error:{code,...}}. */
export interface Ok<T> {
  ok: true;
  data: T;
}

export interface Err {
  ok: false;
  error: { code: ErrorCode; message: string; details?: ErrorDetails };
}

export type Envelope<T> = Ok<T> | Err;

/**
 * Where a page of results ended, said one way across the app (decision 0111): how many a page holds, whether another
 * follows, and the cursor that asks for it (`null` on the last page). A cursor says where a page ended, never how far down
 * it started, so a page is read from its index and not from the top of the list. `total` only where a page shows a count.
 */
export interface PageInfo {
  limit: number;
  has_more: boolean;
  next_cursor: string | null;
  total?: number;
}

export const ok = <T>(data: T): Ok<T> => ({ ok: true, data });

/**
 * The header every answer of the app plane carries beside the envelope: the server's clock when the request began, in
 * milliseconds. The browser measures by it how far its own clock leads the servers', so the live feed's notices (stamped by
 * the database's clock) are judged by one clock (the wiring's second audit, S2-1). An answer without it measures nothing.
 */
export const SERVED_AT_HEADER = "x-served-at";
export const err = (code: ErrorCode, message: string, details?: ErrorDetails): Err => ({
  ok: false,
  error: details === undefined ? { code, message } : { code, message, details },
});
