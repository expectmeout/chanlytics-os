/**
 * Google's connect returns the browser to the workspace's OWN address (wiring/records-not-pages, task 1.7; finding A2d).
 * It returned to the app's front door with `?google=connected#/admin/integrations`, and the front door sends the tab to
 * the workspace this browser used last, not the one the owner connected: for someone in two workspaces (a partner, an
 * agency) who used the other one in another tab meanwhile, the word 'connected' was read once on the wrong business's
 * Connections while the link was made for the first. The signed state names the workspace; now the return says it
 * (contracts appLink), once the state has proved itself and the person is a member of it. A refusal made BEFORE that (a
 * declined consent, a state that is malformed, expired or another person's) names no workspace and keeps the front door.
 *
 * Run: the real callback route over a database in memory and an edge that answers from memory.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const SECRET = "test-state-secret-for-this-file";
process.env.GOOGLE_OAUTH_STATE_SECRET = SECRET;
// A deployment that may reach the edge: a credential, the edge's address, and providers switched on.
process.env.DIAG_KEY = "diag-key-for-this-file";
process.env.EDGE_URL = "https://edge.example.test";
process.env.EDGE_PROVIDERS = "live";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { signState, newNonce, STATE_TTL_MS } = await import("@chanlytics/channels");
const { movedAddress, routeOfAddress } = await import("@chanlytics/contracts");
const { afterGoogle } = await import(at("apps/dashboard/src/server/connections/google.ts"));
const callback = await import(at("apps/dashboard/app/api/v1/google/callback/route.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "u1";

/** The edge, from memory: what it was asked, and what it answers next. */
const realFetch = globalThis.fetch;
const asked = [];
let answer = { status: 200, body: { ok: true } };
globalThis.fetch = async (url, init) => {
  asked.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
  return new Response(JSON.stringify(answer.body), {
    status: answer.status,
    headers: { "content-type": "application/json" },
  });
};
after(() => {
  globalThis.fetch = realFetch;
});
beforeEach(() => {
  setRateStore(memoryStore());
  asked.length = 0;
  answer = { status: 200, body: { ok: true } };
});

const membership = (tenant_id, role, slug, created_at) => ({
  user_id: USER,
  tenant_id,
  role,
  tenants: { slug },
  created_at,
});
/** A member of two workspaces: harbor (the older membership, so the one a bare door would pick) and bayside. */
const tables = () => ({
  memberships: [
    membership(A, "owner", "harbor", "2026-01-01T00:00:00Z"),
    membership(B, "owner", "bayside", "2026-02-01T00:00:00Z"),
  ],
});
const ctx = () => ({ supabase: fakeDb(tables()), userId: USER, email: "ada@example.com", params: {} });
const state = (t, u = USER, exp = Date.now() + STATE_TTL_MS) => signState(SECRET, { t, u, n: newNonce(), exp });
const back = async (q) => {
  const res = await callback.GET.run(new Request(`https://app.example.test/api/v1/google/callback${q}`), ctx());
  assert.equal(res.status, 302);
  return new URL(res.headers.get("location"));
};
/** The route a landing opens, read back the way the frame reads an address on load. */
const opens = (to) => {
  const moved = movedAddress({ pathname: to.pathname, search: to.search, hash: to.hash });
  return routeOfAddress(moved ? new URL(moved, to) : to);
};

test("connected: the browser returns to the workspace that was connected, not the one this browser used last", async () => {
  const to = await back(`?state=${await state(B)}&code=abc`);
  assert.equal(to.origin, "https://app.example.test");
  assert.equal(
    to.pathname,
    "/w/bayside/settings/integrations",
    "bayside's Connections, though harbor is the older membership",
  );
  assert.equal(to.search, "?google=connected");
  assert.equal(to.hash, "", "no hash for the home to carry to some other workspace");
  assert.equal(opens(to), "admin/integrations");
  assert.deepEqual(
    asked.map((a) => [a.url, a.body.op, a.body.tenant_id]),
    [["https://edge.example.test/api/admin/google", "connect", B]],
    "and the link was made for bayside",
  );
});

test("a choice to make comes back to the same workspace, with its own word", async () => {
  answer = { status: 200, body: { ok: true, pending: true } };
  const to = await back(`?state=${await state(A)}&code=abc`);
  assert.equal(to.pathname, "/w/harbor/settings/integrations");
  assert.equal(to.search, "?google=choose");
});

test("a connect the edge could not make says why, on the workspace it was for", async () => {
  answer = { status: 502, body: { ok: false, error: "google_refused" } };
  const to = await back(`?state=${await state(B)}&code=abc`);
  assert.equal(to.pathname, "/w/bayside/settings/integrations");
  assert.deepEqual(
    [...to.searchParams],
    [
      ["google", "error"],
      ["why", "google_refused"],
    ],
  );
});

test("a state that proved itself and a code Google did not send is that workspace's to read", async () => {
  const to = await back(`?state=${await state(B)}`);
  assert.equal(to.pathname, "/w/bayside/settings/integrations");
  assert.equal(to.searchParams.get("why"), "no_code");
  assert.deepEqual(asked, [], "and the edge was not asked");
});

test("a refusal before the state proves itself names no workspace: the front door, with the route as a hash", async () => {
  for (const [q, why] of [
    ["?error=access_denied", "declined"],
    ["?state=nope&code=abc", "state_malformed"],
    [`?state=${await state(B, USER, Date.now() - 1)}&code=abc`, "state_expired"],
    // Another person's state is authentic and not theirs to read a workspace's name from.
    [`?state=${await state(B, "u2")}&code=abc`, "someone_else"],
  ]) {
    const to = await back(q);
    assert.equal(to.pathname, "/", why);
    assert.equal(to.hash, "#/admin/integrations", why);
    assert.equal(to.searchParams.get("google"), "error", why);
    assert.equal(to.searchParams.get("why"), why);
    assert.equal(
      opens(new URL(to.href.replace("/?", "/w/bayside?"))),
      "admin/integrations",
      `${why}: the home carries it on`,
    );
  }
  assert.deepEqual(asked, []);
});

test("a workspace the state names and the person is not in is no workspace to return to", async () => {
  const to = await back(`?state=${await state("cccccccc-cccc-4ccc-8ccc-cccccccccccc")}&code=abc`);
  assert.equal(to.pathname, "/");
  assert.equal(to.searchParams.get("why"), "no_workspace");
  assert.deepEqual(asked, []);
});

test("the address afterGoogle writes is contracts' appLink on the request's own origin", () => {
  assert.equal(
    afterGoogle("https://app.example.test", "connected", undefined, "acme"),
    "https://app.example.test/w/acme/settings/integrations?google=connected",
  );
  assert.equal(
    afterGoogle("https://app.example.test", "error", "state expired", "acme"),
    "https://app.example.test/w/acme/settings/integrations?google=error&why=state%20expired",
    "a reason is encoded",
  );
  assert.equal(
    afterGoogle("https://app.example.test", "error", "declined"),
    "https://app.example.test/?google=error&why=declined#/admin/integrations",
    "with no workspace, the front door as it always was",
  );
  assert.equal(
    afterGoogle("https://app.example.test", "error", "", null),
    "https://app.example.test/?google=error#/admin/integrations",
  );
});
