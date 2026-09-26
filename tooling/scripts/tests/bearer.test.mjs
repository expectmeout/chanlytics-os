/**
 * A bearer token beside the cookie (decision 0011), executed through the real route wrapper with a stand-in for
 * the Auth server: the header parsed and refused; a bearer request with no cookie answers as the token's person; a
 * cross-site POST with a bearer is not refused for its origin, since it spends no cookie; a token the verifier
 * refuses is 401, an unreachable verifier 503; and a request without a bearer still takes the cookie's path.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { bearerOf, setBearerVerifier } = await import(at("apps/dashboard/src/server/bearer.ts"));
const { withRoute } = await import(at("apps/dashboard/src/server/with-route.ts"));

// Built here, not written down: a token-shaped literal in the tree is what the secret scan is for.
const part = (v) => Buffer.from(v).toString("base64url");
const JWT = [
  part('{"alg":"ES256"}'),
  part('{"sub":"u-1","email":"ada@example.com"}'),
  part("signature-signature"),
].join(".");
const req = (headers = {}, method = "GET") =>
  new Request("http://localhost/api/v1/x", { method, headers, ...(method === "POST" ? { body: "{}" } : {}) });

test("the header is a JWT after 'Bearer', or nothing", () => {
  assert.equal(bearerOf(req({ authorization: `Bearer ${JWT}` })), JWT);
  assert.equal(bearerOf(req({ authorization: `bearer ${JWT} ` })), JWT, "the scheme is case-insensitive");
  assert.equal(bearerOf(req()), null);
  assert.equal(bearerOf(req({ authorization: "Basic abc" })), null);
  assert.equal(bearerOf(req({ authorization: "Bearer not-a-jwt" })), null);
  assert.equal(bearerOf(req({ authorization: `Bearer ${JWT} extra` })), null);
});

const verdict = (claims, error = null) => ({ supabase: { tag: "bearer-client" }, claims, error });
const handler = withRoute(async (_req, ctx) => ({ user: ctx.userId, email: ctx.email, client: ctx.supabase.tag }));
const call = (r) => handler(r, { params: Promise.resolve({}) });

test("a bearer request with no cookie runs as the token's person, on the bearer's client", async () => {
  const seen = [];
  const prev = setBearerVerifier(async (token) => {
    seen.push(token);
    return verdict({ sub: "u-1", email: "ada@example.com" });
  });
  try {
    const res = await call(req({ authorization: `Bearer ${JWT}` }));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      ok: true,
      data: { user: "u-1", email: "ada@example.com", client: "bearer-client" },
    });
    assert.deepEqual(seen, [JWT], "verified once, over the token the header carried");
    assert.equal(res.headers.get("cache-control"), "private, no-store");
  } finally {
    setBearerVerifier(prev);
  }
});

test("a cross-site POST with a bearer is judged by its token, never by its origin: it spends no cookie", async () => {
  const prev = setBearerVerifier(async () => verdict({ sub: "u-1" }));
  try {
    const res = await call(req({ authorization: `Bearer ${JWT}`, "sec-fetch-site": "cross-site" }, "POST"));
    assert.equal(res.status, 200);
  } finally {
    setBearerVerifier(prev);
  }
});

test("a token the verifier refuses is 401; a verifier that cannot be reached is 503, not a sign-out", async () => {
  let prev = setBearerVerifier(async () => verdict(null, { status: 401, name: "AuthApiError", message: "bad" }));
  try {
    const res = await call(req({ authorization: `Bearer ${JWT}` }));
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error.code, "unauthorized");
  } finally {
    setBearerVerifier(prev);
  }
  prev = setBearerVerifier(async () => verdict(null, { name: "AuthRetryableFetchError", message: "down" }));
  try {
    const res = await call(req({ authorization: `Bearer ${JWT}` }));
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error.code, "upstream_auth");
  } finally {
    setBearerVerifier(prev);
  }
});

test("without a bearer the cookie's path is taken: a cross-site POST is refused before any session is read", async () => {
  const prev = setBearerVerifier(async () => {
    throw new Error("the verifier must not be asked without a bearer");
  });
  try {
    const res = await call(req({ "sec-fetch-site": "cross-site" }, "POST"));
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.code, "forbidden");
  } finally {
    setBearerVerifier(prev);
  }
});
