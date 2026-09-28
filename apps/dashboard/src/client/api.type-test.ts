/**
 * What a route takes and answers, proved where the compiler reads it. A handler made by `read` or `write`
 * (server/route.ts) carries its schema's input and its handle's output as a phantom `Shape`; the generated registry
 * (routes.generated.ts) keys each handler; and the typed client (api.ts) reads both from the key. So a call through
 * the client (`api`, and `api.raw`) stops compiling when it leaves out the options a route needs, when its path lacks
 * its parameters or its write the body the schema declares, when the body falls short of the schema or carries a
 * field the route never reads, and when it puts a body on a read or a query on a write; and an answer is read as data
 * only once `ok` says there is some. Two things it does not hold: options handed on as `undefined`, as a courier
 * that takes them optionally does (the shell's `read`), and `api.url`, which builds a link from what it is given
 * (the shell's `href` hands on a page's).
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts), and each line under
 * `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. Nothing imports this file, so no bundle reaches it: the client below is a
 * parameter of a function nothing calls.
 */
import type { Exactly, Holds, Ok, Within } from "@chanlytics/contracts";
import type { SnoozeResult } from "@chanlytics/core";
import type { InputOf, OutputOf, Shape } from "../server/route";
import type { Api, ApiRefusal, ApiResult, Input, Output, Params } from "./api";
import type { Routes } from "./routes.generated";

/** The canonical write (CLAUDE.md): its schema takes `{ until }`, and it answers what core's snooze returns. */
type Snooze = "POST conversations/[id]/snooze";
/** A read whose schema is its query. */
type Inbox = "GET conversations";
/** A write that declares no schema. */
type Wake = "POST conversations/[id]/wake";
/** What Next calls: the phantom leaves the handler as it was. */
type NextHandler = (req: Request, ctx: { params: Promise<Record<string, string | string[] | undefined>> }) => unknown;

type _Shapes = [
  // Shape is a phantom: InputOf and OutputOf read back what it was given, and the handler is still what Next calls.
  Holds<Exactly<InputOf<Shape<{ until: string }, SnoozeResult>>, { until: string }>>,
  Holds<Exactly<OutputOf<Shape<{ until: string }, SnoozeResult>>, SnoozeResult>>,
  Holds<Within<Routes[Snooze], NextHandler>>,
  // The registry's handler carries its route's: the schema's input and the verb's answer, never a promise of it.
  Holds<Exactly<InputOf<Routes[Snooze]>, { until: string }>>,
  Holds<Exactly<OutputOf<Routes[Snooze]>, SnoozeResult>>,
  // The client reads them by key: a write's body, a read's query (none without a schema), a path's parameters.
  Holds<Exactly<Input<Snooze>, { until: string }>>,
  Holds<Exactly<Output<Snooze>, SnoozeResult>>,
  Holds<Exactly<Input<Inbox>, { ids?: string | undefined }>>,
  Holds<Exactly<Input<Wake>, undefined>>,
  Holds<Exactly<Params<Snooze>, { id: string }>>,
  // The client's success is the envelope withRoute sends (contracts' ok), and its refusal a Refusal in words.
  Holds<Exactly<Extract<ApiResult<SnoozeResult>, { ok: true }>, Ok<SnoozeResult>>>,
  Holds<Exactly<Extract<ApiResult<SnoozeResult>, { ok: false }>, ApiRefusal>>,
  // @ts-expect-error a key the registry does not hold is not a route: a typo stops here, not at a 404
  Input<"POST conversations/[id]/snoze">,
  // @ts-expect-error what a route answers is the handler's value, never the promise of it
  Holds<Within<Output<Snooze>, Promise<unknown>>>,
];

/** Never called: the compiler reads it, and nothing runs it. */
async function _sendsAndReads(api: Api, id: string, until: string): Promise<void> {
  const answer = await api("POST conversations/[id]/snooze", { params: { id }, body: { until } });
  type _Sent = Holds<Exactly<typeof answer, ApiResult<SnoozeResult>>>;
  // What a route needs is exactly what it declares: a read with no parameters needs no options, and a write that
  // declares no schema no body.
  void api("GET conversations");
  void api("POST conversations/[id]/wake", { params: { id } });
  // @ts-expect-error a route whose path has a parameter and whose schema declares a body needs its options
  void api("POST conversations/[id]/snooze");
  // @ts-expect-error nor with the body and not the parameters: the request would ask for conversations//snooze
  void api("POST conversations/[id]/snooze", { body: { until } });
  // @ts-expect-error nor with the parameters and not the body the schema declares
  void api("POST conversations/[id]/snooze", { params: { id } });
  // @ts-expect-error nor with the body said to be undefined
  void api("POST conversations/[id]/snooze", { params: { id }, body: undefined });
  // @ts-expect-error and the call that answers the Response itself is held the same way
  void api.raw("POST conversations/[id]/snooze");
  // @ts-expect-error a body the route never reads stops compiling rather than being sent
  void api("POST conversations/[id]/snooze", { params: { id }, body: { until, note: "call first" } });
  // @ts-expect-error a body short of what the schema requires
  void api("POST conversations/[id]/snooze", { params: { id }, body: {} });
  // @ts-expect-error a path without its thread's id
  void api("POST conversations/[id]/snooze", { params: {}, body: { until } });
  // @ts-expect-error a read takes a query, never a body
  void api("GET conversations", { body: { ids: id } });
  // @ts-expect-error a write takes a body, never a query
  void api("POST conversations/[id]/snooze", { params: { id }, query: { until } });
  // @ts-expect-error an answer is data only once ok says there is some: a refusal carries none
  void answer.data;
  // @ts-expect-error and a refusal's code only once it says not
  void answer.code;
  if (answer.ok) {
    type _Answered = Holds<Exactly<typeof answer.data, SnoozeResult>>;
    // @ts-expect-error the answer is typed: a field the verb does not return is not there to read
    void answer.data.snoozed_until;
  } else {
    type _Refused = Holds<Exactly<typeof answer, ApiRefusal>>;
  }
}
