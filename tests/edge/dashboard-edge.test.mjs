/**
 * What a dashboard call to the edge carries (apps/dashboard/src/server/edge.ts), run: a token minted for the door
 * when EDGE_CALL_SECRET is set, and then no key beside it; the shared key only while there is no secret to sign with.
 *
 * The key rode beside the token on every call, so a token the edge verified bought nothing while a static key that
 * opened every door travelled with it. A deployment that can sign now signs and sends nothing else -- which is why
 * the edge must hold the same secret: without it, it reads no token (lib/shared/admin-auth.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyEdgeToken } from "@chanlytics/channels/tokens";
import { importSrc } from "../_source.mjs";

const SECRET = "edge-secret-for-this-file";
const KEY = "diag-key-for-this-file";
const AUD = "/api/admin/lines";

const { edgeHeaders, edgeConfigured, edgeUrl, callEdge, edgeAnswered, streamEdge } = await importSrc(
  "apps/dashboard/src/server/shared/edge.ts",
);

/** Set variables for one call and put every one of them back afterwards; `undefined` unsets. */
async function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("with the secret: the call carries a token for the door, the workspace and the person, and no key -- the key it also holds notwithstanding", async () => {
  await withEnv({ EDGE_CALL_SECRET: SECRET, DIAG_KEY: KEY }, () => {
    const h = edgeHeaders(AUD, { workspace: "ws-1", user: "u-1" });
    assert.deepEqual(Object.keys(h).sort(), ["content-type", "x-edge-token"]);
    const v = verifyEdgeToken(SECRET, h["x-edge-token"], AUD);
    assert.equal(v.ok, true);
    assert.deepEqual([v.claims.aud, v.claims.ws, v.claims.user], [AUD, "ws-1", "u-1"]);
    assert.equal(verifyEdgeToken(SECRET, h["x-edge-token"], "/api/admin/whisper").ok, false, "for this door only");
    // A call about no workspace, by nobody in particular.
    const bare = verifyEdgeToken(SECRET, edgeHeaders(AUD)["x-edge-token"], AUD);
    assert.deepEqual([bare.ok, bare.claims.ws, bare.claims.user], [true, null, null]);
    assert.equal(edgeConfigured(), true);
  });
});

test("without the secret: the shared key rides, as it always has; with neither, the call carries nothing and the edge is not configured", async () => {
  await withEnv({ EDGE_CALL_SECRET: undefined, DIAG_KEY: KEY }, () => {
    assert.deepEqual(edgeHeaders(AUD, { workspace: "ws-1" }), {
      "content-type": "application/json",
      "x-diag-key": KEY,
    });
    assert.equal(edgeConfigured(), true);
  });
  await withEnv({ EDGE_CALL_SECRET: undefined, DIAG_KEY: undefined }, () => {
    assert.deepEqual(edgeHeaders(AUD), { "content-type": "application/json" });
    assert.equal(edgeConfigured(), false);
  });
  // Blank is not a secret: Vercel stores an emptied variable as "".
  await withEnv({ EDGE_CALL_SECRET: "", DIAG_KEY: KEY }, () => {
    assert.deepEqual(Object.keys(edgeHeaders(AUD)).sort(), ["content-type", "x-diag-key"]);
  });
});

test("where the edge is: the address the dashboard has always called unless EDGE_URL says otherwise, never with a trailing slash", async () => {
  await withEnv({ EDGE_URL: undefined }, () => assert.equal(edgeUrl(), "https://chanlytics-messaging.vercel.app"));
  await withEnv({ EDGE_URL: "https://edge-preview.example.com/" }, () =>
    assert.equal(edgeUrl(), "https://edge-preview.example.com"),
  );
});

test("a field its door's schema does not hold is not read: left out, the status kept, said by door and field, never by value", async () => {
  const said = [];
  const warn = console.warn;
  console.warn = (line) => said.push(JSON.parse(line));
  const answering = (body, status = 200) => ({
    method: "GET",
    workspace: null,
    user: null,
    fetch: async () => new Response(JSON.stringify(body), { status }),
  });
  const DOOR = "/api/admin/lines/codes";
  try {
    await withEnv({ EDGE_CALL_SECRET: SECRET, EDGE_URL: "https://edge.test" }, async () => {
      const held = await callEdge(DOOR, null, answering({ ok: true, codes: [], what_it_adds: 1 }));
      assert.deepEqual(
        held,
        { status: 200, body: { ok: true, codes: [], what_it_adds: 1 } },
        "read as it came, a field nobody reads included",
      );
      const refused = await callEdge(
        DOOR,
        null,
        answering({ ok: false, error: "no_database", detail: "Not now." }, 503),
      );
      assert.deepEqual(refused, { status: 503, body: { ok: false, error: "no_database", detail: "Not now." } });
      assert.deepEqual(said, [], "a refusal says none of the answer's fields, and that is no mismatch");

      const odd = await callEdge(DOOR, null, answering({ ok: true, codes: "a person's words", what_it_adds: 1 }));
      assert.deepEqual(
        odd,
        { status: 200, body: { ok: true, what_it_adds: 1 } },
        "the field its schema does not hold is left out; the rest, and the status, stand",
      );
      assert.deepEqual(
        said.map(({ event, door, status, fields }) => ({ event, door, status, fields })),
        [{ event: "edge_answer_unexpected", door: DOOR, status: 200, fields: ["codes"] }],
      );
      assert.ok(!JSON.stringify(said).includes("a person's words"), "the field's name, never its value");

      said.length = 0;
      const none = await callEdge("/api/admin/no-such-door", null, answering({ ok: true, codes: "anything" }));
      assert.equal(none.status, 200, "a path no door declares has no schema to hold it to");
      assert.deepEqual(said, []);
    });
  } finally {
    console.warn = warn;
  }
});

test("every call to the edge is bounded and never throws: the door's answer as it came, a 503 named edge_timeout when it did not answer in time, edge_unreachable when it could not be reached", async () => {
  await withEnv({ EDGE_CALL_SECRET: SECRET, EDGE_URL: "https://edge.test" }, async () => {
    const calls = [];
    const answering = async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ok: false, error: "preview", detail: "Not here." }), { status: 409 });
    };
    const a = await callEdge(AUD, { tenant_id: "ws-1" }, { workspace: "ws-1", user: "u-1", fetch: answering });
    assert.deepEqual(a, { status: 409, body: { ok: false, error: "preview", detail: "Not here." } });
    assert.equal(edgeAnswered(a), false);
    assert.equal(calls[0].url, "https://edge.test/api/admin/lines");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.body, JSON.stringify({ tenant_id: "ws-1" }));
    assert.ok(calls[0].init.signal instanceof AbortSignal, "a bound rides every call");
    assert.ok(calls[0].init.headers["x-edge-token"], "the door's token");

    const read = await callEdge("/api/admin/whatsapp/signup-config", null, {
      method: "GET",
      fetch: async (_u, init) => {
        assert.equal(init.body, undefined, "a read carries no body");
        return new Response(JSON.stringify([1]), { status: 200 });
      },
    });
    assert.deepEqual(read, { status: 200, body: null }, "a body that is not an object is no body");
    assert.equal(edgeAnswered(read), true);

    const slow = await callEdge(
      AUD,
      {},
      {
        fetch: async () => {
          throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
        },
      },
    );
    assert.deepEqual([slow.status, slow.body.error], [503, "edge_timeout"]);
    const gone = await callEdge(
      AUD,
      {},
      {
        fetch: async () => {
          throw new TypeError("fetch failed");
        },
      },
    );
    assert.deepEqual([gone.status, gone.body.error, gone.body.detail], [503, "edge_unreachable", "fetch failed"]);
  });
});

test("a request's name: the caller's only where it is trusted to give one, else the platform's, else a fresh one; the dashboard's calls to the edge carry the name of the request they serve", async () => {
  const { requestIdOf, REQUEST_ID_HEADER } = await import("@chanlytics/channels/tokens");
  const { withRequestId, requestId } = await importSrc("apps/dashboard/src/server/shared/log.ts");
  const h = (o) => new Headers(o);
  assert.equal(REQUEST_ID_HEADER, "x-request-id");
  assert.equal(requestIdOf(h({ "x-request-id": "dash-0123456789" }), { trustCaller: true }), "dash-0123456789");
  assert.equal(
    requestIdOf(h({ "x-request-id": "dash-0123456789", "x-vercel-id": "iad1::abcdefgh-1" }), { trustCaller: false }),
    "iad1::abcdefgh-1",
    "a browser's header is not taken",
  );
  assert.match(requestIdOf(h({ "x-request-id": "<script>" }), { trustCaller: true }), /^[0-9a-f-]{36}$/);
  assert.match(requestIdOf(h({}), { trustCaller: false }), /^[0-9a-f-]{36}$/);

  assert.equal(requestId(), null, "outside a request, none");
  await withEnv({ EDGE_CALL_SECRET: SECRET }, () =>
    withRequestId("iad1::req-0123456789", async () => {
      await Promise.resolve();
      assert.equal(requestId(), "iad1::req-0123456789", "held across what the request awaits");
      const h = edgeHeaders(AUD);
      assert.equal(h["x-request-id"], "iad1::req-0123456789");
      assert.equal(
        verifyEdgeToken(SECRET, h["x-edge-token"], AUD).claims.rid,
        "iad1::req-0123456789",
        "and the same name is signed into the token, so it cannot be relabelled on the way",
      );
    }),
  );
  await withEnv({ EDGE_CALL_SECRET: SECRET }, () => {
    const h = edgeHeaders(AUD);
    assert.equal("x-request-id" in h, false, "no request, no name");
    assert.equal(verifyEdgeToken(SECRET, h["x-edge-token"], AUD).claims.rid, null, "nor a signed one");
  });
});

test("a streamed call to the edge: the door's token and a bound, a yes's body handed back unread, a no read as it came, no answer said; its time under out.edge", async () => {
  const { withRequestId } = await importSrc("apps/dashboard/src/server/shared/log.ts");
  const { requestTimings } = await import("@chanlytics/log");
  await withEnv({ EDGE_CALL_SECRET: SECRET, EDGE_URL: "https://edge.test" }, async () => {
    const calls = [];
    const streamed = () =>
      new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('{"t":"step"}\n'));
          c.close();
        },
      });
    const yes = await withRequestId("req-stream-1", async () => {
      const answer = await streamEdge(
        AUD,
        { tenant_id: "ws-1" },
        {
          workspace: "ws-1",
          user: "u-1",
          timeoutMs: 5_000,
          fetch: async (url, init) => {
            calls.push({ url, init });
            return new Response(streamed(), { status: 200, headers: { "content-type": "application/x-ndjson" } });
          },
        },
      );
      return { answer, out: requestTimings().get("out.edge") };
    });
    assert.deepEqual([yes.answer.status, yes.answer.json, yes.answer.error], [200, null, null]);
    assert.equal(await new Response(yes.answer.body).text(), '{"t":"step"}\n', "the body as it streamed, unread");
    assert.equal(yes.answer.headers.get("content-type"), "application/x-ndjson");
    assert.equal(yes.out.n, 1, "its time is the request's, under out.edge");
    assert.equal(calls[0].url, "https://edge.test/api/admin/lines");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.body, JSON.stringify({ tenant_id: "ws-1" }));
    assert.ok(calls[0].init.signal instanceof AbortSignal, "a bound rides every call");
    const v = verifyEdgeToken(SECRET, calls[0].init.headers["x-edge-token"], AUD);
    assert.deepEqual([v.ok, v.claims.ws, v.claims.user], [true, "ws-1", "u-1"]);

    const no = await streamEdge(
      AUD,
      {},
      {
        workspace: null,
        user: null,
        timeoutMs: 5_000,
        fetch: async () => new Response(JSON.stringify({ ok: false, error: "preview" }), { status: 409 }),
      },
    );
    assert.deepEqual([no.status, no.body, no.json], [409, null, { ok: false, error: "preview" }]);

    const none = await streamEdge(
      AUD,
      {},
      {
        workspace: null,
        user: null,
        timeoutMs: 5_000,
        fetch: async () => {
          throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
        },
      },
    );
    assert.deepEqual([none.status, none.error, none.body], [0, "timeout", null]);
  });
});
