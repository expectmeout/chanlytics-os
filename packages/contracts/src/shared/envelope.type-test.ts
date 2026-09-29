/**
 * The API's envelope and its codes, proved where the compiler reads them (envelope.ts, errors.ts): an answer is data
 * only once `ok` says so and an error only once it says not, and a code is one of ERROR_CODES in the envelope, in
 * `err` and in an AppError, or it does not compile. The dashboard's client is held the same way, in
 * apps/dashboard/src/client/api.type-test.ts.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (schema-sets.ts), and each line under `@ts-expect-error <why>`
 * must not compile. One that starts to compile is TS2578, an unused directive, so the package's `tsc --noEmit` fails.
 * Nothing imports this file, so no build reaches it.
 */
import type { Envelope, Err, Ok, err, ok } from "./envelope";
import type { AppError, ERROR_CODES, ErrorCode } from "./errors";
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
