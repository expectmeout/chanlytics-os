/**
 * A request's identical reads share one answer.
 *
 * A request that answers several reads as one (the dashboard's GET open: twenty reads, from about seventy-five small
 * readers) asked the database the same thing more than once: of the 115 reads of a table Today's opening made, eighteen
 * asked exactly what another had asked a moment before (23 Nov 2026: the channels' state three times, the mailboxes three,
 * the Google listing twice). Each was a call of its own, and the opening's time on the server went on its calls, not on the
 * database's answers (the plan "Pages that open at once", piece 2).
 *
 * Where such a request says so (packages/log shareReads), the database client's transport answers a read of PostgREST
 * from the answer the request already has for it:
 *
 * - The same read is the same method and address under the same headers, so another person's token, another schema or
 *   another page of rows is another read.
 * - A function's call is never shared. Some count what they are asked (the limiter counts each hit), and a function's
 *   answer is its own to keep or not.
 * - A write to a table ends what the request shares, as it leaves and as it lands, so a read after a write sees it.
 * - An answer that failed, or that the server could not make (a 5xx), is not kept: the next asks again, as a retry must.
 * - A call that carries a signal of its own may be called off by its caller alone, so it is sent as it came.
 *
 * Every asker reads an answer of its own, made from the bytes read once. The client reads an answer's status, its
 * `content-range` and its text (PostgREST's builder), and that is what is kept.
 */

/** An answer as it is kept for the reads that share it. */
interface KeptAnswer {
  status: number;
  statusText: string;
  headers: [string, string][];
  /** Its bytes, read once; null where an answer of its status carries none. */
  body: ArrayBuffer | null;
}

/** One call as the transport is handed it, with how it touches the database (observe.ts touchOfCall), null where it is not PostgREST's. */
interface SharedCall {
  input: string | URL | Request;
  init: RequestInit | undefined;
  how: string | null;
}

/** The statuses an answer carries no body under: `Response` refuses one made with any. */
const NO_BODY = new Set([204, 205, 304]);

/** What each sharing request holds, by what stands for it (packages/log sharedReads): gone with the request. */
const ANSWERS_SHARED = new WeakMap<object, Map<string, Promise<KeptAnswer>>>();

function answersSharedBy(scope: object): Map<string, Promise<KeptAnswer>> {
  const held = ANSWERS_SHARED.get(scope);
  if (held) return held;
  const fresh = new Map<string, Promise<KeptAnswer>>();
  ANSWERS_SHARED.set(scope, fresh);
  return fresh;
}

/** The read as a key: its method, its address and every header it carries; null for a call that is sent as it came. */
function keyOfRead({ input, init }: SharedCall): string | null {
  if (typeof input !== "string" || init?.signal) return null;
  const headers = [...new Headers(init?.headers)].map(([name, value]) => `${name}:${value}`).join("\n");
  return `${(init?.method ?? "GET").toUpperCase()} ${input}\n${headers}`;
}

async function keepAnswer(answer: Response): Promise<KeptAnswer> {
  return {
    status: answer.status,
    statusText: answer.statusText,
    headers: [...answer.headers],
    body: NO_BODY.has(answer.status) ? null : await answer.arrayBuffer(),
  };
}

const answerFrom = (kept: KeptAnswer): Response =>
  new Response(kept.body, { status: kept.status, statusText: kept.statusText, headers: kept.headers });

/**
 * The call's answer: from the one the request `scope` stands for already has, where the call is a read it shares, and
 * sent by `send` otherwise. `scope` is null in a request that shares none, and every call is sent as it came.
 */
export function readShared(scope: object | null, call: SharedCall, send: () => Promise<Response>): Promise<Response> {
  if (!scope || !call.how || call.how === "call") return send();
  const answers = answersSharedBy(scope);
  if (call.how !== "read") {
    // A write to a table: what was read before it may no longer be so, and a read sent while it is out may not be either.
    answers.clear();
    return send().finally(() => answers.clear());
  }
  const key = keyOfRead(call);
  if (!key) return send();
  const held = answers.get(key);
  if (held) return held.then(answerFrom);
  const kept = send().then(keepAnswer);
  answers.set(key, kept);
  const forget = () => {
    if (answers.get(key) === kept) answers.delete(key);
  };
  // Neither a failure nor an answer the server could not make is a fact: the next asks again.
  void kept.then((answer) => {
    if (answer.status >= 500) forget();
  }, forget);
  return kept.then(answerFrom);
}
