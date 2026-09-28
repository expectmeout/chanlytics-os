/**
 * Tiny response helpers for Web-handler functions.
 *
 * A JSON answer's `error` is a code of the edge's closed set, EDGE_ERROR_CODES (contracts' edge-errors.ts): what the
 * dashboard and every other caller compares, never a sentence, never the database's own words. `json` takes no body
 * whose `error` is anything else, so a door cannot answer one, and a value handed on from a module has to be typed a
 * code to reach an answer; a body typed with an index signature names its `error` too, or tsc would let any value
 * through it. `refuse` is the plain refusal, `{ ok: false, error }` with the words for a person or for support in
 * `detail`. A door that answers more beside it (the line it read, what the budget is) writes that body by hand through
 * `json`, and its `error` is held all the same. tooling/scripts/tests/edge/error-codes.test.mjs holds the codes to the
 * set over the syntax tree.
 */
import type { EdgeErrorCode, EdgeRefusal } from "./packages/contracts.js";

/** The keys a type names, its index signatures left out. */
type NamedKeys<B> = keyof { [K in keyof B as string extends K ? never : number extends K ? never : K]: B[K] };

/**
 * An index signature (`Record<string, unknown>`) says nothing about `error`, and tsc passes whatever the body holds
 * there: a body typed with one names its `error`, a code, or `never` where it is not a refusal.
 */
type ErrorNamed<B> = string extends keyof B
  ? "error" extends NamedKeys<B>
    ? unknown
    : "a body typed with an index signature names its `error`: a code, or never"
  : unknown;

export function json<B extends object>(
  status: number,
  body: B & { readonly error?: EdgeErrorCode } & ErrorNamed<B>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A refusal: the code a caller compares, and the words for a person or for support when there are any. */
export function refuse(status: number, code: EdgeErrorCode, detail?: string): Response {
  const body: EdgeRefusal = detail === undefined ? { ok: false, error: code } : { ok: false, error: code, detail };
  return json(status, body);
}

export function text(status: number, body: string, headers?: Record<string, string>): Response {
  return new Response(body, { status, headers });
}
