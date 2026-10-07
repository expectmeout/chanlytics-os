/**
 * The API's envelope and its codes, proved where the compiler reads them (envelope.ts, errors.ts): an answer is data
 * only once `ok` says so and an error only once it says not, and a code is one of ERROR_CODES in the envelope, in
 * `err` and in an AppError, or it does not compile. The dashboard's client is held the same way, in
 * apps/dashboard/src/client/api.type-test.ts. And the edge's envelope one level down (edge-errors.ts): an edge
 * answer's code, as the dashboard reads it, is a door's code or the call's own, and a comparison with any other does
 * not compile.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (schema-sets.ts), and each line under `@ts-expect-error <why>`
 * must not compile. One that starts to compile is TS2578, an unused directive, so the package's `tsc --noEmit` fails.
 * Nothing imports this file, so no build reaches it.
 */
import type { Envelope, Err, Ok, err, ok } from "./envelope";
import type { AppError, ERROR_CODES, ErrorCode } from "./errors";
import type { EDGE_ERROR_CODES, EdgeAnswerBody, EdgeAnswerCode, EdgeCallCode, EdgeErrorCode } from "./edge-errors";
import type { Exactly, Holds, Within } from "./schema-sets";

type Answer = Envelope<{ id: string }>;

type _Envelope = [
  // ok and err make the two halves, and narrowing on ok picks one: data on the one, an error on the other.
  Holds<Exactly<ReturnType<typeof ok<{ id: string }>>, Ok<{ id: string }>>>,
  Holds<Exactly<ReturnType<typeof err>, Err>>,
  Holds<Exactly<Extract<Answer, { ok: true }>, Ok<{ id: string }>>>,
  Holds<Exactly<Extract<Answer, { ok: false }>, Err>>,
  // The codes are ERROR_CODES: in the envelope, where an error is made, and on the class a refusal is thrown as.
  Holds<Exactly<ErrorCode, (typeof ERROR_CODES)[number]>>,
  Holds<Exactly<Err["error"]["code"], ErrorCode>>,
  Holds<Exactly<Parameters<typeof err>[0], ErrorCode>>,
  Holds<Exactly<ConstructorParameters<typeof AppError>[0], ErrorCode>>,
  Holds<Exactly<AppError["code"], ErrorCode>>,
  // @ts-expect-error had ok answered any, the first positive would read so, and Exactly refuses any
  Holds<Exactly<any, Ok<{ id: string }>>>,
  // @ts-expect-error had Err's code or AppError's been typed any, their positives would read so: any is no ErrorCode
  Holds<Exactly<any, ErrorCode>>,
  // @ts-expect-error a code outside ERROR_CODES is not an ErrorCode: no client has words for it
  Holds<Within<"teapot", ErrorCode>>,
  // @ts-expect-error nor may an error be made with one
  Holds<Within<"teapot", Parameters<typeof err>[0]>>,
  // @ts-expect-error nor a refusal thrown with one
  Holds<Within<"teapot", ConstructorParameters<typeof AppError>[0]>>,
  // @ts-expect-error a success is not an error
  Holds<Within<Ok<{ id: string }>, Err>>,
];

/** Never called: the compiler reads it, and nothing runs it. */
function _readsAnAnswer(answer: Answer): string {
  // @ts-expect-error an answer is data only once ok says so: an Err carries none
  void answer.data;
  // @ts-expect-error and an error only once it says not
  void answer.error;
  return answer.ok ? answer.data.id : answer.error.code;
}

type _EdgeAnswer = [
  // A door's codes are EDGE_ERROR_CODES; the call's own are the four no door answers; an answer's code is either.
  Holds<Exactly<EdgeErrorCode, (typeof EDGE_ERROR_CODES)[number]>>,
  Holds<Exactly<EdgeCallCode, "edge_timeout" | "edge_unreachable" | "no_edge_credential" | "preview">>,
  Holds<Exactly<EdgeAnswerCode, EdgeErrorCode | EdgeCallCode>>,
  Holds<Exactly<EdgeAnswerBody["error"], EdgeAnswerCode | undefined>>,
  Holds<Exactly<EdgeAnswerBody["detail"], string | undefined>>,
  // @ts-expect-error a call's own code is no door's: the edge never answers one, and error-codes.test.mjs holds that
  Holds<Within<"edge_timeout", EdgeErrorCode>>,
  // @ts-expect-error a code no set names is no answer's code
  Holds<Within<"no_line_providers", EdgeAnswerCode>>,
  // @ts-expect-error had the body's code been typed as any string, its positive would read so
  Holds<Exactly<string | undefined, EdgeAnswerBody["error"]>>,
];

/** Never called: the compiler reads it, and nothing runs it. */
function _readsAnEdgeAnswer(body: EdgeAnswerBody): boolean {
  // @ts-expect-error a code the edge renamed, compared where the dashboard reads it, no longer compiles
  void (body.error === "no_line_providers");
  return body.error === "no_line_provider" || body.error === "edge_unreachable" || body.error === "preview";
}
