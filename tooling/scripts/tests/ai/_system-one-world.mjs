/**
 * A scripted TypeSafe System One API, for every test of the shadow: a fetch that answers `POST /v1/systemone` and
 * remembers what it was sent. Nothing here reaches the network, and no key is written in the tree: a test makes its own
 * at run time (`aKey()`).
 *
 *   jev(spec)         answers each question the request names from `spec` (or spec(body)) by its name: a number is a noul's
 *                     probability of yes, `{ choice, confidence }` a choice's answer (the other options share the rest);
 *                     a question the spec does not name is answered by the first option or a coin.
 *   failing(code, m)  the API's error at that status (401 the key, 422 the body, 429, 529), with `m` as its detail.
 *   junk()            a 200 whose body is not an answer.
 *   hangs()           a request that never answers until its signal ends it.
 *   drops()           a connection that never opened.
 *
 * Each returns { fetch, calls }; a call holds the url, the headers (lower-cased) and the parsed body.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import crypto from "node:crypto";

/** A key made for this run: never a literal, so no scanner and no reader finds one in the tree. */
export const aKey = () => `tsk_${crypto.randomBytes(18).toString("hex")}`;

/** The pinned model the API answers as, and the input tokens it counts for one request. */
export const JEV = "jev-1.13.0";
export const INPUT_TOKENS = 312;

function recorder(handler) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), method: init.method, headers, body });
    return handler(body, init);
  };
  return { fetch, calls };
}

const respond = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function answerFor(question, want) {
  if (question.type === "noul") return { type: "noul", noul: typeof want === "number" ? want : 0.5 };
  const options = Object.keys(question.criteria);
  const choice = want && typeof want === "object" ? want.choice : options[0];
  const confidence = want && typeof want === "object" ? want.confidence : 0.5;
  const rest = options.length > 1 ? Math.round(((1 - confidence) / (options.length - 1)) * 1000) / 1000 : 0;
  return {
    type: "choice",
    choice,
    probabilities: Object.fromEntries(options.map((o) => [o, o === choice ? confidence : rest])),
    confidence,
  };
}

export function jev(spec = {}, over = {}) {
  return recorder((body) => {
    // A spec may be a function of the request, for a test whose answer depends on the state it was put.
    const want = typeof spec === "function" ? spec(body) : spec;
    return respond(200, {
      model: over.model ?? JEV,
      answers: Object.fromEntries(Object.entries(body.questions).map(([name, q]) => [name, answerFor(q, want[name])])),
      usage: { input_tokens: over.inputTokens ?? INPUT_TOKENS, output_tokens: 48 },
    });
  });
}

export const failing = (code, detail = `status ${code}`) =>
  recorder(() => respond(code, { detail, error: { message: detail } }));

export const junk = () => recorder(() => respond(200, { hello: "world" }));

export const hangs = () =>
  recorder(
    (_body, init) =>
      new Promise((_, reject) => {
        // The timer's handle holds the process open until the call's own signal ends it, as a hung socket does.
        const hold = setInterval(() => {}, 1_000);
        const stop = () => {
          clearInterval(hold);
          reject(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));
        };
        if (init.signal?.aborted) stop();
        else init.signal?.addEventListener("abort", stop, { once: true });
      }),
  );

export const drops = () =>
  recorder(() => {
    const e = new TypeError("fetch failed");
    e.cause = { code: "ECONNREFUSED", message: "ECONNREFUSED" };
    throw e;
  });
