/**
 * A route that declares `fresh: true` asks the Auth server whether the session is still live before its handler runs
 * (apps/dashboard/src/server/route.ts, with-route.ts requireFreshSession).
 *
 * getClaims() verifies a token's signature locally, so a session revoked a minute ago (a sign-out everywhere, a
 * removed user, a reset password) passes every route until its token expires. The acts that cannot be taken back
 * (erasing a person, exporting a workspace's people, changing who is on the team, billing, deleting the account)
 * declare `fresh`, and a session the Auth server no longer knows is refused 401 before the handler is reached. An
 * Auth server that cannot be asked is a 503, never a sign-out; a route that does not declare it pays nothing.
 * Run through the real wrapper with a stand-in for the Auth server, as the bearer suite does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setBearerVerifier } = await import(at("apps/dashboard/src/server/bearer.ts"));
const { write, read, account } = await import(at("apps/dashboard/src/server/route.ts"));

// Built here, not written down: a token-shaped literal in the tree is what the secret scan is for.
const part = (v) => Buffer.from(v).toString("base64url");
const JWT = [part('{"alg":"ES256"}'), part('{"sub":"u-1"}'), part("signature-signature")].join(".");
const req = (method = "GET") =>
  new Request("http://localhost/api/v1/x", {
    method,
    headers: { authorization: `Bearer ${JWT}` },
    ...(method === "POST" ? { body: "{}" } : {}),
  });
const call = (route, r) => route(r, { params: Promise.resolve({}) });

/** The Auth server as a test stands it up: what getUser answers, and how often it was asked. */
function authServer(answer) {
  const asked = [];
  const supabase = {
    auth: {
      getUser: async (token) => {
        asked.push(token);
        return answer();
      },
    },
  };
  return { asked, verdict: { supabase, claims: { sub: "u-1" }, error: null } };
}

const handled = [];
const erase = write({
  scope: account,
  fresh: true,
  role: null,
  rate: null,
  handle: async () => {
    handled.push("erase");
    return { erased: true };
  },
});
const list = read({
  scope: account,
  handle: async () => {
    handled.push("list");
    return { rows: [] };
  },
});

async function within(server, run) {
  const prev = setBearerVerifier(async () => server.verdict);
  handled.length = 0;
  try {
    return await run();
  } finally {
    setBearerVerifier(prev);
  }
}

test("a fresh route runs for a session the Auth server still knows, and asked it over the token the request carried", async () => {
  const server = authServer(() => ({ data: { user: { id: "u-1" } }, error: null }));
  const res = await within(server, () => call(erase, req("POST")));
  assert.equal(res.status, 200);
  assert.deepEqual(handled, ["erase"]);
  assert.deepEqual(server.asked, [JWT]);
});

test("a session the Auth server has revoked is refused 401 and the handler is never reached; so is one that names another person", async () => {
  const revoked = authServer(() => ({
    data: { user: null },
    error: { status: 403, name: "AuthSessionMissingError", message: "session_not_found" },
  }));
  const res = await within(revoked, () => call(erase, req("POST")));
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, "unauthorized");
  assert.deepEqual(handled, [], "nothing was erased");

  const other = authServer(() => ({ data: { user: { id: "someone-else" } }, error: null }));
  const res2 = await within(other, () => call(erase, req("POST")));
  assert.equal(res2.status, 401);
  assert.deepEqual(handled, []);
});

test("an Auth server that cannot be asked is a 503 the client retries, never a sign-out, and the handler is not reached", async () => {
  const down = authServer(() => ({
    data: { user: null },
    error: { name: "AuthRetryableFetchError", message: "fetch failed" },
  }));
  const res = await within(down, () => call(erase, req("POST")));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, "upstream_auth");
  assert.deepEqual(handled, []);
});

test("an Auth server that answers 'slow down' (429) has not forgotten the session: a 503 to retry, not a sign-out", async () => {
  const busy = authServer(() => ({
    data: { user: null },
    error: { status: 429, name: "AuthApiError", message: "over_request_rate_limit" },
  }));
  const res = await within(busy, () => call(erase, req("POST")));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, "upstream_auth");
  assert.deepEqual(handled, []);
});

test("a route that does not declare fresh never asks the Auth server: the ordinary request pays nothing for it", async () => {
  const server = authServer(() => {
    throw new Error("a route that is not fresh must not ask the Auth server");
  });
  const res = await within(server, () => call(list, req()));
  assert.equal(res.status, 200);
  assert.deepEqual(handled, ["list"]);
  assert.deepEqual(server.asked, []);
});

test("the policy says so only where it is declared: a fresh route carries fresh: true, another carries no such key", () => {
  assert.equal(erase.policy.fresh, true);
  assert.equal("fresh" in list.policy, false);
});
