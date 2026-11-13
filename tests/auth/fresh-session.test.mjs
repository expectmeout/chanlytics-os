/**
 * A route that declares `fresh: true` asks the Auth server whether the session is still live before its handler runs
 * (apps/dashboard/src/server/shared/route.ts, with-route.ts requireFreshSession).
 *
 * getClaims() verifies a token's signature locally, so a session revoked a minute ago (a sign-out everywhere, a
 * removed user, a reset password) passes every route until its token expires. The acts that cannot be taken back
 * (erasing a person, exporting a workspace's people, changing who is on the team, billing, deleting the account)
 * declare `fresh`, and a session the Auth server no longer knows is refused 401 before the handler is reached. An
 * Auth server that cannot be asked is a 503, never a sign-out; a route that does not declare it pays nothing.
 * Run through the real wrapper with a stand-in for the Auth server, as the bearer suite does.
 *
 * A change made from the Console declares nothing and is asked all the same: route() makes every platform write fresh
 * (buildRoute), since one of them acts on any workspace. Until 13 Nov 2026 three of the nineteen declared it and a
 * session signed out elsewhere passed the other sixteen until its token expired. A real Console route runs below.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sessionEnded } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

// Modules that build a service client on first use read these; nothing here dials it.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setBearerVerifier } = await import(at("apps/dashboard/src/server/shared/auth/bearer.ts"));
const { write, read, account } = await import(at("apps/dashboard/src/server/shared/route.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const invited = await import(at("apps/dashboard/app/api/v1/platform/waitlist/invited/route.ts"));

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
function authServer(answer, sub = "u-1") {
  const asked = [];
  const supabase = {
    auth: {
      getUser: async (token) => {
        asked.push(token);
        return answer();
      },
    },
  };
  return { asked, verdict: { supabase, claims: { sub }, error: null } };
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
  const { error } = await res.json();
  assert.equal(error.code, "unauthorized");
  // Said apart from a session never shown: the gate still lets this token in, so the client ends the session before it
  // signs in again, or /login sends it straight back (shell/address/session-ended.test.mjs runs the client's side).
  assert.equal(sessionEnded(error.details), true, "the refusal says the session ended");
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

/* ------------------------------------------------------------------------------------------- the Console's writes */

const STAFF = "11111111-1111-4111-8111-111111111111";
const WAITING = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const STILL_KNOWN = () => ({ data: { user: { id: STAFF } }, error: null });

/** A session at the Console's door: what the database says it is to the Console, and what the Auth server answers. */
function consoleSession(state, answer) {
  const server = authServer(answer, STAFF);
  const supabase = Object.assign(fakeDb({}, {}, { platform_staff_state: () => state }), server.verdict.supabase);
  return { asked: server.asked, verdict: { ...server.verdict, supabase } };
}

/** The real route, POST /api/v1/platform/waitlist/invited, pressed for one person on the waiting list. */
async function pressInvited(session) {
  const world = {
    platform_acts: [],
    waitlist: [
      {
        id: WAITING,
        email: "ana@example.com",
        business: null,
        source: null,
        created_at: "2026-10-01T00:00:00Z",
        invited_at: null,
        invited_by: null,
      },
    ],
  };
  setRateStore(memoryStore());
  setServiceClient(fakeDb(world));
  const press = new Request("http://localhost/api/v1/platform/waitlist/invited", {
    method: "POST",
    headers: { authorization: `Bearer ${JWT}` },
    body: JSON.stringify({ id: WAITING, why: { kind: "ticket", ticket: "R-1042", note: "They wrote in." } }),
  });
  try {
    const res = await within(session, () => call(invited.POST, press));
    return { res, world, done: world.waitlist[0].invited_at !== null };
  } finally {
    setServiceClient(null);
  }
}

test("REGRESSION: a change made from the Console asks the Auth server though its route declares no fresh, and a session it no longer knows is refused before anything is written down or done", async () => {
  assert.equal(invited.POST.policy.fresh, true, "route() says so of every platform write");
  const live = consoleSession("support", STILL_KNOWN);
  const pressed = await pressInvited(live);
  assert.equal(pressed.res.status, 200);
  assert.deepEqual(live.asked, [JWT], "asked once, over the token the request carried");
  assert.equal(pressed.done, true, "a live session's press is done, so a refusal below is the check's");
  assert.equal(pressed.world.platform_acts.length, 1);

  const revoked = consoleSession("support", () => ({
    data: { user: null },
    error: { status: 403, name: "AuthSessionMissingError", message: "session_not_found" },
  }));
  const refused = await pressInvited(revoked);
  assert.equal(refused.res.status, 401);
  const { error } = await refused.res.json();
  assert.equal(error.code, "unauthorized");
  assert.equal(sessionEnded(error.details), true, "the refusal says the session ended, so the tab ends it");
  assert.equal(refused.done, false, "nobody was marked invited");
  assert.deepEqual(refused.world.platform_acts, [], "and the Admin log holds no act that did not run");
});

test("an Auth server that cannot be asked holds a Console change with a 503 to retry, and somebody who is not staff is told there is no such page without the Auth server being asked", async () => {
  const down = consoleSession("support", () => ({
    data: { user: null },
    error: { name: "AuthRetryableFetchError", message: "fetch failed" },
  }));
  const held = await pressInvited(down);
  assert.equal(held.res.status, 503);
  assert.equal((await held.res.json()).error.code, "upstream_auth");
  assert.equal(held.done, false);
  assert.deepEqual(held.world.platform_acts, []);

  const stranger = consoleSession("none", () => {
    throw new Error("the Console's door answers a stranger before the Auth server is asked");
  });
  const none = await pressInvited(stranger);
  assert.equal(none.res.status, 404);
  assert.deepEqual(stranger.asked, []);
  assert.equal(none.done, false);
});
