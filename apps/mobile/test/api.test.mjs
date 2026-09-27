/**
 * The pure parts of the shell's calls (src/shell/api-pure.ts): a token is fresh until a minute before it expires, a
 * thread's route names its conversation and nothing else does, and the site's envelope is its data or its refusal.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiRefusal, isFresh, threadIdOf, unwrap, TOKEN_MARGIN_S } from "../src/shell/api-pure.ts";

test("a token is fresh until a minute before it expires; none is never fresh", () => {
  const now = 1_800_000_000_000;
  const expires = now / 1000 + 600;
  assert.ok(isFresh({ token: "t", expires }, now));
  assert.ok(!isFresh({ token: "t", expires }, now + (600 - TOKEN_MARGIN_S + 1) * 1000), "inside the margin");
  assert.ok(!isFresh({ token: "t", expires: 0 }, now), "no expiry is no token");
  assert.ok(!isFresh(null, now));
});

test("a thread's route is inbox/<uuid>; the list, a person, or a stranger's shape is not one", () => {
  const id = "0f6e1a3c-9b2d-4e6f-8a1b-2c3d4e5f6a7b";
  assert.equal(threadIdOf(`inbox/th-${id}`), id, "the Inbox's own route for a thread");
  assert.equal(threadIdOf(`inbox/${id}`), id);
  assert.equal(threadIdOf(`inbox/${id.toUpperCase()}`), id.toUpperCase());
  assert.equal(threadIdOf("inbox"), null);
  assert.equal(threadIdOf(`clients/${id}`), null);
  assert.equal(threadIdOf("inbox/th-1"), null);
  assert.equal(threadIdOf(`inbox/thx-${id}`), null);
});

test("the envelope's data comes back; its refusal is thrown in the site's words with the status", () => {
  assert.deepEqual(unwrap(200, { ok: true, data: { a: 1 } }), { a: 1 });
  assert.throws(
    () => unwrap(409, { ok: false, error: { code: "conflict", message: "Someone else has it." } }),
    (e) => e instanceof ApiRefusal && e.code === "conflict" && e.message === "Someone else has it." && e.status === 409,
  );
  assert.throws(
    () => unwrap(502, null),
    (e) => e instanceof ApiRefusal && e.code === "unknown" && e.status === 502,
  );
});
