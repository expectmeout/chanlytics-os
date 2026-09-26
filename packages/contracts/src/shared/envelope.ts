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
export const err = (code: ErrorCode, message: string, details?: unknown): Err => ({
  ok: false,
  error: details === undefined ? { code, message } : { code, message, details },
});
