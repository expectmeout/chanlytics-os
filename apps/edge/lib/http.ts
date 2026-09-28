/**
 * Tiny response helpers for Web-handler functions.
 *
 * A JSON answer's `error` is a code of the edge's closed set, EDGE_ERROR_CODES (contracts' edge-errors.ts): what the
 * dashboard and every other caller compares, never a sentence, never the database's own words. `json` takes no body
 * whose `error` is anything else, so a door cannot answer one, and a value handed on from a module has to be typed a
 * code to reach an answer. `refuse` is the refusal itself, the one envelope every door answers: `{ ok: false, error }`,
 * with the words for a person or for support in `detail`. A door that answers more beside it (the line it read, what
 * the budget is) writes that body by hand through `json`, and its `error` is held all the same.
 * tooling/scripts/tests/edge/error-codes.test.mjs holds the codes to the set over the syntax tree.
 */
import type { EdgeErrorCode, EdgeRefusal } from "./packages/contracts.js";

export function json<B extends object>(status: number, body: B & { readonly error?: EdgeErrorCode }): Response {
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
