/**
 * A bearer token beside the cookie (decision 0011), executed through the real route wrapper with a stand-in for
 * the Auth server: the header parsed and refused; a bearer request with no cookie answers as the token's person; a
 * cross-site POST with a bearer is not refused for its origin, since it spends no cookie; a token the verifier
 * refuses is 401, an unreachable verifier 503; and a request without a bearer still takes the cookie's path, where the
 * cookie's session is VERIFIED, never read from it: getClaims() checks the token's signature over the project's public
 * keys, so one signed by a key the project does not hold is no session. And the same-origin guard every mutation
 * asks, with the two kinds of caller that ask it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JWKS, SUPABASE, projectKey, sessionCookie, signed, strangerKey } from "./_session.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

// The cookies a request carried, as next/headers hands them to the session's client (lib/supabase/server.ts) inside a
// request: a route run here has no request scope of Next's, so the module stands in for its one call, over this jar.
let jar = [];
const load = Module._load;
Module._load = function (request, ...rest) {
  if (request !== "next/headers") return load.call(this, request, ...rest);
  return { __esModule: true, cookies: async () => ({ getAll: () => jar, set() {} }) };
};
// The project the session is the project's for, and its Auth server: its public keys, and a 401 for anything else.
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-only";
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith(SUPABASE)) return realFetch(input, init);
  if (url.endsWith("/auth/v1/.well-known/jwks.json")) return Response.json(JWKS);
  return Response.json({ code: 401, error_code: "bad_jwt", msg: "invalid JWT" }, { status: 401 });
};
const { bearerOf, setBearerVerifier } = await import(at("apps/dashboard/src/server/shared/auth/bearer.ts"));
const { withRoute } = await import(at("apps/dashboard/src/server/shared/with-route.ts"));

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

test("a card's press is marked as Ask's from its x-via header, and only Ask's own word is taken", async () => {
  // The mark on the ledger is recordDecision's, run in ask/ask-commit.test.mjs ("the card's mark stays"); where it comes
  // from was pinned as with-route.ts's text until 25 Nov 2026.
  const marked = withRoute(async (_req, ctx) => ({ via: ctx.via ?? null }));
  const prev = setBearerVerifier(async () => verdict({ sub: "u-1", email: "ada@example.com" }));
  try {
    const viaOf = async (headers) =>
      (
        await (
          await marked(req({ authorization: `Bearer ${JWT}`, ...headers }, "POST"), { params: Promise.resolve({}) })
        ).json()
      ).data.via;
    assert.equal(await viaOf({ "x-via": "ask" }), "ask", "a card's commit");
    assert.equal(await viaOf({}), null, "a person's own press");
    assert.equal(await viaOf({ "x-via": "someone" }), null, "no other word is a mark");
  } finally {
    setBearerVerifier(prev);
  }
});

test("same-origin evidence must be POSITIVE, and every mutation demands it", async () => {
  // The rule moved out of the sign-out route into a shared guard once every mutating /api/v1 route needed it too. Read as
  // the guard's and the two routes' text in auth/auth-gate.test.mjs until 26 Nov 2026.
  const { isSameOrigin } = await import(at("apps/dashboard/src/server/shared/request-guards.ts"));
  const from = (headers) => new Request("https://app.example.com/api/v1/x", { method: "POST", headers });
  // Fetch Metadata is the primary signal; same-site is not same-origin: on vercel.app a sibling subdomain is someone
  // else's app.
  assert.equal(isSameOrigin(from({ "sec-fetch-site": "same-origin" })), true);
  assert.equal(isSameOrigin(from({ "sec-fetch-site": "none" })), true, "typed into the address bar");
  assert.equal(isSameOrigin(from({ "sec-fetch-site": "same-site", origin: "https://app.example.com" })), false);
  assert.equal(isSameOrigin(from({ "sec-fetch-site": "cross-site" })), false);
  // Without it, the Origin against the Host: a request that omits Origin is REJECTED, not exempted (the old check read
  // `if (origin && host && ...)`).
  assert.equal(isSameOrigin(from({ origin: "https://app.example.com", host: "app.example.com" })), true);
  assert.equal(isSameOrigin(from({ host: "app.example.com" })), false, "no Origin is no evidence");
  assert.equal(isSameOrigin(from({ origin: "https://evil.example", host: "app.example.com" })), false);
  assert.equal(isSameOrigin(from({ origin: "not an address", host: "app.example.com" })), false);
  // Both callers make the check. The sign-out route refuses before it touches the session.
  const signoutRoute = await import(at("apps/dashboard/app/auth/signout/route.ts"));
  for (const headers of [{}, { "sec-fetch-site": "cross-site" }, { host: "app.example.com" }]) {
    const res = await signoutRoute.POST(from(headers));
    assert.equal(res.status, 403, JSON.stringify(headers));
  }
  // And the wrapper: every mutating route inherits it, refused before any session is read (a GET changes nothing, and
  // cross-site GETs are how link previews and prefetches legitimately arrive: the tests above run both paths).
  const handler = withRoute(async () => assert.fail("the handler is not reached"));
  for (const headers of [{}, { "sec-fetch-site": "same-site" }]) {
    const res = await handler(from(headers), { params: Promise.resolve({}) });
    assert.equal(res.status, 403, JSON.stringify(headers));
  }
});

test("a cookie's session is VERIFIED, never read from the cookie: a token the project did not sign is no session, one it signed runs as its person", async () => {
  // getSession() decodes the cookie without checking its signature, so a forged session passes it. The wrapper's
  // getClaims() verifies the signature over the project's public keys; the proxy in front of it does the same
  // (auth-gate.test.mjs, "a token signed by a key the project does not hold is no session").
  const prev = setBearerVerifier(async () => {
    throw new Error("a request with no bearer is never handed to the bearer's verifier");
  });
  const asked = (cookie) => {
    jar = cookie ? [{ name: cookie.slice(0, cookie.indexOf("=")), value: cookie.slice(cookie.indexOf("=") + 1) }] : [];
    return call(req(cookie ? { cookie } : {}));
  };
  try {
    const forged = await asked(sessionCookie(await signed(strangerKey)));
    assert.equal(forged.status, 401, "a token signed by a key the project does not hold");
    assert.equal((await forged.json()).error.code, "unauthorized");
    assert.equal((await asked(null)).status, 401, "no cookie");
    const real = await asked(sessionCookie(await signed(projectKey)));
    assert.equal(real.status, 200);
    assert.equal((await real.json()).data.user, "u1", "the person the project's token names");
  } finally {
    setBearerVerifier(prev);
    jar = [];
  }
});
