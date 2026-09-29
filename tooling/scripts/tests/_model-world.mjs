/**
 * A scripted Anthropic Messages API, for every test of a path that asks a model: the model port's fetch answers each
 * request with the next of the replies a test gives, and remembers what it was sent. Nothing here reaches the network.
 *
 *   said(text, over)        an answer: a message with one text block, its usage and stop reason
 *   json(obj, over)         an answer whose text is `obj` as JSON (a structured answer)
 *   status(code, message)   the API's error answer at that status (a 529 is overloaded, a 400 a bad request)
 *   hang()                  a request that never answers until its signal ends it (a timeout)
 *   thrown(code)            a connection that never opened (ECONNREFUSED), or dropped
 *
 * `scripted(...replies)` returns { fetch, calls }: each call holds the model asked, the parsed body and the headers.
 * `sse(events)` is a streamed answer for the gateway, one `data:` line per event.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */

const USAGE = { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 900, cache_creation_input_tokens: 40 };

export const said = (text, over = {}) => ({
  kind: "answer",
  body: {
    id: "msg_scripted",
    type: "message",
    role: "assistant",
    model: over.model,
    content: [{ type: "text", text }],
    stop_reason: over.stop_reason ?? "end_turn",
    usage: over.usage ?? USAGE,
  },
});

export const json = (obj, over = {}) => said(JSON.stringify(obj), over);

export const status = (code, message = `status ${code}`) => ({ kind: "status", code, message });

export const hang = () => ({ kind: "hang" });

export const thrown = (code = "ECONNREFUSED") => ({ kind: "thrown", code });

/** A streamed answer: the events as the API sends them. */
export const sse = (events) => ({ kind: "sse", events });

/** The API's message_start, a text delta and message_delta for one short streamed answer. */
export const streamed = (text, usage = USAGE, stop = "end_turn") =>
  sse([
    { type: "message_start", message: { id: "msg_streamed", usage } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: stop }, usage: { output_tokens: usage.output_tokens } },
    { type: "message_stop" },
  ]);

/** A fetch that answers with `replies` in order (the last one repeats), and the calls it was sent. */
export function scripted(...replies) {
  const calls = [];
  const queue = [...replies];
  const fetch = async (url, init = {}) => {
    const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, model: body?.model, body, headers });
    const r = queue.length > 1 ? queue.shift() : queue[0];
    if (!r) throw new Error("the script ran out of answers");
    if (r.kind === "thrown") {
      const e = new TypeError("fetch failed");
      e.cause = { code: r.code, message: r.code };
      throw e;
    }
    if (r.kind === "hang") {
      return new Promise((_, reject) => {
        const s = init.signal;
        // AbortSignal.timeout's timer does not hold the process open; this one does, until the signal ends the call.
        const hold = setInterval(() => {}, 1_000);
        const stop = () => {
          clearInterval(hold);
          reject(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));
        };
        if (s?.aborted) stop();
        else s?.addEventListener("abort", stop, { once: true });
      });
    }
    if (r.kind === "status") {
      const type = r.code === 529 ? "overloaded_error" : r.code === 429 ? "rate_limit_error" : "invalid_request_error";
      return new Response(JSON.stringify({ type: "error", error: { type, message: r.message } }), {
        status: r.code,
        headers: { "content-type": "application/json" },
      });
    }
    if (r.kind === "sse") {
      const text = r.events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
      return new Response(text, { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    return new Response(JSON.stringify({ ...r.body, model: r.body.model ?? body?.model }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetch, calls };
}
