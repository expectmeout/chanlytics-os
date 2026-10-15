/**
 * Ask's calls from the browser tell what failed apart.
 *
 * The thread read: thread() answered null for a thread that is gone and for a
 * read that failed, and the palette said "Thread deleted" and dropped the
 * thread from the owner's list whenever a read failed -- a timeout made a
 * conversation vanish, and a refresh brought it back. Gone and failed are
 * different answers now, and the palette says a different sentence for each.
 *
 * The turn's stream: one that broke before its answer threw out of send(), and
 * the Line stayed on "Reading…" for ever; and Stop never reached the server.
 * A break is an error line now, and Stop lets go of the request once the
 * turn's thread is named.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { createApi } = await import(at("apps/dashboard/src/client/api.ts"));
const { askApi } = await import(at("apps/dashboard/src/legacy-bridge/ask/api.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const T1 = "11111111-1111-4111-8111-111111111111";

/** The typed client on a fake fetch that answers every call with `res()`. */
const answering = (res) =>
  createApi({
    fetch: async () => res(),
    workspace: () => A,
    onSignedOut() {},
    onChooseWorkspace() {},
    refresh: async () => {},
    now: () => 1_000,
  });
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("REGRESSION: a thread that is gone reads as gone, and a read that failed reads as failed -- both were null, and the palette dropped the thread", async () => {
  const thread = { id: T1, title: "Saturday", scope: null };
  const read = await askApi(answering(() => json(200, { ok: true, data: { thread, messages: [] } }))).thread(T1);
  assert.deepEqual(read, { thread, messages: [] });

  const gone = await askApi(
    answering(() => json(404, { ok: false, error: { code: "not_found", message: "Thread not found." } })),
  ).thread(T1);
  assert.deepEqual(gone, { missing: true }, "a thread that is not there any more");

  const failed = await askApi(
    answering(() => json(500, { ok: false, error: { code: "internal", message: "boom" } })),
  ).thread(T1);
  assert.equal(failed, null, "a read that failed is not a thread that was deleted");

  const offline = await askApi(
    answering(() => {
      throw new TypeError("Failed to fetch");
    }),
  ).thread(T1);
  assert.equal(offline, null, "nor is a network that dropped");
});

/**
 * A turn's stream the test writes as it goes, over the typed client: what the fetch was asked with is kept, and its
 * signal ending errors the body, as a real fetch's does.
 */
function turnStream() {
  let body;
  const stream = new ReadableStream({
    start(c) {
      body = c;
    },
  });
  const s = {
    init: null,
    raw: (text) => body.enqueue(new TextEncoder().encode(text)),
    line: (ev) => s.raw(`${JSON.stringify(ev)}\n`),
    break: (e) => body.error(e),
  };
  s.client = createApi({
    fetch: async (_url, init) => {
      s.init = init;
      const cut = () => {
        try {
          body.error(init.signal.reason);
        } catch {
          /* already closed */
        }
      };
      if (init.signal.aborted) cut();
      else init.signal.addEventListener("abort", cut, { once: true });
      return new Response(stream, { status: 200, headers: { "content-type": "application/x-ndjson" } });
    },
    workspace: () => A,
    onSignedOut() {},
    onChooseWorkspace() {},
    refresh: async () => {},
    now: () => 1_000,
  });
  return s;
}
/** Wait for a condition, never for a length of time. */
const until = async (ok, what) => {
  for (let i = 0; i < 500 && !ok(); i++) await new Promise((r) => setTimeout(r, 2));
  assert.ok(ok(), what);
};
const THREAD = { t: "thread", id: T1, title: "Who wrote this week?" };

/** A question sent, its stream written by `write` once the fetch is out, and every line the Line was handed. */
async function heard(text, write, signal) {
  const s = turnStream();
  const events = [];
  const sent = askApi(s.client).send({ text, threadId: null, surface: "today", signal }, (ev) => events.push(ev));
  await until(() => s.init, "the question went");
  await write(s, events);
  await sent;
  return { events, s };
}

test("REGRESSION: a stream that breaks before its answer ends the turn with an error line in the question's language -- the break threw out of send(), and the Line read on for ever", async () => {
  const dropped = await heard("Who wrote this week?", async (s, events) => {
    s.line(THREAD);
    s.line({ t: "say", headline: "Three people", detail: "" });
    await until(() => events.length === 2, "the lines before the break");
    s.break(new TypeError("network error"));
  });
  assert.deepEqual(
    dropped.events.map((e) => e.t),
    ["thread", "say", "error"],
  );
  assert.equal(dropped.events[2].text, "The connection dropped before the answer came. Try again.");

  const es = await heard("¿Quién escribió esta semana?", async (s) => s.break(new TypeError("network error")));
  assert.deepEqual(es.events, [
    { t: "error", text: "Se cortó la conexión antes de la respuesta. Inténtalo de nuevo." },
  ]);

  const late = await heard("Who wrote this week?", async (s) =>
    s.break(new DOMException("The operation timed out.", "TimeoutError")),
  );
  assert.deepEqual(late.events, [{ t: "error", text: "The answer took too long to arrive. Try again." }]);
});

test("a stream that breaks after its answer changes nothing: the final stands", async () => {
  const final = { t: "final", message: { id: "m1", role: "assistant", text: "Three people wrote." } };
  const { events } = await heard("Who wrote this week?", async (s, got) => {
    s.line(THREAD);
    s.line(final);
    await until(() => got.length === 2, "the answer");
    s.break(new TypeError("network error"));
  });
  assert.deepEqual(events, [THREAD, final]);
});

test("Stop before the turn's thread is named keeps the request until the name comes, hands the name on, then lets go of it, and hands on nothing else -- the next question carries on in that thread, never a second", async () => {
  const stop = new AbortController();
  const { events, s } = await heard(
    "Who wrote this week?",
    async (w) => {
      stop.abort();
      await new Promise((r) => setImmediate(r));
      assert.equal(w.init.signal.aborted, false, "not let go of before the thread is named");
      // The name and the Say in one read: the name is handed on, the Say is not.
      w.raw(`${JSON.stringify(THREAD)}\n${JSON.stringify({ t: "say", headline: "Three", detail: "" })}\n`);
    },
    stop.signal,
  );
  assert.deepEqual(events, [THREAD]);
  assert.equal(s.init.signal.aborted, true, "let go of once named: the route stops the turn");
});

test("Stop once the thread is named lets go of the request at once, and says nothing more: the Line has said it", async () => {
  const stop = new AbortController();
  const { events, s } = await heard(
    "Who wrote this week?",
    async (w, got) => {
      w.line(THREAD);
      await until(() => got.length === 1, "the thread");
      stop.abort();
    },
    stop.signal,
  );
  assert.deepEqual(events, [THREAD], "no error line for a turn the person stopped");
  assert.equal(s.init.signal.aborted, true);
});
