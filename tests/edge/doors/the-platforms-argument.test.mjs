/**
 * A door's handler is handed the request alone (apps/edge/lib/shared/log.ts `door`). The platform calls a door with an
 * argument of its own after the request -- Vercel's Node launcher hands each GET and POST a FetchEvent, `{ waitUntil }`
 * -- and a handler's parameter after the request is a test's port. On 20 November 2026 that argument stood in the key
 * door's sync, and every real clip's key was refused ("sync.open is not a function"), while a test that called the
 * door's function by itself passed. A test hands a handler its port with the address's `with`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

const { door, adminDoor } = await importSrc("apps/edge/lib/shared/log.ts");

/** What the platform hands a door after the request: a FetchEvent, whose one field is `waitUntil`. */
const PLATFORM_ARGUMENT = { waitUntil: () => undefined };
const knock = () =>
  new Request("https://edge.example.com/api/sources/key", { method: "POST", headers: { "x-vercel-id": "iad1::abc" } });
/** A handler that answers with what it was handed after the request. */
const handedAfter = async (_request, ...ports) =>
  new Response(JSON.stringify({ count: ports.length, first: ports[0] ?? null }));

test("called as the platform calls it, with its own argument after the request, a door hands its handler the request alone, and still names it", async () => {
  for (const wrap of [door, adminDoor]) {
    const res = await wrap(handedAfter)(knock(), PLATFORM_ARGUMENT);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { count: 0, first: null }, "nothing of the platform's reaches the handler");
    assert.ok(res.headers.get("x-request-id"), "the answer carries the request's name");
  }
});

test("a test hands a handler its port with `with`: named as the address is, and a throw caught as the address's is", async () => {
  for (const wrap of [door, adminDoor]) {
    const res = await wrap(handedAfter).with("the test's port")(knock());
    assert.deepEqual(await res.json(), { count: 1, first: "the test's port" });
    assert.ok(res.headers.get("x-request-id"), "the answer carries the request's name");
    const crashing = wrap(async (_request, port) => {
      throw new Error(port);
    });
    const real = console.error;
    console.error = () => undefined;
    try {
      const failed = await crashing.with("a port that throws")(knock());
      assert.equal(failed.status, 500);
      assert.deepEqual(await failed.json(), { ok: false, error: "door_failed" });
    } finally {
      console.error = real;
    }
  }
});
