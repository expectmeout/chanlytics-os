import type { ErrorCode } from "./errors";

/** API envelope (Blueprint §4): success {ok:true,data} / error {ok:false,error:{code,...}}. */
export interface Ok<T> {
  ok: true;
  data: T;
}

export interface Err {
  ok: false;
  error: { code: ErrorCode; message: string; details?: unknown };
}

export type Envelope<T> = Ok<T> | Err;

export const ok = <T>(data: T): Ok<T> => ({ ok: true, data });

/**
 * The header every answer of the app plane carries beside the envelope: the server's clock when the request began, in
 * milliseconds. The browser measures by it how far its own clock leads the servers', so the live feed's notices (stamped by
 * the database's clock) are judged by one clock (the wiring's second audit, S2-1). An answer without it measures nothing.
 */
export const SERVED_AT_HEADER = "x-served-at";
export const err = (code: ErrorCode, message: string, details?: unknown): Err => ({
  ok: false,
  error: details === undefined ? { code, message } : { code, message, details },
});
